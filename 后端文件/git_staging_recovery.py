"""普通 Windows Git 克隆的暂存归属记录。供宿主和标准库监护进程共用。"""
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid


_RECORD_PREFIX = '.ranking-clone.'
_RECORD_SUFFIX = '.json'
_STAGING_GLOB = '.rk..' + '[0-9a-f]' * 16 + '.' + '[0-9a-f]' * 20 + '.disabled'
RECORD_GLOB = _RECORD_PREFIX + _STAGING_GLOB + _RECORD_SUFFIX
_MAX_RECORD_BYTES = 8192
_REPARSE_POINT = getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)


def windows_staging_prefix(target_name):
    key = os.path.normcase(target_name).encode('utf-8')
    # 受支持的仓库名不允许连续点，不能占用暂存命名空间。
    return '.rk..' + hashlib.sha256(key).hexdigest()[:16] + '.'


def _stage_path(staging):
    stage = Path(staging).absolute()
    return stage.parent.resolve(strict=True) / stage.name


def _record_path(staging):
    return staging.with_name(_RECORD_PREFIX + staging.name + _RECORD_SUFFIX)


def staging_for_record(record):
    return record.with_name(record.name.removeprefix(_RECORD_PREFIX).removesuffix(_RECORD_SUFFIX))


def _identity(info):
    return [info.st_dev, info.st_ino]


def _directory_identity(path):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or getattr(info, 'st_file_attributes', 0) & _REPARSE_POINT:
        raise ValueError('invalid clone directory')
    return _identity(info)


def _regular_record(info):
    return (stat.S_ISREG(info.st_mode) and info.st_nlink == 1
            and not getattr(info, 'st_file_attributes', 0) & _REPARSE_POINT)


def _valid_names(target, staging):
    return (isinstance(target, str) and isinstance(staging, str)
            and bool(re.fullmatch(r'[A-Za-z0-9_.-]+', target))
            and '..' not in target and not target.endswith('.')
            and bool(re.fullmatch(re.escape(windows_staging_prefix(target)) + r'[0-9a-f]{20}\.disabled', staging)))


def read_clone_record(path):
    before = path.lstat()
    if not _regular_record(before) or before.st_size > _MAX_RECORD_BYTES:
        raise ValueError('invalid clone record file')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0))
    with os.fdopen(fd, 'rb') as stream:
        current = os.fstat(stream.fileno())
        if not _regular_record(current) or _identity(current) != _identity(before):
            raise ValueError('clone record replaced')
        raw = stream.read(_MAX_RECORD_BYTES + 1)
    if len(raw) > _MAX_RECORD_BYTES:
        raise ValueError('invalid clone record size')
    data = json.loads(raw.decode('utf-8'))
    if (not isinstance(data, dict) or type(data.get('schema')) is not int or data['schema'] != 1
            or data.get('state') not in ('created', 'active', 'settled')
            or not _valid_names(data.get('target'), data.get('staging'))
            or not isinstance(data.get('generation'), str)
            or not re.fullmatch(r'[0-9a-f]{32}', data['generation'])
            or _record_path(path.parent / data['staging']) != path):
        raise ValueError('invalid clone record')
    for key in ('parent_identity', 'staging_identity'):
        identity = data.get(key)
        if (not isinstance(identity, list) or len(identity) != 2
                or any(type(value) is not int or value < 0 for value in identity)):
            raise ValueError('invalid clone record identity')
    return data


def _write_record(path, data, *, create=False):
    fd, temporary = tempfile.mkstemp(prefix='.ranking-clone-', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        if create:
            # Windows 的 rename 不覆盖已有目标。碰撞记录保持原样。
            os.rename(temporary, path)
        else:
            os.replace(temporary, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary)


def create_clone_record(staging, target):
    """宿主独占创建目录后、允许任何 Git 写入前记录身份。"""
    stage = _stage_path(staging)
    target = Path(target).absolute()
    if target.parent.resolve(strict=True) != stage.parent or not _valid_names(target.name, stage.name):
        raise ValueError('invalid clone destination')
    generation = uuid.uuid4().hex
    _write_record(_record_path(stage), {
        'schema': 1, 'state': 'created', 'generation': generation,
        'target': target.name, 'staging': stage.name,
        'parent_identity': _directory_identity(stage.parent),
        'staging_identity': _directory_identity(stage),
    }, create=True)
    return generation


def _load_owned_record(stage, generation, *, require_directory=False):
    path = _record_path(stage)
    data = read_clone_record(path)
    if ((generation is not None and data['generation'] != generation) or data['staging'] != stage.name
            or _directory_identity(stage.parent) != data['parent_identity']):
        raise ValueError('clone ownership changed')
    if (require_directory or os.path.lexists(stage)) and _directory_identity(stage) != data['staging_identity']:
        raise ValueError('clone directory changed')
    return path, data


@contextlib.contextmanager
def idle_clone_record(staging, generation, lease, *, require_settled=False):
    """宿主或恢复器持有暂存租约时，核对并排除仍可启动的 Git 写入者。"""
    stage = _stage_path(staging)
    with lease(_record_path(stage)):
        path, data = _load_owned_record(stage, generation, require_directory=require_settled)
        if data['state'] == 'active' or (require_settled and data['state'] != 'settled'):
            raise ValueError('clone writer has no confirmed terminal state')
        yield path, data


@contextlib.contextmanager
def windows_clone_writer(staging, generation, lock_directory):
    """仅监护进程调用。异常退出保留 active，等待人工核实。"""
    spec = importlib.util.spec_from_file_location(
        'ranking_clone_directory_lease', Path(__file__).resolve().parents[1] / 'update_engine.py')
    engine = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engine)
    stage = _stage_path(staging)
    with engine.directory_lease(_record_path(stage), lock_directory=lock_directory):
        path, data = _load_owned_record(stage, generation, require_directory=True)
        if data['state'] != 'created':
            raise ValueError('clone writer already started')
        data['state'] = 'active'
        _write_record(path, data)
        yield
        data['state'] = 'settled'
        _write_record(path, data)
