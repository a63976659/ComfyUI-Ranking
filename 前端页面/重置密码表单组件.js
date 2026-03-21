// 前端页面/重置密码表单组件.js

export function renderResetForm(container, switchView, onSuccessCallback) {
    container.innerHTML = `
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">当前账号 <span style="color: #F44336;">*</span></label><input type="text" id="reset-account" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">原密码 <span style="color: #F44336;">*</span></label><input type="password" id="reset-old-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">新密码 (≥6个字符，允许大小写数字符号) <span style="color: #F44336;">*</span></label><input type="password" id="reset-new-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 5px;">确认新密码 <span style="color: #F44336;">*</span></label><input type="password" id="reset-confirm-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <button id="btn-submit-reset" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">修 改 密 码</button>
        <div style="text-align: center; font-size: 12px;"><a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">返回登录</a></div>
    `;

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };
    container.querySelector("#btn-submit-reset").onclick = () => {
        const acc = container.querySelector("#reset-account").value.trim();
        const op = container.querySelector("#reset-old-password").value;
        const np = container.querySelector("#reset-new-password").value;
        const cp = container.querySelector("#reset-confirm-password").value;
        
        if(!acc || !op || !np) return alert("请完整填写表单！");
        if(np !== cp) return alert("两次输入的新密码不一致！");
        if(!/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}$/.test(np)) return alert("新密码必须≥6个字符，且仅允许英文、数字及常见符号！");
        
        if (onSuccessCallback) onSuccessCallback({ type: "reset", account: acc, oldPassword: op, newPassword: np });
    };
}