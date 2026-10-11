// 前端页面/task/任务详情组件.js
// ==========================================
// 📝 任务详情组件
// ==========================================
// 功能：展示任务详情、申请接单、提交成果、验收等操作
// ==========================================

import { api, proxyImages, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { hasAppliedToTask } from "./任务数据工具.js";
import { loadTaskSnapshot } from "./任务详情加载.js";
import { eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "./任务视图生命周期.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { API, CACHE, PLACEHOLDERS, TASK_LIMITS, getCachedProfile, getProfileWithSWR, isAdmin, IS_WEB_MODE } from "../core/全局配置.js";
import { removeCache, findInListCache, requireListResponseData } from "../components/性能优化工具.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { compressImageForUpload } from "../market/发布内容_提交引擎.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { recordView, handleToggleLike, handleToggleFavorite, renderTipBoardHTML as renderCommonTipBoardHTML, escapeHtml } from "../components/互动工具函数.js";

let taskViewSequence = 0;
const taskScopes = new WeakMap();
const modalScopes = new WeakMap();
const taskCommentStates = new WeakMap();

function openTaskModal(scope, title, content, options) {
    if (scope && !scope.isCurrent()) return;
    globalModal.openModal(title, content, options);
    const modal = globalModal.activeModals.at(-1);
    const release = scope?.addCleanup(() => globalModal.closeModal(modal));
    modalScopes.set(content, { scope, modal, release });
    content.addEventListener("click", event => {
        if (!taskModalCurrent(content)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);
}
function taskModalCurrent(content) {
    const entry = modalScopes.get(content);
    return Boolean(content.isConnected && (!entry?.scope || entry.scope.isCurrent()));
}
function closeTaskModal(content) {
    const entry = modalScopes.get(content);
    if (entry) { entry.release?.(); globalModal.closeModal(entry.modal); }
}

/**
 * 📝 创建任务详情视图
 */
export function createTaskDetailView(taskId, currentUser) {
    const container = document.createElement("div");
    container.className = "task-detail-view";
    container.innerHTML = `
        <header class="task-detail-header">
            <button id="btn-back" class="about-back" type="button">⬅ ${t('common.back')}</button>
            <h1 class="task-detail-title">${t('task.detail_title')}</h1>
        </header>
        <div id="task-loading" class="task-detail-status" role="status" aria-live="polite">
            ${t('common.loading')}
        </div>
        <div id="task-cache-status" class="task-detail-cache-status" role="status" aria-live="polite" hidden></div>
        <div id="task-content" class="task-detail-content" hidden></div>
    `;

    const componentId = `task-detail-${++taskViewSequence}`;
    const scope = createTaskViewScope({
        sessionMatches: captureRequestSession(),
        connected: () => container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, {
            target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN
        }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => {
            const content = container.querySelector("#task-content");
            content.replaceChildren();
            delete content.dataset.publisher;
            content.hidden = true;
            container.querySelector("#task-cache-status").hidden = true;
            const status = container.querySelector("#task-loading");
            status.hidden = false;
            status.textContent = t('task.session_changed');
        }
    });
    scope.componentId = componentId;
    scope.root = container;
    container._taskScope = scope;
    container.querySelector("#task-content")._taskScope = scope;
    container._cleanup = () => {
        scope.dispose();
        container.querySelector("#task-content").replaceChildren();
    };

    // 返回按钮
    container.querySelector("#btn-back").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 加载任务详情
    loadTaskDetail(container, taskId, currentUser);
    
    return container;
}

/**
 * 📥 加载任务详情
 */
async function loadTaskDetail(container, taskId, currentUser) {
    container = container?.closest(".task-detail-view");
    if (!container || !container._taskScope) return;
    const scope = container._taskScope;
    if (scope.loadGeneration) requestCancelManager.cancelAll(scope.componentId);
    const generation = (scope.loadGeneration || 0) + 1;
    scope.loadGeneration = generation;
    const loadingEl = container.querySelector("#task-loading");
    const contentEl = container.querySelector("#task-content");
    const statusEl = container.querySelector("#task-cache-status");
    const isCurrent = () => scope.isCurrent() && scope.loadGeneration === generation;
    const display = (task, preview) => {
        loadingEl.hidden = true;
        contentEl.hidden = false;
        statusEl.hidden = !preview;
        if (preview) statusEl.textContent = t('task.cached_readonly');
        renderTaskDetail(contentEl, proxyImages(task), preview ? null : currentUser, preview);
    };
    return loadTaskSnapshot({
        taskId,
        readCached: id => findInListCache("TasksCache_", id),
        fetchDetail: cached => api.getTaskDetail(taskId, { componentId: scope.componentId, ...(cached
            ? { timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES } : {}) }),
        renderCached: task => display(task, true),
        renderFresh: task => {
            display(task, false);
            recordTaskView(contentEl, taskId, isCurrent);
        },
        onError: cached => {
            if (cached) {
                statusEl.textContent = t('task.cached_refresh_failed');
            } else {
                loadingEl.setAttribute("role", "alert");
                loadingEl.textContent = t('common.load_failed');
            }
        },
        isCurrent
    });
}

/** 仅确认在线详情后计浏览，迟到响应不能更新离开的页面。 */
async function recordTaskView(contentEl, taskId, isCurrent) {
    await recordView(api.recordTaskView, taskId, 'task', res => {
        if (isCurrent()) updateTaskViewStats(contentEl, res.views, res.daily_views);
    });
}

/**
 * 👀 更新任务浏览量显示
 */
function updateTaskViewStats(contentEl, views, dailyViews) {
    const totalEl = contentEl.querySelector("#task-view-total");
    const dailyEl = contentEl.querySelector("#task-view-daily");
    if (totalEl) totalEl.textContent = views || 0;
    if (dailyEl) dailyEl.textContent = dailyViews || 0;
}

/**
 * 🎨 渲染任务详情
 */
function _safeHttpHref(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return "";
        return url.href;
    } catch {
        return "";
    }
}

function renderTaskDetail(contentEl, task, currentUser, preview = false) {
    taskScopes.set(task, contentEl._taskScope);
    const statusStyles = {
        open: { bg: "#4CAF50", textKey: "task.status_open" },
        in_progress: { bg: "#2196F3", textKey: "task.status_in_progress" },
        submitted: { bg: "#FF9800", textKey: "task.status_submitted" },
        completed: { bg: "#9E9E9E", textKey: "task.status_completed" },
        disputed: { bg: "#F44336", textKey: "task.status_disputed" },
        cancelled: { bg: "#757575", textKey: "task.status_cancelled" }
    };
    
    const status = Object.prototype.hasOwnProperty.call(statusStyles, task.status)
        ? statusStyles[task.status]
        : { bg: "#666", textKey: "common.unknown" };
    const statusText = t(status.textKey);
    const currentAccount = typeof currentUser === 'string' ? currentUser : currentUser?.account;
    const isPublisher = Boolean(currentAccount) && currentAccount === task.publisher;
    const isAssignee = Boolean(currentAccount) && currentAccount === task.assignee;
    const applicants = Array.isArray(task.applicants)
        ? task.applicants.filter(app => app && typeof app === "object" && !Array.isArray(app))
        : [];
    const referenceImages = Array.isArray(task.reference_images)
        ? task.reference_images.filter(url => typeof url === "string" && url.trim())
        : [];
    const deliverables = Array.isArray(task.deliverables)
        ? task.deliverables.filter(url => typeof url === "string" && url.trim())
        : [];
    const tipBoard = Array.isArray(task.tip_board)
        ? task.tip_board.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        : [];
    const hasApplied = hasAppliedToTask(task, currentAccount);
    const safeReferenceLink = _safeHttpHref(task.reference_link);
    
    // 👍 检查当前用户是否已点赞/收藏
    const isLiked = Array.isArray(task.liked_by) && task.liked_by.includes(currentAccount);
    const isFavorited = Array.isArray(task.favorited_by) && task.favorited_by.includes(currentAccount);
    
    contentEl.innerHTML = `
        <!-- 状态 + 价格 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <span style="background: ${status.bg}; color: #fff; padding: 5px 12px; border-radius: 6px; font-size: 13px; font-weight: bold;">
                ${statusText}
            </span>
            <div style="text-align: right;">
                <div style="color: #FF9800; font-size: 20px; font-weight: bold;">💰 ${escapeHtml(task.total_price)} ${t('common.credits')}</div>
                <div style="font-size: 11px; color: #888;">${t('task.deposit')} ${escapeHtml(task.deposit_ratio)}%（${escapeHtml(task.deposit_amount)} ${t('common.credits')}）</div>
            </div>
        </div>
        
        <!-- 标题 -->
        <h2 style="font-size: 18px; font-weight: bold; color: #fff; margin: 0 0 15px 0; line-height: 1.4;">
            ${escapeHtml(task.title)}
        </h2>
        
        <!-- 发布者信息 -->
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: var(--comfy-menu-bg); border-radius: 8px;">
            <img src="${escapeHtml(task.publisher_avatar || PLACEHOLDERS.AVATAR_SMALL)}"
                 style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color, #333); cursor: pointer;" id="publisher-avatar">
            <div style="flex: 1;">
                <div style="color: #fff; font-size: 14px; font-weight: 500;">${escapeHtml(task.publisher_name || task.publisher)}</div>
                <div style="color: #888; font-size: 11px;">${t('task.published_at')} ${formatTime(task.created_at)}</div>
            </div>
            ${isPublisher && ["open", "in_progress", "submitted"].includes(task.status) ? `
            <div style="display: flex; gap: 8px;">
                ${IS_WEB_MODE ? '' : `<button id="btn-edit-task" style="background: #2196F3; border: none; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;" title="${t('common.edit')}">✏️ ${t('common.edit')}</button>`}
                ${task.status === "open" ? `
                <button id="btn-delete-task" style="background: #F44336; border: none; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;" title="${t('common.delete')}">🗑️ ${t('common.delete')}</button>
                ` : ''}
            </div>
            ` : ''}
            ${!isPublisher && currentUser ? `
                <button id="btn-chat-publisher" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                    💬 ${t('common.message')}
                </button>
            ` : ""}
        </div>
        
        <!-- 👀 浏览量统计 -->
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; padding: 10px; background: #1a1a1a; border-radius: 8px; color: #888; font-size: 12px;">
            <span style="display: flex; align-items: center; gap: 4px;">${t('task.view_total')}: <span id="task-view-total" style="color: #fff; font-weight: 500;">${escapeHtml(task.views || 0)}</span></span>
            <span style="display: flex; align-items: center; gap: 4px;">${t('task.view_today')}: <span id="task-view-daily" style="color: #fff; font-weight: 500;">${escapeHtml(task.daily_views || 0)}</span></span>
        </div>
        
        <!-- 截止日期 -->
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px; padding: 10px; background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.3); border-radius: 8px;">
            <span style="font-size: 18px;">⏰</span>
            <div>
                <div style="color: #FF9800; font-size: 13px; font-weight: bold;">${t('task.deadline')}</div>
                <div style="color: #fff; font-size: 14px;">${formatDeadline(task.deadline)}</div>
            </div>
        </div>
        
        <!-- 任务描述 -->
        <div style="margin-bottom: 20px;">
            <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">📄 ${t('task.description')}</div>
            <div style="color: #ccc; font-size: 13px; line-height: 1.6; white-space: pre-wrap; background: var(--comfy-menu-bg); padding: 12px; border-radius: 8px;">
${escapeHtml(task.description)}</div>
        </div>
        
        <!-- 参考图片 -->
        ${referenceImages.length > 0 ? `
            <div style="margin-bottom: 20px;" class="ref-images-sandbox">
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">🖼️ ${t('task.reference_images')}</div>
                <div style="--sandbox-title-display: none">
                    ${getCoverSandboxHTML(referenceImages, true).replace(/<div style="font-size: 12px[^>]*>[^<]*<\/div>/, '')}
                </div>
            </div>
        ` : ""}
        
        <!-- 参考链接 -->
        ${safeReferenceLink ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">🔗 ${t('task.reference_link')}</div>
                <a href="${escapeHtml(safeReferenceLink)}" target="_blank" rel="noopener noreferrer" style="color: #2196F3; font-size: 13px; word-break: break-all;">
                    ${escapeHtml(task.reference_link)}
                </a>
            </div>
        ` : ""}
        
        <!-- 👍 互动按钮栏 -->
        <div id="interaction-bar" style="display: flex; align-items: center; gap: 15px; padding: 15px 0; border-top: 1px solid var(--border-color, #333); border-bottom: 1px solid var(--border-color, #333); margin-bottom: 15px;">
            <button id="btn-like" style="background: ${isLiked ? '#FF5722' : 'var(--comfy-input-bg)'}; border: 1px solid ${isLiked ? '#FF5722' : '#555'}; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                ❤️ <span id="like-count">${escapeHtml(task.likes || 0)}</span>
            </button>
            <button id="btn-favorite" style="background: ${isFavorited ? '#FFC107' : 'var(--comfy-input-bg)'}; border: 1px solid ${isFavorited ? '#FFC107' : '#555'}; color: ${isFavorited ? '#000' : '#fff'}; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                🔖 <span id="favorite-count">${escapeHtml(task.favorites || 0)}</span>
            </button>
            <button id="btn-tip" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                💰 ${t('post.tip_author')}
            </button>
        </div>
        
        <!-- 💰 打赏榜单 -->
        <div id="tip-board-area" style="margin-bottom: 15px;">
            ${renderTipBoard(tipBoard)}
        </div>
        
        <!-- 💬 评论区 -->
        <div style="margin-bottom: 15px;">
            <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                💬 ${t('post.comments_title')} <span style="color: #888; font-weight: normal;">(${escapeHtml(task.comments || 0)})</span>
            </div>
            
            <!-- 评论输入框 -->
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <input type="text" id="comment-input" aria-label="${escapeHtml(t('post.comment_placeholder'))}" aria-required="true" required placeholder="${escapeHtml(t('post.comment_placeholder'))}" style="flex: 1; padding: 10px 12px; background: var(--comfy-input-bg); border: 1px solid #444; border-radius: 20px; color: #fff; font-size: 13px; outline: none;" onfocus="this.style.borderColor='#4CAF50'" onblur="this.style.borderColor='#444'">
                <button type="button" id="btn-send-comment" style="background: #4CAF50; border: none; color: #fff; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
                    ${t('common.send')}
                </button>
            </div>
            
            <!-- 评论列表 -->
            <div id="comments-list" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
                    ${t('post.comment_loading')}
                </div>
            </div>
        </div>
        
        <!-- 接单者信息（如果有） -->
        ${task.assignee ? `
            <div style="margin-bottom: 20px; padding: 12px; background: rgba(33,150,243,0.1); border: 1px solid rgba(33,150,243,0.3); border-radius: 8px;">
                <div style="font-size: 13px; font-weight: bold; color: #2196F3; margin-bottom: 8px;">👷 ${t('task.assignee')}</div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${escapeHtml(task.assignee_avatar || PLACEHOLDERS.AVATAR_SMALL)}"
                         style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                    <span style="color: #fff;">${escapeHtml(task.assignee_name || task.assignee)}</span>
                </div>
            </div>
        ` : ""}
        
        <!-- 交付成果（如果有） -->
        ${deliverables.length > 0 ? `
            <div style="margin-bottom: 20px; padding: 12px; background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.3); border-radius: 8px;" class="deliverables-sandbox">
                <div style="font-size: 13px; font-weight: bold; color: #FF9800; margin-bottom: 8px;">📦 ${t('task.deliverables')}</div>
                <div style="--sandbox-title-display: none">
                    ${getCoverSandboxHTML(deliverables, true).replace(/<div style="font-size: 12px[^>]*>[^<]*<\/div>/, '')}
                </div>
                ${task.submit_note ? `<div style="margin-top: 10px; color: #ccc; font-size: 12px;">${t('task.note')}: ${escapeHtml(task.submit_note)}</div>` : ""}
            </div>
        ` : ""}
        
        <!-- 申请者列表（仅发布者可见，且在 open 状态） -->
        ${isPublisher && task.status === "open" && applicants.length > 0 ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">👥 ${t('task.applicants')}（${applicants.length}${t('task.applicants_count')}）</div>
                <div id="applicants-list" style="display: flex; flex-direction: column; gap: 8px;">
                    ${applicants.map(app => `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--comfy-menu-bg); border-radius: 8px;">
                            <img src="${escapeHtml(app.avatar || PLACEHOLDERS.AVATAR_SMALL)}"
                                 style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                            <div style="flex: 1;">
                                <div style="color: #fff; font-size: 13px;">${escapeHtml(app.name || app.account)}</div>
                                ${app.message ? `<div style="color: #888; font-size: 11px; margin-top: 2px;">${escapeHtml(app.message)}</div>` : ""}
                            </div>
                            <button class="btn-assign" data-account="${escapeHtml(app.account)}" style="background: #4CAF50; border: none; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                ${t('task.choose_assignee')}
                            </button>
                        </div>
                    `).join("")}
                </div>
            </div>
        ` : ""}
        
        <!-- 操作按钮区域 -->
        <div id="action-buttons" style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color, #333);">
        </div>
    `;
    
    // 设置发布者 dataset，供评论区权限判断使用
    contentEl.dataset.publisher = task.publisher;
    
    if (preview) {
        // 预览不发评论/资料操作请求，不使用历史申请状态执行操作。
        contentEl.querySelectorAll("button, input, textarea, select").forEach(control => { control.disabled = true; });
        contentEl.querySelector("#action-buttons").textContent = t('task.cached_readonly');
        contentEl.querySelector("#comments-list").textContent = t('task.cached_readonly');
        setupImageSandboxEvents(contentEl);
        return;
    }

    // 渲染操作按钮
    renderActionButtons(contentEl.querySelector("#action-buttons"), task, currentUser, isPublisher, isAssignee, hasApplied);
    
    // 绑定编辑按钮
    contentEl.querySelector("#btn-edit-task")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("comfy-route-edit-task", { 
            detail: { taskData: task, currentUser } 
        }));
    });
    
    // 绑定删除按钮（仅open状态可删除）
    contentEl.querySelector("#btn-delete-task")?.addEventListener("click", () => {
        showDeleteTaskConfirm(task, contentEl);
    });
    
    // 绑定申请者列表的选择按钮
    contentEl.querySelectorAll(".btn-assign").forEach(btn => {
        btn.onclick = () => {
            const assignee = btn.dataset.account;
            showAssignConfirmDialog(task, assignee, contentEl, currentUser);
        };
    });
    
    // 绑定图片沙盒交互（缩放、拖动、轮播等）
    setupImageSandboxEvents(contentEl);
    
    // 👍 绑定互动事件（点赞/收藏/打赏）
    bindTaskInteractionEvents(contentEl, task, currentUser);
    
    // 💬 加载评论
    loadTaskComments(contentEl, task.id, currentUser);
}

/**
 * 🔧 通用确认对话框工厂函数
 */
function _showConfirmDialog({ scope, title, icon, message, description, confirmText, confirmStyle, loadingText, errorText, width, onConfirm, onSuccess, validateResult = result => result?.status === "success" }) {
    let phase = "idle";
    const content = document.createElement("div");
    content._cleanup = () => { phase = "closed"; };
    content.style.color = "#ccc";
    // 🔒 XSS防护：message/description 可能嵌入其他用户的账号或昵称
    // （如 t('task.confirm_assign', { assignee })），写入 innerHTML 前必须转义。
    // 本函数的 4 个调用方传的都是词典文本/emoji/数字，转义不改变现有显示效果。
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">${icon}</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${escapeHtml(message)}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${escapeHtml(description)}</div>
            <div style="display: flex; gap: 10px;">
                <button id="dialog-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="dialog-confirm" style="flex: 1; ${confirmStyle}; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#dialog-cancel").onclick = () => {
        if (taskModalCurrent(content)) closeTaskModal(content);
    };

    const confirmBtn = content.querySelector("#dialog-confirm");
    confirmBtn.onclick = async () => {
        if (phase !== "idle" || !taskModalCurrent(content)) return;
        phase = "submitting";
        confirmBtn.disabled = true;
        confirmBtn.textContent = loadingText || `⏳ ${t('common.confirming')}...`;
        content.setAttribute("aria-busy", "true");
        try {
            const result = await onConfirm(content);
            if (!taskModalCurrent(content) || phase === "closed") return;
            if (!validateResult(result)) throw new Error("Unconfirmed task operation");
            phase = "committed";
            await onSuccess(content);
        } catch (err) {
            if (!taskModalCurrent(content) || phase === "closed" || phase === "committed") return;
            const rejected = [400, 401, 403, 404, 409, 422, 429].includes(err?.status);
            phase = rejected ? "idle" : "unconfirmed";
            showToast(rejected ? errorText : t('task.operation_unconfirmed'), rejected ? "error" : "warning");
        } finally {
            if (!taskModalCurrent(content) || phase === "closed") return;
            content.removeAttribute("aria-busy");
            confirmBtn.disabled = phase !== "idle";
            confirmBtn.textContent = phase === "unconfirmed" ? t('task.operation_pending') : confirmText;
        }
    };

    openTaskModal(scope, title, content, { width: width || "350px" });
}

/**
 * 👤 显示接受任务申请确认对话框
 */
function showAssignConfirmDialog(task, assignee, contentEl, currentUser) {
    const taskId = task.id;
    _showConfirmDialog({
        scope: taskScopes.get(task),
        title: t('task.choose_assignee'),
        icon: '👤',
        message: t('task.confirm_assign', { assignee }),
        description: t('task.confirm_deposit', { amount: task.deposit_amount }),
        confirmText: t('common.confirm'),
        confirmStyle: 'background: #4CAF50',
        errorText: t('task.assign_failed'),
        onConfirm: () => api.assignTask(taskId, assignee),
        onSuccess: async (content) => {
            showToast(t('task.assign_success'), "success");
            closeTaskModal(content);
            loadTaskDetail(contentEl.closest("div"), taskId, currentUser);
        }
    });
}

/** 申请与退回文字表单：固定输入快照，未知结果不重新开放写请求。 */
function bindTaskTextSubmission({ content, taskId, input, button, confirmText, errorText, successText, trimValue, requiredText, submit, onSuccess }) {
    let phase = "idle";
    content._cleanup = () => { phase = "closed"; };
    input.addEventListener("input", () => {
        if (phase === "idle" && taskModalCurrent(content)) input.removeAttribute("aria-invalid");
    });
    button.onclick = async () => {
        if (phase !== "idle" || !taskModalCurrent(content)) return;
        const value = trimValue ? input.value.trim() : input.value;
        if (requiredText && !value) {
            input.setAttribute("aria-invalid", "true");
            input.focus();
            showToast(requiredText, "warning");
            return;
        }
        if (typeof taskId !== "string" || !taskId.trim()) {
            showToast(errorText, "error");
            return;
        }
        phase = "submitting";
        button.disabled = true;
        input.readOnly = true;
        button.textContent = `⏳ ${t('common.submitting')}...`;
        content.setAttribute("aria-busy", "true");
        try {
            const result = await submit(taskId, value);
            if (!taskModalCurrent(content) || phase === "closed") return;
            if (result?.status !== "success") throw new Error("Unconfirmed task text submission");
            phase = "committed";
            showToast(successText, "success");
            closeTaskModal(content);
            await onSuccess();
        } catch (err) {
            if (!taskModalCurrent(content) || phase === "closed" || phase === "committed") return;
            const rejected = [400, 401, 403, 404, 409, 422, 429].includes(err?.status);
            phase = rejected ? "idle" : "unconfirmed";
            showToast(rejected ? errorText : t('task.operation_unconfirmed'), rejected ? "error" : "warning");
        } finally {
            if (!taskModalCurrent(content) || phase === "closed") return;
            content.removeAttribute("aria-busy");
            button.disabled = phase !== "idle";
            input.readOnly = phase !== "idle";
            button.textContent = phase === "unconfirmed" ? t('task.operation_pending') : confirmText;
        }
    };
}

/**
 * 🙋 显示申请接单对话框
 */
function showApplyDialog(task, currentUser) {
    const taskId = task.id;
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 15px;">
            <label for="apply-message" style="display: block; color: #888; font-size: 12px; margin-bottom: 8px;">${t('task.apply_message_prompt')}</label>
            <textarea id="apply-message" rows="4" placeholder="${t('task.apply_message_placeholder')}" style="width: 100%; padding: 10px; background: var(--comfy-input-bg); border: 1px solid #444; border-radius: 6px; color: #fff; resize: none; box-sizing: border-box; font-size: 13px;"></textarea>
        </div>
        <div style="display: flex; gap: 10px;">
            <button type="button" id="apply-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
            <button type="button" id="apply-confirm" style="flex: 1; background: #FF9800; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.confirm_submit')}</button>
        </div>
    `;
    
    content.querySelector("#apply-cancel").onclick = () => {
        if (taskModalCurrent(content)) closeTaskModal(content);
    };
    bindTaskTextSubmission({
        content, taskId,
        input: content.querySelector("#apply-message"),
        button: content.querySelector("#apply-confirm"),
        confirmText: t('common.confirm_submit'), errorText: t('task.apply_failed'), successText: t('task.apply_success'),
        trimValue: false, requiredText: null,
        submit: (id, value) => api.applyTask(id, value),
        onSuccess: () => {
            const container = taskScopes.get(task)?.root;
            if (container && currentUser) return loadTaskDetail(container, taskId, currentUser);
        }
    });

    openTaskModal(taskScopes.get(task), t('task.apply_task'), content, { width: "400px" });
}

/**
 * ↩️ 显示撤回申请确认对话框
 */
function showCancelApplyConfirmDialog(task, currentUser) {
    const taskId = task.id;
    _showConfirmDialog({
        scope: taskScopes.get(task),
        title: t('task.cancel_apply'),
        icon: '↩️',
        message: t('task.confirm_cancel_apply'),
        description: t('task.cancel_apply_warning'),
        confirmText: t('common.confirm'),
        confirmStyle: 'background: #FF9800',
        errorText: t('task.cancel_apply_failed'),
        onConfirm: () => api.cancelApplyTask(taskId),
        onSuccess: async (content) => {
            showToast(t('task.apply_cancelled'), "success");
            closeTaskModal(content);
            const container = taskScopes.get(task)?.root;
            if (container && currentUser) {
                loadTaskDetail(container, taskId, currentUser);
            }
        }
    });
}

/**
 * ❌ 显示取消任务确认对话框
 */
function showCancelTaskConfirmDialog(task) {
    const taskId = task.id;
    _showConfirmDialog({
        scope: taskScopes.get(task),
        title: t('task.cancel_task'),
        icon: '⚠️',
        message: t('task.confirm_cancel_task'),
        description: t('task.cancel_task_warning'),
        confirmText: t('task.cancel_task'),
        confirmStyle: 'background: #F44336',
        loadingText: `⏳ ${t('common.cancelling')}...`,
        errorText: t('task.cancel_task_failed'),
        onConfirm: () => api.cancelTask(taskId),
        validateResult: result => result?.status === "success" && Number.isSafeInteger(result.refunded_amount) && result.refunded_amount >= 0,
        onSuccess: async (content) => {
            showToast(t('task.task_cancelled'), "success");
            closeTaskModal(content);
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        }
    });
}

/**
 * ✅ 显示验收通过确认对话框
 */
function showAcceptConfirmDialog(task, currentUser) {
    const taskId = task.id;
    _showConfirmDialog({
        scope: taskScopes.get(task),
        title: t('task.accept_work'),
        icon: '✅',
        message: t('task.confirm_accept'),
        description: t('task.confirm_pay_remaining', { amount: task.total_price - task.deposit_amount }),
        confirmText: t('task.accept_work'),
        confirmStyle: 'background: #4CAF50',
        errorText: t('common.operation_failed'),
        onConfirm: () => api.acceptTask(taskId, true),
        onSuccess: async (content) => {
            showToast(t('task.accept_success'), "success");
            closeTaskModal(content);
            const container = taskScopes.get(task)?.root;
            if (container && currentUser) {
                loadTaskDetail(container, taskId, currentUser);
            }
        }
    });
}

/**
 * ❌ 显示验收拒绝对话框
 */
function showRejectDialog(task, currentUser) {
    const taskId = task.id;
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 15px;">
            <label for="reject-feedback" style="display: block; color: #888; font-size: 12px; margin-bottom: 8px;">${t('task.reject_reason_prompt')}</label>
            <textarea aria-required="true" id="reject-feedback" rows="4" placeholder="${t('task.reject_reason_placeholder')}" style="width: 100%; padding: 10px; background: var(--comfy-input-bg); border: 1px solid #444; border-radius: 6px; color: #fff; resize: none; box-sizing: border-box; font-size: 13px;"></textarea>
        </div>
        <div style="display: flex; gap: 10px;">
            <button type="button" id="reject-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
            <button type="button" id="reject-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('task.reject_work')}</button>
        </div>
    `;
    
    content.querySelector("#reject-cancel").onclick = () => {
        if (taskModalCurrent(content)) closeTaskModal(content);
    };
    bindTaskTextSubmission({
        content, taskId,
        input: content.querySelector("#reject-feedback"),
        button: content.querySelector("#reject-confirm"),
        confirmText: t('task.reject_work'), errorText: t('common.operation_failed'), successText: t('task.work_returned'),
        trimValue: true, requiredText: t('task.reject_reason_required'),
        submit: (id, value) => api.acceptTask(id, false, value),
        onSuccess: () => {
            const container = taskScopes.get(task)?.root;
            if (container && currentUser) return loadTaskDetail(container, taskId, currentUser);
        }
    });

    openTaskModal(taskScopes.get(task), t('task.reject_work'), content, { width: "400px" });
}

/**
 * 🗑️ 显示删除评论确认对话框
 */
function showDeleteCommentConfirmDialog(taskId, comment, container, currentUser) {
    const commentId = comment.id;
    let phase = "idle";
    const content = document.createElement("div");
    content._cleanup = () => { phase = "closed"; };
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('post.delete_comment_confirm')}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('post.delete_comment_warning')}</div>
            <div style="display: flex; gap: 10px;">
                <button type="button" id="delete-comment-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button type="button" id="delete-comment-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.delete')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#delete-comment-cancel").onclick = () => {
        if (taskModalCurrent(content)) closeTaskModal(content);
    };
    const confirmBtn = content.querySelector("#delete-comment-confirm");
    confirmBtn.onclick = async () => {
        if (phase !== "idle" || !taskModalCurrent(content)) return;
        phase = "submitting";
        confirmBtn.disabled = true;
        confirmBtn.textContent = t('common.deleting');
        content.setAttribute("aria-busy", "true");
        try {
            const result = await api.deleteComment(taskId, commentId);
            if (!taskModalCurrent(content) || phase === "closed") return;
            if (result?.status !== "success") throw new Error("Unconfirmed task comment deletion");
            phase = "committed";
            showToast(t('post.delete_comment_success'), "success");
            closeTaskModal(content);
            await loadTaskComments(container, taskId, currentUser);
        } catch (err) {
            if (!taskModalCurrent(content) || phase === "closed" || phase === "committed") return;
            const rejected = [400, 401, 403, 404, 409, 422, 429].includes(err?.status);
            phase = rejected ? "idle" : "unconfirmed";
            showToast(t(rejected ? 'post.delete_comment_failed' : 'task.comment_unconfirmed'), rejected ? "error" : "warning");
        } finally {
            if (!taskModalCurrent(content) || phase === "closed") return;
            content.removeAttribute("aria-busy");
            confirmBtn.disabled = phase !== "idle";
            confirmBtn.textContent = t(phase === "unconfirmed" ? 'task.comment_pending' : 'common.delete');
        }
    };

    openTaskModal(container._taskScope, t('common.delete'), content, { width: "350px" });
}

/**
 * 🎮 渲染操作按钮
 */
function renderActionButtons(container, task, currentUser, isPublisher, isAssignee, hasApplied) {
    let buttons = [];
    
    if (!currentUser) {
        buttons.push(`<div style="text-align: center; color: #888; font-size: 13px;">${t('common.login_required')}</div>`);
    } else if (task.status === "open") {
        if (isPublisher) {
            buttons.push(`
                <button id="btn-cancel-task" style="background: #F44336; border: none; color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">
                    ❌ ${t('task.cancel_task')}
                </button>
            `);
        } else if (hasApplied) {
            buttons.push(`
                <button id="btn-cancel-apply" style="background: #757575; border: none; color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">
                    ${t('task.cancel_apply')}
                </button>
            `);
        } else {
            buttons.push(`
                <button id="btn-apply" style="background: linear-gradient(135deg, #FF9800, #F57C00); border: none; color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(255,152,0,0.3);">
                    🙋 ${t('task.apply_task')}
                </button>
            `);
        }
    } else if (task.status === "in_progress") {
        if (isAssignee) {
            buttons.push(`
                <button id="btn-submit" style="background: linear-gradient(135deg, #4CAF50, #45a049); border: none; color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">
                    📤 ${t('task.submit_work')}
                </button>
            `);
        }
    } else if (task.status === "submitted") {
        if (isPublisher) {
            buttons.push(`
                <button id="btn-accept" style="background: #4CAF50; border: none; color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; margin-bottom: 8px;">
                    ✅ ${t('task.accept_work')}
                </button>
                <button id="btn-reject" style="background: #F44336; border: none; color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">
                    ❌ ${t('task.reject_work')}
                </button>
            `);
        }
    }
    
    // 申诉按钮（进行中或待验收时，双方都可以申诉）
    if ((task.status === "in_progress" || task.status === "submitted") && (isPublisher || isAssignee)) {
        buttons.push(`
            <button id="btn-dispute" style="background: #757575; border: none; color: #fff; padding: 10px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 10px;">
                ⚖️ ${t('task.start_dispute')}
            </button>
        `);
    }
    
    // 查看申诉详情按钮（争议中状态）
    if (task.status === "disputed" && task.dispute_id && (isPublisher || isAssignee)) {
        buttons.push(`
            <button id="btn-view-dispute" style="background: linear-gradient(135deg, #9C27B0, #7B1FA2); border: none; color: #fff; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: bold; margin-top: 10px;">
                ⚖️ ${t('task.view_dispute')}
            </button>
        `);
    }
    
    container.innerHTML = buttons.join("");
    
    // 绑定事件
    bindActionEvents(container, task, currentUser);
}

/**
 * 🔌 绑定操作按钮事件
 */
function bindActionEvents(container, task, currentUser) {
    // 申请接单
    container.querySelector("#btn-apply")?.addEventListener("click", () => {
        showApplyDialog(task, currentUser);
    });
    
    // 撤回申请
    container.querySelector("#btn-cancel-apply")?.addEventListener("click", () => {
        showCancelApplyConfirmDialog(task, currentUser);
    });
    
    // 取消任务
    container.querySelector("#btn-cancel-task")?.addEventListener("click", () => {
        showCancelTaskConfirmDialog(task);
    });
    
    // 提交成果
    container.querySelector("#btn-submit")?.addEventListener("click", () => {
        showSubmitDialog(task, currentUser);
    });
    
    // 验收通过
    container.querySelector("#btn-accept")?.addEventListener("click", () => {
        showAcceptConfirmDialog(task, currentUser);
    });
    
    // 验收不通过
    container.querySelector("#btn-reject")?.addEventListener("click", () => {
        showRejectDialog(task, currentUser);
    });
    
    // 发起申诉（增强版：弹窗式，支持上传证据）
    container.querySelector("#btn-dispute")?.addEventListener("click", () => {
        showDisputeDialog(task, currentUser);
    });
    
    // 查看申诉详情
    container.querySelector("#btn-view-dispute")?.addEventListener("click", () => {
        const scope = taskScopes.get(task);
        const button = container.querySelector("#btn-view-dispute");
        const current = () => Boolean(button?.isConnected && scope?.isCurrent());
        if (!current()) return;
        import("./申诉详情组件.js").then(module => {
            if (!current()) return;
            const view = module.createDisputeDetailView(task.dispute_id, currentUser, () => {
                window.dispatchEvent(new CustomEvent("comfy-route-back"));
            });
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(() => {
            if (current()) showToast(t('dispute.get_detail_failed'), 'error');
        });
    });
}

/**
 * 📤 显示提交成果对话框
 */
function showSubmitDialog(task, currentUser) {
    const taskId = task.id;
    let phase = "idle";
    const content = document.createElement("div");
    content._cleanup = () => { phase = "closed"; };
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 15px;">
            <label for="deliverable-files" style="display: block; color: #ccc; font-size: 13px; margin-bottom: 5px;">${t('task.deliverable_images')} <span aria-hidden="true">*</span></label>
            <input type="file" aria-required="true" aria-describedby="deliverable-hint" id="deliverable-files" multiple accept="image/*" style="width: 100%; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; border-radius: 6px; color: #fff;">
            <div id="deliverable-hint" style="font-size: 11px; color: #888; margin-top: 4px;">${t('task.support_multiple_images')}</div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <label for="submit-note" style="display: block; color: #ccc; font-size: 13px; margin-bottom: 5px;">${t('task.note_optional')}</label>
            <textarea id="submit-note" rows="3" placeholder="${t('task.note_placeholder')}" style="width: 100%; padding: 8px; background: var(--comfy-input-bg); border: 1px solid #555; border-radius: 6px; color: #fff; resize: none; box-sizing: border-box;"></textarea>
        </div>
        
        <div style="display: flex; gap: 10px;">
            <button type="button" id="btn-cancel-modal" style="flex: 1; padding: 10px; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
            <button type="button" id="btn-confirm-submit" style="flex: 1; padding: 10px; background: #4CAF50; border: none; color: #fff; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.confirm_submit')}</button>
        </div>
    `;
    
    content.querySelector("#btn-cancel-modal").onclick = () => {
        if (taskModalCurrent(content)) closeTaskModal(content);
    };
    const filesInput = content.querySelector("#deliverable-files");
    const noteInput = content.querySelector("#submit-note");
    const confirmBtn = content.querySelector("#btn-confirm-submit");
    filesInput.addEventListener("change", () => {
        if (phase === "idle" && taskModalCurrent(content)) filesInput.removeAttribute("aria-invalid");
    });
    confirmBtn.onclick = async () => {
        if (phase !== "idle" || !taskModalCurrent(content)) return;
        const files = Array.from(filesInput.files || []);
        const note = noteInput.value;
        if (!files.length) {
            filesInput.setAttribute("aria-invalid", "true");
            filesInput.focus();
            showToast(t('task.please_upload_deliverables'), "warning");
            return;
        }
        if (typeof taskId !== "string" || !taskId.trim()) {
            showToast(t('task.submit_failed'), "error");
            return;
        }
        phase = "submitting";
        filesInput.disabled = confirmBtn.disabled = true;
        noteInput.readOnly = true;
        content.setAttribute("aria-busy", "true");
        let saveAttempted = false;
        try {
            const deliverables = [];
            for (let i = 0; i < files.length; i++) {
                confirmBtn.textContent = `⏳ ${t('common.upload_progress', { current: i + 1, total: files.length })}...`;
                if (!taskModalCurrent(content) || phase === "closed") return;
                const processedFile = await compressImageForUpload(files[i]);
                if (!taskModalCurrent(content) || phase === "closed") return;
                const response = await api.uploadFile(processedFile, "task");
                if (!taskModalCurrent(content) || phase === "closed") return;
                if (response?.status !== "success" || typeof response.url !== "string" || !response.url.trim()) {
                    throw new Error("Unconfirmed task image upload");
                }
                deliverables.push(response.url);
            }
            confirmBtn.textContent = `⏳ ${t('common.submitting')}...`;
            if (!taskModalCurrent(content) || phase === "closed") return;
            saveAttempted = true;
            const result = await api.submitTask(taskId, deliverables, note || null);
            if (!taskModalCurrent(content) || phase === "closed") return;
            if (result?.status !== "success") throw new Error("Unconfirmed task delivery");
            phase = "committed";
            showToast(t('task.submit_success_waiting'), "success");
            closeTaskModal(content);
            const container = taskScopes.get(task)?.root;
            if (container && currentUser) await loadTaskDetail(container, taskId, currentUser);
        } catch (err) {
            if (!taskModalCurrent(content) || phase === "closed" || phase === "committed") return;
            const unknown = saveAttempted && ![400, 401, 403, 404, 409, 422, 429].includes(err?.status);
            phase = unknown ? "unconfirmed" : "idle";
            showToast(t(unknown ? 'task.operation_unconfirmed' : (saveAttempted ? 'task.submit_failed' : 'task.upload_failed_retry')),
                unknown ? "warning" : "error");
        } finally {
            if (!taskModalCurrent(content) || phase === "closed") return;
            content.removeAttribute("aria-busy");
            filesInput.disabled = confirmBtn.disabled = phase !== "idle";
            noteInput.readOnly = phase !== "idle";
            confirmBtn.textContent = t(phase === "unconfirmed" ? 'task.operation_pending' : 'common.confirm_submit');
        }
    };

    openTaskModal(taskScopes.get(task), `📤 ${t('task.submit_work')}`, content, { width: "450px" });
}

/**
 * 🔗 绑定任务互动事件（点赞/收藏/打赏）- 使用公共工具函数
 */
function bindTaskInteractionEvents(container, task, currentUser) {
    const scope = taskScopes.get(task);
    const btnLike = container.querySelector("#btn-like");
    const btnFavorite = container.querySelector("#btn-favorite");
    const btnTip = container.querySelector("#btn-tip");
    const likeCount = container.querySelector("#like-count");
    const favoriteCount = container.querySelector("#favorite-count");
    
    // 点赞 - 使用公共工具函数
    if (btnLike) {
        btnLike.onclick = () => {
            handleToggleLike(api.toggleTaskLike, task.id, btnLike, likeCount, currentUser, { isCurrent: () => !!scope?.isCurrent() });
        };
    }
    
    // 收藏 - 使用公共工具函数
    if (btnFavorite) {
        btnFavorite.onclick = () => {
            handleToggleFavorite(api.toggleTaskFavorite, task.id, btnFavorite, favoriteCount, currentUser, { isCurrent: () => !!scope?.isCurrent() });
        };
    }
    
    // 打赏
    if (btnTip) {
        btnTip.onclick = () => {
            if (!currentUser) {
                showToast(t('auth.login_required'), "warning");
                return;
            }
            if (currentUser.account === task.publisher) {
                showToast(t('post.tip_self'), "warning");
                return;
            }
            showTaskTipDialog(task, currentUser, container);
        };
    }
}

/**
 * 🎁 显示任务打赏对话框
 */
function showTaskTipDialog(task, currentUser, container) {
    const taskId = task.id;
    let phase = "idle";
    const content = document.createElement("div");
    content._cleanup = () => { phase = "closed"; };
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 15px;">
            ${TASK_LIMITS.TIP_AMOUNTS.map(amount => `<button type="button" class="tip-amount" data-amount="${amount}" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">${amount} ${t('task.points')}</button>`).join("")}
        </div>
        <div style="display: flex; gap: 10px;">
            <button type="button" id="tip-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
        </div>
    `;

    openTaskModal(taskScopes.get(task), `🎁 ${t('post.tip_dialog_title')}`, content, { width: "300px" });

    content.querySelector("#tip-cancel").onclick = () => {
        if (taskModalCurrent(content)) closeTaskModal(content);
    };
    const amountButtons = Array.from(content.querySelectorAll(".tip-amount"));
    amountButtons.forEach(btn => {
        const preset = btn.dataset.amount;
        btn.onclick = async () => {
            if (phase !== "idle" || !taskModalCurrent(content)) return;
            const rawAmount = btn.dataset.amount;
            const amount = typeof rawAmount === "string" && /^\d+$/.test(rawAmount) ? Number(rawAmount) : NaN;
            if (rawAmount !== preset || !Number.isSafeInteger(amount) || !TASK_LIMITS.TIP_AMOUNTS.includes(amount)) {
                showToast(t('tip.integer_amount'), "warning");
                return;
            }
            if (typeof taskId !== "string" || !taskId.trim()) {
                showToast(t('post.tip_failed'), "error");
                return;
            }
            phase = "submitting";
            amountButtons.forEach(button => { button.disabled = true; });
            content.setAttribute("aria-busy", "true");
            try {
                const result = await api.tipTask(taskId, amount, false);
                if (!taskModalCurrent(content) || phase === "closed") return;
                if (result?.status !== "success") throw new Error("Unconfirmed task tip");
                phase = "committed";
                showToast(t('post.tip_success', { amount }), "success");
                closeTaskModal(content);
                await loadTaskDetail(container.closest("div"), taskId, currentUser);
            } catch (_) {
                if (!taskModalCurrent(content) || phase === "closed" || phase === "committed") return;
                phase = "unconfirmed";
                showToast(t('tip.unknown_result'), "warning");
            } finally {
                if (!taskModalCurrent(content) || phase === "closed") return;
                content.removeAttribute("aria-busy");
                amountButtons.forEach(button => { button.disabled = phase !== "idle"; });
            }
        };
    });
}
/**
 * 🎁 渲染打赏榜单 - 使用公共工具函数
 */
function renderTipBoard(tipBoard) {
    return renderCommonTipBoardHTML(tipBoard, 5, t('post.no_tips'));
}

/**
 * 🖼️ 渲染评论头像HTML
 */
function _renderCommentAvatar(name, avatarUrl) {
    const initial = String(name || 'U')[0].toUpperCase();
    // 🔒 XSS防护：评论者昵称与头像均来自他人可修改的资料，写入 HTML 前必须转义
    return avatarUrl 
        ? `<img class="swr-avatar" src="${escapeHtml(avatarUrl)}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: var(--comfy-input-bg);">`
        : `<div class="swr-avatar" style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">${escapeHtml(initial)}</div>`;
}

/**
 * 💬 加载任务评论
 */
async function loadTaskComments(container, taskId, currentUser) {
    const commentsList = container.querySelector("#comments-list");
    const commentInput = container.querySelector("#comment-input");
    const sendBtn = container.querySelector("#btn-send-comment");
    const scope = container._taskScope;
    const account = typeof currentUser === "string" ? currentUser : currentUser?.account;
    let state = taskCommentStates.get(container);
    if (!state || state.list !== commentsList || state.input !== commentInput || state.button !== sendBtn
        || state.taskId !== taskId || state.account !== account || state.scope !== scope) {
        state?.dispose();
        state = { list: commentsList, input: commentInput, button: sendBtn, taskId, account, scope, phase: "idle", generation: 0, bound: false };
        state.dispose = () => {
            state.phase = "closed";
            state.release?.();
            if (commentInput) { commentInput.value = ""; commentInput.readOnly = true; }
            if (sendBtn) { sendBtn.disabled = true; sendBtn.removeAttribute("aria-busy"); }
            if (taskCommentStates.get(container) === state) taskCommentStates.delete(container);
        };
        taskCommentStates.set(container, state);
        state.release = scope?.addCleanup?.(state.dispose);
    }
    const isCurrent = () => state.phase !== "closed" && taskCommentStates.get(container) === state
        && (!scope || scope.isCurrent()) && commentsList?.isConnected
        && container.querySelector("#comments-list") === commentsList
        && container.querySelector("#comment-input") === commentInput && container.querySelector("#btn-send-comment") === sendBtn;
    if (!isCurrent()) return;
    const generation = ++state.generation;
    const readCurrent = () => isCurrent() && generation === state.generation;

    try {
        const res = await api.getTaskComments(taskId, { componentId: scope?.componentId, noCache: true, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES });
        if (!readCurrent()) return;
        let comments = requireListResponseData(res);
        comments = proxyImages(comments);
        
        if (comments.length === 0) {
            commentsList.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #666; font-size: 13px;">
                    ${t('post.no_comments')}
                </div>
            `;
        } else {
            // 🚀 SWR 头像渲染：评论作者头像
            commentsList.innerHTML = comments.map((c, idx) => {
                const cached = getCachedProfile(c.author);
                const avatar = cached?.avatar || c.author_avatar || '';
                const name = cached?.name || c.author_name || c.author || '';
                const avatarHtml = _renderCommentAvatar(name, avatar);
                
                // 判断是否有删除权限（评论作者/任务发布者/管理员）
                const currentAccount = typeof currentUser === 'string' ? currentUser : currentUser?.account;
                const canDelete = currentUser && (
                    currentAccount === c.author || 
                    currentAccount === container.dataset?.publisher ||
                    isAdmin(currentAccount)
                );
                
                return `
                    <div id="task-comment-${idx}" data-account="${escapeHtml(c.author)}" data-comment-id="${escapeHtml(c.id || idx)}" style="background: #1a1a1a; padding: 12px; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <div class="swr-avatar-container">${avatarHtml}</div>
                            <span class="swr-name" style="font-size: 13px; color: #fff; font-weight: 500;">${escapeHtml(name)}</span>
                            <span style="font-size: 11px; color: #888; margin-left: auto;">${formatTime(c.created_at)}</span>
                            ${canDelete ? `<button class="btn-delete-comment" data-idx="${idx}" style="background: transparent; border: none; color: #f44; cursor: pointer; font-size: 11px; padding: 2px 6px;">🗑️</button>` : ''}
                        </div>
                        <div style="font-size: 13px; color: #ddd; line-height: 1.5; padding-left: 32px;">
                            ${escapeHtml(c.content)}
                        </div>
                    </div>
                `;
            }).join("");
            
            // 后台静默校对每个评论作者的头像
            comments.forEach((c, idx) => {
                const originalCommentEl = commentsList.querySelector(`#task-comment-${idx}`);
                getProfileWithSWR(c.author, api.getUserProfile, (profile) => {
                    if (!isCurrent() || !profile || typeof profile !== "object") return;
                    const commentEl = commentsList.querySelector(`#task-comment-${idx}`);
                    if (!commentEl || commentEl !== originalCommentEl) return;
                    const avatarContainer = commentEl.querySelector('.swr-avatar-container');
                    const nameEl = commentEl.querySelector('.swr-name');
                    
                    if (avatarContainer && profile.avatar) {
                        avatarContainer.innerHTML = _renderCommentAvatar(profile.name || nameEl?.textContent || c.author_name || c.author, profile.avatar);
                    }
                    if (nameEl && profile.name) nameEl.textContent = profile.name;
                });
            });
            
            // 绑定删除评论按钮事件
            commentsList.querySelectorAll(".btn-delete-comment").forEach(btn => {
                btn.onclick = () => {
                    if (!readCurrent() || !btn.isConnected) return;
                    const idx = parseInt(btn.dataset.idx);
                    const comment = comments[idx];
                    if (!comment) return;
                    showDeleteCommentConfirmDialog(taskId, comment, container, currentUser);
                };
            });
        }
    } catch (err) {
        if (!readCurrent()) return;
        commentsList.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #F44336; font-size: 12px;">
                ${t('post.comment_load_failed')}
            </div>
        `;
    }
    
    // 同一组输入/按钮只绑定一次；列表刷新不重新开放在途或未知提交。
    if (sendBtn && commentInput && !state.bound && isCurrent()) {
        state.bound = true;
        sendBtn.disabled = false;
        sendBtn.removeAttribute("aria-busy");
        sendBtn.textContent = t('common.send');
        commentInput.readOnly = false;
        commentInput.removeAttribute("aria-invalid");
        commentInput.oninput = () => {
            if (state.phase === "idle" && isCurrent() && commentInput.value.trim()) commentInput.removeAttribute("aria-invalid");
        };
        sendBtn.onclick = async () => {
            if (state.phase !== "idle" || !isCurrent()) return;
            if (!account) { showToast(t('auth.login_required'), "warning"); return; }
            const value = commentInput.value.trim();
            if (!value) {
                commentInput.setAttribute("aria-invalid", "true");
                commentInput.focus();
                showToast(t('post.comment_required'), "warning");
                return;
            }
            commentInput.removeAttribute("aria-invalid");
            state.phase = "submitting";
            sendBtn.disabled = true;
            sendBtn.setAttribute("aria-busy", "true");
            commentInput.readOnly = true;
            sendBtn.textContent = t('post.comment_sending');
            try {
                const result = await api.addTaskComment(taskId, value);
                if (!isCurrent()) return;
                if (result?.status !== "success" || typeof result.data?.id !== "string" || !result.data.id.trim()
                    || result.data.author !== account || result.data.content !== value) throw new Error("Unconfirmed task comment");
                state.phase = "committed";
                commentInput.value = "";
                showToast(t('post.comment_success'), "success");
                await loadTaskComments(container, taskId, currentUser);
                if (isCurrent()) state.phase = "idle";
            } catch (err) {
                if (!isCurrent() || state.phase === "committed") return;
                const rejected = [400, 401, 403, 404, 409, 422, 429].includes(err?.status);
                state.phase = rejected ? "idle" : "unconfirmed";
                showToast(t(rejected ? 'post.comment_failed' : 'task.comment_unconfirmed'), rejected ? "error" : "warning");
            } finally {
                if (!isCurrent()) return;
                sendBtn.removeAttribute("aria-busy");
                sendBtn.disabled = state.phase !== "idle";
                commentInput.readOnly = state.phase !== "idle";
                sendBtn.textContent = t(state.phase === "unconfirmed" ? 'task.comment_pending' : 'common.send');
            }
        };
        commentInput.onkeydown = event => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
                event.preventDefault();
                sendBtn.click();
            }
        };
    }
}
/**
 * 🕐 格式化时间
 */
function formatTime(timestamp) {
    if (!timestamp) return "";
    const seconds = Number(timestamp);
    const date = new Date(seconds * 1000);
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(date.getTime())) return t('common.unknown');
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

/**
 * 📅 格式化截止日期
 */
function formatDeadline(deadline) {
    if (!deadline) return t('time.unlimited');
    try {
        const date = new Date(deadline);
        if (!Number.isFinite(date.getTime())) return t('common.unknown');
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    } catch {
        return t('common.unknown');
    }
}

/**
 * 🗑️ 显示删除任务确认对话框
 */
function showDeleteTaskConfirm(task, contentEl) {
    const taskId = task.id;
    let phase = "idle";
    const content = document.createElement("div");
    content._cleanup = () => { phase = "closed"; };
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('task.delete_confirm_title')}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('task.delete_confirm_desc')}</div>
            <div style="display: flex; gap: 10px;">
                <button id="delete-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="delete-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.delete')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#delete-cancel").onclick = () => {
        if (taskModalCurrent(content)) closeTaskModal(content);
    };

    const confirmBtn = content.querySelector("#delete-confirm");
    confirmBtn.onclick = async () => {
        if (phase !== "idle" || !taskModalCurrent(content)) return;
        if (typeof taskId !== "string" || !taskId.trim()) {
            showToast(t('task.delete_failed'), "error");
            return;
        }
        phase = "submitting";
        confirmBtn.disabled = true;
        confirmBtn.textContent = t('common.deleting');
        content.setAttribute("aria-busy", "true");
        try {
            const result = await api.cancelTask(taskId);
            if (!taskModalCurrent(content) || phase === "closed") return;
            if (result?.status !== "success" || !Number.isSafeInteger(result.refunded_amount) || result.refunded_amount < 0) {
                throw new Error("Unconfirmed task cancellation");
            }
            phase = "committed";
            showToast(t('task.delete_success'), "success");
            closeTaskModal(content);
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            if (!taskModalCurrent(content) || phase === "closed" || phase === "committed") return;
            const rejected = [400, 401, 403, 404, 409, 422, 429].includes(err?.status);
            phase = rejected ? "idle" : "unconfirmed";
            showToast(t(rejected ? 'task.delete_failed' : 'task.delete_unconfirmed'), rejected ? "error" : "warning");
        } finally {
            if (!taskModalCurrent(content) || phase === "closed") return;
            content.removeAttribute("aria-busy");
            confirmBtn.disabled = phase !== "idle";
            confirmBtn.textContent = t(phase === "unconfirmed" ? 'task.delete_pending' : 'common.delete');
        }
    };

    openTaskModal(taskScopes.get(task), t('common.delete'), content, { width: "300px" });
}

/**
 * ⚖️ 显示申诉对话框（支持上传证据）
 */
function showDisputeDialog(task, currentUser) {
    const content = document.createElement("div");
    content.className = "task-dispute";
    content.innerHTML = `
        <div class="task-dispute__field">
            <label for="dispute-reason" class="task-dispute__label">${t('dispute.reason')} <span aria-hidden="true" class="task-dispute__required">*</span></label>
            <textarea id="dispute-reason" aria-required="true" placeholder="${t('dispute.reason_placeholder')}" class="task-dispute__reason"></textarea>
        </div>
        
        <div class="task-dispute__field">
            <label for="evidence-file-input" class="task-dispute__label">${t('dispute.evidence_optional')}</label>
            <button type="button" id="evidence-upload-area" class="task-dispute__upload">
                📷 ${t('dispute.click_upload_evidence')}
            </button>
            <input type="file" aria-label="${t('dispute.evidence_optional')}" id="evidence-file-input" accept="image/*" multiple class="task-dispute__file">
            <div id="evidence-preview" class="task-dispute__preview"></div>
        </div>
        
        <div class="task-dispute__notice">
            <div class="task-dispute__notice-copy">
                ⚠️ ${t('dispute.notice_title')}：
                <ul class="task-dispute__notice-list">
                    <li>${t('dispute.notice_1')}</li>
                    <li>${t('dispute.notice_2')}</li>
                    <li>${t('dispute.notice_3')}</li>
                </ul>
            </div>
        </div>
        
        <button id="btn-submit-dispute" class="task-dispute__submit">
            ${t('dispute.submit')}
        </button>
    `;
    
    // 上传逻辑
    const uploadArea = content.querySelector("#evidence-upload-area");
    const fileInput = content.querySelector("#evidence-file-input");
    const preview = content.querySelector("#evidence-preview");
    const evidenceFiles = [];
    const previewUrls = new Set();
    let closed = false, submitting = false;
    const reasonInput = content.querySelector("#dispute-reason");
    const submitButton = content.querySelector("#btn-submit-dispute");
    const setSubmitting = active => {
        submitting = active;
        content.setAttribute("aria-busy", String(active));
        reasonInput.readOnly = active;
        uploadArea.disabled = active;
        fileInput.disabled = active;
        submitButton.disabled = active;
        preview.querySelectorAll("button").forEach(button => { button.disabled = active; });
    };
    reasonInput.addEventListener("input", () => reasonInput.removeAttribute("aria-invalid"));
    const releasePreviews = () => {
        for (const url of previewUrls) URL.revokeObjectURL(url);
        previewUrls.clear();
    };
    content._cleanup = () => {
        if (closed) return;
        closed = true;
        releasePreviews();
        evidenceFiles.length = 0;
    };
    
    uploadArea.onclick = () => { if (!closed && !submitting && taskModalCurrent(content)) fileInput.click(); };
    
    fileInput.onchange = (e) => {
        if (closed || submitting || !taskModalCurrent(content)) return;
        for (const file of e.target.files) {
            if (evidenceFiles.length >= 6) {
                showToast(t('dispute.max_6_images'), "warning");
                break;
            }
            evidenceFiles.push(file);
        }
        fileInput.value = "";
        renderPreview();
    };
    
    function renderPreview() {
        releasePreviews();
        if (closed) return;
        preview.innerHTML = evidenceFiles.map((file, idx) => {
            const url = URL.createObjectURL(file);
            previewUrls.add(url);
            return `
            <div class="task-dispute__evidence">
                <img alt="" src="${url}" class="task-dispute__image">
                <button type="button" aria-label="${escapeHtml(t('dispute.remove_evidence', { index: idx + 1 }))}" data-idx="${idx}" class="task-dispute__remove">×</button>
            </div>
        `;
        }).join("");
        
        preview.querySelectorAll("button").forEach(btn => {
            btn.onclick = () => {
                if (closed || submitting || !taskModalCurrent(content)) return;
                evidenceFiles.splice(parseInt(btn.dataset.idx), 1);
                renderPreview();
            };
        });
    }
    
    // 提交申诉
    submitButton.onclick = async () => {
        if (closed || submitting || !taskModalCurrent(content)) return;
        const reason = reasonInput.value.trim();
        if (!reason) {
            reasonInput.setAttribute("aria-invalid", "true");
            reasonInput.focus();
            showToast(t('dispute.please_enter_reason'), "warning");
            return;
        }
        
        reasonInput.removeAttribute("aria-invalid");
        const files = evidenceFiles.slice();
        const btn = submitButton;
        setSubmitting(true);
        btn.textContent = `•• ${t('common.submitting')}...`;
        
        try {
            // 上传证据图片
            const evidenceUrls = [];
            for (let i = 0; i < files.length; i++) {
                btn.textContent = `•• ${t('common.upload_image_progress', { current: i + 1, total: files.length })}...`;
                if (!taskModalCurrent(content)) return;
                const processedFile = await compressImageForUpload(files[i]);
                if (!taskModalCurrent(content)) return;
                const res = await api.uploadFile(processedFile, "dispute");
                if (!taskModalCurrent(content)) return;
                if (res?.status !== "success" || typeof res.url !== "string" || !res.url.trim()) {
                    throw new Error("Invalid evidence upload response");
                }
                evidenceUrls.push(res.url);
            }
            
            // 提交申诉
            btn.textContent = `•• ${t('dispute.submitting')}...`;
            if (!taskModalCurrent(content)) return;
            const response = await api.disputeTask(task.id, reason, evidenceUrls);
            if (!taskModalCurrent(content)) return;
            
            const dispute = response?.data;
            if (response?.status !== "success" || typeof dispute?.id !== "string" || !dispute.id.trim()
                || dispute.task_id !== task.id || dispute.initiator !== currentUser?.account) {
                throw new Error("Invalid task dispute response");
            }

            showToast(t('dispute.submit_success'), "success");
            closeTaskModal(content);
            // 重新加载任务详情
            const container = taskScopes.get(task)?.root;
            if (container && currentUser) {
                loadTaskDetail(container, task.id, currentUser);
            }
        } catch (err) {
            if (!taskModalCurrent(content)) return;
            showToast(t('dispute.submit_failed'), "error");
            btn.textContent = t('dispute.submit');
        } finally {
            if (!closed && taskModalCurrent(content)) setSubmitting(false);
        }
    };
    
    openTaskModal(taskScopes.get(task), `⚖️ ${t('dispute.start')}`, content, { width: "480px" });
}
