"""Skill准备与确认的所属请求协调。"""
import asyncio
import contextlib
from pathlib import Path
import threading
import json
import re
import os
import signal
import subprocess
import sys
import time
from aiohttp import web
from . import api_tool as api

from .skill_packages import browse_target, parse_source, selected_target, check_selected_target, directory_identity, SkillPackageError
from .skill_publication import SkillPublications
from .skill_install_session import SkillInstallSessions, validate_credentials, fetch_install_source, decode_archive_source


DIRECTORY_OPEN_SECONDS = 5


def _open_directory(value, event):
    selection = selected_target(value)
    path = Path(value)
    if path != Path(selection['path']) or path.anchor.startswith('\\\\'):
        raise SkillPackageError('invalid_target')
    check_selected_target(selection)
    api._raise_if_install_cancelled(event)
    try:
        if sys.platform == 'win32':
            os.startfile(str(path), 'explore')
        else:
            commands = ('/usr/bin/open',) if sys.platform == 'darwin' else ('/usr/bin/xdg-open', '/bin/xdg-open') if sys.platform.startswith('linux') else ()
            command = next((name for name in commands if Path(name).is_file()), None)
            if command is None:
                raise SkillPackageError('directory_open_unavailable')
            arguments = [command, '--', str(path)] if sys.platform == 'darwin' else [command, str(path)]
            process = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True)
            try:
                deadline = time.monotonic() + DIRECTORY_OPEN_SECONDS
                while process.poll() is None:
                    api._raise_if_install_cancelled(event)
                    if time.monotonic() >= deadline:
                        raise SkillPackageError('directory_open_failed')
                    event.wait(.05)
                if process.returncode != 0:
                    raise SkillPackageError('directory_open_failed')
            finally:
                if process.poll() is None:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except OSError:
                        process.kill()
                process.wait()
    except OSError:
        raise SkillPackageError('directory_open_failed') from None
    check_selected_target(selection)
    api._raise_if_install_cancelled(event)


class SkillInstallService:
    RECOVERY_INTERVAL = 60

    def __init__(self, api, state_dir):
        self.api, self.state_dir = api, Path(state_dir)
        self.sessions = None
        self._init_lock = threading.Lock()
        self.closing = False
        self.events = set()
        self.tasks = set()
        self._maintenance_task = None
        self._maintenance_stop = asyncio.Event()

    def initialize(self):
        with self._init_lock:
            if self.sessions is None:
                publications = SkillPublications(self.state_dir, safe_path=self.api._is_safe_zip_member_path,
                    guard=self.api._install_publish_guard, lease=self.api.directory_lease,
                    write_json=self.api._write_install_journal,
                    remove_tree=lambda path: self.api.shutil.rmtree(path, onerror=self.api._force_remove_readonly),
                    require_space=self.api._require_install_space, protected=(self.api.THIS_DIR,))
                self.sessions = SkillInstallSessions(publications, valid_repository=self.api._valid_git_url)
        return self.sessions

    async def _file(self, operation, event, request=None, *, cleanup=False):
        def check():
            if not cleanup:
                if request is None:
                    self.api._raise_if_install_cancelled(event)
                else:
                    self.api._check_install_request(request, event)
        return await self.api._run_install_file_worker(operation, event, None if cleanup else check)

    def _source(self, parameters, event):
        url = self.api._ZIP_PROXY_URL.rsplit('/api/', 1)[0] + '/api/skill_install_source'
        opener = self.api._cloud_opener(url)
        return fetch_install_source(parameters, opener=opener, url=url,
            valid_repository=self.api._valid_git_url,
            check_cancel=lambda: self.api._raise_if_install_cancelled(event))

    async def execute(self, action, parameters, *, request=None, progress=None, cancel_event=None):
        if self.closing:
            raise SkillPackageError('install_queue_full')
        event = cancel_event if cancel_event is not None else threading.Event()
        task = asyncio.current_task()
        self.events.add(event); self.tasks.add(task)
        capacity = None
        try:
            sessions = await self._file(self.initialize, event, request)
            if action not in ('browse', 'tool_open'):
                validate_credentials(parameters)
            capacity = await self.api._acquire_install_capacity(event, request=request,
                send_progress=progress, error_class=self.api._ZipInstallError,
                skill_control=action not in ('prepare', 'commit'))
            if action == 'browse':
                path = parameters.get('path', self.api.CUSTOM_NODES_DIR)
                value = await self._file(lambda: browse_target(path,
                    check_cancel=lambda: self.api._raise_if_install_cancelled(event)), event, request)
                return dict(status='success', phase='browse', installed=False, **value)
            if action == 'select':
                source = await self._file(lambda: self._source(parameters, event), event, request)
                await self._file(lambda: sessions.recover(check_cancel=lambda: self.api._raise_if_install_cancelled(event)), event, request)
                holder = []
                def select():
                    value = sessions.select(parameters, source, parameters.get('target'),
                        check_cancel=lambda: self.api._raise_if_install_cancelled(event))
                    holder.append(value)
                    return value
                try:
                    value = await self._file(select, event, request)
                except BaseException:
                    if holder:
                        with contextlib.suppress(OSError, ValueError):
                            await self._file(lambda: sessions.discard(parameters | {'plan_id': holder[0]['plan_id']}), event, cleanup=True)
                    raise
                return dict(status='success', phase='selected', installed=False, **value)
            if action == 'status':
                value = await self._file(lambda: sessions.status(parameters, check_cancel=lambda: self.api._raise_if_install_cancelled(event)), event, request)
                return value | {'status': 'success', 'phase': value['status']}
            if action in ('open', 'tool_open'):
                if action == 'open':
                    value = await self._file(lambda: sessions.status(parameters,
                        check_cancel=lambda: self.api._raise_if_install_cancelled(event)), event, request)
                    target = value['target']
                else:
                    source = parameters.get('url')
                    if not isinstance(source, str) or not self.api._valid_git_url(source):
                        raise SkillPackageError('invalid_repository')
                    name, target = self.api._resolve_install_target(source)
                    if name is None:
                        raise SkillPackageError('invalid_target')
                def launch():
                    path = Path(target)
                    if action == 'tool_open':
                        try:
                            directory_identity(path)
                            resolved = path.resolve(strict=True)
                            if resolved.parent != Path(self.api.CUSTOM_NODES_DIR).resolve(strict=True):
                                raise SkillPackageError('invalid_target')
                            path = resolved
                        except OSError:
                            raise SkillPackageError('invalid_target') from None
                    _open_directory(str(path), event)
                await self._file(launch, event, request)
                return dict(status='success', phase='opened', installed=False, opened=True)
            if action == 'discard':
                await self._file(lambda: sessions.discard(parameters), event, request)
                return dict(status='success', phase='discarded', installed=False)
            if action not in ('prepare', 'commit'):
                raise SkillPackageError('invalid_request')
            source = await self._file(lambda: self._source(parameters, event), event, request)
            if action == 'commit':
                result = await self._file(lambda: sessions.commit(parameters, source=source,
                    check_cancel=lambda: self.api._raise_if_install_cancelled(event)), event, request)
                return result | {'phase': 'complete'}
            return await self._prepare(parameters, source, sessions, event, request, progress)
        finally:
            if capacity is not None:
                capacity.__exit__(None, None, None)
            self.events.discard(event); self.tasks.discard(task)

    async def _prepare(self, parameters, source, sessions, event, request, progress):
        owner = sessions.operation(parameters, source=source,
            check_cancel=lambda: self.api._raise_if_install_cancelled(event))
        entered = []
        def enter():
            value = owner.__enter__()
            entered.append(value)
            return value
        failed = True
        started = False
        try:
            data, _, container = await self._file(enter, event, request)
            if data['state'] != 'preparing':
                raise SkillPackageError('invalid_plan')
            started = True
            payload = dict(url=source['link'], id=parameters['item_id'], account=parameters['account'], token=parameters['token'])
            target = str(container / 'source')
            if source['transport'] == 'github_zip':
                def decoder(headers, version):
                    try:
                        return decode_archive_source(headers.get('X-Ranking-Skill-Source'), source, version,
                            revision=headers.get('X-Ranking-Skill-Revision'),
                            safe_path=self.api._is_safe_zip_member_path, valid_repository=self.api._valid_git_url)
                    except SkillPackageError as error:
                        if str(error) == 'source_changed':
                            raise self.api._ZipInstallError('source_changed', '资源来源已发生变化，请重新准备安装。', 409) from None
                        raise
                result = await self.api._install_zip_core(payload, request=request, cancel_event=event,
                    send_progress=progress, prepare_target=target, skill_source_decoder=decoder, capacity_held=True)
                metadata = result['skill_source']
                version, name, subdirectory = metadata['version'], metadata['name'], metadata['subdirectory']
            else:
                result = await self.api._install_git_core(source['repository'], parameters['account'], request=request,
                    cancel_event=event, send_progress=progress, prepare_target=target, capacity_held=True)
                version = result.get('installed_version')
                name = parse_source(source['repository'], self.api._valid_git_url)['name']
                subdirectory = ()
            value = await self._file(lambda: sessions.ready_owned(parameters['plan_id'], data, version, name,
                subdirectory, check_cancel=lambda: self.api._raise_if_install_cancelled(event)), event, request)
            failed = False
            return value | {'status': 'success', 'phase': 'ready', 'repository': source['repository']}
        finally:
            if entered:
                await self._file(lambda: owner.__exit__(None, None, None), event, cleanup=True)
            if failed and started:
                with contextlib.suppress(OSError, ValueError):
                    await self._file(lambda: sessions.discard(parameters), event, cleanup=True)

    async def recover(self):
        if self.closing:
            return {'recovered': 0, 'deferred': 0}
        event = threading.Event(); self.events.add(event)
        task = asyncio.current_task(); self.tasks.add(task)
        try:
            def scan():
                if not self.state_dir.exists():
                    return {'recovered': 0, 'deferred': 0}
                return self.initialize().recover(check_cancel=lambda: self.api._raise_if_install_cancelled(event))
            return await self._file(scan, event)
        finally:
            self.events.discard(event); self.tasks.discard(task)

    def start_maintenance(self):
        if not self.closing and (self._maintenance_task is None or self._maintenance_task.done()):
            self._maintenance_task = asyncio.create_task(self._maintain(), name='ranking-skill-recovery')

    async def _maintain(self):
        while not self.closing:
            try:
                await asyncio.wait_for(self._maintenance_stop.wait(), timeout=self.RECOVERY_INTERVAL)
                return
            except asyncio.TimeoutError:
                pass
            if self.closing:
                return
            await _recover_service(self)

    async def shutdown(self):
        self.closing = True
        self._maintenance_stop.set()
        for event in tuple(self.events): event.set()
        current = asyncio.current_task()
        while True:
            owned = self.tasks | ({self._maintenance_task} if self._maintenance_task is not None else set())
            tasks = {task for task in owned if task is not current and not task.done()}
            if not tasks: return
            try:
                await asyncio.wait(tasks)
            except asyncio.CancelledError:
                for event in tuple(self.events): event.set()


SERVICE = SkillInstallService(api, Path(api.THIS_DIR) / '缓存' / 'skill-install')
_ACTIONS = {
    'open': {'action', 'plan_id', 'account', 'item_id', 'token'},
    'browse': {'action', 'path'},
    'select': {'action', 'target', 'account', 'item_id', 'token'},
    'status': {'action', 'plan_id', 'account', 'item_id', 'token'},
    'discard': {'action', 'plan_id', 'account', 'item_id', 'token'},
    'prepare': {'action', 'plan_id', 'account', 'item_id', 'token'},
    'commit': {'action', 'plan_id', 'account', 'item_id', 'token'},
}
_ERROR_STATUS = {
    'directory_open_unavailable': 503, 'directory_open_failed': 503,
    'invalid_request': 400, 'invalid_target': 400, 'invalid_plan': 400,
    'invalid_repository': 400, 'invalid_skill_package': 400, 'invalid_version': 502,
    'plan_owner_mismatch': 403, 'auth_failed': 403, 'plan_expired': 409,
    'source_changed': 409, 'target_changed': 409, 'target_conflict': 409,
    'recovery_conflict': 409, 'source_unavailable': 502, 'invalid_metadata': 502,
    'package_too_large': 413, 'directory_too_large': 413, 'install_queue_full': 503,
}


def _parameters(data):
    if not isinstance(data, dict) or not isinstance(data.get('action'), str):
        raise SkillPackageError('invalid_request')
    action = data['action']
    if action not in _ACTIONS or not set(data).issubset(_ACTIONS[action]):
        raise SkillPackageError('invalid_request')
    if action != 'browse':
        validate_credentials(data)
    if action not in ('browse', 'select') and (not isinstance(data.get('plan_id'), str)
            or not re.fullmatch('[0-9a-f]{32}', data['plan_id'])):
        raise SkillPackageError('invalid_plan')
    if action in ('browse', 'select'):
        name = 'target' if action == 'select' else 'path'
        value = data.get(name, api.CUSTOM_NODES_DIR if action == 'browse' else None)
        if (not isinstance(value, str) or not value or len(value.encode('utf-8')) > 32768
                or any(ord(c) < 32 or ord(c) == 127 for c in value)):
            raise SkillPackageError('invalid_target')
    return action


def _failure(error):
    if isinstance(error, (api._GitInstallError, api._ZipInstallError)):
        return error.status, error.code
    if isinstance(error, SkillPackageError):
        code = str(error)
        return _ERROR_STATUS.get(code, 500), code if code in _ERROR_STATUS else 'install_failed'
    if isinstance(error, FileNotFoundError):
        return 404, 'invalid_plan'
    if isinstance(error, OSError):
        classified = api._install_file_error(error, api._ZipInstallError)
        if classified is not None:
            return classified.status, classified.code
    return 500, 'install_failed'


async def skill_install_handler(request):
    if not api._is_local_request(request):
        return web.json_response({'error': 'Forbidden: local access only'}, status=403)
    try:
        data = await api._read_install_parameters(request)
    except api._InstallControlError as error:
        return await api._control_rejection(request, error)
    except (ValueError, TypeError):
        return web.json_response({'status': 'error', 'error_code': 'invalid_request'}, status=400)
    try:
        action = _parameters(data)
    except (ValueError, TypeError, UnicodeError):
        return web.json_response({'status': 'error', 'error_code': 'invalid_request'}, status=400)
    headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
    if action not in ('prepare', 'commit'):
        try:
            result = await SERVICE.execute(action, data, request=request)
            return web.json_response(result, headers=headers)
        except (asyncio.CancelledError, api._InstallClientDisconnectedError):
            raise asyncio.CancelledError() from None
        except Exception as error:
            status, code = _failure(error)
            return web.json_response({'status': 'error', 'error_code': code}, status=status, headers=headers)
    response = web.StreamResponse(status=200, headers=headers | {
        'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no',
    })
    await response.prepare(request)
    cancel = threading.Event()
    async def send(value):
        try:
            await asyncio.wait_for(response.write(('data: ' + json.dumps(value, ensure_ascii=False) + '\n\n').encode('utf-8')), timeout=10)
        except (ConnectionError, RuntimeError, asyncio.TimeoutError):
            cancel.set()
            raise api._InstallClientDisconnectedError() from None
    async def progress(stage, progress, message, **extra):
        await send(dict(stage=stage, progress=progress, message=message, **extra))
    try:
        result = await SERVICE.execute(action, data, request=request, progress=progress, cancel_event=cancel)
        await send(result | {'stage': 'complete', 'progress': 100})
    except asyncio.CancelledError:
        cancel.set()
        raise
    except api._InstallClientDisconnectedError:
        cancel.set()
        return response
    except Exception as error:
        _, code = _failure(error)
        unknown = action == 'commit' and (getattr(error, 'outcome_unknown', False) is True or code not in {
            'auth_failed', 'plan_owner_mismatch', 'plan_expired', 'source_changed',
            'target_changed', 'install_queue_full', 'install_queue_timeout',
            'source_unavailable', 'invalid_metadata',
        })
        try:
            await send(dict(status='error', stage='error', progress=-1, error_code=code,
                            outcomeUnknown=unknown))
        except api._InstallClientDisconnectedError:
            return response
    with contextlib.suppress(ConnectionError, RuntimeError, asyncio.TimeoutError):
        await asyncio.wait_for(response.write_eof(), timeout=10)
    return response


async def open_install_directory_handler(request):
    if not api._is_local_request(request):
        return web.json_response({'error': 'Forbidden: local access only'}, status=403)
    headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
    try:
        data = await api._read_install_parameters(request)
    except api._InstallControlError as error:
        return await api._control_rejection(request, error)
    except (ValueError, TypeError):
        return web.json_response({'status': 'error', 'error_code': 'invalid_request'}, status=400, headers=headers)
    if not isinstance(data, dict) or set(data) != {'url'}:
        return web.json_response({'status': 'error', 'error_code': 'invalid_request'}, status=400, headers=headers)
    try:
        result = await SERVICE.execute('tool_open', data, request=request)
        return web.json_response(result, headers=headers)
    except (asyncio.CancelledError, api._InstallClientDisconnectedError):
        raise asyncio.CancelledError() from None
    except Exception as error:
        status, code = _failure(error)
        return web.json_response({'status': 'error', 'error_code': code}, status=status, headers=headers)


async def _recover_service(service):
    try:
        result = await service.recover()
        if result['recovered'] or result['deferred']:
            print('[ComfyUI-Ranking] Skill installation recovery: recovered=' + str(result['recovered'])
                  + ', deferred=' + str(result['deferred']))
    except Exception as error:
        if not service.closing:
            print('[ComfyUI-Ranking] Skill installation recovery deferred: ' + type(error).__name__)


async def recover_skill_installations(application):
    await _recover_service(SERVICE)
    SERVICE.start_maintenance()


async def shutdown_skill_installations(application):
    await SERVICE.shutdown()
