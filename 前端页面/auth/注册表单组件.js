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
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">安全邮箱 <span style="color: #F44336;">*</span></label><input type="email" id="reg-email" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">手机号码 <span style="color: #F44336;">*</span></label><input type="tel" id="reg-phone" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
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
            showToast("头像文件超出 3MB 限制！", "warning"); // 额外增加的 Toast 提示
            return; 
        }
        avatarError.style.display = "none"; 
        selectedAvatarFile = file; 
        const reader = new FileReader(); 
        reader.onload = (event) => avatarPreview.src = event.target.result; 
        reader.readAsDataURL(file);
    };

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };

    container.querySelector("#btn-submit-register").onclick = () => {
        const account = container.querySelector("#reg-account").value.trim();
        const name = container.querySelector("#reg-name").value.trim();
        const password = container.querySelector("#reg-password").value;
        const pwdConfirm = container.querySelector("#reg-password-confirm").value;
        const email = container.querySelector("#reg-email").value.trim();
        const phone = container.querySelector("#reg-phone").value.trim();

        // 将原生的 alert 统一替换为 showToast
        if (!account || !name || !password || !email || !phone) return showToast("带 * 号的均为必填项！", "warning");
        
        if (!/^[a-zA-Z0-9_]{6,20}$/.test(account)) return showToast("账号必须大于5个字符，且仅支持大小写英文字母、数字和下划线！", "error");
        if (password !== pwdConfirm) return showToast("两次输入的密码不一致！", "error");
        if (!/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}$/.test(password)) return showToast("密码必须大于等于6个字符，仅允许大小写字母、数字及常用标点！", "error");

        const formData = {
            type: "register", account, password, email, phone, name, gender: genderSelect.value,
            age: container.querySelector("#reg-age").value, country: countrySelect.value, region: regionSelect.value,
            intro: container.querySelector("#reg-intro").value, avatarFile: selectedAvatarFile, avatarDataUrl: selectedAvatarFile ? avatarPreview.src : null 
        };
        if (onSuccessCallback) onSuccessCallback(formData);
    };
}