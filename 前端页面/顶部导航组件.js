// 前端页面/顶部导航组件.js
import { showAuthModal } from "./用户注册登录组件.js";
import { openUserProfileModal, openOtherUserProfileModal } from "./个人中心视图.js";
import { api } from "./网络请求API.js"; 
import { globalModal } from "./全局弹窗管理器.js"; 

export function createTopNav() {
    const userHeader = document.createElement("div");
    Object.assign(userHeader.style, {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "15px 10px", backgroundColor: "#1a1a1a", borderBottom: "1px solid #333"
    });

    const titleSpan = document.createElement("div");
    titleSpan.innerHTML = "<strong style='color:#4CAF50;'>ComfyUI</strong> 社区精选";
    titleSpan.style.fontSize = "16px";

    const userActionBtn = document.createElement("button");
    Object.assign(userActionBtn.style, {
        padding: "6px 12px", backgroundColor: "#333", color: "#fff",
        border: "1px solid #555", borderRadius: "4px", cursor: "pointer",
        fontSize: "12px", transition: "background 0.2s"
    });

    const bellBtn = document.createElement("button");
    Object.assign(bellBtn.style, {
        background: "transparent", border: "none", color: "#aaa", cursor: "pointer",
        fontSize: "18px", position: "relative", marginRight: "15px"
    });
    bellBtn.innerHTML = `🔔<span id="unread-badge" style="display:none; position:absolute; top:-4px; right:-8px; background:#F44336; color:white; font-size:10px; font-weight:bold; padding:2px 5px; border-radius:10px; line-height:1;">0</span>`;
    
    let currentUser = null; 
    try {
        const savedUserStr = localStorage.getItem("ComfyCommunity_User");
        if (savedUserStr) {
            const data = JSON.parse(savedUserStr);
            if (data.expireAt && Date.now() < data.expireAt) { currentUser = data.user; } 
            else { localStorage.removeItem("ComfyCommunity_User"); localStorage.removeItem("ComfyCommunity_Token"); }
        } else {
            const tempUserStr = sessionStorage.getItem("ComfyCommunity_User");
            if (tempUserStr) { currentUser = JSON.parse(tempUserStr).user; }
        }
    } catch (e) {}

    bellBtn.onclick = async () => {
        if (!currentUser) return alert("⚠️ 请先登录您的社区账号查看消息！");
        try {
            const res = await api.getMessages(currentUser.account);
            const msgs = res.data || [];
            
            const list = document.createElement("div");
            list.style.display = "flex"; list.style.flexDirection = "column"; list.style.gap = "10px";
            
            if (msgs.length === 0) {
                list.innerHTML = "<div style='text-align:center; padding: 30px; color:#888;'>暂无新消息</div>";
            } else {
                msgs.forEach(m => {
                    const item = document.createElement("div");
                    item.style.padding = "10px"; 
                    item.style.background = m.is_read ? "#2a2a2a" : "rgba(33, 150, 243, 0.1)";
                    item.style.borderRadius = "6px"; item.style.border = "1px solid #444";
                    item.style.display = "flex"; item.style.gap = "12px"; item.style.alignItems = "flex-start";
                    
                    let iconText = "";
                    if (m.type === "like") iconText = "👍 赞了你的作品";
                    else if (m.type === "favorite") iconText = "⭐ 收藏了你的作品";
                    else if (m.type === "comment") iconText = "💬 评论了你";
                    else if (m.type === "reply") iconText = "💬 回复了你";
                    else if (m.type === "follow") iconText = "👥 关注了你";
                    else if (m.type === "private") iconText = "✉️ 发来一条私信";

                    const targetTitle = m.target_item_title ? ` <span style='color:#4CAF50;'>[${m.target_item_title}]</span>` : "";
                    const contentDiv = m.content ? `<div style="margin-top:6px; background:#1e1e1e; padding:8px; border-radius:4px; font-size:12px; color:#ccc; border-left:3px solid #555;">${m.content}</div>` : "";

                    item.innerHTML = `
                        <img src="${m.from_avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border: 1px solid #555;">
                        <div style="flex:1;">
                            <div style="font-size:13px; color:#eee;">
                                <span style="color:#2196F3; font-weight:bold; cursor:pointer;" class="msg-sender">@${m.from_name}</span> 
                                <span style="color:#aaa;">${iconText}</span>${targetTitle}
                            </div>
                            ${contentDiv}
                            <div style="font-size:10px; color:#777; margin-top:6px;">${new Date(m.created_at * 1000).toLocaleString()}</div>
                        </div>
                    `;
                    item.querySelector(".msg-sender").onclick = () => {
                        globalModal.closeTopModal();
                        openOtherUserProfileModal(m.from_user, currentUser);
                    };
                    list.appendChild(item);
                });
            }
            globalModal.openModal("🔔 消息与通知中心", list, {width: "550px"});
            
            if (res.unread_count > 0) {
                await api.markMessagesRead(currentUser.account);
                document.getElementById("unread-badge").style.display = "none";
            }
        } catch(e) { alert("获取消息失败: " + e.message); }
    };

    async function loadUnreadCount() {
        if (!currentUser) { document.getElementById("unread-badge").style.display = "none"; return; }
        try {
            const res = await api.getMessages(currentUser.account);
            const badge = document.getElementById("unread-badge");
            if (res.unread_count > 0) {
                badge.innerText = res.unread_count > 99 ? '99+' : res.unread_count;
                badge.style.display = "block";
            } else { badge.style.display = "none"; }
        } catch(e){}
    }

    const updateUserButtonState = () => {
        if (currentUser) {
            userActionBtn.innerHTML = `👤 ${currentUser.name}`;
            userActionBtn.style.backgroundColor = "#2196F3";
            userActionBtn.style.borderColor = "#2196F3";
            userActionBtn.onclick = () => openUserProfileModal(currentUser);
            loadUnreadCount(); 
        } else {
            userActionBtn.innerHTML = "🔑 登录 / 注册";
            userActionBtn.style.backgroundColor = "#333";
            userActionBtn.style.borderColor = "#555";
            userActionBtn.onclick = () => {
                showAuthModal(async (formData) => {
                    try {
                        userActionBtn.innerHTML = "⏳ 处理中...";
                        let userData; let token; let isRemember = false;
                        
                        if (formData.type === "reset") {
                            userActionBtn.innerHTML = "⏳ 修改密码中...";
                            await api.resetPassword(formData.account, formData.oldPassword, formData.newPassword);
                            alert("密码修改成功！请使用新密码重新登录。");
                            globalModal.closeTopModal(); updateUserButtonState(); return; 
                        }
                        if (formData.type === "register") {
                            if (formData.avatarFile) {
                                userActionBtn.innerHTML = "⏳ 上传头像中...";
                                try {
                                    const uploadRes = await api.uploadFile(formData.avatarFile, "avatar");
                                    formData.avatarDataUrl = uploadRes.url; 
                                } catch (uploadErr) {}
                            }
                            userActionBtn.innerHTML = "⏳ 注册账号中...";
                            await api.register(formData);
                            alert("注册成功！正在为您自动登录...");
                            const res = await api.login(formData.account, formData.password);
                            userData = { account: formData.account, name: formData.name, avatar: res.avatar, ...res }; 
                            token = res.token; isRemember = true; 
                        } else if (formData.type === "login") {
                            const res = await api.login(formData.account, formData.password);
                            userData = { account: formData.account, name: res.name, avatar: res.avatar, ...res }; 
                            token = res.token; isRemember = formData.remember;
                        }
                        
                        currentUser = userData;
                        const sessionData = JSON.stringify({ user: currentUser, expireAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
                        if (isRemember) { localStorage.setItem("ComfyCommunity_User", sessionData); localStorage.setItem("ComfyCommunity_Token", token); } 
                        else { sessionStorage.setItem("ComfyCommunity_User", sessionData); sessionStorage.setItem("ComfyCommunity_Token", token); }

                        globalModal.closeTopModal();
                        updateUserButtonState();
                    } catch (err) {
                        alert("操作失败: " + err.message); updateUserButtonState(); 
                    }
                });
            };
        }
    };
    
    updateUserButtonState();

    const actionWrapper = document.createElement("div");
    actionWrapper.style.display = "flex"; actionWrapper.style.alignItems = "center";
    actionWrapper.appendChild(bellBtn);
    actionWrapper.appendChild(userActionBtn);
    
    userHeader.appendChild(titleSpan);
    userHeader.appendChild(actionWrapper);

    return {
        dom: userHeader,
        getCurrentUser: () => currentUser
    };
}