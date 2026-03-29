# api_tool.py
import os
import json
import zipfile
import io
import urllib.request
import urllib.error
import subprocess
import shutil
from aiohttp import web

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)

async def install_tool_handler(request):
    """本地 API：通过 Git Clone 下载插件，保留 .git 文件夹以便后续无缝更新"""
    data = await request.json()
    item_url = data.get("url")
    item_id = data.get("id")
    account = data.get("account") # 用户身份凭证
    
    if not item_url or not account: 
        return web.json_response({"error": "缺少下载凭证或链接"}, status=400)
        
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

        try:
            print(f"正在尝试通过加速镜像 Clone: {mirror_url}")
            subprocess.run(
                ["git", "clone", mirror_url, clone_target_path],
                capture_output=True,
                text=True,
                check=True,
                env=env
            )
            print("✅ 镜像 Git Clone 安装成功！保留了完整的版本控制 (.git)。")
            return web.json_response({"status": "success"})
            
        except subprocess.CalledProcessError as e1:
            print(f"⚠️ 镜像源不可用或发生冲突，系统正在自动无缝回退至直连: {item_url}")
            
            # 清理刚才克隆到一半可能留下的残缺空文件夹
            if os.path.exists(clone_target_path):
                shutil.rmtree(clone_target_path)
                
            # 链路 B：官方直连 (专门照顾开了科学上网/全局代理的用户)
            subprocess.run(
                ["git", "clone", item_url, clone_target_path],
                capture_output=True,
                text=True,
                check=True,
                env=env
            )
            print("✅ 直连 Git Clone 安装成功！")
            return web.json_response({"status": "success"})
            
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
    """本地 API：针对付费/私有库，通过云端鉴权代理下载 ZIP 包，静默内存解压并物理覆盖"""
    data = await request.json()
    item_url = data.get("url")
    item_id = data.get("id")
    account = data.get("account")
    
    if not item_url or not account or not item_id: 
        return web.json_response({"error": "缺少核心鉴权参数"}, status=400)
        
    target_dir_name = item_url.rstrip("/").split("/")[-1].replace(".git", "")
    extract_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)
    
    try:
        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_github_zip"
        payload = json.dumps({"url": item_url, "item_id": item_id, "account": account}).encode("utf-8")
        req = urllib.request.Request(proxy_api_url, data=payload, headers={'Content-Type': 'application/json'})
        
        print(f"[ComfyUI-Ranking] 🔒 正在向云端发起私有资产鉴权与加密拉取: {item_id}")
        with urllib.request.urlopen(req, timeout=120) as response:
            zip_data = response.read()
            
            # 校验云端是否抛出拒绝信息或空流
            if response.status != 200 or zip_data == b"GITHUB_DOWNLOAD_FAILED" or b'"error"' in zip_data[:50]:
                try:
                    err_msg = json.loads(zip_data.decode('utf-8')).get("error", "未知错误")
                except:
                    err_msg = "二进制流解析异常或云端拉取失败"
                return web.json_response({"error": f"云端拒绝访问或拉取失败: {err_msg}"}, status=403)
            
            print("[ComfyUI-Ranking] ✅ 成功接收云端安全 ZIP 数据流，执行热覆盖解压...")
            
            # 【修复点】：在内存中剥离顶层包裹目录
            with zipfile.ZipFile(io.BytesIO(zip_data)) as zip_ref:
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