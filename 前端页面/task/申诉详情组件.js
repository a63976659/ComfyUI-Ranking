// 前端页面/task/申诉详情组件.js
// ==========================================
// ⚖️ 申诉详情页面组件
// ==========================================
// 功能：展示申诉双方举证、回应、仲裁结果
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";

/**
 * 创建申诉详情视图
 * @param {string} disputeId - 申诉ID
 * @param {object} currentUser - 当前用户
 * @param {function} onBack - 返回回调
 */
export function createDisputeDetailView(disputeId, currentUser, onBack) {
    const container = document.createElement("div");
    container.className = "dispute-detail-container";
    container.style.cssText = "padding: 16px; background: var(--comfy-menu-bg); min-height: 100%;";

    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #888;">⏳ ${t('common.loading')}</div>`;

    loadDisputeDetail(container, disputeId, currentUser, onBack);

    return container;
}

async function loadDisputeDetail(container, disputeId, currentUser, onBack) {
    try {
        const res = await api.getDisputeDetail(disputeId);
        if (res.status !== "success") throw new Error(t('dispute.get_detail_failed'));

        const dispute = res.data;
        renderDisputeDetail(container, dispute, currentUser, onBack);
    } catch (err) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #f44;">❌ ${err.message}</div>`;
    }
}

function renderDisputeDetail(container, dispute, currentUser, onBack) {
    const isInitiator = currentUser?.account === dispute.initiator;
    const isRespondent = currentUser?.account === (dispute.initiator_role === "publisher" ? dispute.assignee : dispute.publisher);
    const isAdmin = currentUser?.isAdmin;
    const canRespond = isRespondent && dispute.status === "pending";

    const statusConfig = {
        pending: { label: t('dispute.status_pending'), color: "#FF9800", bg: "rgba(255, 152, 0, 0.1)" },
        responded: { label: t('dispute.status_responded'), color: "#2196F3", bg: "rgba(33, 150, 243, 0.1)" },
        resolved: { label: t('dispute.status_resolved'), color: "#4CAF50", bg: "rgba(76, 175, 80, 0.1)" }
    };
    const statusInfo = statusConfig[dispute.status] || statusConfig.pending;

    container.innerHTML = `
        <style>
            .dispute-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
            .dispute-back-btn { background: none; border: none; color: var(--input-text); cursor: pointer; font-size: 18px; padding: 8px; }
            .dispute-title { flex: 1; font-size: 18px; font-weight: bold; color: var(--input-text); }
            .dispute-status { padding: 4px 12px; border-radius: 12px; font-size: 12px; }
            
            .dispute-section { background: var(--comfy-input-bg); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
            .dispute-section-title { font-weight: bold; color: var(--input-text); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
            .dispute-section-title .icon { font-size: 16px; }
            
            .dispute-party { display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; }
            .dispute-party-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #555; }
            .dispute-party-info { flex: 1; }
            .dispute-party-name { font-weight: bold; color: var(--input-text); }
            .dispute-party-role { font-size: 12px; color: #888; }
            
            .dispute-content { padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid; }
            .dispute-content.initiator { border-color: #FF5722; }
            .dispute-content.respondent { border-color: #2196F3; }
            
            .dispute-evidence { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .dispute-evidence img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; cursor: pointer; }
            
            .dispute-time { font-size: 12px; color: #888; margin-top: 8px; }
            
            .dispute-respond-form { margin-top: 16px; }
            .dispute-respond-form textarea { width: 100%; height: 100px; background: var(--comfy-input-bg); border: 1px solid var(--border-color); border-radius: 8px; color: var(--input-text); padding: 12px; resize: vertical; box-sizing: border-box; }
            .dispute-respond-form .btn-row { display: flex; gap: 12px; margin-top: 12px; }
            .dispute-respond-btn { flex: 1; padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
            .dispute-respond-btn.primary { background: #2196F3; color: white; }
            
            .dispute-resolution { padding: 16px; background: linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(76,175,80,0.05) 100%); border-radius: 12px; border: 1px solid rgba(76,175,80,0.3); }
            .dispute-resolution-title { font-weight: bold; color: #4CAF50; margin-bottom: 12px; }
            .dispute-resolution-result { font-size: 16px; color: var(--input-text); margin-bottom: 8px; }
            .dispute-resolution-note { font-size: 14px; color: #888; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; }
            
            .dispute-upload-area { border: 2px dashed var(--border-color); border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; margin-top: 12px; color: #888; }
            .dispute-upload-area:hover { border-color: #2196F3; color: #2196F3; }
            .dispute-uploaded-images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .dispute-uploaded-images .img-wrapper { position: relative; }
            .dispute-uploaded-images img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; }
            .dispute-uploaded-images .remove-btn { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; background: #f44; color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 12px; line-height: 18px; }
        </style>
        
        <div class="dispute-header">
            <button class="dispute-back-btn" id="backBtn">←</button>
            <div class="dispute-title">${t('dispute.title')}</div>
            <span class="dispute-status" style="background: ${statusInfo.bg}; color: ${statusInfo.color};">
                ${statusInfo.label}
            </span>
        </div>
        
        <!-- 任务信息 -->
        <div class="dispute-section">
            <div class="dispute-section-title"><span class="icon">📋</span> ${t('dispute.related_task')}</div>
            <div style="color: var(--input-text); font-size: 15px;">${dispute.task_title || t('common.unknown_task')}</div>
            <div style="font-size: 12px; color: #888; margin-top: 4px;">${t('dispute.task_id')}: ${dispute.task_id}</div>
        </div>
        
        <!-- 双方信息 -->
        <div class="dispute-section">
            <div class="dispute-section-title"><span class="icon">👥</span> ${t('dispute.parties')}</div>
            <div class="dispute-party">
                <img class="dispute-party-avatar" src="${dispute.publisher_avatar || '/community_hub/image?url=https://api.dicebear.com/7.x/avataaars/svg'}" alt="">
                <div class="dispute-party-info">
                    <div class="dispute-party-name">${dispute.publisher_name || dispute.publisher}</div>
                    <div class="dispute-party-role">${t('dispute.publisher')} ${dispute.initiator_role === "publisher" ? `（${t('dispute.initiator')}）` : `（${t('dispute.respondent')}）`}</div>
                </div>
            </div>
            <div class="dispute-party">
                <img class="dispute-party-avatar" src="${dispute.assignee_avatar || '/community_hub/image?url=https://api.dicebear.com/7.x/avataaars/svg'}" alt="">
                <div class="dispute-party-info">
                    <div class="dispute-party-name">${dispute.assignee_name || dispute.assignee}</div>
                    <div class="dispute-party-role">${t('task.assignee')} ${dispute.initiator_role === "assignee" ? `（${t('dispute.initiator')}）` : `（${t('dispute.respondent')}）`}</div>
                </div>
            </div>
        </div>
        
        <!-- 申诉方陈述 -->
        <div class="dispute-section">
            <div class="dispute-section-title"><span class="icon">📝</span> ${t('dispute.initiator_statement')}</div>
            <div class="dispute-content initiator">
                <div style="color: var(--input-text);">${dispute.reason || t('common.none')}</div>
                ${dispute.evidence && dispute.evidence.length > 0 ? `
                    <div class="dispute-evidence">
                        ${dispute.evidence.map(img => `<img src="${img}" onclick="window.open('${img}')">`).join("")}
                    </div>
                ` : ""}
                <div class="dispute-time">${t('dispute.submitted_at')} ${formatTime(dispute.created_at)}</div>
            </div>
        </div>
        
        <!-- 被申诉方回应 -->
        <div class="dispute-section">
            <div class="dispute-section-title"><span class="icon">💬</span> ${t('dispute.respondent_response')}</div>
            ${dispute.response ? `
                <div class="dispute-content respondent">
                    <div style="color: var(--input-text);">${dispute.response}</div>
                    ${dispute.response_evidence && dispute.response_evidence.length > 0 ? `
                        <div class="dispute-evidence">
                            ${dispute.response_evidence.map(img => `<img src="${img}" onclick="window.open('${img}')">`).join("")}
                        </div>
                    ` : ""}
                    <div class="dispute-time">${t('dispute.responded_at')} ${formatTime(dispute.responded_at)}</div>
                </div>
            ` : `
                <div style="color: #888; padding: 12px; text-align: center;">${t('dispute.no_response')}</div>
                ${canRespond ? `
                    <div class="dispute-respond-form">
                        <textarea id="respondText" placeholder="${t('dispute.response_placeholder')}"></textarea>
                        <div class="dispute-upload-area" id="uploadArea">📷 ${t('dispute.click_upload_evidence_optional')}</div>
                        <input type="file" id="fileInput" accept="image/*" multiple style="display: none;">
                        <div class="dispute-uploaded-images" id="uploadedImages"></div>
                        <div class="btn-row">
                            <button class="dispute-respond-btn primary" id="submitResponseBtn">${t('dispute.submit_response')}</button>
                        </div>
                    </div>
                ` : ""}
            `}
        </div>
        
        <!-- 仲裁结果 -->
        ${dispute.status === "resolved" ? `
            <div class="dispute-resolution">
                <div class="dispute-resolution-title">⚖️ ${t('dispute.resolution_result')}</div>
                <div class="dispute-resolution-result">${getResolutionText(dispute.resolution, dispute.resolution_ratio)}</div>
                ${dispute.resolution_note ? `
                    <div class="dispute-resolution-note">${dispute.resolution_note}</div>
                ` : ""}
                <div class="dispute-time">${t('dispute.resolved_at')} ${formatTime(dispute.resolved_at)}</div>
            </div>
        ` : ""}
    `;

    // 返回按钮
    container.querySelector("#backBtn").onclick = () => onBack && onBack();

    // 回应表单逻辑
    if (canRespond) {
        const uploadedEvidence = [];
        const uploadArea = container.querySelector("#uploadArea");
        const fileInput = container.querySelector("#fileInput");
        const uploadedImages = container.querySelector("#uploadedImages");
        const submitBtn = container.querySelector("#submitResponseBtn");

        uploadArea.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            for (const file of e.target.files) {
                if (uploadedEvidence.length >= 6) {
                    showToast(t('dispute.max_6_images'), "warning");
                    break;
                }
                try {
                    const res = await api.uploadFile(file, "dispute");
                    uploadedEvidence.push(res.url);
                    renderUploadedImages();
                } catch (err) {
                    showToast(t('dispute.upload_failed') + ": " + err.message, "error");
                }
            }
        };

        function renderUploadedImages() {
            uploadedImages.innerHTML = uploadedEvidence.map((url, idx) => `
                <div class="img-wrapper">
                    <img src="${url}">
                    <button class="remove-btn" data-idx="${idx}">×</button>
                </div>
            `).join("");
            uploadedImages.querySelectorAll(".remove-btn").forEach(btn => {
                btn.onclick = () => {
                    uploadedEvidence.splice(parseInt(btn.dataset.idx), 1);
                    renderUploadedImages();
                };
            });
        }

        submitBtn.onclick = async () => {
            const responseText = container.querySelector("#respondText").value.trim();
            if (!responseText) {
                showToast(t('dispute.please_enter_response'), "warning");
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = `${t('common.submitting')}...`;
            try {
                await api.respondDispute(dispute.id, responseText, uploadedEvidence);
                showToast(t('dispute.response_submitted'), "success");
                loadDisputeDetail(container, dispute.id, currentUser, onBack);
            } catch (err) {
                showToast(t('dispute.submit_failed') + ": " + err.message, "error");
                submitBtn.disabled = false;
                submitBtn.textContent = t('dispute.submit_response');
            }
        };
    }
}

function getResolutionText(resolution, ratio) {
    if (resolution === "favor_initiator") return t('dispute.favor_initiator');
    if (resolution === "favor_respondent") return t('dispute.favor_respondent');
    if (resolution === "split") return `${t('dispute.split_result')} (${t('dispute.initiator')} ${ratio}% : ${t('dispute.respondent')} ${100 - ratio}%)`;
    return t('dispute.resolved');
}

function formatTime(timestamp) {
    if (!timestamp) return t('common.unknown');
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
