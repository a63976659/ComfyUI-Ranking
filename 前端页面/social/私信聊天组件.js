import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { CACHE, PLACEHOLDERS } from "../core/全局配置.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t } from "../components/用户体验增强.js";

// 🔒 XSS防护：对用户可控字段进行 HTML 转义
const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

// 🚀 本地存储键管理
const getChatListKey = (account) => `${CACHE.LOCAL_KEYS.CHAT_LIST}_${account}`;
const getChatHistoryKey = (currentUser, targetAccount) => `${CACHE.LOCAL_KEYS.CHAT_HISTORY_PREFIX}${currentUser}_${targetAccount}`;
const getChatClearKey = (currentUser, targetAccount) => `${CACHE.LOCAL_KEYS.CHAT_CLEAR_PREFIX}${currentUser}_${targetAccount}`;
const getLastChatKey = (account) => `ComfyRanking_LastChat_${account}`;
// 🚀 P1-4: 草稿 localStorage 键
const getDraftKey = (userAccount, targetAccount) => `ComfyRanking_Draft_${userAccount}_${targetAccount}`;

// 🚀 P1-5: 相对时间格式化
const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const now = Date.now();
    const msgTime = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const diff = now - msgTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return t('chat.time_just_now') || '刚刚';
    if (minutes < 60) return `${minutes}${t('chat.time_min_ago') || '分钟前'}`;
    if (hours < 24) return `${hours}${t('chat.time_hour_ago') || '小时前'}`;
    if (days < 7) return `${days}${t('chat.time_day_ago') || '天前'}`;
    const date = new Date(msgTime);
    return `${date.getMonth() + 1}${t('chat.date_month') || '月'}${date.getDate()}${t('chat.date_day') || '日'} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
};
// 🚀 P1-5: 超过5分钟则显示时间分隔符
const TIME_GAP_THRESHOLD = 5 * 60; // 秒
const shouldShowTimeSeparator = (prevMsg, currMsg) => {
    if (!prevMsg || !prevMsg.created_at || !currMsg.created_at) return false;
    const prev = prevMsg.created_at < 1e12 ? prevMsg.created_at : prevMsg.created_at / 1000;
    const curr = currMsg.created_at < 1e12 ? currMsg.created_at : currMsg.created_at / 1000;
    return (curr - prev) > TIME_GAP_THRESHOLD;
};

export function openChatModal(currentUser, targetAccount = null) {
    const container = document.createElement("div");
    Object.assign(container.style, { display: "flex", flexDirection: "column", flex: "none", height: "1000px", boxSizing: "border-box", color: "#fff", background: "var(--comfy-menu-bg)", overflow: "hidden" });
    
    // 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移
    const topHeader = document.createElement("div");
    Object.assign(topHeader.style, { padding: "10px 15px", borderBottom: "1px solid #444", display: "flex", alignItems: "center", gap: "10px", background: "var(--comfy-input-bg)" });
    topHeader.innerHTML = `
        <button id="btn-back-chat" style="margin-left: 15px; margin-top: 20px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
            ⬅ ${t('common.back')}
        </button>
        <span style="font-size: 16px; font-weight: bold; flex: 1;">💬 ${t('chat.title')}</span>
        <button id="btn-clear-chat-top" style="background: transparent; border: 1px solid #F44336; color: #F44336; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s; display: none;" onmouseover="this.style.background='#F44336'; this.style.color='#fff'" onmouseout="this.style.background='transparent'; this.style.color='#F44336'"></button>
    `;
    // 🚀 P2-3: 统一的清理函数
    const cleanup = () => {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        saveDraft();
    };

    topHeader.querySelector("#btn-back-chat").onclick = () => {
        cleanup();
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    container.appendChild(topHeader);
    
    const clearBtnTop = topHeader.querySelector("#btn-clear-chat-top");
    clearBtnTop.innerHTML = "🗑️ " + t('chat.clear_messages');

    const mainArea = document.createElement("div");
    Object.assign(mainArea.style, { display: "flex", flex: 1, overflow: "hidden" });
    
    const leftPanel = document.createElement("div");
    Object.assign(leftPanel.style, { width: "250px", borderRight: "1px solid #444", border: "1px solid #444", borderTop: "none", display: "flex", flexDirection: "column", background: "#181818" });
    const chatListContainer = document.createElement("div");
    Object.assign(chatListContainer.style, { flex: 1, overflowY: "auto" });
    leftPanel.appendChild(chatListContainer);
    
    const rightPanel = document.createElement("div");
    Object.assign(rightPanel.style, { flex: 1, display: "flex", flexDirection: "column", background: "var(--comfy-menu-bg)" });
    
    const chatHeader = document.createElement("div");
    Object.assign(chatHeader.style, { padding: "15px", borderBottom: "1px solid var(--border-color, #333)", background: "#222", fontWeight: "bold", display: "flex", alignItems: "center" });
    
    const messagesArea = document.createElement("div");
    Object.assign(messagesArea.style, { flex: 1, padding: "15px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" });
    
    const inputArea = document.createElement("div");
    Object.assign(inputArea.style, { padding: "15px", borderTop: "1px solid var(--border-color, #333)", display: "flex", gap: "10px", background: "#222" });
    
    // 🚀 P1-2: 改为 textarea，支持多行输入
    const inputField = document.createElement("textarea");
    inputField.rows = 1;
    Object.assign(inputField.style, { 
        flex: 1, padding: "10px", border: "1px solid #444", borderRadius: "6px",
        background: "var(--comfy-input-bg)", color: "#fff", fontSize: "13px", outline: "none",
        resize: "none", maxHeight: "100px", minHeight: "40px", overflow: "auto",
        lineHeight: "1.4", boxSizing: "border-box"
    });
    inputField.placeholder = t('chat.input_placeholder') || '输入消息...';
    // 🚀 P1-2: 自适应高度
    const adjustHeight = () => {
        inputField.style.height = "auto";
        inputField.style.height = Math.min(inputField.scrollHeight, 100) + "px";
    };
    inputField.addEventListener("input", adjustHeight);
    
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
    let pollTimer = null;           // 🚀 P0-1：消息轮询定时器

    // 🚀 P1-4: 草稿保存/恢复/清除
    const saveDraft = () => {
        if (currentChatTarget && inputField.value.trim()) {
            localStorage.setItem(getDraftKey(currentUser.account, currentChatTarget), inputField.value);
        } else if (currentChatTarget) {
            localStorage.removeItem(getDraftKey(currentUser.account, currentChatTarget));
        }
    };
    const restoreDraft = (targetAccount) => {
        const draft = localStorage.getItem(getDraftKey(currentUser.account, targetAccount));
        if (draft) {
            inputField.value = draft;
            adjustHeight();
        } else {
            inputField.value = "";
            adjustHeight();
        }
    };
    const clearDraft = () => {
        if (currentChatTarget) {
            localStorage.removeItem(getDraftKey(currentUser.account, currentChatTarget));
        }
    };

    // 🚀 P0-3：消息分页配置
    const PAGE_SIZE = 50;
    const MAX_MSG_LENGTH = 1000;    // 🚀 P0-2：消息最大长度
    let currentDisplayCount = PAGE_SIZE;
    let allMessages = [];
    
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
            const avatar = chat.avatar || chat.target_avatar || PLACEHOLDERS.AVATAR_SMALL;
            const lastMsg = chat.last_message || "";
            const unread = chat.unread_count || 0;

            const chatItem = document.createElement("div");
            Object.assign(chatItem.style, { 
                padding: "12px", borderBottom: "1px solid var(--border-color, #333)", cursor: "pointer",
                transition: "0.2s", display: "flex", alignItems: "center", gap: "10px"
            });
            chatItem.onmouseover = () => chatItem.style.background = "var(--comfy-input-bg)";
            chatItem.onmouseout = () => chatItem.style.background = currentChatTarget === acc ? "var(--comfy-input-bg)" : "transparent";
            
            // 高亮当前选中的对话
            if (currentChatTarget === acc) {
                chatItem.style.background = "var(--comfy-input-bg)";
            }
            
            chatItem.innerHTML = `
                <img src="${avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #555; flex-shrink: 0;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: bold; font-size: 13px; color: #fff;">${escapeHtml(name)}</div>
                        ${unread > 0 ? `<span style="background: #F44336; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px;">${unread}</span>` : ''}
                    </div>
                    <div style="font-size: 12px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(lastMsg) || '@' + escapeHtml(acc)}</div>
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
            } catch(e) {
                console.warn('[私信] 解析对话列表缓存失败:', e);
            }
        }
        
        // 然后从云端同步最新数据
        try {
            const res = await api.getChatList(currentUser.account);
            const list = res.data || [];
            
            // 保存到本地缓存
            localStorage.setItem(listCacheKey, JSON.stringify(list));
            
            renderChatList(list);
        } catch(e) {
            // 🚀 P1-7: loadChatList 错误处理
            console.error('[私信] 加载对话列表失败:', e);
            showToast(t('chat.load_list_failed') || '加载对话列表失败', 'error');
        }
    };

    // 🚀 P0-3：分页渲染消息
    const renderMsgs = (msgs, targetAvatar) => {
        allMessages = msgs;
        const startIdx = Math.max(0, msgs.length - currentDisplayCount);
        const visibleMsgs = msgs.slice(startIdx);

        messagesArea.innerHTML = "";
        const myAvatar = currentUser.avatar || currentUser.avatarDataUrl || PLACEHOLDERS.AVATAR_SMALL;
        const otherAvatar = targetAvatar || PLACEHOLDERS.AVATAR_SMALL;

        // 🚀 P0-3：如果有更多历史消息，显示"加载更多"按钮
        if (startIdx > 0) {
            const loadMoreBtn = document.createElement("div");
            Object.assign(loadMoreBtn.style, {
                textAlign: "center", padding: "10px", cursor: "pointer",
                color: "#888", fontSize: "12px", transition: "0.2s"
            });
            loadMoreBtn.textContent = t('chat.load_more') || `加载更早的消息（剩余${startIdx}条）`;
            loadMoreBtn.onmouseover = () => { loadMoreBtn.style.color = "#2196F3"; };
            loadMoreBtn.onmouseout = () => { loadMoreBtn.style.color = "#888"; };
            loadMoreBtn.onclick = () => {
                currentDisplayCount += PAGE_SIZE;
                renderMsgs(allMessages, targetAvatar);
            };
            messagesArea.appendChild(loadMoreBtn);
        }

        visibleMsgs.forEach((msg, idx) => {
            const isMe = msg.sender === currentUser.account;
            const prevMsg = idx > 0 ? visibleMsgs[idx - 1] : null;

            // 🚀 P1-5: 超过5分钟插入时间分隔符
            if (shouldShowTimeSeparator(prevMsg, msg)) {
                const sep = document.createElement("div");
                Object.assign(sep.style, {
                    textAlign: "center", color: "#666", fontSize: "11px",
                    padding: "6px 0", userSelect: "none"
                });
                sep.textContent = formatRelativeTime(msg.created_at);
                messagesArea.appendChild(sep);
            }

            const bubbleWrap = document.createElement("div");
            Object.assign(bubbleWrap.style, { 
                display: "flex", 
                justifyContent: isMe ? "flex-end" : "flex-start",
                alignItems: "flex-end",
                gap: "8px",
                marginBottom: "2px"
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
            
            // 🚀 P1-5: 气泡+时间戳外层容器
            const bubbleCol = document.createElement("div");
            Object.assign(bubbleCol.style, {
                display: "flex", flexDirection: "column",
                alignItems: isMe ? "flex-end" : "flex-start",
                maxWidth: "65%"
            });

            const bubble = document.createElement("div");
            Object.assign(bubble.style, { 
                padding: "10px 14px", borderRadius: "16px", 
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

            // 🚀 P1-5: 气泡下方时间戳
            const timeEl = document.createElement("div");
            Object.assign(timeEl.style, {
                fontSize: "10px", color: "#666", marginTop: "2px",
                padding: "0 2px", userSelect: "none"
            });
            timeEl.textContent = formatRelativeTime(msg.created_at);

            bubbleCol.appendChild(bubble);
            bubbleCol.appendChild(timeEl);

            // 根据是否是自己的消息调整布局顺序
            if (isMe) {
                bubbleWrap.appendChild(bubbleCol);
                bubbleWrap.appendChild(avatarEl);
            } else {
                bubbleWrap.appendChild(avatarEl);
                bubbleWrap.appendChild(bubbleCol);
            }
            
            messagesArea.appendChild(bubbleWrap);
        });
        setTimeout(() => messagesArea.scrollTop = messagesArea.scrollHeight, 50);
    };

    const loadChatHistory = async (targetAccount, targetName, targetAvatar) => {
        // 🚀 核心修复：防止 undefined 污染数据流
        if (!targetAccount || targetAccount === "undefined") return;

        // 🚀 P1-4: 切换对话前保存当前草稿
        saveDraft();

        currentChatTarget = targetAccount;
        const displayName = targetName && targetName !== "undefined" ? targetName : targetAccount;
        const avatar = targetAvatar || PLACEHOLDERS.AVATAR_SMALL;

        // 🚀 P0-3：切换对话时重置分页计数
        currentDisplayCount = PAGE_SIZE;

        // 🚀 新增：保存当前聊天对象信息
        currentTargetInfo = { account: targetAccount, name: displayName, avatar };
        
        // 🚀 新增：保存上次聊天对象，下次打开默认展开
        localStorage.setItem(getLastChatKey(currentUser.account), JSON.stringify(currentTargetInfo));

        chatHeader.innerHTML = `
            <img id="chat-target-avatar" src="${avatar}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #555; cursor: pointer; margin-right: 10px; transition: 0.2s;" title="${t('chat.view_profile') || '点击查看个人资料'}">
            <div style="flex: 1;">
                <div style="font-weight: bold; font-size: 14px; color: #fff;">${t('chat.chatting_with') || '与'} ${escapeHtml(displayName)} ${t('chat.chatting_suffix') || '聊天'}</div>
                <div style="font-size: 11px; color: #888;">@${escapeHtml(targetAccount)}</div>
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

        // 🚀 P1-4: 恢复草稿
        restoreDraft(targetAccount);
        
        try {
            const res = await api.getChatHistory(currentUser.account, targetAccount);
            const cloudMsgs = res.data || [];
            
            const clearTimeStr = localStorage.getItem(clearKey);
            const clearTime = clearTimeStr ? parseInt(clearTimeStr) : 0;
            
            let localMsgs = [];
            if (cachedStr) { try { localMsgs = JSON.parse(cachedStr); } catch(e){} }
            
            // 🚀 P2-5: 确定性ID生成（替代 Math.random()，确保Map能正确去重）
            const generateMsgId = (msg) => {
                const base = `${msg.sender || ''}_${msg.receiver || ''}_${msg.created_at || ''}_${(msg.content || '').substring(0, 20)}`;
                let hash = 0;
                for (let i = 0; i < base.length; i++) {
                    const char = base.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                return 'local_' + Math.abs(hash).toString(36);
            };

            const map = new Map();
            // 🚀 P0-4：统一时间戳格式为毫秒，本地和云端消息均过滤清空时间之前的消息
            // P2-5: 先放本地消息，再由云端消息覆盖（云端为真值源）
            localMsgs.forEach(m => {
                if (!m.id) m.id = generateMsgId(m);
                const mTime = m.created_at ? (m.created_at < 1e12 ? m.created_at * 1000 : m.created_at) : 0;
                if (mTime > clearTime) { map.set(m.id, m); }
            });
            cloudMsgs.forEach(m => {
                const mTime = m.created_at ? (m.created_at < 1e12 ? m.created_at * 1000 : m.created_at) : 0;
                if (mTime > clearTime) { map.set(m.id, m); }
            });
            
            const merged = Array.from(map.values()).sort((a, b) => a.created_at - b.created_at);
            localStorage.setItem(cacheKey, JSON.stringify(merged));
            renderMsgs(merged, avatar);
        } catch(e) {
            // 🚀 P1-7: loadChatHistory 错误处理
            console.error('[私信] 加载消息失败:', e);
            showToast(t('chat.load_history_failed') || '加载消息记录失败', 'error');
            messagesArea.innerHTML = `<div style="text-align:center; padding:40px; color:#888;">
                <div style="margin-bottom:10px;">${t('chat.load_failed_hint') || '消息加载失败'}</div>
                <button id="btn-retry-chat" style="padding:6px 16px; border-radius:4px; border:1px solid #555; background:var(--comfy-input-bg); color:#fff; cursor:pointer;">
                    ${t('chat.retry') || '重试'}
                </button>
            </div>`;
            const retryBtn = messagesArea.querySelector('#btn-retry-chat');
            if (retryBtn) retryBtn.onclick = () => loadChatHistory(targetAccount, targetName, targetAvatar);
        }

        // 🚀 绑定顶部清空消息按钮事件
        clearBtnTop.onclick = async () => {
            if (await showConfirm(t('chat.confirm_clear') || '确定要清空与该用户的本地聊天记录吗？')) {
                localStorage.setItem(clearKey, Date.now().toString());
                localStorage.setItem(cacheKey, "[]");
                renderMsgs([], avatar);
                showToast(t('chat.cleared') || '消息已清空', "success");
            }
        };
    }
    
    // 🚀 P0-2：发送消息带输入校验
    sendBtn.onclick = async () => {
        const txt = inputField.value.trim();
        if (!txt) return;
        if (txt.length > MAX_MSG_LENGTH) {
            showToast(t('chat.msg_too_long') || `消息不能超过${MAX_MSG_LENGTH}字`, "warning");
            return;
        }
        if (!currentChatTarget) return;
        sendBtn.disabled = true; sendBtn.innerText = "✉️";
        try {
            await api.sendPrivateMessage(currentUser.account, currentChatTarget, txt);
            inputField.value = "";
            adjustHeight();
            clearDraft(); // 🚀 P1-4: 发送成功后清除草稿
            loadChatHistory(currentChatTarget, currentTargetInfo?.name, currentTargetInfo?.avatar); 
            loadChatList(); 
        } catch(e) { showToast(t('chat.send_failed') || `发送失败: ${e.message}`, "error"); }
        sendBtn.disabled = false; sendBtn.innerText = t('common.send') || "发送";
    };
    
    // 🚀 P1-2: Enter 发送，Shift+Enter 换行
    inputField.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };
    
    // 🚀 P0-1：消息轮询机制
    const startPolling = () => {
        if (!CACHE.MESSAGE_POLL || !CACHE.MESSAGE_POLL.ENABLED) return;
        pollTimer = setInterval(async () => {
            try {
                const res = await api.getUnreadCount(currentUser.account);
                if (res && res.data && res.data.unread_count > 0) {
                    loadChatList();
                    // 如果当前有打开的对话，也刷新消息
                    if (currentChatTarget) {
                        loadChatHistory(currentChatTarget, currentTargetInfo?.name, currentTargetInfo?.avatar);
                    }
                }
            } catch(e) { console.warn('[私信轮询]', e); }
        }, CACHE.MESSAGE_POLL.INTERVAL);
    };

    loadChatList();
    startPolling();

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
    
    // 🚀 P2-3: 使用 MutationObserver 替代已废弃的 DOMNodeRemovedFromDocument
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const removed of mutation.removedNodes) {
                if (removed === container || removed.contains(container)) {
                    cleanup();
                    observer.disconnect();
                    return;
                }
            }
        }
    });
    setTimeout(() => {
        if (container.parentNode) {
            observer.observe(container.parentNode, { childList: true });
        }
    }, 0);

    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: container } }));
}