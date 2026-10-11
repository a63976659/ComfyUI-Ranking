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
    btn.style.background = bgColor;
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
    let walletData;
    try {
        walletData = normalizeWalletData(await api.getWallet(account, { noCache: true, componentId,
            timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES }));
        if (!scope.isCurrent()) return;
        if (!Number.isSafeInteger(walletData.balance) || !Number.isSafeInteger(walletData.total_withdrawn)) throw new Error('wallet unavailable');
    } catch (_) {
        if (scope.isCurrent()) showToast(t('wallet.withdraw.balance_unavailable'), 'warning');
        scope.dispose(); return;
    }
    const maxWithdraw = walletData.balance;
    const totalWithdrawn = walletData.total_withdrawn;
    if (maxWithdraw <= 0) {
        showToast(t('wallet.withdraw.no_balance'), "warning"); scope.dispose(); return;
    }

    container.style.color = "#ccc";

    container.innerHTML = `
        <div style="margin-bottom: 20px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 12px; color: #2196F3; margin-bottom: 5px;">${t('wallet.withdraw.total_withdrawable')}</div>
                <div style="font-size: 24px; font-weight: bold; color: #fff;">${maxWithdraw}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 12px; color: #888; margin-bottom: 5px;">${t('wallet.withdraw.rmb_equivalent')}</div>
                <div style="font-size: 16px; font-weight: bold; color: #4CAF50;">≈ ${t('wallet.recharge.price_prefix')} ${maxWithdraw.toFixed(2)}</div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">${t('wallet.withdraw.amount_label')} <span style="color:#F44336">*</span></label>
            <input type="number" id="withdraw-amount" placeholder="${t('wallet.withdraw.amount_placeholder')}" max="${maxWithdraw}" min="1" step="1" style="width:100%; padding:10px; background:var(--comfy-input-bg); border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
            
            <div id="fee-calc-box" style="margin-top: 10px; padding: 10px; background: rgba(255,152,0,0.1); border: 1px dashed #FF9800; border-radius: 4px; font-size: 12px; color: #FF9800; display:none; line-height: 1.5;">
                <div id="fee-text"></div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">${t('wallet.withdraw.alipay_account')} <span style="color:#F44336">*</span></label>
            <input type="text" id="withdraw-account" placeholder="${t('wallet.withdraw.alipay_placeholder')}" style="width:100%; padding:10px; background:var(--comfy-input-bg); border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">${t('wallet.withdraw.real_name')} <span style="color:#F44336">*</span></label>
            <input type="text" id="withdraw-name" placeholder="${t('wallet.withdraw.real_name_placeholder')}" style="width:100%; padding:10px; background:var(--comfy-input-bg); border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom: 20px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">${t('wallet.withdraw.security_code')} <span style="color:#F44336">*</span></label>
            <div style="display:flex; gap:10px;">
                <input type="text" id="withdraw-code" placeholder="${t('wallet.withdraw.code_placeholder')}" maxlength="6" style="flex:1; padding:10px; background:var(--comfy-input-bg); border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <button id="btn-send-code" style="padding:0 15px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; white-space:nowrap; transition:0.2s;">${t('wallet.withdraw.get_code')}</button>
            </div>
        </div>

        <button id="btn-submit-withdraw" style="width:100%; padding:12px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:15px; transition:0.2s;" >${t('wallet.withdraw.confirm')}</button>
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
            feeText.innerHTML = `${t('wallet.withdraw.fee_quota_exhausted')}<br>${t('wallet.withdraw.fee_deducted')}<strong style="color:#F44336;">${fee} ${t('wallet.recharge.points_suffix')}</strong><br>${t('wallet.withdraw.fee_actual')}<strong style="color:#4CAF50;">${(val - fee).toFixed(2)} ${t('wallet.withdraw.yuan')}</strong>`;
        } else {
            feeText.innerHTML = `${t('wallet.withdraw.fee_free_quota')}<br>${t('wallet.withdraw.fee_full_amount')}<strong style="color:#4CAF50;">${val.toFixed(2)} ${t('wallet.withdraw.yuan')}</strong>`;
        }
    };

    const btnSendCode = container.querySelector("#btn-send-code");
    btnSendCode.onclick = async () => {
        if (!scope.isCurrent() || btnSendCode.disabled) return;
        _setButtonState(btnSendCode, true, "#555", t('wallet.withdraw.sending'));
        try {
            await api.sendVerifyCode(currentUser.email, "email", "withdraw", currentUser.account);
            if (!scope.isCurrent()) return;
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
            const rejected = [400, 401, 403, 404, 422, 429].includes(error.status);
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
    const observer = new MutationObserver(() => { if (!container.isConnected) scope.dispose(); });
    scope.addCleanup(() => observer.disconnect());
    globalModal.openModal(t('wallet.withdraw.title'), container, { width: "420px" });
    modalElement = globalModal.activeModals.find(modal => modal.contains(container));
    constructing = false;
    observer.observe(document.body, { childList: true, subtree: true });
}