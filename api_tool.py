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