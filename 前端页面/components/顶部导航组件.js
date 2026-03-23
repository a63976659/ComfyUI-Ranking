import { createAuthView } from "../auth/用户注册登录组件.js";
import { openUserProfileModal, openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { openChatModal } from "../social/私信聊天组件.js";
import { api } from "../core/网络请求API.js"; 
import { showToast, showConfirm } from "./UI交互提示组件.js";

export function createTopNav() {
    const userHeader = document.createElement("div");
    Object.assign(userHeader.style, {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "15px 10px", backgroundColor: "#1a1a1a", borderBottom: "1px solid #333"
    });

    const titleSpan = document.createElement("div");
    titleSpan.innerHTML = "<strong style='color:#4CAF50;'>ComfyUI</strong> 社区精选";
    
    Object.assign(titleSpan.style, { fontSize: "16px", cursor: "pointer", transition: "opacity 0.2s" });
    titleSpan.title = "查看关于本插件与作者信息";
    titleSpan.onmouseover = () => titleSpan.style.opacity = "0.8";
    titleSpan.onmouseout = () => titleSpan.style.opacity = "1";
    titleSpan.onclick = () => {
        const aboutData = {
            author: "666666",
            title: "ComfyUI 社区精选 (Community Hub)",
            fullDesc: "ComfyUI 社区精选是一款专为 ComfyUI 打造的现代化、Web3.0 级别生态引擎，致力于聚合全网优质的插件、应用与工作流，让节点的获取与分享变得前所未有地简单。\n\n✨ 核心优势：\n1. 原生与无感融合：采用 ComfyUI V3 标准机制，零侵入保护工作流心流。\n2. 零延时体验：引入现代前端 SWR 缓存策略，告别白屏等待。\n3. 全局即时通讯：内置私信与系统通知，打破信息孤岛。\n4. 沙盒化交互：严格的事件防穿透机制，全方位保护底层画布安全。"
        };
        window.dispatchEvent(new CustomEvent("comfy-open-detail", { detail: { itemData: aboutData, currentUser } }));
    };

    const userActionBtn = document.createElement("button");
    Object.assign(userActionBtn.style, { padding: "6px 12px", backgroundColor: "#333", color: "#fff", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", fontSize: "12px", transition: "background 0.2s" });

    const chatEntryBtn = document.createElement("button");
    Object.assign(chatEntryBtn.style, { background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "18px", marginRight: "10px", transition: "0.2s" });
    chatEntryBtn.innerHTML = `✉️`;
    chatEntryBtn.title = "打开私信聊天中心";

    const bellBtn = document.createElement("button");
    Object.assign(bellBtn.style, { background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "18px", position: "relative", marginRight: "15px" });
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

    window.addEventListener("comfy-user-logout", () => { currentUser = null; updateUserButtonState(); });

    chatEntryBtn.onclick = () => {
        if (!currentUser) return showToast("请先登录您的社区账号！", "warning");
        openChatModal(currentUser);
    };

    bellBtn.onclick = async () => {
        if (!currentUser) return showToast("请先登录您的社区账号查看消息！", "warning");
        
        const outerBox = document.createElement("div");
        Object.assign(outerBox.style, { flex: "none", height: "1220px", boxSizing: "border-box", overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", background: "var(--bg-color, #202020)" });
        
        const header = document.createElement("div");
        header.innerHTML = `
            <button id="btn-back-notif" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 15px; width: fit-content; transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#333'; this.style.borderColor='#555'">
    <span style="font-size: 14px;">⬅</span> 返回列表
</button>
            <div style="font-weight:bold; font-size:16px; margin-bottom:15px; color:#fff;">🔔 消息与通知中心</div>
        `;
        header.querySelector("#btn-back-notif").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
        outerBox.appendChild(header);

        const list = document.createElement("div");
        list.style.display = "flex"; list.style.flexDirection = "column"; list.style.gap = "10px";

        const clearBtn = document.createElement("button");
        Object.assign(clearBtn.style, { width: "100%", marginBottom: "15px", padding: "8px", background: "transparent", border: "1px dashed #555", color: "#aaa", borderRadius: "4px", cursor: "pointer" });
        clearBtn.innerText = "🗑️ 清空所有本地通知";
        outerBox.appendChild(clearBtn); outerBox.appendChild(list);

        const cacheKey = `LocalMsgs_${currentUser.account}`;
        const clearKey = `ClearedMsgsAt_${currentUser.account}`;
        let clearTime = parseInt(localStorage.getItem(clearKey) || "0");
        let localMsgs = JSON.parse(localStorage.getItem(cacheKey) || "[]");

        const renderMsgList = (msgs) => {
            list.innerHTML = "";
            if (msgs.length === 0) { list.innerHTML = "<div style='text-align:center; padding: 30px; color:#888;'>暂无新消息</div>"; return; }
            msgs.forEach(m => {
                const item = document.createElement("div");
                item.style.padding = "10px"; item.style.background = m.is_read ? "#2a2a2a" : "rgba(33, 150, 243, 0.1)";
                item.style.borderRadius = "6px"; item.style.border = "1px solid #444"; item.style.display = "flex"; item.style.gap = "12px"; item.style.alignItems = "flex-start";
                
                let iconText = "";
                if (m.type === "like") iconText = "👍 赞了你的作品"; else if (m.type === "favorite") iconText = "⭐ 收藏了你的作品";
                else if (m.type === "comment") iconText = "💬 评论了你"; else if (m.type === "reply") iconText = "💬 回复了你";
                else if (m.type === "follow") iconText = "👥 关注了你"; else if (m.type === "private") iconText = "✉️ 发来一条私信";

                const targetTitle = m.target_item_title ? ` <span style='color:#4CAF50;'>[${m.target_item_title}]</span>` : "";
                const contentDiv = m.content ? `<div style="margin-top:6px; background:#1e1e1e; padding:8px; border-radius:4px; font-size:12px; color:#ccc; border-left:3px solid #555; word-break:break-all;">${m.content}</div>` : "";
                const avatarSrc = m.from_avatar || "https://via.placeholder.com/150";

                item.innerHTML = `
                    <img src="${avatarSrc}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border: 1px solid #555;">
                    <div style="flex:1;">
                        <div style="font-size:13px; color:#eee;"><span style="color:#2196F3; font-weight:bold; cursor:pointer;" class="msg-sender">@${m.from_name}</span> <span style="color:#aaa; cursor:pointer;" class="msg-content-trigger">${iconText}</span>${targetTitle}</div>
                        ${contentDiv}
                        <div style="font-size:10px; color:#777; margin-top:6px;">${new Date(m.created_at * 1000).toLocaleString()}</div>
                    </div>
                `;
                const handleJump = () => {
                    if (m.type === "private") openChatModal(currentUser, m.from_user);
                    else openOtherUserProfileModal(m.from_user, currentUser);
                };
                item.querySelector(".msg-sender").onclick = handleJump;
                item.querySelector(".msg-content-trigger").onclick = handleJump;
                list.appendChild(item);
            });
        };

        renderMsgList(localMsgs); 
        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: outerBox } }));

        try {
            const res = await api.getMessages(currentUser.account);
            const remoteMsgs = res.data || [];
            const map = new Map();
            localMsgs.forEach(m => map.set(m.id, m));
            remoteMsgs.forEach(m => { if (m.created_at * 1000 > clearTime) map.set(m.id, m); });
            
            const merged = Array.from(map.values()).sort((a, b) => b.created_at - a.created_at);
            localStorage.setItem(cacheKey, JSON.stringify(merged));
            renderMsgList(merged);

            if (res.unread_count > 0) {
                await api.markMessagesRead(currentUser.account);
                bellBtn.querySelector("#unread-badge").style.display = "none";
            }
        } catch(e) {}

        clearBtn.onclick = async () => {
            if (await showConfirm("确定要清空本地的所有通知记录吗？云端7天前的记录不会再同步下来。")) {
                localStorage.setItem(clearKey, Date.now().toString());
                localStorage.setItem(cacheKey, "[]");
                renderMsgList([]);
                showToast("通知已清空", "success");
            }
        };
    };

    async function loadUnreadCount() {
        if (!currentUser) { bellBtn.querySelector("#unread-badge").style.display = "none"; return; }
        try {
            const res = await api.getMessages(currentUser.account);
            const badge = bellBtn.querySelector("#unread-badge");
            if (res.unread_count > 0) {
                badge.innerText = res.unread_count > 99 ? '99+' : res.unread_count;
                badge.style.display = "block";
            } else { badge.style.display = "none"; }
        } catch(e){}
    }

    const updateUserButtonState = () => {
        if (currentUser) {
            userActionBtn.innerHTML = `👤 ${currentUser.name || currentUser.account || '未知用户'}`;
            userActionBtn.style.backgroundColor = "#2196F3";
            userActionBtn.style.borderColor = "#2196F3";
            userActionBtn.onclick = () => openUserProfileModal(currentUser);
            loadUnreadCount(); 
        } else {
            userActionBtn.innerHTML = "🔑 登录 / 注册";
            userActionBtn.style.backgroundColor = "#333";
            userActionBtn.style.borderColor = "#555";
            bellBtn.querySelector("#unread-badge").style.display = "none";
            
            userActionBtn.onclick = () => {
                const view = createAuthView(async (formData) => {
                    try {
                        userActionBtn.innerHTML = "⏳ 处理中...";
                        let userData; let token; let isRemember = false;
                        
                        if (formData.type === "reset") {
                            userActionBtn.innerHTML = "⏳ 修改密码中...";
                            // 【核心修复】：追加了完整传递过来的 verifyContact 和 verifyType 参数
                            await api.resetPassword(formData.account, formData.oldPassword, formData.newPassword, formData.verifyContact, formData.verifyType);
                            showToast("密码修改成功！请使用新密码重新登录。", "success");
                            window.dispatchEvent(new CustomEvent("comfy-route-back")); updateUserButtonState(); return; 
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
                            showToast("注册成功！正在为您自动登录...", "success");
                            const res = await api.login(formData.account, formData.password);
                            userData = { account: formData.account, name: formData.name, avatar: res.avatar, ...res }; 
                            token = res.token; isRemember = true; 
                        } else if (formData.type === "login") {
                            const res = await api.login(formData.account, formData.password);
                            token = res.token; isRemember = formData.remember;
                            try {
                                if (isRemember) localStorage.setItem("ComfyCommunity_Token", token); 
                                else sessionStorage.setItem("ComfyCommunity_Token", token);
                                const profileRes = await api.getUserProfile(formData.account);
                                userData = { account: formData.account, ...profileRes.data };
                            } catch (e) {
                                userData = { account: formData.account, name: res.name || res.data?.name || formData.account, avatar: res.avatar || res.data?.avatar };
                            }
                            showToast("登录成功！", "success");
                        }
                        
                        currentUser = userData;
                        const sessionData = JSON.stringify({ user: currentUser, expireAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
                        if (isRemember) { localStorage.setItem("ComfyCommunity_User", sessionData); localStorage.setItem("ComfyCommunity_Token", token); } 
                        else { sessionStorage.setItem("ComfyCommunity_User", sessionData); sessionStorage.setItem("ComfyCommunity_Token", token); }

                        window.dispatchEvent(new CustomEvent("comfy-route-back"));
                        updateUserButtonState();
                        window.dispatchEvent(new CustomEvent("comfy-user-login")); 
                    } catch (err) {
                        showToast("操作失败: " + err.message, "error"); updateUserButtonState(); 
                    }
                });
                window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
            };
        }
    };
    
    updateUserButtonState();

    const actionWrapper = document.createElement("div");
    actionWrapper.style.display = "flex"; actionWrapper.style.alignItems = "center";
    actionWrapper.appendChild(chatEntryBtn); 
    actionWrapper.appendChild(bellBtn);
    actionWrapper.appendChild(userActionBtn);
    
    userHeader.appendChild(titleSpan);
    userHeader.appendChild(actionWrapper);

    return {
        dom: userHeader,
        getCurrentUser: () => currentUser
    };
}