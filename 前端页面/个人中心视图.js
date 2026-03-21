// 前端页面/个人中心视图.js
import { globalModal } from "./全局弹窗管理器.js";
import { createItemCard } from "./列表卡片组件.js";
import { api } from "./网络请求API.js";
import { createSettingsForm } from "./个人设置表单组件.js";

export function showUserProfile(initialUserData, currentUser = null, isMe = true) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#eee", fontSize: "14px"
    });

    let isSettingsView = false;
    let activeTab = localStorage.getItem(`Profile_ActiveTab_${isMe}`) || "published";
    let userData = initialUserData;

    function render() {
        container.innerHTML = ""; 

        if (isSettingsView && isMe) {
            // 引入解耦后的设置表单组件
            const formDOM = createSettingsForm(
                userData, 
                () => { isSettingsView = false; render(); }, // Cancel Callback
                (newUserData) => {                           // Save Success Callback
                    userData = newUserData;
                    if (container.updateData) container.updateData(userData);
                    isSettingsView = false;
                    render();
                }
            );
            container.appendChild(formDOM);
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
                        <div style="font-size: 13px; color: #ccc; line-height: 1.4;">${userData.intro || '这个人很懒，什么都没写...'}</div>
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
                        window.location.reload(); 
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
                    btnSendMsg.onclick = async () => {
                        if (!currentUser) return alert("请先登录您的社区账号！");
                        const content = prompt(`发私信给 @${userData.name} :`);
                        if (content && content.trim()) {
                            try {
                                btnSendMsg.innerText = "⏳ 发送中...";
                                await api.sendPrivateMessage(currentUser.account, userData.account, content.trim());
                                alert("✅ 私信发送成功！对方将在消息中心收到通知。");
                            } catch(e) { alert("❌ 发送失败: " + e.message); }
                            finally { btnSendMsg.innerText = "✉️ 私信"; }
                        }
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
            renderListContent(activeTab, listDOM);
        }
    }

    async function renderListContent(tabId, domElement) {
        if (tabId === "following") {
            const followingList = userData.following || [];
            domElement.innerHTML = "";
            if (followingList.length === 0) {
                domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>暂无关注的人</div>`; return;
            }
            const listDiv = document.createElement("div");
            listDiv.style.display = "flex"; listDiv.style.flexDirection = "column"; listDiv.style.gap = "8px";
            
            followingList.forEach(acc => {
                const item = document.createElement("div");
                Object.assign(item.style, { padding: "10px", background: "#2a2a2a", borderRadius: "6px", border: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center" });
                item.innerHTML = `<span style="color: #4CAF50; font-weight: bold; cursor: pointer;">@${acc}</span><button class="btn-view-user" data-acc="${acc}" style="padding: 4px 10px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">主页</button>`;
                item.querySelector('.btn-view-user').onclick = () => openOtherUserProfileModal(acc, currentUser);
                item.querySelector('span').onclick = () => openOtherUserProfileModal(acc, currentUser);
                listDiv.appendChild(item);
            });
            domElement.appendChild(listDiv); return;
        }

        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 正在从云端拉取真实数据...</div>"; 
        try {
            const [toolsRes, appsRes] = await Promise.all([ api.getItems("tool", "time", 100), api.getItems("app", "time", 100) ]);
            const allItems = [...(toolsRes.data || []), ...(appsRes.data || [])];
            let filteredItems = [];

            if (tabId === "published") filteredItems = allItems.filter(item => item.author === userData.account);
            else if (tabId === "liked") filteredItems = allItems.filter(item => item.liked_by && item.liked_by.includes(userData.account));

            domElement.innerHTML = ""; 
            if (filteredItems.length === 0) { domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>暂无记录</div>`; return; }
            filteredItems.forEach(item => { domElement.appendChild(createItemCard(item, currentUser)); });

        } catch (error) { domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#F44336;'>数据加载失败，请检查网络</div>"; }
    }

    container.updateData = function(newUserData) {
        if (JSON.stringify(userData) !== JSON.stringify(newUserData)) { userData = newUserData; if (!isSettingsView) { render(); } }
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