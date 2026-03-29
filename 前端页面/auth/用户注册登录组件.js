import { renderLoginForm } from "./登录表单组件.js";
import { renderRegisterForm } from "./注册表单组件.js";
import { renderResetForm } from "./重置密码表单组件.js";

export function createAuthView(onSuccessCallback) {
    const container = document.createElement("div");
    // 【高度对齐修复】：改为固定 1220px
    Object.assign(container.style, { 
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", 
        fontSize: "14px", padding: "15px", flex: "none", height: "1220px", boxSizing: "border-box", overflowY: "auto", 
        background: "var(--bg-color, #202020)" 
    });

    container.innerHTML = `
        <button id="btn-back-auth" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 15px; width: fit-content; transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#333'; this.style.borderColor='#555'">
    <span style="font-size: 14px;">⬅</span> 返回
</button>
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:10px; color:#fff;">🔐 社区账号验证</div>
        <div id="auth-form-container"></div>
    `;
    
    container.querySelector("#btn-back-auth").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    const formContainer = container.querySelector("#auth-form-container");

    const switchView = (viewState) => {
        formContainer.innerHTML = ""; 
        if (viewState === "login") {
            renderLoginForm(formContainer, switchView, onSuccessCallback);
        } else if (viewState === "register") {
            renderRegisterForm(formContainer, switchView, onSuccessCallback);
        } else if (viewState === "reset") {
            renderResetForm(formContainer, switchView, onSuccessCallback);
        }
    };

    switchView("login"); 
    
    return container;
}