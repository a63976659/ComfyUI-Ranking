// 前端页面/profile/个人中心视图.js
import { api } from "../core/网络请求API.js";
import { openChatModal } from "../social/私信聊天组件.js";
import { createSettingsForm } from "./个人设置表单组件.js";
import { renderProfileListContent } from "./个人列表组件.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { openRechargeModal, openWithdrawModal } from "../market/资金与钱包组件.js"; // 【新增】：引入钱包与资金组件

export function showUserProfile(initialUserData, currentUser = null, isMe = true) {
    const container = document.createElement("div");
    Object.assign(container.style, { 
        display: "flex", flexDirection: "column", gap: "15px", color: "#eee", 
        fontSize: "14px", padding: "15px", flex: "none", height: "1220px", boxSizing: "border-box", overflowY: "auto", 
        background: "var(--bg-color, #202020)"
    });

    let isSettingsView = false;
    let activeTab = localStorage.getItem(`Profile_ActiveTab_${isMe}`) || "published";
    let userData = initialUserData;

    function render() {
        container.innerHTML = ""; 

        const backBtnHtml = `<button id="btn-back-profile" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 15px; width: fit-content; transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#333'; this.style.borderColor='#555'"><span style="font-size: 14px;">⬅</span> 返回</button>`;

        if (isSettingsView && isMe) {
            container.innerHTML = backBtnHtml;
            const settingsContainer = createSettingsForm(
                userData,
                () => { isSettingsView = false; render(); }, 
                (newUserData) => { 
                    userData = newUserData;
                    if (container.updateData) container.updateData(userData);
                    isSettingsView = false;
                    render();
                }
            );
            container.appendChild(settingsContainer);
            container.querySelector("#btn-back-profile").onclick = () => { isSettingsView = false; render(); };
        } else {
            let isFollowing = false;
            if (currentUser && userData.followers) { isFollowing = userData.followers.includes(currentUser.account); }

            // 【修复】：读取隐私状态拦截数字显示
            const privacy = userData.privacy || {};
            const followingCount = (!isMe && privacy.follows) ? "***" : (userData.following ? userData.following.length : 0);

            // 【修改】：如果是本人，渲染完整的钱包与设置按钮组
            const actionButtons = isMe 
                ? `<div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                       <button id="btn-wallet" style="background: #FF9800; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">💰 充值积分</button>
                       <button id="btn-withdraw" style="background: transparent; border: 1px solid #4CAF50; color: #4CAF50; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='rgba(76,175,80,0.1)'" onmouseout="this.style.background='transparent'">💸 收益提现</button>
                       <div style="display: flex; gap: 8px; margin-top: 4px;">
                           <button id="btn-open-settings" style="flex: 1; background: transparent; border: 1px solid #555; color: #aaa; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.color='#fff'; this.style.borderColor='#888'" onmouseout="this.style.color='#aaa'; this.style.borderColor='#555'">⚙️ 设置</button>
                           <button id="btn-logout" style="flex: 1; background: transparent; border: 1px solid #F44336; color: #F44336; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#F44336'; this.style.color='#fff'" onmouseout="this.style.background='transparent'; this.style.color='#F44336'">🚪 登出</button>
                       </div>
                   </div>`
                : `<button id="btn-send-msg" style="background: #2196F3; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-right: 8px;">✉️ 私信</button>
                   <button id="btn-follow-user" style="background: ${isFollowing ? '#4CAF50' : '#FF9800'}; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${isFollowing ? '✔️ 已关注' : '➕ 关注作者'}</button>`;

            // 【新增】：仅向本人展示余额与收益数据
            const balanceDisplayHtml = isMe 
                ? `<div>💰 余额: <strong style="color:#FF9800;">${userData.balance || 0}</strong></div>
                   <div>💸 可提现收益: <strong style="color:#4CAF50;">${userData.earn_balance || 0}</strong></div>`
                : '';

            const headerHtml = `
                <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 20px; position: relative;">
                    <img src="${userData.avatarDataUrl || userData.avatar || 'https://via.placeholder.com/150'}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #4CAF50; object-fit: cover;">
                    <div style="flex: 1; padding-right: 120px;">
                        <div style="font-size: 20px; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                            ${userData.name}
                            <span style="font-size: 12px; background: #444; padding: 2px 6px; border-radius: 4px; font-weight: normal;">${userData.gender === 'male' ? '♂️' : (userData.gender === 'female' ? '♀️' : '🔒')} ${userData.age || '未知'}岁</span>
                        </div>
                        <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">📍 ${userData.country || '保密'} - ${userData.region || ''}</div>
                        <div style="font-size: 13px; color: #ccc; line-height: 1.4; word-break: break-all;">${userData.intro || '这个人很懒，什么都没写...'}</div>
                    </div>
                    <div style="position: absolute; top: 0; right: 0; width: 120px; display: flex; flex-direction: column; gap: 8px;">${actionButtons}</div>
                </div>
                <div style="display: flex; gap: 20px; font-size: 13px; color: #bbb; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #333; flex-wrap: wrap;">
                    ${balanceDisplayHtml}
                    <div>👍 获赞: <strong style="color:#fff;">${userData.receivedLikes || 0}</strong></div>
                    <div>⭐ 被收藏: <strong style="color:#fff;">${userData.receivedFavorites || 0}</strong></div>
                    <div>👥 粉丝: <strong style="color:#fff;">${userData.followers ? userData.followers.length : 0}</strong></div>
                    <div>🏃 关注的人: <strong style="color:#fff;">${followingCount}</strong></div>
                </div>
            `;

            // 【修复】：基于隐私设置拦截选项卡的显示
            const tabs = [{ id: "published", label: isMe ? "我的发布" : "TA的发布" }];
            if (isMe || !privacy.likes) tabs.push({ id: "liked", label: "近期点赞" });
            if (isMe || !privacy.follows) tabs.push({ id: "following", label: "关注的人" });

            // 防止切换选项卡时报错（如果刚好停留在一个被隐藏的 Tab 上）
            if (!tabs.find(t => t.id === activeTab)) activeTab = "published";

            let tabsHtml = `<div style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 5px;">`;
            tabs.forEach(tab => {
                const isActive = activeTab === tab.id;
                tabsHtml += `<button class="profile-tab-btn" data-id="${tab.id}" style="background: transparent; border: none; cursor: pointer; padding: 5px 10px; color: ${isActive ? '#4CAF50' : '#888'}; font-weight: ${isActive ? 'bold' : 'normal'}; border-bottom: ${isActive ? '2px solid #4CAF50' : 'none'};">${tab.label}</button>`;
            });
            tabsHtml += `</div><div id="profile-list-container" style="flex: 1; overflow-y: auto; padding-right: 5px;"></div>`;

            container.innerHTML = backBtnHtml + headerHtml + tabsHtml;
            container.querySelector("#btn-back-profile").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));

            if (isMe) {
                // 【新增】：绑定钱包与提现点击事件
                container.querySelector("#btn-wallet").onclick = () => {
                    openRechargeModal(currentUser, (newBalance) => {
                        userData.balance = newBalance;
                        render(); // 更新数据后重新渲染 UI
                    });
                };
                container.querySelector("#btn-withdraw").onclick = () => {
                    openWithdrawModal(currentUser, (newEarnBalance) => {
                        userData.earn_balance = newEarnBalance;
                        render(); // 更新数据后重新渲染 UI
                    });
                };

                container.querySelector("#btn-open-settings").onclick = () => { isSettingsView = true; render(); };
                container.querySelector("#btn-logout").onclick = async () => {
                    if (await showConfirm("确定要退出当前账号吗？")) {
                        localStorage.removeItem("ComfyCommunity_User"); localStorage.removeItem("ComfyCommunity_Token");
                        sessionStorage.removeItem("ComfyCommunity_User"); sessionStorage.removeItem("ComfyCommunity_Token");
                        window.dispatchEvent(new CustomEvent("comfy-route-back")); 
                        window.dispatchEvent(new CustomEvent("comfy-user-logout"));
                        showToast("已退出登录", "info");
                    }
                };
            } else {
                const btnFollow = container.querySelector("#btn-follow-user");
                btnFollow.onclick = async () => {
                    if (!currentUser) return showToast("请先登录您的账号！", "warning");
                    btnFollow.innerHTML = "⏳ 处理中..."; btnFollow.disabled = true;
                    try {
                        const newStatus = !isFollowing;
                        await api.followUser(currentUser.account, userData.account, newStatus);
                        isFollowing = newStatus;
                        
                        if (!userData.followers) userData.followers = [];
                        if (isFollowing) { if (!userData.followers.includes(currentUser.account)) userData.followers.push(currentUser.account); } 
                        else { userData.followers = userData.followers.filter(a => a !== currentUser.account); }
                        render(); 
                    } catch (err) { showToast("操作失败：" + err.message, "error"); btnFollow.innerHTML = isFollowing ? "✔️ 已关注" : "➕ 关注作者"; } 
                    finally { btnFollow.disabled = false; }
                };

                const btnSendMsg = container.querySelector("#btn-send-msg");
                if (btnSendMsg) {
                    btnSendMsg.onclick = () => {
                        if (!currentUser) return showToast("请先登录您的社区账号！", "warning");
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
    const view = showUserProfile(userData, userData, true);
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));

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
        if (view.updateData) view.updateData(freshData);
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
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: activeContainer } }));
        } catch (e) {}
    }

    try {
        const res = await api.getUserProfile(targetAccount);
        const freshData = res.data;
        localStorage.setItem(cacheKey, JSON.stringify(freshData));
        
        if (activeContainer) { if (activeContainer.updateData) activeContainer.updateData(freshData); } 
        else {
            const profileElement = showUserProfile(freshData, currentUser, false);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: profileElement } }));
        }
    } catch (err) { if (!activeContainer) showToast("获取作者信息失败，可能该账号已注销。", "error"); }
}