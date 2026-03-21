// 前端页面/用户注册登录组件.js
import { globalModal } from "./全局弹窗管理器.js";
import { renderLoginForm } from "./登录表单组件.js";
import { renderRegisterForm } from "./注册表单组件.js";
import { renderResetForm } from "./重置密码表单组件.js";

export function createAuthForm(onSuccessCallback) {
    const container = document.createElement("div");
    Object.assign(container.style, { 
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", fontSize: "14px" 
    });

    // 核心视图切换控制器
    const switchView = (viewState) => {
        container.innerHTML = ""; 
        if (viewState === "login") {
            renderLoginForm(container, switchView, onSuccessCallback);
        } else if (viewState === "register") {
            renderRegisterForm(container, switchView, onSuccessCallback);
        } else if (viewState === "reset") {
            renderResetForm(container, switchView, onSuccessCallback);
        }
    };

    // 初始化时默认渲染登录界面
    switchView("login"); 
    
    return container;
}

export function showAuthModal(onAuthCallback) {
    const formElement = createAuthForm(onAuthCallback);
    globalModal.openModal("社区账号登录 / 注册", formElement, { width: "550px" });
}