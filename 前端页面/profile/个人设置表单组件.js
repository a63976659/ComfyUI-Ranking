// 前端页面/profile/个人设置表单组件.js
import { api } from "../core/网络请求API.js";
import { regionData, getSortedCountries } from "../auth/国家地区数据.js";
import { showToast } from "../components/UI交互提示组件.js";
import { uploadFile } from "../market/发布内容_提交引擎.js";
import { openImageCropper } from "../components/图片裁剪组件.js";
import { CACHE, getBackgroundKey, getBannerCacheKey } from "../core/全局配置.js";
import { t } from "../components/用户体验增强.js";

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

export function createSettingsForm(initialUserData, onCancelCallback, onSaveSuccessCallback) {
    const container = document.createElement("div");
    let userData = { ...initialUserData };
    const isAdmin = userData.isAdmin === true;  // 🔒 管理员标识

    // 从用户数据的 privacy 对象中读取真实状态
    const privacy = userData.privacy || {};
    const getPrivacy = (key) => privacy[key] === true;
    
    // 使用排序后的国家列表（常用国家置顶）
    const sortedCountries = getSortedCountries();
    const countryOptions = sortedCountries.map(c => `<option value="${c}" ${c === userData.country ? 'selected' : ''}>${c}</option>`).join("");

    container.innerHTML = `
        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #444; font-weight: bold; font-size: 16px;">⚙️ ${t('settings_form.title')}</div>
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <img id="setting-avatar-preview" src="${userData.avatarDataUrl || "https://via.placeholder.com/150/555/FFF?text=Avatar"}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #666;">
                <div>
                    <button id="btn-trigger-avatar" style="padding: 6px 12px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; margin-bottom: 5px;">${t('settings_form.change_avatar')}</button>
                    <div style="font-size: 11px; color: #888;">${t('settings_form.avatar_hint')}</div>
                </div>
                <input type="file" id="setting-avatar" accept="image/*" style="display: none;">
            </div>

            <div style="background: #2a2a2a; padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">🇺️ ${t('settings_form.banner_title')}</div>
                <div id="setting-banner-preview" style="width: 100%; height: 80px; border-radius: 4px; background: ${userData.bannerUrl ? `url(${userData.bannerUrl})` : '#1a1a1a'}; background-size: cover; background-position: center; margin-bottom: 8px; border: 1px solid #444;"></div>
                <div style="display: flex; gap: 8px;">
                    <button id="btn-trigger-banner" style="flex: 1; padding: 6px 12px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;">📷 ${t('settings_form.banner_upload')}</button>
                    <button id="btn-clear-banner" style="padding: 6px 12px; background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ ${t('settings_form.banner_clear')}</button>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">${t('settings_form.banner_hint')}</div>
                <input type="file" id="setting-banner" accept="image/*" style="display: none;">
            </div>

            <div style="background: #2a2a2a; padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">🎨 ${t('settings_form.ui_bg_title')}</div>
                <div id="setting-ui-bg-preview" style="width: 100%; height: 100px; border-radius: 4px; background: #1a1a1a; background-size: cover; background-position: center; margin-bottom: 8px; border: 1px solid #444;"></div>
                <div style="display: flex; gap: 8px;">
                    <button id="btn-trigger-ui-bg" style="flex: 1; padding: 6px 12px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;">📷 ${t('settings_form.banner_upload')}</button>
                    <button id="btn-clear-ui-bg" style="padding: 6px 12px; background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ ${t('settings_form.banner_clear')}</button>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">${t('settings_form.ui_bg_hint')}</div>
                <input type="file" id="setting-ui-bg" accept="image/*" style="display: none;">
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.display_name')}</label><input type="text" id="setting-name" value="${userData.name || ''}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;"><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.gender')}</label>
                    <select id="setting-gender" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                        <option value="male" ${userData.gender === 'male' ? 'selected' : ''}>${t('settings_form.gender_male')}</option>
                        <option value="female" ${userData.gender === 'female' ? 'selected' : ''}>${t('settings_form.gender_female')}</option>
                        <option value="other" ${userData.gender === 'other' ? 'selected' : ''}>${t('settings_form.gender_secret')}</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.birthday')}</label>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="date" id="setting-birthday" value="${userData.birthday || ''}" style="flex: 1; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                        <span id="setting-age-display" style="color: #888; font-size: 12px; white-space: nowrap;">${userData.age ? userData.age + ' ' + t('profile.age_years') : ''}</span>
                    </div>
                </div>
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.country')}</label>
                <select id="setting-country" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; margin-bottom: 10px;">
                    <option value="">${t('settings_form.select_country')}</option>
                    ${countryOptions}
                </select>
                <select id="setting-region" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="${userData.region || ''}">${userData.region || t('settings_form.select_country_first')}</option>
                </select>
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">${t('settings_form.intro')}</label><textarea id="setting-intro" rows="3" placeholder="${t('settings_form.intro_placeholder')}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box; resize: vertical;">${userData.intro || ''}</textarea></div>
            
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
                    <div style="background: #2a2a2a; padding: 12px; border-radius: 6px; border: 1px solid #444;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">🖼️ 图像内容审核</div>
                                <div style="font-size: 11px; color: #888;">启用后上传的图片将自动进行内容安全审核</div>
                            </div>
                            <label class="toggle-switch" style="position: relative; display: inline-block; width: 50px; height: 26px;">
                                <input type="checkbox" id="admin-image-moderation" style="opacity: 0; width: 0; height: 0;">
                                <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .3s; border-radius: 26px;"></span>
                            </label>
                        </div>
                        <div id="moderation-status" style="margin-top: 8px; font-size: 11px; color: #666;"></div>
                    </div>
                    
                    <!-- 🏷️ 版本管理面板 -->
                    <div style="background: #2a2a2a; padding: 12px; border-radius: 6px; border: 1px solid #444;">
                        <div style="font-size: 13px; color: #fff; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                            <span>🏷️</span> 工具版本管理
                        </div>
                        <div style="font-size: 11px; color: #888; margin-bottom: 10px;">统一修改项目阶段与版本号，将同步更新所有相关位置</div>
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-size: 11px; color: #aaa; margin-bottom: 4px;">项目阶段</label>
                                <select id="admin-project-stage" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer;">
                                    <option value="alpha">Alpha 内测</option>
                                    <option value="beta">Beta 公测</option>
                                    <option value="rc">RC 候选版</option>
                                    <option value="stable">Stable 正式版</option>
                                </select>
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-size: 11px; color: #aaa; margin-bottom: 4px;">版本号</label>
                                <div style="display: flex; gap: 4px;">
                                    <input type="number" id="admin-version-major" min="0" max="99" value="1" style="width: 40px; padding: 8px 4px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; text-align: center;">
                                    <span style="color: #666; line-height: 36px;">.</span>
                                    <input type="number" id="admin-version-minor" min="0" max="99" value="0" style="width: 40px; padding: 8px 4px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; text-align: center;">
                                    <span style="color: #666; line-height: 36px;">.</span>
                                    <input type="number" id="admin-version-patch" min="0" max="99" value="0" style="width: 40px; padding: 8px 4px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; text-align: center;">
                                </div>
                            </div>
                        </div>
                        
                        <div id="version-preview" style="background: #1a1a1a; padding: 8px 12px; border-radius: 4px; font-size: 12px; color: #4CAF50; margin-bottom: 10px;"></div>
                        
                        <button id="btn-apply-version" style="width: 100%; padding: 8px; background: linear-gradient(135deg, #FF9800, #F57C00); border: none; color: white; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">📢 应用版本更改</button>
                        <div id="version-status" style="margin-top: 6px; font-size: 11px; color: #666; text-align: center;"></div>
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
            const statusDiv = container.querySelector('#moderation-status');
            if (!moderationToggle) return;
            
            try {
                // 获取当前审核状态
                const res = await api.getSystemConfig('image_moderation');
                const enabled = res?.data?.enabled === true;
                moderationToggle.checked = enabled;
                
                if (statusDiv) {
                    const quota = res?.data?.quota || {};
                    statusDiv.innerHTML = enabled 
                        ? `<span style="color: #4CAF50;">✅ 已启用</span> | 本月已用: 阿里云 ${quota.aliyun || 0}/3000, 腾讯云 ${quota.tencent || 0}/10000`
                        : `<span style="color: #888;">⚪ 未启用</span> | 上传图片将跳过审核`;
                }
            } catch (e) {
                console.warn('获取审核状态失败:', e);
            }
            
            // 开关变化事件
            moderationToggle.onchange = async () => {
                const newState = moderationToggle.checked;
                moderationToggle.disabled = true;
                
                try {
                    await api.setSystemConfig('image_moderation', { enabled: newState });
                    showToast(newState ? '✅ 图像审核已启用' : '⚪ 图像审核已关闭', 'success');
                    
                    if (statusDiv) {
                        statusDiv.innerHTML = newState 
                            ? `<span style="color: #4CAF50;">✅ 已启用</span>`
                            : `<span style="color: #888;">⚪ 未启用</span> | 上传图片将跳过审核`;
                    }
                } catch (e) {
                    showToast(t('settings_form.save_failed') + ': ' + e.message, 'error');
                    moderationToggle.checked = !newState;  // 回滚
                } finally {
                    moderationToggle.disabled = false;
                }
            };
        }, 100);
        
        // 🏷️ 管理员：初始化版本管理面板
        setTimeout(async () => {
            const stageSelect = container.querySelector('#admin-project-stage');
            const majorInput = container.querySelector('#admin-version-major');
            const minorInput = container.querySelector('#admin-version-minor');
            const patchInput = container.querySelector('#admin-version-patch');
            const versionPreview = container.querySelector('#version-preview');
            const versionStatus = container.querySelector('#version-status');
            const applyBtn = container.querySelector('#btn-apply-version');
            
            if (!stageSelect || !majorInput) return;
            
            // 阶段显示映射
            const stageLabels = {
                'alpha': 'Alpha 内测',
                'beta': 'Beta 公测',
                'rc': 'RC 候选版',
                'stable': 'Stable 正式版'
            };
            
            // 更新预览
            const updatePreview = () => {
                const stage = stageSelect.value;
                const version = `V${majorInput.value}.${minorInput.value}.${patchInput.value}`;
                const stageLabel = stageLabels[stage] || stage;
                versionPreview.innerHTML = `当前版本：<strong>${version}</strong> <span style="color: #FF9800;">${stageLabel}</span>`;
            };
            
            // 绑定事件
            [stageSelect, majorInput, minorInput, patchInput].forEach(el => {
                el.addEventListener('change', updatePreview);
                el.addEventListener('input', updatePreview);
            });
            
            // 加载当前配置
            try {
                const res = await api.getSystemConfig('project_version');
                if (res?.data) {
                    const { stage, major, minor, patch } = res.data;
                    if (stage) stageSelect.value = stage;
                    if (major !== undefined) majorInput.value = major;
                    if (minor !== undefined) minorInput.value = minor;
                    if (patch !== undefined) patchInput.value = patch;
                }
                updatePreview();
            } catch (e) {
                console.warn('获取版本配置失败:', e);
                updatePreview();
            }
            
            // 应用版本更改
            applyBtn.onclick = async () => {
                applyBtn.disabled = true;
                applyBtn.innerHTML = '⚙️ 应用中...';
                versionStatus.innerHTML = '';
                
                const versionData = {
                    stage: stageSelect.value,
                    major: parseInt(majorInput.value) || 0,
                    minor: parseInt(minorInput.value) || 0,
                    patch: parseInt(patchInput.value) || 0
                };
                
                try {
                    await api.setSystemConfig('project_version', versionData);
                    const version = `V${versionData.major}.${versionData.minor}.${versionData.patch}`;
                    const stageLabel = stageLabels[versionData.stage] || versionData.stage;
                    showToast(`✅ 版本已更新为 ${version} ${stageLabel}`, 'success');
                    versionStatus.innerHTML = `<span style="color: #4CAF50;">✅ 已同步到所有相关位置</span>`;
                } catch (e) {
                    showToast('版本更新失败: ' + e.message, 'error');
                    versionStatus.innerHTML = `<span style="color: #f44336;">❌ 更新失败</span>`;
                } finally {
                    applyBtn.disabled = false;
                    applyBtn.innerHTML = '📢 应用版本更改';
                }
            };
        }, 150);
    }

    // 加载本地界面背景预览（使用账号区分键）
    const savedUiBg = localStorage.getItem(getBackgroundKey(userData.account));
    if (savedUiBg) {
        uiBgPreview.style.backgroundImage = `url(${savedUiBg})`;
        uiBgPreview.style.backgroundSize = "cover";
        uiBgPreview.style.backgroundPosition = "center";
    }

    // 出生日期变化时自动计算年龄
    birthdayInput.onchange = () => {
        const age = calculateAge(birthdayInput.value);
        if (age !== null) {
            ageDisplay.textContent = `${age} 岁`;
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

    container.querySelector("#btn-trigger-avatar").onclick = () => settingAvatarInput.click();
    
    // 头像上传逻辑（1:1 裁剪）
    settingAvatarInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        settingAvatarInput.value = "";

        // 打开裁剪弹窗（1:1 比例）
        const croppedFile = await openImageCropper(file, 1, "裁剪头像", 1);
        if (!croppedFile) return;

        const btnTrigger = container.querySelector("#btn-trigger-avatar");
        const originalText = btnTrigger.innerText;
        btnTrigger.innerText = "上传中...";
        btnTrigger.disabled = true;

        try {
            const cloudImageUrl = await uploadFile(croppedFile, "avatar");
            
            if (cloudImageUrl) {
                avatarDataUrl = cloudImageUrl;
                container.querySelector("#setting-avatar-preview").src = cloudImageUrl;
                showToast(`✅ ${t('settings_form.avatar_upload_success')}`, "success");
            }
        } catch (err) {
            showToast("❌ 头像处理失败: " + err.message, "error");
        } finally {
            btnTrigger.innerText = originalText;
            btnTrigger.disabled = false;
        }
    };

    // 个人资料卡背景图上传逻辑（16:9 裁剪）
    // 🚀 优化：裁剪后只预览，点击保存时才上传到云端
    container.querySelector("#btn-trigger-banner").onclick = () => settingBannerInput.click();
    container.querySelector("#btn-clear-banner").onclick = () => {
        bannerUrl = null;
        pendingBannerFile = null;
        pendingBannerDataUrl = null;
        bannerPreview.style.backgroundImage = "none";
        bannerPreview.style.background = "#1a1a1a";
        // 同时清除本地缓存（使用账号区分键）
        localStorage.removeItem(getBannerCacheKey(userData.account));
        showToast(`✅ ${t('settings_form.banner_cleared')}`, "success");
    };
    
    settingBannerInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        settingBannerInput.value = "";

        // 打开裁剪弹窗（16:9 比例）
        const croppedFile = await openImageCropper(file, 16/9, "裁剪个人资料卡背景", 3);
        if (!croppedFile) return;

        // 🚀 优化：不立即上传，只保存到待上传变量
        pendingBannerFile = croppedFile;
        
        // 转换为 DataURL 用于预览
        const reader = new FileReader();
        reader.onload = (ev) => {
            pendingBannerDataUrl = ev.target.result;
            bannerPreview.style.backgroundImage = `url(${pendingBannerDataUrl})`;
            bannerPreview.style.backgroundSize = "cover";
            bannerPreview.style.backgroundPosition = "center";
            showToast("✅ 背景图已选择，点击底部保存设置后才会上传。", "info");
        };
        reader.readAsDataURL(croppedFile);
    };

    // 界面背景上传逻辑（9:16 裁剪，仅本地）
    container.querySelector("#btn-trigger-ui-bg").onclick = () => settingUiBgInput.click();
    container.querySelector("#btn-clear-ui-bg").onclick = () => {
        // 使用账号区分键清除
        localStorage.removeItem(getBackgroundKey(userData.account));
        uiBgPreview.style.backgroundImage = "none";
        uiBgPreview.style.background = "#1a1a1a";
        // 立即应用到侧边栏
        window.dispatchEvent(new CustomEvent("comfy-sidebar-bg-update"));
        showToast("✅ 已清除界面背景，已立即生效。", "success");
    };
    
    settingUiBgInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        settingUiBgInput.value = "";

        // 打开裁剪弹窗（9:16 比例）
        const croppedFile = await openImageCropper(file, 9/16, "裁剪界面背景", 3);
        if (!croppedFile) return;

        // 读取为 Base64 并保存到本地（使用账号区分键）
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result;
            try {
                localStorage.setItem(getBackgroundKey(userData.account), base64);
                uiBgPreview.style.backgroundImage = `url(${base64})`;
                uiBgPreview.style.backgroundSize = "cover";
                uiBgPreview.style.backgroundPosition = "center";
                // 立即应用到侧边栏
                window.dispatchEvent(new CustomEvent("comfy-sidebar-bg-update"));
                showToast("✅ 界面背景设置成功，已立即生效！", "success");
            } catch (err) {
                showToast("❌ 图片过大，无法保存到本地", "error");
            }
        };
        reader.readAsDataURL(croppedFile);
    };

    container.querySelector("#btn-cancel-settings").onclick = () => { if (onCancelCallback) onCancelCallback(); };

    container.querySelector("#btn-save-settings").onclick = async (e) => {
        const btn = e.target;
        btn.innerHTML = "⏳ 保存中..."; 
        btn.disabled = true;

        try {
            // 🚀 优化：如果有待上传的背景图，先上传
            if (pendingBannerFile) {
                btn.innerHTML = "⏳ 上传背景图...";
                try {
                    const cloudImageUrl = await uploadFile(pendingBannerFile, "banner");
                    if (cloudImageUrl) {
                        bannerUrl = cloudImageUrl;
                        // 保存到本地缓存
                        if (pendingBannerDataUrl) {
                            try {
                                localStorage.setItem(getBannerCacheKey(userData.account), pendingBannerDataUrl);
                            } catch (storageErr) {
                                console.warn("背景图本地缓存失败:", storageErr);
                            }
                        }
                    }
                    pendingBannerFile = null;
                    pendingBannerDataUrl = null;
                } catch (uploadErr) {
                    showToast("❌ 背景图上传失败: " + uploadErr.message, "error");
                    btn.innerHTML = "保存所有设置"; 
                    btn.disabled = false;
                    return;
                }
            }
            
            btn.innerHTML = "⏳ 保存设置...";
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

            const res = await api.updateUserProfile(userData.account, updateData);
            
            // 收集隐私设置并发送到后端
            const privacySettings = {
                follows: container.querySelector("#hide-follows").checked,
                likes: container.querySelector("#hide-likes").checked,
                favorites: container.querySelector("#hide-favorites").checked,
                downloads: container.querySelector("#hide-downloads").checked
            };
            await api.updatePrivacy(userData.account, privacySettings);

            const newUserData = { ...userData, ...res.data, privacy: privacySettings };

            const storage = localStorage.getItem("ComfyCommunity_User") ? localStorage : sessionStorage;
            try {
                const savedStr = storage.getItem("ComfyCommunity_User");
                if (savedStr) {
                    const savedObj = JSON.parse(savedStr);
                    savedObj.user = newUserData;
                    storage.setItem("ComfyCommunity_User", JSON.stringify(savedObj));
                }
            } catch(e){}

            showToast("设置已保存并同步至云端！", "success");
            if (onSaveSuccessCallback) onSaveSuccessCallback(newUserData);
        } catch (err) {
            showToast("保存失败：" + err.message, "error"); 
            btn.innerHTML = "保存所有设置"; 
            btn.disabled = false;
        }
    };

    return container;
}