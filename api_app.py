# api_app.py
import os
import json
import urllib.request
import urllib.error
from aiohttp import web

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)
COMFY_ROOT_DIR = os.path.dirname(CUSTOM_NODES_DIR)
APP_MODELS_DIR = os.path.join(COMFY_ROOT_DIR, "models", "app")

async def download_app_handler(request):
    """本地 API：处理应用(JSON)的下载与鉴权"""
    data = await request.json()
    download_url = data.get("url")
    app_id = data.get("id", "default_app")
    account = data.get("account")  
    
    if not download_url or not account:
        return web.json_response({"error": "缺少下载凭证或应用链接"}, status=400)
    
    os.makedirs(APP_MODELS_DIR, exist_ok=True)
    file_path = os.path.join(APP_MODELS_DIR, f"{app_id}.json")
    
    try:
        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_download"
        
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
        
        proxy_handler = urllib.request.ProxyHandler({}) # 构建一个强制为空的代理字典
        opener = urllib.request.build_opener(proxy_handler) # 生成一个绝对纯净的请求引擎
        with opener.open(req, timeout=30) as response:
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