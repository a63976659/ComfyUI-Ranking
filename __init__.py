# __init__.py (完整替换)
from server import PromptServer
from .api_tool import install_tool_handler
from .api_app import download_app_handler
from .api_cache import cache_image_handler  # 🟢 引入缓存代理模块

WEB_DIRECTORY = "./前端页面"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

routes = PromptServer.instance.routes
routes.post("/community_hub/install_tool")(install_tool_handler)
routes.post("/community_hub/download_app")(download_app_handler)
routes.get("/community_hub/image")(cache_image_handler)  # 🟢 注册图片缓存路由

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]