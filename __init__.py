# __init__.py (完整替换)
import os
import shutil
import stat
import json

THIS_DIR = os.path.dirname(os.path.abspath(__file__))

def _force_remove_readonly_boot(func, path, exc_info):
    os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    func(path)

def _apply_pending_update():
    """启动时检测并应用暂存的自更新"""
    marker_path = os.path.join(THIS_DIR, ".update_pending")
    if not os.path.exists(marker_path):
        return
    
    try:
        with open(marker_path, "r", encoding="utf-8") as f:
            info = json.load(f)
        staging_dir = info.get("staging_dir", "")
        version = info.get("version", "unknown")
        
        if not staging_dir or not os.path.exists(staging_dir):
            os.remove(marker_path)
            return
        
        print(f"[ComfyUI-Ranking] 正在应用暂存更新 v{version}...")
        
        # 1. 删除旧版中除 .update_pending 和 staging 之外的所有内容
        for item in os.listdir(THIS_DIR):
            if item == ".update_pending":
                continue
            item_path = os.path.join(THIS_DIR, item)
            if item_path == staging_dir:
                continue
            if os.path.isdir(item_path):
                shutil.rmtree(item_path, onerror=_force_remove_readonly_boot)
            else:
                os.chmod(item_path, stat.S_IWRITE)
                os.remove(item_path)
        
        # 2. 将 staging 目录内容移动到当前目录
        for item in os.listdir(staging_dir):
            src = os.path.join(staging_dir, item)
            dst = os.path.join(THIS_DIR, item)
            shutil.move(src, dst)
        
        # 3. 清理 staging 空目录和标记文件
        shutil.rmtree(staging_dir, ignore_errors=True)
        if os.path.exists(marker_path):
            os.remove(marker_path)
        
        print(f"[ComfyUI-Ranking] ✅ 更新到 v{version} 成功！")
    except Exception as e:
        print(f"[ComfyUI-Ranking] ⚠️ 应用更新失败: {e}（不影响正常使用）")

def _cleanup_stale_staging():
    """清理可能残留的暂存目录（下载中断等）"""
    parent = os.path.dirname(THIS_DIR)
    self_name = os.path.basename(THIS_DIR)
    staging_name = self_name + ".__staging__"
    staging_path = os.path.join(parent, staging_name)
    if os.path.exists(staging_path):
        # 如果没有 .update_pending 标记，说明是中断残留，清理
        marker_path = os.path.join(THIS_DIR, ".update_pending")
        if not os.path.exists(marker_path):
            shutil.rmtree(staging_path, onerror=_force_remove_readonly_boot)
            print(f"[ComfyUI-Ranking] 🧹 清理了残留的暂存目录")

try:
    _apply_pending_update()
    _cleanup_stale_staging()
except Exception as e:
    print(f"[ComfyUI-Ranking] ⚠️ 启动更新检查异常: {e}")

from server import PromptServer
from .api_tool import install_tool_handler, install_private_tool_handler, install_tool_stream_handler, install_private_tool_stream_handler
from .api_app import download_app_handler, download_app_stream_handler
from .api_cache import cache_image_handler, cache_video_handler, cache_stats_handler, cache_clear_handler  # 🟢 引入缓存代理模块（图片+视频+统计清理）

WEB_DIRECTORY = "./前端页面"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

routes = PromptServer.instance.routes
routes.post("/community_hub/install_tool")(install_tool_handler)
routes.post("/community_hub/install_private_tool")(install_private_tool_handler)
routes.post("/community_hub/download_app")(download_app_handler)
routes.post("/community_hub/install_tool_stream")(install_tool_stream_handler)
routes.post("/community_hub/install_private_tool_stream")(install_private_tool_stream_handler)
routes.post("/community_hub/download_app_stream")(download_app_stream_handler)
routes.get("/community_hub/image")(cache_image_handler)  # 🟢 注册图片缓存路由
routes.get("/community_hub/video")(cache_video_handler)    # 🎬 注册视频缓存路由
routes.get("/community_hub/cache/stats")(cache_stats_handler)   # 📊 注册缓存统计路由
routes.post("/community_hub/cache/clear")(cache_clear_handler)  # 🧹 注册缓存清理路由

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]