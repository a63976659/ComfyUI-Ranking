// 前端页面/profile/个人设置表单组件.js
import { api } from "../core/网络请求API.js";
import { regionData } from "../auth/国家地区数据.js";
import { showToast } from "../components/UI交互提示组件.js";
import { uploadFile } from "../market/发布内容_提交引擎.js"; // 🟢 新增：引入带本地压缩裁剪功能的上传引擎

export function createSettingsForm(initialUserData, onCancelCallback, onSaveSuccessCallback) {
    const container = document.createElement("div");
    let userData = { ...initialUserData };

    // 从用户数据的 privacy 对象中读取真实状态，而不是 localStorage
    const privacy = userData.privacy || {};
    const getPrivacy = (key) => privacy[key] === true;
    const countryOptions = Object.keys(regionData).map(c => `<option value="${c}" ${c === userData.country ? 'selected' : ''}>${c}</option>`).join("");

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

            <div><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">显示名称</label><input type="text" id="setting-name" value="${userData.name || ''}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
            
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;"><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">性别</label>
                    <select id="setting-gender" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                        <option value="male" ${userData.gender === 'male' ? 'selected' : ''}>男 (Male)</option>
                        <option value="female" ${userData.gender === 'female' ? 'selected' : ''}>女 (Female)</option>
                        <option value="other" ${userData.gender === 'other' ? 'selected' : ''}>保密 (Secret)</option>
                    </select>
                </div>
                <div style="flex: 1;"><label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">年龄 (选填)</label><input type="number" id="setting-age" value="${userData.age || ''}" placeholder="不公开" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
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
    let avatarDataUrl = userData.avatarDataUrl; // 这个变量现在装的是极短的云端 URL，而不是几兆的 Base64

    countrySelect.onchange = (e) => {
        const c = e.target.value;
        const regions = regionData[c] || [];
        regionSelect.innerHTML = regions.map(r => `<option value="${r}">${r}</option>`).join("");
    };

    container.querySelector("#btn-trigger-avatar").onclick = () => settingAvatarInput.click();
    
    // 🟢 核心改造：对接本地 Canvas 裁剪与云端 Datasets 图床上传
    settingAvatarInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btnTrigger = container.querySelector("#btn-trigger-avatar");
        const originalText = btnTrigger.innerText;
        btnTrigger.innerText = "处理并上传中...";
        btnTrigger.disabled = true;

        try {
            // 🚀 这里会调用 发布内容_提交引擎 中的 processAvatar 方法
            // 在本地浏览器的 GPU 中进行 512x512 缩放和 JPG 压缩，随后直接上传到云端 Datasets
            const cloudImageUrl = await uploadFile(file, "avatar");
            
            if (cloudImageUrl) {
                avatarDataUrl = cloudImageUrl; // 保存这个极小的永久云端直链
                container.querySelector("#setting-avatar-preview").src = cloudImageUrl; // 更新界面预览
                showToast("✅ 头像上传成功！请点击底部保存设置生效。", "success");
            }
        } catch (err) {
            showToast("❌ 头像处理失败: " + err.message, "error");
        } finally {
            btnTrigger.innerText = originalText;
            btnTrigger.disabled = false;
        }
    };

    container.querySelector("#btn-cancel-settings").onclick = () => { if (onCancelCallback) onCancelCallback(); };

    container.querySelector("#btn-save-settings").onclick = async (e) => {
        const btn = e.target;
        btn.innerHTML = "⏳ 保存中..."; 
        btn.disabled = true;

        try {
            const updateData = {
                name: container.querySelector("#setting-name").value.trim(),
                intro: container.querySelector("#setting-intro").value.trim(),
                age: parseInt(container.querySelector("#setting-age").value) || null,
                country: countrySelect.value,
                region: regionSelect.value,
                gender: container.querySelector("#setting-gender").value,
                avatarDataUrl: avatarDataUrl
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