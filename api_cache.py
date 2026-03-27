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
# 确保存放在 ComfyUI/models/cache/images
CACHE_ROOT_DIR = os.path.join(COMFY_ROOT_DIR, "models", "cache")
IMAGE_CACHE_DIR = os.path.join(CACHE_ROOT_DIR, "images")

os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)

async def cache_image_handler(request):
    """本地 API：异步拦截图片请求，防阻塞实现硬盘级永久缓存"""
    url = request.query.get("url")
    if not url:
        return web.Response(status=400, text="Missing url")

    # 🟢 终极防污染保险：解套被污染的嵌套 URL
    while url.startswith('/community_hub/image?url='):
        url = urllib.parse.unquote(url.replace('/community_hub/image?url=', ''))

    # 🚀 核心配合：拦截旧版因 Private 导致 401 的 HF 直链，强行重写为云端代理！
    if url.startswith("https://huggingface.co/datasets/ZHIWEI666/ComfyUI-Ranking/resolve/main/"):
        url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/image_proxy?url=" + urllib.parse.quote(url)

    if not url.startswith('http'):
        raise web.HTTPFound(location=url)

    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    ext = url.split('.')[-1].split('?')[0]
    if len(ext) > 4 or not ext.isalnum(): 
        ext = "jpg" 
        
    local_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.{ext}")

    # 如果硬盘里有，直接 0 延迟返回
    if os.path.exists(local_path):
        content_type, _ = mimetypes.guess_type(local_path)
        return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})

    # 如果没有，则使用 aiohttp 异步拉取
    try:
        async with aiohttp.ClientSession() as session:
            # 伪装 User-Agent 防止被拦截
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            # 加入 ssl=False 彻底解决 ComfyUI 整合包证书报错问题
            async with session.get(url, headers=headers, ssl=False, timeout=15) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(local_path, "wb") as f:
                        f.write(content)
                    
                    print(f"[ComfyUI-Ranking] ✅ 成功下载并缓存图片: {url_hash}.{ext}")
                    
                    content_type, _ = mimetypes.guess_type(local_path)
                    return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})
                else:
                    print(f"[ComfyUI-Ranking] ⚠️ 图片下载失败 (状态码: {response.status})，退回直连: {url}")
                    raise web.HTTPFound(location=url)
    except web.HTTPFound:
        # 如果是主动抛出的重定向，直接向上抛出，不再被当做真实错误打印
        raise
    except Exception as e:
        # 捕获真实错误并在控制台打印
        print(f"[ComfyUI-Ranking] 🚨 缓存拉取异常: {str(e)} -> 已降级为云端代理直连")
        raise web.HTTPFound(location=url)