// 前端页面/task/任务详情组件.js
// ==========================================
// 📝 任务详情组件
// ==========================================
// 功能：展示任务详情、申请接单、提交成果、验收等操作
// ==========================================

import { api, proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { PLACEHOLDERS } from "../core/全局配置.js";
import { removeCache } from "../components/性能优化工具.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { compressImageForUpload } from "../market/发布内容_提交引擎.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";

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
    
    try {
        const res = await api.getTaskDetail(taskId);
        let task = res.data;
        task = proxyImages(task);  // 对任务数据应用图片代理，确保走本地缓存
        
        loadingEl.style.display = "none";
        contentEl.style.display = "block";
        
        renderTaskDetail(contentEl, task, currentUser);
        
    } catch (err) {
        console.error("加载任务详情失败:", err);
        loadingEl.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 15px;">⚠️</div>
            <div style="color: #F44336;">${t('common.load_failed')}: ${err.message}</div>
        `;
    }
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
                    ${getCoverSandboxHTML(task.reference_images, false).replace(/<div style="font-size: 12px[^>]*>[^<]*<\/div>/, '')}
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
                    ${getCoverSandboxHTML(task.deliverables, false).replace(/<div style="font-size: 12px[^>]*>[^<]*<\/div>/, '')}
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
    
    // 绑定申请者列表的选择按鈕
    contentEl.querySelectorAll(".btn-assign").forEach(btn => {
        btn.onclick = async () => {
            const assignee = btn.dataset.account;
            if (!confirm(`${t('task.confirm_assign', { assignee: assignee })}\n\n${t('task.confirm_deposit', { amount: task.deposit_amount })}`)) return;
            
            try {
                await api.assignTask(task.id, assignee);
                showToast(t('task.assign_success'), "success");
                // 刷新页面
                loadTaskDetail(contentEl.closest("div"), task.id, currentUser);
            } catch (err) {
                showToast(err.message || t('task.assign_failed'), "error");
            }
        };
    });
    
    // 绑定图片沙盒交互（缩放、拖动、轮播等）
    setupImageSandboxEvents(contentEl);
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
    container.querySelector("#btn-apply")?.addEventListener("click", async () => {
        const message = prompt(t('task.apply_message_prompt'));
        try {
            await api.applyTask(task.id, message);
            showToast(t('task.apply_success'), "success");
            location.reload(); // 简单刷新
        } catch (err) {
            showToast(err.message || t('task.apply_failed'), "error");
        }
    });
    
    // 撤回申请
    container.querySelector("#btn-cancel-apply")?.addEventListener("click", async () => {
        if (!confirm(t('task.confirm_cancel_apply'))) return;
        try {
            await api.cancelApplyTask(task.id);
            showToast(t('task.apply_cancelled'), "success");
            location.reload();
        } catch (err) {
            showToast(err.message || t('task.cancel_apply_failed'), "error");
        }
    });
    
    // 取消任务
    container.querySelector("#btn-cancel-task")?.addEventListener("click", async () => {
        if (!confirm(t('task.confirm_cancel_task'))) return;
        try {
            await api.cancelTask(task.id);
            showToast(t('task.task_cancelled'), "success");
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            showToast(err.message || t('task.cancel_task_failed'), "error");
        }
    });
    
    // 提交成果
    container.querySelector("#btn-submit")?.addEventListener("click", () => {
        showSubmitDialog(task, currentUser);
    });
    
    // 验收通过
    container.querySelector("#btn-accept")?.addEventListener("click", async () => {
        if (!confirm(`${t('task.confirm_accept')}\n\n${t('task.confirm_pay_remaining', { amount: task.total_price - task.deposit_amount })}`)) return;
        try {
            await api.acceptTask(task.id, true);
            showToast(t('task.accept_success'), "success");
            location.reload();
        } catch (err) {
            showToast(err.message || t('common.operation_failed'), "error");
        }
    });
    
    // 验收不通过
    container.querySelector("#btn-reject")?.addEventListener("click", async () => {
        const feedback = prompt(t('task.reject_reason_prompt'));
        if (!feedback) return;
        try {
            await api.acceptTask(task.id, false, feedback);
            showToast(t('task.work_returned'), "success");
            location.reload();
        } catch (err) {
            showToast(err.message || t('common.operation_failed'), "error");
        }
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
            location.reload();
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
 * 🔒 HTML转义
 */
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
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
            location.reload();
        } catch (err) {
            showToast(err.message || t('dispute.submit_failed'), "error");
            btn.disabled = false;
            btn.textContent = t('dispute.submit');
        }
    };
    
    globalModal.openModal(`⚖️ ${t('dispute.start')}`, content, { width: "480px" });
}
