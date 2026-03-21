import os
import shutil

# 1. 告诉 ComfyUI，前端 JS 文件都在 "前端页面" 这个目录下
WEB_DIRECTORY = "./前端页面"

# 2. 如果你的插件包含自定义的连线节点，在这里导出（目前我们主要是侧边栏，所以为空）
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# 3. 标准的导出格式
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']