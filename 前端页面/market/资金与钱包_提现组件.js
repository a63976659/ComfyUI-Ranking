// 前端页面/market/资金与钱包_提现组件.js
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { t } from "../components/用户体验增强.js";

// 模块级防重复提交标志
let isSubmitting = false;

/**
 * 提现弹窗组件 (带邮箱验证码安全风控与手续费计算)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onSuccess 提现成功后的回调函数
 */
export function openWithdrawModal(currentUser, onSuccess) {
    // 使用统一可用余额作为可提现额度
    const maxWithdraw = currentUser.balance || 0;
    
    // 🚀 获取历史累计提现金额用于计算免责额度
    const totalWithdrawn = currentUser.total_withdrawn || 0; 
    
    if (maxWithdraw <= 0) {
        return showToast(t('wallet.withdraw.no_balance'), "warning");
    }

    const container = document.createElement("div");
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
            <input type="number" id="withdraw-amount" placeholder="${t('wallet.withdraw.amount_placeholder')}" max="${maxWithdraw}" min="1" step="1" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
            
            <div id="fee-calc-box" style="margin-top: 10px; padding: 10px; background: rgba(255,152,0,0.1); border: 1px dashed #FF9800; border-radius: 4px; font-size: 12px; color: #FF9800; display:none; line-height: 1.5;">
                <div id="fee-text"></div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">${t('wallet.withdraw.alipay_account')} <span style="color:#F44336">*</span></label>
            <input type="text" id="withdraw-account" placeholder="${t('wallet.withdraw.alipay_placeholder')}" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">${t('wallet.withdraw.real_name')} <span style="color:#F44336">*</span></label>
            <input type="text" id="withdraw-name" placeholder="${t('wallet.withdraw.real_name_placeholder')}" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom: 20px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">${t('wallet.withdraw.security_code')} <span style="color:#F44336">*</span></label>
            <div style="display:flex; gap:10px;">
                <input type="text" id="withdraw-code" placeholder="${t('wallet.withdraw.code_placeholder')}" maxlength="6" style="flex:1; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <button id="btn-send-code" style="padding:0 15px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; white-space:nowrap; transition:0.2s;">${t('wallet.withdraw.get_code')}</button>
            </div>
        </div>

        <button id="btn-submit-withdraw" style="width:100%; padding:12px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:15px; transition:0.2s;" onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">${t('wallet.withdraw.confirm')}</button>
    `;

    // 🚀 核心逻辑：动态计算提现手续费
    const inputAmount = container.querySelector("#withdraw-amount");
    inputAmount.oninput = () => {
        let val = parseInt(inputAmount.value);
        if (val > maxWithdraw) { val = maxWithdraw; inputAmount.value = val; }
        
        const feeBox = container.querySelector("#fee-calc-box");
        const feeText = container.querySelector("#fee-text");
        if (!val || val <= 0) {
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
        btnSendCode.disabled = true;
        btnSendCode.style.background = "#555";
        btnSendCode.innerText = t('wallet.withdraw.sending');
        try {
            await api.sendVerifyCode(currentUser.email, "email", "withdraw", currentUser.account);
            showToast(t('wallet.withdraw.code_sent'), "success");
            let count = 60;
            const timer = setInterval(() => {
                count--;
                btnSendCode.innerText = t('wallet.withdraw.resend_in', { seconds: count });
                if (count <= 0) {
                    clearInterval(timer);
                    btnSendCode.disabled = false;
                    btnSendCode.style.background = "#2196F3";
                    btnSendCode.innerText = t('wallet.withdraw.get_code');
                }
            }, 1000);
        } catch (error) {
            showToast(t('wallet.withdraw.code_failed') + error.message, "error");
            btnSendCode.disabled = false;
            btnSendCode.style.background = "#2196F3";
            btnSendCode.innerText = t('wallet.withdraw.get_code');
        }
    };

    const btnSubmit = container.querySelector("#btn-submit-withdraw");
    btnSubmit.onclick = async () => {
        // 防重复提交检查
        if (isSubmitting) return;

        const amount = parseInt(inputAmount.value);
        const alipayAccount = container.querySelector("#withdraw-account").value.trim();
        const realName = container.querySelector("#withdraw-name").value.trim();
        const code = container.querySelector("#withdraw-code").value.trim();

        // 验证为正整数
        if (!amount || amount < 1 || !Number.isInteger(amount)) {
            return showToast(t('wallet.withdraw.min_amount'), "warning");
        }
        if (!alipayAccount || !realName) return showToast(t('wallet.withdraw.fill_account'), "warning");
        if (code.length !== 6) return showToast(t('wallet.withdraw.invalid_code'), "warning");

        // 设置提交标志
        isSubmitting = true;
        btnSubmit.innerHTML = t('wallet.withdraw.submitting');
        btnSubmit.disabled = true;

        try {
            await api.submitWithdraw({ amount, alipayAccount, real_name: realName, code, account: currentUser.account });
            
            showToast(t('wallet.withdraw.success'), "success");
            globalModal.closeTopModal();
            
            if (onSuccess) onSuccess(); 
        } catch (error) {
            showToast(t('wallet.withdraw.submit_failed') + error.message, "error");
            btnSubmit.innerHTML = t('wallet.withdraw.confirm');
            btnSubmit.disabled = false;
        } finally {
            // 无论成功失败，重置提交标志
            isSubmitting = false;
        }
    };

    globalModal.openModal(t('wallet.withdraw.title'), container, { width: "420px" });
}