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
    """本地 API：处理应用(JSON)的下载与鉴权，支持本地缓存优先"""
    data = await request.json()
    download_url = data.get("url")
    app_id = data.get("id", "default_app")
    account = data.get("account")
    force_download = data.get("force", False)  # 🚀 新增：强制重新下载参数
    
    if not download_url or not account:
        return web.json_response({"error": "缺少下载凭证或应用链接"}, status=400)
    
    os.makedirs(APP_MODELS_DIR, exist_ok=True)
    file_path = os.path.join(APP_MODELS_DIR, f"{app_id}.json")
    
    # 🚀 本地缓存优先：如果本地已有缓存且不强制重新下载，直接读取本地文件
    if os.path.exists(file_path) and not force_download:
        try:
            print(f"📦 发现本地缓存 [{app_id}]，优先从本地加载...")
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                json_data = json.loads(content)
                print(f"✅ 本地缓存加载成功，大小：{len(content)} bytes")
                return web.json_response({"status": "success", "data": json_data, "from_cache": True})
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️ 本地缓存读取失败，回退到云端下载：{str(e)}")
            # 缓存损坏，删除后重新下载
            try:
                os.remove(file_path)
            except:
                pass
    
    try:
        proxy_api_url = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_download"
        
        print(f"🔍 开始下载应用 [{app_id}]")
        print(f"📍 代理地址：{proxy_api_url}")
        print(f"🔗 下载链接：{download_url[:50]}...")
        
        payload = json.dumps({
            "url": download_url,
            "item_id": app_id,
            "account": account
        }).encode("utf-8")
        
        # 🚀 核心修复：创建 SSL 上下文，解决 HTTPS 连接问题
        import ssl
        import os
        ssl_context = ssl.create_default_context()
        # ⚠️ 安全警告：仅在网络环境导致证书验证失败时，通过环境变量临时关闭
        if os.environ.get("DISABLE_SSL_VERIFY", "").lower() in ("1", "true"):
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            print("⚠️ SSL证书验证已关闭，请仅在调试环境使用")
        
        req = urllib.request.Request(
            proxy_api_url, 
            data=payload, 
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
        )
        
        print(f"⏳ 正在请求云端代理 (超时设置：120 秒)...")
        with urllib.request.urlopen(req, timeout=120, context=ssl_context) as response:
            print(f"✅ 云端响应成功，正在读取数据...")
            content = response.read().decode('utf-8')
            print(f"📦 数据读取完成，大小：{len(content)} bytes")
            json_data = None
            try:
                json_data = json.loads(content)
                if isinstance(json_data, dict) and "error" in json_data:
                    return web.json_response({"error": json_data["error"]}, status=500)
            except json.JSONDecodeError as e:
                # 🚀 核心修复：如果解析失败，说明云端可能返回了非 JSON 数据或数据损坏
                print(f"❌ JSON 解析失败：{str(e)}")
                print(f"原始内容前 200 字符：{content[:200]}")
                return web.json_response({"error": f"云端返回的数据格式错误，无法解析为 JSON"}, status=500)
        
        # 🚀 下载成功后保存到本地缓存
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"💾 已缓存到本地：{file_path}")
        except IOError as e:
            print(f"⚠️ 本地缓存写入失败：{str(e)}")
                
        return web.json_response({"status": "success", "data": json_data, "from_cache": False})
        
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')
        print(f"❌ HTTP 错误 [{e.code}]: {err_msg}")
        return web.json_response({"error": f"云端代理拒绝访问：{err_msg}"}, status=500)
    except urllib.error.URLError as e:
        print(f"❌ 网络错误：{str(e)}")
        print(f"   可能原因：无法连接到云端服务器，请检查网络连接")
        return web.json_response({"error": f"网络连接失败：{str(e)}"}, status=500)
    except TimeoutError as e:
        print(f"❌ 超时错误：{str(e)}")
        print(f"   已设置超时为 120 秒，如果文件较大请耐心等待")
        return web.json_response({"error": f"下载超时：{str(e)}"}, status=500)
    except Exception as e:
        import traceback
        print(f"❌ 未知错误：{str(e)}")
        print(traceback.format_exc())
        return web.json_response({"error": f"下载流程失败：{str(e)}"}, status=500)