import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";

export function renderResetForm(container, switchView, onSuccessCallback) {
    container.innerHTML = `
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">${t('auth.current_account')} <span style="color: #F44336;">*</span></label><input type="text" id="reset-account" placeholder="${t('auth.enter_account')}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        
        <div style="margin-bottom: 10px; padding: 10px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; border-radius: 4px;">
            <label style="display: block; margin-bottom: 5px; color: #2196F3; font-weight: bold;">${t('auth.security_verify')} (${t('auth.bound_email')}) <span style="color: #F44336;">*</span></label>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="reset-verify" placeholder="${t('auth.enter_bound_email')}" style="flex: 1; padding: 8px; background: #222; border: 1px solid #2196F3; color: #fff; border-radius: 4px; box-sizing: border-box;">
                <button id="btn-send-code" style="padding: 0 15px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; white-space: nowrap; transition: 0.2s;">${t('auth.get_code')}</button>
            </div>
            <input type="text" id="reset-code" placeholder="${t('auth.enter_6_digit_code')}" maxlength="6" style="width: 100%; margin-top: 10px; padding: 8px; background: #222; border: 1px dashed #2196F3; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">${t('auth.old_password')} (${t('auth.old_password_tip')}) </label><input type="password" id="reset-old-password" placeholder="${t('auth.old_password_placeholder')}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">${t('auth.new_password')} (≥6${t('common.chars')}) <span style="color: #F44336;">*</span></label><input type="password" id="reset-new-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display: block; margin-bottom: 5px;">${t('auth.confirm_new_password')} <span style="color: #F44336;">*</span></label><input type="password" id="reset-confirm-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        
        <button id="btn-submit-reset" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">${t('auth.change_password')}</button>
        <div style="text-align: center; font-size: 12px;"><a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">${t('auth.back_to_login')}</a></div>
    `;

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };
    
    // 发送验证码逻辑
    const btnSendCode = container.querySelector("#btn-send-code");
    let countdownTimer = null;
    
    btnSendCode.onclick = async (e) => {
        e.preventDefault();
        
        // 先抓取上方输入的账号，没填就不让发验证码
        const accountInput = container.querySelector("#reset-account").value.trim();
        if (!accountInput) return showToast(t('auth.enter_account_first'), "warning");

        const verifyInput = container.querySelector("#reset-verify").value.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifyInput);
        
        if (!isEmail) return showToast(t('auth.invalid_email'), "error");
        
        const contactType = "email";
        
        btnSendCode.disabled = true;
        btnSendCode.style.background = "#555";
        btnSendCode.innerText = t('auth.sending');
        
        try {
            await api.sendVerifyCode(verifyInput, contactType, "reset", accountInput);
            
            showToast(t('auth.code_sent'), "success");
            
            let timeLeft = 60;
            btnSendCode.innerText = `${timeLeft}s ${t('auth.resend')}`;
            countdownTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(countdownTimer);
                    btnSendCode.disabled = false;
                    btnSendCode.style.background = "#2196F3";
                    btnSendCode.innerText = t('auth.get_code');
                } else {
                    btnSendCode.innerText = `${timeLeft}s ${t('auth.resend')}`;
                }
            }, 1000);
            
        } catch (err) {
            showToast(err.message || t('feedback.error'), "error");
            btnSendCode.disabled = false;
            btnSendCode.style.background = "#2196F3";
            btnSendCode.innerText = t('auth.get_code');
        }
    };

    container.querySelector("#btn-submit-reset").onclick = () => {
        const acc = container.querySelector("#reset-account").value.trim();
        const verify = container.querySelector("#reset-verify").value.trim();
        const code = container.querySelector("#reset-code").value.trim();
        const op = container.querySelector("#reset-old-password").value;
        const np = container.querySelector("#reset-new-password").value;
        const cp = container.querySelector("#reset-confirm-password").value;
        
        if (!acc || !verify || !np || !code) return showToast(t('auth.reset_required_fields'), "warning");
        if (code.length !== 6) return showToast(t('auth.invalid_code'), "warning");
        
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verify);
        
        if (!isEmail) {
            return showToast(t('auth.invalid_email'), "error");
        }

        if (np !== cp) return showToast(t('auth.password_mismatch'), "error");
        if (np.length < 6) return showToast(t('auth.password_format_error'), "error");

        const formData = { 
            type: "reset", 
            account: String(acc), 
            verifyContact: String(verify), 
            verifyType: "email", 
            code: String(code),
            old_password: op ? String(op) : null, // 对齐后端 old_password
            new_password: String(np)              // 对齐后端 new_password
        };
        if (onSuccessCallback) onSuccessCallback(formData);
    };
}