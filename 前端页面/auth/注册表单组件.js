import { api } from "../core/网络请求API.js";
import { regionData } from "./国家地区数据.js";
import { showToast } from "../components/UI交互提示组件.js";

const DEFAULT_AVATAR_MALE = "https://via.placeholder.com/150/2196F3/FFFFFF?text=Male";
const DEFAULT_AVATAR_FEMALE = "https://via.placeholder.com/150/E91E63/FFFFFF?text=Female";

export function renderRegisterForm(container, switchView, onSuccessCallback) {
    const countryOptions = Object.keys(regionData).map(c => `<option value="${c}">${c}</option>`).join("");
    
    container.innerHTML = `
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">登录账号 (>5字符，仅英文数字下划线) <span style="color: #F44336;">*</span></label><input type="text" id="reg-account" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">显示名称 <span style="color: #F44336;">*</span></label><input type="text" id="reg-name" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">设置密码 (≥6字符) <span style="color: #F44336;">*</span></label><input type="password" id="reg-password" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">确认密码 <span style="color: #F44336;">*</span></label><input type="password" id="reg-password-confirm" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        </div>
        
        <div style="margin-bottom: 10px; padding: 10px; background: rgba(76, 175, 80, 0.1); border: 1px dashed #4CAF50; border-radius: 4px;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <div style="flex: 2;">
                    <label style="display: block; margin-bottom: 5px; color: #4CAF50;">安全邮箱 (用于接收验证码) <span style="color: #F44336;">*</span></label>
                    <div style="display: flex; gap: 8px;">
                        <input type="email" id="reg-email" required style="flex: 1; padding: 8px; background: #222; border: 1px solid #4CAF50; color: #fff; border-radius: 4px; box-sizing: border-box;">
                        <button id="btn-reg-send-code" style="padding: 0 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; white-space: nowrap;">获取验证码</button>
                    </div>
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; color: #4CAF50;">验证码 <span style="color: #F44336;">*</span></label>
                    <input type="text" id="reg-code" placeholder="6位数" maxlength="6" required style="width: 100%; padding: 8px; background: #222; border: 1px solid #4CAF50; color: #fff; border-radius: 4px; box-sizing: border-box; text-align: center;">
                </div>
            </div>
            
            <div style="display: none; gap: 10px;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px;">手机号码 <span style="color: #F44336;">*</span></label>
                    <input type="tel" id="reg-phone" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
            </div>
        </div>

        <div style="margin-bottom: 10px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <label style="display: block; margin-bottom: 5px;">头像</label>
                <div style="display: flex; align-items: center; gap: 10px;"><img id="avatar-preview" src="${DEFAULT_AVATAR_MALE}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #444;"><input type="file" id="reg-avatar" accept="image/*" style="font-size: 12px; color: #aaa; max-width: 150px;"></div>
                <div id="avatar-error" style="color: #F44336; font-size: 12px; margin-top: 5px; display: none;">文件超出 3MB！</div>
            </div>
            <div><label style="display: block; margin-bottom: 5px;">性别 <span style="color: #F44336;">*</span></label><select id="reg-gender" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"><option value="male">男</option><option value="female">女</option></select></div>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">年龄</label><input type="number" id="reg-age" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">国家</label><select id="reg-country" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">${countryOptions}</select></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">地区</label><select id="reg-region" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"></select></div>
        </div>
        <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 5px;">个人介绍 (限100字)</label><textarea id="reg-intro" rows="2" maxlength="100" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; resize: vertical;"></textarea></div>
        <button id="btn-submit-register" style="width: 100%; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">注 册 账 号</button>
        <div style="text-align: center; font-size: 12px;">已有账号？ <a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">返回登录</a></div>
    `;

    const genderSelect = container.querySelector("#reg-gender");
    const avatarPreview = container.querySelector("#avatar-preview");
    const avatarInput = container.querySelector("#reg-avatar");
    const avatarError = container.querySelector("#avatar-error");
    const countrySelect = container.querySelector("#reg-country");
    const regionSelect = container.querySelector("#reg-region");
    
    const updateRegionOptions = () => {
        const regions = regionData[countrySelect.value] || [];
        regionSelect.innerHTML = regions.map(r => `<option value="${r}">${r}</option>`).join("");
    };
    countrySelect.onchange = updateRegionOptions;
    updateRegionOptions();
    
    let selectedAvatarFile = null;
    genderSelect.onchange = (e) => { if (!selectedAvatarFile) avatarPreview.src = e.target.value === "male" ? DEFAULT_AVATAR_MALE : DEFAULT_AVATAR_FEMALE; };

    avatarInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) { 
            avatarError.style.display = "block"; 
            avatarInput.value = ""; 
            selectedAvatarFile = null; 
            avatarPreview.src = genderSelect.value === "male" ? DEFAULT_AVATAR_MALE : DEFAULT_AVATAR_FEMALE; 
            showToast("头像文件超出 3MB 限制！", "warning");
            return; 
        }
        avatarError.style.display = "none"; 
        selectedAvatarFile = file; 
        const reader = new FileReader(); 
        reader.onload = (event) => avatarPreview.src = event.target.result; 
        reader.readAsDataURL(file);
    };

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };

    // 发送注册验证码逻辑
    const btnRegSendCode = container.querySelector("#btn-reg-send-code");
    let regCountdownTimer = null;
    
    btnRegSendCode.onclick = async (e) => {
        e.preventDefault();
        const emailInput = container.querySelector("#reg-email").value.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput);
        
        if (!isEmail) return showToast("请输入有效的安全邮箱！", "error");
        
        btnRegSendCode.disabled = true;
        btnRegSendCode.style.background = "#555";
        btnRegSendCode.innerText = "发送中...";
        
        try {
            await api.sendVerifyCode(emailInput, "email", "register");
            showToast("验证码已发送至邮箱，请查收", "success");
            
            let timeLeft = 60;
            btnRegSendCode.innerText = `${timeLeft}s 重发`;
            regCountdownTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(regCountdownTimer);
                    btnRegSendCode.disabled = false;
                    btnRegSendCode.style.background = "#4CAF50";
                    btnRegSendCode.innerText = "获取验证码";
                } else {
                    btnRegSendCode.innerText = `${timeLeft}s 重发`;
                }
            }, 1000);
            
        } catch (err) {
            showToast(err.message || "发送失败，请稍后重试", "error");
            btnRegSendCode.disabled = false;
            btnRegSendCode.style.background = "#4CAF50";
            btnRegSendCode.innerText = "获取验证码";
        }
    };

    container.querySelector("#btn-submit-register").onclick = () => {
        const account = container.querySelector("#reg-account").value.trim();
        const name = container.querySelector("#reg-name").value.trim();
        const password = container.querySelector("#reg-password").value;
        const pwdConfirm = container.querySelector("#reg-password-confirm").value;
        const email = container.querySelector("#reg-email").value.trim();
        const phone = container.querySelector("#reg-phone").value.trim(); // 取出来的是空字符串 ""
        const code = container.querySelector("#reg-code").value.trim();

        // 【临时隐藏功能】：移除 !phone 的必填校验
        if (!account || !name || !password || !email || !code) return showToast("带 * 号的均为必填项！", "warning");
        if (code.length !== 6) return showToast("请输入 6 位有效验证码！", "warning");
        
        if (!/^[a-zA-Z0-9_]{6,20}$/.test(account)) return showToast("账号必须大于5个字符，且仅支持大小写英文字母、数字和下划线！", "error");
        if (password !== pwdConfirm) return showToast("两次输入的密码不一致！", "error");
        if (!/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}$/.test(password)) return showToast("密码必须大于等于6个字符，仅允许大小写字母、数字及常用标点！", "error");

        const formData = {
            type: "register", account, password, email, phone, name, gender: genderSelect.value, code,
            age: container.querySelector("#reg-age").value, country: countrySelect.value, region: regionSelect.value,
            intro: container.querySelector("#reg-intro").value, avatarFile: selectedAvatarFile, avatarDataUrl: selectedAvatarFile ? avatarPreview.src : null 
        };
        if (onSuccessCallback) onSuccessCallback(formData);
    };
}