import { api, captureRequestSession } from "../core/网络请求API.js";
import { getUser } from "../core/状态管理.js";

const badgeGenerations = new WeakMap();

/** 每个角标独立代次；身份变化、节点替换及后来的刷新使旧回调失效。 */
export function createUnreadBadgeUpdate(button, selector, account) {
    const badge = button?.querySelector(selector);
    if (!badge) return { isCurrent: () => false, render: () => {} };
    const generation = (badgeGenerations.get(badge) || 0) + 1;
    badgeGenerations.set(badge, generation);
    const sessionMatches = captureRequestSession();
    const isCurrent = () => !!account && sessionMatches() && getUser()?.account === account
        && button.isConnected && button.querySelector(selector) === badge
        && badgeGenerations.get(badge) === generation;
    const render = count => {
        if (!isCurrent()) return;
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = count > 0 ? 'flex' : 'none';
    };
    if (!account) { badge.textContent = ''; badge.style.display = 'none'; }
    return { isCurrent, render };
}

export function validUnreadCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function loadUnreadCount(currentUser, bellBtn) {
    const update = createUnreadBadgeUpdate(bellBtn, '#unread-badge', currentUser?.account);
    if (!currentUser?.account || !bellBtn?.querySelector("#unread-badge")) return;
    try {
        const res = await api.getUnreadCount(currentUser.account);
        if (res?.status === "success" && Number.isSafeInteger(res.unread_count) && res.unread_count >= 0) {
            update.render(res.unread_count);
        }
    } catch (_) {}
}
