import { createAuthFormScope, createAuthFieldFeedback } from "./认证表单生命周期.js";
// 前端页面/auth/找回账号表单组件.js
// ==========================================
// 🔎 找回账号表单组件
// ==========================================
// 作用：用户同时忘记账号和密码时，凭绑定邮箱+验证码找回账号
// 关联文件：
//   - 用户注册登录组件.js (switchView 渲染本组件)
//   - 重置密码表单组件.js (找回成功后携带 prefill 跳转重置密码)
//   - 网络请求_业务API.js (api.sendVerifyCode / api.recoverAccount)
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
// 🛡️ 安全转义：防止网络返回数据注入 HTML（🧹 P2归一：使用统一版）
import { escapeHtml } from "../components/互动工具函数.js";

export function renderRecoverForm(container, switchView) {
    container.innerHTML = `
        <div class="auth-form">
            <p class="auth-form__description">${t('auth.recover_desc')}</p>
            <fieldset class="auth-form__security">
                <legend>${t('auth.security_verify')}</legend>
                <label for="recover-email">${t('auth.bound_email')} <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label>
                <div class="auth-form__code-row">
                    <input type="email" id="recover-email" name="email" autocomplete="email" required placeholder="${t('auth.enter_bound_email')}" class="auth-form__input">
                    <button type="button" id="btn-recover-send-code" class="auth-form__button">${t('auth.get_code')}</button>
                </div>
                <label for="recover-code">${t('auth.verification_code')} <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label>
                <input type="text" id="recover-code" name="verification-code" autocomplete="one-time-code" inputmode="numeric" required placeholder="${t('auth.enter_6_digit_code')}" maxlength="6" class="auth-form__input">
            </fieldset>
            <button type="button" id="btn-submit-recover" class="auth-form__button auth-form__primary">${t('auth.recover_account')}</button>
            <div class="auth-form__footer"><button type="button" id="recover-to-login" class="auth-form__link">${t('auth.back_to_login')}</button></div>
        </div>
    `;
    const formScope = createAuthFormScope(container);
    const field = id => container.querySelector('#' + id);
    const feedback = createAuthFieldFeedback(container, formScope, { notify: showToast });

    container.querySelector("#recover-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };

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

    // 发送验证码逻辑（action_type=recover，无需账号）
    const btnSendCode = container.querySelector("#btn-recover-send-code");
    let countdownTimer = null;

    // 🔧 注册清理函数：视图切换时清除倒计时定时器，防止内存泄漏
    formScope.addCleanup(() => { clearInterval(countdownTimer); countdownTimer = null; });

    btnSendCode.onclick = async (e) => {
        e.preventDefault();
        if (!formScope.current() || btnSendCode.disabled) return;
        feedback.clear([field('recover-email')]);

        const emailInput = container.querySelector("#recover-email").value.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput);
        if (!isEmail) return feedback.report([field('recover-email')], t('auth.invalid_email'), "error");

        btnSendCode.disabled = true;
        btnSendCode.innerText = t('auth.sending');

        try {
            const response = await api.sendVerifyCode(emailInput, "email", "recover");
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

    // 提交找回：验证码核验成功后展示账号
    const btnSubmit = container.querySelector("#btn-submit-recover");
    btnSubmit.onclick = async () => {
        if (!formScope.current() || btnSubmit.disabled) return;
        feedback.clear();
        const email = container.querySelector("#recover-email").value.trim();
        const code = container.querySelector("#recover-code").value.trim();

        if (!email) return feedback.report([field('recover-email')], t('auth.invalid_email'));
        if (code.length !== 6) return feedback.report([field('recover-code')], t('auth.invalid_code'));

        btnSubmit.disabled = true;
        btnSubmit.innerText = t('auth.sending');

        try {
            const res = await api.recoverAccount(email, code);
            if (!formScope.current()) return;

            if (res?.status !== 'success' || typeof res.account !== 'string' || !res.account.trim()
                || (res.name != null && typeof res.name !== 'string')) throw new Error('Invalid recovery response');
            showToast(t('auth.recover_success'), "success");

            // 🔧 展示结果前清除倒计时，避免定时器继续作用于已替换的 DOM
            if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

            // 展示找回结果：账号 + 昵称，提供跳转重置密码入口
            container.querySelectorAll('input').forEach(input => { input.value = ''; });
            const nickname = res.name ? `（${escapeHtml(res.name)}）` : "";
            const restoreResultFocus = container.contains(document.activeElement);
            container.innerHTML = `
                <div class="auth-form">
                    <div class="auth-form__result" role="status">
                        <div class="auth-form__result-title">✅ ${t('auth.recover_success')}</div>
                        <div class="auth-form__description">${t('auth.your_account')}</div>
                        <div class="auth-form__account">${escapeHtml(res.account)}${nickname}</div>
                    </div>
                    <button type="button" id="btn-go-reset" class="auth-form__button auth-form__primary">${t('auth.go_reset_password')}</button>
                    <button type="button" id="btn-back-login" class="auth-form__button">${t('auth.back_to_login')}</button>
                </div>
            `;

            // 跳转重置密码表单，自动回填账号与邮箱
            const resultButton = container.querySelector("#btn-go-reset");
            const resultCurrent = () => formScope.alive() && container.contains(resultButton);
            resultButton.onclick = () => {
                if (!resultCurrent()) return;
                switchView("reset", { prefill: { account: res.account, email: email } });
            };
            container.querySelector("#btn-back-login").onclick = () => { if (resultCurrent()) switchView("login"); };
            if (restoreResultFocus && resultCurrent()) resultButton.focus();

        } catch (err) {
            if (!formScope.current()) return;
            showToast(t('feedback.error'), "error");
            btnSubmit.disabled = false;
            btnSubmit.innerText = t('auth.recover_account');
        }
    };
}
