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

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)
COMFY_ROOT_DIR = os.path.dirname(CUSTOM_NODES_DIR)
APP_MODELS_DIR = os.path.join(COMFY_ROOT_DIR, "models", "app")

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

def _sync_download(proxy_api_url, payload, ssl_context, timeout=120):
    """同步下载函数（在线程池中运行，避免阻塞事件循环）"""
    req = urllib.request.Request(
        proxy_api_url, 
        data=payload, 
        headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as response:
        return response.read().decode('utf-8')

async def _download_app_core(app_id, download_url, account, force_download=False, progress_callback=None):
    """获取应用JSON：优先本地缓存，回退云端下载

    Args:
        app_id: 规范化后的应用 ID
        download_url: 云端下载链接
        account: 用户账号（鉴权凭证）
        force_download: 是否强制重新下载（忽略缓存）
        progress_callback: 可选的异步回调，签名为 async def(stage, progress, message)

    返回: (json_data, error_msg, from_cache)
    - 成功时: (dict, None, bool)
    - 失败时: (None, "错误描述", False)
    """
    try:
        file_path = os.path.join(APP_MODELS_DIR, f"{app_id}.json")
        os.makedirs(APP_MODELS_DIR, exist_ok=True)

        if progress_callback:
            await progress_callback("cache_check", 20, "检查本地缓存...")

        # 🚀 本地缓存优先：如果本地已有缓存且不强制重新下载，直接读取本地文件
        if os.path.exists(file_path) and not force_download:
            try:
                print(f"📦 发现本地缓存 [{app_id}]，优先从本地加载...")
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
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

        # 缓存穿透防护：检查近期是否下载失败过
        if app_id in _download_fail_cache:
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
        loop = asyncio.get_event_loop()
        content = await loop.run_in_executor(None, _sync_download, proxy_api_url, payload, ssl_context, 120)
        print(f"✅ 云端响应成功，数据大小：{len(content)} bytes")

        json_data, error_msg = _parse_cloud_response(content)
        if error_msg:
            return (None, error_msg, False)

        if progress_callback:
            await progress_callback("saving", 80, "保存到本地缓存...")

        # 下载成功后保存到本地缓存
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
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
    except (TimeoutError, Exception) as e:
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
    force_download = data.get("force", False)

    if not download_url or not account:
        return web.json_response({"error": "缺少下载凭证或应用链接"}, status=400)
    if not app_id:
        return web.json_response({"error": "非法的应用 ID"}, status=400)

    json_data, error_msg, from_cache = await _download_app_core(app_id, download_url, account, force_download)
    if error_msg:
        return web.json_response({"error": error_msg}, status=500)
    return web.json_response({"status": "success", "data": json_data, "from_cache": from_cache})


async def download_app_stream_handler(request):
    """SSE 流式接口：处理应用(JSON)的下载与鉴权，支持本地缓存优先，实时推送进度"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)

    data = await request.json()
    download_url = data.get("url")
    app_id = _sanitize_app_id(data.get("id", "default_app"))
    account = data.get("account")
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

    json_data, error_msg, from_cache = await _download_app_core(app_id, download_url, account, force_download, progress_callback=progress_cb)

    if error_msg:
        await send_progress("error", -1, error_msg, "error")
    else:
        await send_progress("complete", 100, "✅ 加载完成！" if from_cache else "✅ 下载完成！", "success", extra={"data": json_data})

    await resp.write_eof()
    return resp