import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";

export function renderResetForm(container, switchView, onSuccessCallback) {
    container.innerHTML = `
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">当前账号 <span style="color: #F44336;">*</span></label><input type="text" id="reset-account" placeholder="输入要修改的账号" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        
        <div style="margin-bottom: 10px; padding: 10px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; border-radius: 4px;">
            <label style="display: block; margin-bottom: 5px; color: #2196F3; font-weight: bold;">安全验证 (绑定的邮箱) <span style="color: #F44336;">*</span></label>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="reset-verify" placeholder="请输入绑定的安全邮箱" style="flex: 1; padding: 8px; background: #222; border: 1px solid #2196F3; color: #fff; border-radius: 4px; box-sizing: border-box;">
                <button id="btn-send-code" style="padding: 0 15px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; white-space: nowrap; transition: 0.2s;">获取验证码</button>
            </div>
            <input type="text" id="reset-code" placeholder="输入 6 位验证码" maxlength="6" style="width: 100%; margin-top: 10px; padding: 8px; background: #222; border: 1px dashed #2196F3; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">原密码 (如果是找回密码可留空) </label><input type="password" id="reset-old-password" placeholder="如忘记原密码请留空" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">新密码 (≥6个字符) <span style="color: #F44336;">*</span></label><input type="password" id="reset-new-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display: block; margin-bottom: 5px;">确认新密码 <span style="color: #F44336;">*</span></label><input type="password" id="reset-confirm-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        
        <button id="btn-submit-reset" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">修 改 密 码</button>
        <div style="text-align: center; font-size: 12px;"><a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">返回登录</a></div>
    `;

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };
    
    // 发送验证码逻辑
    const btnSendCode = container.querySelector("#btn-send-code");
    let countdownTimer = null;
    
    btnSendCode.onclick = async (e) => {
        e.preventDefault();
        
        // 先抓取上方输入的账号，没填就不让发验证码
        const accountInput = container.querySelector("#reset-account").value.trim();
        if (!accountInput) return showToast("请先输入要修改密码的当前账号！", "warning");

        const verifyInput = container.querySelector("#reset-verify").value.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifyInput);
        
        // 【临时隐藏功能】：仅保留邮箱校验
        if (!isEmail) return showToast("请输入有效的邮箱地址！", "error");
        
        const contactType = "email"; // 强制走邮箱通道
        
        btnSendCode.disabled = true;
        btnSendCode.style.background = "#555";
        btnSendCode.innerText = "发送中...";
        
        try {
            await api.sendVerifyCode(verifyInput, contactType, "reset", accountInput);
            
            showToast(`验证码已发送至您的邮箱，请查收`, "success");
            
            let timeLeft = 60;
            btnSendCode.innerText = `${timeLeft}s 后重发`;
            countdownTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(countdownTimer);
                    btnSendCode.disabled = false;
                    btnSendCode.style.background = "#2196F3";
                    btnSendCode.innerText = "获取验证码";
                } else {
                    btnSendCode.innerText = `${timeLeft}s 后重发`;
                }
            }, 1000);
            
        } catch (err) {
            showToast(err.message || "发送失败，请稍后重试", "error");
            btnSendCode.disabled = false;
            btnSendCode.style.background = "#2196F3";
            btnSendCode.innerText = "获取验证码";
        }
    };

    container.querySelector("#btn-submit-reset").onclick = () => {
        const acc = container.querySelector("#reset-account").value.trim();
        const verify = container.querySelector("#reset-verify").value.trim();
        const code = container.querySelector("#reset-code").value.trim();
        const op = container.querySelector("#reset-old-password").value;
        const np = container.querySelector("#reset-new-password").value;
        const cp = container.querySelector("#reset-confirm-password").value;
        
        if (!acc || !verify || !np || !code) return showToast("账号、安全验证、验证码和新密码均为必填项！", "warning");
        if (code.length !== 6) return showToast("请输入 6 位有效验证码！", "warning");
        
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verify);
        
        if (!isEmail) {
            return showToast("安全验证格式有误！请输入有效的邮箱。", "error");
        }

        if (np !== cp) return showToast("两次输入的新密码不一致！", "error");
        if (np.length < 6) return showToast("新密码必须大于等于 6 个字符！", "error");

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