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
        <div style="margin-bottom: 12px; font-size: 13px; color: #aaa; line-height: 1.6;">${t('auth.recover_desc')}</div>

        <div style="margin-bottom: 10px; padding: 10px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; border-radius: 4px;">
            <label style="display: block; margin-bottom: 5px; color: #2196F3; font-weight: bold;">${t('auth.security_verify')} (${t('auth.bound_email')}) <span style="color: #F44336;">*</span></label>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="recover-email" placeholder="${t('auth.enter_bound_email')}" style="flex: 1; padding: 8px; background: #222; border: 1px solid #2196F3; color: #fff; border-radius: 4px; box-sizing: border-box;">
                <button id="btn-recover-send-code" style="padding: 0 15px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; white-space: nowrap; transition: 0.2s;">${t('auth.get_code')}</button>
            </div>
            <input type="text" id="recover-code" placeholder="${t('auth.enter_6_digit_code')}" maxlength="6" style="width: 100%; margin-top: 10px; padding: 8px; background: #222; border: 1px dashed #2196F3; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <button id="btn-submit-recover" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">${t('auth.recover_account')}</button>
        <div style="text-align: center; font-size: 12px;"><a href="#" id="recover-to-login" style="color: #2196F3; text-decoration: none;">${t('auth.back_to_login')}</a></div>
    `;

    container.querySelector("#recover-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };

    function startCountdown(btn, duration, resetColor) {
        let timeLeft = duration;
        btn.innerText = `${timeLeft}s ${t('auth.resend')}`;
        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.style.background = resetColor;
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
    container._onCleanup = () => { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } };

    btnSendCode.onclick = async (e) => {
        e.preventDefault();

        const emailInput = container.querySelector("#recover-email").value.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput);
        if (!isEmail) return showToast(t('auth.invalid_email'), "error");

        btnSendCode.disabled = true;
        btnSendCode.style.background = "#555";
        btnSendCode.innerText = t('auth.sending');

        try {
            await api.sendVerifyCode(emailInput, "email", "recover");

            showToast(t('auth.code_sent'), "success");

            countdownTimer = startCountdown(btnSendCode, 60, "#2196F3");

        } catch (err) {
            showToast(err.message || t('feedback.error'), "error");
            btnSendCode.disabled = false;
            btnSendCode.style.background = "#2196F3";
            btnSendCode.innerText = t('auth.get_code');
        }
    };

    // 提交找回：验证码核验成功后展示账号
    const btnSubmit = container.querySelector("#btn-submit-recover");
    btnSubmit.onclick = async () => {
        const email = container.querySelector("#recover-email").value.trim();
        const code = container.querySelector("#recover-code").value.trim();

        if (!email) return showToast(t('auth.invalid_email'), "warning");
        if (code.length !== 6) return showToast(t('auth.invalid_code'), "warning");

        btnSubmit.disabled = true;
        btnSubmit.innerText = t('auth.sending');

        try {
            const res = await api.recoverAccount(email, code);

            showToast(t('auth.recover_success'), "success");

            // 🔧 展示结果前清除倒计时，避免定时器继续作用于已替换的 DOM
            if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

            // 展示找回结果：账号 + 昵称，提供跳转重置密码入口
            const nickname = res.name ? `（${escapeHtml(res.name)}）` : "";
            container.innerHTML = `
                <div style="padding: 15px; background: rgba(76, 175, 80, 0.1); border: 1px solid #4CAF50; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                    <div style="font-size: 14px; color: #4CAF50; font-weight: bold; margin-bottom: 8px;">✅ ${t('auth.recover_success')}</div>
                    <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">${t('auth.your_account')}</div>
                    <div style="font-size: 20px; font-weight: bold; color: #fff; letter-spacing: 1px; user-select: text;">${escapeHtml(res.account)}${nickname}</div>
                </div>
                <button id="btn-go-reset" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">${t('auth.go_reset_password')}</button>
                <button id="btn-back-login" style="width: 100%; padding: 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">${t('auth.back_to_login')}</button>
            `;

            // 跳转重置密码表单，自动回填账号与邮箱
            container.querySelector("#btn-go-reset").onclick = () => {
                switchView("reset", { prefill: { account: res.account, email: email } });
            };
            container.querySelector("#btn-back-login").onclick = () => switchView("login");

        } catch (err) {
            showToast(err.message || t('feedback.error'), "error");
            btnSubmit.disabled = false;
            btnSubmit.innerText = t('auth.recover_account');
        }
    };
}
