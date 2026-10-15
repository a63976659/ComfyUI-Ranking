"""无需宿主或网络依赖的启动自更新事务与恢复。"""
import contextlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
import uuid
import hashlib
import errno
import sys
import time


@contextlib.contextmanager
def directory_lease(directory, timeout=0):
    """稳定OS协调文件；不依赖aiohttp，不删除锁文件或阻塞后降级。"""
    path=Path(directory).absolute()
    parent=Path(os.path.realpath(path.parent))
    key=os.path.normcase(str(parent/path.name))
    lock=parent/('.ranking-install.'+hashlib.sha256(key.encode('utf-8')).hexdigest()+'.lock')
    if lock.is_symlink(): raise ValueError('invalid directory lease')
    fd=os.open(lock,os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode): raise ValueError('invalid directory lease')
        with os.fdopen(fd,'r+b') as stream:
            fd=None
            deadline=time.monotonic()+timeout
            while True:
                try:
                    if sys.platform=='win32':
                        import msvcrt
                        stream.seek(0); msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
                    else:
                        import fcntl
                        fcntl.flock(stream.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
                    break
                except OSError as error:
                    if error.errno not in (errno.EACCES,errno.EAGAIN,errno.EDEADLK): raise
                    if time.monotonic()>=deadline: raise TimeoutError('directory lease busy') from None
                    time.sleep(.05)
            # Linux保护进程可继承同一open-file-description，父进程退出不先解锁。
            # 退出只关闭本端，不调用LOCK_UN，其他持有者仍保留flock。
            yield stream.fileno()
    finally:
        if fd is not None: os.close(fd)


PENDING = ".update_pending"
JOURNAL = ".update_journal"
BOOTSTRAP = ("update_engine.py", "__init__.py")
PRESERVED = {PENDING, JOURNAL, "缓存", "__pycache__"}


def _sibling(plugin, value, kind):
    if not isinstance(value, str) or not value:
        raise ValueError("Invalid update directory")
    raw = Path(os.path.abspath(value))
    # 归一真实父目录以兼容Windows8.3/目录别名；叶节点仍保留以拒绝链接。
    candidate = Path(os.path.realpath(raw.parent)) / raw.name
    prefix = plugin.name + ".__" + kind + "__"
    suffix = candidate.name[len(prefix):] if os.path.normcase(candidate.name).startswith(os.path.normcase(prefix)) else None
    if (candidate.parent != plugin.parent or suffix is None
            or not ((suffix == "" and kind == "staging") or re.fullmatch(r"\.[0-9a-f]{32}(?:\.disabled)?", suffix))
            or os.path.normcase(str(candidate.resolve())) != os.path.normcase(str(candidate))):
        raise ValueError("Unsafe update directory")
    return candidate


def _names(value):
    if (not isinstance(value, list) or len(set(value)) != len(value)
            or any(not isinstance(name, str) or not name or name in PRESERVED
                   or name in {".", ".."} or "/" in name or "\\" in name
                   or ":" in name or name.endswith((".", " ")) for name in value)):
        raise ValueError("Invalid update member names")
    return value


def _write_journal(plugin, data):
    fd, path = tempfile.mkstemp(prefix=JOURNAL + ".", suffix=".tmp", dir=plugin)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(path, plugin / JOURNAL)
    finally:
        with contextlib.suppress(OSError):
            os.unlink(path)


def _remove_readonly(function, path, _exception):
    os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    function(path)


def _remove(path):
    # 链接本身可删除，但绝不能递归删除其指向的外部目录。
    if path.is_symlink():
        path.unlink()
    elif path.is_dir():
        if os.path.normcase(str(path.resolve())) != os.path.normcase(str(path.absolute())):
            os.rmdir(path)
        else:
            shutil.rmtree(path, onerror=_remove_readonly)
    elif path.exists():
        os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
        path.unlink()


def _replace_bootstrap(source, destination):
    if destination.exists() and not destination.is_symlink() and destination.is_file():
        os.chmod(destination, stat.S_IWRITE | stat.S_IREAD)
    os.replace(source, destination)


def _validate_staging(staging):
    if not staging.is_dir():
        raise ValueError("Missing staging directory")
    required = ('__init__.py', 'update_engine.py', '后端文件/api_app.py', '后端文件/api_cache.py', '后端文件/api_tool.py', '后端文件/control_request.py', '后端文件/frontend_assets.py', '后端文件/media_proxy.py', '后端文件/media_transfer.py', '后端文件/process_guard.py', '后端文件/workflow_response.py', '后端文件/zip_install_reader.py', '前端页面/core/侧边栏入口注册.js')
    for name in required:
        if not (staging / name).is_file():
            raise ValueError("Incomplete update")
    if any((staging / name).exists() for name in (PENDING, JOURNAL)):
        raise ValueError("Update contains control files")
    for directory, directories, files in os.walk(staging, followlinks=False):
        for name in directories + files:
            path = Path(directory) / name
            if (path.is_symlink()
                    or os.path.normcase(str(path.resolve())) != os.path.normcase(str(path.absolute()))):
                raise ValueError("Update contains linked paths")
            if path.suffix == ".py" and path.is_file():
                compile(path.read_bytes(), str(path), "exec", dont_inherit=True)


def _finish_committed(plugin, staging, backup):
    # 保留日志直到清理全部成功，下次启动只重试清理，不回滚已提交版本。
    _remove(backup)
    _remove(staging)
    _remove(plugin / "__pycache__")
    _remove(plugin / PENDING)
    _remove(plugin / JOURNAL)


def _recover(plugin, data):
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise ValueError("Unsupported update journal")
    staging = _sibling(plugin, data.get("staging_dir"), "staging")
    backup = _sibling(plugin, data.get("backup_dir"), "rollback")
    old_names = _names(data.get("old_names"))
    new_names = _names(data.get("new_names"))
    if data.get("state") == "committed":
        _finish_committed(plugin, staging, backup)
        return "committed"
    if data.get("state") != "prepared" or not staging.is_dir() or not backup.is_dir():
        raise ValueError("Incomplete recovery data")
    # staging 中缺失且目标中存在的条目已安装，移回 staging 后才能恢复旧版本。
    for name in reversed(new_names):
        current, source = plugin / name, staging / name
        if not source.exists() and (current.exists() or current.is_symlink()):
            if name in BOOTSTRAP:
                shutil.copy2(current, source)
            else:
                os.replace(current, source)
    for name in old_names:
        saved, current = backup / name, plugin / name
        if saved.exists() or saved.is_symlink():
            if current.is_dir():
                _remove(current)
            if name in BOOTSTRAP:
                _replace_bootstrap(saved, current)
            else:
                os.replace(saved, current)
    _remove(plugin / JOURNAL)
    _remove(backup)
    return "rolled_back"


def _apply_pending_update_unlocked(plugin_dir):
    """成功返回 applied/committed；失败恢复旧版本，日志仅记录异常类别。"""
    plugin = Path(plugin_dir).resolve()
    journal = plugin / JOURNAL
    pending = plugin / PENDING
    if journal.exists():
        try:
            result = _recover(plugin, json.loads(journal.read_text(encoding="utf-8")))
            print("[ComfyUI-Ranking] Update recovery: " + result)
            return result
        except Exception as error:
            print("[ComfyUI-Ranking] Update recovery failed: " + type(error).__name__)
            return "recovery_failed"
    if not pending.exists():
        return "none"
    backup = None
    try:
        info = json.loads(pending.read_text(encoding="utf-8"))
        if not isinstance(info, dict):
            raise ValueError("Invalid update marker")
        staging = _sibling(plugin, info.get("staging_dir"), "staging")
        _validate_staging(staging)
        old_names = _names([path.name for path in plugin.iterdir() if path.name not in PRESERVED])
        new_names = _names([path.name for path in staging.iterdir() if path.name not in PRESERVED])
        backup = plugin.parent / (plugin.name + ".__rollback__." + uuid.uuid4().hex + '.disabled')
        backup = _sibling(plugin, str(backup), "rollback")
        backup.mkdir()
        # 恢复引擎与入口一直存在；替换时使用原子文件替换，旧文件先复制到备份。
        for name in BOOTSTRAP:
            if name in old_names:
                shutil.copy2(plugin / name, backup / name, follow_symlinks=False)
        data = dict(schemaVersion=1, state="prepared", staging_dir=str(staging), backup_dir=str(backup),
                    old_names=old_names, new_names=new_names)
        _write_journal(plugin, data)
        for name in old_names:
            if name not in BOOTSTRAP:
                os.replace(plugin / name, backup / name)
        ordered = [name for name in new_names if name not in BOOTSTRAP]
        ordered += [name for name in BOOTSTRAP if name in new_names]
        for name in ordered:
            if name in BOOTSTRAP:
                _replace_bootstrap(staging / name, plugin / name)
            else:
                os.replace(staging / name, plugin / name)
        data["state"] = "committed"
        _write_journal(plugin, data)
        _finish_committed(plugin, staging, backup)
        print("[ComfyUI-Ranking] Update applied successfully")
        return "applied"
    except Exception as error:
        print("[ComfyUI-Ranking] Update failed: " + type(error).__name__)
        if journal.exists():
            try:
                # 以磁盘上已 fsync 的日志判定提交点，不依赖内存中的 state。
                return _recover(plugin, json.loads(journal.read_text(encoding="utf-8")))
            except Exception as recovery_error:
                print("[ComfyUI-Ranking] Update rollback failed: " + type(recovery_error).__name__)
                return "recovery_failed"
        if backup is not None:
            with contextlib.suppress(OSError):
                _remove(backup)
        return "failed"


def _apply_with_staging_lease(plugin):
    control=plugin/JOURNAL if (plugin/JOURNAL).exists() else plugin/PENDING
    staging=None
    try:
        if control.exists():
            info=json.loads(control.read_text(encoding='utf-8'))
            staging=_sibling(plugin,info.get('staging_dir'),'staging')
    except (OSError,ValueError,TypeError,AttributeError):
        pass  # 原事务函数负责报告控制记录异常，不能猜测暂存来源。
    with contextlib.ExitStack() as leases:
        if staging is not None: leases.enter_context(directory_lease(staging))
        return _apply_pending_update_unlocked(plugin)


@contextlib.contextmanager
def startup_session(plugin_dir, timeout=30):
    """保持插件锁至业务导入/路由注册结束，不加载恢复失败的混合目录。"""
    plugin=Path(plugin_dir).resolve()
    with directory_lease(plugin, timeout=timeout):
        try:
            status=_apply_with_staging_lease(plugin)
        except TimeoutError:
            # 只有未提交准备可以继续加载现有版本；事务现场必须先完成恢复。
            if (plugin/JOURNAL).exists(): raise
            status='busy'
            print('[ComfyUI-Ranking] Update deferred: active staging owner')
        if status=='recovery_failed':
            raise RuntimeError('startup recovery incomplete')
        try:
            _cleanup_stale_staging_unlocked(plugin)
        except (OSError,ValueError) as error:
            # 残留清理失败不影响已经恢复完整的版本加载。
            print('[ComfyUI-Ranking] Staging cleanup deferred: '+type(error).__name__)
        yield status


def apply_pending_update(plugin_dir):
    plugin=Path(plugin_dir).resolve()
    try:
        with directory_lease(plugin):
            return _apply_with_staging_lease(plugin)
    except TimeoutError:
        print('[ComfyUI-Ranking] Update deferred: active directory owner')
        return 'busy'
    except (OSError,ValueError) as error:
        print('[ComfyUI-Ranking] Update coordination failed: '+type(error).__name__)
        return 'failed'


def _cleanup_stale_staging_unlocked(plugin_dir):
    """事务存在时不清理；只删除名称与边界验证通过的兄弟暂存目录。"""
    plugin = Path(plugin_dir).resolve()
    if (plugin / JOURNAL).exists():
        return
    pending = None
    marker = plugin / PENDING
    if marker.exists():
        try:
            info = json.loads(marker.read_text(encoding="utf-8"))
            pending = _sibling(plugin, info.get("staging_dir"), "staging")
        except (OSError, ValueError, TypeError, AttributeError):
            # 标记异常时保留所有暂存，避免删除可能用于恢复的数据。
            return
    for candidate in plugin.parent.iterdir():
        if not candidate.name.startswith(plugin.name + ".__staging__") or candidate == pending:
            continue
        try:
            safe = _sibling(plugin, str(candidate), "staging")
            with directory_lease(safe):
                safe=_sibling(plugin,str(safe),'staging')
                if safe.is_dir(): _remove(safe)
        except (OSError, ValueError):
            print("[ComfyUI-Ranking] Staging cleanup skipped")


def cleanup_stale_staging(plugin_dir):
    try:
        with directory_lease(Path(plugin_dir).resolve()):
            return _cleanup_stale_staging_unlocked(plugin_dir)
    except (OSError,ValueError) as error:
        print('[ComfyUI-Ranking] Staging cleanup deferred: '+type(error).__name__)
