import { createAuthFormScope } from "./认证表单生命周期.js";
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";

export function renderResetForm(container, switchView, onSuccessCallback, prefill = null) {
    container.innerHTML = `
        <div class="auth-form">
            <div class="auth-form__field"><label for="reset-account">${t('auth.current_account')} <span class="auth-form__required" aria-hidden="true">*</span></label><input type="text" id="reset-account" class="auth-form__input" name="username" autocomplete="username" required></div>
            <fieldset class="auth-form__security">
                <legend>${t('auth.security_verify')}</legend>
                <label for="reset-verify">${t('auth.bound_email')} <span class="auth-form__required" aria-hidden="true">*</span></label>
                <div class="auth-form__code-row">
                    <input type="email" id="reset-verify" name="email" autocomplete="email" required placeholder="${t('auth.enter_bound_email')}" class="auth-form__input">
                    <button type="button" id="btn-send-code" class="auth-form__button">${t('auth.get_code')}</button>
                </div>
                <label for="reset-code">${t('auth.verification_code')} <span class="auth-form__required" aria-hidden="true">*</span></label>
                <input type="text" id="reset-code" name="verification-code" autocomplete="one-time-code" inputmode="numeric" required placeholder="${t('auth.enter_6_digit_code')}" maxlength="6" class="auth-form__input">
            </fieldset>
            <div class="auth-form__field"><label for="reset-old-password">${t('auth.old_password')} (${t('auth.old_password_tip')})</label><input type="password" id="reset-old-password" class="auth-form__input" name="old-password" autocomplete="current-password" placeholder="${t('auth.old_password_placeholder')}"></div>
            <div class="auth-form__field"><label for="reset-new-password">${t('auth.new_password')} (≥6${t('common.chars')}) <span class="auth-form__required" aria-hidden="true">*</span></label><input type="password" id="reset-new-password" class="auth-form__input" name="new-password" autocomplete="new-password" required></div>
            <div class="auth-form__field"><label for="reset-confirm-password">${t('auth.confirm_new_password')} <span class="auth-form__required" aria-hidden="true">*</span></label><input type="password" id="reset-confirm-password" class="auth-form__input" name="confirm-password" autocomplete="new-password" required></div>
            <button type="button" id="btn-submit-reset" class="auth-form__button auth-form__primary">${t('auth.change_password')}</button>
            <div class="auth-form__footer"><button type="button" id="toggle-to-login" class="auth-form__link">${t('auth.back_to_login')}</button></div>
        </div>
    `;
    const formScope = createAuthFormScope(container);

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };

    // 🔎 找回账号跳转过来时，自动回填账号与邮箱
    if (prefill) {
        if (prefill.account) container.querySelector("#reset-account").value = prefill.account;
        if (prefill.email) container.querySelector("#reset-verify").value = prefill.email;
    }
    
    function startCountdown(btn, duration) {
        let timeLeft = duration;
        btn.innerText = `${timeLeft}s ${t('auth.resend')}`;
        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.innerText = t('auth.get_code');
            } else {
                btn.innerText = `${timeLeft}s ${t('auth.resend')}`;
            }
        }, 1000);
        return timer;
    }

    // 发送验证码逻辑
    const btnSendCode = container.querySelector("#btn-send-code");
    let countdownTimer = null;

    // 🔧 注册清理函数：视图切换时清除倒计时定时器，防止内存泄漏
    formScope.addCleanup(() => { clearInterval(countdownTimer); countdownTimer = null; });
    
    btnSendCode.onclick = async (e) => {
        e.preventDefault();
        if (!formScope.current() || btnSendCode.disabled) return;
        
        // 先抓取上方输入的账号，没填就不让发验证码
        const accountInput = container.querySelector("#reset-account").value.trim();
        if (!accountInput) return showToast(t('auth.enter_account_first'), "warning");

        const verifyInput = container.querySelector("#reset-verify").value.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifyInput);
        
        if (!isEmail) return showToast(t('auth.invalid_email'), "error");
        
        const contactType = "email";
        
        btnSendCode.disabled = true;
        btnSendCode.innerText = t('auth.sending');
        
        try {
            const response = await api.sendVerifyCode(verifyInput, contactType, "reset", accountInput);
            if (!formScope.current()) return;
            if (response?.status !== 'success') throw new Error('Invalid verification response');
            
            showToast(t('auth.code_sent'), "success");
            
            countdownTimer = startCountdown(btnSendCode, 60);
            
        } catch (err) {
            if (!formScope.current()) return;
            showToast(t('feedback.error'), "error");
            btnSendCode.disabled = false;
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
        

        if (np !== cp) return showToast(t('auth.password_mismatch'), "error");
        if (np.length < 6) return showToast(t('auth.password_format_error'), "error");

        const formData = { 
            type: "reset", 
            account: acc, 
            verifyContact: verify, 
            verifyType: "email", 
            code: code,
            old_password: op || null,
            new_password: np
        };
        if (onSuccessCallback) onSuccessCallback(formData);
    };
}
