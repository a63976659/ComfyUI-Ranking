# api_app.py
import os
import re
import ssl
import json
import time
import asyncio
import urllib.request
import urllib.error
import traceback
from aiohttp import web

# 📦 三发行版兼容：folder_paths 仅存在于 ComfyUI 运行时，try 化防止脱离宿主时拖垮导入链
try:
    import folder_paths
except Exception:
    folder_paths = None

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
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


def _is_local_request(request):
    """检查请求是否来自本机，保护敏感安装接口"""
    remote = request.remote or ""
    if remote in ("127.0.0.1", "localhost", "::1"):
        return True
    return False


def _sanitize_app_id(app_id):
    """校验并规范化 app_id，防止路径穿越"""
    if not app_id or not re.fullmatch(r'[A-Za-z0-9_\-\.]{1,128}', app_id):
        return None
    # 🔒 P0安全加固：拒绝纯点号/含相对路径段的 ID，防止 ".." 逃逸出缓存目录
    if app_id in (".", "..") or ".." in app_id or app_id.startswith("."):
        return None
    return app_id


def _create_ssl_context():
    """创建 SSL 上下文，根据环境变量决定是否关闭证书验证"""
    ssl_context = ssl.create_default_context()
    if os.environ.get("DISABLE_SSL_VERIFY", "").lower() in ("1", "true"):
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        print("⚠️ SSL证书验证已关闭，请仅在调试环境使用")
    return ssl_context


def _parse_cloud_response(content):
    """解析云端代理响应内容，返回 (json_data, error_msg)
    
    json_data: 解析成功的 JSON 数据（无错误时）；error_msg: 错误信息（有错误时）
    调用方根据 error_msg 是否为 None 决定各自的错误响应方式
    """
    try:
        json_data = json.loads(content)
        if isinstance(json_data, dict) and "error" in json_data:
            return None, json_data["error"]
        return json_data, None
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失败：{str(e)}")
        print(f"原始内容前 200 字符：{content[:200]}")
        return None, "云端返回的数据格式错误，无法解析为 JSON"

def _sync_download(proxy_api_url, payload, ssl_context, timeout=120, token=""):
    """同步下载函数（在线程池中运行，避免阻塞事件循环）"""
    headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    # 🔒 P0安全加固：转发用户 JWT，云端以 Authorization Token 为准鉴权
    if token:
        headers['Authorization'] = f"Bearer {token}"
    req = urllib.request.Request(
        proxy_api_url, 
        data=payload, 
        headers=headers
    )
    with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as response:
        return response.read().decode('utf-8')

def _read_cache_sync(fp):
    with open(fp, "r", encoding="utf-8") as f:
        return f.read()


def _write_cache_sync(fp, text):
    with open(fp, "w", encoding="utf-8") as f:
        f.write(text)


async def _download_app_core(app_id, download_url, account, force_download=False, progress_callback=None, token=""):
    """获取应用JSON：优先本地缓存，回退云端下载

    Args:
        app_id: 规范化后的应用 ID
        download_url: 云端下载链接
        account: 用户账号（鉴权凭证）
        force_download: 是否强制重新下载（忽略缓存）
        progress_callback: 可选的异步回调，签名为 async def(stage, progress, message)
        token: 用户 JWT，转发给云端做 Authorization 鉴权

    返回: (json_data, error_msg, from_cache)
    - 成功时: (dict, None, bool)
    - 失败时: (None, "错误描述", False)
    """
    try:
        # 📦 三发行版兼容：缓存目录解析失败时降级为不缓存（继续云端下载），不阻断功能
        app_models_dir = None
        try:
            app_models_dir = _resolve_app_models_dir()
            os.makedirs(app_models_dir, exist_ok=True)
        except Exception as e:
            print(f"⚠️ 应用缓存目录不可用，本次降级为不缓存: {e}")
            app_models_dir = None
        file_path = os.path.join(app_models_dir, f"{app_id}.json") if app_models_dir else None

        if progress_callback:
            await progress_callback("cache_check", 20, "检查本地缓存...")

        # 🚀 本地缓存优先：如果本地已有缓存且不强制重新下载，直接读取本地文件
        if file_path and os.path.exists(file_path) and not force_download:
            try:
                print(f"📦 发现本地缓存 [{app_id}]，优先从本地加载...")
                # 🔧 P1修复：文件读取移交线程，避免同步 IO 阻塞事件循环
                content = await asyncio.to_thread(_read_cache_sync, file_path)
                json_data = json.loads(content)
                print(f"✅ 本地缓存加载成功，大小：{len(content)} bytes")
                if progress_callback:
                    await progress_callback("cache_hit", 50, "命中本地缓存！")
                return (json_data, None, True)
            except (json.JSONDecodeError, IOError) as e:
                print(f"⚠️ 本地缓存读取失败，回退到云端下载：{str(e)}")
                try:
                    os.remove(file_path)
                except:
                    pass

        if progress_callback:
            await progress_callback("downloading", 50, "从云端下载工作流...")

        # 缓存穿透防护：检查近期是否下载失败过（强制刷新时跳过，避免云端刚抖动导致 force 必然失败）
        if not force_download and app_id in _download_fail_cache:
            if time.time() - _download_fail_cache[app_id] < _DOWNLOAD_FAIL_TTL:
                return (None, "云端暂时不可达，请稍后重试", False)
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
        print(f"📍 代理地址：{proxy_api_url}")
        print(f"🔗 下载链接：{download_url[:50]}...")
        print(f"⏳ 正在请求云端代理 (超时设置：120 秒)...")
        loop = asyncio.get_running_loop()
        content = await loop.run_in_executor(None, _sync_download, proxy_api_url, payload, ssl_context, 120, token)
        print(f"✅ 云端响应成功，数据大小：{len(content)} bytes")

        json_data, error_msg = _parse_cloud_response(content)
        if error_msg:
            return (None, error_msg, False)

        if progress_callback:
            await progress_callback("saving", 80, "保存到本地缓存...")

        # 下载成功后保存到本地缓存
        try:
            if file_path:
                # 🔧 P1修复：缓存写入移交线程，避免同步 IO 阻塞事件循环
                await asyncio.to_thread(_write_cache_sync, file_path, content)
                print(f"💾 已缓存到本地：{file_path}")
        except IOError as e:
            print(f"⚠️ 本地缓存写入失败：{str(e)}")

        return (json_data, None, False)

    except urllib.error.HTTPError as e:
        try:
            err_msg = e.read().decode('utf-8', errors='ignore')[:500]
        except Exception:
            err_msg = str(e)
        print(f"❌ HTTP 错误 [{e.code}]: {err_msg}")
        _download_fail_cache[app_id] = time.time()
        return (None, f"云端代理错误({e.code})：{err_msg[:200]}", False)
    except urllib.error.URLError as e:
        print(f"❌ 网络错误：{str(e)}")
        _download_fail_cache[app_id] = time.time()
        return (None, f"网络连接失败：{str(e)}", False)
    except Exception as e:
        print(f"❌ 应用下载错误：{type(e).__name__}: {str(e)}")
        print(traceback.format_exc())
        _download_fail_cache[app_id] = time.time()
        return (None, f"{type(e).__name__}: {str(e)}", False)


async def download_app_handler(request):
    """本地 API：处理应用(JSON)的下载与鉴权，支持本地缓存优先"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    download_url = data.get("url")
    app_id = _sanitize_app_id(data.get("id", "default_app"))
    account = data.get("account")
    token = data.get("token") or ""  # 🔒 P0安全加固：用户 JWT，转发给云端鉴权
    force_download = data.get("force", False)

    if not download_url or not account:
        return web.json_response({"error": "缺少下载凭证或应用链接"}, status=400)
    if not app_id:
        return web.json_response({"error": "非法的应用 ID"}, status=400)

    json_data, error_msg, from_cache = await _download_app_core(app_id, download_url, account, force_download, token=token)
    if error_msg:
        return web.json_response({"error": error_msg}, status=500)
    return web.json_response({"status": "success", "data": json_data, "from_cache": from_cache})


async def download_app_stream_handler(request):
    """SSE 流式接口：处理应用(JSON)的下载与鉴权，支持本地缓存优先，实时推送进度"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)

    try:
        data = await request.json()
    except Exception:
        data = None
    if not isinstance(data, dict):
        resp = web.StreamResponse(status=400, headers={'Content-Type': 'text/event-stream'})
        await resp.prepare(request)
        await resp.write(f"data: {json.dumps({'stage': 'error', 'progress': -1, 'message': 'Invalid JSON', 'status': 'error'}, ensure_ascii=False)}\n\n".encode('utf-8'))
        await resp.write_eof()
        return resp
    download_url = data.get("url")
    app_id = _sanitize_app_id(data.get("id", "default_app"))
    account = data.get("account")
    token = data.get("token") or ""  # 🔒 P0安全加固：用户 JWT，转发给云端鉴权
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
    if not download_url or not account:
        await send_progress("error", -1, "缺少下载凭证或应用链接", "error")
        await resp.write_eof()
        return resp
    if not app_id:
        await send_progress("error", -1, "非法的应用 ID", "error")
        await resp.write_eof()
        return resp

    await send_progress("validate", 10, "校验请求参数...")

    # 核心函数的 progress_callback（只传 stage, progress, message 三个参数）
    async def progress_cb(stage, progress, message):
        await send_progress(stage, progress, message)

    json_data, error_msg, from_cache = await _download_app_core(app_id, download_url, account, force_download, progress_callback=progress_cb, token=token)

    if error_msg:
        await send_progress("error", -1, error_msg, "error")
    else:
        await send_progress("complete", 100, "✅ 加载完成！" if from_cache else "✅ 下载完成！", "success", extra={"data": json_data})

    await resp.write_eof()
    return resp