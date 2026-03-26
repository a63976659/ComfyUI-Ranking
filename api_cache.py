# api_cache.py
import os
import hashlib
import aiohttp
import mimetypes
import urllib.parse
from aiohttp import web

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)
COMFY_ROOT_DIR = os.path.dirname(CUSTOM_NODES_DIR)
CACHE_ROOT_DIR = os.path.join(COMFY_ROOT_DIR, "models", "cache")
IMAGE_CACHE_DIR = os.path.join(CACHE_ROOT_DIR, "images")

os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)

async def cache_image_handler(request):
    """本地 API：异步拦截图片请求，防阻塞实现硬盘级永久缓存"""
    url = request.query.get("url")
    if not url:
        return web.Response(status=400, text="Missing url")

    # 🟢 终极防污染保险：如果在某些极端情况下传来了嵌套 URL，强制解套
    while url.startswith('/community_hub/image?url='):
        url = urllib.parse.unquote(url.replace('/community_hub/image?url=', ''))

    if not url.startswith('http'):
        raise web.HTTPFound(location=url)

    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    ext = url.split('.')[-1].split('?')[0]
    if len(ext) > 4 or not ext.isalnum(): 
        ext = "jpg" 
        
    local_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.{ext}")

    # 如果硬盘里有，补全正确的 Content-Type 返回 (防止前端渲染成乱码文本)
    if os.path.exists(local_path):
        content_type, _ = mimetypes.guess_type(local_path)
        return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})

    # 如果没有，则使用 aiohttp 异步拉取 (绝对不阻塞 ComfyUI 主线程)
    try:
        async with aiohttp.ClientSession() as session:
            # 伪装 User-Agent 防止部分 CDN 拦截
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            async with session.get(url, headers=headers, timeout=15) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(local_path, "wb") as f:
                        f.write(content)
                    content_type, _ = mimetypes.guess_type(local_path)
                    return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})
                else:
                    # 获取失败直接让浏览器重定向自己想办法
                    raise web.HTTPFound(location=url)
    except Exception as e:
        print(f"[ComfyUI-Ranking] 缓存图片下载失败，退回云端直连: {str(e)}")
        raise web.HTTPFound(location=url)