// 购买/退款状态DOM属于原账号；两种资源入口共用取消和身份释放。
import { captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { API, CACHE } from "../core/全局配置.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

const scopes = new WeakMap();
let sequence = 0;
export function createPurchaseStatusScope(node, account) {
    scopes.get(node)?.dispose();
    const matches = captureRequestSession(), componentId = `purchase-status-${++sequence}`;
    let constructing = true, observer;
    const scope = createTaskViewScope({
        sessionMatches: () => matches() && getUser()?.account === account,
        connected: () => constructing || node.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId), invalidate: () => {}
    });
    scope.readOptions = { noCache: true, componentId, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES };
    scope.addCleanup(() => { observer?.disconnect(); node.replaceChildren(); node.style.display = "none"; });
    node._cleanup = () => scope.dispose(); scopes.set(node, scope);
    queueMicrotask(() => {
        constructing = false;
        if (!scope.isCurrent()) return;
        observer = new MutationObserver(() => { scope.isCurrent(); });
        observer.observe(document.body, { childList: true, subtree: true });
    });
    return scope;
}

export function isValidPurchaseStatus(response) {
    if (response?.status !== "success" || typeof response.owned !== "boolean") return false;
    if (!response.owned) return true;
    return typeof response.allow_refund === "boolean" && typeof response.can_refund === "boolean" && Number.isSafeInteger(response.price_paid) && response.price_paid >= 0
        && typeof response.refund_hours_left === "number" && Number.isFinite(response.refund_hours_left) && response.refund_hours_left >= 0;
}
