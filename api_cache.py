# api_cache.py
import os
import re
import html
import ipaddress
import hashlib
import asyncio
import contextlib
import stat
import threading
from pathlib import Path
import socket
import time
import aiohttp
import mimetypes
import urllib.parse
from urllib.parse import urlparse
from aiohttp import web
from aiohttp.abc import AbstractResolver

try:
    from . import control_request as _control_reader
    from .update_engine import directory_lease
except ImportError:
    import importlib.util
    _control_spec = importlib.util.spec_from_file_location('ranking_cache_control', Path(__file__).with_name('control_request.py'))
    _control_reader = importlib.util.module_from_spec(_control_spec)
    _control_spec.loader.exec_module(_control_reader)
    _lease_spec = importlib.util.spec_from_file_location('ranking_cache_lease', Path(__file__).with_name('update_engine.py'))
    _lease_module = importlib.util.module_from_spec(_lease_spec)
    _lease_spec.loader.exec_module(_lease_module)
    directory_lease = _lease_module.directory_lease

try:
    from . import media_transfer as _media
except ImportError:
    import importlib.util
    _media_spec = importlib.util.spec_from_file_location('ranking_media_transfer', Path(__file__).with_name('media_transfer.py'))
    _media = importlib.util.module_from_spec(_media_spec)
    _media_spec.loader.exec_module(_media)

try:
    from . import media_proxy as _proxy
except ImportError:
    import importlib.util
    _proxy_spec = importlib.util.spec_from_file_location('ranking_media_proxy', Path(__file__).with_name('media_proxy.py'))
    _proxy = importlib.util.module_from_spec(_proxy_spec)
    _proxy_spec.loader.exec_module(_proxy)

# 📦 三发行版兼容：folder_paths 仅存在于 ComfyUI 运行时，try 化防止脱离宿主时拖垮导入链
try:
    import folder_paths
except Exception:
    folder_paths = None

# 视频下载锁字典（按 URL hash 粒度加锁）
_video_download_locks = {}
_video_locks_lock = asyncio.Lock()
_video_lock_refs = {}  # {url_hash: int} 引用计数器，替代 lock._waiters

# 🚦 云端可达性熔断器
# 背景：云端不可达时，每个未缓存的图片/视频请求会在下载环节挂满超时才失败；
# 浏览器对 localhost 只有 6 条 HTTP/1.1 并发连接，挂起的媒体请求会占满通道，
# 连带阻塞侧边栏组件的动态 import JS 与本地 API 调用，导致"本地数据也切换很慢"。
# 熔断后未缓存媒体毫秒级快速失败（图片返回占位图、视频返回 503），连接立即释放；
# 冷却期结束自动半开放行试探，任一请求收到应答即关闭熔断，网络恢复后无需人工干预。
_NET_FAIL_THRESHOLD = 3    # 连续网络层失败（超时/连接错误）达到该次数即打开熔断
_NET_COOLDOWN = 20.0       # 熔断冷却时长（秒），期间未缓存媒体请求快速失败
_upstream_fail_count = 0
_circuit_open_until = 0.0  # 熔断打开截止时刻（monotonic 时钟，不受系统时间调整影响）


def _upstream_circuit_open():
    return time.monotonic() < _circuit_open_until


def _record_upstream_failure():
    global _upstream_fail_count, _circuit_open_until
    _upstream_fail_count += 1
    if _upstream_fail_count >= _NET_FAIL_THRESHOLD:
        _circuit_open_until = time.monotonic() + _NET_COOLDOWN
        _upstream_fail_count = 0
        print(f"[ComfyUI-Ranking] [!] Media circuit open for {int(_NET_COOLDOWN)} seconds")


def _record_upstream_success():
    # 收到任何 HTTP 应答即证明网络层可达（404 等内容由调用方照常处理）
    global _upstream_fail_count
    _upstream_fail_count = 0


# 熔断期内未缓存图片的占位图（纯静态内容，无用户输入，无注入面）
_CIRCUIT_PLACEHOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">'
    '<rect fill="#3a3a3a" width="150" height="150" rx="12"/></svg>'
).encode()


class UnsafeRemoteURLError(ValueError):
    """远程资源 URL 或重定向目标不满足安全策略。"""


_FAKE_IP_NETWORK = ipaddress.ip_network("198.18.0.0/15")


class _SafeDNSResolver(AbstractResolver):
    """实际连接只允许公网单播及显式fake-IP例外，通过的地址由connector复用。"""

    def __init__(self):
        self._resolver = aiohttp.DefaultResolver()
        self._allow_fake_ip = os.environ.get("COMFYUI_RANKING_ALLOW_FAKE_IP") == "1"

    async def resolve(self, host, port=0, family=socket.AF_INET):
        records = await self._resolver.resolve(host, port, family)
        if not records:
            raise OSError("拒绝连接到非公网 DNS 地址")
        for record in records:
            address = ipaddress.ip_address(record["host"].split("%", 1)[0])
            is_fake_ip = address.version == _FAKE_IP_NETWORK.version and address in _FAKE_IP_NETWORK
            if is_fake_ip and self._allow_fake_ip:
                continue
            if _is_forbidden_ip(address):
                raise OSError("拒绝连接到非公网 DNS 地址")
        return records

    async def close(self):
        await self._resolver.close()


async def _close_media_resources(resources):
    """同一关闭任务拥有会话、连接器和解析器；重复取消不能遗留资源。"""
    async def close():
        cancelled = False
        for resource in resources:
            if resource is None:
                continue
            try:
                await resource.close()
            except asyncio.CancelledError:
                cancelled = True
            except Exception as error:
                print(f"[ComfyUI-Ranking] [!] Media resource close failed: {type(error).__name__}")
        if cancelled:
            raise asyncio.CancelledError()

    closing = asyncio.create_task(close())
    cancelled = False
    while not closing.done():
        try:
            await asyncio.wait({closing})
        except asyncio.CancelledError:
            cancelled = True
    try:
        closing.result()
    except asyncio.CancelledError:
        cancelled = True
    if cancelled:
        raise asyncio.CancelledError()


@contextlib.asynccontextmanager
async def _new_safe_session():
    resolver = _SafeDNSResolver()
    connector = session = None
    try:
        connector = aiohttp.TCPConnector(resolver=resolver, ttl_dns_cache=10)
        session = aiohttp.ClientSession(connector=connector)
        session._ranking_media_proxy_enabled = True
        yield session
    finally:
        # aiohttp不拥有显式传入的resolver，须由本上下文明确关闭。
        await _close_media_resources((session, connector, resolver))

def _clean_nested_url(url, endpoint):
    """清除被污染的嵌套 URL，如 /community_hub/image?url=http://... 反复嵌套的情况"""
    prefix = f'/community_hub/{endpoint}?url='
    # 加上限保险：防止构造性输入导致循环不收敛
    for _ in range(10):
        if not url.startswith(prefix):
            break
        url = urllib.parse.unquote(url.replace(prefix, ''))
    return url


async def _stream_file_chunks(resp, file_path, start=0, end=None, reader=None):
    """流式读取已确认区间；内部复用已准入读者，旧调用仍自行所属打开。"""
    if reader is None:
        async with _media.open_video_reader(file_path, start) as owned_reader:
            return await _stream_file_chunks(resp, file_path, start, end, owned_reader)
    remaining = (end - start + 1) if end is not None else None
    chunk_size = _media.VIDEO_CHUNK_BYTES
    while True:
        if remaining is not None:
            if remaining <= 0:
                break
            to_read = min(chunk_size, remaining)
        else:
            to_read = chunk_size
        data = await reader.read(to_read)
        if not data:
            if remaining is not None and remaining > 0:
                raise _media.MediaTransferError(502)
            break
        async with asyncio.timeout(_media.VIDEO_SEND_SECONDS):
            await resp.write(data)
        if remaining is not None:
            remaining -= len(data)


async def _get_video_lock(url_hash):
    async with _video_locks_lock:
        if url_hash not in _video_download_locks:
            _video_download_locks[url_hash] = asyncio.Lock()
            _video_lock_refs[url_hash] = 0
        _video_lock_refs[url_hash] += 1
        return _video_download_locks[url_hash]


def _is_local_request(request):
    """检查本机来源与浏览器 Origin，降低跨站触发本机代理请求的风险。"""
    remote = request.remote or ""
    try:
        address = ipaddress.ip_address(remote.split("%", 1)[0])
        if getattr(address, "ipv4_mapped", None):
            address = address.ipv4_mapped
        if not address.is_loopback:
            return False
    except ValueError:
        return False
    origin = request.headers.get("Origin")
    if not origin:
        return True
    try:
        parsed = urllib.parse.urlsplit(origin)
        host = (parsed.hostname or "").lower().rstrip(".")
        is_loopback_origin = host == "localhost" or ipaddress.ip_address(host).is_loopback
        origin_port = parsed.port or (443 if parsed.scheme == "https" else 80)
        request_port = request.url.port or (443 if request.scheme == "https" else 80)
        return is_loopback_origin and parsed.scheme == request.scheme and origin_port == request_port
    except ValueError:
        return False


def _is_forbidden_ip(ip):
    """字面量与连接解析共用公网单播策略，映射地址按底层IPv4核查。"""
    mapped = getattr(ip, 'ipv4_mapped', None)
    if mapped is not None:
        return _is_forbidden_ip(mapped)
    return (not ip.is_global or ip.is_multicast or ip.is_reserved
            or getattr(ip, 'is_site_local', False))


def _is_forbidden_target(url):
    """检查 URL 字面量与危险主机名；DNS 地址由连接期安全 resolver 校验。"""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        if not host:
            return True
        # 尝试直接解析为 IP
        try:
            ip = ipaddress.ip_address(host)
            return _is_forbidden_ip(ip)
        except ValueError:
            # 不是IP地址（是域名），检查常见危险域名
            dangerous_hosts = ('localhost', 'metadata.google.internal')
            if host.lower() in dangerous_hosts:
                return True
            # 域名在实际连接的_SafeDNSResolver中核查全部地址；fake-IP例外仅在那里
            # 按显式环境开关放行，不允许直接IP或重定向URL借用该例外。
            return False
    except Exception:
        return True


def _is_safe_remote_url(url):
    """仅允许 HTTP(S) 远程资源，并拒绝带凭据、缺少主机或指向本地的地址。"""
    try:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname:
            return False
        if parsed.username is not None or parsed.password is not None:
            return False
        # 访问 port 属性可触发 malformed port 的 ValueError
        _ = parsed.port
        return not _is_forbidden_target(url)
    except (TypeError, ValueError):
        return False


async def _get_with_safe_redirects(session, url, **kwargs):
    """逐跳校验重定向目标，避免可信外站把本机代理引向内网地址。"""
    current_url = url
    for redirect_count in range(6):
        if not _is_safe_remote_url(current_url):
            raise UnsafeRemoteURLError("Unsafe upstream URL or redirect target")
        proxy = _proxy.select_proxy(current_url) if getattr(session, '_ranking_media_proxy_enabled', False) is True else None
        if proxy:
            response = await _proxy.get_pinned(session, current_url, proxy, _is_forbidden_ip, **kwargs)
        else:
            response = await session.get(current_url, allow_redirects=False, **kwargs)
        if response.status not in (301, 302, 303, 307, 308):
            return response
        location = response.headers.get("Location")
        if not location:
            return response
        next_url = urllib.parse.urljoin(current_url, location)
        response.release()
        if redirect_count >= 5 or not _is_safe_remote_url(next_url):
            raise UnsafeRemoteURLError("Unsafe or excessive upstream redirect")
        current_url = next_url
    raise ValueError("Excessive upstream redirects")


def _cleanup_empty_cache(local_path, url_hash, ext):
    """清理0字节的损坏缓存文件"""
    try:
        info = os.stat(local_path, follow_symlinks=False)
        if (stat.S_ISREG(info.st_mode) and info.st_size == 0
                and not getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
            os.remove(local_path)
            print(f"[ComfyUI-Ranking] [!] Removed empty cache: {url_hash}.{ext}")
    except OSError:
        pass


async def _cleanup_empty_cache_owned(local_path, url_hash, ext):
    try:
        await _call_media_metadata(_cleanup_empty_cache_coordinated, local_path, url_hash, ext)
    except _media.MediaTransferError as error:
        if error.status != 503:
            raise
        # 仅无有效数据的机会性清理；繁忙保留原请求错误，不无界提交或重试。
        print('[ComfyUI-Ranking] [!] Empty cache cleanup skipped: busy')


def _cache_mutation_target(local_path):
    # 只使用缓存根及种类/文件名：Windows长短路径别名不应产生不同锁。
    path = Path(local_path)
    key = hashlib.sha256((path.parent.name.lower()+'/'+path.name.lower()).encode()).hexdigest()
    return Path(IMAGE_CACHE_DIR).parent/('.ranking-cache-mutation-'+key)


def _cleanup_empty_cache_coordinated(local_path, url_hash, ext):
    try:
        with directory_lease(_cache_mutation_target(local_path)):
            _cleanup_empty_cache(local_path, url_hash, ext)
    except (OSError, ValueError):
        # 机会性清理不等待写者，也不覆盖原请求失败。
        print('[ComfyUI-Ranking] [!] Empty cache cleanup skipped: busy')


class _CacheMutationPermit:
    def __init__(self, local_path):
        self.target = _cache_mutation_target(local_path)
        self.lease = None

    def acquire(self):
        lease = directory_lease(self.target)
        try:
            lease.__enter__()
        except (OSError, ValueError):
            raise _media.MediaTransferError(503) from None
        self.lease = lease

    def close(self):
        lease, self.lease = self.lease, None
        if lease is not None:
            lease.__exit__(None, None, None)


@contextlib.asynccontextmanager
async def _cache_mutation_lease(local_path):
    permit = _CacheMutationPermit(local_path)
    failed = False
    try:
        # 非阻塞租约尝试先准入；真实发布期间保持租约。
        await _call_media_metadata(permit.acquire)
        yield
    except BaseException:
        failed = True
        raise
    finally:
        if permit.lease is not None:
            try:
                # 真实释放不能因提交名额满被丢弃。
                await _media.call_file_operation(permit.close)
            except Exception as error:
                print(f'[ComfyUI-Ranking] [!] Cache mutation close failed: {type(error).__name__}')
                if not failed:
                    raise _media.MediaTransferError(503) from None


async def _write_image_cache_coordinated(request, local_path, content):
    async with _cache_mutation_lease(local_path):
        _check_media_connection(request)
        await _media.write_image_owned(request, local_path, content)


async def _finish_video_cache_coordinated(writer, complete, size, expected):
    valid = (complete and size > 0 and size == writer.written
             and (expected is None or size == expected)
             and not writer.cancelled.is_set() and not writer.finished)
    if not valid:
        # 无效正文只关闭/删除所属临时文件，不改发布路径，也不需要租约。
        await writer.finish(complete, size, expected)
        return
    try:
        async with _cache_mutation_lease(writer.path):
            await writer.finish(complete, size, expected)
    finally:
        # 未准入/取消取得租约时尚未发布，必须仍收回原临时文件。
        if not writer.finished:
            await writer.finish(False, size, expected)


THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)

# 📦 三发行版兼容：禁止用 ..\.. 层级硬推 ComfyUI 根目录（桌面版程序与数据分离会失效）
# 解析优先级：custom_nodes 同级 models（秋叶/便携/桌面默认布局）→ folder_paths.models_dir → 插件自身目录内缓存（保底可写）
def _resolve_cache_root():
    sibling_models = os.path.join(CUSTOM_NODES_DIR, "..", "models")
    if os.path.isdir(sibling_models):
        return os.path.join(sibling_models, "cache")
    if folder_paths is not None:
        try:
            models_dir = getattr(folder_paths, "models_dir", None)
            if models_dir and os.path.isdir(models_dir):
                return os.path.join(models_dir, "cache")
        except Exception:
            pass
    return os.path.join(THIS_DIR, "缓存")

# 缓存目录懒初始化（不在导入期 makedirs，任何布局下都不会拖垮插件加载）
IMAGE_CACHE_DIR = None
VIDEO_CACHE_DIR = None

def _ensure_cache_dirs():
    """懒创建缓存目录；全部不可写时返回 False，调用方降级为不缓存（直连/报错），绝不崩溃"""
    global IMAGE_CACHE_DIR, VIDEO_CACHE_DIR
    if IMAGE_CACHE_DIR and VIDEO_CACHE_DIR:
        return True
    try:
        root = _resolve_cache_root()
        img_dir = os.path.join(root, "images")
        vid_dir = os.path.join(root, "videos")
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(vid_dir, exist_ok=True)
        IMAGE_CACHE_DIR = img_dir
        VIDEO_CACHE_DIR = vid_dir
        return True
    except Exception as e:
        print(f"[ComfyUI-Ranking] [!] Cache directory unavailable: {type(e).__name__}")
        return False


# 元数据请求先准入再提交宿主Executor；等待本身不创建后台Future。
MEDIA_METADATA_CONCURRENCY = 4
MEDIA_METADATA_MAX_QUEUED = 8
MEDIA_METADATA_QUEUE_SECONDS = 5


class _MediaMetadataCapacity:
    def __init__(self):
        self.active = threading.BoundedSemaphore(MEDIA_METADATA_CONCURRENCY)
        self.waiting = threading.BoundedSemaphore(MEDIA_METADATA_MAX_QUEUED)

    @contextlib.asynccontextmanager
    async def acquire(self):
        acquired = queued = False
        deadline = time.monotonic()+MEDIA_METADATA_QUEUE_SECONDS
        try:
            acquired = self.active.acquire(blocking=False)
            if not acquired:
                queued = self.waiting.acquire(blocking=False)
                if not queued:
                    raise _media.MediaTransferError(503)
                while not acquired:
                    if time.monotonic() >= deadline:
                        raise _media.MediaTransferError(503)
                    await asyncio.sleep(.01)
                    if time.monotonic() >= deadline:
                        raise _media.MediaTransferError(503)
                    acquired = self.active.acquire(blocking=False)
                self.waiting.release()
                queued = False
            yield
        finally:
            if queued:
                self.waiting.release()
            if acquired:
                self.active.release()


_media_metadata_capacity = _MediaMetadataCapacity()


async def _call_media_metadata(function, *args):
    async with _media_metadata_capacity.acquire():
        # 包含宿主Executor排队和真实操作；取消不提前归还正在工作的名额。
        return await _media.call_file_operation(function, *args)


async def _ensure_cache_dirs_owned():
    if IMAGE_CACHE_DIR and VIDEO_CACHE_DIR:
        return True
    try:
        return await _call_media_metadata(_ensure_cache_dirs)
    except _media.MediaTransferError:
        return None


def _cached_file_size(local_path):
    try:
        info = os.stat(local_path, follow_symlinks=False)
    except FileNotFoundError:
        return 0
    if (not stat.S_ISREG(info.st_mode)
            or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
        return 0
    return info.st_size


async def _cached_file_size_owned(local_path):
    try:
        return await _call_media_metadata(_cached_file_size, local_path)
    except _media.MediaTransferError:
        return -2
    except OSError as error:
        print(f"[ComfyUI-Ranking] [!] Cache metadata unavailable: {type(error).__name__}")
        return -1

# 视频缓存限制：100MB，平衡常见短视频需求与磁盘占用
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB
# 🔒 图片缓存上限：20MB，防止恶意超大文件打爆内存
MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB
VIDEO_TIMEOUT = aiohttp.ClientTimeout(total=_media.VIDEO_TOTAL_SECONDS, connect=5, sock_connect=5,
                                      sock_read=_media.VIDEO_READ_IDLE_SECONDS)
# 图片下载超时收窄为 15 秒（连接阶段 5 秒）：批量故障由熔断器兜底，此处收窄单次挂起的伤害
IMAGE_TIMEOUT = aiohttp.ClientTimeout(total=15, connect=5)
COMPLETE_IMAGE_TIMEOUT = aiohttp.ClientTimeout(total=60, connect=5)

# 同一媒体缓存根目录的合作新版进程共用下载/等待名额，兼容只读插件目录。
MEDIA_DOWNLOAD_CONCURRENCY = 4
MEDIA_DOWNLOAD_MAX_QUEUED = 8
MEDIA_DOWNLOAD_QUEUE_SECONDS = 5


class _MediaDownloadPermit:
    def __init__(self):
        self.active = self.waiting = None

    def _take(self, kind, count):
        for index in range(count):
            lease = directory_lease(Path(IMAGE_CACHE_DIR).parent/('.ranking-media-'+kind+'-'+str(index)))
            try:
                lease.__enter__()
            except TimeoutError:
                continue
            return lease
        return None

    def advance(self):
        if self.active is not None:
            return
        self.active = self._take('active', MEDIA_DOWNLOAD_CONCURRENCY)
        if self.active is not None:
            if self.waiting is not None:
                self.waiting.__exit__(None, None, None)
                self.waiting = None
            return
        if self.waiting is None:
            self.waiting = self._take('waiting', MEDIA_DOWNLOAD_MAX_QUEUED)
            if self.waiting is None:
                raise _media.MediaTransferError(503)

    def close(self):
        error = None
        for name in ('waiting', 'active'):
            lease = getattr(self, name)
            if lease is None:
                continue
            try:
                lease.__exit__(None, None, None)
            except Exception as caught:
                if error is None:
                    error = caught
            finally:
                setattr(self, name, None)
        if error is not None:
            raise error


def _check_media_connection(request):
    transport = request.transport
    if transport is None or getattr(transport, 'is_closing', lambda: False)():
        raise asyncio.CancelledError()


@contextlib.asynccontextmanager
async def _media_download_capacity(request):
    permit = _MediaDownloadPermit()
    deadline = time.monotonic()+MEDIA_DOWNLOAD_QUEUE_SECONDS
    failed = False
    try:
        while True:
            _check_media_connection(request)
            if time.monotonic() >= deadline:
                raise _media.MediaTransferError(503)
            try:
                # 目录/stat与租约尝试共用提交名额；等待不制造Executor队列。
                async with _media_metadata_capacity.acquire():
                    _check_media_connection(request)
                    if time.monotonic() >= deadline:
                        raise _media.MediaTransferError(503)
                    await _media.call_file_operation(permit.advance)
            except (OSError, ValueError) as error:
                print(f"[ComfyUI-Ranking] [!] Media capacity unavailable: {type(error).__name__}")
                raise _media.MediaTransferError(503) from None
            _check_media_connection(request)
            if time.monotonic() >= deadline:
                raise _media.MediaTransferError(503)
            if permit.active is not None:
                break
            await asyncio.sleep(.05)
        yield deadline
    except BaseException:
        failed = True
        raise
    finally:
        # advance取消时仍等其真正退出；对象保留已获得的租约，再所属关闭。
        try:
            # 未取得租约的拒绝请求没有物理资源，避免提交空关闭Future。
            if permit.active is not None or permit.waiting is not None:
                await _media.call_file_operation(permit.close)
        except Exception as error:
            print(f"[ComfyUI-Ranking] [!] Media capacity cleanup failed: {type(error).__name__}")
            if not failed:
                raise _media.MediaTransferError(503) from None


@contextlib.asynccontextmanager
async def _video_download_capacity(request, url_hash):
    async with _media_download_capacity(request) as deadline:
        lock = None
        acquired = False
        try:
            try:
                remaining = deadline-time.monotonic()
                if remaining <= 0:
                    raise _media.MediaTransferError(503)
                async with asyncio.timeout(remaining):
                    lock = await _get_video_lock(url_hash)
                    await lock.acquire()
                    acquired = True
            except asyncio.TimeoutError:
                raise _media.MediaTransferError(503) from None
            if time.monotonic() >= deadline:
                raise _media.MediaTransferError(503)
            yield
        finally:
            if acquired:
                lock.release()
            if lock is not None:
                release = asyncio.create_task(_release_video_reference(url_hash))
                await _media.wait_owned(release)


def _media_busy_response():
    return web.Response(status=503, text='Media proxy busy',
                        headers={'Cache-Control': 'no-store', 'Retry-After': '1'})


def _image_circuit_response(require_complete):
    if require_complete:
        return web.Response(status=503, text='Image unavailable', headers={'Cache-Control': 'no-store'})
    return web.Response(body=_CIRCUIT_PLACEHOLDER_SVG, content_type='image/svg+xml',
                        headers={'Cache-Control': 'no-store'})

def _image_cache_etag_matches(value, tags, weak=False):
    if len(tags) == 1 and tags[0].value == '*':
        return True
    return any(tag.value == value and (weak or not tag.is_weak) for tag in tags)


def _image_cache_response(request, path, info):
    """复用请求公开条件/Range解析器，保持原FileResponse缓存校验语义。"""
    value = f'{info.st_mtime_ns:x}-{info.st_size:x}'
    content_type, _ = mimetypes.guess_type(path)
    response = web.StreamResponse(headers={'Content-Type': content_type or 'image/jpeg'})
    response.etag = value
    response.last_modified = info.st_mtime
    matching = request.if_match
    if matching is not None and not _image_cache_etag_matches(value, matching):
        response.set_status(412)
    elif (matching is None and request.if_unmodified_since is not None
          and info.st_mtime > request.if_unmodified_since.timestamp()):
        response.set_status(412)
    elif request.if_none_match is not None and _image_cache_etag_matches(value, request.if_none_match, True):
        response.set_status(304)
    elif (request.if_none_match is None and request.if_modified_since is not None
          and info.st_mtime <= request.if_modified_since.timestamp()):
        response.set_status(304)
    if response.status in (304, 412):
        response.content_length = 0
        return response, 0, 0
    start, count = 0, info.st_size
    if request.if_range is None or info.st_mtime <= request.if_range.timestamp():
        try:
            interval = request.http_range
            if interval.start is not None:
                start = interval.start
                if start < 0 and interval.stop is None:
                    start = max(0, info.st_size+start)
                count = min(interval.stop if interval.stop is not None else info.st_size, info.st_size)-start
                if start >= info.st_size or count < 0:
                    raise ValueError('Invalid cache interval')
                response.set_status(206)
                response.headers['Content-Range'] = f'bytes {start}-{start+count-1}/{info.st_size}'
        except ValueError:
            response.set_status(416)
            response.headers['Content-Range'] = f'bytes */{info.st_size}'
            count = 0
    response.headers['Accept-Ranges'] = 'bytes'
    response.content_length = count
    return response, start, count


async def _serve_cached_image(request, path):
    response = None
    preparing = False
    try:
        async with asyncio.timeout(_media.IMAGE_DELIVERY_SECONDS):
            async with _media.open_image_reader(path) as reader:
                if reader.info.st_size <= 0:
                    return web.Response(status=503 if request.query.get('require_complete') == '1' else 404,
                                        text='Image unavailable', headers={'Cache-Control': 'no-store'})
                if reader.info.st_size > MAX_IMAGE_SIZE:
                    return web.Response(status=413, text='Image cache too large', headers={'Cache-Control': 'no-store'})
                response, start, remaining = _image_cache_response(request, path, reader.info)
                if start:
                    await reader._run(reader.stream.seek, start)
                preparing = True
                async with asyncio.timeout(_media.IMAGE_SEND_SECONDS):
                    await response.prepare(request)
                if request.method != 'HEAD':
                    while remaining:
                        data = await reader.read(min(_media.READ_CHUNK_BYTES, remaining))
                        if not data:
                            raise _media.MediaTransferError(502)
                        async with asyncio.timeout(_media.IMAGE_SEND_SECONDS):
                            await response.write(data)
                        remaining -= len(data)
            async with asyncio.timeout(_media.FINISH_SEND_SECONDS):
                await response.write_eof()
        return response
    except asyncio.CancelledError:
        if preparing:
            _abort_video_response(request, response)
        raise
    except Exception as error:
        if not preparing:
            if isinstance(error, _media.MediaTransferError) and error.status == 503:
                return _media_busy_response()
            print(f"[ComfyUI-Ranking] [!] Image cache open failed: {type(error).__name__}")
            return web.Response(status=500, text='Cache file unavailable', headers={'Cache-Control': 'no-store'})
        print(f"[ComfyUI-Ranking] [!] Image cache delivery interrupted: {type(error).__name__}")
        _abort_video_response(request, response)
        return response


async def cache_image_handler(request):
    """本地 API：异步拦截图片请求，防阻塞实现硬盘级永久缓存
    
    核心原则：本地缓存文件永远优先，网络下载是 fallback
    """
    url = request.query.get("url")
    if not url:
        return web.Response(status=400, text="Missing url")

    url = _clean_nested_url(url, 'image')
    require_complete = request.query.get('require_complete') == '1'
    image_timeout = COMPLETE_IMAGE_TIMEOUT if require_complete else IMAGE_TIMEOUT

    # 🔄 拦截旧数据中残留的 via.placeholder.com 外部占位图URL，直接返回本地SVG
    if 'via.placeholder.com' in url:
        if require_complete:
            return web.Response(status=503, text='Image unavailable', headers={'Cache-Control': 'no-store'})
        # 解析颜色和文字：/150/BG_COLOR/TEXT_COLOR?text=TEXT
        _ph_match = re.search(r'/([\dA-Fa-f]{6})/([\dA-Fa-f]{6})\?text=(.+?)(?:&|$)', url)
        bg = f'#{_ph_match.group(1)}' if _ph_match else '#666'
        fg = f'#{_ph_match.group(2)}' if _ph_match else '#fff'
        # 🔒 P0安全加固：文字内容 XML 转义，防止 SVG 标签注入
        txt = html.escape(urllib.parse.unquote(_ph_match.group(3)), quote=False)[:8] if _ph_match else '?'
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">'
               f'<rect fill="{bg}" width="150" height="150" rx="12"/>'
               f'<text x="75" y="95" text-anchor="middle" fill="{fg}" font-size="40" font-family="sans-serif">{txt}</text></svg>')
        return web.Response(body=svg.encode(), content_type='image/svg+xml')

    # 🚀 核心配合：拦截旧版因 Private 导致 401 的 HF 直链，强行重写为云端代理！
    if url.startswith("https://huggingface.co/datasets/ZHIWEI666/ComfyUI-Ranking/resolve/main/"):
        url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/image_proxy?url=" + urllib.parse.quote(url)

    if not _is_safe_remote_url(url):
        return web.Response(status=403, text="Forbidden target address")

    # 生成缓存路径
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    # 根据URL后缀确定扩展名，默认jpg
    # 🔒 P0安全加固：仅限常见图片格式，杜绝 svg/html 等可执行脚本载体经同源代理构成 XSS
    ext = url.split('.')[-1].split('?')[0].lower()
    if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico'):
        ext = "jpg"

    # 📦 三发行版兼容：缓存目录懒初始化，不可写时降级为不缓存
    cache_ready = await _ensure_cache_dirs_owned()
    if cache_ready is None:
        return _media_busy_response()
    if not cache_ready:
        return web.Response(status=500, text="Cache directory unavailable")

    local_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.{ext}")

    # 🚀 优先级1：本地缓存存在且有效，直接返回（零延迟）
    cached_size = await _cached_file_size_owned(local_path)
    if cached_size == -2:
        return _media_busy_response()
    if cached_size < 0:
        return web.Response(status=500, text='Cache metadata unavailable')
    if cached_size > 0:
        return await _serve_cached_image(request, local_path)

    # 🚦 熔断期内且本地无缓存：立即返回占位图，绝不挂起等待网络，
    # 避免占满浏览器对 localhost 的 6 条并发连接、连带卡住界面切换与本地请求
    if _upstream_circuit_open():
        return _image_circuit_response(require_complete)

    # 优先级2：本地无缓存或缓存无效，尝试从网络下载
    try:
        async with _media_download_capacity(request):
            cached_size = await _cached_file_size_owned(local_path)
            if cached_size == -2:
                return _media_busy_response()
            if cached_size < 0:
                return web.Response(status=500, text='Cache metadata unavailable')
            if cached_size > 0:
                return await _serve_cached_image(request, local_path)
            if _upstream_circuit_open():
                return _image_circuit_response(require_complete)
            async with _new_safe_session() as session:
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Encoding': 'identity'}
                async with asyncio.timeout(image_timeout.total):
                    async with await _get_with_safe_redirects(session, url, headers=headers, timeout=image_timeout, auto_decompress=False) as response:
                        _record_upstream_success()
                        if response.status != 200:
                            return web.Response(status=response.status, text=f"Upstream returned {response.status}")
                        content = await _media.read_image_body(response, MAX_IMAGE_SIZE)
                await _write_image_cache_coordinated(request, local_path, content)
            # 上游所属资源关闭后才交付缓存正文，保持调用方收尾契约。
            return await _serve_cached_image(request, local_path)
    except _media.MediaTransferError as error:
        if error.status == 503:
            return _media_busy_response()
        return web.Response(status=error.status, text="Image too large" if error.status == 413 else "Image proxy connection error")
    except UnsafeRemoteURLError:
        return web.Response(status=403, text="Forbidden upstream redirect")
    except asyncio.TimeoutError:
        print(f"[ComfyUI-Ranking] [!] Image proxy timeout (key: {url_hash})")
        _record_upstream_failure()
        await _cleanup_empty_cache_owned(local_path, url_hash, ext)
        return web.Response(status=504, text="Image proxy timeout")
    except aiohttp.ClientError as e:
        print(f"[ComfyUI-Ranking] [!] Image proxy connection error: {type(e).__name__} (key: {url_hash})")
        _record_upstream_failure()
        await _cleanup_empty_cache_owned(local_path, url_hash, ext)
        return web.Response(status=502, text="Image proxy connection error")
    except Exception as e:
        print(f"[ComfyUI-Ranking] [!] Image proxy internal error: {type(e).__name__} (key: {url_hash})")
        await _cleanup_empty_cache_owned(local_path, url_hash, ext)
        return web.Response(status=500, text="Image proxy internal error")


async def _serve_video_file(request, file_path, file_size=None):
    """使用 StreamResponse 流式返回视频文件，支持 HTTP Range 请求（视频 seek 必需）"""
    if file_size is None:
        file_size = await _cached_file_size_owned(file_path)
    if file_size == -2:
        return _media_busy_response()
    if file_size < 0:
        return web.Response(status=500, text='Cache metadata unavailable')
    if file_size == 0:
        return web.Response(status=404, text='Cache file unavailable')
    content_type, _ = mimetypes.guess_type(file_path)
    content_type = content_type or 'video/mp4'

    range_header = request.headers.get('Range')
    if range_header:
        # 解析 Range: bytes=start-end
        try:
            range_str = range_header.replace('bytes=', '')
            start_str, end_str = range_str.split('-')
            if not start_str and end_str:
                # suffix-byte-range-spec: bytes=-N (最后N个字节)
                suffix_length = int(end_str)
                start = max(0, file_size - suffix_length)
                end = file_size - 1
            elif start_str:
                start = int(start_str)
                end = int(end_str) if end_str else file_size - 1
            else:
                raise ValueError("Invalid Range format")
            # 边界校验：确保合法范围
            start = max(0, start)
            end = min(end, file_size - 1)
            if start > end or start >= file_size:
                return web.Response(status=416, text="Range Not Satisfiable")
        except (ValueError, IndexError, TypeError):
            start = 0
            end = file_size - 1

        resp = web.StreamResponse(status=206, headers={
            'Content-Type': content_type,
            'Accept-Ranges': 'bytes',
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Content-Length': str(end - start + 1),
        })
        return await _deliver_cached_video(request, resp, file_path, start, end)
    else:
        resp = web.StreamResponse(status=200, headers={
            'Content-Type': content_type,
            'Accept-Ranges': 'bytes',
            'Content-Length': str(file_size),
        })
        return await _deliver_cached_video(request, resp, file_path, 0, file_size-1)


async def _deliver_cached_video(request, response, file_path, start, end):
    """缓存先准入/所属打开再准备响应；失败关闭原连接，不发送成功EOF。"""
    preparing = False
    try:
        async with asyncio.timeout(_media.VIDEO_TOTAL_SECONDS):
            async with _media.open_video_reader(file_path, start) as reader:
                preparing = True
                async with asyncio.timeout(_media.VIDEO_SEND_SECONDS):
                    await response.prepare(request)
                await _stream_file_chunks(response, file_path, start, end, reader)
            async with asyncio.timeout(_media.FINISH_SEND_SECONDS):
                await response.write_eof()
    except asyncio.CancelledError:
        _abort_video_response(request, response)
        raise
    except Exception as error:
        if not preparing:
            if isinstance(error, _media.MediaTransferError) and error.status == 503:
                return _media_busy_response()
            print(f"[ComfyUI-Ranking] [!] Cached video open failed: {type(error).__name__}")
            return web.Response(status=500, text='Cache file unavailable', headers={'Cache-Control': 'no-store'})
        print(f"[ComfyUI-Ranking] [!] Cached video delivery interrupted: {type(error).__name__}")
        _abort_video_response(request, response)
    return response


def _abort_video_response(request, response):
    response.force_close()
    if request.transport is not None:
        request.transport.close()


async def _finish_video_delivery(request, response, writer, complete, size, expected):
    valid = complete and size > 0 and (expected is None or size == expected)
    try:
        if writer is not None:
            await _finish_video_cache_coordinated(writer, complete, size, expected)
    except Exception as error:
        print(f"[ComfyUI-Ranking] [!] Video cache finalization failed: {type(error).__name__}")
    if valid:
        try:
            async with asyncio.timeout(_media.FINISH_SEND_SECONDS):
                await response.write_eof()
            return
        except Exception:
            pass
    _abort_video_response(request, response)


async def _release_video_reference(url_hash):
    async with _video_locks_lock:
        if url_hash in _video_lock_refs:
            _video_lock_refs[url_hash] -= 1
            if _video_lock_refs[url_hash] <= 0:
                _video_download_locks.pop(url_hash, None)
                _video_lock_refs.pop(url_hash, None)


async def cache_video_handler(request):
    """视频代理缓存接口 /community_hub/video?url=...

    关键设计：
    - 缓存目录独立：ComfyUI/models/cache/videos/
    - 支持 HTTP Range 请求（视频 seek/拖动进度条必需）
    - 使用 StreamResponse 流式传输，不一次性读入内存
    - 单文件最大 100MB，超过直接转发不缓存
    - 整个上游链路软超时300秒，读取/发送当前块各15秒
    """
    url = request.query.get("url")
    if not url:
        return web.Response(status=400, text="Missing url")

    url = _clean_nested_url(url, 'video')

    if not _is_safe_remote_url(url):
        return web.Response(status=403, text="Forbidden target address")

    # 生成缓存路径
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    # 根据 URL 后缀确定扩展名，限制为常见视频格式
    ext = url.split('.')[-1].split('?')[0].lower()
    valid_exts = {'mp4', 'webm', 'mov', 'avi', 'mkv'}
    if ext not in valid_exts:
        ext = 'mp4'

    # 📦 三发行版兼容：缓存目录懒初始化，不可写时降级为不缓存
    cache_ready = await _ensure_cache_dirs_owned()
    if cache_ready is None:
        return _media_busy_response()
    if not cache_ready:
        return web.Response(status=500, text="Cache directory unavailable")

    local_path = os.path.join(VIDEO_CACHE_DIR, f"{url_hash}.{ext}")

    # 🚀 优先级1：本地缓存存在且有效，直接返回（零延迟）
    cached_size = await _cached_file_size_owned(local_path)
    if cached_size == -2:
        return _media_busy_response()
    if cached_size < 0:
        return web.Response(status=500, text='Cache metadata unavailable')
    if cached_size > 0:
        return await _serve_video_file(request, local_path, cached_size)

    # 🚦 熔断期内且本地无缓存：快速失败，不挂起 300 秒占死浏览器本地连接通道
    if _upstream_circuit_open():
        return web.Response(status=503, text="Upstream circuit open, retry later")

    # 优先级2：本地无缓存或缓存无效，尝试从网络下载
    resp = None
    try:
        async with _video_download_capacity(request, url_hash):
            # 双重检查：锁获取后再次确认缓存是否已存在（其他协程可能已下载完成）
            cached_size = await _cached_file_size_owned(local_path)
            if cached_size == -2:
                return _media_busy_response()
            if cached_size < 0:
                return web.Response(status=500, text='Cache metadata unavailable')
            if cached_size > 0:
                resp = await _serve_video_file(request, local_path, cached_size)
                return resp
            if _upstream_circuit_open():
                return web.Response(status=503, text="Upstream circuit open, retry later")

            resp = None
            try:
                async with asyncio.timeout(_media.VIDEO_TOTAL_SECONDS), _new_safe_session() as session:
                    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                               'Accept-Encoding': 'identity'}
                    async with await _get_with_safe_redirects(session, url, headers=headers,
                            timeout=VIDEO_TIMEOUT, auto_decompress=False) as response:
                        _record_upstream_success()  # 收到任何应答即证明云端可达
                        if response.status != 200:
                            print(f"[ComfyUI-Ranking] [!] Video upstream failure (status: {response.status}, key: {url_hash})")
                            return web.Response(status=response.status, text=f"Upstream returned {response.status}")

                        expected_size = _media.video_expected_length(response)
                        cacheable = expected_size is None or expected_size <= MAX_VIDEO_SIZE
                        chunks = _media.iter_video_body(response, expected_size,
                                                       MAX_VIDEO_SIZE if cacheable else None)
                        # 首块在发送成功响应头前确认；未知长度空体/首块超限不能变成200。
                        first_chunk = await anext(chunks)
                        content_type = response.headers.get('Content-Type') or mimetypes.guess_type(local_path)[0] or 'video/mp4'

                        headers = {
                            'Content-Type': content_type,
                            'Accept-Ranges': 'bytes',
                        }
                        if cacheable:
                            headers['Cache-Control'] = 'public, max-age=86400'
                        if expected_size is not None:
                            headers['Content-Length'] = str(expected_size)

                        resp = web.StreamResponse(status=200, headers=headers)
                        await resp.prepare(request)

                        # 已知大视频保留只转发规则，与缓存候选共用校验/响应收尾。
                        writer = _media.VideoCacheWriter(local_path, MAX_VIDEO_SIZE) if cacheable else None
                        downloaded_size = 0

                        client_alive = True
                        source_download_complete = False
                        try:
                            if writer is not None:
                                await writer.open()
                            chunk = first_chunk
                            first_chunk = None
                            while True:
                                if writer is not None:
                                    await writer.write(chunk)
                                downloaded_size += len(chunk)
                                if client_alive:
                                    try:
                                        async with asyncio.timeout(_media.VIDEO_SEND_SECONDS):
                                            await resp.write(chunk)
                                        await asyncio.sleep(0)
                                    except (ConnectionResetError, ConnectionAbortedError, RuntimeError,
                                            BrokenPipeError, asyncio.TimeoutError):
                                        client_alive = False
                                        if writer is None:
                                            break
                                        print(f"[ComfyUI-Ranking] [!] Client disconnected, completing video cache: {url_hash}")
                                try:
                                    chunk = await anext(chunks)
                                except StopAsyncIteration:
                                    source_download_complete = True
                                    break
                        except Exception as e:
                            # 源站下载中断（非客户端断连导致）
                            print(f"[ComfyUI-Ranking] [!] Video download interrupted: {type(e).__name__} ({url_hash})")
                            source_download_complete = False
                            if isinstance(e, (asyncio.TimeoutError, aiohttp.ClientConnectionError)):
                                _record_upstream_failure()
                        finally:
                            ending = asyncio.create_task(_finish_video_delivery(request, resp, writer,
                                source_download_complete, downloaded_size, expected_size))
                            try:
                                await _media.wait_owned(ending)
                            finally:
                                # 宿主可能在子任务首次运行前取消它；原请求仍拥有文件收尾。
                                if ending.cancelled() or (writer is not None and not writer.finished):
                                    try:
                                        if writer is not None and not writer.finished:
                                            writer.cancelled.set()
                                            await writer.finish(False, downloaded_size, expected_size)
                                    except Exception as error:
                                        print(f"[ComfyUI-Ranking] [!] Video cache cleanup failed: {type(error).__name__}")
                                    finally:
                                        _abort_video_response(request, resp)

                        return resp
            except UnsafeRemoteURLError:
                return web.Response(status=403, text="Forbidden upstream redirect")
            except _media.MediaTransferError as error:
                return web.Response(status=error.status, text="Invalid upstream video", headers={'Cache-Control': 'no-store'})
            except asyncio.TimeoutError:
                print(f"[ComfyUI-Ranking] [!] Video proxy timeout (key: {url_hash})")
                _record_upstream_failure()
                await _cleanup_empty_cache_owned(local_path, url_hash, ext)
                if resp is not None:
                    _abort_video_response(request, resp)
                    return resp
                return web.Response(status=504, text="Video proxy timeout")
            except aiohttp.ClientError as e:
                print(f"[ComfyUI-Ranking] [!] Video proxy connection error: {type(e).__name__} (key: {url_hash})")
                _record_upstream_failure()
                await _cleanup_empty_cache_owned(local_path, url_hash, ext)
                if resp is not None:
                    _abort_video_response(request, resp)
                    return resp
                return web.Response(status=502, text="Video proxy connection error")
            except Exception as e:
                print(f"[ComfyUI-Ranking] [!] Video proxy internal error: {type(e).__name__} (key: {url_hash})")
                await _cleanup_empty_cache_owned(local_path, url_hash, ext)
                if resp is not None:
                    _abort_video_response(request, resp)
                    return resp
                return web.Response(status=500, text="Video proxy internal error")
    except _media.MediaTransferError as error:
        if error.status == 503:
            if resp is not None:
                return resp
            return _media_busy_response()
        raise


CACHE_CONTROL_MAX_BYTES = 4 * 1024
CACHE_CONTROL_MAX_DEPTH = 8
CACHE_CONTROL_IDLE_SECONDS = 5
CACHE_CONTROL_TOTAL_SECONDS = 10
CACHE_MANAGEMENT_CONCURRENCY = 1
CACHE_MANAGEMENT_MAX_QUEUED = 4
CACHE_MANAGEMENT_QUEUE_SECONDS = 5
CACHE_MANAGEMENT_TOTAL_SECONDS = 30
CACHE_MANAGEMENT_MAX_ENTRIES = 100000


class _CacheManagementError(Exception):
    def __init__(self, status=400, message='Invalid JSON body'):
        self.status, self.message = status, message


async def _cache_management_rejection(request, error):
    response = web.Response(status=error.status, text=error.message)
    response.force_close()
    transport = request.transport
    try:
        async with asyncio.timeout(CACHE_CONTROL_IDLE_SECONDS):
            await response.prepare(request)
            await response.write_eof()
    finally:
        if transport is not None:
            transport.close()
    return response


def _try_cache_management_slot(kind, count):
    for index in range(count):
        lease = directory_lease(Path(CUSTOM_NODES_DIR)/('.ranking-cache-'+kind+'-'+str(index)))
        try:
            lease.__enter__()
        except TimeoutError:
            continue
        return lease
    return None


async def _acquire_cache_management_capacity(request):
    started = time.monotonic()
    waiting = active = None
    try:
        while True:
            _control_reader.check_connection(request)
            if waiting is not None and time.monotonic()-started >= CACHE_MANAGEMENT_QUEUE_SECONDS:
                raise _CacheManagementError(503, 'Cache management busy')
            active = _try_cache_management_slot('active', CACHE_MANAGEMENT_CONCURRENCY)
            if active is not None:
                return active
            if waiting is None:
                waiting = _try_cache_management_slot('waiting', CACHE_MANAGEMENT_MAX_QUEUED)
                if waiting is None:
                    raise _CacheManagementError(503, 'Cache management busy')
            await asyncio.sleep(.05)
    finally:
        try:
            if waiting is not None:
                waiting.__exit__(None, None, None)
        except BaseException:
            if active is not None:
                with contextlib.suppress(Exception):
                    active.__exit__(None, None, None)
            raise


def _clear_cache_file_coordinated(path, directory, identity, check):
    """批量删除与完整媒体发布共用非阻塞文件租约；重新读取当前文件元数据。"""
    lease = directory_lease(_cache_mutation_target(path))
    try:
        lease.__enter__()
    except (OSError, ValueError):
        raise _CacheManagementError(503, 'Cache management busy') from None
    try:
        check()
        current = os.stat(directory, follow_symlinks=False)
        if ((current.st_dev, current.st_ino) != (identity.st_dev, identity.st_ino)
                or not stat.S_ISDIR(current.st_mode)
                or getattr(current, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
            raise _CacheManagementError(500, 'Cache directory unavailable')
        info = os.stat(path, follow_symlinks=False)
        if (not stat.S_ISREG(info.st_mode)
                or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
            return None
        check()
        os.remove(path)
        return info.st_size
    finally:
        lease.__exit__(None, None, None)


def _cache_management_sync(target, cancel):
    """一次目录工作由一个线程拥有；不递归、不追随缓存子目录链接。"""
    deadline = time.monotonic()+CACHE_MANAGEMENT_TOTAL_SECONDS
    entries = 0
    result = {'cleared_count': 0, 'freed_size': 0} if target else {}

    def check():
        if cancel.is_set():
            raise asyncio.CancelledError()
        if time.monotonic() >= deadline or entries > CACHE_MANAGEMENT_MAX_ENTRIES:
            raise _CacheManagementError(503, 'Cache management budget exceeded')

    check()
    if not _ensure_cache_dirs():
        raise _CacheManagementError(500, 'Cache directory unavailable')
    for kind, directory in (('images', IMAGE_CACHE_DIR), ('videos', VIDEO_CACHE_DIR)):
        if target and target not in ('all', kind):
            continue
        check()
        count = size = 0
        try:
            identity = os.stat(directory, follow_symlinks=False)
        except FileNotFoundError:
            if not target:
                result['image_count' if kind == 'images' else 'video_count'] = 0
                result['image_size' if kind == 'images' else 'video_size'] = 0
            continue
        if (not stat.S_ISDIR(identity.st_mode)
                or getattr(identity, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
            raise _CacheManagementError(500, 'Cache directory unavailable')
        with os.scandir(directory) as iterator:
            for entry in iterator:
                entries += 1
                check()
                # Windows无dir_fd目录删除接口；逐项复核根身份缩小路径替换窗口。
                current = os.stat(directory, follow_symlinks=False)
                if ((current.st_dev, current.st_ino) != (identity.st_dev, identity.st_ino)
                        or not stat.S_ISDIR(current.st_mode)
                        or getattr(current, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
                    raise _CacheManagementError(500, 'Cache directory unavailable')
                if not entry.is_file(follow_symlinks=False):
                    continue
                if target and re.search(r'\.tmp\.[a-f0-9]{8}$', entry.name):
                    continue
                try:
                    info = entry.stat(follow_symlinks=False)
                    if (not stat.S_ISREG(info.st_mode)
                            or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
                        continue
                    check()
                    if target:
                        removed_size = _clear_cache_file_coordinated(entry.path, directory, identity, check)
                        if removed_size is not None:
                            result['cleared_count'] += 1
                            result['freed_size'] += removed_size
                    else:
                        count += 1
                        size += info.st_size
                except FileNotFoundError:
                    continue
        if not target:
            result['image_count' if kind == 'images' else 'video_count'] = count
            result['image_size' if kind == 'images' else 'video_size'] = size
    check()
    return result


async def _run_cache_management(request, target):
    cancel = threading.Event()
    worker = asyncio.get_running_loop().run_in_executor(None, _cache_management_sync, target, cancel)
    try:
        while not worker.done():
            _control_reader.check_connection(request)
            await asyncio.wait({worker}, timeout=.1)
        return worker.result()
    finally:
        if not worker.done():
            cancel.set()
        while not worker.done():
            try:
                await asyncio.wait({worker})
            except asyncio.CancelledError:
                cancel.set()
        with contextlib.suppress(Exception, asyncio.CancelledError):
            worker.result()


async def cache_stats_handler(request):
    """GET /community_hub/cache/stats - 返回图片和视频缓存统计"""
    if not _is_local_request(request):
        return web.Response(status=403, text="Forbidden: local access only")
    lease = None
    try:
        if request.body_exists:
            raise _CacheManagementError(400, 'Unexpected request body')
        lease = await _acquire_cache_management_capacity(request)
        return web.json_response(await _run_cache_management(request, None))
    except _CacheManagementError as error:
        return await _cache_management_rejection(request, error)
    except Exception:
        return await _cache_management_rejection(request, _CacheManagementError(500, 'Cache directory unavailable'))
    finally:
        if lease is not None:
            lease.__exit__(None, None, None)


async def cache_clear_handler(request):
    """POST /community_hub/cache/clear - 清理缓存文件"""
    if not _is_local_request(request):
        return web.Response(status=403, text="Forbidden: local access only")
    lease = None
    try:
        _control_reader.check_headers(request, CACHE_CONTROL_MAX_BYTES, _CacheManagementError)
        lease = await _acquire_cache_management_capacity(request)
        try:
            body = await _control_reader.read_json(request, max_bytes=CACHE_CONTROL_MAX_BYTES,
                chunk_bytes=CACHE_CONTROL_MAX_BYTES, max_depth=CACHE_CONTROL_MAX_DEPTH,
                idle_seconds=CACHE_CONTROL_IDLE_SECONDS, total_seconds=CACHE_CONTROL_TOTAL_SECONDS,
                error=_CacheManagementError)
        except (ValueError, TypeError):
            raise _CacheManagementError() from None
        if not isinstance(body, dict):
            raise _CacheManagementError()
        target = body.get('target')
        if target not in ('all', 'images', 'videos'):
            raise _CacheManagementError(400, "Invalid target. Must be 'all', 'images', or 'videos'")
        return web.json_response(await _run_cache_management(request, target))
    except _CacheManagementError as error:
        return await _cache_management_rejection(request, error)
    except Exception:
        return await _cache_management_rejection(request, _CacheManagementError(500, 'Cache clearing incomplete'))
    finally:
        if lease is not None:
            lease.__exit__(None, None, None)
