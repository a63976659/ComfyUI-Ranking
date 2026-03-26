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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 10px;">
            <div style="font-size: 16px; font-weight: bold; color: #fff;">🔔 消息与通知</div>
            <button id="btn-clear-notif" style="background: transparent; border: 1px solid #555; color: #aaa; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#F44336'; this.style.color='#fff'; this.style.borderColor='#F44336'" onmouseout="this.style.background='transparent'; this.style.color='#aaa'; this.style.borderColor='#555'">清空记录</button>
        </div>
    `;
    
    const listArea = document.createElement("div");
    Object.assign(listArea.style, { display: "flex", flexDirection: "column", gap: "10px" });
    
    const cacheKey = `ComfyCommunity_NotifCache_${currentUser.account}`;
    const clearKey = `ComfyCommunity_NotifClearTime_${currentUser.account}`;
    const cachedStr = localStorage.getItem(cacheKey);
    const clearTime = parseInt(localStorage.getItem(clearKey) || "0");
    
    outerBox.appendChild(header);
    outerBox.appendChild(listArea);
    
    header.querySelector("#btn-back-notif").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
    const clearBtn = header.querySelector("#btn-clear-notif");

    const renderMsgList = (msgs) => {
        listArea.innerHTML = "";
        if (msgs.length === 0) {
            listArea.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>暂无任何消息通知</div>`;
            return;
        }
        
        let html = "";
        msgs.forEach(msg => {
            const isUnread = !msg.is_read;
            // 【核心新增】：判断是否为系统公告
            const isSystem = msg.type === "system";
            
            // 系统公告使用尊贵的橙色/金色 UI 边框，普通消息使用默认颜色
            let bg = isUnread ? "rgba(76, 175, 80, 0.1)" : "#2a2a2a";
            let border = isUnread ? "1px solid #4CAF50" : "1px solid #444";
            
            if (isSystem) {
                bg = isUnread ? "rgba(255, 152, 0, 0.15)" : "rgba(255, 152, 0, 0.05)";
                border = isUnread ? "1px solid #FF9800" : "1px solid #886020";
            }
            
            let actionText = "";
            if (msg.type === "private") actionText = "给您发送了私信";
            else if (msg.type === "follow") actionText = "关注了您";
            else if (msg.type === "like") actionText = `点赞了您的作品 <span style="color:#4CAF50;">[${msg.target_item_title}]</span>`;
            else if (msg.type === "favorite") actionText = `收藏了您的作品 <span style="color:#2196F3;">[${msg.target_item_title}]</span>`;
            else if (msg.type === "comment") actionText = `在 <span style="color:#FF9800;">[${msg.target_item_title}]</span> 中回复了您：<br><span style="color:#ccc;">${msg.content}</span>`;
            else if (msg.type === "purchase") actionText = `购买了您的作品 <span style="color:#E91E63;">[${msg.target_item_title}]</span>，收益已入账！`;
            else if (msg.type === "tip") actionText = `打赏了您！<br><span style="color:#FF9800;">“${msg.content}”</span>`;
            // 【核心新增】：系统公告的正文排版，保留原格式的换行
            else if (isSystem) actionText = `<div style="margin-top: 6px; color: #eee; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${msg.content}</div>`;
            
            const timeStr = new Date(msg.created_at * 1000).toLocaleString();
            
            // 【核心新增】：如果是系统消息，增加 📢 标签并改变标题颜色
            const nameLabel = isSystem 
                ? `<strong style="color: #FF9800; font-size: 15px;">📢 [系统公告] ${msg.from_name}</strong>` 
                : `<strong style="color: #fff;">${msg.from_name}</strong>`;
            
            html += `
                <div class="notif-item" data-account="${msg.from_user}" data-type="${msg.type}" style="padding: 12px; border-radius: 8px; background: ${bg}; border: ${border}; display: flex; gap: 12px; align-items: flex-start; cursor: pointer; transition: 0.2s;" onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'">
                    <img src="${msg.from_avatar || 'https://via.placeholder.com/150'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid #555;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            ${nameLabel}
                            <span style="font-size: 11px; color: #888;">${timeStr}</span>
                        </div>
                        <div style="color: #ccc; font-size: 13px; line-height: 1.4;">${actionText}</div>
                    </div>
                </div>
            `;
        });
        listArea.innerHTML = html;
        
        listArea.querySelectorAll(".notif-item").forEach(item => {
            item.onclick = () => {
                const acc = item.dataset.account;
                const type = item.dataset.type;
                
                // 【核心新增】：系统公告点击不跳转，只触发消除红点
                if (type === "system") return; 
                
                if (type === "private") openChatModal(currentUser, acc);
                else openOtherUserProfileModal(acc, currentUser);
            };
        });
    };

    if (cachedStr) {
        try { renderMsgList(JSON.parse(cachedStr)); } catch(e) {}
    }

    try {
        const res = await api.getMessages(currentUser.account);
        const localMsgs = cachedStr ? JSON.parse(cachedStr) : [];
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
    
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: outerBox } }));
}

export async function loadUnreadCount(currentUser, bellBtn) {
    if (!currentUser) { bellBtn.querySelector("#unread-badge").style.display = "none"; return; }
    try {
        const res = await api.getMessages(currentUser.account);
        const unreadCount = res.unread_count || 0;
        const badge = bellBtn.querySelector("#unread-badge");
        if (unreadCount > 0) {
            badge.innerText = unreadCount > 99 ? "99+" : unreadCount;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    } catch(e) {
        bellBtn.querySelector("#unread-badge").style.display = "none";
    }
}