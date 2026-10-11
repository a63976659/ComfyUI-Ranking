// 前端页面/market/资金与钱包_充值组件.js
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { api, request, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { t } from "../components/用户体验增强.js";
import { API, UI, CACHE } from "../core/全局配置.js";

import { eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
import { normalizeWalletData } from "../profile/个人资料工具.js";
let rechargeSequence = 0;

/**
 * 充值弹窗组件 (真实拉起支付宝网关)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onBalanceChange 充值成功后的回调刷新函数
 */
/**
 * 统一管理充值按钮的加载/恢复状态
 * @param {HTMLButtonElement} btn
 * @param {boolean} isLoading
 * @param {string} loadingText
 * @param {string} normalText
 */
function _setButtonLoading(btn, isLoading, loadingText, normalText) {
    btn.disabled = isLoading;
    btn.setAttribute('aria-busy', String(isLoading));
    btn.innerText = isLoading ? loadingText : normalText;
    btn.style.background = isLoading ? "#888" : "#4CAF50";
    btn.style.cursor = isLoading ? "not-allowed" : "pointer";
}

export async function openRechargeModal(currentUser, onBalanceChange) {
    if (!currentUser?.account) return;
    const container = document.createElement("div");
    const account = currentUser.account;
    const componentId = `recharge-${++rechargeSequence}`;
    let constructing = true, modalElement = null, pollingTimer = null;
    const scope = createTaskViewScope({
        sessionMatches: captureRequestSession(), connected: () => constructing || container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => { container.replaceChildren(); if (modalElement) globalModal.closeModal(modalElement); }
    });
    const readOptions = { noCache: true, componentId, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES };
    scope.addCleanup(() => {
        clearTimeout(pollingTimer);
        container.querySelectorAll('input').forEach(input => { input.value = ''; });
        container.querySelector('#qr-image')?.removeAttribute('src');
    });
    container._cleanup = () => scope.dispose();
    let balanceText = t('wallet.recharge.balance_unavailable');
    try {
        const wallet = normalizeWalletData(await api.getWallet(account, readOptions));
        if (!scope.isCurrent()) return;
        if (Number.isSafeInteger(wallet.balance)) balanceText = String(wallet.balance);
    } catch (_) { if (!scope.isCurrent()) return; }

    container.style.color = "#ccc";

    const rechargeOptions = [
        { points: 10, price: 10, isCustom: false },
        { points: 100, price: 100, isCustom: false },
        { points: 1000, price: 1000, isCustom: false },
        { isCustom: true, label: t('wallet.recharge.custom') }
    ];

    let selectedOption = rechargeOptions[0];
    let paymentMethod = "alipay"; 

    function _rechargeOptionWrapper(isSelected, index, innerHtml) {
        return `<button type="button" aria-pressed="${isSelected}" class="recharge-opt ${isSelected ? 'selected' : ''}" data-index="${index}" style="flex: 1; min-width: 45%; padding: 15px; background: ${isSelected ? 'rgba(76, 175, 80, 0.2)' : 'var(--comfy-input-bg)'}; border: 2px solid ${isSelected ? '#4CAF50' : '#444'}; border-radius: 8px; cursor: pointer; text-align: center; transition: 0.2s;">${innerHtml}</button>`;
    }

    const renderOptions = () => rechargeOptions.map((opt, index) => {
        const isSelected = selectedOption === opt;
        if (opt.isCustom) {
            const inner = `<div style="font-size: 18px; font-weight: bold; color: ${isSelected ? '#4CAF50' : '#fff'}; margin-bottom: 5px; line-height: 22px;">${opt.label}</div><div style="font-size: 12px; color: #888;">${t('wallet.recharge.any_amount')}</div>`;
            return _rechargeOptionWrapper(isSelected, index, inner);
        } else {
            const inner = `<div style="font-size: 18px; font-weight: bold; color: ${isSelected ? '#4CAF50' : '#fff'}; margin-bottom: 5px;">${opt.points} ${t('wallet.recharge.points_suffix')}</div><div style="font-size: 12px; color: #888;">${t('wallet.recharge.price_prefix')}${opt.price.toFixed(2)}</div>`;
            return _rechargeOptionWrapper(isSelected, index, inner);
        }
    }).join("");

    container.innerHTML = `
        <div style="margin-bottom: 20px; text-align: center;">
            <div style="font-size: 14px; color: #aaa;">${t('wallet.recharge.current_balance')}</div>
            <div style="font-size: 28px; font-weight: bold; color: #FF9800; margin-top: 5px;">${balanceText} <span style="font-size: 14px;">${t('wallet.recharge.points_suffix')}</span></div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #eee;">${t('wallet.recharge.select_amount')} <span style="color: #888; font-weight: normal;">${t('wallet.recharge.exchange_rate')}</span></label>
            <div id="recharge-grid" style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${renderOptions()}
            </div>
            <div id="custom-input-container" style="display: none; margin-top: 10px;">
                <input type="number" id="custom-amount" placeholder="${t('wallet.recharge.custom_placeholder')}" min="1" max="10000" step="1" style="width: 100%; padding: 10px; background: #222; border: 1px solid #4CAF50; color: #fff; border-radius: 4px; box-sizing: border-box; text-align: center; font-size: 16px; font-weight: bold; outline: none;">
            </div>
        </div>

        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #eee;">${t('wallet.recharge.payment_method')}</label>
            <div style="display: flex; gap: 15px;">
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                    <input type="radio" name="pay_method" value="alipay" checked>
                    <span style="color: #00A1E9; font-weight: bold;">${t('wallet.recharge.alipay')}</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                    <input type="radio" name="pay_method" value="wechat" disabled>
                    <span style="color: #888; font-weight: bold;">${t('wallet.recharge.wechat')}</span>
                </label>
            </div>
        </div>

        <div id="qr-container" style="display: none; text-align: center; margin-bottom: 20px; padding: 20px; background: #fff; border-radius: 8px;">
            <div id="qr-loading" style="color: #666; font-size: 14px; margin-bottom: 10px;">${t('wallet.recharge.connecting')}</div>
            <img id="qr-image" style="width: 180px; height: 180px; display: none; margin: 0 auto;">
            <div style="color: #333; font-size: 13px; margin-top: 10px; font-weight: bold;">${t('wallet.recharge.scan_to_pay')} <span id="pay-price-text" style="color: #F44336;"></span> ${t('wallet.recharge.yuan')}</div>
            <div style="color: #888; font-size: 11px; margin-top: 5px;">${t('wallet.recharge.auto_redirect')}</div>
        </div>

        <button id="btn-create-order" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 15px; box-shadow: 0 4px 10px rgba(76, 175, 80, 0.3);">${t('wallet.recharge.get_qr')}</button>
    `;

    const customInputContainer = container.querySelector("#custom-input-container");
    const customAmountInput = container.querySelector("#custom-amount");

    const bindGridEvents = () => {
        container.querySelectorAll('.recharge-opt').forEach(el => {
            el.onclick = () => {
                if (!scope.isCurrent() || submitting) return;
                selectedOption = rechargeOptions[parseInt(el.getAttribute('data-index'))];
                container.querySelector('#recharge-grid').innerHTML = renderOptions();
                
                if (selectedOption.isCustom) {
                    customInputContainer.style.display = "block";
                    customAmountInput.focus();
                } else {
                    customInputContainer.style.display = "none";
                    customAmountInput.value = ""; 
                }
                bindGridEvents(); 
            };
        });
    };
    bindGridEvents();

    container.querySelectorAll('input[name="pay_method"]').forEach(radio => {
        radio.onchange = (e) => paymentMethod = e.target.value;
    });

    const btnCreateOrder = container.querySelector("#btn-create-order");
    const qrContainer = container.querySelector("#qr-container");
    const qrImage = container.querySelector("#qr-image");
    const qrLoading = container.querySelector("#qr-loading");
    let submitting = false, pollCount = 0, paymentConfirmed = false;
    qrImage.alt = t('wallet.recharge.scan_to_pay');
    customAmountInput.setAttribute('aria-label', t('wallet.recharge.select_amount'));
    qrLoading.setAttribute('role', 'status');

    btnCreateOrder.onclick = async () => {
        if (!scope.isCurrent() || submitting) return;
        const points = selectedOption.isCustom ? Number(customAmountInput.value) : selectedOption.points;
        if (!Number.isSafeInteger(points) || points < 1) return showToast(t('wallet.recharge.invalid_amount'), 'warning');
        if (points > 10000) return showToast(t('wallet.recharge.max_amount_exceeded'), 'warning');
        submitting = true;
        _setButtonLoading(btnCreateOrder, true, t('wallet.recharge.processing'), t('wallet.recharge.get_qr'));
        let confirmed;
        try { confirmed = await showConfirm(t('wallet.recharge.confirm_amount', { points, price: points.toFixed(2) }), {
            title: t('wallet.recharge.title'), confirmText: t('wallet.recharge.get_qr'), type: 'warning'
        }); } catch (_) {
            if (!scope.isCurrent()) return;
            submitting = false;
            _setButtonLoading(btnCreateOrder, false, t('wallet.recharge.processing'), t('wallet.recharge.get_qr'));
            return;
        }
        if (!scope.isCurrent()) return;
        if (!confirmed) {
            submitting = false;
            _setButtonLoading(btnCreateOrder, false, t('wallet.recharge.processing'), t('wallet.recharge.get_qr'));
            return;
        }
        qrContainer.style.display = 'block';
        qrLoading.style.display = 'block';
        qrImage.style.display = 'none';
        try {
            const order = await request('/api/wallet/create_recharge_order', {
                method: 'POST', body: { account, amount: points }, retries: 0
            });
            if (!scope.isCurrent()) return;
            if (order?.status !== 'success' || typeof order.order_id !== 'string' || !/^PAY_[a-zA-Z0-9_-]{1,128}$/.test(order.order_id)
                || typeof order.qr_code !== 'string' || order.qr_code.length > 4096) throw new Error('invalid order');
            const { createPaymentQRCode } = await import("./支付二维码工具.js");
            if (!scope.isCurrent()) return;
            qrImage.src = createPaymentQRCode(order.qr_code, UI.RECHARGE_QR_MAX_BYTES);
            qrLoading.style.display = 'none';
            qrImage.style.display = 'block';
            container.querySelector('#pay-price-text').textContent = points.toFixed(2);
            // 一次查询结束后再安排下一次，避免慢网络下并行查单。
            const pollUntil = Date.now() + UI.RECHARGE_POLL_INTERVAL * UI.RECHARGE_POLL_LIMIT;
            const poll = async () => {
                if (!scope.isCurrent() || paymentConfirmed) return;
                if (++pollCount > UI.RECHARGE_POLL_LIMIT || Date.now() >= pollUntil) {
                    showToast(t('wallet.recharge.timeout'), 'warning'); return;
                }
                try {
                    const checked = await request(`/api/wallet/check_order/${encodeURIComponent(order.order_id)}`, readOptions);
                    if (!scope.isCurrent()) return;
                    if (checked?.status === 'SUCCESS') {
                        paymentConfirmed = true;
                        let balance;
                        try {
                            const wallet = normalizeWalletData(await api.getWallet(account, readOptions));
                            if (Number.isSafeInteger(wallet.balance)) balance = wallet.balance;
                        } catch (_) {}
                        if (!scope.isCurrent()) return;
                        showToast(t('wallet.recharge.success', { points }), 'success');
                        if (balance === undefined) showToast(t('wallet.recharge.balance_unavailable'), 'warning');
                        scope.dispose(); globalModal.closeModal(modalElement);
                        if (balance !== undefined && onBalanceChange) onBalanceChange(balance);
                        return;
                    }
                } catch (_) { if (!scope.isCurrent()) return; }
                pollingTimer = setTimeout(poll, UI.RECHARGE_POLL_INTERVAL);
            };
            pollingTimer = setTimeout(poll, UI.RECHARGE_POLL_INTERVAL);
        } catch (error) {
            if (!scope.isCurrent()) return;
            const rejected = [400, 401, 403, 404, 422, 429].includes(error.status);
            qrLoading.textContent = t(rejected ? 'wallet.recharge.order_failed' : 'wallet.recharge.order_uncertain');
            if (rejected) {
                submitting = false;
                _setButtonLoading(btnCreateOrder, false, t('wallet.recharge.processing'), t('wallet.recharge.get_qr'));
            }
        }
    };
    if (!scope.isCurrent()) return;
    const observer = new MutationObserver(() => { if (!container.isConnected) scope.dispose(); });
    scope.addCleanup(() => observer.disconnect());
    globalModal.openModal(t('wallet.recharge.title'), container, { width: '400px' });
    modalElement = globalModal.activeModals.find(modal => modal.contains(container));
    constructing = false;
    observer.observe(document.body, { childList: true, subtree: true });
}
