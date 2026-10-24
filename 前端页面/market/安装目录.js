import { LOCAL_INSTALL_DIRECTORY, SKILL_INSTALL } from '../core/全局配置.js';
import { readLocalJSON } from '../core/本机请求读取.js';
import { t } from '../components/用户体验_国际化.js';

const mounted = new WeakMap();
const errors = Object.freeze({
    invalid_target: () => t('install.directory_unavailable'), target_changed: () => t('install.directory_unavailable'),
    invalid_repository: () => t('install.error_invalid_repository'), invalid_plan: () => t('skill.plan_invalid'),
    plan_expired: () => t('skill.plan_invalid'), plan_owner_mismatch: () => t('skill.identity_changed'),
    auth_failed: () => t('skill.identity_changed'), install_queue_full: () => t('install.error_queue_full'),
    install_queue_timeout: () => t('install.error_queue_timeout'),
    directory_open_unavailable: () => t('install.directory_failed'), directory_open_failed: () => t('install.directory_failed')
});

export function attachInstallDirectory(container, body, scope, { skill = false } = {}) {
    mounted.get(container)?.();
    if (!scope.isCurrent() || !container.isConnected) return;
    const payload = JSON.stringify(skill ? { ...body, action: 'open' } : body);
    const host = document.createElement('div'); host.className = 'resource-install__directory';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'resource-install__button';
    const label = t(skill ? 'install.open_receiver' : 'install.open_directory'); button.textContent = label;
    const notice = document.createElement('div'); notice.className = 'resource-install__note';
    notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
    let disposed = false, controller, busy = false, release = () => {};
    const current = () => !disposed && scope.isCurrent() && host.isConnected;
    const cleanup = () => {
        if (disposed) return;
        disposed = true; controller?.abort(); button.removeEventListener('click', open); host.remove(); release();
        if (mounted.get(container) === cleanup) mounted.delete(container);
    };
    async function open(event) {
        event.stopPropagation();
        if (busy || !current()) return;
        const hadFocus = document.activeElement === button;
        busy = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
        button.textContent = t('common.loading'); notice.textContent = '';
        controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LOCAL_INSTALL_DIRECTORY.TIMEOUT);
        try {
            const response = await fetch(skill ? SKILL_INSTALL.PATH : LOCAL_INSTALL_DIRECTORY.PATH, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
                cache: 'no-store', signal: controller.signal
            });
            if (!current()) return;
            if (response.status === 404 || response.status === 405) {
                notice.textContent = t('skill.local_update_required'); return;
            }
            const result = await readLocalJSON(response, controller, LOCAL_INSTALL_DIRECTORY.RESPONSE_MAX_BYTES);
            if (!current()) return;
            if (response.ok && result && !Array.isArray(result) && result.status === 'success'
                    && result.phase === 'opened' && result.opened === true && result.installed === false
                    && !Object.hasOwn(result, 'error') && !Object.hasOwn(result, 'error_code')) {
                notice.textContent = t('install.directory_requested');
            } else {
                notice.textContent = result && Object.hasOwn(errors, result.error_code) ? errors[result.error_code]()
                    : response.ok ? t('install.directory_uncertain') : t('install.directory_failed');
            }
        } catch {
            if (current()) notice.textContent = t('install.directory_uncertain');
        } finally {
            clearTimeout(timer); controller?.abort();
            if (current()) {
                busy = false; button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = label;
                if (hadFocus && document.hasFocus() && document.activeElement === document.body) button.focus();
            }
        }
    }
    button.addEventListener('click', open); host.append(button, notice); container.append(host);
    mounted.set(container, cleanup); release = scope.addCleanup(cleanup, host);
    if (!current()) cleanup();
    return cleanup;
}
