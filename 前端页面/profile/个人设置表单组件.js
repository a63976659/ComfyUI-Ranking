// 前端页面/profile/个人设置表单组件.js
import { api, captureRequestSession } from "../core/网络请求API.js";
import { regionData, getSortedCountries } from "../auth/国家地区数据.js";
import { showToast } from "../components/UI交互提示组件.js";
import { uploadFile } from "../market/发布内容_提交引擎.js";
import { openImageCropper } from "../components/图片裁剪组件.js";
import { CACHE, IMAGE_PROCESS, getBackgroundKey, getBannerCacheKey, PLACEHOLDERS, escapeHtml } from "../core/全局配置.js";
import { t } from "../components/用户体验增强.js";
import { normalizeProfileData, mergeStoredProfile } from "./个人资料工具.js";

function _safeStorageGet(storageName, key) {
    try { return window[storageName].getItem(key); } catch { return null; }
}

function _safeLocalStorageRemove(key) {
    try { window.localStorage.removeItem(key); return true; } catch { return false; }
}

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

// 图像上传处理通用函数：绑定触发按钮 → 文件选择 → 裁剪 → 回调
function _createImageUploadHandler(inputEl, triggerEl, cropRatio, cropTitle, qualityLevel, onCropped, current, cropControllers, refreshSave) {
    let busy = false, generation = 0, activeController = null;
    triggerEl.onclick = () => { if (current() && !busy) inputEl.click(); };
    inputEl.onchange = async (e) => {
        if (!current() || busy) return;
        const file = e.target.files[0];
        if (!file) return;
        inputEl.value = "";
        busy = true;
        const token = ++generation;
        const operationCurrent = () => current() && token === generation;
        const controller = new AbortController(); activeController = controller; cropControllers.add(controller); refreshSave();
        try {
            const croppedFile = await openImageCropper(file, cropRatio, cropTitle, qualityLevel, { signal: controller.signal });
            if (!operationCurrent() || !croppedFile) return;
            await onCropped(croppedFile, operationCurrent, controller.signal);
        } catch (_) {
            if (operationCurrent()) showToast(t('settings_form.image_process_failed'), 'error');
        } finally { cropControllers.delete(controller); if (activeController === controller) activeController = null; busy = false; refreshSave(); }
    };
    return () => { generation++; try { activeController?.abort(); } catch (_) {} };
}

// FileReader读取图片并预览到目标元素，可选保存到localStorage
function _readAndPreviewImage(file, previewElement, cacheKey, current, readers, signal) {
    if (!current() || signal?.aborted) return Promise.resolve(null);
    return new Promise((resolve) => {
        const reader = new FileReader();
        let settled = false, timer = null;
        const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timer); signal?.removeEventListener('abort', cancel);
            reader.onload = reader.onerror = reader.onabort = null;
            readers.delete(reader);
            if (reader.readyState === FileReader.LOADING) { try { reader.abort(); } catch (_) {} }
            resolve(value);
        };
        const cancel = () => finish(null);
        const fail = () => {
            if (settled) return;
            if (current() && !signal?.aborted) showToast(t('settings_form.file_read_failed'), "error");
            finish(null);
        };
        readers.add(reader);
        reader.onload = (ev) => {
            if (settled) return;
            if (!current() || signal?.aborted || !previewElement.isConnected) { finish(null); return; }
            const base64 = ev.target.result;
            if (typeof base64 !== 'string' || !base64.startsWith('data:image/') || !base64.includes(',')) { fail(); return; }
            if (cacheKey) {
                try {
                    localStorage.setItem(cacheKey, base64);
                } catch (err) {
                    // 配额溢出：清理同类型旧缓存后重试
                    if (err.name === "QuotaExceededError") {
                        try {
                            const prefix = cacheKey.replace(/[^_]+$/, '');
                            for (let i = localStorage.length - 1; i >= 0; i--) {
                                const key = localStorage.key(i);
                                if (key && key.startsWith(prefix) && key !== cacheKey) {
                                    localStorage.removeItem(key);
                                }
                            }
                            localStorage.setItem(cacheKey, base64);
                        } catch (_) {
                            // 仍然失败则放弃本地缓存，不影响预览
                        }
                    }
                }
            }
            previewElement.style.backgroundImage = `url(${base64})`;
            previewElement.style.backgroundSize = "cover";
            previewElement.style.backgroundPosition = "center";
            finish(base64);
        };
        reader.onerror = fail;
        reader.onabort = cancel;
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) { cancel(); return; }
        timer = setTimeout(fail, IMAGE_PROCESS.TIMEOUT);
        try { reader.readAsDataURL(file); } catch (_) { fail(); }
    });
}

export function createSettingsForm(initialUserData, onCancelCallback, onSaveSuccessCallback, options = {}) {
    const container = document.createElement("div");
    let userData = { ...initialUserData };
    container.className = 'ranking-settings-form';
    const sessionMatches = captureRequestSession();
    let disposed = false, saving = false;
    const readers = new Set(), cropControllers = new Set();
    const current = () => !disposed && container.isConnected && sessionMatches() && (options.isCurrent?.() ?? true);
    container._cleanup = () => {
        if (disposed) return;
        disposed = true;
        for (const controller of cropControllers) { try { controller.abort(); } catch (_) {} }
        cropControllers.clear();
        for (const reader of readers) { try { reader.abort(); } catch (_) {} }
        readers.clear();
        container.querySelectorAll('input, textarea').forEach(input => { input.value = ''; });
        pendingBannerFile = pendingBannerDataUrl = null;
        userData = {};
    };
    const isAdmin = userData.is_admin === true || userData.isAdmin === true;  // 🔒 管理员标识

    // 从用户数据的 privacy 对象中读取真实状态
    const privacy = userData.privacy || {};
    const getPrivacy = (key) => privacy[key] === true;
    
    // 使用排序后的国家列表（常用国家置顶）
    const sortedCountries = getSortedCountries();
    const countryOptions = sortedCountries.map(c => `<option value="${c}" ${c === userData.country ? 'selected' : ''}>${c}</option>`).join("");

    container.innerHTML = `
        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #444; font-weight: bold; font-size: 16px;">⚙️ ${t('settings_form.title')}</div>
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px; background: var(--comfy-input-bg); padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <img id="setting-avatar-preview" src="${escapeHtml(userData.avatarDataUrl || PLACEHOLDERS.AVATAR)}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #666;">
                <div>
                    <button id="btn-trigger-avatar" style="padding: 6px 12px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; margin-bottom: 5px;">${t('settings_form.change_avatar')}</button>
                    <div style="font-size: 11px; color: #888;">${t('settings_form.avatar_hint')}</div>
                </div>
                <input type="file" id="setting-avatar" accept="image/*" style="display: none;">
            </div>

            <div style="background: var(--comfy-input-bg); padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">🇺️ ${t('settings_form.banner_title')}</div>
                <div id="setting-banner-preview" style="width: 100%; height: 80px; border-radius: 4px; background: ${userData.bannerUrl ? `url(${String(userData.bannerUrl).replace(/['"()\\]/g, '')})` : '#1a1a1a'}; background-size: cover; background-position: center; margin-bottom: 8px; border: 1px solid #444;"></div>
                <div style="display: flex; gap: 8px;">
                    <button id="btn-trigger-banner" style="flex: 1; padding: 6px 12px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;">📷 ${t('settings_form.banner_upload')}</button>
                    <button id="btn-clear-banner" style="padding: 6px 12px; background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ ${t('settings_form.banner_clear')}</button>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">${t('settings_form.banner_hint')}</div>
                <input type="file" id="setting-banner" accept="image/*" style="display: none;">
            </div>

            <div style="background: var(--comfy-input-bg); padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">🎨 ${t('settings_form.ui_bg_title')}</div>
                <div id="setting-ui-bg-preview" style="width: 100%; height: 100px; border-radius: 4px; background: #1a1a1a; background-size: cover; background-position: center; margin-bottom: 8px; border: 1px solid #444;"></div>
                <div style="display: flex; gap: 8px;">
                    <button id="btn-trigger-ui-bg" style="flex: 1; padding: 6px 12px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;">📷 ${t('settings_form.banner_upload')}</button>
                    <button id="btn-clear-ui-bg" style="padding: 6px 12px; background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ ${t('settings_form.banner_clear')}</button>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">${t('settings_form.ui_bg_hint')}</div>
                <input type="file" id="setting-ui-bg" accept="image/*" style="display: none;">
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.display_name')}</label><input type="text" id="setting-name" value="${escapeHtml(userData.name || '')}" style="width: 100%; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;"><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.gender')}</label>
                    <select id="setting-gender" style="width: 100%; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px;">
                        <option value="male" ${userData.gender === 'male' ? 'selected' : ''}>${t('settings_form.gender_male')}</option>
                        <option value="female" ${userData.gender === 'female' ? 'selected' : ''}>${t('settings_form.gender_female')}</option>
                        <option value="other" ${userData.gender === 'other' ? 'selected' : ''}>${t('settings_form.gender_secret')}</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.birthday')}</label>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="date" id="setting-birthday" value="${escapeHtml(userData.birthday || '')}" style="flex: 1; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                        <span id="setting-age-display" style="color: #888; font-size: 12px; white-space: nowrap;">${userData.age ? userData.age + ' ' + t('profile.age_years') : ''}</span>
                    </div>
                </div>
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.country')}</label>
                <select id="setting-country" style="width: 100%; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px; margin-bottom: 10px;">
                    <option value="">${t('settings_form.select_country')}</option>
                    ${countryOptions}
                </select>
                <select id="setting-region" style="width: 100%; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="${escapeHtml(userData.region || '')}">${escapeHtml(userData.region || t('settings_form.select_country_first'))}</option>
                </select>
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.intro')}</label><textarea id="setting-intro" rows="3" placeholder="${t('settings_form.intro_placeholder')}" style="width: 100%; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box; resize: vertical;">${escapeHtml(userData.intro || '')}</textarea></div>
            
            <div style="margin-top: 15px; border-top: 1px solid #444; padding-top: 15px;">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #4CAF50;">🛡️ ${t('settings_form.privacy_title')}</div>
                <div style="font-size: 11px; color: #888; margin-bottom: 10px;">${t('settings_form.privacy_hint')}</div>
                
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-follows" ${getPrivacy('follows') ? 'checked' : ''}> ${t('settings_form.hide_follows')}
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-likes" ${getPrivacy('likes') ? 'checked' : ''}> ${t('settings_form.hide_likes')}
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-favorites" ${getPrivacy('favorites') ? 'checked' : ''}> ${t('settings_form.hide_favorites')}
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-downloads" ${getPrivacy('downloads') ? 'checked' : ''}> ${t('settings_form.hide_downloads')}
                    </label>
                </div>
            </div>
            
            ${isAdmin ? `
            <!-- 🔒 管理员设置区域 -->
            <div id="admin-settings-section" style="margin-top: 15px; border-top: 1px solid #9C27B0; padding-top: 15px; background: linear-gradient(135deg, rgba(156,39,176,0.1), transparent); border-radius: 8px; padding: 15px; margin-top: 15px;">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #9C27B0; display: flex; align-items: center; gap: 8px;">
                    <span>🔒</span> ${t('settings_form.admin_title')}
                    <span style="font-size: 10px; background: #9C27B0; color: white; padding: 2px 6px; border-radius: 10px;">Admin</span>
                </div>
                <div style="font-size: 11px; color: #888; margin-bottom: 12px;">${t('settings_form.admin_hint')}</div>
                
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- 图像审核开关 -->
                    <div style="background: var(--comfy-input-bg); padding: 12px; border-radius: 6px; border: 1px solid #444;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">🖼️ 图像内容审核</div>
                                <div style="font-size: 11px; color: #888;">启用后上传的图片将自动进行内容安全审核</div>
                            </div>
                            <label class="toggle-switch" style="position: relative; display: inline-block; width: 50px; height: 26px;">
                                <input type="checkbox" id="admin-image-moderation" style="opacity: 0; width: 0; height: 0;">
                                <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--comfy-input-bg); transition: .3s; border-radius: 26px;"></span>
                            </label>
                        </div>
                        <div id="moderation-status" style="margin-top: 8px; font-size: 11px; color: #666;"></div>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="btn-cancel-settings" style="flex: 1; padding: 10px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer;">${t('settings_form.cancel')}</button>
            <button id="btn-save-settings" style="flex: 2; padding: 10px; background: #4CAF50; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">${t('settings_form.save_all')}</button>
        </div>
    `;

    const countrySelect = container.querySelector("#setting-country");
    const regionSelect = container.querySelector("#setting-region");
    const settingAvatarInput = container.querySelector("#setting-avatar");
    const settingBannerInput = container.querySelector("#setting-banner");
    const settingUiBgInput = container.querySelector("#setting-ui-bg");
    const bannerPreview = container.querySelector("#setting-banner-preview");
    const uiBgPreview = container.querySelector("#setting-ui-bg-preview");
    const birthdayInput = container.querySelector("#setting-birthday");
    const ageDisplay = container.querySelector("#setting-age-display");
    let avatarDataUrl = userData.avatarDataUrl;
    let bannerUrl = userData.bannerUrl || null;
    
    // 🔧 初始化地区下拉列表：根据当前国家加载所有地区选项
    const currentCountry = userData.country;
    if (currentCountry && regionData[currentCountry]) {
        const regions = regionData[currentCountry];
        regionSelect.innerHTML = regions
            .map(r => `<option value="${r}" ${r === userData.region ? 'selected' : ''}>${r}</option>`)
            .join("");
    } else {
        regionSelect.innerHTML = `<option value="">${t('settings_form.select_country_first')}</option>`;
    }

    // 🚀 优化：延迟上传模式 - 裁剪后不立即上传，保存时才上传
    let pendingBannerFile = null;  // 待上传的背景图文件
    let pendingBannerDataUrl = null;  // 用于预览和本地缓存

    // 🔒 管理员开关样式注入
    if (isAdmin && !document.getElementById('admin-toggle-styles')) {
        const toggleStyles = document.createElement('style');
        toggleStyles.id = 'admin-toggle-styles';
        toggleStyles.textContent = `
            .toggle-switch input:checked + .toggle-slider {
                background-color: #4CAF50;
            }
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 20px;
                width: 20px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .3s;
                border-radius: 50%;
            }
            .toggle-switch input:checked + .toggle-slider:before {
                transform: translateX(24px);
            }
        `;
        document.head.appendChild(toggleStyles);
    }
    
    // 🔒 管理员：初始化图像审核开关状态
    if (isAdmin) {
        setTimeout(async () => {
            const moderationToggle = container.querySelector('#admin-image-moderation');
            if (!current()) return;
            const statusDiv = container.querySelector('#moderation-status');
            if (!moderationToggle) return;
            
            try {
                // 获取当前审核状态
                const res = await api.getSystemConfig('image_moderation');
                if (!current()) return;
                const enabled = res?.data?.enabled === true;
                moderationToggle.checked = enabled;
                
                if (statusDiv) {
                    const quota = res?.data?.quota || {};
                    statusDiv.innerHTML = enabled
                        ? `<span style="color: #4CAF50;">✅ ${escapeHtml(t('settings_form.enabled'))}</span> | ${escapeHtml(t('settings_form.moderation_quota', { aliyun: quota.aliyun || 0, tencent: quota.tencent || 0 }))}`
                        : `<span style="color: #888;">⚪ ${escapeHtml(t('settings_form.disabled'))}</span> | ${escapeHtml(t('settings_form.moderation_skipped'))}`;
                }
            } catch (e) {
                console.warn('获取审核状态失败:', e?.name || 'Error');
            }
            
            // 开关变化事件
            moderationToggle.onchange = async () => {
                if (!current() || moderationToggle.disabled) return;
                const newState = moderationToggle.checked;
                moderationToggle.disabled = true;
                
                try {
                    await api.setSystemConfig('image_moderation', { enabled: newState });
                    if (!current()) return;
                    showToast(newState ? t('settings_form.moderation_enabled') : t('settings_form.moderation_disabled'), 'success');
                    
                    if (statusDiv) {
                        statusDiv.innerHTML = newState
                            ? `<span style="color: #4CAF50;">✅ ${escapeHtml(t('settings_form.enabled'))}</span>`
                            : `<span style="color: #888;">⚪ ${escapeHtml(t('settings_form.disabled'))}</span> | ${escapeHtml(t('settings_form.moderation_skipped'))}`;
                    }
                } catch (e) {
                    if (!current()) return;
                    showToast(t('settings_form.save_failed'), 'error');
                    moderationToggle.checked = !newState;  // 回滚
                } finally {
                    if (current()) moderationToggle.disabled = false;
                }
            };
        }, 100);
    }

    // 加载本地界面背景预览（使用账号区分键）
    const savedUiBg = _safeStorageGet('localStorage', getBackgroundKey(userData.account));
    if (typeof savedUiBg === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(savedUiBg)) {
        uiBgPreview.style.backgroundImage = `url(${savedUiBg})`;
        uiBgPreview.style.backgroundSize = "cover";
        uiBgPreview.style.backgroundPosition = "center";
    }

    // 出生日期变化时自动计算年龄
    birthdayInput.onchange = () => {
        const age = calculateAge(birthdayInput.value);
        if (age !== null) {
            ageDisplay.textContent = `${age} ${t('profile.age_years')}`;
            ageDisplay.style.color = "#4CAF50";
        } else {
            ageDisplay.textContent = "";
        }
    };

    countrySelect.onchange = (e) => {
        const c = e.target.value;
        const regions = regionData[c] || [];
        regionSelect.innerHTML = regions.map(r => `<option value="${r}">${r}</option>`).join("");
    };

    // 头像上传逻辑（1:1 裁剪）
    _createImageUploadHandler(
        settingAvatarInput, container.querySelector("#btn-trigger-avatar"),
        1, t('settings_form.crop_avatar'), 1,
        async (croppedFile) => {
            if (!current()) return;
            const btnTrigger = container.querySelector("#btn-trigger-avatar");
            const originalText = btnTrigger.innerText;
            btnTrigger.innerText = t('settings_form.uploading');
            btnTrigger.disabled = true;
            try {
                const cloudImageUrl = await uploadFile(croppedFile, "avatar");
                if (!current()) return;
                if (cloudImageUrl) {
                    avatarDataUrl = cloudImageUrl;
                    container.querySelector("#setting-avatar-preview").src = cloudImageUrl;
                    showToast(`✅ ${t('settings_form.avatar_upload_success')}`, "success");
                }
            } catch (err) {
                if (current()) showToast(t('settings_form.avatar_process_failed'), "error");
            } finally {
                if (current()) { btnTrigger.innerText = originalText; btnTrigger.disabled = false; }
            }
        }, () => current() && !saving, cropControllers, refreshSaveAvailability
    );

    function refreshSaveAvailability() {
        const saveButton = container.querySelector('#btn-save-settings');
        if (saveButton) saveButton.disabled = saving || cropControllers.size > 0;
    }

    // 个人资料卡背景图上传逻辑（16:9 裁剪）
    // 🚀 优化：裁剪后只预览，点击保存时才上传到云端
    const cancelBannerSelection = _createImageUploadHandler(
        settingBannerInput, container.querySelector("#btn-trigger-banner"),
        16/9, t('settings_form.crop_banner'), 3,
        async (croppedFile, operationCurrent, signal) => {
            if (!operationCurrent()) return;
            const dataUrl = await _readAndPreviewImage(croppedFile, bannerPreview, null, operationCurrent, readers, signal);
            if (!operationCurrent()) return;
            if (dataUrl) {
                pendingBannerFile = croppedFile;
                pendingBannerDataUrl = dataUrl;
                showToast(t('settings_form.banner_selected'), "info");
            }
        }, () => current() && !saving, cropControllers, refreshSaveAvailability
    );
    container.querySelector("#btn-clear-banner").onclick = () => {
        if (!current() || saving) return;
        // 🔧 清除必须传空串而非 null：云端 PUT /api/users/{account} 的更新循环只写非 None 值
        // （见 router_users_profile.py「遍历请求中的字段，只更新非空值」），传 null 等同于
        // 「本次没改这个字段」而被跳过，云端旧图残留 —— 表现为点清除并保存后提示成功，
        // 但自己和他人在创作者榜单里看到的背景图依然存在。空串则会真实落库，
        // 且下游 hasBanner / bannerImageUrl 等判断都按 falsy 正确处理。
        // 注意上方 `let bannerUrl = userData.bannerUrl || null` 的初值仍保持 null：那是「本次未涉及该字段」
        // 的语义，可防止 userData 恰好缺 bannerUrl 时把云端图误清掉。
        cancelBannerSelection();
        bannerUrl = "";
        pendingBannerFile = null;
        pendingBannerDataUrl = null;
        bannerPreview.style.backgroundImage = "none";
        bannerPreview.style.background = "#1a1a1a";
        // 同时清除本地缓存（使用账号区分键）
        if (!_safeLocalStorageRemove(getBannerCacheKey(userData.account))) {
            showToast(t('settings_form.local_storage_unavailable'), "warning");
        }
        showToast(`✅ ${t('settings_form.banner_cleared')}`, "success");
    };

    // 界面背景上传逻辑（9:16 裁剪，仅本地）
    const cancelUiBgSelection = _createImageUploadHandler(
        settingUiBgInput, container.querySelector("#btn-trigger-ui-bg"),
        9/16, t('settings_form.crop_ui_bg'), 3,
        async (croppedFile, operationCurrent, signal) => {
            const dataUrl = await _readAndPreviewImage(croppedFile, uiBgPreview, getBackgroundKey(userData.account), operationCurrent, readers, signal);
            if (!operationCurrent()) return;
            if (dataUrl) {
                window.dispatchEvent(new CustomEvent("comfy-sidebar-bg-update"));
                showToast(t('settings_form.ui_bg_applied'), "success");
            }
        }, () => current() && !saving, cropControllers, refreshSaveAvailability
    );
    container.querySelector("#btn-clear-ui-bg").onclick = () => {
        if (!current() || saving) return;
        cancelUiBgSelection();
        // 使用账号区分键清除
        if (!_safeLocalStorageRemove(getBackgroundKey(userData.account))) {
            showToast(t('settings_form.local_storage_unavailable'), "error");
            return;
        }
        uiBgPreview.style.backgroundImage = "none";
        uiBgPreview.style.background = "#1a1a1a";
        // 立即应用到侧边栏
        window.dispatchEvent(new CustomEvent("comfy-sidebar-bg-update"));
        showToast(t('settings_form.ui_bg_cleared'), "success");
    };

    container.querySelector("#btn-cancel-settings").onclick = () => { if (current() && onCancelCallback) onCancelCallback(); };

    container.querySelector("#btn-save-settings").onclick = async (e) => {
        if (!current() || saving || cropControllers.size > 0) return;
        saving = true;
        const btn = e.currentTarget;
        btn.innerHTML = `⏳ ${escapeHtml(t('settings_form.saving'))}`;
        const lockedControls = Array.from(container.querySelectorAll('input, select, textarea, button'))
            .filter(control => control.id !== 'btn-cancel-settings')
            .map(control => [control, control.disabled]);
        for (const [control] of lockedControls) control.disabled = true;
        const unlock = () => {
            for (const [control, disabled] of lockedControls) control.disabled = disabled;
            saving = false; refreshSaveAvailability();
        };

        try {
            const birthday = birthdayInput.value || null;
            const updateData = {
                name: container.querySelector("#setting-name").value.trim(),
                intro: container.querySelector("#setting-intro").value.trim(),
                birthday: birthday,
                age: calculateAge(birthday),
                country: countrySelect.value,
                region: regionSelect.value,
                gender: container.querySelector("#setting-gender").value,
                avatarDataUrl: avatarDataUrl,
                bannerUrl: bannerUrl
            };
            const privacySettings = {
                follows: container.querySelector("#hide-follows").checked,
                likes: container.querySelector("#hide-likes").checked,
                favorites: container.querySelector("#hide-favorites").checked,
                downloads: container.querySelector("#hide-downloads").checked
            };

            const bannerDataToCache = pendingBannerDataUrl;
            // 🚀 优化：如果有待上传的背景图，先上传
            if (pendingBannerFile) {
                btn.innerHTML = `⏳ ${escapeHtml(t('settings_form.uploading_banner'))}`;
                try {
                    const cloudImageUrl = await uploadFile(pendingBannerFile, "banner", { isCurrent: current, silent: true });
                    if (!current()) return;
                    if (typeof cloudImageUrl !== "string" || !cloudImageUrl.trim()) throw new Error("Invalid banner upload");
                    bannerUrl = cloudImageUrl;
                    updateData.bannerUrl = cloudImageUrl;
                    pendingBannerFile = null;
                } catch (uploadErr) {
                    if (!current()) return;
                    unlock();
                    showToast(t('settings_form.banner_upload_failed'), "error");
                    btn.innerHTML = escapeHtml(t('settings_form.save_all'));
                    btn.disabled = false;
                    return;
                }
            }

            btn.innerHTML = `⏳ ${escapeHtml(t('settings_form.saving_settings'))}`;


            const res = await api.updateUserSettings(userData.account, { ...updateData, privacy: privacySettings });
            if (!current()) return;
            if (res?.status !== 'success' || !res.data || typeof res.data !== 'object' || Array.isArray(res.data) || res.data.account !== userData.account) throw new Error('Invalid settings response');

            if (!res.data.privacy || Object.keys(privacySettings).some(key => res.data.privacy[key] !== privacySettings[key])) {
                throw new Error('Invalid settings privacy confirmation');
            }

            // 保存到本地缓存
            if (bannerDataToCache) {
                const bannerCacheKey = getBannerCacheKey(userData.account);
                try {
                    localStorage.setItem(bannerCacheKey, bannerDataToCache);
                } catch (storageErr) {
                    // 配额溢出：清理其他用户的旧 banner 缓存后重试
                    if (storageErr.name === "QuotaExceededError") {
                        try {
                            for (let i = localStorage.length - 1; i >= 0; i--) {
                                const key = localStorage.key(i);
                                if (key && key.startsWith("ComfyRanking_ProfileBannerCache_") && key !== bannerCacheKey) {
                                    localStorage.removeItem(key);
                                }
                            }
                            localStorage.setItem(bannerCacheKey, bannerDataToCache);
                        } catch (_) {
                            // 仍然失败则放弃本地缓存（不影响云端保存）
                        }
                    }
                }
            }
            pendingBannerDataUrl = null;

            const newUserData = normalizeProfileData({ ...userData, ...res.data, privacy: privacySettings }, userData.account, true);

            const storages = ['localStorage', 'sessionStorage'].map(name => {
                try { return window[name]; } catch (_) { return null; }
            });
            mergeStoredProfile(userData.account, newUserData, storages, CACHE.LEGACY_KEYS.USER);

            // 主动清除该用户的 SWR 缓存，确保头像等信息立即刷新
            const profileCacheKey = "ComfyCommunity_ProfileCache_" + userData.account;
            if (!_safeLocalStorageRemove(profileCacheKey)) {
                showToast(t('settings_form.local_storage_unavailable'), "warning");
            }

            showToast(t('settings_form.settings_saved'), "success");
            if (onSaveSuccessCallback) onSaveSuccessCallback(newUserData);
        } catch (err) {
            if (!current()) return;
            unlock();
            showToast(t('settings_form.settings_save_failed'), "error");
            btn.innerHTML = escapeHtml(t('settings_form.save_all'));
            btn.disabled = false;
        }
    };

    return container;
}
