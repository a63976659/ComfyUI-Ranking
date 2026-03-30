// 前端页面/profile/个人设置表单组件.js
import { api } from "../core/网络请求API.js";
import { regionData, getSortedCountries } from "../auth/国家地区数据.js";
import { showToast } from "../components/UI交互提示组件.js";
import { uploadFile } from "../market/发布内容_提交引擎.js";
import { openImageCropper } from "../components/图片裁剪组件.js";
import { CACHE, getBackgroundKey, getBannerCacheKey } from "../core/全局配置.js";

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

    // 从用户数据的 privacy 对象中读取真实状态
    const privacy = userData.privacy || {};
    const getPrivacy = (key) => privacy[key] === true;
    
    // 使用排序后的国家列表（常用国家置顶）
    const sortedCountries = getSortedCountries();
    const countryOptions = sortedCountries.map(c => `<option value="${c}" ${c === userData.country ? 'selected' : ''}>${c}</option>`).join("");

    container.innerHTML = `
        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #444; font-weight: bold; font-size: 16px;">⚙️ 编辑资料与隐私设置</div>
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <img id="setting-avatar-preview" src="${userData.avatarDataUrl || "https://via.placeholder.com/150/555/FFF?text=Avatar"}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #666;">
                <div>
                    <button id="btn-trigger-avatar" style="padding: 6px 12px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; margin-bottom: 5px;">更换头像</button>
                    <div style="font-size: 11px; color: #888;">支持 JPG/PNG，将在本地自动裁剪为 1:1 并压缩。</div>
                </div>
                <input type="file" id="setting-avatar" accept="image/*" style="display: none;">
            </div>

            <div style="background: #2a2a2a; padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">🇺️ 个人资料卡背景图</div>
                <div id="setting-banner-preview" style="width: 100%; height: 80px; border-radius: 4px; background: ${userData.bannerUrl ? `url(${userData.bannerUrl})` : '#1a1a1a'}; background-size: cover; background-position: center; margin-bottom: 8px; border: 1px solid #444;"></div>
                <div style="display: flex; gap: 8px;">
                    <button id="btn-trigger-banner" style="flex: 1; padding: 6px 12px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;">📷 上传并裁剪</button>
                    <button id="btn-clear-banner" style="padding: 6px 12px; background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ 清除</button>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">比例 16:9，可缩放拖动裁剪，压缩后上传云端。</div>
                <input type="file" id="setting-banner" accept="image/*" style="display: none;">
            </div>

            <div style="background: #2a2a2a; padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">🎨 界面背景（仅本地）</div>
                <div id="setting-ui-bg-preview" style="width: 100%; height: 100px; border-radius: 4px; background: #1a1a1a; background-size: cover; background-position: center; margin-bottom: 8px; border: 1px solid #444;"></div>
                <div style="display: flex; gap: 8px;">
                    <button id="btn-trigger-ui-bg" style="flex: 1; padding: 6px 12px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;">📷 上传并裁剪</button>
                    <button id="btn-clear-ui-bg" style="padding: 6px 12px; background: transparent; border: 1px solid #555; color: #888; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ 清除</button>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">比例 9:16，仅保存在本地，不占用云端空间。</div>
                <input type="file" id="setting-ui-bg" accept="image/*" style="display: none;">
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">显示名称</label><input type="text" id="setting-name" value="${userData.name || ''}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;"><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">性别</label>
                    <select id="setting-gender" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                        <option value="male" ${userData.gender === 'male' ? 'selected' : ''}>男 (Male)</option>
                        <option value="female" ${userData.gender === 'female' ? 'selected' : ''}>女 (Female)</option>
                        <option value="other" ${userData.gender === 'other' ? 'selected' : ''}>保密 (Secret)</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">出生日期 (选填)</label>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="date" id="setting-birthday" value="${userData.birthday || ''}" style="flex: 1; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                        <span id="setting-age-display" style="color: #888; font-size: 12px; white-space: nowrap;">${userData.age ? userData.age + ' 岁' : ''}</span>
                    </div>
                </div>
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">国家/地区</label>
                <select id="setting-country" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; margin-bottom: 10px;">
                    <option value="">请选择国家</option>
                    ${countryOptions}
                </select>
                <select id="setting-region" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="${userData.region || ''}">${userData.region || '请先选择国家'}</option>
                </select>
            </div>

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">个人简介</label><textarea id="setting-intro" rows="3" placeholder="介绍一下你自己..." style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box; resize: vertical;">${userData.intro || ''}</textarea></div>
            
            <div style="margin-top: 15px; border-top: 1px solid #444; padding-top: 15px;">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #4CAF50;">🛡️ 隐私设置</div>
                <div style="font-size: 11px; color: #888; margin-bottom: 10px;">您可以选择向其他用户隐藏您在社区的足迹（不影响您自己查看）。</div>
                
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-follows" ${getPrivacy('follows') ? 'checked' : ''}> 不公开我关注的人
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-likes" ${getPrivacy('likes') ? 'checked' : ''}> 不公开我点赞过的内容
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-favorites" ${getPrivacy('favorites') ? 'checked' : ''}> 不公开我收藏的内容
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer;">
                        <input type="checkbox" id="hide-downloads" ${getPrivacy('downloads') ? 'checked' : ''}> 不公开我获取的记录
                    </label>
                </div>
            </div>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="btn-cancel-settings" style="flex: 1; padding: 10px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="btn-save-settings" style="flex: 2; padding: 10px; background: #4CAF50; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">保存所有设置</button>
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
                showToast("✅ 头像上传成功！请点击底部保存设置生效。", "success");
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
        showToast("✅ 已清除背景图，请点击底部保存设置生效。", "success");
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