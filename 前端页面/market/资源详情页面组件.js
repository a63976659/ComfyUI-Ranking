// 前端页面/market/资源详情页面组件.js
// ==========================================
// 📦 资源详情页面组件
// ==========================================
// 作用：渲染工具/应用/推荐的详细信息页面
// 关联文件：
//   - 打赏等级工具.js (打赏榜单等级渲染)
//   - 资源安装引擎.js (安装/下载功能)
//   - 🔄 P7后悔模式：退款功能
// ==========================================

import { api, proxyImages } from "../core/网络请求API.js";
import { IS_WEB_MODE, getCachedProfile, setCachedProfile } from "../core/全局配置.js";
import { normalizeProfileData } from "../profile/个人资料工具.js";
import { openTipModal } from "../profile/个人中心_赞赏组件.js";
import { getInstalledVersionStatus, setupResourceInstall } from "./资源安装引擎.js";
import { renderTipBoardHTML } from "../components/打赏等级工具.js";
import { t } from "../components/用户体验增强.js";
import { createPurchaseStatusScope, isValidPurchaseStatus } from "./购买状态生命周期.js";
import { showResourceDeleteDialog } from "./资源删除组件.js";
import { showResourceRefundDialog } from "./资源退款组件.js";
import { showToast } from "../components/UI交互提示组件.js";
// 🧹 P2归一：escapeHtml 局部副本已移除，改用统一版（转义更严格，防XSS语义不变）
import { escapeHtml } from "../components/互动工具函数.js";

// 🔄 P7后悔模式：渲染退款按钮
async function renderRefundButton(container, itemData, currentUser, scope, purchaseStatus) {
    if (!currentUser) return;
    
    const refundArea = container.querySelector("#refund-area");
    if (!refundArea) return;
    if (!scope.isCurrent()) return;

    // 💸 检查商品是否支持退款
    if (!itemData.allow_refund && itemData.allow_refund !== undefined) {
        refundArea.innerHTML = '';  // 不支持退款则不显示任何退款相关UI
        return;
    }
    
    refundArea.style.display = "block";
    try {
        const statusRes = await purchaseStatus;
        if (!scope.isCurrent()) return;
        if (!isValidPurchaseStatus(statusRes)) throw new Error();
        if (!statusRes.owned) {
            refundArea.innerHTML = '';
            return;
        }
        
        if (statusRes.can_refund && statusRes.allow_refund) {
            const hoursLeft = Number(statusRes.refund_hours_left);
            if (!Number.isFinite(hoursLeft) || hoursLeft < 0) throw new Error("Invalid refund hours");
            refundArea.innerHTML = `
                <div style="margin-top: 12px; padding: 12px; background: rgba(255,152,0,0.1); border: 1px dashed #FF9800; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div style="font-size: 12px; color: #FF9800;">
                            🔄 ${t('item.regret_mode')}${t('item.hours_left', { hours: hoursLeft.toFixed(1) })}
                        </div>
                        <button id="btn-refund" style="background: #FF5722; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
                            💸 ${t('item.apply_refund')}
                        </button>
                    </div>
                    <div style="font-size: 11px; color: #888; margin-top: 8px;">
                        ⚠️ ${t('item.refund_warning')}
                    </div>
                </div>
            `;
            
            refundArea.querySelector("#btn-refund").onclick = () => {
                if (scope.isCurrent()) showRefundConfirm(itemData, currentUser, statusRes.price_paid, () => scope.isCurrent());
            };
        } else {
            refundArea.innerHTML = `
                <div style="margin-top: 12px; padding: 10px; background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 6px; font-size: 12px; color: #4CAF50;">
                    ✅ ${t('item.refund_expired')}
                </div>
            `;
        }
    } catch (e) {
        if (!scope.isCurrent()) return;
        refundArea.replaceChildren();
    }
}

// 卡片与详情页共用退款流程，成功关闭后返回列表。
function showRefundConfirm(itemData, currentUser, pricePaid, isCurrent) {
    return showResourceRefundDialog({
        itemData, currentUser, pricePaid, isCurrent,
        onClosed: () => window.dispatchEvent(new CustomEvent("comfy-route-back"))
    });
}

// ==========================================
// 🗑️ 删除内容功能
// ==========================================

/**
 * 检查当前用户是否有权限删除内容（作者或管理员）
 */
function canDeleteItem(itemData, currentUser) {
    if (!currentUser) return false;
    // 作者本人可以删除
    if (itemData.author === currentUser.account) return true;
    // 管理员可以删除
    if (currentUser.is_admin === true) return true;
    return false;
}

/**
 * 显示删除确认弹窗
 */
function showDeleteConfirm(itemData, currentUser, isCurrent) {
    return showResourceDeleteDialog({ itemData, currentUser, isCurrent,
        onDeleted: () => window.dispatchEvent(new CustomEvent('comfy-route-view', {
            detail: { view: 'market', type: itemData.type || 'tool' }
        })) });
}

export function createItemDetailView(itemData, currentUser) {
    // 确保图片URL走本地缓存代理
    itemData = proxyImages(itemData);
    
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", 
        // 🔧 自适应高度：flex 填充剩余空间，内容超出时在容器内部滚动（与主界面保持一致）
        fontSize: "14px", padding: "15px", overflowY: "auto", flex: "1", minHeight: "0", boxSizing: "border-box",
        backgroundColor: "#13151c" 
    });

    const cachedAuthor = getCachedProfile(itemData.author);
    const authorName = cachedAuthor?.name || itemData.author || t('common.unknown_user');

    // 🚀 使用统一工具渲染单品赞赏榜单（带星星/月亮/太阳等级）
    const boardData = Array.isArray(itemData.tip_board) ? itemData.tip_board.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
    const boardHtml = renderTipBoardHTML(boardData, 10, t('item.no_tips_yet'), "normal");

    // 🗑️ 判断是否有权限删除
    const showDeleteBtn = canDeleteItem(itemData, currentUser);
    const deleteBtnHtml = showDeleteBtn ? `
        <button id="btn-delete-item" style="background: #F44336; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(244,67,54,0.3); transition: 0.2s; margin-left: 10px;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🗑️ ${t('common.delete')}</button>
    ` : '';

    let authorInfoHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
                <strong>${t('item.author')}：</strong> <span id="detail-author-name">${escapeHtml(authorName)}</span>
                <!-- 原创标识 -->
                ${itemData.is_original ? `
                <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; 
                            background: linear-gradient(135deg, #FF6B35, #FF8F00); border-radius: 12px; 
                            font-size: 11px; color: #fff; font-weight: 500; margin-left: 8px;">
                    🎨 ${t('item.original_notice')}
                </div>
                ` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <button id="btn-tip-item" style="background: #E91E63; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(233,30,99,0.3); transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">💰 ${t('item.tip_encourage')}</button>
                ${deleteBtnHtml}
            </div>
        </div>
        <div style="margin-top: 10px; color: #888;">${escapeHtml(t('item.sponsor_thanks'))}</div>
            
        <!-- 🔄 P7后悔模式：退款区域 -->
        <div id="refund-area"></div>
            
        <div style="margin-top: 15px; border-top: 1px dashed #333; padding-top: 15px;">
            <div style="font-size: 13px; font-weight: bold; color: #E91E63; margin-bottom: 10px;">💖 ${t('item.tip_board_title')}</div>
            ${boardHtml}
        </div>
    `;

    // 🚀 核心逻辑：比对云端探测版本与本地安装版本
    const localVersionStatus = getInstalledVersionStatus(itemData.id);
    const localVersionHash = localVersionStatus.version;
    const cloudVersionHash = itemData.latest_version;
    const isFree = !itemData.price || itemData.price <= 0 || (currentUser && currentUser.account === itemData.author);
    
    let isUpdateAvailable = false;
    if (localVersionHash && cloudVersionHash && localVersionHash !== cloudVersionHash) {
        isUpdateAvailable = true;
    }

    let actionBtnHtml = '';
    if (IS_WEB_MODE) {
        // 📱 Web 模式：保留「立即获取」按钮但行为受限（未购买仅触发购买、已购买提示电脑端安装，见资源安装引擎）；不渲染重装/更新按钮
        actionBtnHtml = `<button type="button" id="btn-use-item" class="resource-install__button resource-install__entry" data-install-state="ready">⬇️ ${t('item.get_now')} <span class="resource-install__price">${isFree ? t('item.free') : escapeHtml(itemData.price) + ' ' + t('common.credits')}</span></button>`;
    } else if (!isUpdateAvailable && localVersionStatus.installed) {
        actionBtnHtml = `<button type="button" id="btn-use-item" class="resource-install__button resource-install__entry" data-install-state="success">✅ ${t('item.owned_reinstall')}</button>`;
    } else if (isUpdateAvailable) {
        actionBtnHtml = `<button type="button" id="btn-use-item" class="resource-install__button resource-install__entry" data-install-state="update">♻️ ${t('item.update_available')}</button>`;
    } else {
        actionBtnHtml = `<button type="button" id="btn-use-item" class="resource-install__button resource-install__entry" data-install-state="ready">⬇️ ${t('item.get_now')} <span class="resource-install__price">${isFree ? t('item.free') : escapeHtml(itemData.price) + ' ' + t('common.credits')}</span></button>`;
    }

    // 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移
    container.innerHTML = `
        <button id="btn-back-detail" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin-bottom: 15px; width: fit-content; transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
            ⬅ ${t('common.back')}
        </button>

        <div style="background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); margin-bottom: 15px;">
            <div style="font-size: 16px; font-weight: bold; color: #00bcd4; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                ⚙️ ${t('item.detail_info')}
            </div>
            <div style="color: #ddd; line-height: 1.8; font-size: 13px; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(itemData.fullDesc || itemData.shortDesc)}</div>
        </div>

        <div style="background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
            <div style="font-size: 16px; font-weight: bold; color: #4CAF50; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                🎉 ${t('item.other_info')}
            </div>
            <div style="color: #eee; line-height: 1.6; font-size: 14px;">
                ${authorInfoHtml}
            </div>
        </div>
    `;

    // 按既有状态生成的安装入口必须实际挂载到详情页面。
    container.insertAdjacentHTML("beforeend", actionBtnHtml);
    const scope = createPurchaseStatusScope(container.querySelector("#refund-area"), currentUser?.account);
    container._cleanup = () => scope.dispose();
    scope.addCleanup(() => {
        for (const id of ["btn-use-item", "btn-tip-item", "btn-delete-item"]) {
            const button = container.querySelector(`#${id}`);
            if (button) { button.onclick = null; button.remove(); }
        }
        container.querySelector("#inline-status-box")?.replaceChildren();
    });

    // 🚀 创建安装状态容器
    const inlineStatusBox = document.createElement("div");
    inlineStatusBox.id = "inline-status-box";
    Object.assign(inlineStatusBox.style, { display: "none", marginTop: "15px", padding: "12px", background: "var(--comfy-menu-bg)", borderRadius: "6px", border: "1px solid var(--border-color, #333)", fontSize: "13px" });
    container.appendChild(inlineStatusBox);
    if (!localVersionStatus.available) {
        inlineStatusBox.style.display = "block";
        inlineStatusBox.setAttribute("role", "status");
        inlineStatusBox.textContent = t('install.version_status_unavailable');
    }

    container.querySelector("#btn-back-detail").onclick = () => {
        scope.dispose();
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 🚀 绑定安装/更新按钮事件
    const btnUseItem = container.querySelector("#btn-use-item");
    if (btnUseItem) {
        const installation = setupResourceInstall(btnUseItem, itemData, currentUser, inlineStatusBox,
            { isCurrent: () => scope.isCurrent() });
        scope.addCleanup(() => installation?.dispose());
    }
    
    // 🚀 绑定作品打赏按钮事件
    container.querySelector("#btn-tip-item").onclick = async () => {
        if (!scope.isCurrent()) return;
        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
        await openTipModal(currentUser, { account: itemData.author }, undefined, itemData.id,
            { isCurrent: () => scope.isCurrent() });
    };

    // 🗑️ 绑定删除按钮事件
    const btnDeleteItem = container.querySelector("#btn-delete-item");
    if (btnDeleteItem) {
        btnDeleteItem.onclick = () => {
            if (!currentUser) return showToast(t('feedback.login_required'), "warning");
            if (scope.isCurrent()) showDeleteConfirm(itemData, currentUser, () => scope.isCurrent());
        };
    }

    // 🐛 Bug修复：跳过系统页面的作者信息查询（如关于页面）
    if (!itemData.isSystemPage && itemData.author && scope.isCurrent()) {
        const originalNameEl = container.querySelector("#detail-author-name");
        api.getUserProfile(itemData.author, scope.readOptions).then(res => {
            if (!scope.isCurrent() || !originalNameEl?.isConnected || container.querySelector("#detail-author-name") !== originalNameEl) return;
            if (res?.status !== 'success') return;
            const profile = normalizeProfileData(res.data, itemData.author);
            setCachedProfile(itemData.author, profile);
            if (originalNameEl?.isConnected && container.querySelector("#detail-author-name") === originalNameEl) {
                originalNameEl.textContent = profile.name || itemData.author;
            }
        }).catch(() => {});
    }

    // 拥有文案和退款入口使用同一次、同账号的购买快照。
    const needsOwnership = !localVersionHash && !isFree;
    const needsRefund = itemData.allow_refund !== false;
    if (currentUser && scope.isCurrent() && (needsOwnership || needsRefund)) {
        const purchaseStatus = api.getPurchaseStatus(currentUser.account, itemData.id, scope.readOptions)
            .then(response => {
                if (!scope.isCurrent() || !isValidPurchaseStatus(response)) return null;
                return response;
            }).catch(() => null);
        if (needsRefund) renderRefundButton(container, itemData, currentUser, scope, purchaseStatus);
        if (needsOwnership) purchaseStatus.then(response => {
            if (!scope.isCurrent() || !response?.owned || !btnUseItem?.isConnected
                || container.querySelector("#btn-use-item") !== btnUseItem) return;
            btnUseItem.textContent = `✅ ${t(IS_WEB_MODE ? 'item.owned_purchased' : 'item.owned_reinstall')}`;
            btnUseItem.setAttribute("data-install-state", "success");
        });
    }

    return container;
}
