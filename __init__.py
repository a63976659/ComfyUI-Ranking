# __init__.py
import os
import shutil
import subprocess
import json
import urllib.request
import urllib.error
from server import PromptServer
from aiohttp import web

# 1. 告诉 ComfyUI，前端 JS 文件都在 "前端页面" 这个目录下
WEB_DIRECTORY = "./前端页面"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# 获取 ComfyUI 本地服务器的路由实例
routes = PromptServer.instance.routes

# === 核心目录层级计算 ===
# 当前文件目录: custom_nodes/ComfyUI-Ranking
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
# 上一级目录: custom_nodes
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)
# 上两级目录: ComfyUI 根目录
COMFY_ROOT_DIR = os.path.dirname(CUSTOM_NODES_DIR)
# 目标模型应用目录: models/app
APP_MODELS_DIR = os.path.join(COMFY_ROOT_DIR, "models", "app")

@routes.post("/community_hub/install_tool")
async def install_tool(request):
    """本地 API：处理 Git 工具克隆"""
    data = await request.json()
    git_url = data.get("url")
    if not git_url:
        return web.json_response({"error": "未提供合法的 Git 链接"}, status=400)
    
    # 检测系统环境是否安装了 Git
    if shutil.which("git") is None:
        return web.json_response({"error": "git_missing"})
    
    try:
        # 在上一级目录 (custom_nodes) 执行 git clone
        process = subprocess.Popen(["git", "clone", git_url], cwd=CUSTOM_NODES_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            return web.json_response({"error": "git_clone_failed", "details": stderr.decode('utf-8', errors='ignore')})
            
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@routes.post("/community_hub/download_app")
async def download_app(request):
    """本地 API：处理应用(JSON)的下载与加载"""
    data = await request.json()
    download_url = data.get("url")
    app_id = data.get("id", "default_app")
    
    if not download_url:
        return web.json_response({"error": "未提供合法的应用链接"}, status=400)
    
    # 确保 models/app 目录存在
    os.makedirs(APP_MODELS_DIR, exist_ok=True)
    file_path = os.path.join(APP_MODELS_DIR, f"{app_id}.json")
    
    try:
        # 模拟浏览器请求头拉取 JSON
        req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            content = response.read().decode('utf-8')
            json_data = json.loads(content) # 校验是否为合法 JSON
            
        # 第一次获取时写入本地磁盘
        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
                
        # 将工作流数据原样返回给前端，用于直接加载到画布
        return web.json_response({"status": "success", "data": json_data})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']