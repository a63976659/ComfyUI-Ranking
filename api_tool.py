# api_tool.py
import os
import json
import zipfile
import io
import urllib.request
import urllib.error
from aiohttp import web

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)

async def install_tool_handler(request):
    """本地 API：请求云端代理下载私有库 ZIP 并后台静默解压"""
    data = await request.json()
    item_url = data.get("url")
    item_id = data.get("id")
    account = data.get("account") # 用户身份凭证
    
    if not item_url or not account: 
        return web.json_response({"error": "缺少下载凭证或链接"}, status=400)
        
    target_dir_name = item_url.rstrip("/").split("/")[-1].replace(".git", "")
    clone_target_path = os.path.join(CUSTOM_NODES_DIR, target_dir_name)
    
    if os.path.exists(clone_target_path):
        return web.json_response({"error": f"目录 {target_dir_name} 已存在，请先在 custom_nodes 中删除旧版本。"}, status=400)
        
    try:
        # 1. 组装凭证，请求云端私有库代理接口
        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_github_zip"
        payload = json.dumps({"url": item_url, "item_id": item_id, "account": account}).encode("utf-8")
        req = urllib.request.Request(proxy_api_url, data=payload, headers={'Content-Type': 'application/json'})
        
        # 2. 在 Python 线程中下载 ZIP 数据流
        with urllib.request.urlopen(req) as response:
            zip_data = response.read()
            
            if zip_data == b"GITHUB_DOWNLOAD_FAILED":
                return web.json_response({"error": "云端拉取 GitHub 私有库失败，可能 Token 已过期或仓库不存在"}, status=500)
                
            try:
                # 尝试解析为 JSON (如果是云端拦截返回了错误信息)
                err_check = json.loads(zip_data.decode('utf-8'))
                if "error" in err_check: return web.json_response({"error": err_check["error"]}, status=403)
            except:
                pass # 正常情况解析 JSON 会报错，因为它是二进制的 ZIP 文件流

        # 3. 将内存中的 ZIP 流解压到 custom_nodes 目录
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zip_ref:
            # GitHub 的 zipball 会自带一层根目录(如 owner-repo-commitId)
            # 我们需要把里面的内容提取到指定的 target_dir_name 中
            root_folder = zip_ref.namelist()[0].split('/')[0]
            for member in zip_ref.namelist():
                if member.startswith(root_folder + "/") and not member.endswith("/"):
                    # 剥离顶层目录
                    relative_path = member[len(root_folder)+1:]
                    target_file_path = os.path.join(clone_target_path, relative_path)
                    os.makedirs(os.path.dirname(target_file_path), exist_ok=True)
                    with open(target_file_path, 'wb') as f:
                        f.write(zip_ref.read(member))
                        
        return web.json_response({"status": "success"})
        
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')
        return web.json_response({"error": f"云端代理拒绝访问: {err_msg}"}, status=403)
    except Exception as e:
        return web.json_response({"error": f"解压安装失败: {str(e)}"}, status=500)