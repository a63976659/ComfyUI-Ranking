// 前端页面/social/通知中心组件.js
import { api } from "../core/网络请求API.js";
import { openChatModal } from "./私信聊天组件.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";

export async function openNotificationCenter(currentUser, bellBtn) {
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
}

export async function loadUnreadCount(currentUser, bellBtn) {
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