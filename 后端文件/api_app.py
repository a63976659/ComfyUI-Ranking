# api_app.py
import os
import re
import ssl
import json
import time
import asyncio
import threading
import uuid
from functools import wraps
import urllib.request
import urllib.error
import ipaddress
from urllib.parse import urlsplit
from aiohttp import web
try:
    from . import workflow_response
except ImportError:
    # 独立源码加载时也从同目录取得模块，不依赖宿主 sys.path。
    import importlib.util
    _response_spec = importlib.util.spec_from_file_location(
        "ranking_workflow_response", os.path.join(os.path.dirname(__file__), "workflow_response.py"))
    workflow_response = importlib.util.module_from_spec(_response_spec)
    _response_spec.loader.exec_module(workflow_response)

try:
    from . import media_proxy as _proxy
except ImportError:
    import importlib.util
    _proxy_spec = importlib.util.spec_from_file_location(
        'ranking_workflow_proxy', os.path.join(os.path.dirname(__file__), 'media_proxy.py'))
    _proxy = importlib.util.module_from_spec(_proxy_spec)
    _proxy_spec.loader.exec_module(_proxy)

# 📦 三发行版兼容：folder_paths 仅存在于 ComfyUI 运行时，try 化防止脱离宿主时拖垮导入链
try:
    import folder_paths
except Exception:
    folder_paths = None

THIS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)

# 📦 三发行版兼容：禁止用 ..\.. 层级硬推 ComfyUI 根目录（桌面版程序与数据分离会失效）
# 解析优先级：custom_nodes 同级 models（秋叶/便携/桌面默认布局）→ folder_paths.models_dir → 插件自身目录内缓存（保底可写）
def _resolve_app_models_dir():
    sibling_models = os.path.join(CUSTOM_NODES_DIR, "..", "models")
    if os.path.isdir(sibling_models):
        return os.path.join(sibling_models, "app")
    if folder_paths is not None:
        try:
            models_dir = getattr(folder_paths, "models_dir", None)
            if models_dir and os.path.isdir(models_dir):
                return os.path.join(models_dir, "app")
        except Exception:
            pass
    return os.path.join(THIS_DIR, "缓存", "app")

# 缓存穿透防护：记录下载失败的 app_id，短期内不重试
_download_fail_cache = {}  # {app_id: timestamp}
_DOWNLOAD_FAIL_TTL = 30  # 失败缓存 30 秒
_WORKFLOW_MAX_BYTES = 256 * 1024 * 1024
_WORKFLOW_READ_CHUNK = 64 * 1024


def _is_local_request(request):
    """检查本机来源与浏览器 Origin，保护工作流下载接口免受跨站触发。"""
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
        parsed = urlsplit(origin)
        host = (parsed.hostname or "").lower().rstrip(".")
        is_loopback_origin = host == "localhost" or ipaddress.ip_address(host).is_loopback
        origin_port = parsed.port or (443 if parsed.scheme == "https" else 80)
        request_port = request.url.port or (443 if request.scheme == "https" else 80)
        return is_loopback_origin and parsed.scheme == request.scheme and origin_port == request_port
    except ValueError:
        return False


def _sanitize_app_id(app_id):
    """校验并规范化 app_id，防止路径穿越"""
    if not isinstance(app_id, str) or not re.fullmatch(r'[A-Za-z0-9_\-\.]{1,128}', app_id):
        return None
    # 🔒 P0安全加固：拒绝纯点号/含相对路径段的 ID，防止 ".." 逃逸出缓存目录
    if app_id in (".", "..") or ".." in app_id or app_id.startswith("."):
        return None
    return app_id


def _create_ssl_context():
    """携带JWT的工作流请求始终验证系统信任链和目标主机名。"""
    return ssl.create_default_context()


class _WorkflowNoRedirect(urllib.request.HTTPRedirectHandler):
    def http_error_302(self, req, fp, code, msg, headers):
        # 不读取重定向正文、不复制凭证或改变POST方法。
        try:
            fp.close()
        except Exception:
            pass
        raise urllib.error.HTTPError(req.full_url, code, "workflow proxy redirect refused", None, None)

    http_error_301 = http_error_303 = http_error_307 = http_error_308 = http_error_302


def _workflow_proxy_opener(context, proxy_api_url):
    if not isinstance(context, ssl.SSLContext) or not context.check_hostname or context.verify_mode != ssl.CERT_REQUIRED:
        raise ValueError("workflow proxy requires verified TLS")
    # 请求级opener，不受宿主install_opener影响；保留系统代理和CA信任配置。
    return urllib.request.build_opener(urllib.request.ProxyHandler(_proxy.system_proxies(proxy_api_url)),
                                      urllib.request.HTTPSHandler(context=context), _WorkflowNoRedirect())


def _validate_workflow_proxy_url(url):
    if not isinstance(url, str) or not url.isascii() or any(ord(char) <= 32 or ord(char) == 127 for char in url):
        raise ValueError("invalid workflow proxy endpoint")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        raise ValueError("invalid workflow proxy endpoint") from None
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.fragment or port not in (None, 443):
        raise ValueError("invalid workflow proxy endpoint")


def _parse_cloud_response(content, *, cancel_event=None):
    """解析云端代理响应内容，返回 (json_data, error_msg, error_code)
    
    工作流数据必须是 JSON 对象；错误码用于流式接口本地化展示
    调用方根据 error_msg 是否为 None 决定各自的错误响应方式
    """
    _check_workflow_cancel(cancel_event)
    try:
        json_data = json.loads(content, parse_constant=workflow_response._reject_constant,
                               parse_float=workflow_response._finite_float)
        _check_workflow_cancel(cancel_event)
        if not isinstance(json_data, dict):
            return None, "工作流数据必须是 JSON 对象", "invalid_workflow_data"
        if "error" in json_data:
            return None, "云端拒绝了工作流请求", "remote_rejected"
        workflow_response._validate_depth(json_data, cancel_event=cancel_event)
        return json_data, None, None
    except (ValueError, RecursionError, OverflowError) as e:
        _check_workflow_cancel(cancel_event)
        # 响应正文可能包含私有工作流、用户数据或临时签名链接，不写入 ComfyUI 日志。
        print(f"❌ JSON 解析失败：{type(e).__name__}")
        return None, "云端返回的数据格式错误，无法解析为 JSON", "invalid_workflow_data"

def _workflow_response_length(headers):
    lengths = _workflow_header_values(headers, 'Content-Length')
    transfers = _workflow_header_values(headers, 'Transfer-Encoding')
    if len(lengths) > 1 or (lengths and transfers):
        raise ValueError("ambiguous workflow response framing")
    if transfers and (len(transfers) != 1 or transfers[0].strip().lower() != 'chunked'):
        raise ValueError("unsupported workflow transfer encoding")
    value = lengths[0] if lengths else None
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{1,20}', value):
        raise ValueError("invalid workflow content length")
    length = int(value)
    if not 0 < length <= _WORKFLOW_MAX_BYTES:
        raise ValueError("workflow response exceeds byte budget")
    return length


def _workflow_header_values(headers, name):
    if hasattr(headers, 'get_all'):
        return headers.get_all(name) or []
    value = headers.get(name)
    return [] if value is None else [value]


class _WorkflowWorkerCancelled(RuntimeError):
    pass


def _check_workflow_cancel(cancel_event):
    if cancel_event is not None and cancel_event.is_set():
        raise _WorkflowWorkerCancelled("workflow worker cancelled")


async def _run_workflow_worker(function, *args):
    cancel_event = threading.Event()

    async def finish():
        try:
            return True, await asyncio.to_thread(function, *args, cancel_event=cancel_event)
        except Exception as error:
            if isinstance(error, urllib.error.HTTPError):
                # 取消可能使核心不再接到HTTPError，响应仍须在工作线程收回。
                try:
                    error.close()
                except Exception:
                    pass
            # 数据形式消费常规线程异常，避免被取消的shield打印异常正文。
            return False, error

    task = asyncio.create_task(finish())
    cancelled = None
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError as error:
            cancel_event.set()
            cancelled = error
    succeeded, result = task.result()
    if cancelled is not None:
        raise cancelled
    if not succeeded:
        raise result
    return result


async def _run_workflow_request(request, *args, **kwargs):
    task = asyncio.create_task(_download_app_core(*args, **kwargs))
    try:
        while not task.done():
            transport = request.transport
            if transport is None or transport.is_closing():
                raise asyncio.CancelledError()
            await asyncio.wait({task}, timeout=0.25)
        return task.result()
    except asyncio.CancelledError:
        task.cancel()
        # 路由离开前等待核心收回工作线程；重复取消不能丢失所属任务。
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                pass
            except Exception:
                break
        try:
            task.result()
        except (asyncio.CancelledError, Exception):
            pass
        raise


def _read_workflow_bounded(stream, expected_length=None, *, cancel_event=None):
    """有界读取网络或缓存的UTF-8正文；未完整读取不返回可保存数据。"""
    if expected_length is not None and (type(expected_length) is not int or not 0 < expected_length <= _WORKFLOW_MAX_BYTES):
        raise ValueError("invalid workflow expected length")
    _check_workflow_cancel(cancel_event)
    content = bytearray()
    while True:
        _check_workflow_cancel(cancel_event)
        chunk = stream.read(min(_WORKFLOW_READ_CHUNK, _WORKFLOW_MAX_BYTES - len(content) + 1))
        _check_workflow_cancel(cancel_event)
        if not chunk:
            break
        total = len(content) + len(chunk)
        if total > _WORKFLOW_MAX_BYTES:
            raise ValueError("workflow response exceeds byte budget")
        if expected_length is not None and total > expected_length:
            raise ValueError("workflow response length mismatch")
        content.extend(chunk)
    if expected_length is not None and len(content) != expected_length:
        raise ValueError("workflow response length mismatch")
    text = content.decode('utf-8')
    _check_workflow_cancel(cancel_event)
    return text


def _sync_download(proxy_api_url, payload, ssl_context, timeout=120, token="", *, cancel_event=None):
    """同步下载函数（在线程池中运行，避免阻塞事件循环）"""
    _check_workflow_cancel(cancel_event)
    _validate_workflow_proxy_url(proxy_api_url)
    opener = _workflow_proxy_opener(ssl_context, proxy_api_url)
    headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'}
    # 🔒 P0安全加固：转发用户 JWT，云端以 Authorization Token 为准鉴权
    req = urllib.request.Request(
        proxy_api_url, 
        data=payload, 
        headers=headers
    )
    if token:
        req.add_unredirected_header('Authorization', f"Bearer {token}")
    _check_workflow_cancel(cancel_event)
    with opener.open(req, timeout=timeout) as response:
        encodings = _workflow_header_values(response.headers, 'Content-Encoding')
        if len(encodings) > 1:
            raise ValueError("ambiguous workflow response encoding")
        encoding = (encodings[0] if encodings else 'identity').strip().lower()
        if encoding != 'identity':
            raise ValueError("unsupported workflow response encoding")
        length = _workflow_response_length(response.headers)
        return _read_workflow_bounded(response, length, cancel_event=cancel_event)

def _read_cache_sync(fp, *, cancel_event=None):
    _check_workflow_cancel(cancel_event)
    with open(fp, "rb") as f:
        return _read_workflow_bounded(f, cancel_event=cancel_event)


def _write_cache_sync(fp, text, *, cancel_event=None):
    """在同目录写临时文件并原子替换，避免中断写入破坏已有有效缓存。"""
    _check_workflow_cancel(cancel_event)
    tmp_path = f"{fp}.tmp.{uuid.uuid4().hex}"
    try:
        with open(tmp_path, "xb") as f:
            written = 0
            for offset in range(0, len(text), _WORKFLOW_READ_CHUNK):
                _check_workflow_cancel(cancel_event)
                chunk = text[offset:offset + _WORKFLOW_READ_CHUNK].encode('utf-8')
                written += len(chunk)
                if written > _WORKFLOW_MAX_BYTES:
                    raise ValueError("workflow cache byte budget")
                f.write(chunk)
            f.flush()
            os.fsync(f.fileno())
        _check_workflow_cancel(cancel_event)
        os.replace(tmp_path, fp)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass


async def _download_app_core(app_id, download_url, account, force_download=False, progress_callback=None, token="", response_format=None):
    """获取应用JSON：优先本地缓存，回退云端下载

    Args:
        app_id: 规范化后的应用 ID
        download_url: 云端下载链接
        account: 用户账号兼容字段，身份由 JWT 决定
        force_download: 是否强制重新下载（忽略缓存）
        progress_callback: 可选的异步回调，签名为 async def(stage, progress, message)
        token: 用户 JWT，转发给云端做 Authorization 鉴权

    返回: (json_data, error_msg, from_cache, error_code)
    - 成功时: (dict, None, bool, None)；HTTP 路由指定 response_format 时首项是终态响应 bytes
    - 失败时: (None, "错误描述", False, 稳定错误码)
    """
    try:
        # 📦 三发行版兼容：缓存目录解析失败时降级为不缓存（继续云端下载），不阻断功能
        app_models_dir = None
        try:
            app_models_dir = _resolve_app_models_dir()
            os.makedirs(app_models_dir, exist_ok=True)
        except Exception as e:
            print(f"⚠️ 应用缓存目录不可用，本次降级为不缓存: {type(e).__name__}")
            app_models_dir = None
        file_path = os.path.join(app_models_dir, f"{app_id}.json") if app_models_dir else None

        if progress_callback:
            await progress_callback("cache_check", 20, "检查本地缓存...")

        # 🚀 本地缓存优先：如果本地已有缓存且不强制重新下载，直接读取本地文件
        if file_path and os.path.exists(file_path) and not force_download:
            cache_invalid = False
            try:
                print(f"📦 发现本地缓存 [{app_id}]，优先从本地加载...")
                # 🔧 P1修复：文件读取移交线程，避免同步 IO 阻塞事件循环
                content = await _run_workflow_worker(_read_cache_sync, file_path)
                if response_format is None:
                    json_data, cache_error, _cache_error_code = await _run_workflow_worker(_parse_cloud_response, content)
                else:
                    json_data, cache_error, _cache_error_code = await workflow_response.get_service().prepare(
                        content, response_format, True, _run_workflow_worker)
                if cache_error is not None:
                    cache_invalid = True
                    raise ValueError(cache_error)
                print(f"✅ 本地缓存加载成功，大小：{len(content)} bytes")
                if progress_callback:
                    await progress_callback("cache_hit", 50, "命中本地缓存！")
                return (json_data, None, True, None)
            except (json.JSONDecodeError, IOError, ValueError) as e:
                print(f"⚠️ 本地缓存读取失败，回退到云端下载：{type(e).__name__}")
                # 进程配额/读取失败不能据此判定旧缓存损坏。
                if cache_invalid:
                    try:
                        os.remove(file_path)
                    except OSError:
                        pass

        if progress_callback:
            await progress_callback("downloading", 50, "从云端下载工作流...")

        # 缓存穿透防护：检查近期是否下载失败过（强制刷新时跳过，避免云端刚抖动导致 force 必然失败）
        if not force_download and app_id in _download_fail_cache:
            if time.time() - _download_fail_cache[app_id] < _DOWNLOAD_FAIL_TTL:
                return (None, "云端暂时不可达，请稍后重试", False, "cloud_cooldown")
            else:
                del _download_fail_cache[app_id]

        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_download"
        payload = json.dumps({
            "url": download_url,
            "item_id": app_id,
            "account": account
        }).encode("utf-8")

        ssl_context = _create_ssl_context()

        # 🚀 在线程池中执行同步下载，避免阻塞 aiohttp 事件循环
        print(f"🔍 开始下载应用 [{app_id}]")
        print("📍 请求云端工作流代理（地址和资源链接不写入日志）")
        print(f"⏳ 正在请求云端代理 (超时设置：120 秒)...")
        content = await _run_workflow_worker(_sync_download, proxy_api_url, payload, ssl_context, 120, token)
        print(f"✅ 云端响应成功，数据大小：{len(content)} bytes")

        if response_format is None:
            json_data, error_msg, parse_error_code = await _run_workflow_worker(_parse_cloud_response, content)
        else:
            json_data, error_msg, parse_error_code = await workflow_response.get_service().prepare(
                content, response_format, False, _run_workflow_worker)
        if error_msg is not None:
            return (None, error_msg, False, parse_error_code or "remote_rejected")

        if progress_callback:
            await progress_callback("saving", 80, "保存到本地缓存...")

        # 下载成功后保存到本地缓存
        try:
            if file_path:
                # 🔧 P1修复：缓存写入移交线程，避免同步 IO 阻塞事件循环
                await _run_workflow_worker(_write_cache_sync, file_path, content)
                print(f"💾 已缓存到本地：{file_path}")
        except IOError as e:
            print(f"⚠️ 本地缓存写入失败：{type(e).__name__}")

        return (json_data, None, False, None)

    except urllib.error.HTTPError as e:
        # 远端错误正文可能回显用户资源链接或内部诊断信息，不记录也不转发原文。
        print(f"❌ HTTP 错误 [{e.code}]")
        e.close()
        _download_fail_cache[app_id] = time.time()
        error_code = "auth_failed" if e.code in (401, 403) else "remote_rejected"
        return (None, f"云端代理请求失败（HTTP {e.code}）", False, error_code)
    except urllib.error.URLError as e:
        print(f"❌ 网络错误：{type(e).__name__}")
        _download_fail_cache[app_id] = time.time()
        return (None, "网络连接失败，请检查云端服务后重试", False, "network_failed")
    except Exception as e:
        # 避免异常字符串/traceback 把 Request URL、Authorization 相关数据写入日志。
        print(f"❌ 应用下载错误：{type(e).__name__}")
        _download_fail_cache[app_id] = time.time()
        return (None, "应用下载失败，请稍后重试", False, "download_failed")


async def _read_workflow_parameters(request):
    """在宿主 JSON 解析前限制控制请求，未知长度同样逐块核查。"""
    limit = workflow_response.CONTROL_MAX_BYTES
    if request.content_length is not None and request.content_length > limit:
        raise ValueError("workflow control byte budget")
    loop = asyncio.get_running_loop()
    deadline = loop.time() + workflow_response.CONTROL_TOTAL_SECONDS
    body = bytearray()
    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise TimeoutError("workflow control receive timeout")
        async with asyncio.timeout(min(workflow_response.CONTROL_IDLE_SECONDS, remaining)):
            chunk = await request.content.read(min(_WORKFLOW_READ_CHUNK, limit - len(body) + 1))
        if not chunk:
            break
        if len(body) + len(chunk) > limit:
            raise ValueError("workflow control byte budget")
        body.extend(chunk)
    data = json.loads(body.decode('utf-8'), parse_constant=workflow_response._reject_constant,
                      parse_float=workflow_response._finite_float)
    if isinstance(data, dict):
        workflow_response._validate_depth(data)
    return data


def _workflow_admission(*, stream):
    def decorate(handler):
        @wraps(handler)
        async def admitted(request):
            if not _is_local_request(request):
                return await handler(request)
            try:
                # 容量覆盖控制正文接收直至终态正文发送，不只限制解析进程。
                async with workflow_response.get_service().capacity(request):
                    return await handler(request)
            except workflow_response.CapacityError:
                if not stream:
                    resp = web.json_response({"error": "下载服务繁忙，请稍后重试"}, status=503)
                    resp.force_close()
                    return resp
                resp = web.StreamResponse(headers={'Content-Type': 'text/event-stream'})
                resp.force_close()
                await resp.prepare(request)
                event = {'stage': 'error', 'progress': -1, 'message': '下载服务繁忙，请稍后重试',
                         'status': 'error', 'error_code': 'download_failed'}
                await resp.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode('utf-8'))
                await resp.write_eof()
                return resp
        return admitted
    return decorate


@_workflow_admission(stream=False)
async def download_app_handler(request):
    """本地 API：处理应用(JSON)的下载与鉴权，支持本地缓存优先"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)
    try:
        data = await _read_workflow_parameters(request)
    except Exception:
        resp = web.json_response({"error": "Invalid JSON"}, status=400)
        resp.force_close()
        return resp
    if not isinstance(data, dict):
        return web.json_response({"error": "Invalid JSON"}, status=400)

    download_url = data.get("url")
    app_id = _sanitize_app_id(data.get("id", "default_app"))
    account = data.get("account")
    token = data.get("token", "")  # 用户 JWT 由云端鉴权；不把错误类型归一化成空字符串
    if token is None:
        token = ""
    force_download = data.get("force", False)

    if not _valid_workflow_parameters(download_url, account, token, force_download):
        return web.json_response({"error": "Invalid download parameters"}, status=400)

    if not download_url or not account:
        return web.json_response({"error": "缺少下载凭证或应用链接"}, status=400)
    if not app_id:
        return web.json_response({"error": "非法的应用 ID"}, status=400)

    body, error_msg, _from_cache, _error_code = await _run_workflow_request(
        request, app_id, download_url, account, force_download, token=token, response_format="json")
    if error_msg is not None:
        return web.json_response({"error": error_msg}, status=500)
    # 主进程不再反序列化工作流；容量覆盖正文交付，避免排队响应堆积。
    resp = web.StreamResponse(headers={'Content-Type': 'application/json; charset=utf-8',
                                      'Content-Length': str(len(body))})
    await resp.prepare(request)
    await _write_workflow_response(resp, body)
    await resp.write_eof()
    return resp


def _valid_workflow_parameters(download_url, account, token, force):
    # 限制小型控制请求；私有下载地址的网络边界仍由云端代理验证。
    return ((download_url is None or isinstance(download_url, str) and len(download_url) <= 8192)
            and (account is None or isinstance(account, str) and len(account) <= 256)
            and isinstance(token, str) and len(token) <= 16384
            and type(force) is bool)


async def _write_workflow_response(response, body):
    view = memoryview(body)
    loop = asyncio.get_running_loop()
    deadline = loop.time() + workflow_response.WRITE_TOTAL_SECONDS
    for offset in range(0, len(view), _WORKFLOW_READ_CHUNK):
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise TimeoutError("workflow response delivery timeout")
        async with asyncio.timeout(min(workflow_response.WRITE_IDLE_SECONDS, remaining)):
            await response.write(view[offset:offset + _WORKFLOW_READ_CHUNK])


@_workflow_admission(stream=True)
async def download_app_stream_handler(request):
    """SSE 流式接口：处理应用(JSON)的下载与鉴权，支持本地缓存优先，实时推送进度"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)

    try:
        data = await _read_workflow_parameters(request)
    except Exception:
        data = None
    if not isinstance(data, dict):
        # Validation failures are represented by the SSE terminal event so the client can
        # display the stable error_code instead of treating the response as an unknown disconnect.
        resp = web.StreamResponse(status=200, headers={'Content-Type': 'text/event-stream'})
        resp.force_close()
        await resp.prepare(request)
        await resp.write(f"data: {json.dumps({'stage': 'error', 'progress': -1, 'message': 'Invalid JSON', 'status': 'error', 'error_code': 'invalid_request'}, ensure_ascii=False)}\n\n".encode('utf-8'))
        await resp.write_eof()
        return resp
    download_url = data.get("url")
    app_id = _sanitize_app_id(data.get("id", "default_app"))
    account = data.get("account")
    token = data.get("token", "")
    if token is None:
        token = ""
    force_download = data.get("force", False)

    resp = web.StreamResponse(status=200, headers={
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    })
    await resp.prepare(request)

    async def send_progress(stage, progress, message, status=None, extra=None):
        event = {"stage": stage, "progress": progress, "message": message}
        if status:
            event["status"] = status
        if extra:
            event.update(extra)
        await resp.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode('utf-8'))

    # 参数校验
    if not _valid_workflow_parameters(download_url, account, token, force_download):
        await send_progress("error", -1, "Invalid download parameters", "error", extra={"error_code": "invalid_request"})
        await resp.write_eof()
        return resp
    if not download_url or not account:
        await send_progress("error", -1, "缺少下载凭证或应用链接", "error", extra={"error_code": "missing_params"})
        await resp.write_eof()
        return resp
    if not app_id:
        await send_progress("error", -1, "非法的应用 ID", "error", extra={"error_code": "invalid_app_id"})
        await resp.write_eof()
        return resp

    await send_progress("validate", 10, "校验请求参数...")

    # 核心函数的 progress_callback（只传 stage, progress, message 三个参数）
    async def progress_cb(stage, progress, message):
        await send_progress(stage, progress, message)

    body, error_msg, _from_cache, error_code = await _run_workflow_request(
        request, app_id, download_url, account, force_download,
        progress_callback=progress_cb, token=token, response_format="sse")
    if error_msg is not None:
        await send_progress("error", -1, error_msg, "error", extra={"error_code": error_code or "download_failed"})
    else:
        await _write_workflow_response(resp, body)
    await resp.write_eof()
    return resp
