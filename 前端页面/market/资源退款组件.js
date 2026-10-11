// 卡片与资源详情共用的退款确认、状态展示和客户端失效流程。
import { api, captureRequestSession } from "../core/网络请求API.js";
import { CACHE } from "../core/全局配置.js";
import { removeCache, removeCacheByPrefix } from "../core/网络请求_缓存管理.js";
import { clearSensitiveCache } from "../components/性能优化工具.js";
import { showToast, setupDialogAccessibility } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验_国际化.js";

import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
import { removeAcquiredItem } from "./资源获取记录.js";

const openDialogs = new Map();
let nextDialogId = 0;

function textElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
}

/** 云端已提交退款；各项本地清理独立容错，不能把成功改成失败。 */
function clearRefundClientState(itemId) {
    const safely = action => {
        try { action(); } catch { console.warn("退款成功，部分本地状态无法清理"); }
    };
    safely(() => localStorage.removeItem(CACHE.LOCAL_KEYS.INSTALLED_VERSION_PREFIX + itemId));
    safely(() => removeAcquiredItem(itemId));
    safely(() => removeCache(CACHE.LOCAL_KEYS.ITEM_OWNERSHIP_PREFIX + itemId));
    for (const prefix of CACHE.REFUND_CACHE_PREFIXES) safely(() => removeCacheByPrefix(prefix));
    safely(() => clearSensitiveCache());
}

/** @param {{itemData: Object, currentUser: Object, pricePaid: number, onRefunded?: Function, onClosed?: Function, isCurrent?: Function}} options */
export function showResourceRefundDialog({ itemData, currentUser, pricePaid, onRefunded, onClosed, isCurrent = () => true }) {
    if (!currentUser?.account) { showToast(t("feedback.login_required"), "warning"); return null; }
    if (!itemData?.id) { showToast(t("item.invalid_id_tip"), "error"); return null; }
    const account = currentUser.account;
    const itemId = itemData.id;
    const matches = captureRequestSession();
    const sessionMatches = () => matches() && getUser()?.account === account;
    if (!sessionMatches() || !isCurrent()) return null;
    const key = JSON.stringify([account, itemId]);
    const existing = openDialogs.get(key);
    if (existing?.focus()) return existing;

    const id = `ranking-refund-${++nextDialogId}`;
    const overlay = document.createElement("div");
    overlay.className = "comfy-ranking-dialog-overlay refund-dialog-overlay";
    const box = document.createElement("div");
    box.className = "comfy-ranking-dialog refund-dialog";
    box.dataset.type = "danger";
    const title = textElement("h2", t("item.confirm_refund_title"), "comfy-ranking-dialog__title");
    title.id = id + "-title";
    const description = document.createElement("div");
    description.id = id + "-description";
    description.className = "comfy-ranking-dialog__message";
    description.append(
        textElement("p", t("item.product") + (itemData.title || t("item.untitled"))),
        textElement("p", t("item.refund_amount") + String(pricePaid ?? "") + " " + t("common.credits")),
        textElement("strong", t("item.refund_consequence"))
    );
    const warnings = document.createElement("ul");
    for (const warning of [t("item.refund_consequence_1"), t("item.refund_consequence_2"), t("item.refund_consequence_3")]) {
        warnings.appendChild(textElement("li", warning));
    }
    description.appendChild(warnings);
    const actions = document.createElement("div");
    actions.className = "comfy-ranking-dialog__actions";
    const cancel = textElement("button", t("common.cancel"), "comfy-ranking-dialog__button comfy-ranking-dialog__button--cancel");
    cancel.type = "button";
    cancel.dataset.action = "cancel";
    const confirm = textElement("button", t("item.confirm_refund"), "comfy-ranking-dialog__button comfy-ranking-dialog__button--confirm");
    confirm.type = "button";
    confirm.dataset.action = "confirm";
    actions.append(cancel, confirm);
    box.append(title, description, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let phase = "confirm", observer;
    let accessibility;
    const scope = createTaskViewScope({
        sessionMatches,
        connected: () => overlay.isConnected && (phase === "success" || isCurrent()),
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => {}, invalidate: () => {}
    });
    scope.addCleanup(() => {
        phase = "closed"; observer?.disconnect(); accessibility?.cleanup();
        description.replaceChildren(); actions.replaceChildren(); overlay.remove();
        if (openDialogs.get(key) === handle) openDialogs.delete(key);
    });
    const close = () => {
        if (phase === "pending" || phase === "closed") return;
        const succeeded = phase === "success";
        const restore = sessionMatches();
        scope.dispose();
        if (restore) accessibility?.restoreFocus();
        if (succeeded && restore) {
            try { onClosed?.(); } catch { console.warn("退款成功，返回视图处理失败"); }
        }
    };
    const handle = { close, dispose: () => scope.dispose(), focus: () => {
        if (!scope.isCurrent()) return false;
        (box.querySelector("button:not(:disabled)") || box).focus();
        return true;
    } };
    overlay._cleanup = handle.dispose;
    openDialogs.set(key, handle);
    observer = new MutationObserver(() => { scope.isCurrent(); });
    observer.observe(document.body, { childList: true, subtree: true });
    accessibility = setupDialogAccessibility(box, title.id, description.id, '[data-action="cancel"]', close);
    cancel.onclick = close;
    overlay.onclick = event => { if (event.target === overlay) close(); };
    confirm.onclick = async () => {
        if (phase !== "confirm" || !scope.isCurrent()) return;
        phase = "pending";
        cancel.disabled = confirm.disabled = true;
        confirm.textContent = t("common.processing");
        box.setAttribute("aria-busy", "true");
        const progress = textElement("p", t("common.processing"));
        progress.setAttribute("role", "status");
        progress.setAttribute("aria-live", "polite");
        description.appendChild(progress);
        box.focus();
        let result;
        try {
            result = await api.requestRefund(account, itemId);
            if (!scope.isCurrent()) return;
        } catch {
            if (!scope.isCurrent()) return;
            phase = "confirm";
            showToast(t("item.refund_request_failed"), "error");
            close();
            return;
        }
        if (result?.status !== "success") {
            phase = "confirm";
            showToast(t("item.refund_failed_retry"), "error");
            close();
            return;
        }
        clearRefundClientState(itemId);
        phase = "success";
        try { onRefunded?.(result); } catch { console.warn("退款成功，视图更新失败"); }
        if (!scope.isCurrent()) return;
        box.removeAttribute("aria-busy");
        title.textContent = t("item.refund_success");
        description.setAttribute("role", "status");
        description.setAttribute("aria-live", "polite");
        description.replaceChildren(
            textElement("p", t("item.refund_amount_returned", { amount: result.refund_amount })),
            textElement("p", t("item.ban_days_notice", { days: result.ban_days }))
        );
        const done = textElement("button", t("common.got_it"), "comfy-ranking-dialog__button comfy-ranking-dialog__button--confirm");
        done.type = "button";
        done.dataset.action = "close";
        done.onclick = close;
        actions.replaceChildren(done);
        done.focus();
        showToast(t("item.refund_success_toast"), "success");
    };
    return handle;
}
