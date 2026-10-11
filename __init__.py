# ComfyUI 插件入口；标准导出在启动检查失败时仍可读取。
import os

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIRECTORY = "./前端页面"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}


def _register_local_routes():
    # 📦 三发行版兼容（两段式导入加固）：任何模块导入失败都不拖垮整个插件，
    # 保证 WEB_DIRECTORY/NODE_CLASS_MAPPINGS 始终可被 ComfyUI 读到，其余路由照常注册
    try:
        from server import PromptServer
    except Exception as _e:
        PromptServer = None
        print(f"[ComfyUI-Ranking] ⚠️ 无法获取 PromptServer，API 路由未注册: {_e}")

    if PromptServer is not None:
        try:
            from .api_tool import install_tool_handler, install_private_tool_handler, install_tool_stream_handler, install_private_tool_stream_handler, install_preview_handler
            try:
                from .api_tool import recover_installations, CUSTOM_NODES_DIR
                recovered = recover_installations(CUSTOM_NODES_DIR)
                if recovered:
                    print('[ComfyUI-Ranking] Recovered interrupted installations: ' + str(recovered)
                          + '; restart ComfyUI if recovered nodes are not available.')
            except Exception as recovery_error:
                print('[ComfyUI-Ranking] Installation recovery deferred: ' + type(recovery_error).__name__)
        except Exception as _e:
            install_tool_handler = install_private_tool_handler = None
            install_tool_stream_handler = install_private_tool_stream_handler = install_preview_handler = None
            print(f"[ComfyUI-Ranking] ⚠️ api_tool 导入失败，插件安装路由不可用: {_e}")
        try:
            from .api_app import download_app_handler, download_app_stream_handler, workflow_response
        except Exception as _e:
            download_app_handler = download_app_stream_handler = None
            print(f"[ComfyUI-Ranking] ⚠️ api_app 导入失败，应用下载路由不可用: {_e}")
        try:
            from .api_cache import cache_image_handler, cache_video_handler, cache_stats_handler, cache_clear_handler  # 🟢 引入缓存代理模块（图片+视频+统计清理）
        except Exception as _e:
            cache_image_handler = cache_video_handler = cache_stats_handler = cache_clear_handler = None
            print(f"[ComfyUI-Ranking] ⚠️ api_cache 导入失败，缓存代理路由不可用: {_e}")

    if PromptServer is not None:
        routes = PromptServer.instance.routes
        # 逐组 try 化：单路由注册失败不影响其余路由
        try:
            if install_tool_handler and install_private_tool_handler and install_tool_stream_handler and install_private_tool_stream_handler and install_preview_handler:
                routes.post("/community_hub/install_preview")(install_preview_handler)
                routes.post("/community_hub/install_tool")(install_tool_handler)
                routes.post("/community_hub/install_private_tool")(install_private_tool_handler)
                routes.post("/community_hub/install_tool_stream")(install_tool_stream_handler)
                routes.post("/community_hub/install_private_tool_stream")(install_private_tool_stream_handler)
        except Exception as _e:
            print(f"[ComfyUI-Ranking] ⚠️ 插件安装路由注册失败: {_e}")
        try:
            if download_app_handler and download_app_stream_handler:
                routes.post("/community_hub/download_app")(download_app_handler)
                routes.post("/community_hub/download_app_stream")(download_app_stream_handler)
                application = PromptServer.instance.app
                if workflow_response.shutdown not in application.on_cleanup:
                    application.on_cleanup.append(workflow_response.shutdown)
        except Exception as _e:
            print(f"[ComfyUI-Ranking] ⚠️ 应用下载路由注册失败: {_e}")
        try:
            if cache_image_handler and cache_video_handler and cache_stats_handler and cache_clear_handler:
                routes.get("/community_hub/image")(cache_image_handler)  # 🟢 注册图片缓存路由
                routes.get("/community_hub/video")(cache_video_handler)    # 🎬 注册视频缓存路由
                routes.get("/community_hub/cache/stats")(cache_stats_handler)   # 📊 注册缓存统计路由
                routes.post("/community_hub/cache/clear")(cache_clear_handler)  # 🧹 注册缓存清理路由
        except Exception as _e:
            print(f"[ComfyUI-Ranking] ⚠️ 缓存代理路由注册失败: {_e}")



try:
    from .update_engine import startup_session
    with startup_session(THIS_DIR):
        _register_local_routes()
except Exception as startup_error:
    print('[ComfyUI-Ranking] Startup deferred: '+type(startup_error).__name__
          +'; restart ComfyUI after the update or recovery finishes.')

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
