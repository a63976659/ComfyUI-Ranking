"""Skill安装计划的账号归属、有效期与来源核对。"""
import base64
import contextlib
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from .skill_packages import SkillPackageError, parse_source


SOURCE_MAX_BYTES = 4096
SOURCE_RESPONSE_MAX_BYTES = 16384
PLAN_SECONDS = 30 * 60
MAX_PLANS = 32
MAX_REGISTRY_ENTRIES = 4096
RECEIPT_SECONDS = 24 * 60 * 60
MAX_RECEIPTS = 32
MAX_RECEIPT_BYTES = 128 * 1024


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise SkillPackageError('invalid_metadata')
        value[key] = item
    return value


def _json(raw):
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=_unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError, RecursionError):
        raise SkillPackageError('invalid_metadata') from None


def validate_credentials(data):
    if not isinstance(data, dict):
        raise SkillPackageError('invalid_request')
    account, item_id, token = (data.get(key) for key in ('account', 'item_id', 'token'))
    if (not isinstance(account, str) or not 1 <= len(account) <= 50 or account != account.strip()
            or any(ord(c) < 32 or ord(c) == 127 for c in account)
            or not isinstance(item_id, str) or not re.fullmatch('[A-Za-z0-9_-]{1,100}', item_id)
            or not isinstance(token, str) or not 1 <= len(token) <= 16384
            or any(not 33 <= ord(c) <= 126 for c in token)):
        raise SkillPackageError('invalid_request')
    return account, item_id, hashlib.sha256(token.encode('ascii')).hexdigest()


def validate_source(value, account, item_id, valid_repository):
    fields = {'status', 'schema', 'account', 'item_id', 'transport', 'repository', 'link', 'revision'}
    if (not isinstance(value, dict) or set(value) != fields or value.get('status') != 'success'
            or type(value.get('schema')) is not int or value['schema'] != 1
            or value.get('account') != account or value.get('item_id') != item_id
            or value.get('transport') not in ('github_zip', 'public_git')
            or not isinstance(value.get('revision'), str) or not re.fullmatch('[0-9a-f]{64}', value['revision'])):
        raise SkillPackageError('invalid_metadata')
    for field in ('repository', 'link'):
        text = value.get(field)
        try:
            size = len(text.encode('utf-8')) if isinstance(text, str) else SOURCE_MAX_BYTES + 1
        except UnicodeError:
            raise SkillPackageError('invalid_metadata') from None
        if (not isinstance(text, str) or len(text) > SOURCE_MAX_BYTES
                or size > SOURCE_MAX_BYTES or any(ord(c) == 127 for c in text)):
            raise SkillPackageError('invalid_metadata')
    source = parse_source(value['link'], valid_repository)
    repository = parse_source(value['repository'], valid_repository)
    github = urlsplit(source['repository']).hostname == 'github.com'
    if not github and value['transport'] == 'github_zip':
        raise SkillPackageError('invalid_metadata')
    def key(url):
        parts = urlsplit(url)
        path = parts.path.rstrip('/').removesuffix('.git')
        if github:
            path = path.lower()
        return (parts.scheme, parts.hostname, parts.port or 443, path)
    if key(source['repository']) != key(value['repository']):
        raise SkillPackageError('invalid_metadata')
    return dict(value)


def fetch_install_source(parameters, *, opener, url, valid_repository, check_cancel=None, clock=time.monotonic):
    account, item_id, _ = validate_credentials(parameters)
    started = clock()
    def check():
        if check_cancel:
            check_cancel()
        if clock() - started >= 20:
            raise SkillPackageError('source_unavailable')
    check()
    request = urllib.request.Request(url, data=json.dumps({'item_id': item_id}).encode('utf-8'), headers={
        'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'identity',
        'Authorization': 'Bearer ' + parameters['token']})
    response = None
    try:
        response = opener.open(request, timeout=15)
        check()
        if response.status != 200:
            raise SkillPackageError('source_unavailable')
        headers = response.headers
        for name in ('Content-Length', 'Content-Encoding', 'Content-Type', 'Transfer-Encoding'):
            values = headers.get_all(name) if hasattr(headers, 'get_all') else None
            if values is not None and len(values) > 1:
                raise SkillPackageError('invalid_metadata')
        if ((headers.get('Content-Encoding') or 'identity').lower() != 'identity'
                or (headers.get('Content-Type') or '').split(';', 1)[0].strip().lower() != 'application/json'):
            raise SkillPackageError('invalid_metadata')
        length = headers.get('Content-Length')
        if length is not None and (not re.fullmatch('[0-9]{1,5}', length)
                or not 0 < int(length) <= SOURCE_RESPONSE_MAX_BYTES or headers.get('Transfer-Encoding')):
            raise SkillPackageError('invalid_metadata')
        body = bytearray()
        read = getattr(response, 'read1', response.read)
        while True:
            check()
            chunk = read(min(65536, SOURCE_RESPONSE_MAX_BYTES + 1 - len(body)))
            check()
            if not chunk:
                break
            body.extend(chunk)
            if len(body) > SOURCE_RESPONSE_MAX_BYTES:
                raise SkillPackageError('invalid_metadata')
        if length is not None and len(body) != int(length):
            raise SkillPackageError('invalid_metadata')
        return validate_source(_json(body), account, item_id, valid_repository)
    except urllib.error.HTTPError as error:
        error.close()
        code = 'auth_failed' if error.code in (401, 403) else 'invalid_repository' if error.code == 400 else 'source_unavailable'
        raise SkillPackageError(code) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise SkillPackageError('source_unavailable') from None
    finally:
        if response is not None:
            response.close()


def decode_archive_source(encoded, expected, version, *, revision, safe_path, valid_repository):
    if (not isinstance(revision, str) or not re.fullmatch('[0-9a-f]{64}', revision)
            or not isinstance(expected.get('revision'), str)
            or not hmac.compare_digest(revision, expected['revision'])):
        raise SkillPackageError('source_changed')
    if (not isinstance(version, str) or not re.fullmatch('[0-9a-fA-F]{40}', version)
            or not isinstance(encoded, str) or not 1 <= len(encoded) <= 8192
            or not re.fullmatch('[A-Za-z0-9_-]+={0,2}', encoded)):
        raise SkillPackageError('invalid_metadata')
    try:
        raw = base64.b64decode(encoded, altchars=b'-_', validate=True)
    except ValueError:
        raise SkillPackageError('invalid_metadata') from None
    value = _json(raw)
    if (not isinstance(value, dict) or set(value) != {'schema', 'repository', 'name', 'subdirectory'}
            or type(value.get('schema')) is not int or value['schema'] != 1
            or not isinstance(value.get('name'), str) or not safe_path(value['name'])
            or '/' in value['name'] or '\\' in value['name']
            or not isinstance(value.get('subdirectory'), list) or len(value['subdirectory']) > 128):
        raise SkillPackageError('invalid_metadata')
    source = parse_source(expected['link'], valid_repository)
    repository = parse_source(value.get('repository'), valid_repository)
    if repository['repository'].lower() != expected['repository'].lower():
        raise SkillPackageError('invalid_metadata')
    subdirectory = value['subdirectory']
    for part in subdirectory:
        if (not isinstance(part, str) or not safe_path(part) or '/' in part or '\\' in part
                or part.casefold() == '.git' or len(part.encode('utf-8')) > SOURCE_MAX_BYTES):
            raise SkillPackageError('invalid_metadata')
    if len(json.dumps(value).encode('utf-8')) > SOURCE_RESPONSE_MAX_BYTES:
        raise SkillPackageError('invalid_metadata')
    if subdirectory:
        raise SkillPackageError('invalid_metadata')
    if value['name'] != (subdirectory[-1] if subdirectory else repository['name']):
        raise SkillPackageError('invalid_metadata')
    return {'name': value['name'], 'subdirectory': tuple(subdirectory), 'version': version.lower()}


class SkillInstallSessions:
    def __init__(self, publications, *, valid_repository, clock=time.time):
        self.publications = publications
        self.valid_repository = valid_repository
        self.clock = clock
        self.publications.on_commit = self._record_commit

    @contextlib.contextmanager
    def _state_lease(self, name, *, timeout=30, check_cancel=None):
        self.publications._journal('0' * 32)
        with self._lease(self.publications.state_dir / name, timeout=timeout, check_cancel=check_cancel):
            self.publications._journal('0' * 32)
            yield

    def _receipt_path(self, plan_id):
        return self.publications._journal(plan_id).with_suffix('.receipt')

    def _receipt_ids(self):
        result = []
        with os.scandir(self.publications.state_dir) as entries:
            for count, entry in enumerate(entries, 1):
                if count > MAX_REGISTRY_ENTRIES:
                    raise SkillPackageError('install_queue_full')
                if re.fullmatch('[0-9a-f]{32}\\.receipt', entry.name):
                    result.append(entry.name[:-8])
                    if len(result) > MAX_RECEIPTS:
                        raise SkillPackageError('install_queue_full')
        return result

    @staticmethod
    def _valid_receipt(value, plan_id):
        fields = {'schema', 'id', 'account', 'item_id', 'token_digest', 'installed_version', 'target', 'recorded_at', 'expires_at'}
        if (not isinstance(value, dict) or set(value) != fields or type(value.get('schema')) is not int
                or value['schema'] != 1 or value['id'] != plan_id
                or any(not isinstance(value[key], str) for key in ('account', 'item_id', 'token_digest', 'installed_version', 'target'))):
            raise SkillPackageError('invalid_plan')
        if (not 1 <= len(value['account']) <= 50 or value['account'] != value['account'].strip()
                or any(ord(char) < 32 or ord(char) == 127 for char in value['account'])
                or not re.fullmatch('[A-Za-z0-9_-]{1,100}', value['item_id'])
                or not re.fullmatch('[0-9a-f]{64}', value['token_digest'])
                or not re.fullmatch('[0-9a-f]{40}', value['installed_version'])
                or not value['target'] or len(value['target'].encode('utf-8')) > 32768
                or any(ord(char) < 32 or ord(char) == 127 for char in value['target'])
                or not Path(value['target']).is_absolute()
                or type(value['recorded_at']) is not int or type(value['expires_at']) is not int
                or value['expires_at'] != value['recorded_at'] + RECEIPT_SECONDS):
            raise SkillPackageError('invalid_plan')
        return value

    def _read_receipt(self, plan_id):
        path = self._receipt_path(plan_id)
        info = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > MAX_RECEIPT_BYTES
                or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)):
            raise SkillPackageError('invalid_plan')
        with path.open('rb') as stream:
            raw = stream.read(MAX_RECEIPT_BYTES + 1)
        if len(raw) > MAX_RECEIPT_BYTES:
            raise SkillPackageError('invalid_plan')
        return self._valid_receipt(_json(raw), plan_id)

    def _record_commit(self, plan_id, data):
        context = data.get('context')
        if not isinstance(context, dict) or data.get('state') != 'committed':
            raise SkillPackageError('invalid_plan')
        now = int(self.clock())
        value = self._valid_receipt(dict(schema=1, id=plan_id, account=context.get('account'),
            item_id=context.get('item_id'), token_digest=context.get('token_digest'),
            installed_version=context.get('installed_version'), target=data['target']['path'],
            recorded_at=now, expires_at=now + RECEIPT_SECONDS), plan_id)
        with self._state_lease('.receipts'):
            path = self._receipt_path(plan_id)
            if os.path.lexists(path):
                old = self._read_receipt(plan_id)
                if any(old[key] != value[key] for key in value if key not in ('recorded_at', 'expires_at')):
                    raise SkillPackageError('recovery_conflict')
                return
            records = [(other, self._read_receipt(other)) for other in self._receipt_ids()]
            if len(records) >= MAX_RECEIPTS:
                oldest = min(records, key=lambda row: (row[1]['recorded_at'], row[0]))[0]
                self._receipt_path(oldest).unlink()
            if len(json.dumps(value).encode('utf-8')) > MAX_RECEIPT_BYTES:
                raise SkillPackageError('invalid_plan')
            self.publications.write_json(path, value)

    @staticmethod
    def _completed(plan_id, target, version):
        if not isinstance(version, str) or not re.fullmatch('[0-9a-f]{40}', version):
            raise SkillPackageError('invalid_plan')
        return dict(status='complete', installed=True, installed_version=version, target=target, plan_id=plan_id)

    def _receipt_status(self, parameters, *, check_cancel=None):
        account, item_id, token_digest = validate_credentials(parameters)
        plan_id = parameters.get('plan_id')
        with self._state_lease('.receipts', check_cancel=check_cancel):
            value = self._read_receipt(plan_id)
            if (value['account'] != account or value['item_id'] != item_id
                    or not hmac.compare_digest(value['token_digest'], token_digest)):
                raise SkillPackageError('plan_owner_mismatch')
            now = int(self.clock())
            if now < value['recorded_at'] - 5 or now >= value['expires_at']:
                raise SkillPackageError('plan_expired')
            return self._completed(plan_id, value['target'], value['installed_version'])

    def _prune_receipts(self, *, check_cancel=None):
        recovered = deferred = 0
        with self._state_lease('.receipts', check_cancel=check_cancel):
            for plan_id in self._receipt_ids():
                if check_cancel:
                    check_cancel()
                try:
                    value = self._read_receipt(plan_id)
                    if self.clock() >= value['expires_at']:
                        self._receipt_path(plan_id).unlink()
                        recovered += 1
                except (OSError, ValueError):
                    deferred += 1
        return dict(recovered=recovered, deferred=deferred)

    @contextlib.contextmanager
    def _lease(self, path, *, timeout=30, check_cancel=None):
        deadline = time.monotonic() + timeout
        with contextlib.ExitStack() as stack:
            while True:
                if check_cancel:
                    check_cancel()
                try:
                    stack.enter_context(self.publications.lease(str(path)))
                    break
                except TimeoutError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(.05)
            yield

    def _owner_path(self, plan_id):
        journal = self.publications._journal(plan_id)
        return journal.with_suffix('.session')

    def _ids(self):
        result = []
        with os.scandir(self.publications.state_dir) as entries:
            for count, entry in enumerate(entries, 1):
                if count > MAX_REGISTRY_ENTRIES:
                    raise SkillPackageError('install_queue_full')
                if re.fullmatch('[0-9a-f]{32}\\.json', entry.name):
                    result.append(entry.name[:-5])
                    if len(result) > MAX_PLANS:
                        raise SkillPackageError('install_queue_full')
        return result

    def select(self, parameters, source, target, *, check_cancel=None):
        account, item_id, token_digest = validate_credentials(parameters)
        source = validate_source(source, account, item_id, self.valid_repository)
        with self._state_lease('.registry', check_cancel=check_cancel):
            if len(self._ids()) >= MAX_PLANS:
                raise SkillPackageError('install_queue_full')
            plan = self.publications.create(target)
            with self._lease(self._owner_path(plan['id']), check_cancel=check_cancel):
                data, _, _ = self.publications._read(plan['id'])
                now = int(self.clock())
                data['context'] = dict(account=account, item_id=item_id, token_digest=token_digest,
                    source=source, created_at=now, expires_at=now + PLAN_SECONDS, installed_version=None)
                self.publications._save(plan['id'], data)
            return {'plan_id': plan['id'], 'target': target, 'expires_at': now + PLAN_SECONDS}

    @contextlib.contextmanager
    def operation(self, parameters, *, source=None, allow_expired=False, allow_missing_container=False, timeout=30, check_cancel=None):
        account, item_id, token_digest = validate_credentials(parameters)
        plan_id = parameters.get('plan_id')
        with self._lease(self._owner_path(plan_id), timeout=timeout, check_cancel=check_cancel):
            data, root, container = self.publications._read(plan_id, allow_missing_container=allow_missing_container)
            context = data.get('context')
            if (not isinstance(context, dict) or context.get('account') != account or context.get('item_id') != item_id
                    or not isinstance(context.get('token_digest'), str)
                    or not hmac.compare_digest(context['token_digest'], token_digest)):
                raise SkillPackageError('plan_owner_mismatch')
            created, expires = context.get('created_at'), context.get('expires_at')
            now = int(self.clock())
            if (type(created) is not int or type(expires) is not int or expires != created + PLAN_SECONDS
                    or not allow_expired and (now < created - 5 or now >= expires)):
                raise SkillPackageError('plan_expired')
            if source is not None:
                source = validate_source(source, account, item_id, self.valid_repository)
                if source != context.get('source'):
                    raise SkillPackageError('source_changed')
            yield data, root, container

    def ready(self, parameters, version, name, subdirectory=(), *, source, check_cancel=None):
        if not isinstance(version, str) or not re.fullmatch('[0-9a-fA-F]{40}', version):
            raise SkillPackageError('invalid_version')
        plan_id = parameters.get('plan_id')
        with self.operation(parameters, source=source, check_cancel=check_cancel) as (data, _, _):
            return self.ready_owned(plan_id, data, version, name, subdirectory, check_cancel=check_cancel)

    def ready_owned(self, plan_id, data, version, name, subdirectory=(), *, check_cancel=None):
        if data['state'] != 'preparing' or not isinstance(version, str) or not re.fullmatch('[0-9a-fA-F]{40}', version):
            raise SkillPackageError('invalid_plan')
        preview = self.publications.prepare(plan_id, name, subdirectory, check_cancel=check_cancel)
        updated, _, _ = self.publications._read(plan_id)
        updated['context']['installed_version'] = version.lower()
        self.publications._save(plan_id, updated)
        return {'status': 'ready', 'installed': False, 'installed_version': version.lower(), 'preview': preview}

    def status(self, parameters, *, check_cancel=None):
        try:
            return self._receipt_status(parameters, check_cancel=check_cancel)
        except FileNotFoundError:
            try:
                return self._journal_status(parameters, check_cancel=check_cancel)
            except FileNotFoundError:
                return self._receipt_status(parameters, check_cancel=check_cancel)

    def _journal_status(self, parameters, *, check_cancel=None):
        with self.operation(parameters, allow_expired=True, allow_missing_container=True, check_cancel=check_cancel) as (data, root, _):
            context = data['context']
            now = int(self.clock())
            if data['state'] == 'committed':
                return self._completed(parameters['plan_id'], str(root), context.get('installed_version'))
            return {'status': data['state'], 'installed': False, 'target': str(root),
                    'expired': now >= context['expires_at'] or now < context['created_at'] - 5, 'expires_at': context['expires_at'],
                    'installed_version': context.get('installed_version'), 'items': [
                        {key: row[key] for key in ('name', 'skill', 'files', 'bytes')}
                        | {'exists': row['old_identity'] is not None} for row in data['items']]}

    def commit(self, parameters, *, source, check_cancel=None):
        with self.operation(parameters, source=source, check_cancel=check_cancel) as (data, _, _):
            version = data['context'].get('installed_version')
            if data['state'] != 'ready' or not isinstance(version, str) or not re.fullmatch('[0-9a-f]{40}', version):
                raise SkillPackageError('invalid_plan')
            result = self.publications.publish(parameters['plan_id'], check_cancel=check_cancel)
            return result | {'installed': True, 'installed_version': version}

    def discard(self, parameters):
        with self.operation(parameters, allow_expired=True):
            self.publications.discard(parameters['plan_id'])

    def recover(self, *, check_cancel=None):
        recovered = deferred = 0
        with self._state_lease('.registry', timeout=.1, check_cancel=check_cancel):
            for plan_id in self._ids():
                if check_cancel:
                    check_cancel()
                try:
                    with self._lease(self._owner_path(plan_id), timeout=0):
                        data, _, _ = self.publications._read(plan_id, allow_missing_container=True)
                        if data['state'] in ('prepared', 'committed', 'rolled_back', 'discarded'):
                            self.publications.recover(plan_id)
                            recovered += 1
                        else:
                            context = data.get('context')
                            expires = context.get('expires_at') if isinstance(context, dict) else None
                            if type(expires) is not int or self.clock() >= expires:
                                self.publications.discard(plan_id)
                                recovered += 1
                except (OSError, ValueError):
                    deferred += 1
        result = self._prune_receipts(check_cancel=check_cancel)
        return {'recovered': recovered + result['recovered'], 'deferred': deferred + result['deferred']}
