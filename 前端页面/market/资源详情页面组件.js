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
                <div class="resource-detail__refund-panel">
                    <div class="resource-detail__refund-header">
                        <div class="resource-detail__refund-copy">
                            🔄 ${t('item.regret_mode')}${t('item.hours_left', { hours: hoursLeft.toFixed(1) })}
                        </div>
                        <button type="button" id="btn-refund" class="resource-detail__button resource-detail__button--warning">
                            💸 ${t('item.apply_refund')}
                        </button>
                    </div>
                    <div class="resource-detail__refund-warning">
                        ⚠️ ${t('item.refund_warning')}
                    </div>
                </div>
            `;
            
            refundArea.querySelector("#btn-refund").onclick = () => {
                if (scope.isCurrent()) showRefundConfirm(itemData, currentUser, statusRes.price_paid, () => scope.isCurrent());
            };
        } else {
            refundArea.innerHTML = `
                <div class="resource-detail__refund-expired">
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
    container.className = "resource-page";

    const cachedAuthor = getCachedProfile(itemData.author);
    const authorName = cachedAuthor?.name || itemData.author || t('common.unknown_user');

    // 🚀 使用统一工具渲染单品赞赏榜单（带星星/月亮/太阳等级）
    const boardData = Array.isArray(itemData.tip_board) ? itemData.tip_board.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
    const boardHtml = renderTipBoardHTML(boardData, 10, t('item.no_tips_yet'), "normal");

    // 🗑️ 判断是否有权限删除
    const showDeleteBtn = canDeleteItem(itemData, currentUser);
    const deleteBtnHtml = showDeleteBtn ? `
        <button type="button" id="btn-delete-item" class="resource-detail__button resource-detail__button--danger">🗑️ ${t('common.delete')}</button>
    ` : '';

    let authorInfoHtml = `
        <div class="resource-page__author">
            <div>
                <strong>${t('item.author')}：</strong> <span id="detail-author-name">${escapeHtml(authorName)}</span>
                <!-- 原创标识 -->
                ${itemData.is_original ? `
                <div class="resource-detail__badge resource-detail__badge--original">
                    🎨 ${t('item.original_notice')}
                </div>
                ` : ''}
            </div>
            <div class="resource-page__actions">
                <button type="button" id="btn-tip-item" class="resource-detail__button resource-detail__button--tip">💰 ${t('item.tip_encourage')}</button>
                ${deleteBtnHtml}
            </div>
        </div>
        <div class="resource-page__thanks">${escapeHtml(t('item.sponsor_thanks'))}</div>
            
        <!-- 🔄 P7后悔模式：退款区域 -->
        <div id="refund-area" class="resource-page__refund"></div>
            
        <div class="resource-page__tips">
            <div class="resource-detail__heading">💖 ${t('item.tip_board_title')}</div>
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

    container.innerHTML = `
        <button type="button" id="btn-back-detail" class="resource-detail__button resource-page__back">
            ⬅ ${t('common.back')}
        </button>

        <div class="resource-page__section">
            <div class="resource-page__heading">
                ⚙️ ${t('item.detail_info')}
            </div>
            <div class="resource-page__description">${escapeHtml(itemData.fullDesc || itemData.shortDesc)}</div>
        </div>

        <div class="resource-page__section">
            <div class="resource-page__heading">
                🎉 ${t('item.other_info')}
            </div>
            <div class="resource-page__info">
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
    inlineStatusBox.className = "resource-detail__status resource-install__status";
    inlineStatusBox.style.display = "none";
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
