# api_tool.py
import os
import json
import zipfile
import io
import urllib.request
import urllib.error
import http.client
import subprocess
import shutil
import asyncio
import tempfile
import time
import contextlib
from aiohttp import web

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)

async def install_tool_handler(request):
    """本地 API：通过 Git Clone 下载插件，使用浅克隆（--depth 1）加速大仓库安装，保留 .git 文件夹以便后续无缝更新"""
    data = await request.json()
    item_url = data.get("url")
    item_id = data.get("id")
    account = data.get("account") # 用户身份凭证
    
    if not item_url or not account: 
        return web.json_response({"error": "缺少下载凭证或链接"}, status=400)
    
    # 校验 URL 是否为有效的 Git 仓库地址
    valid_git_hosts = ["github.com", "gitlab.com", "gitee.com", "bitbucket.org", "kkgithub.com"]
    if not any(host in item_url for host in valid_git_hosts):
        return web.json_response({"error": "该资源链接不是有效的 Git 仓库地址，无法自动安装。请前往资源原始页面手动下载。"}, status=400)
        
    target_dir_name = item_url.rstrip("/").split("/")[-1].replace(".git", "")
    clone_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)
    
    # 清理残留机制。如果文件夹已存在，说明可能是旧的无 .git 残缺安装，直接移除
    if os.path.exists(clone_target_path):
        try:
            shutil.rmtree(clone_target_path)
        except Exception as e:
            return web.json_response({"error": f"目录 {target_dir_name} 已存在且被占用，无法自动清理，请先手动删除。错误: {str(e)}"}, status=400)
        
    try:
        # 🚀 核心升级：双链路容灾机制
        # 链路 A：使用目前最稳定的域名级直接替换镜像
        mirror_url = item_url.replace("https://kkgithub.com", "https://github.com")
        
        # 复制当前系统环境变量，防止 git 弹窗要求输入密码导致后台卡死
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["GCM_INTERACTIVE"] = "never"           # 禁止 Git Credential Manager 交互
        env["GIT_CONFIG_NOSYSTEM"] = "1"           # 禁用系统级 gitconfig（可能配置了 credential.helper）
        env["GCM_PROVIDER"] = ""                    # 清空 GCM provider，阻止任何凭证提供者
        env["GIT_ASKPASS"] = ""                     # 禁用 Git ASKPASS 外部程序
        env["SSH_ASKPASS"] = ""                     # 禁用 SSH ASKPASS 外部程序

        try:
            print(f"正在尝试通过加速镜像 Clone: {mirror_url}")
            subprocess.run(
                ["git", "-c", "credential.helper=", "clone", "--depth", "1", "--single-branch", "--no-tags", mirror_url, clone_target_path],
                capture_output=True,
                text=True,
                check=True,
                env=env,
                timeout=1200  # 20分钟超时
            )
            print("✅ 镜像 Git Clone 安装成功！保留了完整的版本控制 (.git)。")
            return web.json_response({"status": "success"})
            
        except subprocess.TimeoutExpired:
            return web.json_response({"error": "安装超时：仓库过大或网络异常，请检查网络后重试"}, status=504)
            
        except subprocess.CalledProcessError as e1:
            print(f"⚠️ 镜像源不可用或发生冲突，系统正在自动无缝回退至直连: {item_url}")
            
            # 清理刚才克隆到一半可能留下的残缺空文件夹
            if os.path.exists(clone_target_path):
                shutil.rmtree(clone_target_path)
                
            # 链路 B：官方直连 (专门照顾开了科学上网/全局代理的用户)
            subprocess.run(
                ["git", "-c", "credential.helper=", "clone", "--depth", "1", "--single-branch", "--no-tags", item_url, clone_target_path],
                capture_output=True,
                text=True,
                check=True,
                env=env,
                timeout=1200  # 20分钟超时
            )
            print("✅ 直连 Git Clone 安装成功！")
            return web.json_response({"status": "success"})
            
    except subprocess.TimeoutExpired:
        return web.json_response({"error": "安装超时：仓库过大或网络异常，请检查网络后重试"}, status=504)
            
    except FileNotFoundError:
        # 拦截用户电脑根本没装 Git 的情况
        return web.json_response({"error": "系统中未检测到 Git，请先安装 Git 环境才能下载插件！"}, status=500)
        
    except subprocess.CalledProcessError as e2:
        # 两条链路都失败了的最终兜底
        error_msg = e2.stderr or e2.stdout
        return web.json_response({"error": f"Git Clone 失败，镜像与直连均不可用。请检查网络或开启代理: {error_msg}"}, status=500)
        
    except Exception as e:
        # 兜底异常拦截
        return web.json_response({"error": f"安装过程发生未知失败: {str(e)}"}, status=500)

async def install_private_tool_handler(request):
    """本地 API：针对付费/私有库，通过云端鉴权代理下载 ZIP 包，流式写入临时文件并磁盘解压覆盖"""
    data = await request.json()
    item_url = data.get("url")
    item_id = data.get("id")
    account = data.get("account")
    
    if not item_url or not account or not item_id: 
        return web.json_response({"error": "缺少核心鉴权参数"}, status=400)
        
    target_dir_name = item_url.rstrip("/").split("/")[-1].replace(".git", "")
    extract_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)
    tmp_path = None
    
    try:
        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_github_zip"
        payload = json.dumps({"url": item_url, "item_id": item_id, "account": account}).encode("utf-8")
        headers = {'Content-Type': 'application/json'}
        
        # ZIP 下载（最多重试3次）
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(proxy_api_url, data=payload, headers=headers)
                print(f"[ComfyUI-Ranking] 🔒 正在向云端发起私有资产鉴权与加密拉取: {item_id}" + (f"（第{attempt+1}次尝试）" if attempt > 0 else ""))
                with urllib.request.urlopen(req, timeout=600) as response:
                    content_length = int(response.headers.get('Content-Length', 0))
                    
                    # 磁盘空间检查（仅第一次）
                    if attempt == 0 and content_length > 0:
                        required_space = content_length * 4
                        free_space = shutil.disk_usage(CUSTOM_NODES_DIR).free
                        if free_space < required_space:
                            free_gb = free_space / (1024**3)
                            need_gb = required_space / (1024**3)
                            return web.json_response({"error": f"磁盘空间不足：需要约 {need_gb:.1f}GB，当前剩余 {free_gb:.1f}GB"}, status=500)
                    
                    # 流式下载到临时文件，避免大文件 OOM
                    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp_file:
                        tmp_path = tmp_file.name
                        downloaded = 0
                        chunk_size = 1024 * 1024  # 1MB 分块
                        
                        while True:
                            chunk = response.read(chunk_size)
                            if not chunk:
                                break
                            
                            # 检查是否为错误响应（仅检查第一个 chunk）
                            if downloaded == 0 and (chunk.startswith(b'{"') or chunk.startswith(b'GITHUB_DOWNLOAD_FAILED')):
                                os.unlink(tmp_path)
                                tmp_path = None
                                try:
                                    error_data = json.loads(chunk.decode('utf-8'))
                                    err_msg = error_data.get("detail", error_data.get("error", "云端下载失败"))
                                except:
                                    err_msg = "云端下载失败，请稍后重试"
                                return web.json_response({"error": f"云端拒绝访问或拉取失败: {err_msg}"}, status=403)
                            
                            tmp_file.write(chunk)
                            downloaded += len(chunk)
                
                # 下载成功，跳出重试循环
                break
                
            except (http.client.IncompleteRead, urllib.error.URLError, ConnectionResetError, TimeoutError) as e:
                # 清理失败的临时文件
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.unlink(tmp_path)
                    except:
                        pass
                    tmp_path = None
                
                if attempt < max_retries - 1:
                    wait_time = [2, 5][attempt]
                    print(f"[ComfyUI-Ranking] ⚠️ ZIP 下载失败（第{attempt+1}次），{wait_time}秒后重试: {e}")
                    time.sleep(wait_time)
                else:
                    print(f"[ComfyUI-Ranking] ❌ ZIP 下载失败（已重试{max_retries}次）: {e}")
                    return web.json_response({"status": "error", "message": f"下载失败（网络不稳定，已重试{max_retries}次）: {str(e)}"}, status=500)
        
        print("[ComfyUI-Ranking] ✅ 成功接收云端安全 ZIP 数据流，执行热覆盖解压...")
        
        # 从临时文件磁盘解压（不占内存）
        with zipfile.ZipFile(tmp_path) as zip_ref:
            namelist = zip_ref.namelist()
            if not namelist:
                return web.json_response({"error": "下载的压缩包结构为空"}, status=500)
                
            top_level_dir = namelist[0].split('/')[0] + '/'
            
            # 🚀 核心修复 1：执行纯净更新！在确认 ZIP 完好无损后，先彻底抹除旧版本文件夹，防止残留的废弃 .py 文件引发报错
            if os.path.exists(extract_target_path):
                try:
                    shutil.rmtree(extract_target_path)
                except Exception as e:
                    # 🚀 核心修复 2：拦截 Windows 下 Python 文件被 ComfyUI 进程死锁的情况
                    return web.json_response({"error": "旧版本文件正在被 ComfyUI 进程占用，无法覆盖更新。请彻底关闭控制台黑框，重新启动 ComfyUI 后再点击更新。"}, status=500)
            
            os.makedirs(extract_target_path, exist_ok=True)
            
            for member in namelist:
                if member.startswith(top_level_dir):
                    target_path = member.replace(top_level_dir, "", 1)
                    if not target_path: continue
                    # 防止路径穿越攻击 - 第一层防御
                    if ".." in target_path or target_path.startswith("/") or target_path.startswith("\\"):
                        print(f"[ComfyUI-Ranking] ⚠️ 跳过不安全路径: {target_path}")
                        continue
                    
                    # 防止路径穿越攻击 - 第二层防御：使用 normpath 规范化检查
                    abs_target = os.path.normpath(os.path.join(extract_target_path, target_path))
                    abs_base = os.path.normpath(extract_target_path)
                    if not abs_target.startswith(abs_base):
                        print(f"[ComfyUI-Ranking] ⚠️ 跳过不安全路径: {target_path}")
                        continue
                        
                    source = zip_ref.open(member)
                    dest_path = os.path.join(extract_target_path, target_path)
                    
                    if member.endswith('/'):
                        os.makedirs(dest_path, exist_ok=True)
                    else:
                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                        with open(dest_path, "wb") as target:
                            shutil.copyfileobj(source, target) # 强制写入纯净新文件
                                
        print(f"[ComfyUI-Ranking] 🎉 私有插件 {target_dir_name} 静默更新/安装完成！无 .git 目录残留。")
        return web.json_response({"status": "success"})
        
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')
        return web.json_response({"error": f"拉取中断: {err_msg}"}, status=500)
    except Exception as e:
        return web.json_response({"error": f"本地解压覆盖异常: {str(e)}"}, status=500)
    finally:
        # 清理临时文件，捕获异常防止覆盖响应
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception as cleanup_err:
                print(f"[ComfyUI-Ranking] ⚠️ 临时文件清理失败（不影响安装结果）: {cleanup_err}")

async def install_tool_stream_handler(request):
    """SSE 流式接口：通过 Git Clone 下载插件，实时推送进度"""
    data = await request.json()
    item_url = data.get("url")
    item_id = data.get("id")
    account = data.get("account")

    resp = web.StreamResponse(
        status=200,
        headers={
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )
    await resp.prepare(request)

    async def send_progress(stage, progress, message, status=None):
        event = {"stage": stage, "progress": progress, "message": message}
        if status:
            event["status"] = status
        await resp.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode('utf-8'))

    try:
        if not item_url or not account:
            await send_progress("error", -1, "缺少下载凭证或链接", "error")
            await resp.write_eof()
            return resp

        # 校验 URL 是否为有效的 Git 仓库地址
        valid_git_hosts = ["github.com", "gitlab.com", "gitee.com", "bitbucket.org", "kkgithub.com"]
        if not any(host in item_url for host in valid_git_hosts):
            await send_progress("error", -1, "该资源链接不是有效的 Git 仓库地址，无法自动安装。请前往资源原始页面手动下载。", "error")
            await resp.write_eof()
            return resp

        await send_progress("validate", 5, "校验安装参数...")

        target_dir_name = item_url.rstrip("/").split("/")[-1].replace(".git", "")
        clone_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)

        await send_progress("cleanup", 15, "清理残留目录...")
        if os.path.exists(clone_target_path):
            try:
                shutil.rmtree(clone_target_path)
            except Exception as e:
                await send_progress("error", -1, f"目录 {target_dir_name} 已存在且被占用，无法自动清理，请先手动删除。错误: {str(e)}", "error")
                await resp.write_eof()
                return resp

        # 复制当前系统环境变量，防止 git 弹窗要求输入密码导致后台卡死
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["GCM_INTERACTIVE"] = "never"           # 禁止 Git Credential Manager 交互
        env["GIT_CONFIG_NOSYSTEM"] = "1"           # 禁用系统级 gitconfig（可能配置了 credential.helper）
        env["GCM_PROVIDER"] = ""                    # 清空 GCM provider，阻止任何凭证提供者
        env["GIT_ASKPASS"] = ""                     # 禁用 Git ASKPASS 外部程序
        env["SSH_ASKPASS"] = ""                     # 禁用 SSH ASKPASS 外部程序

        mirror_url = item_url.replace("https://kkgithub.com", "https://github.com")

        await send_progress("git_mirror", 25, "尝试镜像源克隆...")

        try:
            await send_progress("git_cloning", 50, "正在克隆仓库（浅克隆模式）...")
            proc = await asyncio.create_subprocess_exec(
                "git", "-c", "credential.helper=", "clone", "--depth", "1", "--single-branch", "--no-tags", mirror_url, clone_target_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            # 使用心跳机制等待克隆完成，防止连接被代理/浏览器认为空闲而断开
            clone_task = asyncio.create_task(proc.communicate())
            start_time = time.time()

            while not clone_task.done():
                await asyncio.sleep(15)  # 每15秒检查一次
                if clone_task.done():
                    break
                elapsed = time.time() - start_time
                if elapsed > 1200:  # 总超时20分钟
                    proc.kill()
                    await proc.wait()
                    clone_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await clone_task
                    await send_progress("error", -1, "安装超时：仓库过大或网络异常（已等待20分钟）", "error")
                    await resp.write_eof()
                    return resp
                progress_pct = min(30 + int(elapsed / 1200 * 50), 79)
                minutes = int(elapsed // 60)
                seconds = int(elapsed % 60)
                await send_progress("git_cloning", progress_pct, f"正在克隆仓库（浅克隆模式）... 已等待 {minutes}分{seconds}秒")

            stdout, stderr = await clone_task
            if proc.returncode != 0:
                raise subprocess.CalledProcessError(
                    proc.returncode, ["git", "-c", "credential.helper=", "clone", "--depth", "1", "--single-branch", "--no-tags", mirror_url, clone_target_path],
                    output=stdout, stderr=stderr
                )
            await send_progress("complete", 100, "✅ 安装成功！", "success")

        except subprocess.CalledProcessError as e1:
            await send_progress("git_fallback", 55, "镜像失败，切换直连源...")

            if os.path.exists(clone_target_path):
                shutil.rmtree(clone_target_path)

            await send_progress("git_direct", 70, "正在直连克隆（浅克隆模式）...")
            proc = await asyncio.create_subprocess_exec(
                "git", "-c", "credential.helper=", "clone", "--depth", "1", "--single-branch", "--no-tags", item_url, clone_target_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            # 使用心跳机制等待克隆完成，防止连接被代理/浏览器认为空闲而断开
            clone_task = asyncio.create_task(proc.communicate())
            start_time = time.time()

            while not clone_task.done():
                await asyncio.sleep(15)
                if clone_task.done():
                    break
                elapsed = time.time() - start_time
                if elapsed > 1200:
                    proc.kill()
                    await proc.wait()
                    clone_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await clone_task
                    await send_progress("error", -1, "安装超时：仓库过大或网络异常（已等待20分钟）", "error")
                    await resp.write_eof()
                    return resp
                progress_pct = min(30 + int(elapsed / 1200 * 50), 79)
                minutes = int(elapsed // 60)
                seconds = int(elapsed % 60)
                await send_progress("git_cloning", progress_pct, f"正在克隆仓库（浅克隆模式）... 已等待 {minutes}分{seconds}秒")

            stdout, stderr = await clone_task
            if proc.returncode != 0:
                raise subprocess.CalledProcessError(
                    proc.returncode, ["git", "-c", "credential.helper=", "clone", "--depth", "1", "--single-branch", "--no-tags", item_url, clone_target_path],
                    output=stdout, stderr=stderr
                )
            await send_progress("complete", 100, "✅ 安装成功！", "success")

    except FileNotFoundError:
        await send_progress("error", -1, "系统中未检测到 Git，请先安装 Git 环境才能下载插件！", "error")
    except subprocess.CalledProcessError as e2:
        error_msg = e2.stderr.decode('utf-8', errors='ignore') if e2.stderr else (e2.stdout.decode('utf-8', errors='ignore') if e2.stdout else "")
        await send_progress("error", -1, f"Git Clone 失败，镜像与直连均不可用。请检查网络或开启代理: {error_msg}", "error")
    except Exception as e:
        await send_progress("error", -1, f"安装过程发生未知失败: {str(e)}", "error")

    await resp.write_eof()
    return resp

async def install_private_tool_stream_handler(request):
    """SSE 流式接口：针对付费/私有库，通过云端鉴权代理下载 ZIP 包，流式写入临时文件并磁盘解压覆盖"""
    data = await request.json()
    item_url = data.get("url")
    item_id = data.get("id")
    account = data.get("account")

    resp = web.StreamResponse(
        status=200,
        headers={
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )
    await resp.prepare(request)

    async def send_progress(stage, progress, message, status=None):
        event = {"stage": stage, "progress": progress, "message": message}
        if status:
            event["status"] = status
        await resp.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode('utf-8'))

    tmp_path = None

    try:
        if not item_url or not account or not item_id:
            await send_progress("error", -1, "缺少核心鉴权参数", "error")
            await resp.write_eof()
            return resp

        await send_progress("validate", 5, "校验安装参数...")
        await send_progress("auth", 15, "验证购买权限...")

        target_dir_name = item_url.rstrip("/").split("/")[-1].replace(".git", "")
        extract_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)

        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_github_zip"
        payload = json.dumps({"url": item_url, "item_id": item_id, "account": account}).encode("utf-8")
        headers = {'Content-Type': 'application/json'}
        
        # ZIP 下载（最多重试3次）
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(proxy_api_url, data=payload, headers=headers)
                await send_progress("downloading", 30, "从云端下载资源包..." + (f"（第{attempt+1}次尝试）" if attempt > 0 else ""))
                with urllib.request.urlopen(req, timeout=600) as response:
                    content_length = int(response.headers.get('Content-Length', 0))
                    
                    # 磁盘空间检查（仅第一次）
                    if attempt == 0 and content_length > 0:
                        required_space = content_length * 4
                        free_space = shutil.disk_usage(CUSTOM_NODES_DIR).free
                        if free_space < required_space:
                            free_gb = free_space / (1024**3)
                            need_gb = required_space / (1024**3)
                            await send_progress("error", -1, f"磁盘空间不足：需要约 {need_gb:.1f}GB，当前剩余 {free_gb:.1f}GB", "error")
                            await resp.write_eof()
                            return resp
                    
                    # 流式下载到临时文件，避免大文件 OOM
                    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp_file:
                        tmp_path = tmp_file.name
                        downloaded = 0
                        chunk_size = 1024 * 1024  # 1MB 分块
                        last_progress_time = time.time()
                        
                        while True:
                            chunk = response.read(chunk_size)
                            if not chunk:
                                break
                            
                            # 检查是否为错误响应（仅检查第一个 chunk）
                            if downloaded == 0 and (chunk.startswith(b'{"') or chunk.startswith(b'GITHUB_DOWNLOAD_FAILED')):
                                os.unlink(tmp_path)
                                tmp_path = None
                                try:
                                    error_data = json.loads(chunk.decode('utf-8'))
                                    err_msg = error_data.get("detail", error_data.get("error", "云端下载失败"))
                                except:
                                    err_msg = "云端下载失败，请稍后重试"
                                await send_progress("error", -1, f"云端拒绝访问或拉取失败: {err_msg}", "error")
                                await resp.write_eof()
                                return resp
                            
                            tmp_file.write(chunk)
                            downloaded += len(chunk)
                            
                            # 每5MB或每10秒更新一次下载进度
                            current_time = time.time()
                            if downloaded % (5 * 1024 * 1024) < chunk_size or current_time - last_progress_time >= 10:
                                mb_done = downloaded / (1024 * 1024)
                                if content_length > 0:
                                    pct = 30 + int(downloaded / content_length * 30)  # 30%~60%
                                    mb_total = content_length / (1024 * 1024)
                                    await send_progress("downloading", pct, f"下载中... {mb_done:.1f}MB / {mb_total:.1f}MB")
                                else:
                                    # 无法获取总大小时，显示已下载量，进度缓慢递增（按200MB估算）
                                    pct = min(30 + int(downloaded / (200 * 1024 * 1024) * 30), 59)
                                    await send_progress("downloading", pct, f"下载中... 已接收 {mb_done:.1f}MB")
                                last_progress_time = current_time
                
                # 下载成功，跳出重试循环
                break
                
            except (http.client.IncompleteRead, urllib.error.URLError, ConnectionResetError, TimeoutError) as e:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.unlink(tmp_path)
                    except:
                        pass
                    tmp_path = None
                
                if attempt < max_retries - 1:
                    wait_time = [2, 5][attempt]
                    await send_progress("downloading", 10, f"⚠️ 下载中断，{wait_time}秒后重试（第{attempt+2}次）...")
                    await asyncio.sleep(wait_time)
                else:
                    await send_progress("error", -1, f"下载失败（网络不稳定，已重试{max_retries}次）: {str(e)}", "error")
                    await resp.write_eof()
                    return resp

        await send_progress("download_done", 60, "下载完成，准备解压...")

        # 从临时文件磁盘解压（不占内存）
        with zipfile.ZipFile(tmp_path) as zip_ref:
            namelist = zip_ref.namelist()
            if not namelist:
                await send_progress("error", -1, "下载的压缩包结构为空", "error")
                await resp.write_eof()
                return resp

            top_level_dir = namelist[0].split('/')[0] + '/'

            await send_progress("extracting", 75, "解压安装文件...")

            if os.path.exists(extract_target_path):
                try:
                    shutil.rmtree(extract_target_path)
                except Exception as e:
                    await send_progress("error", -1, "旧版本文件正在被 ComfyUI 进程占用，无法覆盖更新。请彻底关闭控制台黑框，重新启动 ComfyUI 后再点击更新。", "error")
                    await resp.write_eof()
                    return resp

            os.makedirs(extract_target_path, exist_ok=True)

            total_files = len(namelist)
            processed = 0
            for member in namelist:
                if member.startswith(top_level_dir):
                    target_path = member.replace(top_level_dir, "", 1)
                    if not target_path:
                        continue
                    # 防止路径穿越攻击 - 第一层防御
                    if ".." in target_path or target_path.startswith("/") or target_path.startswith("\\"):
                        continue
                    # 防止路径穿越攻击 - 第二层防御：使用 normpath 规范化检查
                    abs_target = os.path.normpath(os.path.join(extract_target_path, target_path))
                    abs_base = os.path.normpath(extract_target_path)
                    if not abs_target.startswith(abs_base):
                        continue

                    source = zip_ref.open(member)
                    dest_path = os.path.join(extract_target_path, target_path)

                    if member.endswith('/'):
                        os.makedirs(dest_path, exist_ok=True)
                    else:
                        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                        with open(dest_path, "wb") as target:
                            shutil.copyfileobj(source, target)

                processed += 1
                # 每解压 50 个文件推送一次进度
                if processed % 50 == 0:
                    progress_pct = 75 + int(processed / total_files * 15)  # 75%~90%
                    await send_progress("installing", progress_pct, f"写入目标目录... {processed}/{total_files}")

        await send_progress("complete", 100, "✅ 安装成功！", "success")

    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')
        await send_progress("error", -1, f"拉取中断: {err_msg}", "error")
    except Exception as e:
        await send_progress("error", -1, f"本地解压覆盖异常: {str(e)}", "error")
    finally:
        # 清理临时文件，捕获异常防止覆盖响应
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception as cleanup_err:
                print(f"[ComfyUI-Ranking] ⚠️ 临时文件清理失败（不影响安装结果）: {cleanup_err}")

    await resp.write_eof()
    return resp