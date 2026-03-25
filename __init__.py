# __init__.py
from server import PromptServer
from .api_tool import install_tool_handler
from .api_app import download_app_handler

# ComfyUI 规定的前端目录路径与节点对象
WEB_DIRECTORY = "./前端页面"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# 注册所有拆分出去的子路由
routes = PromptServer.instance.routes
routes.post("/community_hub/install_tool")(install_tool_handler)
routes.post("/community_hub/download_app")(download_app_handler)

# 仅对外暴漏 ComfyUI 所需的环境常量
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]