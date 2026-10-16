"""Skill安装准备、覆盖预览与可恢复写入。"""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import time
import uuid

from .skill_packages import SkillPackageError, directory_identity, selected_target, check_selected_target


MAX_ENTRIES = 100000
MAX_BYTES = 4 * 1024**3
MAX_ITEMS = 1
MAX_JOURNAL = 1024 * 1024


def _identity(path):
    info = Path(path).lstat()
    if (stat.S_ISLNK(info.st_mode)
            or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)
            or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode))
            or stat.S_ISREG(info.st_mode) and info.st_nlink != 1):
        raise SkillPackageError('invalid_skill_package')
    return [info.st_dev, info.st_ino, 'directory' if stat.S_ISDIR(info.st_mode) else 'file']


def _exists(path):
    return os.path.lexists(path)


class _Budget:
    def __init__(self, factor=1):
        self.entries = self.size = self.text = 0
        self.factor = factor


class SkillPublications:
    def __init__(self, state_dir, *, safe_path, guard, lease, write_json, remove_tree, require_space, protected=()):
        self.on_commit = None
        self.state_dir = Path(state_dir).absolute()
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.state_identity = directory_identity(self.state_dir)
        if self.state_dir.resolve(strict=True) != self.state_dir:
            raise SkillPackageError('invalid_target')
        self.safe_path, self.guard, self.lease = safe_path, guard, lease
        self.write_json, self.remove_tree = write_json, remove_tree
        self.require_space = require_space
        self.protected = tuple(Path(path).resolve(strict=True) for path in protected)

    def _name(self, name):
        if (not isinstance(name, str) or not name or '/' in name or '\\' in name
                or not self.safe_path(name) or name.casefold() == '.git'
                or name.casefold().startswith('.ranking-')):
            raise SkillPackageError('invalid_skill_package')
        return name

    def _protect(self, path, *, root=False):
        for protected in self.protected:
            if path == protected or path.is_relative_to(protected) or (not root and protected.is_relative_to(path)):
                raise SkillPackageError('invalid_target')

    def _journal(self, plan_id):
        if not isinstance(plan_id, str) or not re.fullmatch('[0-9a-f]{32}', plan_id):
            raise SkillPackageError('invalid_plan')
        if (self.state_dir.resolve(strict=True) != self.state_dir
                or directory_identity(self.state_dir) != self.state_identity):
            raise SkillPackageError('invalid_plan')
        return self.state_dir / (plan_id + '.json')

    def _save(self, plan_id, data):
        if len(json.dumps(data | {'state': 'rolled_back'}).encode('utf-8')) > MAX_JOURNAL:
            raise SkillPackageError('package_too_large')
        self.write_json(self._journal(plan_id), data)

    @contextlib.contextmanager
    def _plan_lock(self, plan_id, check_cancel=None):
        journal = self._journal(plan_id)
        deadline = time.monotonic() + 30
        with contextlib.ExitStack() as stack:
            while True:
                if check_cancel:
                    check_cancel()
                try:
                    stack.enter_context(self.lease(str(journal)))
                    break
                except TimeoutError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(.05)
            yield

    def create(self, target):
        selection = selected_target(target)
        root = check_selected_target(selection)
        self._protect(root, root=True)
        plan_id = uuid.uuid4().hex
        container = root.parent / ('.ranking-skill.' + plan_id + '.disabled')
        self.require_space(root.parent)
        container.mkdir(mode=0o700)
        data = dict(schema=1, id=plan_id, state='preparing', target=selection,
                    container=str(container), identity=directory_identity(container), items=[])
        try:
            self._save(plan_id, data)
            (container / 'source').mkdir()
        except BaseException:
            # 在登记成功前未接收源码；不扩大清理范围。
            if not _exists(self._journal(plan_id)):
                self.remove_tree(container)
            raise
        return {'id': plan_id, 'source': str(container / 'source')}

    @staticmethod
    def _pair(value):
        return isinstance(value, list) and len(value) == 2 and all(type(n) is int and n >= 0 for n in value)

    @staticmethod
    def _entry_identity(value):
        return (isinstance(value, list) and len(value) == 3
                and SkillPublications._pair(value[:2]) and value[2] in ('file', 'directory'))

    def _read(self, plan_id, *, allow_missing_container=False):
        journal = self._journal(plan_id)
        if _identity(journal)[2] != 'file' or journal.stat().st_size > MAX_JOURNAL:
            raise SkillPackageError('invalid_plan')
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise SkillPackageError('invalid_plan')
                result[key] = value
            return result
        try:
            with journal.open('rb') as reader:
                raw = reader.read(MAX_JOURNAL + 1)
            if len(raw) > MAX_JOURNAL:
                raise SkillPackageError('invalid_plan')
            data = json.loads(raw.decode('utf-8'), object_pairs_hook=unique,
                              parse_constant=lambda _: (_ for _ in ()).throw(SkillPackageError('invalid_plan')))
        except (ValueError, RecursionError):
            raise SkillPackageError('invalid_plan') from None
        if (not isinstance(data, dict) or type(data.get('schema')) is not int or data['schema'] != 1
                or data.get('id') != plan_id or data.get('state') not in
                ('preparing', 'ready', 'prepared', 'committed', 'rolled_back', 'discarded')
                or not isinstance(data.get('target'), dict) or not isinstance(data['target'].get('path'), str)
                or not self._pair(data['target'].get('identity')) or not self._pair(data.get('identity'))
                or not isinstance(data.get('items'), list) or len(data['items']) > MAX_ITEMS):
            raise SkillPackageError('invalid_plan')
        root = check_selected_target(data['target'])
        self._protect(root, root=True)
        container = root.parent / ('.ranking-skill.' + plan_id + '.disabled')
        if data.get('container') != str(container):
            raise SkillPackageError('invalid_plan')
        if _exists(container):
            if directory_identity(container) != data['identity']:
                raise SkillPackageError('source_changed')
        elif not allow_missing_container or data['state'] not in ('committed', 'rolled_back', 'discarded'):
            raise SkillPackageError('source_changed')
        names = set()
        for row in data['items']:
            if not isinstance(row, dict):
                raise SkillPackageError('invalid_plan')
            name = self._name(row.get('name'))
            if name.casefold() in names or type(row.get('skill')) is not bool:
                raise SkillPackageError('invalid_plan')
            names.add(name.casefold())
            self._protect(root / name)
            for field in ('new_identity', 'old_identity'):
                if field == 'old_identity' and row.get(field) is None:
                    continue
                if not self._entry_identity(row.get(field)):
                    raise SkillPackageError('invalid_plan')
            for field in ('new_fingerprint', 'old_fingerprint'):
                if field == 'old_fingerprint' and row.get('old_identity') is None and row.get(field) is None:
                    continue
                if not isinstance(row.get(field), str) or not re.fullmatch('[0-9a-f]{64}', row[field]):
                    raise SkillPackageError('invalid_plan')
        if data['state'] != 'preparing' and data['state'] != 'discarded' and not data['items']:
            raise SkillPackageError('invalid_plan')
        return data, root, container

    def _scan(self, path, *, budget=None, check_cancel=None):
        path = Path(path)
        budget = budget or _Budget()
        rows = []
        if not _exists(path):
            return None
        pending = [(path, '')]
        while pending:
            if check_cancel:
                check_cancel()
            current, relative = pending.pop()
            identity = _identity(current)
            info = current.lstat()
            budget.entries += 1
            budget.text += len(relative.encode('utf-8'))
            if (budget.entries > MAX_ENTRIES * budget.factor or budget.text > 16 * 1024**2 * budget.factor
                    or len(relative) > 4096 or len(Path(relative).parts) > 128):
                raise SkillPackageError('package_too_large')
            rows.append((relative, identity[2], info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns))
            if identity[2] == 'directory':
                with os.scandir(current) as entries:
                    children = []; names = set()
                    for entry in entries:
                        if check_cancel:
                            check_cancel()
                        if entry.name.casefold() == '.git':
                            if relative or entry.name != '.git' or _identity(Path(entry.path))[2] != 'directory':
                                raise SkillPackageError('invalid_skill_package')
                        else:
                            self._name(entry.name)
                        if entry.name.casefold() in names:
                            raise SkillPackageError('invalid_skill_package')
                        names.add(entry.name.casefold())
                        children.append((Path(entry.path), '/'.join(filter(None, (relative, entry.name)))))
                        if len(children) + budget.entries > MAX_ENTRIES * budget.factor:
                            raise SkillPackageError('package_too_large')
                pending.extend(reversed(sorted(children, key=lambda item: item[1])))
            else:
                budget.size += info.st_size
                if budget.size > MAX_BYTES * budget.factor:
                    raise SkillPackageError('package_too_large')
        digest = hashlib.sha256()
        for row in rows:
            digest.update(json.dumps(row, ensure_ascii=True, separators=(',', ':')).encode('ascii'))
            digest.update(b'\n')
        return dict(identity=_identity(path), fingerprint=digest.hexdigest(), rows=rows,
                    files=sum(row[1] == 'file' for row in rows), bytes=sum(row[4] for row in rows if row[1] == 'file'))

    def _copy(self, source, target, scan, *, check_cancel=None, budget=None):
        budget = budget or _Budget()
        for relative, kind, device, inode, size, modified in scan['rows']:
            if check_cancel:
                check_cancel()
            origin = source / relative
            destination = target / relative
            if _exists(destination):
                raise SkillPackageError('target_conflict')
            budget.entries += 1
            if budget.entries > MAX_ENTRIES:
                raise SkillPackageError('package_too_large')
            if kind == 'directory':
                destination.mkdir()
            else:
                budget.size += size
                if budget.size > MAX_BYTES:
                    raise SkillPackageError('package_too_large')
                descriptor = os.open(origin, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0))
                with os.fdopen(descriptor, 'rb') as reader, destination.open('xb') as writer:
                    before = os.fstat(reader.fileno())
                    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (device, inode, size, modified):
                        raise SkillPackageError('source_changed')
                    remaining = size
                    while remaining:
                        if check_cancel:
                            check_cancel()
                        block = reader.read(min(64 * 1024, remaining))
                        if not block:
                            raise SkillPackageError('source_changed')
                        self.require_space(destination.parent, len(block))
                        writer.write(block)
                        remaining -= len(block)
                    after = os.fstat(reader.fileno())
                    if reader.read(1) or (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (device, inode, size, modified):
                        raise SkillPackageError('source_changed')
                    writer.flush()
                    os.fsync(writer.fileno())
                shutil.copystat(origin, destination, follow_symlinks=False)

    def prepare(self, plan_id, name, subdirectory=(), *, check_cancel=None):
        with self._plan_lock(plan_id, check_cancel):
            return self._prepare(plan_id, name, subdirectory, check_cancel=check_cancel)

    def _prepare(self, plan_id, name, subdirectory=(), *, check_cancel=None):
        data, root, container = self._read(plan_id)
        if data['state'] != 'preparing':
            raise SkillPackageError('invalid_plan')
        self._name(name)
        if subdirectory:
            raise SkillPackageError('invalid_repository')
        source = container / 'source'
        source_scan = self._scan(source, check_cancel=check_cancel)
        sources = [(name, source, True)]
        if len(sources) > MAX_ITEMS:
            raise SkillPackageError('package_too_large')
        (container / 'new').mkdir()
        (container / 'old').mkdir()
        rows = []; old_budget = _Budget(); new_budget = _Budget(); copy_budget = _Budget()
        for target_name, origin, skill in sorted(sources):
            self._name(target_name)
            target = root / target_name
            self._protect(target)
            old = self._scan(target, budget=old_budget, check_cancel=check_cancel)
            incoming = self._scan(origin, check_cancel=check_cancel)
            if old:
                if old['identity'][2] != incoming['identity'][2]:
                    raise SkillPackageError('target_conflict')
            prepared = container / 'new' / target_name
            self._copy(origin, prepared, incoming, check_cancel=check_cancel, budget=copy_budget)
            if old and self._scan(target, check_cancel=check_cancel)['fingerprint'] != old['fingerprint']:
                raise SkillPackageError('target_changed')
            new = self._scan(prepared, budget=new_budget, check_cancel=check_cancel)
            rows.append(dict(name=target_name, skill=skill, files=new['files'], bytes=new['bytes'],
                             old_identity=old['identity'] if old else None,
                             old_fingerprint=old['fingerprint'] if old else None,
                             new_identity=new['identity'], new_fingerprint=new['fingerprint']))
        if self._scan(source, check_cancel=check_cancel)['fingerprint'] != source_scan['fingerprint']:
            raise SkillPackageError('source_changed')
        check_selected_target(data['target'])
        data['items'], data['state'] = rows, 'ready'
        self._save(plan_id, data)
        return {'id': plan_id, 'target': str(root), 'items': [
            {key: row[key] for key in ('name', 'skill', 'files', 'bytes')} | {'exists': row['old_identity'] is not None}
            for row in rows]}

    @contextlib.contextmanager
    def _locks(self, root, items, check_cancel=None):
        deadline = time.monotonic() + 30
        with contextlib.ExitStack() as stack:
            # 先锁根，再按固定顺序锁子项，与原安装发布锁使用同一实现。
            stack.enter_context(self.guard(str(root), timeout=max(0, deadline-time.monotonic()), check_cancel=check_cancel))
            for row in sorted(items, key=lambda item: (item['name'].casefold(), item['name'])):
                stack.enter_context(self.guard(str(root / row['name']), timeout=max(0, deadline-time.monotonic()), check_cancel=check_cancel))
            yield

    def _cleanup(self, plan_id, data, container):
        if _exists(container):
            if directory_identity(container) != data['identity']:
                raise SkillPackageError('source_changed')
            self.remove_tree(container)
        self._journal(plan_id).unlink()

    def publish(self, plan_id, *, check_cancel=None, checkpoint=None):
        with self._plan_lock(plan_id, check_cancel):
            return self._publish(plan_id, check_cancel=check_cancel, checkpoint=checkpoint)

    def _publish(self, plan_id, *, check_cancel=None, checkpoint=None):
        data, root, container = self._read(plan_id)
        if data['state'] != 'ready':
            raise SkillPackageError('invalid_plan')
        with self._locks(root, data['items'], check_cancel):
            check_selected_target(data['target'])
            old_budget = _Budget(); new_budget = _Budget()
            for row in data['items']:
                old = self._scan(root / row['name'], budget=old_budget, check_cancel=check_cancel)
                new = self._scan(container / 'new' / row['name'], budget=new_budget, check_cancel=check_cancel)
                if (old['fingerprint'] if old else None) != row['old_fingerprint']:
                    raise SkillPackageError('target_changed')
                if not new or new['fingerprint'] != row['new_fingerprint']:
                    raise SkillPackageError('source_changed')
            if check_cancel:
                check_cancel()
            self.require_space(root)
            data['state'] = 'prepared'
            self._save(plan_id, data)
            try:
                for row in data['items']:
                    if check_cancel:
                        check_cancel()
                    name = row['name']
                    if row['old_identity'] is not None:
                        os.replace(root / name, container / 'old' / name)
                        if checkpoint:
                            checkpoint('old', name)
                    if check_cancel:
                        check_cancel()
                    os.replace(container / 'new' / name, root / name)
                    if checkpoint:
                        checkpoint('new', name)
                if check_cancel:
                    check_cancel()
                data['state'] = 'committed'
                self._save(plan_id, data)
            except Exception as error:
                error.outcome_unknown = True
                try:
                    self._recover_locked(plan_id, *self._read(plan_id))
                except Exception as recovery_error:
                    recovery_error.outcome_unknown = True
                    raise
                raise
            if checkpoint:
                checkpoint('committed', '')
            try:
                self._recover_locked(plan_id, data, root, container)
            except OSError:
                return {'status': 'success', 'cleanup_pending': True}
            except Exception as error:
                error.outcome_unknown = True
                raise
        return {'status': 'success', 'cleanup_pending': False}

    def _recover_locked(self, plan_id, data, root, container):
        if data['state'] in ('preparing', 'ready'):
            raise SkillPackageError('confirmation_required')
        if data['state'] == 'prepared':
            positions = []
            budget = _Budget(2)
            for row in data['items']:
                name = row['name']
                target, new, old = root / name, container / 'new' / name, container / 'old' / name
                values = [self._scan(path, budget=budget) for path in (target, new, old)]
                t, n, o = [scan['fingerprint'] if scan else None for scan in values]
                old_fp, new_fp = row['old_fingerprint'], row['new_fingerprint']
                if old_fp is None:
                    valid = o is None and ((t is None and n == new_fp) or (t == new_fp and n is None))
                else:
                    valid = ((t == old_fp and n == new_fp and o is None)
                             or (t is None and n == new_fp and o == old_fp)
                             or (t == new_fp and n is None and o == old_fp))
                if not valid:
                    raise SkillPackageError('recovery_conflict')
                positions.append((target, new, old, t == new_fp, o is not None))
            # 所有位置均核实后才开始回滚，未知外部变更不会触发猜测清理。
            for target, new, old, installed, backed_up in reversed(positions):
                if installed:
                    os.replace(target, new)
                if backed_up:
                    os.replace(old, target)
            data['state'] = 'rolled_back'
            self._save(plan_id, data)
        elif data['state'] == 'committed':
            for row in data['items']:
                target, new, old = root / row['name'], container / 'new' / row['name'], container / 'old' / row['name']
                if not _exists(target) or _identity(target) != row['new_identity'] or _exists(new):
                    raise SkillPackageError('recovery_conflict')
                if _exists(old) and _identity(old) != row['old_identity']:
                    raise SkillPackageError('recovery_conflict')
        if data['state'] == 'committed' and self.on_commit is not None:
            self.on_commit(plan_id, data)
        self._cleanup(plan_id, data, container)

    def recover(self, plan_id):
        with self._plan_lock(plan_id):
            data, root, container = self._read(plan_id, allow_missing_container=True)
            with self._locks(root, data['items']):
                check_selected_target(data['target'])
                self._recover_locked(plan_id, data, root, container)

    def discard(self, plan_id):
        with self._plan_lock(plan_id):
            data, root, container = self._read(plan_id, allow_missing_container=True)
            with self._locks(root, data['items']):
                if data['state'] in ('prepared', 'committed', 'rolled_back'):
                    self._recover_locked(plan_id, data, root, container)
                else:
                    data['state'] = 'discarded'
                    self._save(plan_id, data)
                    self._cleanup(plan_id, data, container)
