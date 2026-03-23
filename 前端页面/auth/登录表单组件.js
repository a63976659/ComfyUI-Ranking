import { showToast } from "../components/UI交互提示组件.js";

export function renderLoginForm(container, switchView, onSuccessCallback) {
    container.innerHTML = `
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">登录账号 <span style="color: #F44336;">*</span></label><input type="text" id="login-account" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display: block; margin-bottom: 5px;">密码 <span style="color: #F44336;">*</span></label><input type="password" id="login-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="login-remember" checked style="cursor: pointer;">
                <label for="login-remember" style="font-size: 12px; color: #aaa; cursor: pointer;">保持登录 30 天</label>
            </div>
            <a href="#" id="toggle-to-reset" style="color: #FF9800; text-decoration: underline; font-weight: bold; font-size: 12px; cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🔑 修改/找回密码？</a>
        </div>
        <button id="btn-submit-login" style="width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">登 录</button>
        <div style="text-align: center; font-size: 12px;"><span>没有账号？ <a href="#" id="toggle-to-register" style="color: #4CAF50; text-decoration: none; font-weight: bold;">立即注册</a></span></div>
    `;

    container.querySelector("#toggle-to-register").onclick = (e) => { e.preventDefault(); switchView("register"); };
    container.querySelector("#toggle-to-reset").onclick = (e) => { e.preventDefault(); switchView("reset"); };
    container.querySelector("#btn-submit-login").onclick = () => {
        const account = container.querySelector("#login-account").value.trim();
        const password = container.querySelector("#login-password").value;
        const remember = container.querySelector("#login-remember").checked;

        if (!account || !password) return showToast("账号和密码不能为空！", "warning");

        const formData = { type: "login", account, password, remember };
        if (onSuccessCallback) onSuccessCallback(formData);
    };
}