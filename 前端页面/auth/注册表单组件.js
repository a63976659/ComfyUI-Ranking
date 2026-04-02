import { api } from "../core/网络请求API.js";
import { regionData, getSortedCountries } from "./国家地区数据.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { PLACEHOLDERS } from "../core/全局配置.js";

const DEFAULT_AVATAR_MALE = PLACEHOLDERS.AVATAR;
const DEFAULT_AVATAR_FEMALE = PLACEHOLDERS.AVATAR;

// 计算年龄工具函数
function calculateAge(birthDate) {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age >= 0 && age <= 150 ? age : null;
}

export function renderRegisterForm(container, switchView, onSuccessCallback) {
    // 使用排序后的国家列表（常用国家置顶）
    const sortedCountries = getSortedCountries();
    const countryOptions = sortedCountries.map(c => `<option value="${c}">${c}</option>`).join("");
    
    container.innerHTML = `
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">${t('auth.account')} (>5${t('common.chars')}) <span style="color: #F44336;">*</span></label><input type="text" id="reg-account" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">${t('auth.display_name')} <span style="color: #F44336;">*</span></label><input type="text" id="reg-name" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">${t('auth.set_password')} (≥6${t('common.chars')}) <span style="color: #F44336;">*</span></label><input type="password" id="reg-password" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">${t('auth.confirm_password')} <span style="color: #F44336;">*</span></label><input type="password" id="reg-password-confirm" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
        </div>
        
        <div style="margin-bottom: 10px; padding: 10px; background: rgba(76, 175, 80, 0.1); border: 1px dashed #4CAF50; border-radius: 4px;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <div style="flex: 2;">
                    <label style="display: block; margin-bottom: 5px; color: #4CAF50;">${t('auth.security_email')} (${t('auth.security_email_desc')}) <span style="color: #F44336;">*</span></label>
                    <div style="display: flex; gap: 8px;">
                        <input type="email" id="reg-email" required style="flex: 1; padding: 8px; background: #222; border: 1px solid #4CAF50; color: #fff; border-radius: 4px; box-sizing: border-box;">
                        <button id="btn-reg-send-code" style="padding: 0 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; white-space: nowrap;">${t('auth.get_code')}</button>
                    </div>
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; color: #4CAF50;">${t('auth.verification_code')} <span style="color: #F44336;">*</span></label>
                    <input type="text" id="reg-code" placeholder="6${t('common.digits')}" maxlength="6" required style="width: 100%; padding: 8px; background: #222; border: 1px solid #4CAF50; color: #fff; border-radius: 4px; box-sizing: border-box; text-align: center;">
                </div>
            </div>
            
            <div style="display: none; gap: 10px;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px;">${t('auth.phone')} <span style="color: #F44336;">*</span></label>
                    <input type="tel" id="reg-phone" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
            </div>
        </div>

        <div style="margin-bottom: 10px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <label style="display: block; margin-bottom: 5px;">${t('auth.avatar')}</label>
                <div style="display: flex; align-items: center; gap: 10px;"><img id="avatar-preview" src="${DEFAULT_AVATAR_MALE}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #444;"><input type="file" id="reg-avatar" accept="image/*" style="font-size: 12px; color: #aaa; max-width: 150px;"></div>
                <div id="avatar-error" style="color: #F44336; font-size: 12px; margin-top: 5px; display: none;">${t('auth.file_too_large')}</div>
            </div>
            <div><label style="display: block; margin-bottom: 5px;">${t('auth.gender')} <span style="color: #F44336;">*</span></label><select id="reg-gender" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"><option value="male">${t('auth.male')}</option><option value="female">${t('auth.female')}</option></select></div>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div style="flex: 1;">
                <label style="display: block; margin-bottom: 5px;">${t('auth.birthday')}</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="date" id="reg-birthday" style="flex: 1; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <span id="reg-age-display" style="color: #888; font-size: 12px; white-space: nowrap;"></span>
                </div>
            </div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">${t('auth.country')}</label><select id="reg-country" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">${countryOptions}</select></div>
            <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">${t('auth.region')}</label><select id="reg-region" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"></select></div>
        </div>
        <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 5px;">${t('auth.intro')} (${t('auth.intro_limit')})</label><textarea id="reg-intro" rows="2" maxlength="100" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; resize: vertical;"></textarea></div>
        <button id="btn-submit-register" style="width: 100%; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">${t('auth.register_submit')}</button>
        <div style="text-align: center; font-size: 12px;">${t('auth.has_account')} <a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">${t('auth.back_to_login')}</a></div>
    `;

    const genderSelect = container.querySelector("#reg-gender");
    const avatarPreview = container.querySelector("#avatar-preview");
    const avatarInput = container.querySelector("#reg-avatar");
    const avatarError = container.querySelector("#avatar-error");
    const countrySelect = container.querySelector("#reg-country");
    const regionSelect = container.querySelector("#reg-region");
    const birthdayInput = container.querySelector("#reg-birthday");
    const ageDisplay = container.querySelector("#reg-age-display");
    
    // 出生日期变化时自动计算年龄
    birthdayInput.onchange = () => {
        const age = calculateAge(birthdayInput.value);
        if (age !== null) {
            ageDisplay.textContent = `${age} ${t('auth.age_years')}`;
            ageDisplay.style.color = "#4CAF50";
        } else {
            ageDisplay.textContent = "";
        }
    };
    
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
            showToast(t('auth.file_too_large'), "warning");
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
        
        if (!isEmail) return showToast(t('auth.invalid_email'), "error");
        
        btnRegSendCode.disabled = true;
        btnRegSendCode.style.background = "#555";
        btnRegSendCode.innerText = t('auth.sending');
        
        try {
            await api.sendVerifyCode(emailInput, "email", "register");
            showToast(t('auth.code_sent'), "success");
            
            let timeLeft = 60;
            btnRegSendCode.innerText = `${timeLeft}s ${t('auth.resend')}`;
            regCountdownTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(regCountdownTimer);
                    btnRegSendCode.disabled = false;
                    btnRegSendCode.style.background = "#4CAF50";
                    btnRegSendCode.innerText = t('auth.get_code');
                } else {
                    btnRegSendCode.innerText = `${timeLeft}s ${t('auth.resend')}`;
                }
            }, 1000);
            
        } catch (err) {
            showToast(err.message || t('feedback.error'), "error");
            btnRegSendCode.disabled = false;
            btnRegSendCode.style.background = "#4CAF50";
            btnRegSendCode.innerText = t('auth.get_code');
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

        if (!account || !name || !password || !email || !code) return showToast(t('auth.required_fields'), "warning");
        if (code.length !== 6) return showToast(t('auth.invalid_code'), "warning");
        
        if (!/^[a-zA-Z0-9_]{6,20}$/.test(account)) return showToast(t('auth.account_format_error'), "error");
        if (password !== pwdConfirm) return showToast(t('auth.password_mismatch'), "error");
        if (!/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}$/.test(password)) return showToast(t('auth.password_format_error'), "error");

        const formData = {
            type: "register", account, password, email, phone, name, gender: genderSelect.value, code,
            birthday: birthdayInput.value, // 保存出生日期
            age: calculateAge(birthdayInput.value), // 自动计算年龄
            country: countrySelect.value, region: regionSelect.value,
            intro: container.querySelector("#reg-intro").value.trim(), avatarFile: selectedAvatarFile, avatarDataUrl: selectedAvatarFile ? avatarPreview.src : null 
        };

        // 🚀 核心自愈：提交前清洗数据，把非必填的空字符串删掉，防止引发后端 422 报错
        Object.keys(formData).forEach(key => {
            if (formData[key] === "" || formData[key] === undefined || formData[key] === null) {
                delete formData[key];
            }
        });

        if (onSuccessCallback) onSuccessCallback(formData);
    };
}