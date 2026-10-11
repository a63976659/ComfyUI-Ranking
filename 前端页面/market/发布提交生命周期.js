/** 发布表单绑定原账号与凭证，已经发送的写操作不取消或重放。 */
import { captureRequestSession } from "../core/网络请求API.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { CACHE } from "../core/全局配置.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

const bindings = new WeakMap();

export function createPublishSubmissionScope(container, button, account) {
    const previous = bindings.get(container);
    if (previous?.button === button && previous.account === account) return previous.binding;
    previous?.binding.dispose();
    const matches = captureRequestSession(), confirmation = new AbortController();
    let phase = 'idle', observer;
    const scope = createTaskViewScope({
        sessionMatches: () => !!account && matches() && getUser()?.account === account,
        connected: () => container.isConnected && button.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => {},
        invalidate: () => {}
    });
    scope.addCleanup(() => {
        phase = 'disposed'; observer?.disconnect(); confirmation.abort();
        button.disabled = true; button.removeAttribute('aria-busy');
        for (const selector of ['#pub-github-token', '#pub-netdisk-password']) {
            const input = container.querySelector(selector); if (input) input.value = '';
        }
    });
    let wasConnected = container.isConnected;
    observer = new MutationObserver(() => {
        if (container.isConnected) wasConnected = true;
        if (wasConnected) scope.isCurrent();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    container._cleanup = () => scope.dispose();
    const publicationId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const binding = {
        publicationId,
        confirmationSignal: confirmation.signal,
        addCleanup: cleanup => scope.addCleanup(cleanup),
        isCurrent: () => scope.isCurrent(),
        dispose: () => scope.dispose(),
        begin() {
            if (phase !== 'idle' || !scope.isCurrent()) return false;
            phase = 'submitting'; button.setAttribute('aria-busy', 'true'); return true;
        },
        finish(committed, outcomeUnknown = false) {
            if (!scope.isCurrent()) return;
            phase = committed ? 'committed' : (outcomeUnknown ? 'unconfirmed' : 'idle'); button.removeAttribute('aria-busy');
        }
    };
    bindings.set(container, { button, account, binding });
    return binding;
}
