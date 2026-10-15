import { createUnreadBadgeUpdate, validUnreadCount } from "./未读角标工具.js";
import { api, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { API, CACHE, UI, PAGINATION, PLACEHOLDERS, normalizeProfileImageUrl } from "../core/全局配置.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t } from "../components/用户体验增强.js";
// 🔒 XSS防护：对用户可控字段进行 HTML 转义（🧹 P2归一：使用统一版）
import { escapeHtml } from "../components/互动工具函数.js";

import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
let chatSequence = 0;

// 🚀 本地存储键管理
const getChatListKey = (account) => `${CACHE.LOCAL_KEYS.CHAT_LIST}_${account}`;
const getChatHistoryKey = (currentUser, targetAccount) => `${CACHE.LOCAL_KEYS.CHAT_HISTORY_PREFIX}${currentUser}_${targetAccount}`;
const getChatClearKey = (currentUser, targetAccount) => `${CACHE.LOCAL_KEYS.CHAT_CLEAR_PREFIX}${currentUser}_${targetAccount}`;
const getLastChatKey = (account) => `ComfyRanking_LastChat_${account}`;
// 🚀 P1-4: 草稿 localStorage 键
const getDraftKey = (userAccount, targetAccount) => `ComfyRanking_Draft_${userAccount}_${targetAccount}`;

// 🚀 P2-3: 时间戳统一转为毫秒
const _normalizeTs = (ts) => (!ts ? 0 : (ts < 1e12 ? ts * 1000 : ts));

// 🚀 P1-5: 相对时间格式化
const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const now = Date.now();
    const msgTime = _normalizeTs(timestamp);
    const diff = now - msgTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return t('chat.time_just_now');
    if (minutes < 60) return `${minutes}${t('chat.time_min_ago')}`;
    if (hours < 24) return `${hours}${t('chat.time_hour_ago')}`;
    if (days < 7) return `${days}${t('chat.time_day_ago')}`;
    const date = new Date(msgTime);
    // 🔧 去掉 || '月' / || '日' 兜底：这两个词条的英文值是刻意留空的（中文 9月8日 → 英文 9/8），
    // 加了兜底反而会把中文量词引回英文界面（同文件下方的 chat.chatting_suffix 同理）
    return `${date.getMonth() + 1}${t('chat.date_month')}${date.getDate()}${t('chat.date_day')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
};
// 🚀 P1-5: 超过5分钟则显示时间分隔符
const TIME_GAP_THRESHOLD = UI.CHAT_TIME_GAP_SECONDS; // 秒
const shouldShowTimeSeparator = (prevMsg, currMsg) => {
    if (!prevMsg || !prevMsg.created_at || !currMsg.created_at) return false;
    const prev = _normalizeTs(prevMsg.created_at) / 1000;
    const curr = _normalizeTs(currMsg.created_at) / 1000;
    return (curr - prev) > TIME_GAP_THRESHOLD;
};

export function openChatModal(currentUser, targetAccount = null) {
    if (!currentUser?.account || getUser()?.account !== currentUser.account) return showToast(t("notif.login_required"), "warning");
    const _attachAvatarInteraction = (avatarEl, account, currentUser) => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'chat-avatar-button';
        button.setAttribute('aria-label', `${t('chat.view_profile')} ${account}`);
        button.onclick = event => { event.stopPropagation(); if (scope.isCurrent()) openOtherUserProfileModal(account, currentUser); };
        avatarEl.replaceWith(button); button.appendChild(avatarEl); return button;
    };
    const container = document.createElement("div");
    // 🔧 自适应高度：flex 填充剩余空间（与主界面保持一致）
    container.classList.add("chat-view");
    
    // 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移
    const topHeader = document.createElement("div");
    topHeader.classList.add("chat-top-header");
    topHeader.innerHTML = `
        <button type="button" id="btn-back-chat" class="chat-button">
            ⬅ ${t('common.back')}
        </button>
        <span class="chat-title">💬 ${t('chat.title')}</span>
        <button type="button" id="btn-clear-chat-top" class="chat-button chat-clear" hidden></button>
    `;
    // 🚀 P2-3: 统一的清理函数
    const cleanup = () => scope.dispose();

    topHeader.querySelector("#btn-back-chat").onclick = () => {
        cleanup();
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    container.appendChild(topHeader);
    
    const clearBtnTop = topHeader.querySelector("#btn-clear-chat-top");
    clearBtnTop.innerHTML = "🗑️ " + t('chat.clear_messages');

    const mainArea = document.createElement("div");
    mainArea.classList.add("chat-main");
    
    const leftPanel = document.createElement("div");
    leftPanel.classList.add("chat-list-panel");
    const chatListContainer = document.createElement("div");
    chatListContainer.classList.add("chat-list");
    leftPanel.appendChild(chatListContainer);
    
    const rightPanel = document.createElement("div");
    rightPanel.classList.add("chat-conversation");
    
    const chatHeader = document.createElement("div");
    chatHeader.classList.add("chat-header");
    
    const messagesArea = document.createElement("div");
    messagesArea.classList.add("chat-messages");
    
    const inputArea = document.createElement("div");
    inputArea.classList.add("chat-composer");
    
    // 🚀 P1-2: 改为 textarea，支持多行输入
    const inputField = document.createElement("textarea");
    inputField.rows = 1;
    inputField.classList.add("chat-input");
    inputField.placeholder = t('chat.input_placeholder');
    inputField.setAttribute("aria-label", t("chat.input_placeholder"));
    // 🚀 P1-2: 自适应高度
    const adjustHeight = () => {
        inputField.style.height = "auto";
        inputField.style.height = inputField.scrollHeight + "px";
    };
    inputField.addEventListener("input", adjustHeight);
    
    const sendBtn = document.createElement("button");
    sendBtn.classList.add("chat-send");
    sendBtn.type = "button";
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

    let constructing = true, observer, listGeneration = 0, historyGeneration = 0, conversationGeneration = 0;
    let sending = false, readRevision = 0;
    const acknowledgedReads = new Map();
    const drafts = new Map(), clearTimes = new Map(), pendingMessages = new Map();
    const componentId = `chat-${++chatSequence}`;
    const sessionMatches = captureRequestSession();
    const scope = createTaskViewScope({
        sessionMatches: () => sessionMatches() && getUser()?.account === currentUser.account,
        connected: () => constructing || container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => { requestCancelManager.cancelAll(componentId); requestCancelManager.cancelAll(`${componentId}-history`); },
        invalidate: () => { inputField.disabled = true; sendBtn.disabled = true; clearBtnTop.disabled = true; }
    });
    scope.addCleanup(() => {
        clearTimeout(pollTimer); pollTimer = null; observer?.disconnect();
        drafts.clear(); clearTimes.clear(); pendingMessages.clear(); acknowledgedReads.clear(); allMessages = []; currentTargetInfo = null; currentChatTarget = null;
        inputField.value = ''; messagesArea.replaceChildren(); chatListContainer.replaceChildren(); chatHeader.replaceChildren();
        window.dispatchEvent(new CustomEvent('comfy-chat-unread-changed'));
    });
    container._cleanup = cleanup;
    const options = { noCache: true, componentId, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES };
    const saveDraft = () => { if (currentChatTarget) drafts.set(currentChatTarget, inputField.value); };
    const restoreDraft = target => { inputField.value = drafts.get(target) || ''; adjustHeight(); };
    const removeLegacy = key => { try { localStorage.removeItem(key); } catch (_) {} };
    removeLegacy(getChatListKey(currentUser.account));

    // 🚀 P0-3：消息分页配置
    const PAGE_SIZE = PAGINATION.CHAT_MESSAGES_PAGE_SIZE;
    const MAX_MSG_LENGTH = UI.CHAT_MAX_MSG_LENGTH;    // 🚀 P0-2：消息最大长度
    let currentDisplayCount = PAGE_SIZE;
    let allMessages = [];
    
    // 🚀 新增：渲染对话列表（带头像）
    const renderChatList = (list) => {
        if (!scope.isCurrent()) return;
        const focused = document.activeElement?.closest('.chat-list-item');
        const focusedAccount = focused && chatListContainer.contains(focused) ? focused.dataset.account : null;
        const focusedIndex = focusedAccount ? [...chatListContainer.querySelectorAll('.chat-list-item')].indexOf(focused) : -1;
        const oldScrollTop = chatListContainer.scrollTop;
        chatListContainer.innerHTML = "";
        if (list.length === 0) {
            chatListContainer.innerHTML = `<div class="chat-status" role="status">${t('chat.no_conversations')}</div>`;
            if (focusedAccount && document.activeElement === document.body) topHeader.querySelector('#btn-back-chat').focus({ preventScroll: true });
            return;
        }
        list.forEach(chat => {
            const acc = chat.target_account || chat.account || chat.receiver || chat.sender;
            const name = chat.target_name || chat.name || acc;
            const avatar = normalizeProfileImageUrl(chat.avatar) || normalizeProfileImageUrl(chat.target_avatar) || PLACEHOLDERS.AVATAR_SMALL;
            const lastMsg = chat.last_message || "";
            const unread = validUnreadCount(chat.unread_count);

            const chatItem = document.createElement("button");
            chatItem.dataset.account = acc;
            chatItem.type = "button"; chatItem.setAttribute("aria-pressed", String(currentChatTarget === acc));
            chatItem.classList.add("chat-list-item");
            chatItem.innerHTML = `
                <img class="chat-list-avatar" alt="" src="${escapeHtml(avatar)}">
                <span class="chat-list-item-body">
                    <span class="chat-list-item-meta"><span class="chat-list-name">${escapeHtml(name)}</span>
                        ${unread > 0 ? `<span class="chat-unread">${unread}</span>` : ''}
                    </span>
                    <span class="chat-list-preview">${escapeHtml(lastMsg) || '@' + escapeHtml(acc)}</span>
                </span>
            `;
            chatItem.onclick = () => loadChatHistory(acc, name, avatar);
            chatListContainer.appendChild(chatItem);
        });
        chatListContainer.scrollTop = oldScrollTop;
        if (focusedAccount && document.activeElement === document.body) {
            const buttons = [...chatListContainer.querySelectorAll('.chat-list-item')];
            const target = buttons.find(button => button.dataset.account === focusedAccount)
                || buttons[Math.min(focusedIndex, buttons.length - 1)];
            if (target) {
                target.focus({ preventScroll: true });
                const bounds = target.getBoundingClientRect(), viewport = chatListContainer.getBoundingClientRect();
                if (bounds.top < viewport.top) chatListContainer.scrollTop += bounds.top - viewport.top;
                else if (bounds.bottom > viewport.bottom) chatListContainer.scrollTop += bounds.bottom - viewport.bottom;
            }
        }
    };

    const loadChatList = async () => {
        if (!scope.isCurrent()) return [];
        const generation = ++listGeneration;
        const requestedReadRevision = readRevision;
        try {
            const res = await api.getChatList(currentUser.account, options);
            if (!scope.isCurrent() || generation !== listGeneration) return [];
            if (res?.status !== 'success' || !Array.isArray(res.data)) throw new Error('Invalid chat list');
            const list = res.data.filter(chat => chat && typeof chat === 'object' && !Array.isArray(chat)
                && typeof (chat.target_account || chat.account || chat.receiver || chat.sender) === 'string')
                .map(chat => (acknowledgedReads.get(chat.target_account || chat.account || chat.receiver || chat.sender) || 0) > requestedReadRevision
                    ? { ...chat, unread_count: 0 } : chat);
            renderChatList(list); return list;
        } catch (_) {
            if (scope.isCurrent() && generation === listGeneration) showToast(t('chat.load_list_failed'), 'error');
            return [];
        }
    };

    // 🚀 P0-3：分页渲染消息
    const renderMsgs = (msgs, targetAvatar, prepend = false) => {
        if (!scope.isCurrent()) return;
        const active = document.activeElement;
        const focusedMessage = messagesArea.contains(active) ? active.closest('.chat-message') : null;
        const focusedId = focusedMessage?.dataset.messageId;
        const focusedAvatar = active?.classList.contains('chat-avatar-button');
        const focusedMore = messagesArea.contains(active) && active?.classList.contains('chat-load-more');
        const oldTop = messagesArea.scrollTop, oldHeight = messagesArea.scrollHeight;
        const followBottom = Math.ceil(oldTop + messagesArea.clientHeight) >= oldHeight;
        allMessages = msgs;
        const startIdx = Math.max(0, msgs.length - currentDisplayCount);
        const visibleMsgs = msgs.slice(startIdx);

        messagesArea.innerHTML = "";
        const myAvatar = normalizeProfileImageUrl(currentUser.avatar) || normalizeProfileImageUrl(currentUser.avatarDataUrl) || PLACEHOLDERS.AVATAR_SMALL;
        const otherAvatar = normalizeProfileImageUrl(targetAvatar) || PLACEHOLDERS.AVATAR_SMALL;

        // 🚀 P0-3：如果有更多历史消息，显示"加载更多"按钮
        if (startIdx > 0) {
            const loadMoreBtn = document.createElement("button");
            loadMoreBtn.type = "button";
            loadMoreBtn.classList.add("chat-load-more");
            loadMoreBtn.textContent = t('chat.load_more');
            loadMoreBtn.onclick = () => {
                if (!scope.isCurrent() || !loadMoreBtn.isConnected) return;
                currentDisplayCount += PAGE_SIZE;
                renderMsgs(allMessages, targetAvatar, true);
                const focusTarget = messagesArea.querySelector(".chat-load-more") || messagesArea.querySelector(".chat-bubble");
                if (focusTarget) { if (!focusTarget.matches("button")) focusTarget.tabIndex = -1; focusTarget.focus({ preventScroll: true }); }
            };
            messagesArea.appendChild(loadMoreBtn);
        }

        visibleMsgs.forEach((msg, idx) => {
            const isMe = msg.sender === currentUser.account;
            const prevMsg = idx > 0 ? visibleMsgs[idx - 1] : null;

            // 🚀 P1-5: 超过5分钟插入时间分隔符
            if (shouldShowTimeSeparator(prevMsg, msg)) {
                const sep = document.createElement("div");
                sep.classList.add("chat-time-separator");
                sep.textContent = formatRelativeTime(msg.created_at);
                messagesArea.appendChild(sep);
            }

            const bubbleWrap = document.createElement("div");
            bubbleWrap.classList.add("chat-message");
            if (typeof msg.id === 'string') bubbleWrap.dataset.messageId = msg.id;
            bubbleWrap.classList.toggle("chat-message--mine", isMe);
            
            // 🚀 新增：头像元素
            const avatarEl = document.createElement("img");
            avatarEl.classList.add("chat-avatar");
            avatarEl.alt = "";
            avatarEl.src = isMe ? myAvatar : otherAvatar;
            avatarEl.title = isMe ? t('chat.me') : `${t('chat.view_profile')} ${currentTargetInfo?.name || currentChatTarget}`;
            
            const avatarNode = isMe ? avatarEl : _attachAvatarInteraction(avatarEl, currentChatTarget, currentUser);
            
            // 🚀 P1-5: 气泡+时间戳外层容器
            const bubbleCol = document.createElement("div");
            bubbleCol.classList.add("chat-bubble-column");

            const bubble = document.createElement("div");
            bubble.classList.add("chat-bubble");
            
            bubble.innerText = msg.content;

            // 🚀 P1-5: 气泡下方时间戳
            const timeEl = document.createElement("div");
            timeEl.classList.add("chat-message-time");
            timeEl.textContent = formatRelativeTime(msg.created_at);

            bubbleCol.appendChild(bubble);
            bubbleCol.appendChild(timeEl);

            // 根据是否是自己的消息调整布局顺序
            if (isMe) {
                bubbleWrap.appendChild(bubbleCol);
                bubbleWrap.appendChild(avatarNode);
            } else {
                bubbleWrap.appendChild(avatarNode);
                bubbleWrap.appendChild(bubbleCol);
            }
            
            messagesArea.appendChild(bubbleWrap);
        });
        messagesArea.scrollTop = prepend ? oldTop + Math.max(0, messagesArea.scrollHeight - oldHeight)
            : followBottom ? messagesArea.scrollHeight : oldTop;
        if (!prepend && document.activeElement === document.body && (focusedId || focusedMore)) {
            const row = focusedId ? [...messagesArea.querySelectorAll('.chat-message')].find(node => node.dataset.messageId === focusedId) : null;
            const target = row?.querySelector(focusedAvatar ? '.chat-avatar-button' : '.chat-bubble')
                || messagesArea.querySelector('.chat-load-more') || messagesArea.querySelector('.chat-bubble') || inputField;
            if (target) { if (!target.matches('button')) target.tabIndex = -1; target.focus({ preventScroll: true }); }
        }
    };

    const loadChatHistory = async (targetAccount, targetName, targetAvatar) => {
        if (!scope.isCurrent() || typeof targetAccount !== 'string' || !targetAccount || targetAccount === 'undefined') return;
        const switched = currentChatTarget !== targetAccount;
        if (switched) { saveDraft(); conversationGeneration++; currentDisplayCount = PAGE_SIZE; allMessages = []; messagesArea.replaceChildren(); }
        currentChatTarget = targetAccount;
        chatListContainer.querySelectorAll(".chat-list-item").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.account === targetAccount)));
        const generation = ++historyGeneration;
        requestCancelManager.cancelAll(`${componentId}-history`);
        const current = () => scope.isCurrent() && currentChatTarget === targetAccount && generation === historyGeneration;
        const displayName = targetName && targetName !== 'undefined' ? targetName : targetAccount;
        const avatar = normalizeProfileImageUrl(targetAvatar) || PLACEHOLDERS.AVATAR_SMALL;
        currentTargetInfo = { account: targetAccount, name: displayName, avatar };
        try { localStorage.setItem(getLastChatKey(currentUser.account), JSON.stringify({ account: targetAccount })); } catch (_) {}

        const headerHadFocus = !switched && chatHeader.contains(document.activeElement);
        chatHeader.innerHTML = `
            <img id="chat-target-avatar" class="chat-target-avatar" alt="" src="${escapeHtml(avatar)}">
            <div class="chat-target-info">
                <div class="chat-target-name">${t('chat.chatting_with')} ${escapeHtml(displayName)} ${t('chat.chatting_suffix')}</div>
                <div class="chat-target-account">@${escapeHtml(targetAccount)}</div>
            </div>
        `;
        // 🚀 显示顶部的清空消息按钮
        clearBtnTop.hidden = false;
        
        // 🚀 P2-1: 点击头像跳转个人资料
        const avatarEl = chatHeader.querySelector("#chat-target-avatar");
        const headerAvatar = _attachAvatarInteraction(avatarEl, targetAccount, currentUser);
        if (headerHadFocus && document.activeElement === document.body) headerAvatar.focus({ preventScroll: true });

        removeLegacy(getChatHistoryKey(currentUser.account, targetAccount));
        removeLegacy(getDraftKey(currentUser.account, targetAccount));
        const clearKey = getChatClearKey(currentUser.account, targetAccount);
        if (!clearTimes.has(targetAccount)) {
            let value = 0; try { value = Number(localStorage.getItem(clearKey)); } catch (_) {}
            clearTimes.set(targetAccount, Number.isFinite(value) && value >= 0 ? value : 0);
        }
        if (switched) restoreDraft(targetAccount);
        clearBtnTop.disabled = false;
        clearBtnTop.onclick = async () => {
            if (!current() || clearBtnTop.disabled) return;
            clearBtnTop.disabled = true;
            try {
                if (!await showConfirm(t('chat.confirm_clear')) || !current()) return;
                const time = Date.now(); clearTimes.set(targetAccount, time);
                try { localStorage.setItem(clearKey, String(time)); } catch (_) {}
                renderMsgs([], avatar); showToast(t('chat.cleared'), 'success');
            } catch (_) { if (current()) showToast(t('common.error'), 'error'); }
            finally { if (current()) clearBtnTop.disabled = false; }
        };
        try {
            const res = await api.getChatHistory(currentUser.account, targetAccount, { ...options, componentId: `${componentId}-history` });
            if (!current()) return;
            if (res?.status !== 'success' || !Array.isArray(res.data)) throw new Error('Invalid chat history');
            const messages = res.data.filter(msg => msg && typeof msg === 'object' && typeof msg.content === 'string'
                && Number.isFinite(msg.created_at) && Number.isFinite(new Date(_normalizeTs(msg.created_at)).getTime())
                && _normalizeTs(msg.created_at) > clearTimes.get(targetAccount)
                && ((msg.sender === currentUser.account && msg.receiver === targetAccount)
                    || (msg.sender === targetAccount && msg.receiver === currentUser.account)))
                .map(msg => ({ ...msg })).sort((a, b) => _normalizeTs(a.created_at) - _normalizeTs(b.created_at));
            renderMsgs(messages, avatar);
            acknowledgedReads.set(targetAccount, ++readRevision);
            for (const button of chatListContainer.querySelectorAll('.chat-list-item')) {
                if (button.dataset.account === targetAccount) button.querySelector('.chat-unread')?.remove();
            }
            window.dispatchEvent(new CustomEvent('comfy-chat-unread-changed'));
        } catch (_) {
            if (!current()) return;
            showToast(t('chat.load_history_failed'), 'error');
            if (allMessages.length) return;
            messagesArea.innerHTML = `<div class="chat-status" role="alert">${t("chat.load_failed_hint")}</div>`;
            const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'chat-button'; retry.textContent = t('chat.retry');
            retry.onclick = () => { if (current()) void loadChatHistory(targetAccount, targetName, targetAvatar); };
            messagesArea.appendChild(retry);
        }
    };

    // 🚀 P0-2：发送消息带输入校验
    sendBtn.onclick = async () => {
        if (!scope.isCurrent() || sending || !currentChatTarget) return;
        const originalInput = inputField.value, txt = originalInput.trim();
        if (!txt) return;
        if (txt.length > MAX_MSG_LENGTH) { showToast(t('chat.msg_too_long'), 'warning'); return; }
        const target = currentChatTarget, generation = conversationGeneration;
        const current = () => scope.isCurrent() && currentChatTarget === target && generation === conversationGeneration;
        sending = true; sendBtn.disabled = true; sendBtn.setAttribute('aria-busy', 'true');
        try {
            let pending = pendingMessages.get(target);
            if (!pending || pending.content !== txt) {
                const bytes = new Uint8Array(16);
                crypto.getRandomValues(bytes);
                pending = { id: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''), content: txt };
                pendingMessages.set(target, pending);
            }
            const result = await api.sendPrivateMessage(currentUser.account, target, txt, pending.id);
            if (!current()) return;
            if (result?.status !== 'success' || typeof result.data?.id !== 'string' || !result.data.id
                || result.data.client_request_id !== pending.id) throw new Error('Unconfirmed message');
            if (pendingMessages.get(target) === pending) pendingMessages.delete(target);
            if (inputField.value === originalInput) { inputField.value = ''; drafts.delete(target); adjustHeight(); }
            await Promise.allSettled([loadChatHistory(target, currentTargetInfo?.name, currentTargetInfo?.avatar), loadChatList()]);
        } catch (error) {
            if (current()) {
                const message = error?.status === 404 ? t('chat.send_service_unavailable')
                    : error?.status === 409 ? t('chat.send_request_conflict')
                    : error?.status >= 400 && error?.status < 500 ? t('chat.send_rejected') : t('chat.send_unconfirmed');
                showToast(message, 'error');
            }
        }
        finally {
            sending = false;
            if (scope.isCurrent()) { sendBtn.disabled = false; sendBtn.setAttribute('aria-busy', 'false'); }
        }
    };

    // 🚀 P1-2: Enter 发送，Shift+Enter 换行
    inputField.onkeydown = (e) => {
        if (scope.isCurrent() && !e.defaultPrevented && e.key === "Enter"
            && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
            && !e.isComposing && e.keyCode !== 229 && !e.repeat
            && !inputField.disabled && !inputField.readOnly) {
            e.preventDefault();
            sendBtn.click();
        }
    };
    
    // 每轮完成后续排，慢网络不叠加读取；页面销毁后不再续排。
    const poll = async () => {
        if (!scope.isCurrent()) return;
        const list = await loadChatList();
        if (scope.isCurrent() && currentChatTarget && list.some(chat => (chat.target_account || chat.account || chat.receiver || chat.sender) === currentChatTarget
            && validUnreadCount(chat.unread_count) > 0)) {
            await loadChatHistory(currentChatTarget, currentTargetInfo?.name, currentTargetInfo?.avatar);
        }
        if (scope.isCurrent()) pollTimer = setTimeout(poll, CACHE.MESSAGE_POLL.INTERVAL);
    };
    window.dispatchEvent(new CustomEvent('comfy-route-view', { detail: { view: container } }));
    constructing = false;
    if (!scope.isCurrent()) return;
    observer = new MutationObserver(() => { if (!container.isConnected) cleanup(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void loadChatList();
    if (CACHE.MESSAGE_POLL?.ENABLED) pollTimer = setTimeout(poll, CACHE.MESSAGE_POLL.INTERVAL);
    if (targetAccount) void loadChatHistory(targetAccount, targetAccount, null);
    else {
        try {
            const lastChat = JSON.parse(localStorage.getItem(getLastChatKey(currentUser.account)) || 'null');
            if (typeof lastChat?.account === 'string') void loadChatHistory(lastChat.account, lastChat.account, null);
        } catch (_) {}
    }

}

// 🔔 聊天未读红点：汇总 chats.json 各会话未读数，驱动顶部导航 ✉️ 按钮的红点。
//    私信提醒已从铃铛(🔔)迁移至此——铃铛未读数不再计入 private，避免同一提醒重复出现。
//    与 loadUnreadCount(通知中心) 保持一致的写法：从传入按钮内查询徽标元素并回写。
export async function loadChatUnreadCount(currentUser, chatBtn) {
    const update = createUnreadBadgeUpdate(chatBtn, '#chat-unread-badge', currentUser?.account);
    if (!currentUser?.account || !chatBtn?.querySelector("#chat-unread-badge")) return 0;
    try {
        const res = await api.getChatList(currentUser.account);
        if (res?.status !== "success" || !Array.isArray(res.data)
            || res.data.some(chat => !chat || !Number.isSafeInteger(chat.unread_count) || chat.unread_count < 0)) return 0;
        const list = res.data;
        const total = list.reduce((sum, chat) => Math.min(Number.MAX_SAFE_INTEGER,
            sum + validUnreadCount(chat?.unread_count)), 0);
        if (!update.isCurrent()) return 0;
        update.render(total); return total;
    } catch (_) { return 0; }
}
