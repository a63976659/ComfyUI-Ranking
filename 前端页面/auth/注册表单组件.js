import { createAuthFormScope, createAuthFieldFeedback } from "./认证表单生命周期.js";
import { api } from "../core/网络请求API.js";
import { regionData, getSortedCountries } from "./国家地区数据.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { openImageCropper } from "../components/图片裁剪组件.js";
import { PLACEHOLDERS } from "../core/全局配置.js";

const DEFAULT_AVATAR = PLACEHOLDERS.AVATAR;

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
        <div class="auth-form">
            <div class="auth-form__grid">
                <div class="auth-form__field"><label for="reg-account">${t('auth.account')} (>5${t('common.chars')}) <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label><input type="text" id="reg-account" class="auth-form__input" name="username" autocomplete="username" required></div>
                <div class="auth-form__field"><label for="reg-name">${t('auth.display_name')} <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label><input type="text" id="reg-name" class="auth-form__input" name="nickname" autocomplete="nickname" required></div>
            </div>
            <div class="auth-form__grid">
                <div class="auth-form__field"><label for="reg-password">${t('auth.set_password')} (≥6${t('common.chars')}) <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label><input type="password" id="reg-password" class="auth-form__input" name="password" autocomplete="new-password" required></div>
                <div class="auth-form__field"><label for="reg-password-confirm">${t('auth.confirm_password')} <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label><input type="password" id="reg-password-confirm" class="auth-form__input" name="confirm-password" autocomplete="new-password" required></div>
            </div>
            <fieldset class="auth-form__security">
                <legend>${t('auth.security_verify')}</legend>
                <label for="reg-email">${t('auth.security_email')} (${t('auth.security_email_desc')}) <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label>
                <div class="auth-form__code-row">
                    <input type="email" id="reg-email" name="email" autocomplete="email" required class="auth-form__input">
                    <button type="button" id="btn-reg-send-code" class="auth-form__button">${t('auth.get_code')}</button>
                </div>
                <label for="reg-code">${t('auth.verification_code')} <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label>
                <input type="text" id="reg-code" name="verification-code" autocomplete="one-time-code" inputmode="numeric" placeholder="6${t('common.digits')}" maxlength="6" required class="auth-form__input">
            </fieldset>
            <div class="auth-form__grid auth-form__profile">
                <div class="auth-form__field">
                    <label for="reg-avatar">${t('auth.avatar')}</label>
                    <div class="auth-form__avatar-row"><img id="avatar-preview" src="${DEFAULT_AVATAR}" alt="" class="auth-form__avatar"><input type="file" id="reg-avatar" accept="image/*" class="auth-form__file"></div>
                    <div id="avatar-error" class="auth-form__error" hidden>${t('auth.file_too_large')}</div>
                </div>
                <div class="auth-form__field"><label for="reg-gender">${t('auth.gender')} <span class="auth-form__required ranking-required-marker" aria-hidden="true"></span></label><select id="reg-gender" required class="auth-form__input"><option value="male">${t('auth.male')}</option><option value="female">${t('auth.female')}</option></select></div>
            </div>
            <div class="auth-form__grid">
                <div class="auth-form__field">
                    <label for="reg-birthday">${t('auth.birthday')}</label>
                    <input type="date" id="reg-birthday" name="bday" autocomplete="bday" class="auth-form__input">
                    <span id="reg-age-display" class="auth-form__age"></span>
                </div>
                <div class="auth-form__field"><label for="reg-country">${t('auth.country')}</label><select id="reg-country" name="country-name" autocomplete="country-name" class="auth-form__input">${countryOptions}</select></div>
                <div class="auth-form__field"><label for="reg-region">${t('auth.region')}</label><select id="reg-region" name="address-level1" autocomplete="address-level1" class="auth-form__input"></select></div>
            </div>
            <div class="auth-form__field"><label for="reg-intro">${t('auth.intro')} (${t('auth.intro_limit')})</label><textarea id="reg-intro" rows="2" maxlength="100" class="auth-form__input auth-form__textarea"></textarea></div>
            <button type="button" id="btn-submit-register" class="auth-form__button auth-form__primary">${t('auth.register_submit')}</button>
            <div class="auth-form__footer">${t('auth.has_account')} <button type="button" id="toggle-to-login" class="auth-form__link">${t('auth.back_to_login')}</button></div>
        </div>
    `;
    const formScope = createAuthFormScope(container);
    const field = id => container.querySelector('#' + id);
    const feedback = createAuthFieldFeedback(container, formScope, { notify: showToast, relatedFields: [[field('reg-password'), field('reg-password-confirm')]] });

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
    
    let selectedAvatarFile = null, avatarGeneration = 0, avatarReader = null, avatarCropController = null;
    const stopAvatarReader = () => {
        const reader = avatarReader; avatarReader = null;
        if (!reader) return;
        reader.onload = reader.onerror = null;
        if (reader.readyState === FileReader.LOADING) reader.abort();
    };
    formScope.addCleanup(() => { avatarGeneration++; avatarCropController?.abort(); avatarCropController = null; stopAvatarReader(); selectedAvatarFile = null; });
    genderSelect.onchange = (e) => { if (!selectedAvatarFile) avatarPreview.src = DEFAULT_AVATAR; };

    avatarInput.onchange = async (e) => {
        if (!formScope.current()) return;
        const file = e.target.files[0];
        if (!file) return;
        const token = ++avatarGeneration;
        const currentAvatar = () => formScope.current() && token === avatarGeneration;
        stopAvatarReader();
        avatarCropController?.abort();
        const cropController = new AbortController(); avatarCropController = cropController;
        // 📱 移动端适配：手机拍照原图普遍超过 3MB，不再用原始大小拦截，
        // 统一先走 1:1 裁剪压缩管线（输出 ≤512×512 JPG），与个人设置头像链路一致；
        // 用户取消裁剪时静默还原默认头像预览。
        avatarInput.value = "";
        let croppedFile;
        try {
            croppedFile = await openImageCropper(file, 1, t('auth.avatar'), 1, { signal: cropController.signal });
        } catch (err) {
            if (avatarCropController === cropController) avatarCropController = null;
            if (!currentAvatar()) return;
            showToast(t('auth.file_too_large'), "warning");
            selectedAvatarFile = null;
            avatarPreview.src = DEFAULT_AVATAR;
            return;
        }
        if (avatarCropController === cropController) avatarCropController = null;
        if (!currentAvatar()) return;
        if (!croppedFile) {
            selectedAvatarFile = null;
            avatarPreview.src = DEFAULT_AVATAR;
            return;
        }
        const reader = new FileReader(); avatarReader = reader;
        const releaseReader = () => {
            reader.onload = reader.onerror = null;
            if (avatarReader === reader) avatarReader = null;
        };
        reader.onload = (event) => {
            const result = event.target.result;
            if (currentAvatar() && typeof result === 'string' && result) {
                avatarError.hidden = true;
                selectedAvatarFile = croppedFile; avatarPreview.src = result;
            }
            releaseReader();
        };
        reader.onerror = () => {
            if (currentAvatar()) showToast(t('auth.file_too_large'), "warning");
            releaseReader();
        };
        try { reader.readAsDataURL(croppedFile); }
        catch (_) {
            releaseReader();
            if (currentAvatar()) showToast(t('auth.file_too_large'), "warning");
        }
    };

    container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); switchView("login"); };

    function startCountdown(btn, duration) {
        let timeLeft = duration;
        btn.innerText = `${timeLeft}s ${t('auth.resend')}`;
        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.innerText = t('auth.get_code');
            } else {
                btn.innerText = `${timeLeft}s ${t('auth.resend')}`;
            }
        }, 1000);
        return timer;
    }

    // 发送注册验证码逻辑
    const btnRegSendCode = container.querySelector("#btn-reg-send-code");
    let regCountdownTimer = null;
    formScope.addCleanup(() => { clearInterval(regCountdownTimer); regCountdownTimer = null; });
    
    btnRegSendCode.onclick = async (e) => {
        e.preventDefault();
        if (!formScope.current() || btnRegSendCode.disabled) return;
        feedback.clear([field('reg-email')]);
        const emailInput = container.querySelector("#reg-email").value.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput);
        
        if (!isEmail) return feedback.report([field('reg-email')], t('auth.invalid_email'), "error");
        
        btnRegSendCode.disabled = true;
        btnRegSendCode.innerText = t('auth.sending');
        
        try {
            const response = await api.sendVerifyCode(emailInput, "email", "register");
            if (!formScope.current()) return;
            if (response?.status !== 'success') throw new Error('Invalid verification response');
            showToast(t('auth.code_sent'), "success");
            
            regCountdownTimer = startCountdown(btnRegSendCode, 60);
            
        } catch (err) {
            if (!formScope.current()) return;
            showToast(t('feedback.error'), "error");
            btnRegSendCode.disabled = false;
            btnRegSendCode.innerText = t('auth.get_code');
        }
    };

    container.querySelector("#btn-submit-register").onclick = () => {
        if (!formScope.current()) return;
        feedback.clear();
        const account = container.querySelector("#reg-account").value.trim();
        const name = container.querySelector("#reg-name").value.trim();
        const password = container.querySelector("#reg-password").value;
        const pwdConfirm = container.querySelector("#reg-password-confirm").value;
        const email = container.querySelector("#reg-email").value.trim();

        const code = container.querySelector("#reg-code").value.trim();

        if (!account || !name || !password || !email || !code) return feedback.report([['reg-account', account], ['reg-name', name], ['reg-password', password], ['reg-email', email], ['reg-code', code]].filter(([, value]) => !value).map(([id]) => field(id)), t('auth.required_fields'));
        if (code.length !== 6) return feedback.report([field('reg-code')], t('auth.invalid_code'));
        
        if (!/^[a-zA-Z0-9_]{6,20}$/.test(account)) return feedback.report([field('reg-account')], t('auth.account_format_error'), "error");
        if (password !== pwdConfirm) return feedback.report([field('reg-password-confirm')], t('auth.password_mismatch'), "error");
        if (!/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}$/.test(password)) return feedback.report([field('reg-password')], t('auth.password_format_error'), "error");

        const formData = {
            type: "register", account, password, email, name, gender: genderSelect.value, code,
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
