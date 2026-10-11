import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";

export function renderLoginForm(container, switchView, onSuccessCallback) {
    container.innerHTML = `
        <div class="auth-login">
            <div class="auth-login__field"><label for="login-account">${t('auth.account')} <span class="auth-login__required" aria-hidden="true">*</span></label><input type="text" id="login-account" name="username" autocomplete="username" required class="auth-login__input"></div>
            <div class="auth-login__field"><label for="login-password">${t('auth.password')} <span class="auth-login__required" aria-hidden="true">*</span></label><input type="password" id="login-password" name="password" autocomplete="current-password" required class="auth-login__input"></div>
            <div class="auth-login__options">
                <div class="auth-login__remember">
                    <input type="checkbox" id="login-remember" checked>
                    <label for="login-remember">${t('auth.remember_me')}</label>
                </div>
                <div class="auth-login__actions">
                    <button type="button" id="toggle-to-recover" class="auth-login__link">🔎 ${t('auth.forgot_account')}</button>
                    <button type="button" id="toggle-to-reset" class="auth-login__link">🔑 ${t('auth.forgot_password')}</button>
                </div>
            </div>
            <button type="button" id="btn-submit-login" class="auth-login__submit">${t('auth.login')}</button>
            <div class="auth-login__signup"><span>${t('auth.no_account')}</span> <button type="button" id="toggle-to-register" class="auth-login__link">${t('auth.register_now')}</button></div>
        </div>
    `;

    container.querySelector("#toggle-to-register").onclick = (e) => { e.preventDefault(); switchView("register"); };
    container.querySelector("#toggle-to-reset").onclick = (e) => { e.preventDefault(); switchView("reset"); };
    container.querySelector("#toggle-to-recover").onclick = (e) => { e.preventDefault(); switchView("recover"); };
    container.querySelector("#btn-submit-login").onclick = () => {
        const account = container.querySelector("#login-account").value.trim();
        const password = container.querySelector("#login-password").value;
        const remember = container.querySelector("#login-remember").checked;

        if (!account || !password) return showToast(t('auth.account_password_required'), "warning");

        const formData = { type: "login", account, password, remember };
        if (onSuccessCallback) onSuccessCallback(formData);
    };
}