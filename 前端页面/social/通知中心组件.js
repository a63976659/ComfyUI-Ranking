// 前端页面/social/通知中心组件.js
import { api } from "../core/网络请求API.js";
import { request } from "../core/网络请求_基础设施.js";
import { openChatModal } from "./私信聊天组件.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { CACHE, PLACEHOLDERS } from "../core/全局配置.js";
import { t } from "../components/用户体验增强.js";

// 🚀 本地存储键管理
const getNotifCacheKey = (account) => `${CACHE.LOCAL_KEYS.NOTIFICATIONS}_${account}`;
const getNotifClearKey = (account) => `${CACHE.LOCAL_KEYS.NOTIF_CLEAR_TIME}_${account}`;

export async function openNotificationCenter(currentUser, bellBtn) {
    if (!currentUser) return showToast(t('notif.login_required'), "warning");
    
    const outerBox = document.createElement("div");
    Object.assign(outerBox.style, { flex: "none", height: "1220px", boxSizing: "border-box", overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", background: "var(--bg-color, #202020)" });
    
    const header = document.createElement("div");
    header.innerHTML = `
        <button id="btn-back-notif" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin-bottom: 15px; width: fit-content; transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
            <span style="font-size: 14px;">⬅</span> ${t('common.back')}
        </button>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 10px;">
            <div style="font-size: 16px; font-weight: bold; color: #fff;">🔔 ${t('notif.title')}</div>
            <button id="btn-clear-notif" style="background: transparent; border: 1px solid #555; color: #aaa; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#F44336'; this.style.color='#fff'; this.style.borderColor='#F44336'" onmouseout="this.style.background='transparent'; this.style.color='#aaa'; this.style.borderColor='#555'">${t('notif.clear')}</button>
        </div>
    `;
    
    const listArea = document.createElement("div");
    Object.assign(listArea.style, { display: "flex", flexDirection: "column", gap: "10px" });
    
    const cacheKey = getNotifCacheKey(currentUser.account);
    const clearKey = getNotifClearKey(currentUser.account);
    const cachedStr = localStorage.getItem(cacheKey);
    const clearTime = parseInt(localStorage.getItem(clearKey) || "0");
    
    outerBox.appendChild(header);
    outerBox.appendChild(listArea);
    
    header.querySelector("#btn-back-notif").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
    const clearBtn = header.querySelector("#btn-clear-notif");

    const renderMsgList = (msgs) => {
        listArea.innerHTML = "";
        if (msgs.length === 0) {
            listArea.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>${t('notif.no_messages')}</div>`;
            return;
        }
        
        let html = "";
        msgs.forEach(msg => {
            const isUnread = !msg.is_read;
            // 【核心新增】：判断是否为系统公告
            const isSystem = msg.type === "system";
            
            // 系统公告使用尊贵的橙色/金色 UI 边框，普通消息使用默认颜色
            // 插件更新通知使用蓝色主题
            let bg = isUnread ? "rgba(76, 175, 80, 0.1)" : "#2a2a2a";
            let border = isUnread ? "1px solid #4CAF50" : "1px solid #444";
            
            if (isSystem) {
                bg = isUnread ? "rgba(255, 152, 0, 0.15)" : "rgba(255, 152, 0, 0.05)";
                border = isUnread ? "1px solid #FF9800" : "1px solid #886020";
            } else if (msg.type === "plugin_update") {
                bg = isUnread ? "rgba(33, 150, 243, 0.15)" : "rgba(33, 150, 243, 0.05)";
                border = isUnread ? "1px solid #2196F3" : "1px solid #1a5a8a";
            }
            
            let actionText = "";
            if (msg.type === "private") actionText = t('notif.private_msg');
            else if (msg.type === "follow") actionText = t('notif.followed_you');
            else if (msg.type === "like") actionText = `${t('notif.liked')} <span style="color:#4CAF50;">[${msg.target_item_title}]</span>`;
            else if (msg.type === "favorite") actionText = `${t('notif.favorited')} <span style="color:#2196F3;">[${msg.target_item_title}]</span>`;
            else if (msg.type === "comment") actionText = `${t('notif.commented_on')} <span style="color:#FF9800;">[${msg.target_item_title}]</span>：<br><span style="color:#ccc;">${msg.content}</span>`;
            else if (msg.type === "purchase") actionText = `${t('notif.purchased')} <span style="color:#E91E63;">[${msg.target_item_title}]</span>${t('notif.income_received')}`;
            else if (msg.type === "tip") actionText = `${t('notif.tipped_you')}<br><span style="color:#FF9800;">"${msg.content}"</span>`;
            // 任务榥通知
            else if (msg.type === "task_apply") actionText = `<span style="color:#FF9800;">🙋</span> ${msg.content || t('notif.task_apply')}`;
            else if (msg.type === "task_assigned") actionText = `<span style="color:#4CAF50;">🎯</span> ${msg.content || t('notif.task_assigned')}`;
            else if (msg.type === "task_submitted") actionText = `<span style="color:#2196F3;">📤</span> ${msg.content || t('notif.task_submitted')}`;
            else if (msg.type === "task_completed") actionText = `<span style="color:#4CAF50;">✅</span> ${msg.content || t('notif.task_completed')}`;
            else if (msg.type === "task_rejected") actionText = `<span style="color:#F44336;">❌</span> ${msg.content || t('notif.task_rejected')}`;
            // 申诉仲裁通知
            else if (msg.type === "task_disputed") actionText = `<span style="color:#F44336;">⚖️</span> ${msg.content || t('notif.task_disputed')}`;
            else if (msg.type === "dispute_responded") actionText = `<span style="color:#2196F3;">💬</span> ${msg.content || t('notif.dispute_responded')}`;
            else if (msg.type === "dispute_resolved") actionText = `<span style="color:#9C27B0;">🔨</span> ${msg.content || t('notif.dispute_resolved')}`;
            // 【核心新增】：系统公告的正文排版，保留原格式的换行
            else if (isSystem) actionText = `<div style="margin-top: 6px; color: #eee; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${msg.content}</div>`;
            // 【核心新增】：插件更新通知
            else if (msg.type === "plugin_update") actionText = `${t('notif.plugin_update')} <span style="color:#2196F3;">[${msg.target_item_title}]</span>，${t('notif.click_to_view')}`;
            
            const timeStr = new Date(msg.created_at * 1000).toLocaleString();
            
            // 【核心新增】：如果是系统消息，增加 📢 标签并改变标题颜色
            // 插件更新通知使用 📦 图标
            let nameLabel;
            if (isSystem) {
                nameLabel = `<strong style="color: #FF9800; font-size: 15px;">📢 [${t('notif.system_announcement')}] ${msg.from_name}</strong>`;
            } else if (msg.type === "plugin_update") {
                nameLabel = `<strong style="color: #2196F3; font-size: 15px;">📦 [${t('notif.plugin_update_title')}] ${msg.from_name}</strong>`;
            } else {
                nameLabel = `<strong style="color: #fff;">${msg.from_name}</strong>`;
            }
            
            html += `
                <div class="notif-item" data-account="${msg.from_user}" data-type="${msg.type}" data-item-id="${msg.target_item_id || ''}" style="padding: 12px; border-radius: 8px; background: ${bg}; border: ${border}; display: flex; gap: 12px; align-items: flex-start; cursor: pointer; transition: 0.2s;" onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'">
                    <img src="${msg.from_avatar || PLACEHOLDERS.AVATAR}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid #555;">
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
                const itemId = item.dataset.itemId;
                
                // 【核心新增】：系统公告点击不跳转，只触发消除红点
                if (type === "system") return; 
                
                // 📦 插件更新通知：跳转到插件详情页
                if (type === "plugin_update" && itemId) {
                    import("../market/资源详情页面组件.js").then(async module => {
                        try {
                            // 先获取完整的 itemData 对象
                            const res = await api.getItemById(itemId);
                            if (res.status === "success" && res.data) {
                                const view = module.createItemDetailView(res.data, currentUser);
                                window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
                            } else {
                                showToast(t('notif.item_not_found'), "error");
                            }
                        } catch (e) {
                            console.error("获取资源详情失败:", e);
                            showToast(t('notif.load_item_failed'), "error");
                        }
                    });
                    return;
                }
                
                // 📝 任务榜通知：跳转到任务详情
                if (type.startsWith("task_") && itemId) {
                    import("../task/任务详情组件.js").then(module => {
                        const view = module.createTaskDetailView(itemId, currentUser);
                        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
                    });
                    return;
                }
                
                // ⚖️ 申诉通知：跳转到任务详情（包含申诉入口）
                if ((type === "dispute_responded" || type === "dispute_resolved") && itemId) {
                    import("../task/任务详情组件.js").then(module => {
                        const view = module.createTaskDetailView(itemId, currentUser);
                        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
                    });
                    return;
                }
                
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
        remoteMsgs.forEach(m => { 
            if (m.created_at * 1000 > clearTime) {
                // 🔥 修复：保留本地已读标记，防止云端数据覆盖
                const existing = map.get(m.id);
                if (existing && existing.is_read && !m.is_read) {
                    m.is_read = true;
                }
                map.set(m.id, m);
            }
        });
        
        const merged = Array.from(map.values()).sort((a, b) => b.created_at - a.created_at);
        localStorage.setItem(cacheKey, JSON.stringify(merged));
        renderMsgList(merged);

        if (res.unread_count > 0) {
            await api.markMessagesRead(currentUser.account);
            bellBtn.querySelector("#unread-badge").style.display = "none";
        }
    } catch(e) {}

    clearBtn.onclick = async () => {
        if (await showConfirm(t('notif.clear_confirm'))) {
            localStorage.setItem(clearKey, Date.now().toString());
            localStorage.setItem(cacheKey, "[]");
            renderMsgList([]);
            showToast(t('notif.cleared'), "success");
        }
    };
    
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: outerBox } }));
}

export async function loadUnreadCount(currentUser, bellBtn) {
    if (!currentUser) { bellBtn.querySelector("#unread-badge").style.display = "none"; return; }
    try {
        // 🔥 修复：使用 count_only=true 参数，只获取未读数，不标记已读
        const res = await request(`/api/messages/${currentUser.account}?count_only=true`);
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