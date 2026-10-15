// 前端页面/social/通知中心组件.js
import { loadUnreadCount } from "./未读角标工具.js";
export { loadUnreadCount };
import { api, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { API, CACHE, PLACEHOLDERS, normalizeProfileImageUrl } from "../core/全局配置.js";
import { t } from "../components/用户体验增强.js";
import { escapeHtml } from "../components/互动工具函数.js";  // 🧹 P2归一：局部副本已移除

import { eventBus, EVENTS, getUser } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
let notificationSequence = 0;

// 🚀 本地存储键管理
const getNotifCacheKey = (account) => `${CACHE.LOCAL_KEYS.NOTIFICATIONS}_${account}`;
const getNotifClearKey = (account) => `${CACHE.LOCAL_KEYS.NOTIF_CLEAR_TIME}_${account}`;

export async function openNotificationCenter(currentUser, bellBtn) {
    if (!currentUser?.account || getUser()?.account !== currentUser.account) return showToast(t('notif.login_required'), "warning");
    
    const outerBox = document.createElement("div");
    outerBox.className = "notification-view";
    const header = document.createElement("div");
    header.className = "notification-header";
    header.innerHTML = `
        <button type="button" id="btn-back-notif" class="notification-button">⬅ ${t('common.back')}</button>
        <div class="notification-toolbar">
            <h2 class="notification-title">🔔 ${t('notif.title')}</h2>
            <button type="button" id="btn-clear-notif" class="notification-button notification-clear">${t('notif.clear')}</button>
        </div>
    `;
    const listArea = document.createElement("div");
    listArea.className = "notification-list";

    const cacheKey = getNotifCacheKey(currentUser.account);
    const clearKey = getNotifClearKey(currentUser.account);
    // 通知正文仅属于当前视图；历史持久缓存不再恢复，删除失败也不使用。
    try { localStorage.removeItem(cacheKey); } catch (_) {}
    let clearTime = 0;
    try { const value = Number(localStorage.getItem(clearKey)); if (Number.isFinite(value) && value >= 0) clearTime = value; } catch (_) {}
    let messages = [], constructing = true, observer;
    const componentId = `notifications-${++notificationSequence}`;
    const sessionMatches = captureRequestSession();
    const scope = createTaskViewScope({
        sessionMatches: () => sessionMatches() && getUser()?.account === currentUser.account,
        connected: () => constructing || outerBox.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => { listArea.replaceChildren(); clearBtn.disabled = true; }
    });
    const readOptions = { noCache: true, componentId, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES };
    scope.addCleanup(() => { messages = []; listArea.replaceChildren(); observer?.disconnect(); });
    outerBox._cleanup = () => scope.dispose();
    outerBox.appendChild(header); outerBox.appendChild(listArea);
    header.querySelector("#btn-back-notif").onclick = () => {
        scope.dispose(); window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    const clearBtn = header.querySelector("#btn-clear-notif");

    // 生成标题链接的辅助函数
    function makeTitleLink(itemId, title) {
        if (!itemId || !title) return escapeHtml(title || '');
        return `<button type="button" class="notif-item-link" data-item-id="${escapeHtml(String(itemId))}">${escapeHtml(title)}</button>`;
    }

    // 跳转到任务详情页
    function _navigateToTaskDetail(taskId, currentUser) {
        if (!scope.isCurrent()) return;
        import("../task/任务详情组件.js").then(module => {
            if (!scope.isCurrent()) return;
            const view = module.createTaskDetailView(taskId, currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(() => { if (scope.isCurrent()) showToast(t('common.error'), 'error'); });
    }

    // 跳转到帖子详情页
    function _navigateToPostDetail(postId, currentUser) {
        if (!scope.isCurrent()) return;
        import("../post/帖子详情组件.js").then(module => {
            if (!scope.isCurrent()) return;
            const view = module.createPostDetailView(postId, currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(() => { if (scope.isCurrent()) showToast(t('common.error'), 'error'); });
    }

    // 跳转到资源详情（异步获取类型后派发路由事件）
    async function _navigateToItemView(itemId) {
        try {
            if (!scope.isCurrent()) return;
            const res = await api.getItemById(itemId, readOptions);
            if (!scope.isCurrent()) return;
            if (res.status === "success" && res.data) {
                const itemType = res.data.type || 'tool';
                window.dispatchEvent(new CustomEvent("comfy-route-to-item", {
                    detail: { itemId: itemId, itemType: itemType }
                }));
            } else {
                showToast(t('notif.item_not_found'), "error");
            }
        } catch (e) {
            if (!scope.isCurrent()) return;
            showToast(t('notif.load_item_failed'), "error");
        }
    }

    const renderMsgList = (msgs) => {
        if (!scope.isCurrent()) return;
        listArea.innerHTML = "";
        // 🔔 私信提醒已迁移至聊天入口(✉️红点)、插件更新提醒已迁移至卡片徽章(🔄)，
        //    通知中心不再展示这两类（含存量历史数据），避免同一提醒重复出现
        const visibleMsgs = msgs.filter(m => m.type !== "private" && m.type !== "plugin_update");
        if (visibleMsgs.length === 0) {
            listArea.innerHTML = `<div class="notification-status" role="status">${t('notif.no_messages')}</div>`;
            return;
        }
        
        let html = "";
        visibleMsgs.forEach(msg => {
            const isUnread = !msg.is_read;
            // 【核心新增】：判断是否为系统公告
            const isSystem = msg.type === "system";
            const isAnonymous = msg.from_user === "anonymous";
            
            // 生成标题链接
            const titleLink = makeTitleLink(msg.target_item_id, msg.target_item_title);
            
            let actionText = "";
            if (msg.type === "follow") actionText = t('notif.followed_you');
            else if (msg.type === "like") actionText = `${t('notif.liked')} ${titleLink}`;
            else if (msg.type === "favorite") actionText = `${t('notif.favorited')} ${titleLink}`;
            else if (msg.type === "comment") actionText = `${t('notif.commented_on')} ${titleLink}：<br><span class="notification-copy">${escapeHtml(msg.content)}</span>`;
            else if (msg.type === "reply") actionText = `${t('notif.replied_on')} ${titleLink}：<br><span class="notification-copy">${escapeHtml(msg.content)}</span>`;
            else if (msg.type === "purchase") actionText = `${t('notif.purchased')} ${titleLink}${t('notif.income_received')}`;
            else if (msg.type === "refund") actionText = `${t('notif.refunded')} ${titleLink}`;
            else if (msg.type === "tip") actionText = `${t('notif.tipped_you')}<br><span class="notification-accent">"${escapeHtml(msg.content)}"</span>`;
            // 任务类通知 - 保持现有模板不变
            else if (msg.type === "task_apply") actionText = `<span class="notification-accent">🙋</span> ${escapeHtml(msg.content) || t('notif.task_apply')}`;
            else if (msg.type === "task_assigned") actionText = `<span>🎯</span> ${escapeHtml(msg.content) || t('notif.task_assigned')}`;
            else if (msg.type === "task_submitted") actionText = `<span>📤</span> ${escapeHtml(msg.content) || t('notif.task_submitted')}`;
            else if (msg.type === "task_completed") actionText = `<span>✅</span> ${escapeHtml(msg.content) || t('notif.task_completed')}`;
            else if (msg.type === "task_rejected") actionText = `<span>❌</span> ${escapeHtml(msg.content) || t('notif.task_rejected')}`;
            // 申诉仲裁通知 - 保持现有模板不变
            else if (msg.type === "task_disputed") actionText = `<span>⚖️</span> ${escapeHtml(msg.content) || t('notif.task_disputed')}`;
            else if (msg.type === "dispute_responded") actionText = `<span>💬</span> ${escapeHtml(msg.content) || t('notif.dispute_responded')}`;
            else if (msg.type === "dispute_resolved") actionText = `<span>🔨</span> ${escapeHtml(msg.content) || t('notif.dispute_resolved')}`;
            // 【核心新增】：系统公告的正文排版，保留原格式的换行
            else if (isSystem) actionText = `<div class="notification-announcement">${escapeHtml(msg.content)}</div>`;
            
            const date = new Date(msg.created_at >= 1e12 ? msg.created_at : msg.created_at * 1000);
            const timeStr = date.toLocaleString();
            
            // 【核心新增】：如果是系统消息，增加 📢 标签并改变标题颜色
            // 匿名打赏和系统通知的用户名不显示为链接
            let nameLabel;
            if (isSystem) {
                nameLabel = `<strong class="notification-system-name">📢 [${t('notif.system_announcement')}] ${escapeHtml(msg.from_name)}</strong>`;
            } else if (isAnonymous) {
                nameLabel = `<strong>${escapeHtml(msg.from_name || msg.from_user)}</strong>`;
            } else {
                // 🔒 XSS防护：from_user 是他人账号，写入 HTML 属性前必须转义
                // （dataset.account 经浏览器解码后仍是原始值，下方跳转行为不变）
                nameLabel = `<button type="button" class="notif-user-link" data-account="${escapeHtml(msg.from_user)}">${escapeHtml(msg.from_name || msg.from_user)}</button>`;
            }
            
            html += `
                <article class="notif-item${isSystem ? ' notif-item--system' : ''}${isUnread ? ' notif-item--unread' : ''}" data-account="${escapeHtml(msg.from_user)}" data-type="${escapeHtml(msg.type)}" data-item-id="${escapeHtml(msg.target_item_id || '')}">
                    <img class="notification-avatar" alt="" src="${escapeHtml(normalizeProfileImageUrl(msg.from_avatar) || PLACEHOLDERS.AVATAR)}">
                    <div class="notification-body">
                        <div class="notification-meta">${nameLabel}<time class="notification-time" datetime="${date.toISOString()}">${timeStr}</time></div>
                        <div class="notification-action">${actionText}</div>
                    </div>
                </article>
            `;
        });
        listArea.innerHTML = html;
        
        listArea.querySelectorAll(".notif-item").forEach(item => {
            item.onclick = (e) => {
                if (!scope.isCurrent()) return;
                // 使用事件委托区分点击目标
                const userLink = e.target.closest('.notif-user-link');
                const itemLink = e.target.closest('.notif-item-link');
                
                if (userLink) {
                    // 点击用户名 -> 跳转用户资料页
                    const acc = userLink.dataset.account;
                    if (acc && acc !== 'system' && acc !== 'anonymous') {
                        openOtherUserProfileModal(acc, currentUser);
                    }
                    return;
                }
                
                if (itemLink) {
                    // 点击资源/帖子/任务标题 -> 根据 ID 前缀跳转
                    const id = itemLink.dataset.itemId;
                    if (id.startsWith('post_')) {
                        _navigateToPostDetail(id, currentUser);
                    } else if (id.startsWith('task_')) {
                        _navigateToTaskDetail(id, currentUser);
                    } else {
                        // 🔔 资源类通知：切换到对应Tab并展开卡片
                        _navigateToItemView(id);
                    }
                    return;
                }
                
                // 默认行为：保留现有的整卡片点击逻辑
                const acc = item.dataset.account;
                const type = item.dataset.type;
                const itemId = item.dataset.itemId;
                
                // 【核心新增】：系统公告点击不跳转，只触发消除红点
                if (type === "system") return; 
                
                // 📝 任务榜通知：跳转到任务详情
                if (type.startsWith("task_") && itemId) {
                    _navigateToTaskDetail(itemId, currentUser);
                    return;
                }
                
                // ⚖️ 申诉通知：跳转到任务详情（包含申诉入口）
                if ((type === "dispute_responded" || type === "dispute_resolved") && itemId) {
                    _navigateToTaskDetail(itemId, currentUser);
                    return;
                }

                // 互动类通知（点赞/收藏/评论/回复/购买/打赏/退款）：优先跳转内容详情
                if (["like", "favorite", "comment", "reply", "purchase", "tip", "refund"].includes(type) && itemId) {
                    if (itemId.startsWith('post_')) {
                        _navigateToPostDetail(itemId, currentUser);
                    } else if (itemId.startsWith('task_')) {
                        _navigateToTaskDetail(itemId, currentUser);
                    } else {
                        // 🔔 资源类互动通知：切换到对应Tab并展开卡片
                        _navigateToItemView(itemId);
                    }
                    return;
                }

                // 其他：跳转发送者资料页（兜底）
                if (acc && acc !== 'anonymous') openOtherUserProfileModal(acc, currentUser);
            };
        });
    };

    clearBtn.onclick = async () => {
        if (!scope.isCurrent() || clearBtn.disabled) return;
        clearBtn.disabled = true;
        try {
            if (!await showConfirm(t('notif.clear_confirm')) || !scope.isCurrent()) return;
            clearTime = Date.now(); messages = [];
            try { localStorage.setItem(clearKey, String(clearTime)); } catch (_) {}
            renderMsgList(messages); showToast(t('notif.cleared'), "success");
        } catch (_) { if (scope.isCurrent()) showToast(t("common.error"), "error"); }
        finally { if (scope.isCurrent()) clearBtn.disabled = false; }
    };
    listArea.innerHTML = `<div class="notification-status" role="status">${t("common.loading")}</div>`;
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: outerBox } }));
    constructing = false;
    if (!scope.isCurrent()) return;
    observer = new MutationObserver(() => { if (!outerBox.isConnected) scope.dispose(); });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
        const res = await api.getMessages(currentUser.account, readOptions);
        if (!scope.isCurrent()) return;
        if (res?.status !== 'success' || !Array.isArray(res.data)) throw new Error('Invalid notifications');
        messages = res.data.filter(msg => msg && typeof msg === 'object' && !Array.isArray(msg)
            && typeof msg.id === 'string' && msg.id && typeof msg.type === 'string'
            && Number.isFinite(msg.created_at) && Number.isFinite(new Date(msg.created_at >= 1e12 ? msg.created_at : msg.created_at * 1000).getTime())
            && (msg.created_at >= 1e12 ? msg.created_at : msg.created_at * 1000) > clearTime)
            .map(msg => ({ ...msg })).sort((a, b) => b.created_at - a.created_at);
        renderMsgList(messages);
        if (scope.isCurrent()) void loadUnreadCount(currentUser, bellBtn);
    } catch (_) { if (scope.isCurrent() && messages.length === 0) listArea.innerHTML = `<div class="notification-status" role="alert">${t('common.error')}</div>`; }

}
