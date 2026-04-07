// 前端页面/task/任务详情组件.js
// ==========================================
// 📝 任务详情组件
// ==========================================
// 功能：展示任务详情、申请接单、提交成果、验收等操作
// ==========================================

import { api, proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { PLACEHOLDERS, getCachedProfile, getProfileWithSWR, isAdmin } from "../core/全局配置.js";
import { removeCache, findInListCache } from "../components/性能优化工具.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { compressImageForUpload } from "../market/发布内容_提交引擎.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { recordView, handleToggleLike, handleToggleFavorite, renderTipBoardHTML as renderCommonTipBoardHTML, escapeHtml } from "../components/互动工具函数.js";

/**
 * 📝 创建任务详情视图
 */
export function createTaskDetailView(taskId, currentUser) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        color: "#ccc",
        fontSize: "14px",
        padding: "0",
        overflowY: "auto",
        flex: "1",
        boxSizing: "border-box",
        background: "#121212"
    });
    
    container.innerHTML = `
        <!-- 顶部导航 -->
        <div style="display: flex; align-items: center; padding: 12px 15px; background: #1a1a1a; border-bottom: 1px solid #333;">
            <button id="btn-back" style="background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'">
                <span>⬅</span> ${t('common.back')}
            </button>
            <span style="flex: 1; text-align: center; font-size: 15px; font-weight: bold; color: #fff;">${t('task.detail_title')}</span>
            <div style="width: 60px;"></div>
        </div>
        
        <!-- 加载中 -->
        <div id="task-loading" style="text-align: center; padding: 60px; color: #888;">
            <div style="font-size: 32px; margin-bottom: 15px;">⏳</div>
            ${t('common.loading')}
        </div>
        
        <!-- 详情内容 -->
        <div id="task-content" style="display: none; padding: 15px;"></div>
    `;
    
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
    const loadingEl = container.querySelector("#task-loading");
    const contentEl = container.querySelector("#task-content");
    
    let task = null;
    let fromCache = false;
    
    try {
        const res = await api.getTaskDetail(taskId);
        task = res.data;
    } catch (err) {
        console.error("加载任务详情失败:", err);
        // 📴 从列表缓存回退
        const cached = findInListCache("TasksCache_", taskId);
        if (cached) {
            console.warn("📴 从列表缓存回退加载任务详情:", taskId);
            task = cached;
            fromCache = true;
        }
    }
    
    if (!task) {
        loadingEl.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 15px;">⚠️</div>
            <div style="color: #F44336;">${t('common.load_failed')}</div>
        `;
        return;
    }
    
    task = proxyImages(task);
    loadingEl.style.display = "none";
    contentEl.style.display = "block";
    renderTaskDetail(contentEl, task, currentUser);
    
    if (fromCache) {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#FF9800; color:white; padding:10px 20px; border-radius:4px; z-index:10000; font-size:14px;';
        toast.textContent = '⚠️ 网络连接失败，展示的是缓存的数据';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    } else {
        // 只有在线加载成功时才记录浏览量
        recordTaskView(contentEl, taskId);
    }
}

/**
 * 👀 记录任务浏览量（带60秒防抖）- 使用公共工具函数
 */
async function recordTaskView(contentEl, taskId) {
    console.log('[浏览量调试] recordTaskView 被调用, taskId:', taskId);
    console.log('[浏览量调试] api.recordTaskView 类型:', typeof api.recordTaskView);
    
    const result = await recordView(api.recordTaskView, taskId, 'task', (res) => {
        console.log('[浏览量调试] recordTaskView 成功, 响应:', JSON.stringify(res));
        updateTaskViewStats(contentEl, res.views, res.daily_views);
        
        // 验证DOM更新
        const totalEl = contentEl.querySelector("#task-view-total");
        console.log('[浏览量调试] DOM更新后 task-view-total:', totalEl?.textContent);
    });
    
    if (!result) {
        console.warn('[浏览量调试] recordTaskView 返回 null (可能被防抖拦截或请求失败)');
    }
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
function renderTaskDetail(contentEl, task, currentUser) {
    const statusStyles = {
        open: { bg: "#4CAF50", textKey: "task.status_open" },
        in_progress: { bg: "#2196F3", textKey: "task.status_in_progress" },
        submitted: { bg: "#FF9800", textKey: "task.status_submitted" },
        completed: { bg: "#9E9E9E", textKey: "task.status_completed" },
        disputed: { bg: "#F44336", textKey: "task.status_disputed" },
        cancelled: { bg: "#757575", textKey: "task.status_cancelled" }
    };
    
    const status = statusStyles[task.status] || { bg: "#666", textKey: "common.unknown" };
    const statusText = t(status.textKey);
    const currentAccount = typeof currentUser === 'string' ? currentUser : currentUser?.account;
    const isPublisher = currentAccount === task.publisher;
    const isAssignee = currentAccount === task.assignee;
    const hasApplied = (task.applicants || []).some(a => a.account === currentAccount);
    
    // 👍 检查当前用户是否已点赞/收藏
    const isLiked = task.liked_by?.includes(currentAccount) || false;
    const isFavorited = task.favorited_by?.includes(currentAccount) || false;
    
    contentEl.innerHTML = `
        <!-- 状态 + 价格 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <span style="background: ${status.bg}; color: #fff; padding: 5px 12px; border-radius: 6px; font-size: 13px; font-weight: bold;">
                ${statusText}
            </span>
            <div style="text-align: right;">
                <div style="color: #FF9800; font-size: 20px; font-weight: bold;">💰 ${task.total_price} ${t('common.credits')}</div>
                <div style="font-size: 11px; color: #888;">${t('task.deposit')} ${task.deposit_ratio}%（${task.deposit_amount} ${t('common.credits')}）</div>
            </div>
        </div>
        
        <!-- 标题 -->
        <h2 style="font-size: 18px; font-weight: bold; color: #fff; margin: 0 0 15px 0; line-height: 1.4;">
            ${escapeHtml(task.title)}
        </h2>
        
        <!-- 发布者信息 -->
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: #1e1e1e; border-radius: 8px;">
            <img src="${task.publisher_avatar || PLACEHOLDERS.AVATAR_SMALL}"
                 style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #333; cursor: pointer;" id="publisher-avatar">
            <div style="flex: 1;">
                <div style="color: #fff; font-size: 14px; font-weight: 500;">${escapeHtml(task.publisher_name || task.publisher)}</div>
                <div style="color: #888; font-size: 11px;">${t('task.published_at')} ${formatTime(task.created_at)}</div>
            </div>
            ${isPublisher && ["open", "in_progress", "submitted"].includes(task.status) ? `
            <div style="display: flex; gap: 8px;">
                <button id="btn-edit-task" style="background: #2196F3; border: none; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;" title="${t('common.edit')}">✏️ ${t('common.edit')}</button>
                ${task.status === "open" ? `
                <button id="btn-delete-task" style="background: #F44336; border: none; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;" title="${t('common.delete')}">🗑️ ${t('common.delete')}</button>
                ` : ''}
            </div>
            ` : ''}
            ${!isPublisher && currentUser ? `
                <button id="btn-chat-publisher" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                    💬 ${t('common.message')}
                </button>
            ` : ""}
        </div>
        
        <!-- 👀 浏览量统计 -->
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; padding: 10px; background: #1a1a1a; border-radius: 8px; color: #888; font-size: 12px;">
            <span style="display: flex; align-items: center; gap: 4px;">🔥 浏览总量: <span id="task-view-total" style="color: #fff; font-weight: 500;">${task.views || 0}</span></span>
            <span style="display: flex; align-items: center; gap: 4px;">📅 今日浏览: <span id="task-view-daily" style="color: #fff; font-weight: 500;">${task.daily_views || 0}</span></span>
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
            <div style="color: #ccc; font-size: 13px; line-height: 1.6; white-space: pre-wrap; background: #1e1e1e; padding: 12px; border-radius: 8px;">
${escapeHtml(task.description)}</div>
        </div>
        
        <!-- 参考图片 -->
        ${(task.reference_images && task.reference_images.length > 0) ? `
            <div style="margin-bottom: 20px;" class="ref-images-sandbox">
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">🖼️ ${t('task.reference_images')}</div>
                <div style="--sandbox-title-display: none">
                    ${getCoverSandboxHTML(task.reference_images, true).replace(/<div style="font-size: 12px[^>]*>[^<]*<\/div>/, '')}
                </div>
            </div>
        ` : ""}
        
        <!-- 参考链接 -->
        ${task.reference_link ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">🔗 ${t('task.reference_link')}</div>
                <a href="${escapeHtml(task.reference_link)}" target="_blank" style="color: #2196F3; font-size: 13px; word-break: break-all;">
                    ${escapeHtml(task.reference_link)}
                </a>
            </div>
        ` : ""}
        
        <!-- 👍 互动按钮栏 -->
        <div id="interaction-bar" style="display: flex; align-items: center; gap: 15px; padding: 15px 0; border-top: 1px solid #333; border-bottom: 1px solid #333; margin-bottom: 15px;">
            <button id="btn-like" style="background: ${isLiked ? '#FF5722' : '#333'}; border: 1px solid ${isLiked ? '#FF5722' : '#555'}; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                ❤️ <span id="like-count">${task.likes || 0}</span>
            </button>
            <button id="btn-favorite" style="background: ${isFavorited ? '#FFC107' : '#333'}; border: 1px solid ${isFavorited ? '#FFC107' : '#555'}; color: ${isFavorited ? '#000' : '#fff'}; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                ⭐ <span id="favorite-count">${task.favorites || 0}</span>
            </button>
            <button id="btn-tip" style="background: #333; border: 1px solid #555; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                💰 ${t('post.tip_author')}
            </button>
        </div>
        
        <!-- 💰 打赏榜单 -->
        <div id="tip-board-area" style="margin-bottom: 15px;">
            ${renderTipBoard(task.tip_board || [])}
        </div>
        
        <!-- 💬 评论区 -->
        <div style="margin-bottom: 15px;">
            <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                💬 ${t('post.comments_title')} <span style="color: #888; font-weight: normal;">(${task.comments || 0})</span>
            </div>
            
            <!-- 评论输入框 -->
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <input type="text" id="comment-input" placeholder="${t('post.comment_placeholder')}" style="flex: 1; padding: 10px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 20px; color: #fff; font-size: 13px; outline: none;" onfocus="this.style.borderColor='#4CAF50'" onblur="this.style.borderColor='#444'">
                <button id="btn-send-comment" style="background: #4CAF50; border: none; color: #fff; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
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
                    <img src="${task.assignee_avatar || PLACEHOLDERS.AVATAR_SMALL}"
                         style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                    <span style="color: #fff;">${escapeHtml(task.assignee_name || task.assignee)}</span>
                </div>
            </div>
        ` : ""}
        
        <!-- 交付成果（如果有） -->
        ${(task.deliverables && task.deliverables.length > 0) ? `
            <div style="margin-bottom: 20px; padding: 12px; background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.3); border-radius: 8px;" class="deliverables-sandbox">
                <div style="font-size: 13px; font-weight: bold; color: #FF9800; margin-bottom: 8px;">📦 ${t('task.deliverables')}</div>
                <div style="--sandbox-title-display: none">
                    ${getCoverSandboxHTML(task.deliverables, true).replace(/<div style="font-size: 12px[^>]*>[^<]*<\/div>/, '')}
                </div>
                ${task.submit_note ? `<div style="margin-top: 10px; color: #ccc; font-size: 12px;">${t('task.note')}: ${escapeHtml(task.submit_note)}</div>` : ""}
            </div>
        ` : ""}
        
        <!-- 申请者列表（仅发布者可见，且在 open 状态） -->
        ${isPublisher && task.status === "open" && (task.applicants || []).length > 0 ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">👥 ${t('task.applicants')}（${task.applicants.length}${t('task.applicants_count')}）</div>
                <div id="applicants-list" style="display: flex; flex-direction: column; gap: 8px;">
                    ${task.applicants.map(app => `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: #1e1e1e; border-radius: 8px;">
                            <img src="${app.avatar || PLACEHOLDERS.AVATAR_SMALL}"
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
        <div id="action-buttons" style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #333;">
        </div>
    `;
    
    // 设置发布者 dataset，供评论区权限判断使用
    contentEl.dataset.publisher = task.publisher;
    
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
 * 👤 显示接受任务申请确认对话框
 */
function showAssignConfirmDialog(task, assignee, contentEl, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">👤</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('task.confirm_assign', { assignee: assignee })}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('task.confirm_deposit', { amount: task.deposit_amount })}</div>
            <div style="display: flex; gap: 10px;">
                <button id="assign-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="assign-confirm" style="flex: 1; background: #4CAF50; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.confirm')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#assign-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#assign-confirm").onclick = async () => {
        const confirmBtn = content.querySelector("#assign-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('common.confirming')}...`;
        
        try {
            await api.assignTask(task.id, assignee);
            showToast(t('task.assign_success'), "success");
            globalModal.closeTopModal();
            loadTaskDetail(contentEl.closest("div"), task.id, currentUser);
        } catch (err) {
            showToast(err.message || t('task.assign_failed'), "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.confirm');
        }
    };
    
    globalModal.openModal(t('task.choose_assignee'), content, { width: "350px" });
}

/**
 * 🙋 显示申请接单对话框
 */
function showApplyDialog(task, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 15px;">
            <div style="color: #888; font-size: 12px; margin-bottom: 8px;">${t('task.apply_message_prompt')}</div>
            <textarea id="apply-message" rows="4" placeholder="${t('task.apply_message_placeholder') || ''}" style="width: 100%; padding: 10px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #fff; resize: none; box-sizing: border-box; font-size: 13px;"></textarea>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="apply-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
            <button id="apply-confirm" style="flex: 1; background: #FF9800; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.confirm_submit')}</button>
        </div>
    `;
    
    content.querySelector("#apply-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#apply-confirm").onclick = async () => {
        const message = content.querySelector("#apply-message").value;
        const confirmBtn = content.querySelector("#apply-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('common.submitting')}...`;
        
        try {
            await api.applyTask(task.id, message);
            showToast(t('task.apply_success'), "success");
            globalModal.closeTopModal();
            // 重新加载任务详情
            const container = document.querySelector('#task-content')?.parentElement;
            if (container && currentUser) {
                loadTaskDetail(container, task.id, currentUser);
            }
        } catch (err) {
            showToast(err.message || t('task.apply_failed'), "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.confirm_submit');
        }
    };
    
    globalModal.openModal(t('task.apply_task'), content, { width: "400px" });
}

/**
 * ↩️ 显示撤回申请确认对话框
 */
function showCancelApplyConfirmDialog(task, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">↩️</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('task.confirm_cancel_apply')}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('task.cancel_apply_warning') || ''}</div>
            <div style="display: flex; gap: 10px;">
                <button id="cancel-apply-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="cancel-apply-confirm" style="flex: 1; background: #FF9800; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.confirm')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#cancel-apply-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#cancel-apply-confirm").onclick = async () => {
        const confirmBtn = content.querySelector("#cancel-apply-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('common.confirming')}...`;
        
        try {
            await api.cancelApplyTask(task.id);
            showToast(t('task.apply_cancelled'), "success");
            globalModal.closeTopModal();
            // 重新加载任务详情
            const container = document.querySelector('#task-content')?.parentElement;
            if (container && currentUser) {
                loadTaskDetail(container, task.id, currentUser);
            }
        } catch (err) {
            showToast(err.message || t('task.cancel_apply_failed'), "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.confirm');
        }
    };
    
    globalModal.openModal(t('task.cancel_apply'), content, { width: "350px" });
}

/**
 * ❌ 显示取消任务确认对话框
 */
function showCancelTaskConfirmDialog(task) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('task.confirm_cancel_task')}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('task.cancel_task_warning') || ''}</div>
            <div style="display: flex; gap: 10px;">
                <button id="cancel-task-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="cancel-task-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('task.cancel_task')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#cancel-task-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#cancel-task-confirm").onclick = async () => {
        const confirmBtn = content.querySelector("#cancel-task-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('common.cancelling')}...`;
        
        try {
            await api.cancelTask(task.id);
            showToast(t('task.task_cancelled'), "success");
            globalModal.closeTopModal();
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            showToast(err.message || t('task.cancel_task_failed'), "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('task.cancel_task');
        }
    };
    
    globalModal.openModal(t('task.cancel_task'), content, { width: "350px" });
}

/**
 * ✅ 显示验收通过确认对话框
 */
function showAcceptConfirmDialog(task, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">✅</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('task.confirm_accept')}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('task.confirm_pay_remaining', { amount: task.total_price - task.deposit_amount })}</div>
            <div style="display: flex; gap: 10px;">
                <button id="accept-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="accept-confirm" style="flex: 1; background: #4CAF50; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('task.accept_work')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#accept-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#accept-confirm").onclick = async () => {
        const confirmBtn = content.querySelector("#accept-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('common.confirming')}...`;
        
        try {
            await api.acceptTask(task.id, true);
            showToast(t('task.accept_success'), "success");
            globalModal.closeTopModal();
            // 重新加载任务详情
            const container = document.querySelector('#task-content')?.parentElement;
            if (container && currentUser) {
                loadTaskDetail(container, task.id, currentUser);
            }
        } catch (err) {
            showToast(err.message || t('common.operation_failed'), "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('task.accept_work');
        }
    };
    
    globalModal.openModal(t('task.accept_work'), content, { width: "350px" });
}

/**
 * ❌ 显示验收拒绝对话框
 */
function showRejectDialog(task, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 15px;">
            <div style="color: #888; font-size: 12px; margin-bottom: 8px;">${t('task.reject_reason_prompt')}</div>
            <textarea id="reject-feedback" rows="4" placeholder="${t('task.reject_reason_placeholder') || ''}" style="width: 100%; padding: 10px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #fff; resize: none; box-sizing: border-box; font-size: 13px;"></textarea>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="reject-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
            <button id="reject-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('task.reject_work')}</button>
        </div>
    `;
    
    content.querySelector("#reject-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#reject-confirm").onclick = async () => {
        const feedback = content.querySelector("#reject-feedback").value.trim();
        if (!feedback) {
            showToast(t('task.reject_reason_required') || '请输入拒绝原因', "warning");
            return;
        }
        
        const confirmBtn = content.querySelector("#reject-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('common.submitting')}...`;
        
        try {
            await api.acceptTask(task.id, false, feedback);
            showToast(t('task.work_returned'), "success");
            globalModal.closeTopModal();
            // 重新加载任务详情
            const container = document.querySelector('#task-content')?.parentElement;
            if (container && currentUser) {
                loadTaskDetail(container, task.id, currentUser);
            }
        } catch (err) {
            showToast(err.message || t('common.operation_failed'), "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('task.reject_work');
        }
    };
    
    globalModal.openModal(t('task.reject_work'), content, { width: "400px" });
}

/**
 * 🗑️ 显示删除评论确认对话框
 */
function showDeleteCommentConfirmDialog(taskId, comment, container, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('post.delete_comment_confirm') || '确定删除这条评论吗？'}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('post.delete_comment_warning') || '删除后无法恢复'}</div>
            <div style="display: flex; gap: 10px;">
                <button id="delete-comment-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="delete-comment-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.delete')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#delete-comment-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#delete-comment-confirm").onclick = async () => {
        const confirmBtn = content.querySelector("#delete-comment-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('common.deleting')}...`;
        
        try {
            await api.deleteComment(taskId, comment.id);
            showToast(t('post.delete_comment_success') || '评论已删除', "success");
            globalModal.closeTopModal();
            loadTaskComments(container, taskId, currentUser);
        } catch (err) {
            showToast((t('post.delete_comment_failed') || '删除失败') + ": " + err.message, "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.delete');
        }
    };
    
    globalModal.openModal(t('common.delete'), content, { width: "350px" });
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
        import("./申诉详情组件.js").then(module => {
            const view = module.createDisputeDetailView(task.dispute_id, currentUser, () => {
                window.dispatchEvent(new CustomEvent("comfy-route-back"));
            });
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        });
    });
}

/**
 * 📤 显示提交成果对话框
 */
function showSubmitDialog(task, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 15px;">
            <label style="display: block; color: #ccc; font-size: 13px; margin-bottom: 5px;">${t('task.deliverable_images')} *</label>
            <input type="file" id="deliverable-files" multiple accept="image/*" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; border-radius: 6px; color: #fff;">
            <div style="font-size: 11px; color: #888; margin-top: 4px;">${t('task.support_multiple_images')}</div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <label style="display: block; color: #ccc; font-size: 13px; margin-bottom: 5px;">${t('task.note_optional')}</label>
            <textarea id="submit-note" rows="3" placeholder="${t('task.note_placeholder')}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; border-radius: 6px; color: #fff; resize: none; box-sizing: border-box;"></textarea>
        </div>
        
        <div style="display: flex; gap: 10px;">
            <button id="btn-cancel-modal" style="flex: 1; padding: 10px; background: #333; border: 1px solid #555; color: #fff; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
            <button id="btn-confirm-submit" style="flex: 1; padding: 10px; background: #4CAF50; border: none; color: #fff; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.confirm_submit')}</button>
        </div>
    `;
    
    content.querySelector("#btn-cancel-modal").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#btn-confirm-submit").onclick = async () => {
        const files = content.querySelector("#deliverable-files").files;
        const note = content.querySelector("#submit-note").value;
        
        if (!files || files.length === 0) {
            showToast(t('task.please_upload_deliverables'), "warning");
            return;
        }
        
        try {
            const confirmBtn = content.querySelector("#btn-confirm-submit");
            confirmBtn.disabled = true;
            confirmBtn.textContent = `⏳ ${t('common.uploading')}...`;
            
            // 上传交付图片
            const deliverables = [];
            for (let i = 0; i < files.length; i++) {
                confirmBtn.textContent = `⏳ ${t('common.upload_progress', { current: i + 1, total: files.length })}...`;
                try {
                    const processedFile = await compressImageForUpload(files[i]);
                    const res = await api.uploadFile(processedFile, "task");
                    deliverables.push(res.url);
                } catch (uploadErr) {
                    console.error("图片上传失败:", uploadErr);
                }
            }
            
            if (deliverables.length === 0) {
                showToast(t('task.upload_failed_retry'), "error");
                confirmBtn.disabled = false;
                confirmBtn.textContent = t('common.confirm_submit');
                return;
            }
            
            // 提交成果
            confirmBtn.textContent = `⏳ ${t('common.submitting')}...`;
            await api.submitTask(task.id, deliverables, note || null);
            
            showToast(t('task.submit_success_waiting'), "success");
            globalModal.closeTopModal();
            // 重新加载任务详情
            const container = document.querySelector('#task-content')?.parentElement;
            if (container && currentUser) {
                loadTaskDetail(container, task.id, currentUser);
            }
        } catch (err) {
            showToast(err.message || t('task.submit_failed'), "error");
            const confirmBtn = content.querySelector("#btn-confirm-submit");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.confirm_submit');
        }
    };
    
    globalModal.openModal(`📤 ${t('task.submit_work')}`, content, { width: "450px" });
}

/**
 * 🔗 绑定任务互动事件（点赞/收藏/打赏）- 使用公共工具函数
 */
function bindTaskInteractionEvents(container, task, currentUser) {
    const btnLike = container.querySelector("#btn-like");
    const btnFavorite = container.querySelector("#btn-favorite");
    const btnTip = container.querySelector("#btn-tip");
    const likeCount = container.querySelector("#like-count");
    const favoriteCount = container.querySelector("#favorite-count");
    
    // 点赞 - 使用公共工具函数
    if (btnLike) {
        btnLike.onclick = () => {
            handleToggleLike(api.toggleTaskLike, task.id, btnLike, likeCount, currentUser);
        };
    }
    
    // 收藏 - 使用公共工具函数
    if (btnFavorite) {
        btnFavorite.onclick = () => {
            handleToggleFavorite(api.toggleTaskFavorite, task.id, btnFavorite, favoriteCount, currentUser);
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
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 15px;">
            <button class="tip-amount" data-amount="10" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">10 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="50" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">50 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="100" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">100 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="500" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">500 ${t('task.points')}</button>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="tip-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
        </div>
    `;

    globalModal.openModal(`🎁 ${t('post.tip_dialog_title')}`, content, { width: "300px" });

    // 取消按钮
    content.querySelector("#tip-cancel").onclick = () => globalModal.closeTopModal();

    // 打赏金额按钮
    content.querySelectorAll(".tip-amount").forEach(btn => {
        btn.onclick = async () => {
            const amount = parseInt(btn.dataset.amount);
            try {
                await api.tipTask(task.id, amount, false);
                showToast(t('post.tip_success', { amount }), "success");
                globalModal.closeTopModal();
                // 刷新页面
                loadTaskDetail(container.closest("div"), task.id, currentUser);
            } catch (err) {
                showToast(t('post.tip_failed') + ": " + err.message, "error");
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
 * 💬 加载任务评论
 */
async function loadTaskComments(container, taskId, currentUser) {
    const commentsList = container.querySelector("#comments-list");
    const commentInput = container.querySelector("#comment-input");
    const sendBtn = container.querySelector("#btn-send-comment");
    
    try {
        const res = await api.getTaskComments(taskId);
        let comments = res.data || [];
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
                const initial = (name || 'U')[0].toUpperCase();
                
                const avatarHtml = avatar 
                    ? `<img class="swr-avatar" src="${avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: #333;">` 
                    : `<div class="swr-avatar" style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">${initial}</div>`;
                
                // 判断是否有删除权限（评论作者/任务发布者/管理员）
                const currentAccount = typeof currentUser === 'string' ? currentUser : currentUser?.account;
                const canDelete = currentUser && (
                    currentAccount === c.author || 
                    currentAccount === container.dataset?.publisher ||
                    isAdmin(currentAccount)
                );
                
                return `
                    <div id="task-comment-${idx}" data-account="${escapeHtml(c.author)}" data-comment-id="${c.id || idx}" style="background: #1a1a1a; padding: 12px; border-radius: 8px;">
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
                getProfileWithSWR(c.author, api.getUserProfile, (profile) => {
                    const commentEl = commentsList.querySelector(`#task-comment-${idx}`);
                    if (!commentEl) return;
                    const avatarContainer = commentEl.querySelector('.swr-avatar-container');
                    const nameEl = commentEl.querySelector('.swr-name');
                    const avatarEl = avatarContainer?.querySelector('.swr-avatar');
                    
                    if (avatarEl && profile.avatar) {
                        if (avatarEl.tagName === 'IMG') {
                            avatarEl.src = profile.avatar;
                        } else {
                            avatarEl.outerHTML = `<img class="swr-avatar" src="${profile.avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: #333;">`;
                        }
                    }
                    if (nameEl && profile.name) nameEl.textContent = profile.name;
                });
            });
            
            // 绑定删除评论按钮事件
            commentsList.querySelectorAll(".btn-delete-comment").forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.idx);
                    const comment = comments[idx];
                    if (!comment) return;
                    showDeleteCommentConfirmDialog(taskId, comment, container, currentUser);
                };
            });
        }
    } catch (err) {
        commentsList.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #F44336; font-size: 12px;">
                ${t('post.comment_load_failed')}
            </div>
        `;
    }
    
    // 发送评论
    if (sendBtn) {
        sendBtn.onclick = async () => {
            if (!currentUser) {
                showToast(t('auth.login_required'), "warning");
                return;
            }
            const content = commentInput.value.trim();
            if (!content) {
                showToast(t('post.comment_required'), "warning");
                return;
            }
            try {
                sendBtn.disabled = true;
                sendBtn.textContent = t('post.comment_sending');
                await api.addTaskComment(taskId, content);
                commentInput.value = "";
                showToast(t('post.comment_success'), "success");
                loadTaskComments(container, taskId, currentUser);
            } catch (err) {
                showToast(t('post.comment_failed') + ": " + err.message, "error");
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = t('common.send');
            }
        };
    }
    
    // 回车发送
    if (commentInput) {
        commentInput.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendBtn?.click();
            }
        };
    }
}

/**
 * 🕐 格式化时间
 */
function formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

/**
 * 📅 格式化截止日期
 */
function formatDeadline(deadline) {
    if (!deadline) return t('time.unlimited');
    try {
        const date = new Date(deadline);
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    } catch {
        return deadline;
    }
}

/**
 * 🗑️ 显示删除任务确认对话框
 */
function showDeleteTaskConfirm(task, contentEl) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="color: #fff; font-size: 14px; margin-bottom: 8px;">${t('task.delete_confirm_title')}</div>
            <div style="color: #888; font-size: 12px; margin-bottom: 20px;">${t('task.delete_confirm_desc')}</div>
            <div style="display: flex; gap: 10px;">
                <button id="delete-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="delete-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.delete')}</button>
            </div>
        </div>
    `;
    
    content.querySelector("#delete-cancel").onclick = () => globalModal.closeTopModal();
    
    content.querySelector("#delete-confirm").onclick = async () => {
        try {
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('common.deleting');
            
            await api.cancelTask(task.id);
            showToast(t('task.delete_success'), "success");
            globalModal.closeTopModal();
            
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            showToast(err.message || t('task.delete_failed'), "error");
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.delete');
        }
    };
    
    globalModal.openModal(t('common.delete'), content, { width: "300px" });
}

/**
 * ⚖️ 显示申诉对话框（支持上传证据）
 */
function showDisputeDialog(task, currentUser) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 16px;">
            <label style="display: block; color: #ccc; margin-bottom: 8px; font-size: 14px;">${t('dispute.reason')} <span style="color: #f44;">*</span></label>
            <textarea id="dispute-reason" placeholder="${t('dispute.reason_placeholder')}" style="width: 100%; height: 120px; background: #2a2a2a; border: 1px solid #444; border-radius: 8px; color: #fff; padding: 12px; resize: none; box-sizing: border-box; font-size: 14px; line-height: 1.5;"></textarea>
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; color: #ccc; margin-bottom: 8px; font-size: 14px;">${t('dispute.evidence_optional')}</label>
            <div id="evidence-upload-area" style="border: 2px dashed #444; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; color: #888; transition: all 0.2s;">
                📷 ${t('dispute.click_upload_evidence')}
            </div>
            <input type="file" id="evidence-file-input" accept="image/*" multiple style="display: none;">
            <div id="evidence-preview" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;"></div>
        </div>
        
        <div style="background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="color: #FF9800; font-size: 13px;">
                ⚠️ ${t('dispute.notice_title')}：
                <ul style="margin: 8px 0 0 16px; padding: 0; line-height: 1.6;">
                    <li>${t('dispute.notice_1')}</li>
                    <li>${t('dispute.notice_2')}</li>
                    <li>${t('dispute.notice_3')}</li>
                </ul>
            </div>
        </div>
        
        <button id="btn-submit-dispute" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #F44336, #D32F2F); border: none; border-radius: 8px; color: #fff; font-size: 15px; font-weight: bold; cursor: pointer;">
            ${t('dispute.submit')}
        </button>
    `;
    
    // 上传逻辑
    const uploadArea = content.querySelector("#evidence-upload-area");
    const fileInput = content.querySelector("#evidence-file-input");
    const preview = content.querySelector("#evidence-preview");
    const evidenceFiles = [];
    
    uploadArea.onclick = () => fileInput.click();
    uploadArea.onmouseover = () => { uploadArea.style.borderColor = "#2196F3"; uploadArea.style.color = "#2196F3"; };
    uploadArea.onmouseout = () => { uploadArea.style.borderColor = "#444"; uploadArea.style.color = "#888"; };
    
    fileInput.onchange = (e) => {
        for (const file of e.target.files) {
            if (evidenceFiles.length >= 6) {
                showToast(t('dispute.max_6_images'), "warning");
                break;
            }
            evidenceFiles.push(file);
        }
        renderPreview();
    };
    
    function renderPreview() {
        preview.innerHTML = evidenceFiles.map((file, idx) => `
            <div style="position: relative;">
                <img src="${URL.createObjectURL(file)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">
                <button data-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; background: #f44; color: #fff; border: none; border-radius: 50%; cursor: pointer; font-size: 12px; line-height: 18px;">×</button>
            </div>
        `).join("");
        
        preview.querySelectorAll("button").forEach(btn => {
            btn.onclick = () => {
                evidenceFiles.splice(parseInt(btn.dataset.idx), 1);
                renderPreview();
            };
        });
    }
    
    // 提交申诉
    content.querySelector("#btn-submit-dispute").onclick = async () => {
        const reason = content.querySelector("#dispute-reason").value.trim();
        if (!reason) {
            showToast(t('dispute.please_enter_reason'), "warning");
            return;
        }
        
        const btn = content.querySelector("#btn-submit-dispute");
        btn.disabled = true;
        btn.textContent = `•• ${t('common.submitting')}...`;
        
        try {
            // 上传证据图片
            const evidenceUrls = [];
            for (let i = 0; i < evidenceFiles.length; i++) {
                btn.textContent = `•• ${t('common.upload_image_progress', { current: i + 1, total: evidenceFiles.length })}...`;
                const processedFile = await compressImageForUpload(evidenceFiles[i]);
                const res = await api.uploadFile(processedFile, "dispute");
                evidenceUrls.push(res.url);
            }
            
            // 提交申诉
            btn.textContent = `•• ${t('dispute.submitting')}...`;
            await api.disputeTask(task.id, reason, evidenceUrls);
            
            showToast(t('dispute.submit_success'), "success");
            globalModal.closeTopModal();
            // 重新加载任务详情
            const container = document.querySelector('#task-content')?.parentElement;
            if (container && currentUser) {
                loadTaskDetail(container, task.id, currentUser);
            }
        } catch (err) {
            showToast(err.message || t('dispute.submit_failed'), "error");
            btn.disabled = false;
            btn.textContent = t('dispute.submit');
        }
    };
    
    globalModal.openModal(`⚖️ ${t('dispute.start')}`, content, { width: "480px" });
}
