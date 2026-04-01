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
    """本地 API：异步拦截图片请求，防阻塞实现硬盘级永久缓存
    
    核心原则：本地缓存文件永远优先，网络下载是 fallback
    """
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

    # 生成缓存路径
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    # 根据URL后缀确定扩展名，默认jpg
    ext = url.split('.')[-1].split('?')[0]
    if len(ext) > 4 or not ext.isalnum(): 
        ext = "jpg" 
        
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
                    content = await response.read()
                    # 确保缓存目录存在
                    os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)
                    with open(local_path, "wb") as f:
                        f.write(content)
                    
                    print(f"[ComfyUI-Ranking] ✅ 成功下载并缓存图片: {url_hash}.{ext}")
                    
                    content_type, _ = mimetypes.guess_type(local_path)
                    return web.FileResponse(local_path, headers={'Content-Type': content_type or 'image/jpeg'})
                else:
                    # 网络请求失败，返回对应状态码
                    print(f"[ComfyUI-Ranking] ⚠️ 图片下载失败 (状态码: {response.status}): {url[:80]}...")
                    return web.Response(status=response.status, text=f"Image download failed: HTTP {response.status}")
    except Exception as e:
        # 网络异常（超时、无网络等）优雅处理
        print(f"[ComfyUI-Ranking] ⚠️ 图片下载失败: {url[:80]}... 错误: {str(e)}")
        # 如果存在0字节的损坏缓存文件，清理掉以便下次重试
        if os.path.exists(local_path) and os.path.getsize(local_path) == 0:
            try:
                os.remove(local_path)
                print(f"[ComfyUI-Ranking] 🧹 已清理空缓存文件: {url_hash}.{ext}")
            except:
                pass
        return web.Response(status=504, text="Image download failed: Network error")