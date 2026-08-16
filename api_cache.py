# api_cache.py
import os
import re
import html
import ipaddress
import hashlib
import asyncio
import uuid
import aiohttp
import mimetypes
import urllib.parse
from urllib.parse import urlparse
from aiohttp import web

# 📦 三发行版兼容：folder_paths 仅存在于 ComfyUI 运行时，try 化防止脱离宿主时拖垮导入链
try:
    import folder_paths
except Exception:
    folder_paths = None

# 视频下载锁字典（按 URL hash 粒度加锁）
_video_download_locks = {}
_video_locks_lock = asyncio.Lock()
_video_lock_refs = {}  # {url_hash: int} 引用计数器，替代 lock._waiters

def _scan_dir_stats(dir_path):
    """使用 os.scandir() 统计目录下的直接文件数量和总大小"""
    count = 0
    total_size = 0
    if not os.path.exists(dir_path):
        return count, total_size
    try:
        with os.scandir(dir_path) as it:
            for entry in it:
                if entry.is_file(follow_symlinks=False):
                    count += 1
                    try:
                        total_size += entry.stat(follow_symlinks=False).st_size
                    except (OSError, FileNotFoundError):
                        pass
    except (OSError, FileNotFoundError):
        pass
    return count, total_size


def _clean_nested_url(url, endpoint):
    """清除被污染的嵌套 URL，如 /community_hub/image?url=http://... 反复嵌套的情况"""
    prefix = f'/community_hub/{endpoint}?url='
    # 加上限保险：防止构造性输入导致循环不收敛
    for _ in range(10):
        if not url.startswith(prefix):
            break
        url = urllib.parse.unquote(url.replace(prefix, ''))
    return url


async def _stream_file_chunks(resp, file_path, start=0, end=None):
    """流式读取文件并写入响应，支持 Range 请求（指定 start/end）和完整文件传输（end=None）"""
    with open(file_path, 'rb') as f:
        if start > 0:
            f.seek(start)
        remaining = (end - start + 1) if end is not None else None
        chunk_size = 256 * 1024
        while True:
            if remaining is not None:
                if remaining <= 0:
                    break
                to_read = min(chunk_size, remaining)
            else:
                to_read = chunk_size
            data = f.read(to_read)
            if not data:
                break
            try:
                await resp.write(data)
            except (ConnectionResetError, RuntimeError, BrokenPipeError):
                break
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
    """检查请求是否来自本机，保护管理接口（与 api_tool/api_app 统一，不再额外放行内网）"""
    remote = request.remote or ""
    # 处理 IPv4-mapped IPv6（如 ::ffff:127.0.0.1）
    if remote.startswith("::ffff:"):
        remote = remote[7:]
    if remote in ("127.0.0.1", "localhost", "::1"):
        return True
    return False


def _is_forbidden_ip(ip):
    """判断 IP 是否为内网/环回/链路本地等危险地址"""
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified


def _is_forbidden_target(url):
    """检查 URL 是否指向内网/本地地址，防止 SSRF（含 DNS 解析后二次校验）"""
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
            # 🔧 回归修复：撤销 DNS 解析二次校验——Clash 等代理的 fake-ip 模式会把所有域名
            # 解析到 198.18.0.0/15 基准测试段（is_private=True），导致未缓存图片全部误判内网 403；
            # 本地代理仅代用户本机发请求，跳板风险低，域名放行，连接异常交给下载环节自然报错
            return False
    except Exception:
        return True


def _cleanup_empty_cache(local_path, url_hash, ext):
    """清理0字节的损坏缓存文件"""
    if os.path.exists(local_path) and os.path.getsize(local_path) == 0:
        try:
            os.remove(local_path)
            print(f"[ComfyUI-Ranking] 🧹 已清理空缓存文件: {url_hash}.{ext}")
        except (OSError, FileNotFoundError):
            pass


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
        print(f"[ComfyUI-Ranking] ⚠️ 缓存目录不可用，本次请求降级为不缓存: {e}")
        return False

# 视频缓存限制：100MB，平衡常见短视频需求与磁盘占用
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB
# 🔒 图片缓存上限：20MB，防止恶意超大文件打爆内存
MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB
VIDEO_TIMEOUT = aiohttp.ClientTimeout(total=300)

async def cache_image_handler(request):
    """本地 API：异步拦截图片请求，防阻塞实现硬盘级永久缓存
    
    核心原则：本地缓存文件永远优先，网络下载是 fallback
    """
    url = request.query.get("url")
    if not url:
        return web.Response(status=400, text="Missing url")

    url = _clean_nested_url(url, 'image')

    # 🔄 拦截旧数据中残留的 via.placeholder.com 外部占位图URL，直接返回本地SVG
    if 'via.placeholder.com' in url:
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

    if not url.startswith('http'):
        raise web.HTTPFound(location=url)

    if _is_forbidden_target(url):
        return web.Response(status=403, text="Forbidden target address")

    # 生成缓存路径
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    # 根据URL后缀确定扩展名，默认jpg
    # 🔒 P0安全加固：仅限常见图片格式，杜绝 svg/html 等可执行脚本载体经同源代理构成 XSS
    ext = url.split('.')[-1].split('?')[0].lower()
    if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico'):
        ext = "jpg"

    # 📦 三发行版兼容：缓存目录懒初始化，不可写时降级为不缓存
    if not _ensure_cache_dirs():
        return web.Response(status=500, text="Cache directory unavailable")

    local_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.{ext}")

    # 🚀 优先级1：本地缓存存在且有效，直接返回（零延迟）
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        content_type, _ = mimetypes.guess_type(local_path)
        return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})

    # 优先级2：本地无缓存或缓存无效，尝试从网络下载
    try:
        async with aiohttp.ClientSession() as session:
            # 伪装 User-Agent 防止被拦截
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            # 加入 ssl=False 彻底解决 ComfyUI 整合包证书报错问题
            # 超时时间30秒，与前端保持一致
            async with session.get(url, headers=headers, ssl=False, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status == 200:
                    # 🔒 P0安全加固：体积上限检查，防止恶意超大文件打爆内存
                    content_length = response.headers.get('Content-Length')
                    if content_length and int(content_length) > MAX_IMAGE_SIZE:
                        return web.Response(status=413, text="Image too large")
                    content = await response.read()
                    if len(content) > MAX_IMAGE_SIZE:
                        return web.Response(status=413, text="Image too large")
                    # 🔒 P0安全加固：tmp + os.replace 原子落盘，避免并发写同一缓存文件产生损坏
                    tmp_path = local_path + f'.tmp.{uuid.uuid4().hex[:8]}'
                    with open(tmp_path, "wb") as f:
                        f.write(content)
                    os.replace(tmp_path, local_path)
                    
                    print(f"[ComfyUI-Ranking] ✅ 成功下载并缓存图片: {url_hash}.{ext}")
                    
                    content_type, _ = mimetypes.guess_type(local_path)
                    return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})
                else:
                    # 源站返回非200，转发原始状态码
                    print(f"[ComfyUI-Ranking] ⚠️ 图片下载失败 (状态码: {response.status}): {url[:80]}...")
                    return web.Response(status=response.status, text=f"Upstream returned {response.status}")
    except asyncio.TimeoutError as e:
        print(f"[ComfyUI-Ranking] ⚠️ 图片代理超时: {url[:80]}... 错误: {str(e)}")
        _cleanup_empty_cache(local_path, url_hash, ext)
        return web.Response(status=504, text="Image proxy timeout")
    except aiohttp.ClientError as e:
        print(f"[ComfyUI-Ranking] ⚠️ 图片代理连接错误: {url[:80]}... 错误: {str(e)}")
        _cleanup_empty_cache(local_path, url_hash, ext)
        return web.Response(status=502, text=f"Image proxy connection error: {str(e)}")
    except Exception as e:
        print(f"[ComfyUI-Ranking] ⚠️ 图片代理内部错误: {url[:80]}... 错误: {str(e)}")
        _cleanup_empty_cache(local_path, url_hash, ext)
        return web.Response(status=500, text=f"Image proxy internal error: {str(e)}")


async def _serve_video_file(request, file_path):
    """使用 StreamResponse 流式返回视频文件，支持 HTTP Range 请求（视频 seek 必需）"""
    file_size = os.path.getsize(file_path)
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
        await resp.prepare(request)
        try:
            await _stream_file_chunks(resp, file_path, start, end)
        finally:
            try:
                await resp.write_eof()
            except Exception:
                pass
        return resp
    else:
        resp = web.StreamResponse(status=200, headers={
            'Content-Type': content_type,
            'Accept-Ranges': 'bytes',
            'Content-Length': str(file_size),
        })
        await resp.prepare(request)
        try:
            await _stream_file_chunks(resp, file_path)
        finally:
            try:
                await resp.write_eof()
            except Exception:
                pass
        return resp


async def cache_video_handler(request):
    """视频代理缓存接口 /community_hub/video?url=...

    关键设计：
    - 缓存目录独立：ComfyUI/models/cache/videos/
    - 支持 HTTP Range 请求（视频 seek/拖动进度条必需）
    - 使用 StreamResponse 流式传输，不一次性读入内存
    - 单文件最大 100MB，超过直接转发不缓存
    - 下载超时 300 秒
    """
    url = request.query.get("url")
    if not url:
        return web.Response(status=400, text="Missing url")

    url = _clean_nested_url(url, 'video')

    if not url.startswith('http'):
        raise web.HTTPFound(location=url)

    if _is_forbidden_target(url):
        return web.Response(status=403, text="Forbidden target address")

    # 生成缓存路径
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    # 根据 URL 后缀确定扩展名，限制为常见视频格式
    ext = url.split('.')[-1].split('?')[0].lower()
    valid_exts = {'mp4', 'webm', 'mov', 'avi', 'mkv'}
    if ext not in valid_exts:
        ext = 'mp4'

    # 📦 三发行版兼容：缓存目录懒初始化，不可写时降级为不缓存
    if not _ensure_cache_dirs():
        return web.Response(status=500, text="Cache directory unavailable")

    local_path = os.path.join(VIDEO_CACHE_DIR, f"{url_hash}.{ext}")

    # 🚀 优先级1：本地缓存存在且有效，直接返回（零延迟）
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return await _serve_video_file(request, local_path)

    # 优先级2：本地无缓存或缓存无效，尝试从网络下载
    lock = await _get_video_lock(url_hash)
    try:
        async with lock:
            # 双重检查：锁获取后再次确认缓存是否已存在（其他协程可能已下载完成）
            if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                return await _serve_video_file(request, local_path)

            try:
                async with aiohttp.ClientSession() as session:
                    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                    async with session.get(url, headers=headers, ssl=False, timeout=VIDEO_TIMEOUT) as response:
                        if response.status != 200:
                            print(f"[ComfyUI-Ranking] ⚠️ 视频下载失败 (状态码: {response.status}): {url[:80]}...")
                            return web.Response(status=response.status, text=f"Upstream returned {response.status}")

                        content_length = response.headers.get('Content-Length')
                        if content_length and int(content_length) > MAX_VIDEO_SIZE:
                            # 超过大小限制，直接流式转发不缓存
                            content_type = response.headers.get('Content-Type') or mimetypes.guess_type(local_path)[0] or 'video/mp4'
                            stream_resp = web.StreamResponse(status=200, headers={
                                'Content-Type': content_type,
                                'Accept-Ranges': 'bytes',
                            })
                            stream_resp.headers['Content-Length'] = content_length
                            await stream_resp.prepare(request)
                            try:
                                async for chunk in response.content.iter_chunked(256 * 1024):
                                    try:
                                        await stream_resp.write(chunk)
                                    except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, RuntimeError):
                                        break
                            finally:
                                try:
                                    await stream_resp.write_eof()
                                except Exception:
                                    pass
                            return stream_resp

                        # 🚀 Tee 流式缓存：边下载边转发给客户端，同时写入本地缓存
                        os.makedirs(VIDEO_CACHE_DIR, exist_ok=True)  # 双保险：懒初始化已保证存在
                        content_type = response.headers.get('Content-Type', 'video/mp4')

                        headers = {
                            'Content-Type': content_type,
                            'Accept-Ranges': 'bytes',
                            'Cache-Control': 'public, max-age=86400',
                        }
                        if content_length:
                            headers['Content-Length'] = content_length

                        resp = web.StreamResponse(status=200, headers=headers)
                        await resp.prepare(request)

                        tmp_path = local_path + f'.tmp.{uuid.uuid4().hex[:8]}'
                        downloaded_size = 0
                        expected_size = int(content_length) if content_length else None

                        client_alive = True
                        source_download_complete = False
                        try:
                            with open(tmp_path, 'wb') as f:
                                async for chunk in response.content.iter_chunked(256 * 1024):
                                    f.write(chunk)
                                    downloaded_size += len(chunk)
                                    if downloaded_size > MAX_VIDEO_SIZE:
                                        source_download_complete = False
                                        print(f"[ComfyUI-Ranking] ⚠️ 视频超过最大缓存限制 ({MAX_VIDEO_SIZE} bytes)，中断下载: {url_hash}")
                                        break
                                    if client_alive:
                                        try:
                                            await resp.write(chunk)
                                            await asyncio.sleep(0)
                                        except (ConnectionResetError, RuntimeError, BrokenPipeError):
                                            client_alive = False
                                            print(f"[ComfyUI-Ranking] ℹ️ 客户端断连，继续后台缓存: {url_hash}")
                                # 循环正常结束 = 源站下载完成
                                source_download_complete = True
                        except Exception as e:
                            # 源站下载中断（非客户端断连导致）
                            print(f"[ComfyUI-Ranking] ⚠️ 源站下载中断: {str(e)}")
                            source_download_complete = False
                        finally:
                            try:
                                await resp.write_eof()
                            except Exception:
                                pass

                            # 根据 source_download_complete 决定是否保存缓存
                            if source_download_complete:
                                if expected_size and downloaded_size == expected_size:
                                    os.replace(tmp_path, local_path)
                                    print(f"[ComfyUI-Ranking] ✅ 视频已缓存: {url_hash} ({downloaded_size} bytes)")
                                elif not expected_size and downloaded_size > 0:
                                    os.replace(tmp_path, local_path)
                                    print(f"[ComfyUI-Ranking] ✅ 视频已缓存（无Content-Length）: {url_hash} ({downloaded_size} bytes)")
                                else:
                                    if os.path.exists(tmp_path):
                                        os.remove(tmp_path)
                            else:
                                if os.path.exists(tmp_path):
                                    os.remove(tmp_path)

                        return resp
            except asyncio.TimeoutError as e:
                print(f"[ComfyUI-Ranking] ⚠️ 视频代理超时: {url[:80]}... 错误: {str(e)}")
                _cleanup_empty_cache(local_path, url_hash, ext)
                return web.Response(status=504, text="Video proxy timeout")
            except aiohttp.ClientError as e:
                print(f"[ComfyUI-Ranking] ⚠️ 视频代理连接错误: {url[:80]}... 错误: {str(e)}")
                _cleanup_empty_cache(local_path, url_hash, ext)
                return web.Response(status=502, text=f"Video proxy connection error: {str(e)}")
            except Exception as e:
                print(f"[ComfyUI-Ranking] ⚠️ 视频代理内部错误: {url[:80]}... 错误: {str(e)}")
                _cleanup_empty_cache(local_path, url_hash, ext)
                return web.Response(status=500, text=f"Video proxy internal error: {str(e)}")
    finally:
        # 🔒 锁释放后清理：引用计数归0时删除锁对象防止内存泄漏
        async with _video_locks_lock:
            if url_hash in _video_lock_refs:
                _video_lock_refs[url_hash] -= 1
                if _video_lock_refs[url_hash] <= 0:
                    _video_download_locks.pop(url_hash, None)
                    _video_lock_refs.pop(url_hash, None)


async def cache_stats_handler(request):
    """GET /community_hub/cache/stats - 返回图片和视频缓存统计"""
    if not _is_local_request(request):
        return web.Response(status=403, text="Forbidden: local access only")
    # 修复：缓存目录尚未懒初始化时避免对 None 路径做统计
    _ensure_cache_dirs()
    image_count, image_size = _scan_dir_stats(IMAGE_CACHE_DIR)
    video_count, video_size = _scan_dir_stats(VIDEO_CACHE_DIR)
    return web.json_response({
        "image_count": image_count,
        "image_size": image_size,
        "video_count": video_count,
        "video_size": video_size,
    })


async def cache_clear_handler(request):
    """POST /community_hub/cache/clear - 清理缓存文件"""
    if not _is_local_request(request):
        return web.Response(status=403, text="Forbidden: local access only")
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400, text="Invalid JSON body")

    target = body.get("target")
    if target not in ("all", "images", "videos"):
        return web.Response(status=400, text="Invalid target. Must be 'all', 'images', or 'videos'")

    # 修复：缓存目录尚未懒初始化时避免 os.path.exists(None) 报错
    _ensure_cache_dirs()

    dirs_to_clear = []
    if target == "all":
        dirs_to_clear = [IMAGE_CACHE_DIR, VIDEO_CACHE_DIR]
    elif target == "images":
        dirs_to_clear = [IMAGE_CACHE_DIR]
    elif target == "videos":
        dirs_to_clear = [VIDEO_CACHE_DIR]

    cleared_count = 0
    freed_size = 0

    for dir_path in dirs_to_clear:
        if not os.path.exists(dir_path):
            continue
        try:
            with os.scandir(dir_path) as it:
                for entry in it:
                    if entry.is_file(follow_symlinks=False):
                        name = entry.name
                        # 跳过正在下载的临时文件
                        if re.search(r'\.tmp\.[a-f0-9]{8}$', name):
                            continue
                        try:
                            file_size = entry.stat(follow_symlinks=False).st_size
                            os.remove(entry.path)
                            cleared_count += 1
                            freed_size += file_size
                        except FileNotFoundError:
                            pass
                        except OSError:
                            pass
        except (OSError, FileNotFoundError):
            pass

    return web.json_response({
        "cleared_count": cleared_count,
        "freed_size": freed_size,
    })