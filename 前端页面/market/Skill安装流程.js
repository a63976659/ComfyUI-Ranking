import { SKILL_INSTALL, escapeHtml } from '../core/全局配置.js';
import { describeInstallSource } from './安装来源.js';
import { readLocalJSON } from '../core/本机请求读取.js';
import { requestSSE } from '../core/网络请求_基础设施.js';
import { t } from '../components/用户体验_国际化.js';
import { globalModal } from '../components/全局弹窗管理器.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const pathText = value => typeof value === 'string' && value.length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && new TextEncoder().encode(value).length <= SKILL_INSTALL.PATH_MAX_BYTES;
const planId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const versionId = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;

function failure(code) {
    const error = new Error('skill_operation_failed');
    error.code = code;
    return error;
}

export function skillErrorMessage(error) {
    const errorKeys = {
        local_update_required: 'skill.local_update_required',
        invalid_target: 'install.error_invalid_target',
        invalid_repository: 'install.error_invalid_repository',
        invalid_skill_package: 'skill.invalid_package',
        invalid_plan: 'skill.plan_invalid',
        plan_expired: 'skill.plan_invalid',
        plan_owner_mismatch: 'skill.identity_changed',
        auth_failed: 'skill.identity_changed',
        source_changed: 'skill.source_changed',
        target_changed: 'skill.target_changed',
        target_conflict: 'skill.target_changed',
        recovery_conflict: 'skill.target_changed',
        source_unavailable: 'skill.source_unavailable',
        invalid_metadata: 'skill.source_unavailable',
        directory_too_large: 'skill.directory_too_large',
        package_too_large: 'install.error_package_too_large',
        insufficient_disk_space: 'install.error_disk_space',
        permission_denied: 'install.error_permission_denied',
        install_queue_full: 'install.error_queue_full',
        install_queue_timeout: 'install.error_queue_timeout',
    };
    const errorKey = Object.hasOwn(errorKeys, error?.code) ? errorKeys[error.code] : 'install.error_generic';
    return t(errorKey);
}

async function control(action, body, signal, timeout = SKILL_INSTALL.CONTROL_TIMEOUT) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeout);
    try {
        if (controller.signal.aborted) throw failure('operation_cancelled');
        const response = await fetch(SKILL_INSTALL.PATH, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, action }), cache: 'no-store', signal: controller.signal,
        });
        if (response.status === 404 || response.status === 405) throw failure('local_update_required');
        const value = await readLocalJSON(response, controller, SKILL_INSTALL.RESPONSE_MAX_BYTES);
        if (!response.ok || !object(value) || value.status !== 'success' || !(value.installed === false
                || action === 'status' && value.phase === 'complete' && value.installed === true)
                || Object.hasOwn(value, 'error') || Object.hasOwn(value, 'error_code')) {
            throw failure(object(value) && typeof value.error_code === 'string' ? value.error_code : 'invalid_metadata');
        }
        return value;
    } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
    }
}

function browseResult(value) {
    return value.phase === 'browse' && pathText(value.path) && pathText(value.parent)
        && typeof value.selectable === 'boolean' && typeof value.truncated === 'boolean'
        && Array.isArray(value.directories) && value.directories.length <= SKILL_INSTALL.MAX_DIRECTORIES
        && value.directories.every(row => object(row) && pathText(row.name) && pathText(row.path));
}

export function chooseSkillDirectory(scope) {
    if (!scope.isCurrent()) return Promise.resolve(null);
    return new Promise(resolve => {
        const content = document.createElement('div'); content.className = 'skill-directory';
        const hint = document.createElement('p'); hint.textContent = t('skill.directory_hint');
        const label = document.createElement('label'); label.className = 'skill-directory__label';
        const title = document.createElement('span'); title.textContent = t('skill.directory_path');
        const input = document.createElement('input'); input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
        label.append(title, input);
        const actions = document.createElement('div'); actions.className = 'skill-directory__actions';
        const button = (label, callback) => {
            const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
            node.addEventListener('click', callback); return node;
        };
        const notice = document.createElement('p'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
        const list = document.createElement('ul'); list.className = 'skill-directory__list'; list.setAttribute('aria-label', t('skill.directory_folders'));
        let closed = false, generation = 0, selected = null, controller, modal;
        let releaseScope = () => {};
        const current = () => !closed && scope.isCurrent();
        const finish = value => {
            if (closed) return;
            closed = true; generation++; controller?.abort(); releaseScope();
            resolve(value); if (modal) globalModal.closeModal(modal);
        };
        content._cleanup = () => finish(null);
        const open = button(t('skill.directory_open'), () => browse(input.value));
        const parent = button(t('skill.directory_parent'), () => selected && browse(selected.parent));
        const select = button(t('skill.directory_select'), () => {
            if (current() && selected?.selectable && input.value === selected.path) finish(selected.path);
        });
        select.disabled = parent.disabled = true;
        const cancel = button(t('common.cancel'), () => finish(null));
        actions.append(open, parent, select, cancel);
        input.addEventListener('input', () => {
            generation++; controller?.abort(); selected = null; select.disabled = parent.disabled = true;
            content.removeAttribute('aria-busy'); list.replaceChildren(); notice.textContent = t('skill.directory_verify');
        });
        async function browse(path) {
            if (!current()) return;
            const own = ++generation; controller?.abort(); controller = new AbortController();
            selected = null; select.disabled = parent.disabled = true;
            content.setAttribute('aria-busy', 'true'); notice.textContent = t('common.loading'); list.replaceChildren();
            try {
                const value = await control('browse', path === undefined ? {} : { path }, controller.signal);
                if (!current() || own !== generation) return;
                if (!browseResult(value)) throw failure('invalid_metadata');
                selected = value; input.value = value.path;
                select.disabled = !value.selectable; parent.disabled = value.parent === value.path;
                for (const row of value.directories) {
                    const item = document.createElement('li');
                    const folder = document.createElement('button'); folder.type = 'button'; folder.textContent = row.name;
                    folder.addEventListener('click', () => { if (current() && own === generation) browse(row.path); });
                    item.append(folder); list.append(item);
                }
                notice.textContent = t(value.truncated ? 'skill.directory_truncated' : 'skill.directory_ready');
            } catch (error) {
                if (current() && own === generation) notice.textContent = skillErrorMessage(error);
            } finally {
                if (current() && own === generation) content.removeAttribute('aria-busy');
            }
        }
        content.append(hint, label, actions, notice, list);
        modal = globalModal.openModal(t('skill.directory_title'), content, { width: SKILL_INSTALL.MODAL_WIDTH });
        releaseScope = scope.addCleanup(() => finish(null));
        if (!current()) { finish(null); return; }
        input.focus(); browse();
    });
}

function confirmed(result, version) {
    return object(result) && result.status === 'success' && result.phase === 'complete'
        && result.installed === true && (!Object.hasOwn(result, 'outcomeUnknown') || result.outcomeUnknown === false)
        && result.installed_version === version
        && !Object.hasOwn(result, 'error') && !Object.hasOwn(result, 'error_code');
}

function validReady(result, plan, target) {
    return object(result) && result.status === 'success' && result.phase === 'ready'
        && result.installed === false && (!Object.hasOwn(result, 'outcomeUnknown') || result.outcomeUnknown === false)
        && !Object.hasOwn(result, 'error') && !Object.hasOwn(result, 'error_code') && versionId(result.installed_version)
        && describeInstallSource(result.repository) !== null
        && object(result.preview) && result.preview.id === plan && pathText(result.preview.target) && result.preview.target === target
        && Array.isArray(result.preview.items) && result.preview.items.length > 0
        && result.preview.items.length <= SKILL_INSTALL.MAX_ITEMS
        && result.preview.items.every(row => object(row) && pathText(row.name)
            && !/[\\/]/u.test(row.name) && typeof row.skill === 'boolean' && typeof row.exists === 'boolean'
            && count(row.files) && count(row.bytes));
}

export async function runSkillInstall({ target, credentials, scope, confirm, onProgress, signal = scope.confirmationSignal }) {
    let plan, committing = false;
    try {
        if (!scope.isCurrent() || signal.aborted) return { status: 'cancelled' };
        const selected = await control('select', { ...credentials, target }, signal);
        if (!planId(selected.plan_id) || selected.phase !== 'selected' || selected.target !== target
                || !count(selected.expires_at)) throw failure('invalid_metadata');
        plan = selected.plan_id;
        if (!scope.isCurrent() || signal.aborted) return { status: 'cancelled' };
        const parameters = { ...credentials, plan_id: plan };
        const stream = action => requestSSE(SKILL_INSTALL.PATH, { ...parameters, action },
            event => { if (scope.isCurrent()) onProgress?.({ ...event, skillAction: action }); },
            { signal, timeout: SKILL_INSTALL.STREAM_TIMEOUT });
        const ready = await stream('prepare');
        if (!scope.isCurrent() || signal.aborted) return { status: 'cancelled' };
        if (!validReady(ready, plan, target)) throw failure(ready?.error_code || 'invalid_metadata');
        const source = describeInstallSource(ready.repository);
        const html = `<div class="skill-install-preview"><p>${escapeHtml(t('install.source', { source: source.label }))}</p>`
            + `<p>${escapeHtml(t('skill.preview_target', { path: ready.preview.target }))}</p>`
            + `<p>${escapeHtml(t('skill.preview_hint'))}</p><ul>`
            + ready.preview.items.map(row => `<li>${escapeHtml(row.name)} — ${escapeHtml(t(row.exists ? 'skill.preview_replace' : 'skill.preview_new'))}`
                + ` · ${escapeHtml(t(row.skill ? 'skill.preview_skill' : 'skill.preview_shared'))}</li>`).join('') + '</ul></div>';
        if (!await confirm(html, { html: true }) || !scope.isCurrent() || signal.aborted) return { status: 'cancelled' };
        committing = true;
        let result;
        try { result = await stream('commit'); }
        catch (error) {
            if (error?.fallbackSafe) return { status: 'error', error_code: 'local_update_required', outcomeUnknown: false, plan_id: plan };
        }
        if (confirmed(result, ready.installed_version)) return { ...result, plan_id: plan };
        if (object(result) && result.status === 'error' && result.outcomeUnknown === false
                && typeof result.error_code === 'string') return { ...result, plan_id: plan };
        if (scope.isCurrent() && !signal.aborted) {
            try {
                onProgress?.({ stage: 'validate', progress: 99, skillAction: 'status' });
                const receipt = await control('status', parameters, signal, SKILL_INSTALL.RESULT_TIMEOUT);
                if (scope.isCurrent() && !signal.aborted && receipt.plan_id === plan && receipt.target === target
                        && confirmed(receipt, ready.installed_version)) return receipt;
            } catch {}
        }
        return { status: 'error', outcomeUnknown: true, plan_id: plan };
    } catch (error) {
        throw failure(error?.fallbackSafe ? 'local_update_required' : error?.code || 'install_failed');
    } finally {
        if (plan && !committing) {
            try { await control('discard', { ...credentials, plan_id: plan }); } catch {}
        }
    }
}
