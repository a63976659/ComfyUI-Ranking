// 前端页面/market/资金与钱包_提现组件.js
import { api, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { t } from "../components/用户体验增强.js";

import { API, CACHE } from "../core/全局配置.js";
import { eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
import { normalizeWalletData } from "../profile/个人资料工具.js";
let withdrawalSequence = 0;

/**
 * 统一管理提现相关按钮的禁用/恢复状态
 * @param {HTMLButtonElement} btn
 * @param {boolean} disabled
 * @param {string} bgColor
 * @param {string} text
 */
function _setButtonState(btn, disabled, bgColor, text) {
    btn.disabled = disabled;
    btn.setAttribute('aria-busy', String(disabled));
    btn.innerText = text;
}

/** 提现表单验证规则 */
const _WITHDRAW_RULES = [
    { check: (f) => !f.amount || f.amount < 1 || !Number.isInteger(f.amount), msgKey: 'wallet.withdraw.min_amount', level: 'warning' },
    { check: (f) => f.amount > 5000, msgKey: 'wallet.withdraw.max_amount_exceeded', level: 'warning' },
    { check: (f) => !f.alipayAccount || !f.realName, msgKey: 'wallet.withdraw.fill_account', level: 'warning' },
    { check: (f) => f.code.length !== 6, msgKey: 'wallet.withdraw.invalid_code', level: 'warning' },
];

function _validateWithdrawForm(fields) {
    for (const rule of _WITHDRAW_RULES) {
        if (rule.check(fields)) {
            showToast(t(rule.msgKey), rule.level);
            return false;
        }
    }
    return true;
}

/**
 * 提现弹窗组件 (带邮箱验证码安全风控与手续费计算)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onSuccess 提现成功后的回调函数
 */
export async function openWithdrawModal(currentUser, onSuccess) {
    if (!currentUser?.account) return;
    const container = document.createElement("div");
    const account = currentUser.account;
    const componentId = `withdrawal-${++withdrawalSequence}`;
    let constructing = true, isSubmitting = false, countdown = null, deadline = null;
    let modalElement = null;
    const scope = createTaskViewScope({
        sessionMatches: captureRequestSession(), connected: () => constructing || container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => {
            container.replaceChildren();
            if (modalElement) globalModal.closeModal(modalElement);
        }
    });
    scope.addCleanup(() => {
        clearInterval(countdown); clearTimeout(deadline);
        container.querySelectorAll('input').forEach(input => { input.value = ''; });
    });
    container._cleanup = () => scope.dispose();
    if (!scope.isCurrent()) return;
    container.className = "wallet-modal wallet-modal--withdraw";
    container.setAttribute('aria-busy', 'true');
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = t('common.loading');
    container.append(status);
    const observer = new MutationObserver(() => { if (!container.isConnected) scope.dispose(); });
    scope.addCleanup(() => observer.disconnect());
    globalModal.openModal(t('wallet.withdraw.title'), container, { width: "420px" });
    modalElement = globalModal.activeModals.find(modal => modal.contains(container));
    constructing = false;
    observer.observe(document.body, { childList: true, subtree: true });
    let walletData;
    try {
        walletData = normalizeWalletData(await api.getWallet(account, { noCache: true, componentId,
            timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES }));
        if (!scope.isCurrent()) return;
        if (!Number.isSafeInteger(walletData.balance) || !Number.isSafeInteger(walletData.total_withdrawn)) throw new Error('wallet unavailable');
    } catch (_) {
        if (scope.isCurrent()) showToast(t('wallet.withdraw.balance_unavailable'), 'warning');
        scope.dispose(); globalModal.closeModal(modalElement); return;
    }
    const maxWithdraw = walletData.balance;
    const totalWithdrawn = walletData.total_withdrawn;
    if (maxWithdraw <= 0) {
        showToast(t('wallet.withdraw.no_balance'), "warning");
        scope.dispose(); globalModal.closeModal(modalElement); return;
    }

    container.innerHTML = `
        <div class="wallet-withdraw__summary">
            <div>
                <div class="wallet-withdraw__summary-label">${t('wallet.withdraw.total_withdrawable')}</div>
                <div class="wallet-withdraw__balance">${maxWithdraw}</div>
            </div>
            <div class="wallet-withdraw__equivalent">
                <div class="wallet-withdraw__summary-label">${t('wallet.withdraw.rmb_equivalent')}</div>
                <div class="wallet-withdraw__equivalent-value">≈ ${t('wallet.recharge.price_prefix')} ${maxWithdraw.toFixed(2)}</div>
            </div>
        </div>

        <div class="wallet-modal__field">
            <label for="withdraw-amount" class="wallet-modal__label">${t('wallet.withdraw.amount_label')} <span class="wallet-modal__danger ranking-required-marker"></span></label>
            <input type="number" id="withdraw-amount" placeholder="${t('wallet.withdraw.amount_placeholder')}" max="${maxWithdraw}" min="1" step="1" class="wallet-modal__input">
            
            <div id="fee-calc-box" class="wallet-withdraw__fee" style="display:none;">
                <div id="fee-text"></div>
            </div>
        </div>

        <div class="wallet-modal__field">
            <label for="withdraw-account" class="wallet-modal__label">${t('wallet.withdraw.alipay_account')} <span class="wallet-modal__danger ranking-required-marker"></span></label>
            <input type="text" id="withdraw-account" placeholder="${t('wallet.withdraw.alipay_placeholder')}" class="wallet-modal__input">
        </div>

        <div class="wallet-modal__field">
            <label for="withdraw-name" class="wallet-modal__label">${t('wallet.withdraw.real_name')} <span class="wallet-modal__danger ranking-required-marker"></span></label>
            <input type="text" id="withdraw-name" placeholder="${t('wallet.withdraw.real_name_placeholder')}" class="wallet-modal__input">
        </div>

        <div class="wallet-modal__field wallet-modal__field--last">
            <label for="withdraw-code" class="wallet-modal__label">${t('wallet.withdraw.security_code')} <span class="wallet-modal__danger ranking-required-marker"></span></label>
            <div class="wallet-withdraw__code-row">
                <input type="text" id="withdraw-code" placeholder="${t('wallet.withdraw.code_placeholder')}" maxlength="6" class="wallet-modal__input wallet-withdraw__code-input">
                <button type="button" id="btn-send-code" class="wallet-modal__button wallet-modal__button--code">${t('wallet.withdraw.get_code')}</button>
            </div>
        </div>

        <button type="button" id="btn-submit-withdraw" class="wallet-modal__button wallet-modal__button--primary" >${t('wallet.withdraw.confirm')}</button>
    `;

    // 🚀 核心逻辑：动态计算提现手续费
    const inputAmount = container.querySelector("#withdraw-amount");
    inputAmount.oninput = () => {
        let val = Number(inputAmount.value);
        if (val > maxWithdraw) { val = maxWithdraw; inputAmount.value = val; }
        
        const feeBox = container.querySelector("#fee-calc-box");
        const feeText = container.querySelector("#fee-text");
        if (!Number.isSafeInteger(val) || val <= 0) {
            feeBox.style.display = "none";
            return;
        }
        
        // 计算规则：100元=100积分免手续费 (1积分=1元)
        const freeQuota = Math.max(0, 100 - totalWithdrawn);
        let fee = 0;
        if (val > freeQuota) {
            fee = Math.floor((val - freeQuota) * 0.1); // 超过免责额度的部分收取 10%
        }
        
        feeBox.style.display = "block";
        if (fee > 0) {
            feeText.innerHTML = `${t('wallet.withdraw.fee_quota_exhausted')}<br>${t('wallet.withdraw.fee_deducted')}<strong class="wallet-modal__danger">${fee} ${t('wallet.recharge.points_suffix')}</strong><br>${t('wallet.withdraw.fee_actual')}<strong class="wallet-modal__success">${(val - fee).toFixed(2)} ${t('wallet.withdraw.yuan')}</strong>`;
        } else {
            feeText.innerHTML = `${t('wallet.withdraw.fee_free_quota')}<br>${t('wallet.withdraw.fee_full_amount')}<strong class="wallet-modal__success">${val.toFixed(2)} ${t('wallet.withdraw.yuan')}</strong>`;
        }
    };

    const btnSendCode = container.querySelector("#btn-send-code");
    btnSendCode.onclick = async () => {
        if (!scope.isCurrent() || btnSendCode.disabled) return;
        _setButtonState(btnSendCode, true, "#555", t('wallet.withdraw.sending'));
        try {
            const profile = await api.getUserProfile(account, { noCache: true, noStore: true, componentId,
                timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES });
            if (!scope.isCurrent()) return;
            if (!profile || typeof profile !== "object" || Array.isArray(profile) || profile.status !== "success" ||
                    !profile.data || typeof profile.data !== "object" ||
                    Array.isArray(profile.data) || profile.data.account !== account ||
                    typeof profile.data.email !== "string" || !profile.data.email.trim()) {
                throw new Error("unconfirmed withdrawal contact");
            }
            const result = await api.sendVerifyCode(profile.data.email, "email", "withdraw", account);
            if (!scope.isCurrent()) return;
            if (!result || typeof result !== "object" || Array.isArray(result) || result.status !== "success") {
                throw new Error("unconfirmed verification code");
            }
            showToast(t('wallet.withdraw.code_sent'), "success");
            let count = 60;
            countdown = setInterval(() => {
                if (!scope.isCurrent()) return;
                count--;
                btnSendCode.innerText = t('wallet.withdraw.resend_in', { seconds: count });
                if (count <= 0) {
                    clearInterval(countdown);
                    _setButtonState(btnSendCode, false, "#2196F3", t('wallet.withdraw.get_code'));
                }
            }, 1000);
        } catch (error) {
            if (!scope.isCurrent()) return;
            showToast(t('wallet.withdraw.code_failed'), "error");
            _setButtonState(btnSendCode, false, "#2196F3", t('wallet.withdraw.get_code'));
        }
    };

    const btnSubmit = container.querySelector("#btn-submit-withdraw");
    btnSubmit.onclick = async () => {
        // 防重复提交检查
        if (!scope.isCurrent() || isSubmitting) return;

        const amount = Number(inputAmount.value);
        const alipayAccount = container.querySelector("#withdraw-account").value.trim();
        const realName = container.querySelector("#withdraw-name").value.trim();
        const code = container.querySelector("#withdraw-code").value.trim();

        // 统一表单校验
        if (!_validateWithdrawForm({ amount, alipayAccount, realName, code })) return;

        // 设置提交标志
        isSubmitting = true;
        _setButtonState(btnSubmit, true, "#888", t('wallet.withdraw.submitting'));

        // 30秒超时保护
        deadline = setTimeout(() => {
            if (!scope.isCurrent()) return;
            showToast(t('wallet.withdraw.timeout'), "warning");
        }, 30000);

        try {
            const result = await api.submitWithdraw({ amount, alipayAccount, real_name: realName, code, account: currentUser.account });
            clearTimeout(deadline);
            
            if (!scope.isCurrent()) return;
            if (result?.status !== 'success') throw new Error('unconfirmed withdrawal');
            showToast(t('wallet.withdraw.success'), "success");
            scope.dispose();
            globalModal.closeModal(modalElement);
            
            if (onSuccess) onSuccess(); 
        } catch (error) {
            clearTimeout(deadline);
            if (!scope.isCurrent()) return;
            const rejected = (error.requestBodyRejected === true || [400, 401, 403, 404, 422, 429].includes(error.status));
            showToast(t(rejected ? 'wallet.withdraw.submit_failed' : 'wallet.withdraw.timeout'), 'warning');
            if (rejected) {
                isSubmitting = false;
                _setButtonState(btnSubmit, false, '#4CAF50', t('wallet.withdraw.confirm'));
            }
        }
    };

    if (!scope.isCurrent()) return;
    container.querySelectorAll('label').forEach(label => {
        const input = label.parentElement.querySelector('input');
        if (input) input.setAttribute('aria-label', label.textContent.trim());
    });
    container.setAttribute('aria-busy', 'false');
}
