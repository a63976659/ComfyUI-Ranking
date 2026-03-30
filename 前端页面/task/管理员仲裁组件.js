// 前端页面/task/管理员仲裁组件.js
// ==========================================
// ⚖️ 管理员仲裁界面
// ==========================================
// 功能：查看申诉列表、进行裁决
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { createDisputeDetailView } from "./申诉详情组件.js";
import { t } from "../components/用户体验增强.js";

/**
 * 创建管理员仲裁视图
 * @param {object} currentUser - 当前管理员用户
 */
export function createAdminDisputeView(currentUser) {
    const container = document.createElement("div");
    container.className = "admin-dispute-container";
    container.style.cssText = "padding: 16px; background: var(--comfy-menu-bg); min-height: 100%;";

    renderDisputeList(container, currentUser);

    return container;
}

async function renderDisputeList(container, currentUser, statusFilter = null) {
    container.innerHTML = `
        <style>
            .admin-dispute-header { margin-bottom: 20px; }
            .admin-dispute-title { font-size: 20px; font-weight: bold; color: var(--input-text); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
            .admin-dispute-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
            .admin-tab { padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px; transition: all 0.2s; }
            .admin-tab.active { background: #FF5722; color: white; }
            .admin-tab:not(.active) { background: var(--comfy-input-bg); color: var(--input-text); }
            
            .dispute-list { display: flex; flex-direction: column; gap: 12px; }
            .dispute-card { background: var(--comfy-input-bg); border-radius: 12px; padding: 16px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
            .dispute-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
            
            .dispute-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .dispute-card-title { font-weight: bold; color: var(--input-text); font-size: 15px; }
            .dispute-card-status { padding: 4px 10px; border-radius: 12px; font-size: 11px; }
            
            .dispute-card-parties { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #888; font-size: 13px; }
            .dispute-card-parties .vs { color: #f44; font-weight: bold; }
            
            .dispute-card-reason { font-size: 13px; color: var(--input-text); background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; margin-bottom: 12px; line-height: 1.5; max-height: 60px; overflow: hidden; text-overflow: ellipsis; }
            
            .dispute-card-meta { display: flex; justify-content: space-between; font-size: 12px; color: #888; }
            
            .empty-state { text-align: center; padding: 60px 20px; color: #888; }
            .empty-state .icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
        </style>
        
        <div class="admin-dispute-header">
            <div class="admin-dispute-title">⚖️ ${t('arbitrate.center')}</div>
            <div class="admin-dispute-tabs">
                <button class="admin-tab ${!statusFilter ? 'active' : ''}" data-status="">${t('arbitrate.all')}</button>
                <button class="admin-tab ${statusFilter === 'pending' ? 'active' : ''}" data-status="pending">${t('arbitrate.pending_response')}</button>
                <button class="admin-tab ${statusFilter === 'responded' ? 'active' : ''}" data-status="responded">${t('arbitrate.pending_ruling')}</button>
                <button class="admin-tab ${statusFilter === 'resolved' ? 'active' : ''}" data-status="resolved">${t('arbitrate.ruled')}</button>
            </div>
        </div>
        
        <div class="dispute-list" id="disputeList">
            <div style="text-align: center; padding: 40px; color: #888;">⏳ ${t('common.loading')}</div>
        </div>
    `;

    // Tab切换
    container.querySelectorAll(".admin-tab").forEach(tab => {
        tab.onclick = () => {
            const status = tab.dataset.status || null;
            renderDisputeList(container, currentUser, status);
        };
    });

    // 加载申诉列表
    try {
        const res = await api.getAdminDisputes(statusFilter);
        const disputes = res.data || [];
        const listEl = container.querySelector("#disputeList");

        if (disputes.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📭</div>
                    <div>${t('arbitrate.no_disputes')}</div>
                </div>
            `;
            return;
        }

        const statusConfig = {
            pending: { label: t('arbitrate.pending_response'), color: "#FF9800", bg: "rgba(255, 152, 0, 0.15)" },
            responded: { label: t('arbitrate.pending_ruling'), color: "#2196F3", bg: "rgba(33, 150, 243, 0.15)" },
            resolved: { label: t('arbitrate.ruled'), color: "#4CAF50", bg: "rgba(76, 175, 80, 0.15)" }
        };

        listEl.innerHTML = disputes.map(d => {
            const status = statusConfig[d.status] || statusConfig.pending;
            return `
                <div class="dispute-card" data-id="${d.id}">
                    <div class="dispute-card-header">
                        <div class="dispute-card-title">${d.task_title || t('common.unknown_task')}</div>
                        <span class="dispute-card-status" style="background: ${status.bg}; color: ${status.color};">${status.label}</span>
                    </div>
                    <div class="dispute-card-parties">
                        <span>${d.publisher_name || d.publisher}</span>
                        <span class="vs">VS</span>
                        <span>${d.assignee_name || d.assignee}</span>
                    </div>
                    <div class="dispute-card-reason">${d.reason || t('arbitrate.no_reason')}</div>
                    <div class="dispute-card-meta">
                        <span>${t('arbitrate.initiator')}: ${d.initiator_role === "publisher" ? t('dispute.publisher') : t('task.assignee')}</span>
                        <span>${formatTime(d.created_at)}</span>
                    </div>
                </div>
            `;
        }).join("");

        // 点击进入详情
        listEl.querySelectorAll(".dispute-card").forEach(card => {
            card.onclick = () => {
                const disputeId = card.dataset.id;
                showDisputeModal(disputeId, currentUser, () => renderDisputeList(container, currentUser, statusFilter));
            };
        });

    } catch (err) {
        container.querySelector("#disputeList").innerHTML = `
            <div style="text-align: center; padding: 40px; color: #f44;">❌ ${t('common.load_failed')}: ${err.message}</div>
        `;
    }
}

function showDisputeModal(disputeId, currentUser, onClose) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box;";

    const modal = document.createElement("div");
    modal.style.cssText = "background: var(--comfy-menu-bg); border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; position: relative;";

    // 加载申诉详情
    loadDisputeModalContent(modal, disputeId, currentUser, () => {
        overlay.remove();
        onClose && onClose();
    });

    overlay.appendChild(modal);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

async function loadDisputeModalContent(modal, disputeId, currentUser, onClose) {
    modal.innerHTML = `<div style="padding: 40px; text-align: center; color: #888;">⏳ ${t('common.loading')}</div>`;

    try {
        const res = await api.getDisputeDetail(disputeId);
        const dispute = res.data;

        const statusConfig = {
            pending: { label: t('arbitrate.pending_response'), color: "#FF9800" },
            responded: { label: t('arbitrate.pending_ruling'), color: "#2196F3" },
            resolved: { label: t('arbitrate.ruled'), color: "#4CAF50" }
        };
        const status = statusConfig[dispute.status] || statusConfig.pending;

        const canResolve = dispute.status !== "resolved";

        modal.innerHTML = `
            <style>
                .modal-header { padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; }
                .modal-title { font-size: 18px; font-weight: bold; color: var(--input-text); }
                .modal-close { background: none; border: none; color: #888; font-size: 24px; cursor: pointer; }
                
                .modal-body { padding: 16px; }
                .modal-section { margin-bottom: 16px; }
                .modal-section-title { font-weight: bold; color: var(--input-text); margin-bottom: 8px; font-size: 14px; }
                .modal-section-content { background: var(--comfy-input-bg); padding: 12px; border-radius: 8px; color: var(--input-text); font-size: 14px; line-height: 1.6; }
                
                .evidence-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
                .evidence-row img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; cursor: pointer; }
                
                .resolve-section { background: linear-gradient(135deg, rgba(255,87,34,0.1) 0%, rgba(255,152,0,0.1) 100%); border-radius: 12px; padding: 16px; margin-top: 16px; }
                .resolve-title { font-weight: bold; color: #FF5722; margin-bottom: 12px; }
                
                .resolve-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
                .resolve-option { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--comfy-input-bg); border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; }
                .resolve-option:hover { border-color: #FF5722; }
                .resolve-option.selected { border-color: #FF5722; background: rgba(255,87,34,0.1); }
                .resolve-option input { display: none; }
                .resolve-option-icon { font-size: 20px; }
                .resolve-option-text { flex: 1; }
                .resolve-option-label { font-weight: bold; color: var(--input-text); }
                .resolve-option-desc { font-size: 12px; color: #888; }
                
                .split-ratio { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 12px; background: var(--comfy-input-bg); border-radius: 8px; }
                .split-ratio label { color: var(--input-text); font-size: 14px; }
                .split-ratio input[type="range"] { flex: 1; }
                .split-ratio .ratio-value { min-width: 80px; text-align: center; font-weight: bold; color: #FF5722; }
                
                .resolve-note textarea { width: 100%; height: 80px; background: var(--comfy-input-bg); border: 1px solid var(--border-color); border-radius: 8px; color: var(--input-text); padding: 10px; resize: none; box-sizing: border-box; margin-top: 12px; }
                
                .resolve-btn { width: 100%; padding: 14px; background: #FF5722; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 12px; }
                .resolve-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            </style>
            
            <div class="modal-header">
                <div class="modal-title">⚖️ ${t('dispute.title')}</div>
                <button class="modal-close" id="closeBtn">×</button>
            </div>
            
            <div class="modal-body">
                <div class="modal-section">
                    <div class="modal-section-title">📋 ${t('dispute.related_task')}</div>
                    <div class="modal-section-content">${dispute.task_title || t('common.unknown_task')}</div>
                </div>
                
                <div class="modal-section">
                    <div class="modal-section-title">📝 ${t('dispute.initiator_statement')} (${dispute.initiator_role === "publisher" ? t('dispute.publisher') : t('task.assignee')})</div>
                    <div class="modal-section-content">
                        ${dispute.reason || t('common.none')}
                        ${dispute.evidence && dispute.evidence.length > 0 ? `
                            <div class="evidence-row">
                                ${dispute.evidence.map(img => `<img src="${img}" onclick="window.open('${img}')">`).join("")}
                            </div>
                        ` : ""}
                    </div>
                </div>
                
                <div class="modal-section">
                    <div class="modal-section-title">💬 ${t('dispute.respondent_response')} (${dispute.initiator_role === "publisher" ? t('task.assignee') : t('dispute.publisher')})</div>
                    <div class="modal-section-content">
                        ${dispute.response || `（${t('dispute.no_response')}）`}
                        ${dispute.response_evidence && dispute.response_evidence.length > 0 ? `
                            <div class="evidence-row">
                                ${dispute.response_evidence.map(img => `<img src="${img}" onclick="window.open('${img}')">`).join("")}
                            </div>
                        ` : ""}
                    </div>
                </div>
                
                ${canResolve ? `
                    <div class="resolve-section">
                        <div class="resolve-title">🔨 ${t('arbitrate.ruling_operation')}</div>
                        
                        <div class="resolve-options">
                            <label class="resolve-option" data-value="favor_initiator">
                                <input type="radio" name="resolution" value="favor_initiator">
                                <span class="resolve-option-icon">✅</span>
                                <span class="resolve-option-text">
                                    <div class="resolve-option-label">${t('dispute.favor_initiator')}</div>
                                    <div class="resolve-option-desc">${dispute.initiator_role === "publisher" ? t('arbitrate.refund_publisher') : t('arbitrate.assignee_full_pay')}</div>
                                </span>
                            </label>
                            <label class="resolve-option" data-value="favor_respondent">
                                <input type="radio" name="resolution" value="favor_respondent">
                                <span class="resolve-option-icon">❌</span>
                                <span class="resolve-option-text">
                                    <div class="resolve-option-label">${t('dispute.favor_respondent')}</div>
                                    <div class="resolve-option-desc">${dispute.initiator_role === "publisher" ? t('arbitrate.assignee_full_pay') : t('arbitrate.refund_publisher')}</div>
                                </span>
                            </label>
                            <label class="resolve-option" data-value="split">
                                <input type="radio" name="resolution" value="split">
                                <span class="resolve-option-icon">⚖️</span>
                                <span class="resolve-option-text">
                                    <div class="resolve-option-label">${t('arbitrate.negotiate_split')}</div>
                                    <div class="resolve-option-desc">${t('arbitrate.split_desc')}</div>
                                </span>
                            </label>
                        </div>
                        
                        <div class="split-ratio" id="splitRatio" style="display: none;">
                            <label>${t('dispute.initiator')}</label>
                            <input type="range" id="ratioSlider" min="0" max="100" value="50">
                            <span class="ratio-value" id="ratioValue">50% : 50%</span>
                        </div>
                        
                        <div class="resolve-note">
                            <textarea id="resolveNote" placeholder="${t('arbitrate.ruling_note_optional')}"></textarea>
                        </div>
                        
                        <button class="resolve-btn" id="resolveBtn" disabled>${t('arbitrate.confirm_ruling')}</button>
                    </div>
                ` : `
                    <div class="modal-section">
                        <div class="modal-section-title">✅ ${t('dispute.resolution_result')}</div>
                        <div class="modal-section-content" style="background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3);">
                            <div style="font-weight: bold; color: #4CAF50; margin-bottom: 8px;">${getResolutionText(dispute.resolution, dispute.resolution_ratio)}</div>
                            ${dispute.resolution_note ? `<div style="color: #888; font-size: 13px;">${dispute.resolution_note}</div>` : ""}
                        </div>
                    </div>
                `}
            </div>
        `;

        // 关闭
        modal.querySelector("#closeBtn").onclick = onClose;

        // 裁决逻辑
        if (canResolve) {
            let selectedResolution = null;
            let ratio = 50;

            const options = modal.querySelectorAll(".resolve-option");
            const splitRatioEl = modal.querySelector("#splitRatio");
            const ratioSlider = modal.querySelector("#ratioSlider");
            const ratioValue = modal.querySelector("#ratioValue");
            const resolveBtn = modal.querySelector("#resolveBtn");

            options.forEach(opt => {
                opt.onclick = () => {
                    options.forEach(o => o.classList.remove("selected"));
                    opt.classList.add("selected");
                    opt.querySelector("input").checked = true;
                    selectedResolution = opt.dataset.value;
                    splitRatioEl.style.display = selectedResolution === "split" ? "flex" : "none";
                    resolveBtn.disabled = false;
                };
            });

            ratioSlider.oninput = () => {
                ratio = parseInt(ratioSlider.value);
                ratioValue.textContent = `${ratio}% : ${100 - ratio}%`;
            };

            resolveBtn.onclick = async () => {
                if (!selectedResolution) return;
                const note = modal.querySelector("#resolveNote").value.trim();
                resolveBtn.disabled = true;
                resolveBtn.textContent = `${t('common.processing')}...`;

                try {
                    await api.resolveDispute(dispute.id, selectedResolution, selectedResolution === "split" ? ratio : null, note || null);
                    showToast(t('arbitrate.ruling_success'), "success");
                    onClose();
                } catch (err) {
                    showToast(t('arbitrate.ruling_failed') + ": " + err.message, "error");
                    resolveBtn.disabled = false;
                    resolveBtn.textContent = t('arbitrate.confirm_ruling');
                }
            };
        }

    } catch (err) {
        modal.innerHTML = `<div style="padding: 40px; text-align: center; color: #f44;">❌ ${err.message}</div>`;
    }
}

function getResolutionText(resolution, ratio) {
    if (resolution === "favor_initiator") return t('dispute.favor_initiator');
    if (resolution === "favor_respondent") return t('dispute.favor_respondent');
    if (resolution === "split") return `${t('arbitrate.negotiate_split')}（${ratio}% : ${100 - ratio}%）`;
    return t('dispute.resolved');
}

function formatTime(timestamp) {
    if (!timestamp) return t('common.unknown');
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
