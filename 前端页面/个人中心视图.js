// 前端页面/个人中心视图.js
import { globalModal } from "./全局弹窗管理器.js";
import { api } from "./网络请求API.js";
import { openChatModal } from "./私信聊天组件.js";
import { createSettingsForm } from "./个人设置表单组件.js";
import { renderProfileListContent } from "./个人列表组件.js";

export function showUserProfile(initialUserData, currentUser = null, isMe = true) {
    const container = document.createElement("div");
    Object.assign(container.style, { display: "flex", flexDirection: "column", gap: "15px", color: "#eee", fontSize: "14px" });

    let isSettingsView = false;
    let activeTab = localStorage.getItem(`Profile_ActiveTab_${isMe}`) || "published";
    let userData = initialUserData;

    function render() {
        container.innerHTML = ""; 

        if (isSettingsView && isMe) {
            // 挂载拆分出去的设置表单
            const settingsContainer = createSettingsForm(
                userData,
                () => { isSettingsView = false; render(); }, // 取消回调
                (newUserData) => { // 保存成功回调
                    userData = newUserData;
                    if (container.updateData) container.updateData(userData);
                    isSettingsView = false;
                    render();
                }
            );
            container.appendChild(settingsContainer);
        } else {
            let isFollowing = false;
            if (currentUser && userData.followers) { isFollowing = userData.followers.includes(currentUser.account); }

            const actionButtons = isMe 
                ? `<button id="btn-open-settings" style="background: transparent; border: 1px solid #555; color: #aaa; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;">⚙️ 设置</button>
                   <button id="btn-logout" style="background: transparent; border: 1px solid #F44336; color: #F44336; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;">🚪 登出</button>`
                : `<button id="btn-send-msg" style="background: #2196F3; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-right: 8px;">✉️ 私信</button>
                   <button id="btn-follow-user" style="background: ${isFollowing ? '#4CAF50' : '#FF9800'}; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${isFollowing ? '✔️ 已关注' : '➕ 关注作者'}</button>`;

            const headerHtml = `
                <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 20px; position: relative;">
                    <img src="${userData.avatarDataUrl || userData.avatar || 'https://via.placeholder.com/150'}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #4CAF50; object-fit: cover;">
                    <div style="flex: 1;">
                        <div style="font-size: 20px; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                            ${userData.name}
                            <span style="font-size: 12px; background: #444; padding: 2px 6px; border-radius: 4px; font-weight: normal;">${userData.gender === 'male' ? '♂️' : (userData.gender === 'female' ? '♀️' : '🔒')} ${userData.age || '未知'}岁</span>
                        </div>
                        <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">📍 ${userData.country || '保密'} - ${userData.region || ''}</div>
                        <div style="font-size: 13px; color: #ccc; line-height: 1.4; word-break: break-all;">${userData.intro || '这个人很懒，什么都没写...'}</div>
                    </div>
                    <div style="position: absolute; top: 0; right: 0; display: flex; gap: 8px;">${actionButtons}</div>
                </div>
                <div style="display: flex; gap: 20px; font-size: 13px; color: #bbb; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #333; flex-wrap: wrap;">
                    <div>👍 获赞: <strong style="color:#fff;">${userData.receivedLikes || 0}</strong></div>
                    <div>⭐ 被收藏: <strong style="color:#fff;">${userData.receivedFavorites || 0}</strong></div>
                    <div>👥 粉丝: <strong style="color:#fff;">${userData.followers ? userData.followers.length : 0}</strong></div>
                    <div>🏃 关注的人: <strong style="color:#fff;">${userData.following ? userData.following.length : 0}</strong></div>
                </div>
            `;

            const tabs = [{ id: "published", label: isMe ? "我的发布" : "TA的发布" }, { id: "liked", label: "近期点赞" }, { id: "following", label: "关注的人" }];
            let tabsHtml = `<div style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 5px;">`;
            tabs.forEach(tab => {
                const isActive = activeTab === tab.id;
                tabsHtml += `<button class="profile-tab-btn" data-id="${tab.id}" style="background: transparent; border: none; cursor: pointer; padding: 5px 10px; color: ${isActive ? '#4CAF50' : '#888'}; font-weight: ${isActive ? 'bold' : 'normal'}; border-bottom: ${isActive ? '2px solid #4CAF50' : 'none'};">${tab.label}</button>`;
            });
            tabsHtml += `</div><div id="profile-list-container" style="max-height: 300px; overflow-y: auto; padding-right: 5px;"></div>`;

            container.innerHTML = headerHtml + tabsHtml;

            if (isMe) {
                container.querySelector("#btn-open-settings").onclick = () => { isSettingsView = true; render(); };
                container.querySelector("#btn-logout").onclick = () => {
                    if (confirm("确定要退出当前账号吗？")) {
                        localStorage.removeItem("ComfyCommunity_User"); localStorage.removeItem("ComfyCommunity_Token");
                        sessionStorage.removeItem("ComfyCommunity_User"); sessionStorage.removeItem("ComfyCommunity_Token");
                        globalModal.closeTopModal();
                        window.dispatchEvent(new CustomEvent("comfy-user-logout"));
                    }
                };
            } else {
                const btnFollow = container.querySelector("#btn-follow-user");
                btnFollow.onclick = async () => {
                    if (!currentUser) return alert("请先登录您的账号！");
                    btnFollow.innerHTML = "⏳ 处理中..."; btnFollow.disabled = true;
                    try {
                        const newStatus = !isFollowing;
                        await api.followUser(currentUser.account, userData.account, newStatus);
                        isFollowing = newStatus;
                        
                        if (!userData.followers) userData.followers = [];
                        if (isFollowing) { if (!userData.followers.includes(currentUser.account)) userData.followers.push(currentUser.account); } 
                        else { userData.followers = userData.followers.filter(a => a !== currentUser.account); }
                        render(); 
                    } catch (err) { alert("操作失败：" + err.message); btnFollow.innerHTML = isFollowing ? "✔️ 已关注" : "➕ 关注作者"; } 
                    finally { btnFollow.disabled = false; }
                };

                const btnSendMsg = container.querySelector("#btn-send-msg");
                if (btnSendMsg) {
                    btnSendMsg.onclick = () => {
                        if (!currentUser) return alert("请先登录您的社区账号！");
                        globalModal.closeTopModal();
                        openChatModal(currentUser, userData.account);
                    };
                }
            }

            container.querySelectorAll(".profile-tab-btn").forEach(btn => {
                btn.onclick = (e) => {
                    activeTab = e.target.getAttribute("data-id");
                    localStorage.setItem(`Profile_ActiveTab_${isMe}`, activeTab); 
                    render();
                };
            });

            const listDOM = container.querySelector("#profile-list-container");
            // 调用外部剥离的 SWR 列表渲染器，传递 openOtherUserProfileModal 以便点击跳转
            renderProfileListContent(activeTab, listDOM, userData, currentUser, openOtherUserProfileModal);
        }
    }

    container.updateData = function(newUserData) {
        if (JSON.stringify(userData) !== JSON.stringify(newUserData)) { 
            userData = newUserData; 
            if (!isSettingsView) { render(); } 
        }
    };

    render();
    return container;
}

export function openUserProfileModal(userData) {
    const container = showUserProfile(userData, userData, true);
    globalModal.openModal(`我的个人主页`, container, { width: "600px" });

    api.getUserProfile(userData.account).then(res => {
        const freshData = res.data;
        const storage = localStorage.getItem("ComfyCommunity_User") ? localStorage : sessionStorage;
        try {
            const savedStr = storage.getItem("ComfyCommunity_User");
            if (savedStr) {
                const savedObj = JSON.parse(savedStr);
                savedObj.user = { ...savedObj.user, ...freshData };
                storage.setItem("ComfyCommunity_User", JSON.stringify(savedObj));
            }
        } catch(e){}
        if (container.updateData) container.updateData(freshData);
    }).catch(err => console.warn("后台更新本人资料失败", err));
}

export async function openOtherUserProfileModal(targetAccount, currentUser) {
    if (currentUser && currentUser.account === targetAccount) { return openUserProfileModal(currentUser); }
    
    const cacheKey = `ComfyCommunity_ProfileCache_${targetAccount}`;
    const cachedStr = localStorage.getItem(cacheKey);
    let activeContainer = null;

    if (cachedStr) {
        try {
            const cachedData = JSON.parse(cachedStr);
            activeContainer = showUserProfile(cachedData, currentUser, false);
            globalModal.openModal(`${cachedData.name} 的主页`, activeContainer, { width: "600px" });
        } catch (e) {}
    }

    try {
        const res = await api.getUserProfile(targetAccount);
        const freshData = res.data;
        localStorage.setItem(cacheKey, JSON.stringify(freshData));
        
        if (activeContainer) { if (activeContainer.updateData) activeContainer.updateData(freshData); } 
        else {
            const profileElement = showUserProfile(freshData, currentUser, false);
            globalModal.openModal(`${freshData.name} 的主页`, profileElement, { width: "600px" });
        }
    } catch (err) { if (!activeContainer) alert("获取作者信息失败，可能该账号已注销。"); }
}