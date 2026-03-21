
// 前端页面/个人设置表单组件.js
import { api } from "./网络请求API.js";

export function createSettingsForm(userData, onCancelCallback, onSaveSuccessCallback) {
    const container = document.createElement("div");
    const getPrivacy = (key) => localStorage.getItem(`Profile_Privacy_${key}`) === "true";
    
    container.innerHTML = `
        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #444; font-weight: bold; font-size: 16px;">⚙️ 编辑资料与隐私设置</div>
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 6px; border: 1px dashed #555;">
                <img id="edit-avatar-preview" src="${userData.avatarDataUrl || userData.avatar || 'https://via.placeholder.com/150'}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #4CAF50;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">修改头像 (支持本地图片上传，小于 3MB)</label>
                    <input type="file" id="edit-avatar-file" accept="image/*" style="font-size: 12px; color: #aaa;">
                </div>
            </div>
            <div style="display: flex; gap: 10px;">
                <div style="flex:1;"><label>名称</label><input type="text" id="edit-name" value="${userData.name || ''}" style="width:100%; padding:6px; background:#333; color:#fff; border:1px solid #555; border-radius:4px;"></div>
                <div style="flex:1;"><label>性别</label>
                    <select id="edit-gender" style="width:100%; padding:6px; background:#333; color:#fff; border:1px solid #555; border-radius:4px;">
                        <option value="male" ${userData.gender === 'male' ? 'selected' : ''}>男</option>
                        <option value="female" ${userData.gender === 'female' ? 'selected' : ''}>女</option>
                        <option value="other" ${(!userData.gender || userData.gender === 'other') ? 'selected' : ''}>保密</option>
                    </select>
                </div>
            </div>
            <div><label>个人介绍</label><textarea id="edit-intro" rows="2" style="width:100%; padding:6px; background:#333; color:#fff; border:1px solid #555; border-radius:4px;">${userData.intro || ''}</textarea></div>
            <div style="display: flex; gap: 10px;">
                <div style="flex:1;"><label>年龄</label><input type="number" id="edit-age" value="${userData.age || ''}" style="width:100%; padding:6px; background:#333; color:#fff; border:1px solid #555; border-radius:4px;"></div>
                <div style="flex:1;"><label>国家</label><input type="text" id="edit-country" value="${userData.country || ''}" style="width:100%; padding:6px; background:#333; color:#fff; border:1px solid #555; border-radius:4px;"></div>
                <div style="flex:1;"><label>地区</label><input type="text" id="edit-region" value="${userData.region || ''}" style="width:100%; padding:6px; background:#333; color:#fff; border:1px solid #555; border-radius:4px;"></div>
            </div>
        </div>
        <div style="background: #2a2a2a; padding: 15px; border-radius: 6px; border: 1px solid #444; margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">🔒 隐私开关 (对外隐藏我的记录)</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="cursor: pointer;"><input type="checkbox" id="hide-follows" ${getPrivacy('follows') ? 'checked' : ''} style="margin-right: 8px;"> 隐藏我的关注列表</label>
                <label style="cursor: pointer;"><input type="checkbox" id="hide-likes" ${getPrivacy('likes') ? 'checked' : ''} style="margin-right: 8px;"> 隐藏我点赞的工具/应用</label>
                <label style="cursor: pointer;"><input type="checkbox" id="hide-favorites" ${getPrivacy('favorites') ? 'checked' : ''} style="margin-right: 8px;"> 隐藏我收藏的工具/应用</label>
                <label style="cursor: pointer;"><input type="checkbox" id="hide-downloads" ${getPrivacy('downloads') ? 'checked' : ''} style="margin-right: 8px;"> 隐藏我的下载与使用记录</label>
            </div>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="btn-save-settings" style="flex: 1; padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存所有设置</button>
            <button id="btn-cancel-settings" style="flex: 1; padding: 8px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer;">取消返回</button>
        </div>
    `;

    const avatarInput = container.querySelector("#edit-avatar-file");
    const avatarPreview = container.querySelector("#edit-avatar-preview");
    avatarInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => avatarPreview.src = event.target.result;
            reader.readAsDataURL(file);
        }
    };

    container.querySelector("#btn-cancel-settings").onclick = onCancelCallback;

    container.querySelector("#btn-save-settings").onclick = async () => {
        const btn = container.querySelector("#btn-save-settings");
        btn.innerHTML = "⏳ 保存中..."; btn.disabled = true;

        try {
            let avatarDataUrl = userData.avatarDataUrl || userData.avatar;
            if (avatarInput.files.length > 0) {
                const file = avatarInput.files[0];
                if (file.size > 3 * 1024 * 1024) throw new Error("头像超出 3MB");
                const uploadRes = await api.uploadFile(file, "avatar");
                avatarDataUrl = uploadRes.url;
            }

            const updateData = {
                name: container.querySelector("#edit-name").value.trim(),
                gender: container.querySelector("#edit-gender").value,
                intro: container.querySelector("#edit-intro").value.trim(),
                age: parseInt(container.querySelector("#edit-age").value) || null,
                country: container.querySelector("#edit-country").value.trim(),
                region: container.querySelector("#edit-region").value.trim(),
                avatarDataUrl: avatarDataUrl
            };

            const res = await api.updateUserProfile(userData.account, updateData);
            
            const savePrivacy = (id, key) => { localStorage.setItem(`Profile_Privacy_${key}`, container.querySelector(id).checked); };
            savePrivacy("#hide-follows", "follows"); savePrivacy("#hide-likes", "likes");
            savePrivacy("#hide-favorites", "favorites"); savePrivacy("#hide-downloads", "downloads");

            const newUserData = { ...userData, ...res.data };
            
            const storage = localStorage.getItem("ComfyCommunity_User") ? localStorage : sessionStorage;
            try {
                const savedStr = storage.getItem("ComfyCommunity_User");
                if (savedStr) {
                    const savedObj = JSON.parse(savedStr);
                    savedObj.user = newUserData;
                    storage.setItem("ComfyCommunity_User", JSON.stringify(savedObj));
                }
            } catch(e){}

            alert("设置已保存！");
            if (onSaveSuccessCallback) onSaveSuccessCallback(newUserData);
        } catch (err) {
            alert("保存失败：" + err.message); 
            btn.innerHTML = "保存所有设置"; 
            btn.disabled = false;
        }
    };

    return container;
}