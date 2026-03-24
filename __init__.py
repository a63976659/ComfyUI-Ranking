# __init__.py
import os
import shutil
import subprocess
import json
import urllib.request
import urllib.error
import asyncio
from server import PromptServer
from aiohttp import web

WEB_DIRECTORY = "./前端页面"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
routes = PromptServer.instance.routes

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)
COMFY_ROOT_DIR = os.path.dirname(CUSTOM_NODES_DIR)
APP_MODELS_DIR = os.path.join(COMFY_ROOT_DIR, "models", "app")

@routes.post("/community_hub/install_tool")
async def install_tool(request):
    """本地 API：处理 Git 工具克隆 (支持后台静默下载)"""
    data = await request.json()
    git_url = data.get("url")
    if not git_url: return web.json_response({"error": "未提供合法的 Git 链接"}, status=400)
        
    target_dir_name = git_url.rstrip("/").split("/")[-1].replace(".git", "")
    clone_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)
    
    if os.path.exists(clone_target_path):
        return web.json_response({"error": f"目录 {target_dir_name} 已存在，请先卸载或删除。"}, status=400)
        
    try:
        # 【核心修改】：使用 asyncio 执行后台子进程，解耦前端 UI 的生命周期
        process = await asyncio.create_subprocess_exec(
            "git", "clone", git_url, clone_target_path,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            return web.json_response({"error": "git_clone_failed", "details": stderr.decode('utf-8', errors='ignore')})
            
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@routes.post("/community_hub/download_app")
async def download_app(request):
    """本地 API：处理应用(JSON)的下载与鉴权"""
    data = await request.json()
    download_url = data.get("url")
    app_id = data.get("id", "default_app")
    account = data.get("account")  # 接收前端传来的凭证
    
    if not download_url or not account:
        return web.json_response({"error": "缺少下载凭证或应用链接"}, status=400)
    
    os.makedirs(APP_MODELS_DIR, exist_ok=True)
    file_path = os.path.join(APP_MODELS_DIR, f"{app_id}.json")
    
    try:
        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_download"
        
        # 将参数打包，传递给云端进行所有权校验
        payload = json.dumps({
            "url": download_url,
            "item_id": app_id,
            "account": account
        }).encode("utf-8")
        
        req = urllib.request.Request(
            proxy_api_url, 
            data=payload, 
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
        )
        
        # 即使前端 UI 关了，这部分 urllib 同步请求也会在 Python 线程里坚挺地跑完
        with urllib.request.urlopen(req) as response:
            content = response.read().decode('utf-8')
            try:
                json_data = json.loads(content)
                if isinstance(json_data, dict) and "error" in json_data:
                    return web.json_response({"error": json_data["error"]}, status=500)
            except json.JSONDecodeError:
                json_data = json.loads(content)
                pass
                
        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
                
        return web.json_response({"status": "success", "data": json_data})
        
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')
        return web.json_response({"error": f"云端代理拒绝访问: {err_msg}"}, status=500)
    except Exception as e:
        return web.json_response({"error": f"下载流程失败: {str(e)}"}, status=500)