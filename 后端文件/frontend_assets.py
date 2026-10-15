"""Read-only public frontend asset delivery."""
from pathlib import Path
import stat

from aiohttp import web


FRONTEND_ROOT = Path(__file__).resolve().parents[1] / '前端页面'
MAX_ASSET_BYTES = 8 * 1024 * 1024
CONTENT_TYPES = {'.js': 'text/javascript', '.css': 'text/css'}


def _asset_path(name, root=None):
    if (not isinstance(name, str) or not name or len(name) > 1024
            or any(char in name for char in '\\:%')
            or any(ord(char) < 32 or ord(char) == 127 for char in name)):
        raise ValueError('Invalid asset path')
    parts = name.split('/')
    if any(not part or part.startswith('.') or part.endswith((' ', '.')) for part in parts):
        raise ValueError('Invalid asset path')
    root = Path(FRONTEND_ROOT if root is None else root).resolve(strict=True)
    path = root
    for index, part in enumerate(parts):
        path = path / part
        info = path.lstat()
        if (stat.S_ISLNK(info.st_mode)
                or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)):
            raise ValueError('Linked asset path')
        if index < len(parts) - 1 and not stat.S_ISDIR(info.st_mode):
            raise ValueError('Invalid asset directory')
    if (path.suffix not in CONTENT_TYPES or not stat.S_ISREG(info.st_mode)
            or info.st_size > MAX_ASSET_BYTES or not path.resolve(strict=True).is_relative_to(root)):
        raise ValueError('Invalid asset file')
    if any(path.with_name(path.name + suffix).exists() for suffix in ('.gz', '.br')):
        raise ValueError('Precompressed asset variants are not supported')
    return path


async def frontend_asset_handler(request):
    try:
        path = _asset_path(request.match_info.get('asset', ''))
    except (OSError, ValueError, RuntimeError):
        raise web.HTTPNotFound() from None
    return web.FileResponse(path, headers={
        'Content-Type': CONTENT_TYPES[path.suffix] + '; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
    })
