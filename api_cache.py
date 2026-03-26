# api_cache.py
import os
import hashlib
import aiohttp
import mimetypes
import urllib.parse
import asyncio  
from aiohttp import web

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)
COMFY_ROOT_DIR = os.path.dirname(CUSTOM_NODES_DIR)

CACHE_ROOT_DIR = os.path.join(COMFY_ROOT_DIR, "models", "cache")
IMAGE_CACHE_DIR = os.path.join(CACHE_ROOT_DIR, "images")
JSON_CACHE_DIR = os.path.join(CACHE_ROOT_DIR, "jsons") 

os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)
os.makedirs(JSON_CACHE_DIR, exist_ok=True)

async def cache_image_handler(request):
    url = request.query.get("url")
    if not url: return web.Response(status=400, text="Missing url")
    while url.startswith('/community_hub/image?url='):
        url = urllib.parse.unquote(url.replace('/community_hub/image?url=', ''))
    if url.startswith("https://huggingface.co/datasets/ZHIWEI666/ComfyUI-Ranking/resolve/main/"):
        url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/image_proxy?url=" + urllib.parse.quote(url)
    if not url.startswith('http'): raise web.HTTPFound(location=url)

    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    ext = url.split('.')[-1].split('?')[0]
    if len(ext) > 4 or not ext.isalnum(): ext = "jpg" 
    local_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.{ext}")

    if os.path.exists(local_path):
        content_type, _ = mimetypes.guess_type(local_path)
        return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})

    try:
        async with aiohttp.ClientSession() as session:
            headers = {'User-Agent': 'Mozilla/5.0'}
            async with session.get(url, headers=headers, ssl=False, timeout=15) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(local_path, "wb") as f: f.write(content)
                    content_type, _ = mimetypes.guess_type(local_path)
                    return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})
                else:
                    raise web.HTTPFound(location=url)
    except web.HTTPFound: raise
    except Exception as e: raise web.HTTPFound(location=url)

# =========================================
# 2. 榜单数据 SWR (过期验证) 缓存引擎
# =========================================
async def api_proxy_handler(request):
    endpoint = request.query.get("endpoint")
    if not endpoint: return web.Response(status=400, text="Missing endpoint")

    cloud_url = f"https://zhiwei666-comfyui-ranking-api.hf.space{endpoint}"
    safe_filename = "".join([c if c.isalnum() else "_" for c in endpoint])
    local_path = os.path.join(JSON_CACHE_DIR, f"{safe_filename}.json")

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    if "Authorization" in request.headers:
        headers["Authorization"] = request.headers["Authorization"]

    async def background_fetch_and_save():
        """后台静默拉取云端最新数据并覆写本地文件"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(cloud_url, headers=headers, ssl=False, timeout=15) as response:
                    if response.status == 200:
                        content = await response.read()
                        with open(local_path, "wb") as f:
                            f.write(content)
                        print(f"[ComfyUI-Ranking] 🔄 SWR静默同步成功: {safe_filename}.json")
                    else:
                        print(f"[ComfyUI-Ranking] ⚠️ SWR同步失败: 云端返回状态码 {response.status}")
        except Exception as e:
            print(f"[ComfyUI-Ranking] 🚨 SWR同步发生异常: {str(e)}")

    print(f"[ComfyUI-Ranking] 🔍 收到前端路由代理请求: {endpoint}")

    # 🚀 核心 SWR 逻辑：如果本地有文件，立刻 0 延迟返回，同时开启后台线程去云端同步！
    if os.path.exists(local_path):
        print(f"[ComfyUI-Ranking] ⚡ 命中本地缓存，瞬间返回，并触发后台静默更新...")
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(background_fetch_and_save())
        except Exception:
            asyncio.ensure_future(background_fetch_and_save())
        return web.FileResponse(local_path, headers={'Content-Type': 'application/json'})

    # 首次访问，本地无文件，同步等待
    print(f"[ComfyUI-Ranking] ⏳ 本地无缓存，正在首次拉取云端 JSON...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(cloud_url, headers=headers, ssl=False, timeout=15) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(local_path, "wb") as f:
                        f.write(content)
                    print(f"[ComfyUI-Ranking] ✅ 首次拉取并保存成功: {safe_filename}.json")
                    return web.Response(body=content, content_type='application/json')
                else:
                    print(f"[ComfyUI-Ranking] ❌ 首次拉取失败: HTTP {response.status}")
                    return web.Response(status=response.status, text=await response.text())
    except Exception as e:
        print(f"[ComfyUI-Ranking] 🚨 网络崩溃: {str(e)}")
        return web.json_response({"error": f"请求云端榜单失败: {str(e)}"}, status=500)