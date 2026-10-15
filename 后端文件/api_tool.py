# api_tool.py
import os
import re
import json
import zipfile
import urllib.request
import urllib.error
import http.client
import subprocess
import shutil
import stat
import asyncio
import threading
import tempfile
import time
import contextlib
import uuid
import queue
import ipaddress
import hashlib
import errno
import sys
from urllib.parse import urlsplit
from pathlib import Path
from aiohttp import web
try:
    from ..update_engine import directory_lease
except ImportError:
    # 独立源码加载及旧启动模块缓存均从当前插件文件取得标准库协调入口。
    import importlib.util
    _lease_spec=importlib.util.spec_from_file_location('ranking_directory_lease',Path(__file__).resolve().parents[1] / 'update_engine.py')
    _lease_module=importlib.util.module_from_spec(_lease_spec)
    _lease_spec.loader.exec_module(_lease_module)
    directory_lease=_lease_module.directory_lease

try:
    from . import zip_install_reader as _zip_reader
except ImportError:
    import importlib.util
    _zip_spec = importlib.util.spec_from_file_location('ranking_zip_install_reader', Path(__file__).with_name('zip_install_reader.py'))
    _zip_reader = importlib.util.module_from_spec(_zip_spec)
    _zip_spec.loader.exec_module(_zip_reader)

try:
    from . import control_request as _control_reader
except ImportError:
    import importlib.util
    _control_spec = importlib.util.spec_from_file_location('ranking_control_request', Path(__file__).with_name('control_request.py'))
    _control_reader = importlib.util.module_from_spec(_control_spec)
    _control_spec.loader.exec_module(_control_reader)

THIS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUSTOM_NODES_DIR = os.path.dirname(THIS_DIR)

MAX_ZIP_SIZE = 2 * 1024 * 1024 * 1024  # 2GB ZIP 包上限
MAX_ZIP_EXPANDED_SIZE = 4 * 1024 * 1024 * 1024
MAX_ZIP_MEMBER_SIZE = 1024 * 1024 * 1024
MAX_ZIP_FILE_COUNT = 100000
MAX_ZIP_DIRECTORY_BYTES = _zip_reader.MAX_DIRECTORY_BYTES
MAX_ZIP_PATH_CHARS = 4096
MAX_ZIP_PATH_DEPTH = 128
MAX_ZIP_PATH_TEXT_BYTES = 16 * 1024 * 1024
INSTALL_DISK_RESERVE = 64 * 1024 * 1024
INSTALL_CONTROL_MAX_BYTES = 128 * 1024
INSTALL_CONTROL_CHUNK_BYTES = 64 * 1024
INSTALL_CONTROL_MAX_DEPTH = 32
INSTALL_CONTROL_CONCURRENCY = 2
INSTALL_CONTROL_MAX_QUEUED = 8
INSTALL_CONTROL_QUEUE_SECONDS = 15
INSTALL_CONTROL_IDLE_SECONDS = 10
INSTALL_CONTROL_TOTAL_SECONDS = 30


def _require_install_space(directory, required=0):
    """检查实际写入卷；保留日志/回滚余量，不能用另一磁盘的空间代替。"""
    if shutil.disk_usage(directory).free < required + INSTALL_DISK_RESERVE:
        raise OSError(errno.ENOSPC, 'insufficient installation space')


def _is_install_disk_full(error):
    return error.errno == errno.ENOSPC or getattr(error, 'winerror', None) == 112


def _install_file_error(error, error_class):
    if _is_install_disk_full(error):
        return error_class('insufficient_disk_space', '磁盘空间不足，请清理空间后重试。')
    if getattr(error, 'winerror', None) in (32, 33):
        return error_class('target_occupied', '文件仍被占用，请关闭占用程序后再重试更新。')
    if isinstance(error, PermissionError) or error.errno in (errno.EACCES, errno.EPERM):
        return error_class('permission_denied', '无法修改安装目录，请检查文件占用和目录写入权限后重试。')
    return None


_VALID_GIT_HOSTS = {"github.com", "gitlab.com", "gitee.com", "bitbucket.org", "kkgithub.com"}
_INSTALL_PUBLISH_LOCK = threading.RLock()
_INSTALL_LOCK_TIMEOUT = 30
_WINDOWS_RESERVED_ZIP_NAMES = {"CON", "PRN", "AUX", "NUL"}
_WINDOWS_RESERVED_ZIP_NAMES.update(f"COM{i}" for i in range(1, 10))
_WINDOWS_RESERVED_ZIP_NAMES.update(f"LPT{i}" for i in range(1, 10))
_INVALID_WINDOWS_ZIP_CHARS = set('<>:"|?*')


def _valid_git_url(item_url: str) -> bool:
    try:
        parsed = urlsplit(item_url)
        return (parsed.scheme == "https" and parsed.hostname in _VALID_GIT_HOSTS
                and parsed.username is None and parsed.password is None
                and parsed.port in (None, 443)
                and bool(re.fullmatch(r"/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?", parsed.path)))
    except (TypeError, ValueError):
        return False


@contextlib.contextmanager
def _install_publish_guard(target_path, timeout=None, check_cancel=None):
    """同一目标的发布协调文件保持稳定，不随目标目录替换或解锁删除。"""
    timeout = _INSTALL_LOCK_TIMEOUT if timeout is None else timeout
    deadline = time.monotonic() + timeout
    while True:
        if check_cancel:
            check_cancel()
        remaining = max(0, deadline - time.monotonic())
        if _INSTALL_PUBLISH_LOCK.acquire(timeout=min(.05, remaining)):
            break
        if time.monotonic() >= deadline:
            raise TimeoutError('installation publication lock timed out')
    handle = None
    try:
        target = os.path.abspath(target_path)
        parent = os.path.realpath(os.path.dirname(target))
        key = os.path.normcase(os.path.join(parent, os.path.basename(target)))
        # 父目录只增加非Python普通文件，避免ComfyUI把协调目录当成插件加载。
        path = os.path.join(parent, '.ranking-install.' + hashlib.sha256(key.encode('utf-8')).hexdigest() + '.lock')
        # 不沿用预先存在的文件链接；POSIX同时以O_NOFOLLOW关闭文件打开竞态。
        if os.path.islink(path):
            raise ValueError('invalid installation coordination path')
        descriptor = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise ValueError('invalid installation coordination file')
            handle = os.fdopen(descriptor, 'r+b')
        except BaseException:
            os.close(descriptor)
            raise
        while True:
            if check_cancel:
                check_cancel()
            try:
                if sys.platform == 'win32':
                    import msvcrt
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError as error:
                if error.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    raise
                if time.monotonic() >= deadline:
                    raise TimeoutError('installation publication lock timed out') from None
                time.sleep(.05)
        if check_cancel:
            check_cancel()
        yield
    finally:
        try:
            if handle is not None:
                # 关闭句柄释放OS锁，协调文件保留，避免不同进程争用不同inode。
                handle.close()
        finally:
            _INSTALL_PUBLISH_LOCK.release()


def _install_journal_path(target_path):
    target = Path(target_path).absolute()
    parent = Path(os.path.realpath(target.parent))
    key = os.path.normcase(str(parent / target.name))
    return parent / ('.ranking-install.' + hashlib.sha256(key.encode('utf-8')).hexdigest() + '.json')


def _install_directory_identity(path):
    path = Path(os.path.realpath(Path(path).absolute().parent)) / Path(path).name
    if os.path.normcase(str(path.resolve())) != os.path.normcase(str(path.absolute())) or not path.is_dir():
        raise ValueError('invalid installation directory')
    info = path.stat()
    return [info.st_dev, info.st_ino]


def _write_install_journal(path, data):
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        with contextlib.suppress(OSError): os.unlink(temporary)


def _recover_install_target_locked(target_path):
    """调用方持有发布锁；验证磁盘记录和目录身份后恢复，不猜测外部变更。"""
    target = Path(os.path.realpath(Path(target_path).absolute().parent)) / Path(target_path).name
    journal = _install_journal_path(target)
    if not os.path.lexists(journal): return False
    if journal.is_symlink() or not journal.is_file() or journal.stat().st_size > 16384:
        raise ValueError('invalid installation journal')
    data = json.loads(journal.read_text(encoding='utf-8'))
    if (not isinstance(data, dict) or type(data.get('schema')) is not int or data['schema'] != 1
            or data.get('state') not in ('prepared', 'committed')
            or type(data.get('had_target')) is not bool
            or os.path.normcase(str(data.get('target'))) != os.path.normcase(target.name)):
        raise ValueError('invalid installation journal')
    paths = {}
    for field, kind in [('staging','(?:staging|extracting)'), ('backup','backup')]:
        name = data.get(field)
        pattern = re.escape(data['target']) + r'\.__' + kind + r'__\.[0-9a-f]{32}\.disabled'
        if not isinstance(name, str) or not re.fullmatch(pattern, name, flags=re.IGNORECASE if os.name == 'nt' else 0):
            raise ValueError('invalid installation journal path')
        paths[field] = target.parent / name
    for field in ['source_identity','old_identity']:
        value = data.get(field)
        if value is None and field == 'old_identity' and not data['had_target']: continue
        if not isinstance(value,list) or len(value)!=2 or any(type(n) is not int or n<0 for n in value):
            raise ValueError('invalid installation journal identity')
    stage, backup = paths['staging'], paths['backup']
    exists = {name:os.path.lexists(path) for name,path in [('target',target),('stage',stage),('backup',backup)]}
    if exists['stage'] and _install_directory_identity(stage) != data['source_identity']:
        raise ValueError('installation source changed')
    if exists['backup'] and (not data['had_target'] or _install_directory_identity(backup) != data['old_identity']):
        raise ValueError('installation backup changed')
    if data['state'] == 'committed':
        if not exists['target'] or exists['stage'] or _install_directory_identity(target) != data['source_identity']:
            raise ValueError('committed installation changed')
        if exists['backup']: shutil.rmtree(backup, onerror=_force_remove_readonly)
    elif exists['backup'] or not data['had_target']:
        if exists['target']:
            if exists['stage'] or _install_directory_identity(target) != data['source_identity']:
                raise ValueError('uncommitted installation changed')
            os.replace(target, stage)
        if exists['backup']: os.replace(backup, target)
    else:
        if not exists['target'] or _install_directory_identity(target) != data['old_identity']:
            raise ValueError('original installation changed')
    if data['state'] == 'prepared' and os.path.lexists(stage):
        # 恢复后的未提交新版本仍属于本次事务，清理完成后才移除恢复记录。
        shutil.rmtree(stage, onerror=_force_remove_readonly)
    journal.unlink()
    return True


def recover_installations(directory):
    """启动时按记录逐项恢复；繁忙/损坏项保留，不阻断其它插件路由。"""
    recovered = 0
    for journal in Path(os.path.realpath(directory)).glob('.ranking-install.' + '[0-9a-f]' * 64 + '.json'):
        try:
            if journal.is_symlink() or journal.stat().st_size > 16384: raise ValueError()
            data = json.loads(journal.read_text(encoding='utf-8'))
            name = data.get('target') if isinstance(data,dict) else None
            if (not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9_.-]+',name)
                    or name in ('.','..') or not _is_safe_zip_member_path(name)):
                raise ValueError('invalid recovery target')
            target = journal.parent / name
            if _install_journal_path(target) != journal: raise ValueError('journal target mismatch')
            with _install_publish_guard(str(target),timeout=.1):
                recovered += bool(_recover_install_target_locked(target))
        except Exception as error:
            print('[ComfyUI-Ranking] Installation recovery deferred: ' + type(error).__name__)
    return recovered


def _replace_directory_with_staging(staging_path: str, target_path: str, *, check_cancel=None):
    """发布完整暂存目录；失败时恢复旧目录。"""
    with _install_publish_guard(target_path, check_cancel=check_cancel):
        _recover_install_target_locked(target_path)
        target, stage = Path(target_path).absolute(), Path(staging_path).absolute()
        if (stage.parent.resolve()!=target.parent.resolve()
                or not re.fullmatch(re.escape(target.name)+r'\.__(?:staging|extracting)__\.[0-9a-f]{32}\.disabled', stage.name)):
            raise ValueError('invalid publication staging')
        backup_path = target_path + f".__backup__.{uuid.uuid4().hex}.disabled"
        journal = _install_journal_path(target_path)
        data = dict(schema=1,state='prepared',target=target.name,staging=stage.name,
                    backup=Path(backup_path).name,had_target=os.path.lexists(target),
                    source_identity=_install_directory_identity(stage),
                    old_identity=_install_directory_identity(target) if os.path.lexists(target) else None)
        _write_install_journal(journal, data)
        try:
            if data['had_target']:
                os.replace(target_path, backup_path)
            os.replace(staging_path, target_path)
            data['state'] = 'committed'
            _write_install_journal(journal, data)
        except Exception:
            _recover_install_target_locked(target_path)
            raise
        try:
            _recover_install_target_locked(target_path)
        except OSError as error:
            print('[ComfyUI-Ranking] Committed installation cleanup deferred: ' + type(error).__name__)


def _resolve_install_target(item_url: str):
    """🔒 P0安全加固：从 URL 推导安装目标目录，防御路径穿越
    返回 (target_dir_name, target_path)；非法时返回 (None, None)
    """
    if not isinstance(item_url, str):
        return None, None
    target_dir_name = item_url.rstrip("/").split("/")[-1]
    if target_dir_name.endswith(".git"):
        target_dir_name = target_dir_name[:-4]
    # 目录名白名单校验 + 显式拒绝相对路径段，杜绝 ".." 逃逸出 custom_nodes 目录
    if (not target_dir_name
            or not re.fullmatch(r'[A-Za-z0-9_\-.]+', target_dir_name)
            or target_dir_name in (".", "..")
            or ".." in target_dir_name
            or not _is_safe_zip_member_path(target_dir_name)):
        return None, None
    target_path = os.path.normpath(os.path.join(CUSTOM_NODES_DIR, target_dir_name))
    base = os.path.normpath(CUSTOM_NODES_DIR)
    if not target_path.startswith(base + os.sep):
        return None, None
    return target_dir_name, target_path


class _InstallControlError(Exception):
    def __init__(self, status=400, code='missing_params', message='无效的请求内容'):
        self.status, self.code, self.message = status, code, message


async def _control_rejection(request, error):
    response = web.json_response({'error': error.message, 'error_code': error.code}, status=error.status)
    response.force_close()
    transport = request.transport
    try:
        # 仅设置响应keep_alive不能阻止aiohttp的lingering正文排空。
        # 先交付小型错误响应，再关闭本请求连接；标准Transport.close会刷新发送缓冲。
        async with asyncio.timeout(INSTALL_CONTROL_IDLE_SECONDS):
            await response.prepare(request)
            await response.write_eof()
    finally:
        if transport is not None:
            transport.close()
    return response


def _check_control_connection(request):
    if request.transport is None or request.transport.is_closing():
        raise asyncio.CancelledError()


async def _acquire_control_capacity(request):
    """接收名额与执行安装名额分开；所有合作进程使用同目录固定锁。"""
    started = time.monotonic()
    waiting = active = None
    try:
        while True:
            _check_control_connection(request)
            if waiting is not None and time.monotonic()-started >= INSTALL_CONTROL_QUEUE_SECONDS:
                raise _InstallControlError(503, 'install_queue_timeout', '安装任务繁忙，请稍后重试。')
            active = _try_install_slot('control-capacity', INSTALL_CONTROL_CONCURRENCY)
            if active is not None:
                return active
            if waiting is None:
                waiting = _try_install_slot('control-waiting', INSTALL_CONTROL_MAX_QUEUED)
                if waiting is None:
                    raise _InstallControlError(503, 'install_queue_full', '安装队列已满，请稍后重试。')
            await asyncio.sleep(.05)
    finally:
        try:
            if waiting is not None:
                waiting.__exit__(None, None, None)
        except BaseException:
            if active is not None:
                with contextlib.suppress(Exception):
                    active.__exit__(None, None, None)
            raise


async def _read_install_parameters(request):
    """有界接收UTF-8控制JSON；深度扫描在json.loads分配对象之前。"""
    _control_reader.check_headers(request, INSTALL_CONTROL_MAX_BYTES, _InstallControlError)
    lease = await _acquire_control_capacity(request)
    try:
        return await _control_reader.read_json(request, max_bytes=INSTALL_CONTROL_MAX_BYTES,
            chunk_bytes=INSTALL_CONTROL_CHUNK_BYTES, max_depth=INSTALL_CONTROL_MAX_DEPTH,
            idle_seconds=INSTALL_CONTROL_IDLE_SECONDS, total_seconds=INSTALL_CONTROL_TOTAL_SECONDS,
            error=_InstallControlError, ensure_connected=_check_control_connection)
    finally:
        lease.__exit__(None, None, None)


async def install_preview_handler(request):
    """只读预览安装目录，供用户确认覆盖目标；不读取账号或访问网络。"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)
    try:
        data = await _read_install_parameters(request)
    except _InstallControlError as exc:
        return await _control_rejection(request, exc)
    except Exception:
        return web.json_response({"error": "无效的请求内容"}, status=400)
    item_url = data.get("url") if isinstance(data, dict) else None
    if not isinstance(item_url, str) or not _valid_git_url(item_url):
        return web.json_response({"error": "无效的 Git 仓库地址"}, status=400)
    target_dir_name, target_path = _resolve_install_target(item_url)
    if not target_dir_name:
        return web.json_response({"error": "安装目标目录名不合法"}, status=400)
    current_git_version = None
    if os.path.isdir(target_path) and os.path.lexists(os.path.join(target_path, ".git")):
        current_git_version = await _get_git_head_short(target_path, timeout=3)
    return web.json_response({
        "status": "success",
        "target_dir_name": target_dir_name,
        "target_display": f"custom_nodes/{target_dir_name}",
        "already_exists": os.path.lexists(target_path),
        "self_update": _is_self_update(target_dir_name),
        "current_git_version": current_git_version,
    })


def _detect_zip_top_level(namelist):
    """探测 ZIP 公共顶层目录（不依赖首条目，首条目为文件时返回 None 表示无顶层包裹）"""
    tops = {n.split('/', 1)[0] for n in namelist}
    if len(tops) == 1:
        top = next(iter(tops))
        # 仅当所有条目都位于该顶层目录下时才视为包裹目录
        if all(n.startswith(top + '/') for n in namelist):
            return top + '/'
    return None


def _is_local_request(request):
    """检查本机来源与浏览器 Origin，防止外站诱导本机安装插件（CSRF）。"""
    remote = request.remote or ""
    try:
        address = ipaddress.ip_address(remote.split("%", 1)[0])
        if getattr(address, "ipv4_mapped", None):
            address = address.ipv4_mapped
        if not address.is_loopback:
            return False
    except ValueError:
        return False
    origin = request.headers.get("Origin")
    if not origin:
        return True  # 本机 CLI/旧客户端不一定发送 Origin
    try:
        parsed = urlsplit(origin)
        host = (parsed.hostname or "").lower().rstrip(".")
        is_loopback_origin = host == "localhost" or ipaddress.ip_address(host).is_loopback
        origin_port = parsed.port or (443 if parsed.scheme == "https" else 80)
        request_port = request.url.port or (443 if request.scheme == "https" else 80)
        return (is_loopback_origin and parsed.scheme == request.scheme
                and origin_port == request_port)
    except ValueError:
        return False


def _prepare_git_env():
    """准备 Git 环境变量，防止 git 弹窗要求输入密码导致后台卡死"""
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"           # 禁止 Git Credential Manager 交互
    env["GIT_CONFIG_NOSYSTEM"] = "1"           # 禁用系统级 gitconfig（可能配置了 credential.helper）
    env["GCM_PROVIDER"] = ""                    # 清空 GCM provider，阻止任何凭证提供者
    env["GIT_ASKPASS"] = ""                     # 禁用 Git ASKPASS 外部程序
    env["SSH_ASKPASS"] = ""                     # 禁用 SSH ASKPASS 外部程序
    return env


def _force_remove_readonly(func, path, exc_info):
    """Windows 下强制删除只读文件（如 .git/objects/pack/*.idx）"""
    os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    func(path)


class _ZipTargetOccupiedError(Exception):
    """旧版本目录被 ComfyUI 进程占用，无法删除"""


class _InstallClientDisconnectedError(Exception):
    """安装进度连接已断开；只允许清理暂存文件，不再提交目标目录"""


def _raise_if_install_cancelled(cancel_event):
    if cancel_event is not None and cancel_event.is_set():
        raise _InstallClientDisconnectedError()


async def _watch_install_client(request, cancel_event):
    while not cancel_event.is_set():
        transport = request.transport
        if transport is None or transport.is_closing():
            cancel_event.set()
            return
        await asyncio.sleep(0.25)


def _check_install_request(request, cancel_event):
    transport = request.transport
    if cancel_event.is_set() or transport is None or transport.is_closing():
        cancel_event.set()
        raise _InstallClientDisconnectedError()


def _is_safe_zip_member_path(member: str) -> bool:
    """拒绝跨平台解压时可能变成绝对路径、NTFS ADS 或设备名的成员路径。"""
    if not isinstance(member, str) or not member or "\\" in member or member.startswith("/"):
        return False
    path = member[:-1] if member.endswith("/") else member
    if not path:
        return False
    for part in path.split("/"):
        if (not part or part in {".", ".."} or part.endswith((" ", "."))
                or any(ord(char) < 32 or char in _INVALID_WINDOWS_ZIP_CHARS for char in part)):
            return False
        device_stem = part.split(".", 1)[0].upper()
        if device_stem in _WINDOWS_RESERVED_ZIP_NAMES:
            return False
    return True


async def _stop_git_clone(proc, clone_task):
    """在当前请求内等真实进程退出；重复取消不能先结束文件拥有者。"""
    interrupted=False
    if proc is not None and proc.returncode is None:
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
    if proc is not None:
        while True:
            try:
                await proc.wait()
                break
            except asyncio.CancelledError:
                interrupted=True
    if clone_task is not None:
        while not clone_task.done():
            try:
                await asyncio.wait({clone_task})
            except asyncio.CancelledError:
                interrupted=True
        with contextlib.suppress(asyncio.CancelledError,Exception): clone_task.result()
    if proc is not None and hasattr(proc,'finish_tree'):
        while True:
            try:
                await proc.finish_tree()
                break
            except asyncio.CancelledError:
                interrupted=True
    if interrupted: raise asyncio.CancelledError()


def _publish_update_staging(extracted, staging, plugin_target, cancel_event):
    """只准备自更新暂存，不创建会被启动应用消费目标的普通安装记录。"""
    extracted, staging, plugin = Path(extracted).absolute(), Path(staging).absolute(), Path(plugin_target).absolute()
    if (staging.parent.resolve()!=plugin.parent.resolve()
            or not re.fullmatch(re.escape(plugin.name)+r'\.__staging__\.[0-9a-f]{32}\.disabled',staging.name)
            or extracted.parent.resolve()!=staging.parent.resolve()
            or not re.fullmatch(re.escape(staging.name)+r'\.__extracting__\.[0-9a-f]{32}\.disabled',extracted.name)):
        raise ValueError('invalid update staging target')
    _install_directory_identity(extracted)
    with _install_publish_guard(str(plugin),check_cancel=lambda: _raise_if_install_cancelled(cancel_event)):
        if os.path.lexists(staging):
            raise ValueError('update staging already exists')
        os.replace(str(extracted),str(staging))


def _extract_zip_to_target_sync(zip_path, extract_target_path, cancel_event=None, *, update_target=None):
    """同步解压例程，由安装资源拥有线程调用，避免阻塞事件循环。
    含三层路径穿越防护；压缩包为空抛 ValueError，旧目录被占用抛 _ZipTargetOccupiedError
    """
    staging_path = extract_target_path + f".__extracting__.{uuid.uuid4().hex}.disabled"
    with _zip_reader.BoundedZipArchive(
            zip_path, max_zip_bytes=MAX_ZIP_SIZE, max_entries=MAX_ZIP_FILE_COUNT,
            max_expanded_bytes=MAX_ZIP_EXPANDED_SIZE, max_member_bytes=MAX_ZIP_MEMBER_SIZE,
            max_directory_bytes=MAX_ZIP_DIRECTORY_BYTES,
            check_cancel=lambda: _raise_if_install_cancelled(cancel_event)) as zip_ref:
        infos = zip_ref.infolist()
        namelist = [info.filename for info in infos]
        if not infos:
            raise ValueError("下载的压缩包结构为空")
        if len(infos) > MAX_ZIP_FILE_COUNT:
            raise ValueError("压缩包文件数量超出限制")
        total_size = 0
        member_paths = {}
        path_text_bytes = 0
        for info in infos:
            zip_ref.check()
            if len(info.orig_filename) > MAX_ZIP_PATH_CHARS or len(info.filename) > MAX_ZIP_PATH_CHARS:
                raise ValueError("压缩包成员路径过长")
            # 新版 Python 会规范化成员名称，原始名称也必须通过同一安全规则。
            if (not _is_safe_zip_member_path(info.orig_filename)
                    or not _is_safe_zip_member_path(info.filename)):
                raise ValueError("压缩包包含当前系统不支持的文件路径")
            # 按大小写不敏感的路径树预检，避免 Windows 将不同条目合并或覆盖。
            parts = info.filename.rstrip("/").split("/")
            if len(parts) > MAX_ZIP_PATH_DEPTH:
                raise ValueError("压缩包成员路径嵌套过深")
            for index in range(len(parts)):
                zip_ref.check()
                path = "/".join(parts[:index + 1])
                is_directory = index < len(parts) - 1 or info.is_dir()
                key = path.casefold()
                previous = member_paths.get(key)
                if previous is not None:
                    previous_path, previous_is_directory = previous
                    if (path != previous_path or not is_directory or not previous_is_directory):
                        raise ValueError("压缩包包含重复、大小写冲突或文件目录冲突的路径")
                else:
                    path_text_bytes += len(path.encode('utf-8')) + len(key.encode('utf-8'))
                    if len(member_paths) >= MAX_ZIP_FILE_COUNT or path_text_bytes > MAX_ZIP_PATH_TEXT_BYTES:
                        raise ValueError("压缩包路径树超出资源限制")
                    member_paths[key] = (path, is_directory)
            if info.file_size < 0 or info.file_size > MAX_ZIP_MEMBER_SIZE:
                raise ValueError("压缩包单个文件超出解压限制")
            total_size += info.file_size
            if total_size > MAX_ZIP_EXPANDED_SIZE:
                raise ValueError("压缩包解压后总大小超出限制")
            if info.file_size > 1024 * 1024 and info.compress_size and info.file_size / info.compress_size > 1000:
                raise ValueError("压缩包压缩比异常，已拒绝解压")

        top_level_dir = _detect_zip_top_level(namelist)
        _require_install_space(os.path.dirname(os.path.abspath(staging_path)), total_size)
        os.makedirs(staging_path, exist_ok=False)

        try:
            total_written = 0
            for info in infos:
                _raise_if_install_cancelled(cancel_event)
                member = info.filename
                # 🚀 修复：无统一顶层包裹（首条目为文件/多顶层）时解压全部条目，不再漏装
                if top_level_dir and member.startswith(top_level_dir):
                    target_path = member.replace(top_level_dir, "", 1)
                else:
                    target_path = member
                if member.endswith('/') and info.file_size != 0:
                    raise ValueError("压缩包目录条目包含异常内容")
                if not target_path:
                    continue
                if not _is_safe_zip_member_path(target_path):
                    raise ValueError("压缩包包含当前系统不支持的文件路径")
                abs_target = os.path.normpath(os.path.join(staging_path, target_path))
                abs_base = os.path.normpath(staging_path)
                if os.path.commonpath([abs_target, abs_base]) != abs_base:
                    raise ValueError(f"压缩包包含越界路径: {target_path}")
                try:
                    resolved = Path(abs_target).resolve()
                    allowed = Path(abs_base).resolve()
                    if os.path.commonpath([str(resolved), str(allowed)]) != str(allowed):
                        raise ValueError(f"压缩包包含危险路径: {target_path}")
                except (OSError, RuntimeError):
                    raise ValueError(f"无法安全校验压缩包路径: {target_path}")

                dest_path = os.path.join(staging_path, target_path)
                if member.endswith('/'):
                    os.makedirs(dest_path, exist_ok=True)
                else:
                    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                    member_written = 0
                    with open(dest_path, "wb") as target:
                        for chunk in zip_ref.iter_member(info):
                            _raise_if_install_cancelled(cancel_event)
                            member_written += len(chunk)
                            total_written += len(chunk)
                            if member_written > MAX_ZIP_MEMBER_SIZE:
                                raise ValueError("压缩包单个文件实际解压大小超出限制")
                            if total_written > MAX_ZIP_EXPANDED_SIZE:
                                raise ValueError("压缩包实际解压总大小超出限制")
                            if member_written > info.file_size:
                                raise ValueError("压缩包实际内容超过声明大小")
                            _require_install_space(staging_path, len(chunk))
                            target.write(chunk)
                    if member_written != info.file_size:
                        raise ValueError("压缩包实际内容与声明大小不一致")
            zip_ref.check()
            _require_install_space(staging_path)
            try:
                if update_target is not None:
                    _publish_update_staging(staging_path,extract_target_path,update_target,cancel_event)
                else:
                    _replace_directory_with_staging(staging_path, extract_target_path,
                                                    check_cancel=lambda: _raise_if_install_cancelled(cancel_event))
            except OSError as exc:
                if getattr(exc, 'winerror', None) in (32, 33):
                    raise _ZipTargetOccupiedError() from exc
                raise
            return len(namelist)
        except Exception as exc:
            if os.path.exists(staging_path):
                shutil.rmtree(staging_path, onerror=_force_remove_readonly)
            raise


def _is_self_update(target_dir_name: str) -> bool:
    """判断是否为自更新（目标目录名与自身一致）"""
    self_dir_name = os.path.basename(THIS_DIR)
    return target_dir_name == self_dir_name


def _get_staging_path(clone_target_path: str) -> str:
    """获取暂存目录路径"""
    return clone_target_path + f".__staging__.{uuid.uuid4().hex}.disabled"


def _write_update_pending_marker(target_path: str, staging_path: str, *, check_cancel=None):
    """写入待应用更新标记"""
    marker = {
        "staging_dir": staging_path,
        "version": time.strftime("%Y%m%d%H%M%S"),
        "timestamp": time.time()
    }
    marker_path = os.path.join(target_path, ".update_pending")
    fd, temporary_path = tempfile.mkstemp(prefix=".update_pending.", suffix=".tmp", dir=target_path)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(marker, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        with _install_publish_guard(target_path, check_cancel=check_cancel):
            os.replace(temporary_path, marker_path)
    except Exception:
        with contextlib.suppress(OSError):
            os.remove(temporary_path)
        raise


class _JobProcess:
    def __init__(self,process,job): self.process=process; self.job=job
    def __getattr__(self,name): return getattr(self.process,name)
    def kill(self): self.job.terminate()
    async def finish_tree(self):
        self.job.terminate()
        while self.job.active(): await asyncio.sleep(.05)
        self.job.close()


async def _spawn_git_process(*command,lease_fd=None,**options):
    if sys.platform!='win32' and not sys.platform.startswith('linux'):
        return await asyncio.create_subprocess_exec(*command,**options)
    if command[0]=='git' and not shutil.which('git',path=options.get('env',os.environ).get('PATH')):
        raise FileNotFoundError('Git unavailable')
    import importlib.util
    helper=Path(__file__).with_name('process_guard.py')
    try:
        spec=importlib.util.spec_from_file_location('ranking_process_guard',helper)
        guard=importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
        job=guard.WindowsProcessJob() if sys.platform=='win32' else None
    except (OSError,ImportError):
        raise _GitInstallError('process_guard_unavailable','无法建立安装进程保护，请检查插件文件与宿主环境。') from None
    if sys.platform.startswith('linux'):
        try: read_fd,owner_fd=os.pipe()
        except OSError:
            raise _GitInstallError('process_guard_unavailable','无法建立安装进程保护，请检查插件文件与宿主环境。') from None
        process=None
        try:
            process=await asyncio.create_subprocess_exec(sys.executable,'-I',str(helper),
                '--owner-fd',str(read_fd),*command,stdin=asyncio.subprocess.DEVNULL,
                start_new_session=True,pass_fds=(read_fd,) if lease_fd is None else (read_fd,lease_fd),**options)
            protected=guard.LinuxProcessGroup(process,owner_fd)
            os.close(read_fd); read_fd=None
            os.write(owner_fd,b'\x01')
            return protected
        except BaseException as error:
            if process is not None:
                await _stop_git_clone(guard.LinuxProcessGroup(process,owner_fd),None)
                owner_fd=None
            if isinstance(error,OSError):
                raise _GitInstallError('process_guard_unavailable','无法建立安装进程保护，请检查插件文件与宿主环境。') from None
            raise
        finally:
            if read_fd is not None: os.close(read_fd)
            if process is None and owner_fd is not None: os.close(owner_fd)
    process=None
    assigned=False
    try:
        process=await asyncio.create_subprocess_exec(sys.executable,'-I',str(helper),*command,
            stdin=asyncio.subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW,**options)
        job.assign(process.pid)
        assigned=True
        process.stdin.write(b'\x01')
        await process.stdin.drain()
        process.stdin.close()
        return _JobProcess(process,job)
    except BaseException as error:
        try:
            if process is not None:
                if process.stdin is not None: process.stdin.close()
                await _stop_git_clone(_JobProcess(process,job) if assigned else process,None)
        finally: job.close()
        if isinstance(error,OSError):
            raise _GitInstallError('process_guard_unavailable','无法建立安装进程保护，请检查插件文件与宿主环境。') from None
        raise


async def _run_git_clone(url, target, env, timeout=1200, *, check_cancel=None, heartbeat=None, resource_check=None, lease_fd=None):
    """共享非交互克隆；输出不进内存，取消/超时均终止并收回子进程。"""
    if check_cancel:
        check_cancel()
    proc = await _spawn_git_process(
        "git", "-c", "credential.helper=", "clone", "--depth", "1", "--single-branch", "--no-tags", url, target,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        env=env,
        **({'lease_fd':lease_fd} if lease_fd is not None else {})
    )
    clone_task = asyncio.create_task(proc.wait())
    started = time.monotonic()
    last_progress_at = 0
    try:
        while not clone_task.done():
            if check_cancel:
                check_cancel()
            if resource_check:
                await resource_check()
            elapsed = time.monotonic() - started
            remaining = timeout - elapsed
            if remaining <= 0:
                raise subprocess.TimeoutExpired(["git", "clone"], timeout)
            await asyncio.wait({clone_task}, timeout=min(0.5, remaining))
            if heartbeat and not clone_task.done() and elapsed - last_progress_at >= 15:
                await heartbeat(elapsed)
                last_progress_at = elapsed
        if check_cancel:
            check_cancel()
        if resource_check:
            await resource_check()
        return await clone_task, b"", b""
    finally:
        await _stop_git_clone(proc, clone_task)


async def _get_git_head_short(target_path: str, timeout: int = 15, *, lease_fd=None):
    """读取已克隆仓库当前 HEAD 的 commit 短 hash（前 7 位）

    用途：安装成功后把"真实安装的版本"回传前端，作为本地版本戳（LocalVer）。
    与云端 versions.json 的 sha[:7] 格式严格对齐，保证卡片更新徽章比对准确。
    失败（无 .git / 未装 git / 异常）时返回 None，前端标记版本未确认。
    """
    proc = None
    try:
        proc = await _spawn_git_process(
            "git", "-C", target_path, "rev-parse", "HEAD",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            **({'lease_fd':lease_fd} if lease_fd is not None else {})
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        if proc.returncode == 0:
            head = (stdout or b"").decode("utf-8", errors="ignore").strip()
            return head[:7] if re.fullmatch(r"[0-9a-fA-F]{40}", head) else None
    except asyncio.CancelledError:
        raise
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass
    finally:
        await _stop_git_clone(proc,None)
    return None


class _GitInstallError(Exception):
    def __init__(self, code, message, status=500):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


MAX_GIT_STAGING_SIZE = 4 * 1024 * 1024 * 1024
MAX_GIT_STAGING_ENTRIES = 100000


def _check_git_install_resources(staging, cancel_event):
    """工作线程扫描暂存（含.git），不跟随链接；取消逐项检查。"""
    try:
        _require_install_space(Path(staging).parent)
        _install_directory_identity(staging)
        pending=[str(staging)]
        total=0
        count=0
        while pending:
            _raise_if_install_cancelled(cancel_event)
            directory=pending.pop()
            try:
                entries=os.scandir(directory)
            except FileNotFoundError:
                if directory==str(staging): raise
                continue  # Git可能刚移走临时对象目录。
            with entries:
                for entry in entries:
                    _raise_if_install_cancelled(cancel_event)
                    count+=1
                    if count>MAX_GIT_STAGING_ENTRIES:
                        raise _GitInstallError('repository_too_large','仓库内容超过安装安全上限。',413)
                    try:
                        info=entry.stat(follow_symlinks=False)
                    except FileNotFoundError:
                        continue
                    reparse=getattr(info,'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',0x400)
                    if stat.S_ISDIR(info.st_mode) and not reparse:
                        pending.append(entry.path)
                    else:
                        total+=info.st_size
                        if total>MAX_GIT_STAGING_SIZE:
                            raise _GitInstallError('repository_too_large','仓库内容超过安装安全上限。',413)
        _require_install_space(Path(staging).parent)
        return total,count
    except (OSError,ValueError) as error:
        if isinstance(error,OSError) and _is_install_disk_full(error):
            raise _GitInstallError('insufficient_disk_space','磁盘空间不足，请清理空间后重试。') from None
        raise _GitInstallError('git_clone_failed','无法检查克隆文件，请检查目录权限后重试。') from None


def _remove_install_staging(staging):
    if os.path.exists(staging):
        shutil.rmtree(staging, onerror=_force_remove_readonly)


async def _run_install_file_worker(operation, cancel_event, check_cancel=None):
    """文件拥有线程完成后才结束等待；取消不让调用方提前清理其文件。"""
    if check_cancel:
        check_cancel()
    worker = asyncio.get_running_loop().run_in_executor(None, operation)
    try:
        while not worker.done():
            if check_cancel:
                check_cancel()
            await asyncio.wait({worker}, timeout=.1)
        return worker.result()
    finally:
        if not worker.done():
            cancel_event.set()
        while not worker.done():
            try:
                # wait只取消自身等待，不取消worker，也不创建取消后的shield异常回调。
                await asyncio.wait({worker})
            except asyncio.CancelledError:
                cancel_event.set()
        with contextlib.suppress(Exception, asyncio.CancelledError):
            worker.result()


INSTALL_CONCURRENCY = 2
INSTALL_MAX_QUEUED = 8
INSTALL_QUEUE_TIMEOUT = 120


def _try_install_slot(kind, count):
    for index in range(count):
        lease=directory_lease(Path(CUSTOM_NODES_DIR)/('.ranking-'+kind+'-slot-'+str(index)))
        try:
            lease.__enter__()
        except TimeoutError:
            continue
        return lease
    return None


async def _acquire_install_capacity(cancel_event, *, request=None, send_progress=None,
                                    error_class=_GitInstallError):
    """同目录共享两个活跃和八个等待槽位；排队不占下载线程。"""
    started=time.monotonic()
    last_notice=None
    waiting_lease=None
    active_lease=None
    try:
        while True:
            if request is not None: _check_install_request(request,cancel_event)
            _raise_if_install_cancelled(cancel_event)
            if waiting_lease is not None and time.monotonic()-started>=INSTALL_QUEUE_TIMEOUT:
                raise error_class('install_queue_timeout','安装任务繁忙，请稍后重试。',503)
            lease=_try_install_slot('capacity',INSTALL_CONCURRENCY)
            if lease is not None:
                active_lease=lease
                try:
                    if request is not None: _check_install_request(request,cancel_event)
                    _raise_if_install_cancelled(cancel_event)
                    return lease
                except BaseException:
                    lease.__exit__(None,None,None)
                    active_lease=None
                    raise
            if waiting_lease is None:
                waiting_lease=_try_install_slot('waiting',INSTALL_MAX_QUEUED)
                if waiting_lease is None:
                    raise error_class('install_queue_full','安装队列已满，请稍后重试。',503)
            now=time.monotonic()
            if now-started>=INSTALL_QUEUE_TIMEOUT:
                raise error_class('install_queue_timeout','安装任务繁忙，请稍后重试。',503)
            if send_progress and (last_notice is None or now-last_notice>=15):
                await send_progress('queued',5,'等待其它安装任务完成...')
                last_notice=now
            await asyncio.sleep(.1)
    finally:
        try:
            if waiting_lease is not None: waiting_lease.__exit__(None,None,None)
        except BaseException:
            # 等待名额释放失败时不能丢失已经取得、尚未交给调用方的活跃句柄。
            if active_lease is not None:
                with contextlib.suppress(Exception): active_lease.__exit__(None,None,None)
            raise


async def _install_git_core(item_url, account, *, request=None, cancel_event=None, send_progress=None):
    """JSON/SSE共用校验、克隆、回退及发布；失败只清理本次暂存目录。"""
    cancel_event = cancel_event if cancel_event is not None else threading.Event()

    async def progress(stage, percent, message):
        if send_progress:
            await send_progress(stage, percent, message)

    def check_cancel():
        if request is not None:
            _check_install_request(request, cancel_event)
        else:
            _raise_if_install_cancelled(cancel_event)

    if not item_url or not account:
        raise _GitInstallError("missing_params", "缺少下载凭证或链接", 400)
    if not _valid_git_url(item_url):
        raise _GitInstallError("invalid_repository", "该资源链接不是有效的 Git 仓库地址，无法自动安装。请前往资源原始页面手动下载。", 400)
    check_cancel()
    await progress("validate", 5, "校验安装参数...")
    name, target = _resolve_install_target(item_url)
    if not name:
        raise _GitInstallError("invalid_target", "安装目标目录名不合法，已拦截", 400)
    is_self = _is_self_update(name)
    staging = _get_staging_path(target)
    committed = False
    staging_owned = False
    staging_lease = None
    staging_lease_fd = None
    capacity_lease = None

    def prepare_staging():
        nonlocal staging_owned, staging_lease, staging_lease_fd
        _raise_if_install_cancelled(cancel_event)
        staging_lease=directory_lease(staging)
        staging_lease_fd=staging_lease.__enter__()
        if sys.platform.startswith('linux') and (type(staging_lease_fd) is not int or staging_lease_fd<0):
            raise _GitInstallError('process_guard_unavailable','无法建立安装进程保护，请检查插件文件与宿主环境。')
        os.mkdir(staging)
        staging_owned = True

    def clear_staging():
        nonlocal staging_owned, staging_lease
        _remove_install_staging(staging)
        staging_owned = False
        if staging_lease is not None:
            staging_lease.__exit__(None,None,None); staging_lease=None

    def publish_installation():
        nonlocal committed
        thread_check = lambda: _raise_if_install_cancelled(cancel_event)
        if is_self:
            _write_update_pending_marker(target, staging, check_cancel=thread_check)
        else:
            _replace_directory_with_staging(staging, target, check_cancel=thread_check)
        # 在线程内记下提交；即使父请求此刻取消，自更新标记引用的暂存也必须保留。
        committed = True

    try:
        capacity_lease=await _acquire_install_capacity(cancel_event,request=request,
                                                      send_progress=send_progress)
        check_cancel()
        await progress("cleanup", 15, "准备安全暂存目录...")
        await _run_install_file_worker(prepare_staging, cancel_event, check_cancel)
        env = _prepare_git_env()
        mirror = item_url.replace("https://kkgithub.com", "https://github.com")

        async def heartbeat(elapsed):
            percent = min(30 + int(elapsed / 1200 * 50), 79)
            await progress("git_cloning", percent,
                           f"正在克隆仓库（浅克隆模式）... 已等待 {int(elapsed // 60)}分{int(elapsed % 60)}秒")

        async def resource_check():
            return await _run_install_file_worker(
                lambda: _check_git_install_resources(staging,cancel_event),cancel_event,check_cancel)

        await resource_check()
        await progress("git_mirror", 25, "尝试镜像源克隆...")
        await progress("git_cloning", 50, "正在克隆仓库（浅克隆模式）...")
        rc, _, _ = await _run_git_clone(mirror, staging, env, check_cancel=check_cancel,
                                      heartbeat=heartbeat,resource_check=resource_check,lease_fd=staging_lease_fd)
        if rc != 0:
            check_cancel()
            await progress("git_fallback", 55, "镜像失败，切换直连源...")
            await _run_install_file_worker(clear_staging, cancel_event, check_cancel)
            await _run_install_file_worker(prepare_staging, cancel_event, check_cancel)
            await progress("git_direct", 70, "正在直连克隆（浅克隆模式）...")
            await resource_check()
            rc, _, _ = await _run_git_clone(item_url, staging, env, check_cancel=check_cancel,
                                          heartbeat=heartbeat,resource_check=resource_check,lease_fd=staging_lease_fd)
            if rc != 0:
                raise _GitInstallError("git_clone_failed", "仓库克隆失败，请检查网络、代理或仓库权限。")
        check_cancel()
        await resource_check()
        if is_self:
            await _run_install_file_worker(publish_installation, cancel_event, check_cancel)
            return {"status": "success", "message": "✅ 新版本已准备就绪，重启 ComfyUI 即可生效！"}
        installed_version = await _get_git_head_short(staging,lease_fd=staging_lease_fd)
        check_cancel()
        await _run_install_file_worker(publish_installation, cancel_event, check_cancel)
        return {"status": "success", "installed_version": installed_version}
    except subprocess.TimeoutExpired:
        raise _GitInstallError("install_timeout", "安装超时：仓库过大或网络异常，请检查网络后重试", 504) from None
    except FileNotFoundError:
        raise _GitInstallError("git_missing", "系统中未检测到 Git，请先安装 Git 环境才能下载插件！") from None
    except OSError as error:
        classified = _install_file_error(error, _GitInstallError)
        if classified is not None:
            raise classified from None
        raise
    finally:
        try:
            if staging_owned and not committed:
                # 清理不检查已设置的取消事件；仍由一个线程持有，重复取消也等其收尾。
                await _run_install_file_worker(lambda: _remove_install_staging(staging), cancel_event)
        finally:
            try:
                if staging_lease is not None: staging_lease.__exit__(None,None,None)
            finally:
                if capacity_lease is not None: capacity_lease.__exit__(None,None,None)


async def install_tool_handler(request):
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)
    try:
        data = await _read_install_parameters(request)
        if not isinstance(data, dict):
            raise ValueError()
    except _InstallControlError as exc:
        return await _control_rejection(request, exc)
    except (ValueError, TypeError):
        return web.json_response({"error": "缺少下载凭证或链接"}, status=400)
    try:
        result = await _install_git_core(data.get("url"), data.get("account"),
                                         request=request, cancel_event=threading.Event())
        return web.json_response(result)
    except _GitInstallError as exc:
        return web.json_response({"error": exc.message, "error_code": exc.code}, status=exc.status)
    except _InstallClientDisconnectedError:
        raise asyncio.CancelledError() from None
    except Exception:
        return web.json_response({"error": "安装过程发生未知错误，请检查本地目录和网络后重试。"}, status=500)


_ZIP_PROXY_URL = "https://zhiwei666-comfyui-ranking-api.hf.space/api/proxy_github_zip"
_ZIP_SOCKET_TIMEOUT = 30
_ZIP_ATTEMPT_TIMEOUT = 1200


class _ZipInstallError(_GitInstallError):
    pass


class _ZipNoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 云端直接返回ZIP；不将本机收到的JWT发送到重定向目标。
        return None


def _cleanup_install_zip(path):
    if not path:
        return
    for attempt in range(5):
        try:
            os.unlink(path)
            return
        except FileNotFoundError:
            return
        except OSError:
            if attempt < 4:
                time.sleep(0.5)
    print("[ComfyUI-Ranking] ZIP临时文件清理暂未完成")


def _install_zip_sync(data, target, cancel_event, report):
    """单工作线程拥有响应、临时文件和解压；关闭后才清理，取消不重试。"""
    paths = []
    is_self = _is_self_update(os.path.basename(target))
    self_staging = _get_staging_path(target) if is_self else None
    self_staging_owned = False
    staging_lease = None
    committed = False
    try:
        if self_staging:
            staging_lease=directory_lease(self_staging)
            staging_lease.__enter__()
        payload = json.dumps({"url": data["url"], "item_id": data["id"], "account": data["account"]}).encode("utf-8")
        headers = {'Content-Type': 'application/json'}
        if data.get("token"):
            headers['Authorization'] = f"Bearer {data['token']}"
        opener = urllib.request.build_opener(_ZipNoRedirect())
        downloaded_path = None
        installed_version = None
        for attempt in range(3):
            _raise_if_install_cancelled(cancel_event)
            report("downloading", 30, "从云端下载资源包...")
            response = None
            try:
                started = time.monotonic()
                req = urllib.request.Request(_ZIP_PROXY_URL, data=payload, headers=headers)
                response = opener.open(req, timeout=_ZIP_SOCKET_TIMEOUT)
                _raise_if_install_cancelled(cancel_event)
                read_chunk = getattr(response, 'read1', response.read)
                version = response.headers.get('X-Installed-Version') or ''
                installed_version = version.lower() if re.fullmatch(r'[0-9a-fA-F]{40}', version) else None
                raw_length = response.headers.get('Content-Length')
                if raw_length is not None and (not isinstance(raw_length, str) or not re.fullmatch(r'[0-9]+', raw_length)):
                    raise _ZipInstallError("remote_rejected", "云端拒绝访问或无法获取资源，请检查权限和资源地址。", 403)
                length = int(raw_length) if raw_length is not None else 0
                if length > MAX_ZIP_SIZE:
                    raise _ZipInstallError("package_too_large", "ZIP 文件体积超过安全上限", 413)
                _require_install_space(tempfile.gettempdir(), length)
                downloaded = 0
                prefix = b''
                last_progress = time.monotonic()
                next_progress = 5 * 1024 * 1024
                with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temporary:
                    downloaded_path = temporary.name
                    paths.append(downloaded_path)
                    while True:
                        _raise_if_install_cancelled(cancel_event)
                        if time.monotonic() - started >= _ZIP_ATTEMPT_TIMEOUT:
                            raise TimeoutError()
                        # HTTPResponse.read1只做一次底层读取，慢速小块也能及时检查取消。
                        chunk = read_chunk(1024 * 1024)
                        _raise_if_install_cancelled(cancel_event)
                        if not chunk:
                            break
                        downloaded += len(chunk)
                        if downloaded > MAX_ZIP_SIZE:
                            raise _ZipInstallError("package_too_large", "ZIP 文件体积超过安全上限", 413)
                        if len(prefix) < 4:
                            prefix = (prefix + chunk)[:4]
                            if len(prefix) == 4 and prefix != b'PK\x03\x04':
                                raise _ZipInstallError("remote_rejected", "云端拒绝访问或无法获取资源，请检查权限和资源地址。", 403)
                        _require_install_space(os.path.dirname(temporary.name), len(chunk))
                        temporary.write(chunk)
                        now = time.monotonic()
                        if downloaded >= next_progress or now - last_progress >= 10:
                            percent = min(30 + int(downloaded / length * 30), 59) if length else min(30 + int(downloaded / (200 * 1024 * 1024) * 30), 59)
                            report("downloading", percent, "从云端下载资源包...")
                            last_progress = now
                            next_progress = downloaded + 5 * 1024 * 1024
                if length and downloaded != length:
                    raise http.client.IncompleteRead(b'')
                if prefix != b'PK\x03\x04':
                    raise _ZipInstallError("invalid_archive", "下载内容不是有效安装包，或压缩包结构不受支持。")
                break
            except urllib.error.HTTPError as exc:
                exc.close()
                raise _ZipInstallError("remote_rejected", "云端拒绝访问或无法获取资源，请检查权限和资源地址。") from None
            except (http.client.IncompleteRead, urllib.error.URLError, ConnectionResetError, TimeoutError):
                _raise_if_install_cancelled(cancel_event)
                if response is not None:
                    with contextlib.suppress(Exception):
                        response.close()
                    response = None
                if downloaded_path:
                    _cleanup_install_zip(downloaded_path)
                    downloaded_path = None
                if attempt == 2:
                    raise _ZipInstallError("download_failed", "下载多次中断（已重试3次），请检查网络后重试。") from None
                report("downloading", 10, "下载中断，准备重试...")
                if cancel_event.wait([2, 5][attempt]):
                    raise _InstallClientDisconnectedError()
            finally:
                if response is not None:
                    with contextlib.suppress(Exception):
                        response.close()
        _raise_if_install_cancelled(cancel_event)
        report("download_done", 60, "下载完成，准备解压...")
        report("extracting", 75, "解压安装文件...")
        try:
            _extract_zip_to_target_sync(downloaded_path, self_staging or target, cancel_event,
                                       update_target=target if is_self else None)
            self_staging_owned = is_self
        except _ZipTargetOccupiedError:
            raise _ZipInstallError("target_occupied", "旧版本文件正在被 ComfyUI 进程占用，无法覆盖更新。请彻底关闭控制台黑框，重新启动 ComfyUI 后再点击更新。") from None
        except (ValueError, zipfile.BadZipFile):
            raise _ZipInstallError("invalid_archive", "下载内容不是有效安装包，或压缩包结构不受支持。") from None
        if is_self:
            _raise_if_install_cancelled(cancel_event)
            _write_update_pending_marker(target, self_staging,
                                         check_cancel=lambda: _raise_if_install_cancelled(cancel_event))
            committed = True
            return {"status": "success", "message": "✅ 新版本已准备就绪，重启 ComfyUI 即可生效！"}
        committed = True
        return {"status": "success", "installed_version": installed_version}
    except OSError as error:
        classified = _install_file_error(error, _ZipInstallError)
        if classified is not None:
            raise classified from None
        raise
    finally:
        try:
            for path in paths:
                _cleanup_install_zip(path)
            if self_staging_owned and not committed and os.path.exists(self_staging):
                shutil.rmtree(self_staging, onerror=_force_remove_readonly)
        finally:
            if staging_lease is not None: staging_lease.__exit__(None,None,None)


async def _install_zip_core(data, *, request=None, cancel_event=None, send_progress=None):
    if not isinstance(data, dict) or not all(isinstance(data.get(key), str) and data[key] for key in ('url', 'id', 'account')) or (data.get('token') is not None and not isinstance(data['token'], str)):
        raise _ZipInstallError("missing_params", "缺少核心鉴权参数", 400)
    name, target = _resolve_install_target(data['url'])
    if not name:
        raise _ZipInstallError("invalid_target", "安装目标目录名不合法，已拦截", 400)
    cancel_event = cancel_event if cancel_event is not None else threading.Event()
    events = queue.Queue(maxsize=32)
    last_event = ("downloading", 30, "正在处理资源包...")

    def report(*event):
        while True:
            try:
                events.put_nowait(event)
                return
            except queue.Full:
                with contextlib.suppress(queue.Empty):
                    events.get_nowait()

    async def drain():
        nonlocal last_event
        while True:
            try:
                event = events.get_nowait()
            except queue.Empty:
                break
            last_event = event
            if send_progress:
                await send_progress(*event)

    if request is not None:
        _check_install_request(request, cancel_event)
    _raise_if_install_cancelled(cancel_event)
    if send_progress:
        await send_progress("validate", 5, "校验安装参数...")
    capacity_lease=await _acquire_install_capacity(cancel_event,request=request,
        send_progress=send_progress,error_class=_ZipInstallError)
    try:
        if send_progress:
            await send_progress("auth", 15, "验证购买权限...")
        # Executor Future不在all_tasks中；宿主取消所有Task时不会先取消线程外壳，
        # 请求仍能等待真正持有响应/文件的线程完成取消清理。
        worker = asyncio.get_running_loop().run_in_executor(None, _install_zip_sync, data, target, cancel_event, report)
        last_heartbeat = time.monotonic()
        try:
            while not worker.done():
                if request is not None:
                    _check_install_request(request, cancel_event)
                _raise_if_install_cancelled(cancel_event)
                await asyncio.wait({worker}, timeout=0.25)
                await drain()
                if send_progress and not worker.done() and time.monotonic() - last_heartbeat >= 15:
                    await send_progress(last_event[0], last_event[1], "正在处理资源包...")
                    last_heartbeat = time.monotonic()
            result = await worker
            await drain()
            return result
        finally:
            if not worker.done():
                cancel_event.set()
            # 不取消Executor Future；等资源拥有者关闭响应/文件并收取消异常。
            while not worker.done():
                try:
                    await asyncio.wait({worker})
                except asyncio.CancelledError:
                    cancel_event.set()
            with contextlib.suppress(Exception, asyncio.CancelledError):
                worker.result()
    finally:
        capacity_lease.__exit__(None,None,None)


async def install_private_tool_handler(request):
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)
    try:
        data = await _read_install_parameters(request)
    except _InstallControlError as exc:
        return await _control_rejection(request, exc)
    except (ValueError, TypeError):
        return web.json_response({"error": "缺少核心鉴权参数"}, status=400)
    try:
        return web.json_response(await _install_zip_core(data, request=request))
    except _ZipInstallError as exc:
        if exc.code == "download_failed":
            return web.json_response({"status": "error", "message": exc.message, "error_code": exc.code}, status=exc.status)
        return web.json_response({"error": exc.message, "error_code": exc.code}, status=exc.status)
    except _InstallClientDisconnectedError:
        raise asyncio.CancelledError() from None
    except Exception:
        return web.json_response({"error": "本地安装失败，请检查目标目录和磁盘状态后重试。"}, status=500)


async def install_tool_stream_handler(request):
    """SSE适配器；安装事务与旧JSON接口调用同一核心。"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)
    try:
        data = await _read_install_parameters(request)
        if not isinstance(data, dict):
            raise ValueError()
    except _InstallControlError as exc:
        return await _control_rejection(request, exc)
    except (ValueError, TypeError):
        return web.json_response({"error": "缺少下载凭证或链接"}, status=400)
    resp = web.StreamResponse(status=200, headers={
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
        'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
    })
    await resp.prepare(request)
    cancel_event = threading.Event()

    async def send_progress(stage, progress, message, status=None, **extra):
        event = {"stage": stage, "progress": progress, "message": message}
        if status:
            event["status"] = status
        event.update(extra)
        try:
            await resp.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode('utf-8'))
        except (ConnectionError, RuntimeError):
            cancel_event.set()
            raise _InstallClientDisconnectedError() from None

    try:
        result = await _install_git_core(data.get("url"), data.get("account"),
            request=request, cancel_event=cancel_event, send_progress=send_progress)
        extra = {"installed_version": result["installed_version"]} if "installed_version" in result else {}
        await send_progress("complete", 100, result.get("message", "✅ 安装成功！"), "success", **extra)
    except asyncio.CancelledError:
        cancel_event.set()
        raise
    except _InstallClientDisconnectedError:
        cancel_event.set()
        return resp
    except _GitInstallError as exc:
        try:
            await send_progress("error", -1, exc.message, "error", error_code=exc.code)
        except _InstallClientDisconnectedError:
            return resp
    except Exception:
        try:
            await send_progress("error", -1, "安装过程发生未知错误，请检查本地目录和网络后重试。", "error", error_code="install_failed")
        except _InstallClientDisconnectedError:
            return resp
    with contextlib.suppress(ConnectionError, RuntimeError):
        await resp.write_eof()
    return resp


async def install_private_tool_stream_handler(request):
    """私有ZIP的SSE适配器，资源生命周期由共享核心拥有。"""
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden: local access only"}, status=403)
    try:
        data = await _read_install_parameters(request)
    except _InstallControlError as exc:
        return await _control_rejection(request, exc)
    except (ValueError, TypeError):
        return web.json_response({"error": "缺少核心鉴权参数"}, status=400)
    resp = web.StreamResponse(status=200, headers={
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
        'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
    })
    await resp.prepare(request)
    cancel_event = threading.Event()

    async def send_progress(stage, progress, message, status=None, **extra):
        event = {"stage": stage, "progress": progress, "message": message}
        if status:
            event["status"] = status
        event.update(extra)
        try:
            await resp.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode('utf-8'))
        except (ConnectionError, RuntimeError):
            cancel_event.set()
            raise _InstallClientDisconnectedError() from None

    try:
        result = await _install_zip_core(data, request=request, cancel_event=cancel_event, send_progress=send_progress)
        await send_progress("installing", 90, "写入目标目录... 完成")
        extra = {"installed_version": result["installed_version"]} if "installed_version" in result else {}
        await send_progress("complete", 100, result.get("message", "✅ 安装成功！"), "success", **extra)
    except asyncio.CancelledError:
        cancel_event.set()
        raise
    except _InstallClientDisconnectedError:
        cancel_event.set()
        return resp
    except _ZipInstallError as exc:
        try:
            await send_progress("error", -1, exc.message, "error", error_code=exc.code)
        except _InstallClientDisconnectedError:
            return resp
    except Exception:
        try:
            await send_progress("error", -1, "本地安装失败，请检查目标目录和磁盘状态后重试。", "error", error_code="install_failed")
        except _InstallClientDisconnectedError:
            return resp
    with contextlib.suppress(ConnectionError, RuntimeError):
        await resp.write_eof()
    return resp
