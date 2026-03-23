import { showToast } from "../components/UI交互提示组件.js";

export function renderResetForm(container, switchView, onSuccessCallback) {
    container.innerHTML = `
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">当前账号 <span style="color: #F44336;">*</span></label><input type="text" id="reset-account" placeholder="输入要修改的账号" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        
        <div style="margin-bottom: 10px; padding: 10px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; border-radius: 4px;">
            <label style="display: block; margin-bottom: 5px; color: #2196F3; font-weight: bold;">安全验证 (绑定的手机号或邮箱) <span style="color: #F44336;">*</span></label>
            <input type="text" id="reset-verify" placeholder="手机号 / 邮箱二选一" style="width: 100%; padding: 8px; background: #222; border: 1px solid #2196F3; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">原密码 (如果是找回密码可留空) </label><input type="password" id="reset-old-password" placeholder="如忘记原密码请留空" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">新密码 (≥6个字符) <span style="color: #F44336;">*</span></label><input type="password" id="reset-new-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display: block; margin-bottom: 5px;">确认新密码 <span style="color: #F44336;">*</span></label><input type="password" id="reset-confirm-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        
        <button id="btn-submit-reset" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">修 改 密 码</button>
        <div style="text-align: center; font-size: 12px;"><a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">返回登录</a></div>
    `;

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };
    
    container.querySelector("#btn-submit-reset").onclick = () => {
        const acc = container.querySelector("#reset-account").value.trim();
        const verify = container.querySelector("#reset-verify").value.trim();
        const op = container.querySelector("#reset-old-password").value;
        const np = container.querySelector("#reset-new-password").value;
        const cp = container.querySelector("#reset-confirm-password").value;
        
        if (!acc || !verify || !np) return showToast("账号、安全验证和新密码均为必填项！", "warning");
        
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verify);
        const isPhone = /^1[3-9]\d{9}$/.test(verify) || /^\d{8,15}$/.test(verify); 
        
        if (!isEmail && !isPhone) {
            return showToast("安全验证格式有误！请输入有效的邮箱或手机号。", "error");
        }

        if (np !== cp) return showToast("两次输入的新密码不一致！", "error");
        if (np.length < 6) return showToast("新密码必须大于等于 6 个字符！", "error");

        // 【核心修改】：把正则判断出的具体类型明确传递给外层
        const formData = { 
            type: "reset", 
            account: acc, 
            verifyContact: verify, 
            verifyType: isEmail ? "email" : "phone", 
            oldPassword: op, 
            newPassword: np 
        };
        if (onSuccessCallback) onSuccessCallback(formData);
    };
}