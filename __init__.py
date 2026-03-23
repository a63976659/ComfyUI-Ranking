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
# 当前文件目录
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
        
    target_dir_name = git_url.rstrip("/").split("/")[-1].replace(".git", "")
    clone_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)
    
    if os.path.exists(clone_target_path):
        return web.json_response({"error": f"目录 {target_dir_name} 已存在，请先卸载或删除。"}, status=400)
        
    try:
        process = subprocess.Popen(
            ["git", "clone", git_url, clone_target_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
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
        # =================================================================
        # 【核心修复】：不再直接请求下载链接，而是请求我们的云端代理 API
        # =================================================================
        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_download"
        
        # 将原本的下载 URL 包装为 JSON 载荷
        payload = json.dumps({"url": download_url}).encode("utf-8")
        
        # 向云端发起 POST 请求
        req = urllib.request.Request(
            proxy_api_url, 
            data=payload, 
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
        )
        
        with urllib.request.urlopen(req) as response:
            content = response.read().decode('utf-8')
            
            # 尝试解析内容，看看云端是不是返回了错误 JSON
            try:
                json_data = json.loads(content)
                if isinstance(json_data, dict) and "error" in json_data:
                    return web.json_response({"error": json_data["error"]}, status=500)
            except json.JSONDecodeError:
                # 如果解析 JSON 失败，说明拿到的正是工作流本身的 JSON 字符串
                json_data = json.loads(content)
                pass
                
        # 第一次获取时写入本地磁盘
        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
                
        # 将工作流数据原样返回给前端，用于直接加载到画布
        return web.json_response({"status": "success", "data": json_data})
        
    except urllib.error.HTTPError as e:
        # 捕获代理服务器返回的具体报错
        err_msg = e.read().decode('utf-8', errors='ignore')
        return web.json_response({"error": f"云端代理拒绝访问(HTTP {e.code}): {err_msg}"}, status=500)
    except Exception as e:
        return web.json_response({"error": f"下载流程失败: {str(e)}"}, status=500)