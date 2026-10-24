// 赞赏弹窗：原账号/父页面范围，新余额与提交锁；已提交POST不自动重放。
import { api, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { API, CACHE, TIP_LEVELS } from "../core/全局配置.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { openUserProfileModal } from "./个人中心视图.js";
import { renderTipLevelHTML, getTipLevelDescription, calculateTipLevel } from "../components/打赏等级工具.js";
import { t } from "../components/用户体验增强.js";

const active = new Map();
let sequence = 0;
const validBalance = value => Number.isSafeInteger(value) && value >= 0;
const validAmount = value => Number.isSafeInteger(value) && value > 0 && value <= TIP_LEVELS.MAX_POINTS;
const element = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** 原四参数调用保持；options.isCurrent可提供原父页面检查。 */
export async function openTipModal(currentUser, targetUser, onSuccess, itemId = null, options = {}) {
    const account = currentUser?.account, target = targetUser?.account;
    const matches = captureRequestSession(), parentCurrent = options.isCurrent || (() => true);
    const sessionMatches = () => matches() && getUser()?.account === account;
    if (!account) { showToast(t('feedback.login_required'), "warning"); return; }
    if (!sessionMatches() || !parentCurrent() || typeof target !== "string" || !target.trim()) return;
    if (account === target) { showToast(t('creator.cannot_tip_self'), "warning"); return; }
    const key = JSON.stringify([account, target, itemId]);
    if (active.has(key)) return;
    const id = `tip-${++sequence}`, componentId = `tip-wallet-${sequence}`;
    let loading = true, modal, observer, submitted = false, confirming = false;
    const confirmationController = new AbortController();
    const container = element("div", "tip-dialog");
    const scope = createTaskViewScope({
        sessionMatches,
        connected: () => parentCurrent() && (loading || !!modal?.isConnected),
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId), invalidate: () => {}
    });
    active.set(key, scope);
    scope.addCleanup(() => {
        observer?.disconnect(); confirmationController.abort();
        globalModal.closeModal(modal); container.replaceChildren();
        if (active.get(key) === scope) active.delete(key);
    });
    observer = new MutationObserver(() => { scope.isCurrent(); });
    observer.observe(document.body, { childList: true, subtree: true });
    container._cleanup = () => scope.dispose();
    if (!scope.isCurrent()) return;
    container.setAttribute('aria-busy', 'true');
    const loadingStatus = element('div', 'tip-dialog__muted', t('common.loading'));
    loadingStatus.setAttribute('role', 'status');
    loadingStatus.setAttribute('aria-live', 'polite');
    container.append(loadingStatus);
    modal = globalModal.openModal(t('tip.dialog_title', { name: targetUser.name || target }), container, { width: "340px" });
    loading = false;
    const readOptions = { componentId, noCache: true, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES };
    let balance;
    try {
        const response = await api.getWallet(account, readOptions);
        if (!scope.isCurrent()) return;
        if (response?.status !== "success" || !validBalance(response.balance)) throw new Error();
        balance = response.balance;
    } catch (_) {
        if (scope.isCurrent()) showToast(t('common.error'), "error");
        scope.dispose(); return;
    }
    const balanceRow = element("div", "tip-dialog__balance", `${t('wallet.current_balance')}: ${balance} ${t('wallet.credits')}`);
    const amountLabel = element("label", "tip-dialog__label", t('tip.amount_label'));
    const amountInput = element("input", "tip-dialog__input");
    amountInput.id = `${id}-amount`; amountLabel.htmlFor = amountInput.id;
    amountInput.type = "number"; amountInput.min = "1"; amountInput.max = String(TIP_LEVELS.MAX_POINTS);
    amountInput.step = "1"; amountInput.value = String(TIP_LEVELS.POINTS_PER_STAR);
    const preview = element("div", "tip-dialog__preview");
    preview.append(element("div", "tip-dialog__muted", t('tip.level_preview')));
    const previewLevel = element("div", "tip-dialog__level"); preview.append(previewLevel);
    const rules = element("div", "tip-dialog__rules"); rules.append(element("div", "", t('tip.rules_title')));
    const ruleList = element("ul", "");
    for (const text of [t('tip.rule_star', { points: TIP_LEVELS.POINTS_PER_STAR }),
        t('tip.rule_moon', { stars: TIP_LEVELS.STARS_PER_MOON }),
        t('tip.rule_sun', { moons: TIP_LEVELS.MOONS_PER_SUN }),
        t('tip.rule_max', { suns: TIP_LEVELS.MAX_SUNS, points: TIP_LEVELS.MAX_POINTS })]) ruleList.append(element("li", "", text));
    rules.append(ruleList);
    const anonymousLabel = element("label", "tip-dialog__anonymous");
    const anonymousInput = element("input", ""); anonymousInput.type = "checkbox";
    anonymousLabel.append(anonymousInput, document.createTextNode(t('tip.anonymous')));
    const status = element("div", "tip-dialog__status"); status.hidden = true; status.setAttribute("role", "alert");
    const submit = element("button", "tip-dialog__submit", t('tip.confirm')); submit.type = "button";
    container.replaceChildren(balanceRow, amountLabel, amountInput, preview, rules, anonymousLabel, status, submit);
    const amountValue = () => amountInput.value.trim() ? Number(amountInput.value) : NaN;
    const updatePreview = () => {
        if (!scope.isCurrent()) return;
        const amount = amountValue(); previewLevel.replaceChildren();
        if (!validAmount(amount)) {
            previewLevel.textContent = amount > TIP_LEVELS.MAX_POINTS ? t('tip.amount_limit', { max: TIP_LEVELS.MAX_POINTS }) : t('tip.integer_amount');
            return;
        }
        const badge = element("span", ""); badge.innerHTML = renderTipLevelHTML(amount, false);
        previewLevel.append(badge, element("span", "", getTipLevelDescription(amount)));
    };
    amountInput.addEventListener("input", updatePreview);
    submit.onclick = async () => {
        if (!scope.isCurrent() || submitted || confirming) return;
        const amount = amountValue(), isAnonymous = anonymousInput.checked;
        if (!validAmount(amount)) {
            showToast(amount > TIP_LEVELS.MAX_POINTS ? t('tip.amount_limit', { max: TIP_LEVELS.MAX_POINTS }) : t('tip.integer_amount'), "warning"); return;
        }
        if (balance < amount) {
            confirming = true;
            try {
                const go = await showConfirm(t('tip.balance_short_recharge'), { signal: confirmationController.signal });
                if (!go || !scope.isCurrent()) return;
                globalModal.closeModal(modal);
                if (sessionMatches() && parentCurrent()) await openUserProfileModal(currentUser);
            } catch (_) { if (sessionMatches() && parentCurrent()) showToast(t('common.error'), "error"); }
            finally { confirming = false; }
            return;
        }
        submitted = true; submit.disabled = amountInput.disabled = anonymousInput.disabled = true;
        submit.textContent = t('common.processing'); container.setAttribute("aria-busy", "true");
        let response;
        try {
            response = await api.tipUser(account, target, amount, isAnonymous, itemId);
            if (!scope.isCurrent()) return;
            if (response?.status !== "success") throw new Error();
        } catch (_) {
            if (scope.isCurrent()) {
                container.setAttribute("aria-busy", "false");
                status.hidden = false; status.textContent = t('tip.unknown_result');
                submit.textContent = t('tip.confirm');
            }
            return;
        }
        let freshBalance = validBalance(response.balance) ? response.balance : undefined;
        if (freshBalance === undefined) {
            try {
                const wallet = await api.getWallet(account, readOptions);
                if (!scope.isCurrent()) return;
                if (wallet?.status === "success" && validBalance(wallet.balance)) freshBalance = wallet.balance;
            } catch (_) { /* 资金已经提交，补充读取失败不改写成功。 */ }
        }
        if (!scope.isCurrent()) return;
        if (freshBalance !== undefined) currentUser.balance = freshBalance;
        const level = calculateTipLevel(amount);
        showToast(t(level.isMaxLevel ? 'tip.supreme_sponsor_success' : 'tip.success_thanks'), "success");
        if (freshBalance === undefined) showToast(t('tip.balance_refresh_failed'), "warning");
        globalModal.closeModal(modal);
        if (!sessionMatches() || !parentCurrent()) return;
        if (freshBalance !== undefined) {
            try { window.dispatchEvent(new CustomEvent('comfy-wallet-update', { detail: { account, balance: freshBalance } })); }
            catch (_) { /* 派生界面故障不重放打赏。 */ }
            if (!sessionMatches() || !parentCurrent()) return;
            try { await onSuccess?.(freshBalance); } catch (_) { console.warn('赞赏成功，视图更新失败'); }
        }
    };
    updatePreview();
    container.setAttribute('aria-busy', 'false');
    return modal;
}
