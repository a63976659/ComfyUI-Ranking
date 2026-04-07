// 前端页面/task/管理员提现组件.js
// ==========================================
// 💰 管理员提现管理界面
// ==========================================
// 功能：查看提现列表、确认打款
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { globalModal } from "../components/全局弹窗管理器.js";

/**
 * 创建管理员提现管理视图
 * @param {object} currentUser - 当前管理员用户
 */
export function createWithdrawManageView(currentUser) {
    const container = document.createElement("div");
    container.className = "admin-withdraw-container";
    container.style.cssText = "padding: 16px; background: var(--comfy-menu-bg); min-height: 100%;";

    renderWithdrawList(container, currentUser, "pending");

    return container;
}

async function renderWithdrawList(container, currentUser, statusFilter = "pending") {
    container.innerHTML = `
        <style>
            .admin-withdraw-header { margin-bottom: 20px; }
            .admin-withdraw-title { font-size: 20px; font-weight: bold; color: var(--input-text); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
            .admin-withdraw-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
            .admin-tab { padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px; transition: all 0.2s; }
            .admin-tab.active { background: #4CAF50; color: white; }
            .admin-tab:not(.active) { background: var(--comfy-input-bg); color: var(--input-text); }
            
            .admin-back-btn { background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s; backdrop-filter: blur(4px); margin-bottom: 16px; width: fit-content; }
            .admin-back-btn:hover { background: #4CAF50; border-color: #4CAF50; }
            
            .withdraw-list { display: flex; flex-direction: column; gap: 12px; }
            .withdraw-card { background: #2b2b2b; border: 1px solid #444; border-radius: 12px; padding: 16px; transition: transform 0.2s, box-shadow 0.2s; }
            .withdraw-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            
            .withdraw-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .withdraw-card-user { font-weight: bold; color: var(--input-text); font-size: 15px; display: flex; align-items: center; gap: 8px; }
            .withdraw-card-amount { font-size: 18px; font-weight: bold; color: #FF5722; }
            .withdraw-card-rmb { font-size: 12px; color: #888; margin-left: 4px; }
            
            .withdraw-card-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
            .withdraw-info-item { background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; }
            .withdraw-info-label { font-size: 11px; color: #888; margin-bottom: 4px; }
            .withdraw-info-value { font-size: 13px; color: var(--input-text); }
            .withdraw-info-value.highlight { color: #2196F3; font-weight: bold; }
            
            .withdraw-card-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #888; margin-bottom: 12px; }
            
            .withdraw-card-actions { display: flex; gap: 10px; align-items: center; }
            .withdraw-order-input { flex: 1; padding: 10px 12px; background: var(--comfy-input-bg); border: 1px solid #555; border-radius: 8px; color: var(--input-text); font-size: 13px; outline: none; }
            .withdraw-order-input:focus { border-color: #4CAF50; }
            .withdraw-order-input::placeholder { color: #666; }
            
            .withdraw-confirm-btn { padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
            .withdraw-confirm-btn:hover { background: #45a049; transform: scale(1.02); }
            .withdraw-confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
            
            .withdraw-completed-info { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 8px; }
            .withdraw-completed-icon { color: #4CAF50; font-size: 16px; }
            .withdraw-completed-text { color: #4CAF50; font-size: 13px; font-weight: bold; }
            .withdraw-completed-order { color: #888; font-size: 12px; margin-left: auto; }
            
            .status-badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }
            .status-pending { background: rgba(255, 152, 0, 0.15); color: #FF9800; }
            .status-completed { background: rgba(76, 175, 80, 0.15); color: #4CAF50; }
            
            .empty-state { text-align: center; padding: 60px 20px; color: #888; }
            .empty-state .icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
        </style>
        
        <button class="admin-back-btn" id="btn-back-withdraw">
            <span style="font-size: 14px;">⬅</span> ${t('common.back')}
        </button>
        
        <div class="admin-withdraw-header">
            <div class="admin-withdraw-title">💰 ${t('withdraw.manage_title')}</div>
            <div class="admin-withdraw-tabs">
                <button class="admin-tab ${statusFilter === 'pending' ? 'active' : ''}" data-status="pending">⏳ ${t('withdraw.pending_payment')}</button>
                <button class="admin-tab ${statusFilter === 'completed' ? 'active' : ''}" data-status="completed">✅ ${t('withdraw.completed')}</button>
            </div>
        </div>
        
        <div class="withdraw-list" id="withdrawList">
            <div style="text-align: center; padding: 40px; color: #888;">⏳ ${t('common.loading')}</div>
        </div>
    `;

    // 返回按钮事件
    container.querySelector("#btn-back-withdraw").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    // Tab切换
    container.querySelectorAll(".admin-tab").forEach(tab => {
        tab.onclick = () => {
            const status = tab.dataset.status;
            renderWithdrawList(container, currentUser, status);
        };
    });

    // 加载提现列表
    try {
        const res = await api.getAdminWithdrawals(statusFilter);
        const withdrawals = res.data || [];
        const listEl = container.querySelector("#withdrawList");

        if (withdrawals.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📭</div>
                    <div>${statusFilter === 'pending' ? t('withdraw.no_pending') : t('withdraw.no_completed')}</div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = withdrawals.map(w => {
            const isPending = w.withdraw_status === "pending";
            const amount = Math.abs(w.amount || 0);
            const createdAt = formatTime(w.created_at);
            
            return `
                <div class="withdraw-card" data-id="${w.tx_id}">
                    <div class="withdraw-card-header">
                        <div class="withdraw-card-user">
                            👤 ${w.account || t('common.unknown')}
                            <span class="status-badge ${isPending ? 'status-pending' : 'status-completed'}">
                                ${isPending ? t('withdraw.pending') : t('withdraw.completed')}
                            </span>
                        </div>
                        <div class="withdraw-card-amount">
                            ${amount} 积分
                            <span class="withdraw-card-rmb">(¥${amount})</span>
                        </div>
                    </div>
                    
                    <div class="withdraw-card-info">
                        <div class="withdraw-info-item">
                            <div class="withdraw-info-label">📱 ${t('withdraw.alipay_account')}</div>
                            <div class="withdraw-info-value highlight">${w.alipay_account || '-'}</div>
                        </div>
                        <div class="withdraw-info-item">
                            <div class="withdraw-info-label">👤 ${t('withdraw.real_name')}</div>
                            <div class="withdraw-info-value">${w.real_name || '-'}</div>
                        </div>
                    </div>
                    
                    <div class="withdraw-card-meta">
                        <span>🕐 ${t('withdraw.apply_time')}: ${createdAt}</span>
                        <span>ID: #${w.tx_id}</span>
                    </div>
                    
                    ${isPending ? `
                        <div class="withdraw-card-actions">
                            <input type="text" class="withdraw-order-input" id="orderInput-${w.tx_id}" placeholder="${t('withdraw.enter_order_id')}" maxlength="64">
                            <button class="withdraw-confirm-btn" id="confirmBtn-${w.tx_id}" onclick="window._handleConfirmWithdrawal('${w.tx_id}')">
                                ${t('withdraw.confirm_payment')}
                            </button>
                        </div>
                    ` : `
                        <div class="withdraw-completed-info">
                            <span class="withdraw-completed-icon">✅</span>
                            <span class="withdraw-completed-text">${t('withdraw.payment_completed')}</span>
                            <span class="withdraw-completed-order">${t('withdraw.order_id')}: ${w.payment_order_id || '-'}</span>
                        </div>
                    `}
                </div>
            `;
        }).join("");

        // 绑定确认打款事件
        window._handleConfirmWithdrawal = async (txId) => {
            const inputEl = container.querySelector(`#orderInput-${txId}`);
            const btnEl = container.querySelector(`#confirmBtn-${txId}`);
            const paymentOrderId = inputEl.value.trim();

            if (!paymentOrderId) {
                showToast(t('withdraw.order_required'), "warning");
                inputEl.focus();
                return;
            }

            // 使用全局弹窗管理器进行二次确认
            const confirmContent = document.createElement("div");
            confirmContent.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">💰</div>
                    <div style="font-size: 16px; color: var(--input-text); margin-bottom: 8px;">
                        ${t('withdraw.confirm_title')}
                    </div>
                    <div style="font-size: 13px; color: #888; margin-bottom: 20px;">
                        ${t('withdraw.confirm_desc')}
                    </div>
                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                        <div style="font-size: 12px; color: #888; margin-bottom: 4px;">${t('withdraw.order_id')}</div>
                        <div style="font-size: 14px; color: #4CAF50; font-weight: bold; word-break: break-all;">${paymentOrderId}</div>
                    </div>
                </div>
            `;

            const confirmed = await globalModal.confirm(
                t('withdraw.confirm_payment'),
                confirmContent,
                {
                    confirmText: t('common.confirm'),
                    cancelText: t('common.cancel'),
                    confirmClass: 'success'
                }
            );

            if (!confirmed) return;

            // 执行确认打款
            btnEl.disabled = true;
            btnEl.textContent = `${t('common.processing')}...`;

            try {
                await api.completeWithdrawal(txId, paymentOrderId);
                showToast(t('withdraw.payment_success'), "success");
                // 刷新列表
                renderWithdrawList(container, currentUser, statusFilter);
            } catch (err) {
                showToast(t('withdraw.payment_failed') + ": " + err.message, "error");
                btnEl.disabled = false;
                btnEl.textContent = t('withdraw.confirm_payment');
            }
        };

    } catch (err) {
        container.querySelector("#withdrawList").innerHTML = `
            <div style="text-align: center; padding: 40px; color: #f44;">❌ ${t('common.load_failed')}: ${err.message}</div>
        `;
    }
}

function formatTime(timestamp) {
    if (!timestamp) return t('common.unknown');
    const date = typeof timestamp === "number"
        ? new Date(timestamp * 1000)
        : new Date(timestamp);
    if (isNaN(date.getTime())) return t('common.unknown');
    return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
