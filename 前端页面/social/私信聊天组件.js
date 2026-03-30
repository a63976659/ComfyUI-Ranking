import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { CACHE } from "../core/全局配置.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t } from "../components/用户体验增强.js";

// 🚀 本地存储键管理
const getChatListKey = (account) => `${CACHE.LOCAL_KEYS.CHAT_LIST}_${account}`;
const getChatHistoryKey = (currentUser, targetAccount) => `${CACHE.LOCAL_KEYS.CHAT_HISTORY_PREFIX}${currentUser}_${targetAccount}`;
const getChatClearKey = (currentUser, targetAccount) => `${CACHE.LOCAL_KEYS.CHAT_CLEAR_PREFIX}${currentUser}_${targetAccount}`;
const getLastChatKey = (account) => `ComfyRanking_LastChat_${account}`;

export function openChatModal(currentUser, targetAccount = null) {
    const container = document.createElement("div");
    Object.assign(container.style, { display: "flex", flexDirection: "column", flex: "none", height: "1000px", boxSizing: "border-box", color: "#fff", background: "#1e1e1e", overflow: "hidden" });
    
    // 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移
    const topHeader = document.createElement("div");
    Object.assign(topHeader.style, { padding: "10px 15px", borderBottom: "1px solid #444", display: "flex", alignItems: "center", gap: "10px", background: "#2a2a2a" });
    topHeader.innerHTML = `
        <button id="btn-back-chat" style="margin-left: 15px; margin-top: 20px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
            <span style="font-size: 14px;">⬅</span> ${t('common.back')}
        </button>
        <span style="font-size: 16px; font-weight: bold; flex: 1;">💬 ${t('chat.title')}</span>
        <button id="btn-clear-chat-top" style="background: transparent; border: 1px solid #F44336; color: #F44336; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s; display: none;" onmouseover="this.style.background='#F44336'; this.style.color='#fff'" onmouseout="this.style.background='transparent'; this.style.color='#F44336'">🗑️ ${t('chat.clear_messages')}</button>
    `;
    topHeader.querySelector("#btn-back-chat").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
    container.appendChild(topHeader);
    
    const clearBtnTop = topHeader.querySelector("#btn-clear-chat-top");

    const mainArea = document.createElement("div");
    Object.assign(mainArea.style, { display: "flex", flex: 1, overflow: "hidden" });
    
    const leftPanel = document.createElement("div");
    Object.assign(leftPanel.style, { width: "250px", borderRight: "1px solid #444", border: "1px solid #444", borderTop: "none", display: "flex", flexDirection: "column", background: "#181818" });
    const chatListContainer = document.createElement("div");
    Object.assign(chatListContainer.style, { flex: 1, overflowY: "auto" });
    leftPanel.appendChild(chatListContainer);
    
    const rightPanel = document.createElement("div");
    Object.assign(rightPanel.style, { flex: 1, display: "flex", flexDirection: "column", background: "#1e1e1e" });
    
    const chatHeader = document.createElement("div");
    Object.assign(chatHeader.style, { padding: "15px", borderBottom: "1px solid #333", background: "#222", fontWeight: "bold", display: "flex", alignItems: "center" });
    
    const messagesArea = document.createElement("div");
    Object.assign(messagesArea.style, { flex: 1, padding: "15px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" });
    
    const inputArea = document.createElement("div");
    Object.assign(inputArea.style, { padding: "15px", borderTop: "1px solid #333", display: "flex", gap: "10px", background: "#222" });
    
    const inputField = document.createElement("input");
    Object.assign(inputField.style, { flex: 1, padding: "10px", borderRadius: "20px", border: "1px solid #555", background: "#333", color: "#fff", outline: "none" });
    inputField.placeholder = t('chat.input_placeholder');
    
    const sendBtn = document.createElement("button");
    Object.assign(sendBtn.style, { padding: "10px 20px", borderRadius: "20px", border: "none", background: "#2196F3", color: "#fff", cursor: "pointer", fontWeight: "bold" });
    sendBtn.innerText = t('common.send');
    
    inputArea.appendChild(inputField);
    inputArea.appendChild(sendBtn);
    
    rightPanel.appendChild(chatHeader);
    rightPanel.appendChild(messagesArea);
    rightPanel.appendChild(inputArea);
    
    mainArea.appendChild(leftPanel);
    mainArea.appendChild(rightPanel);
    container.appendChild(mainArea);

    let currentChatTarget = null;
    let currentTargetInfo = null;  // 🚀 新增：保存当前聊天对象的完整信息
    let autoRefreshTimer = null;
    
    // 🚀 新增：渲染对话列表（带头像）
    const renderChatList = (list) => {
        chatListContainer.innerHTML = "";
        if (list.length === 0) {
            chatListContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#888; font-size:12px;">${t('chat.no_conversations')}</div>`;
            return;
        }
        list.forEach(chat => {
            const acc = chat.target_account || chat.account || chat.receiver || chat.sender;
            const name = chat.target_name || chat.name || acc;
            const avatar = chat.avatar || chat.target_avatar || "https://via.placeholder.com/40/333/FFF?text=U";
            const lastMsg = chat.last_message || "";
            const unread = chat.unread_count || 0;

            const chatItem = document.createElement("div");
            Object.assign(chatItem.style, { 
                padding: "12px", borderBottom: "1px solid #333", cursor: "pointer", 
                transition: "0.2s", display: "flex", alignItems: "center", gap: "10px"
            });
            chatItem.onmouseover = () => chatItem.style.background = "#2a2a2a";
            chatItem.onmouseout = () => chatItem.style.background = currentChatTarget === acc ? "#333" : "transparent";
            
            // 高亮当前选中的对话
            if (currentChatTarget === acc) {
                chatItem.style.background = "#333";
            }
            
            chatItem.innerHTML = `
                <img src="${avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #555; flex-shrink: 0;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: bold; font-size: 13px; color: #fff;">${name}</div>
                        ${unread > 0 ? `<span style="background: #F44336; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px;">${unread}</span>` : ''}
                    </div>
                    <div style="font-size: 12px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${lastMsg || '@' + acc}</div>
                </div>
            `;
            chatItem.onclick = () => loadChatHistory(acc, name, avatar);
            chatListContainer.appendChild(chatItem);
        });
    };

    const loadChatList = async () => {
        const listCacheKey = getChatListKey(currentUser.account);
        
        // 🚀 新增：先从本地缓存读取，立即显示
        const cachedStr = localStorage.getItem(listCacheKey);
        if (cachedStr) {
            try {
                renderChatList(JSON.parse(cachedStr));
            } catch(e) {}
        }
        
        // 然后从云端同步最新数据
        try {
            const res = await api.getChatList(currentUser.account);
            const list = res.data || [];
            
            // 保存到本地缓存
            localStorage.setItem(listCacheKey, JSON.stringify(list));
            
            renderChatList(list);
        } catch(e) {}
    };

    const renderMsgs = (msgs, targetAvatar) => {
        messagesArea.innerHTML = "";
        const myAvatar = currentUser.avatar || currentUser.avatarDataUrl || "https://via.placeholder.com/36/2196F3/FFF?text=Me";
        const otherAvatar = targetAvatar || "https://via.placeholder.com/36/444/FFF?text=U";
        
        msgs.forEach(msg => {
            const isMe = msg.sender === currentUser.account;
            const bubbleWrap = document.createElement("div");
            Object.assign(bubbleWrap.style, { 
                display: "flex", 
                justifyContent: isMe ? "flex-end" : "flex-start",
                alignItems: "flex-end",
                gap: "8px",
                marginBottom: "4px"
            });
            
            // 🚀 新增：头像元素
            const avatarEl = document.createElement("img");
            Object.assign(avatarEl.style, { 
                width: "32px", height: "32px", borderRadius: "50%", 
                objectFit: "cover", border: "1px solid #555", flexShrink: "0",
                cursor: isMe ? "default" : "pointer"
            });
            avatarEl.src = isMe ? myAvatar : otherAvatar;
            avatarEl.title = isMe ? t('chat.me') : `${t('chat.view_profile')} ${currentTargetInfo?.name || currentChatTarget}`;
            
            // 🚀 新增：点击对方头像跳转个人资料
            if (!isMe) {
                avatarEl.onclick = (e) => {
                    e.stopPropagation();
                    openOtherUserProfileModal(currentChatTarget, currentUser);
                };
                avatarEl.onmouseover = () => avatarEl.style.transform = "scale(1.1)";
                avatarEl.onmouseout = () => avatarEl.style.transform = "scale(1)";
            }
            
            const bubble = document.createElement("div");
            Object.assign(bubble.style, { 
                maxWidth: "65%", padding: "10px 14px", borderRadius: "16px", 
                fontSize: "14px", lineHeight: "1.5", wordBreak: "break-word"
            });
            
            if (isMe) {
                Object.assign(bubble.style, { 
                    background: "linear-gradient(135deg, #2196F3, #1976D2)", 
                    color: "#fff", borderBottomRightRadius: "4px",
                    boxShadow: "0 2px 8px rgba(33, 150, 243, 0.3)"
                });
            } else {
                Object.assign(bubble.style, { 
                    background: "#3a3a3a", color: "#eee", 
                    borderBottomLeftRadius: "4px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                });
            }
            bubble.innerText = msg.content;
            
            // 根据是否是自己的消息调整布局顺序
            if (isMe) {
                bubbleWrap.appendChild(bubble);
                bubbleWrap.appendChild(avatarEl);
            } else {
                bubbleWrap.appendChild(avatarEl);
                bubbleWrap.appendChild(bubble);
            }
            
            messagesArea.appendChild(bubbleWrap);
        });
        setTimeout(() => messagesArea.scrollTop = messagesArea.scrollHeight, 50);
    };

    const loadChatHistory = async (targetAccount, targetName, targetAvatar) => {
        // 🚀 核心修复：防止 undefined 污染数据流
        if (!targetAccount || targetAccount === "undefined") return; 

        currentChatTarget = targetAccount;
        const displayName = targetName && targetName !== "undefined" ? targetName : targetAccount;
        const avatar = targetAvatar || "https://via.placeholder.com/40/444/FFF?text=U";
        
        // 🚀 新增：保存当前聊天对象信息
        currentTargetInfo = { account: targetAccount, name: displayName, avatar };
        
        // 🚀 新增：保存上次聊天对象，下次打开默认展开
        localStorage.setItem(getLastChatKey(currentUser.account), JSON.stringify(currentTargetInfo));

        chatHeader.innerHTML = `
            <img id="chat-target-avatar" src="${avatar}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #555; cursor: pointer; margin-right: 10px; transition: 0.2s;" title="点击查看个人资料">
            <div style="flex: 1;">
                <div style="font-weight: bold; font-size: 14px; color: #fff;">与 ${displayName} 聊天</div>
                <div style="font-size: 11px; color: #888;">@${targetAccount}</div>
            </div>
        `;
        
        // 🚀 显示顶部的清空消息按钮
        clearBtnTop.style.display = "block";
        
        // 🚀 新增：点击头像跳转个人资料
        const avatarEl = chatHeader.querySelector("#chat-target-avatar");
        avatarEl.onclick = () => openOtherUserProfileModal(targetAccount, currentUser);
        avatarEl.onmouseover = () => avatarEl.style.transform = "scale(1.1)";
        avatarEl.onmouseout = () => avatarEl.style.transform = "scale(1)";

        const cacheKey = getChatHistoryKey(currentUser.account, targetAccount);
        const clearKey = getChatClearKey(currentUser.account, targetAccount);
        
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) { try { renderMsgs(JSON.parse(cachedStr), avatar); } catch(e){} }
        
        try {
            const res = await api.getChatHistory(currentUser.account, targetAccount);
            const cloudMsgs = res.data || [];
            
            const clearTimeStr = localStorage.getItem(clearKey);
            const clearTime = clearTimeStr ? parseInt(clearTimeStr) : 0;
            
            let localMsgs = [];
            if (cachedStr) { try { localMsgs = JSON.parse(cachedStr); } catch(e){} }
            
            const map = new Map();
            localMsgs.forEach(m => {
                if (!m.id) m.id = "local_" + Math.random();
                map.set(m.id, m);
            });
            cloudMsgs.forEach(m => {
                const mTime = m.created_at ? (m.created_at * 1000) : 0;
                if (mTime > clearTime) { map.set(m.id, m); }
            });
            
            const merged = Array.from(map.values()).sort((a, b) => a.created_at - b.created_at);
            localStorage.setItem(cacheKey, JSON.stringify(merged));
            renderMsgs(merged, avatar);
        } catch(e) {}

        // 🚀 绑定顶部清空消息按钮事件
        clearBtnTop.onclick = async () => {
            if (await showConfirm("确定要清空与该用户的本地聊天记录吗？")) {
                localStorage.setItem(clearKey, Date.now().toString());
                localStorage.setItem(cacheKey, "[]");
                renderMsgs([], avatar);
                showToast("消息已清空", "success");
            }
        };
    }
    
    sendBtn.onclick = async () => {
        const txt = inputField.value.trim();
        if (!txt || !currentChatTarget) return;
        sendBtn.disabled = true; sendBtn.innerText = "✉️";
        try {
            await api.sendPrivateMessage(currentUser.account, currentChatTarget, txt);
            inputField.value = "";
            loadChatHistory(currentChatTarget, currentTargetInfo?.name, currentTargetInfo?.avatar); 
            loadChatList(); 
        } catch(e) { showToast("发送失败: " + e.message, "error"); }
        sendBtn.disabled = false; sendBtn.innerText = "发送";
    };
    
    // 🚀 新增：支持 Enter 键发送
    inputField.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };
    
    loadChatList();
    
    // 🚀 新增：默认展开上次的对话
    if (targetAccount) {
        loadChatHistory(targetAccount, targetAccount, null);
    } else {
        // 尝试加载上次聊天对象
        const lastChatStr = localStorage.getItem(getLastChatKey(currentUser.account));
        if (lastChatStr) {
            try {
                const lastChat = JSON.parse(lastChatStr);
                if (lastChat.account) {
                    loadChatHistory(lastChat.account, lastChat.name, lastChat.avatar);
                }
            } catch(e) {}
        }
    }
    
    container.addEventListener("DOMNodeRemovedFromDocument", () => {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    });

    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: container } }));
}