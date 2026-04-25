# api_cache.py
import os
import hashlib
import asyncio
import uuid
import aiohttp
import mimetypes
import urllib.parse
from aiohttp import web

# 视频下载锁字典（按 URL hash 粒度加锁）
_video_download_locks = {}
_video_locks_lock = asyncio.Lock()

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


async def _get_video_lock(url_hash):
    async with _video_locks_lock:
        if url_hash not in _video_download_locks:
            _video_download_locks[url_hash] = asyncio.Lock()
        return _video_download_locks[url_hash]

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)
COMFY_ROOT_DIR = os.path.dirname(CUSTOM_NODES_DIR)
# 确保存放在 ComfyUI/models/cache/images
CACHE_ROOT_DIR = os.path.join(COMFY_ROOT_DIR, "models", "cache")
IMAGE_CACHE_DIR = os.path.join(CACHE_ROOT_DIR, "images")
# 视频缓存目录（与图片分离）
VIDEO_CACHE_DIR = os.path.join(CACHE_ROOT_DIR, "videos")

os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)
os.makedirs(VIDEO_CACHE_DIR, exist_ok=True)

# 视频缓存限制
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB
VIDEO_TIMEOUT = aiohttp.ClientTimeout(total=300)

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
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
            if start >= file_size or start < 0 or end >= file_size or end < start:
                return web.Response(status=416, text="Range Not Satisfiable")
        except (ValueError, IndexError):
            start = 0
            end = file_size - 1

        resp = web.StreamResponse(status=206, headers={
            'Content-Type': content_type,
            'Accept-Ranges': 'bytes',
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Content-Length': str(end - start + 1),
        })
        await resp.prepare(request)
        with open(file_path, 'rb') as f:
            f.seek(start)
            remaining = end - start + 1
            chunk_size = 256 * 1024
            while remaining > 0:
                to_read = min(chunk_size, remaining)
                data = f.read(to_read)
                if not data:
                    break
                await resp.write(data)
                remaining -= len(data)
        await resp.write_eof()
        return resp
    else:
        resp = web.StreamResponse(status=200, headers={
            'Content-Type': content_type,
            'Accept-Ranges': 'bytes',
            'Content-Length': str(file_size),
        })
        await resp.prepare(request)
        with open(file_path, 'rb') as f:
            while True:
                data = f.read(256 * 1024)
                if not data:
                    break
                await resp.write(data)
        await resp.write_eof()
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

    # 🟢 终极防污染保险：解套被污染的嵌套 URL
    while url.startswith('/community_hub/video?url='):
        url = urllib.parse.unquote(url.replace('/community_hub/video?url=', ''))

    if not url.startswith('http'):
        raise web.HTTPFound(location=url)

    # 生成缓存路径
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    # 根据 URL 后缀确定扩展名，限制为常见视频格式
    ext = url.split('.')[-1].split('?')[0].lower()
    valid_exts = {'mp4', 'webm', 'mov', 'avi', 'mkv'}
    if ext not in valid_exts:
        ext = 'mp4'

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
                            return web.Response(status=response.status, text=f"Video download failed: HTTP {response.status}")

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
                            async for chunk in response.content.iter_chunked(256 * 1024):
                                await stream_resp.write(chunk)
                            await stream_resp.write_eof()
                            return stream_resp

                        # 🚀 Tee 流式缓存：边下载边转发给客户端，同时写入本地缓存
                        os.makedirs(VIDEO_CACHE_DIR, exist_ok=True)
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

                        try:
                            with open(tmp_path, 'wb') as f:
                                async for chunk in response.content.iter_chunked(256 * 1024):
                                    f.write(chunk)                # 写入本地缓存
                                    await resp.write(chunk)       # 同时转发给客户端
                                    downloaded_size += len(chunk)

                            # 下载完成，校验文件大小
                            if expected_size and downloaded_size == expected_size:
                                os.replace(tmp_path, local_path)  # 原子重命名
                                print(f"[ComfyUI-Ranking] ✅ 成功下载并缓存视频: {url_hash}.{ext}")
                            elif not expected_size and downloaded_size > 0:
                                os.replace(tmp_path, local_path)  # 无Content-Length但有数据，也保存
                                print(f"[ComfyUI-Ranking] ✅ 成功下载并缓存视频: {url_hash}.{ext}")
                            else:
                                # 大小不一致或没有数据，删除不完整文件
                                if os.path.exists(tmp_path):
                                    os.remove(tmp_path)

                        except Exception as e:
                            # 下载或转发过程中出错，清理临时文件
                            if os.path.exists(tmp_path):
                                try:
                                    os.remove(tmp_path)
                                except:
                                    pass
                            print(f"[ComfyUI-Ranking] ⚠️ 视频下载失败: {url[:80]}... 错误: {str(e)}")
                            # 注意：此时客户端已收到部分数据，无法再发送错误响应
                            # 浏览器会处理不完整的流（显示加载失败或自动重试）

                        finally:
                            try:
                                await resp.write_eof()
                            except Exception:
                                pass  # 客户端已断开，忽略

                        return resp
            except Exception as e:
                print(f"[ComfyUI-Ranking] ⚠️ 视频下载失败: {url[:80]}... 错误: {str(e)}")
                # 如果存在 0 字节的损坏缓存文件，清理掉以便下次重试
                if os.path.exists(local_path) and os.path.getsize(local_path) == 0:
                    try:
                        os.remove(local_path)
                        print(f"[ComfyUI-Ranking] 🧹 已清理空缓存文件: {url_hash}.{ext}")
                    except:
                        pass
                return web.Response(status=504, text="Video download failed: Network error")
    finally:
        # 🔒 锁释放后清理：如果没有其他等待者，删除锁对象防止内存泄漏
        if not lock._waiters:
            async with _video_locks_lock:
                if url_hash in _video_download_locks and _video_download_locks[url_hash] is lock and not lock._waiters:
                    del _video_download_locks[url_hash]


async def cache_stats_handler(request):
    """GET /community_hub/cache/stats - 返回图片和视频缓存统计"""
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
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400, text="Invalid JSON body")

    target = body.get("target")
    if target not in ("all", "images", "videos"):
        return web.Response(status=400, text="Invalid target. Must be 'all', 'images', or 'videos'")

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
                        # 跳过临时文件：.tmp. 开头或包含 .tmp.
                        if name.startswith(".tmp.") or ".tmp." in name:
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