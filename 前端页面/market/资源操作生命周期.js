// 安装与交付入口共用原账号/节点范围；已经提交的购买和安装不自动重放。
import { captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { API, CACHE } from "../core/全局配置.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

const scopes = new WeakMap();
let sequence = 0;
export function createResourceOperationScope(button, statusBox, account, options = {}) {
    scopes.get(button)?.dispose();
    const matches = captureRequestSession(), componentId = `resource-operation-${++sequence}`;
    const confirmation = new AbortController(), cleanups = new Set();
    let inner, observer, disposed = false;
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        observer?.disconnect(); confirmation.abort();
        button.disabled = true; button.removeAttribute("aria-busy");
        statusBox.replaceChildren(); statusBox.style.display = "none";
        for (const callback of cleanups) { try { callback(); } catch (_) {} }
        cleanups.clear();
    };
    const scope = {
        readOptions: { noCache: true, componentId, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES },
        confirmationSignal: confirmation.signal,
        dispose() { if (inner) inner.dispose(); else cleanup(); },
        addCleanup(callback) {
            if (disposed) { callback(); return () => {}; }
            cleanups.add(callback); return () => cleanups.delete(callback);
        },
        isCurrent() {
            if (disposed) return false;
            // 只有实际操作过的卡片订阅身份/DOM变化，避免整个榜单逐卡安装全局监听。
            if (!inner) {
                inner = createTaskViewScope({
                    sessionMatches: () => matches() && getUser()?.account === account,
                    connected: () => button.isConnected && statusBox.isConnected
                        && (!options.isCurrent || options.isCurrent()),
                    subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
                        userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
                    cancelReads: () => requestCancelManager.cancelAll(componentId), invalidate: () => {}
                });
                inner.addCleanup(cleanup);
                observer = new MutationObserver(() => { scope.isCurrent(); });
                observer.observe(document.body, { childList: true, subtree: true });
            }
            return inner.isCurrent();
        }
    };
    button._cleanup = () => scope.dispose(); scopes.set(button, scope);
    return scope;
}
