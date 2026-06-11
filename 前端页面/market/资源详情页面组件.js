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
import { openTipModal } from "../profile/个人中心_赞赏组件.js";
import { setupResourceInstall } from "./资源安装引擎.js";
import { renderTipBoardHTML } from "../components/打赏等级工具.js";
import { t } from "../components/用户体验增强.js";
import { removeCache } from "../components/性能优化工具.js";
import { invalidateRelatedCache } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";

/**
 * 转义HTML特殊字符，防止XSS注入
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 🔄 P7后悔模式：渲染退款按钮
async function renderRefundButton(container, itemData, currentUser) {
    if (!currentUser) return;
    
    const refundArea = container.querySelector("#refund-area");
    if (!refundArea) return;

    // 💸 检查商品是否支持退款
    if (!itemData.allow_refund && itemData.allow_refund !== undefined) {
        refundArea.innerHTML = '';  // 不支持退款则不显示任何退款相关UI
        return;
    }
    
    try {
        const statusRes = await api.getPurchaseStatus(currentUser.account, itemData.id);
        if (!statusRes.owned) {
            refundArea.innerHTML = '';
            return;
        }
        
        if (statusRes.can_refund) {
            const hoursLeft = statusRes.refund_hours_left;
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
            
            refundArea.querySelector("#btn-refund").onclick = () => showRefundConfirm(itemData, currentUser, statusRes.price_paid);
        } else {
            refundArea.innerHTML = `
                <div style="margin-top: 12px; padding: 10px; background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 6px; font-size: 12px; color: #4CAF50;">
                    ✅ ${t('item.refund_expired')}
                </div>
            `;
        }
    } catch (e) {
        console.warn("获取购买状态失败:", e);
    }
}

/**
 * 通用确认弹窗
 * @param {Object} config - 弹窗配置
 * @param {string} config.title - 弹窗标题
 * @param {string} config.titleColor - 标题颜色
 * @param {string} config.infoHtml - 商品信息区域HTML
 * @param {string} config.warningHtml - 警告区域HTML
 * @param {string} config.warningBgColor - 警告区域背景色
 * @param {string} config.warningBorderColor - 警告区域边框色
 * @param {string} config.confirmText - 确认按钮文本
 * @param {string} config.confirmColor - 确认按钮颜色
 * @param {string} config.confirmHoverColor - 确认按钮悬停颜色
 * @param {string} config.processingText - 处理中文本
 * @param {Function} config.onConfirm - 确认回调 (overlay: HTMLElement) => Promise<void>
 */
function _showConfirmOverlay({ title, titleColor, infoHtml, warningHtml, warningBgColor, warningBorderColor, confirmText, confirmColor, confirmHoverColor, processingText, onConfirm }) {
    // 两个按钮的公共基础样式
    const _btnBaseStyle = "color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: 0.2s;";

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", top: "0", left: "0", right: "0", bottom: "0",
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: "10000"
    });

    overlay.innerHTML = `
        <div style="background: #1e2233; border-radius: 12px; padding: 25px; max-width: 420px; width: 90%; color: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px; color: ${titleColor}; display: flex; align-items: center; gap: 10px;">
                ⚠️ ${title}
            </div>

            <div style="background: #2a2d3e; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                ${infoHtml}
            </div>

            <div style="background: ${warningBgColor}; border: 1px solid ${warningBorderColor}; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <div style="font-size: 13px; color: #FF9800; line-height: 1.8;">
                    ${warningHtml}
                </div>
            </div>

            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="btn-cancel-confirm" style="background: #555; ${_btnBaseStyle}">
                    ${t('common.cancel')}
                </button>
                <button id="btn-confirm-action" style="background: ${confirmColor}; font-weight: bold; ${_btnBaseStyle}">
                    ${confirmText}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector("#btn-cancel-confirm");
    cancelBtn.onmouseover = () => { cancelBtn.style.background = "#666"; };
    cancelBtn.onmouseout  = () => { cancelBtn.style.background = "#555"; };
    cancelBtn.onclick = () => overlay.remove();

    const confirmBtn = overlay.querySelector("#btn-confirm-action");
    confirmBtn.onmouseover = () => { confirmBtn.style.background = confirmHoverColor; };
    confirmBtn.onmouseout  = () => { confirmBtn.style.background = confirmColor; };
    confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerText = processingText;
        await onConfirm(overlay);
    };

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// 🔄 P7后悔模式：退款确认弹窗
function showRefundConfirm(itemData, currentUser, pricePaid) {
    _showConfirmOverlay({
        title: t('item.confirm_refund_title'),
        titleColor: "#FF5722",
        infoHtml: `
            <div style="font-size: 14px; margin-bottom: 10px;">${t('item.product')}${escapeHtml(itemData.title || t('item.untitled'))}</div>
            <div style="font-size: 14px; color: #4CAF50;">${t('item.refund_amount')}<strong>${pricePaid}</strong> ${t('common.credits')}</div>
        `,
        warningHtml: `
            <div>🚨 <strong>${t('item.refund_consequence')}：</strong></div>
            <div style="margin-left: 20px; margin-top: 5px;">
                • ${t('item.refund_consequence_1')}<br>
                • ${t('item.refund_consequence_2')}<br>
                • <strong style="color: #F44336;">${t('item.refund_consequence_3')}</strong>
            </div>
        `,
        warningBgColor: "rgba(255,87,34,0.1)",
        warningBorderColor: "rgba(255,87,34,0.3)",
        confirmText: t('item.confirm_refund'),
        confirmColor: "#FF5722",
        confirmHoverColor: "#E64A19",
        processingText: t('common.processing'),
        onConfirm: async (overlay) => {
            try {
                const res = await api.requestRefund(currentUser.account, itemData.id);
                if (res.status === "success") {
                    // 🔄 P7后悔模式：清除本地缓存和文件
                    burnLocalFiles(itemData.id);

                    overlay.innerHTML = `
                        <div style="background: #1e2233; border-radius: 12px; padding: 25px; max-width: 380px; width: 90%; color: #fff; text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #4CAF50;">${t('item.refund_success')}</div>
                            <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">
                                ${res.refund_amount} ${t('item.credits_refunded')}<br>
                                <span style="color: #FF9800;">${t('item.ban_days_notice', { days: res.ban_days })}</span>
                            </div>
                            <button id="btn-close-refund" style="background: #4CAF50; color: #fff; border: none; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 14px;">
                                ${t('common.got_it')}
                            </button>
                        </div>
                    `;
                    overlay.querySelector("#btn-close-refund").onclick = () => {
                        overlay.remove();
                        window.dispatchEvent(new CustomEvent("comfy-route-back"));
                    };
                } else {
                    showToast(t('item.refund_failed_retry'), "error");
                    overlay.remove();
                }
            } catch (e) {
                showToast(t('item.refund_request_failed'), "error");
                overlay.remove();
            }
        }
    });
}

// 🔄 P7后悔模式：焚毁本地文件和缓存
function burnLocalFiles(itemId) {
    // 清除本地版本标记
    localStorage.removeItem(`ComfyCommunity_LocalVer_${itemId}`);
    
    // 清除购买缓存
    removeCache(`ItemOwnership_${itemId}`);
    
    // 清除列表缓存（强制下次刷新）
    removeCache('api_/api/items');
    removeCache('api_/api/creators');
    
    // 清除工具/应用/推荐列表缓存（使用标准 ListCache 格式）
    const tabs = ['tools', 'apps', 'recommends'];
    const sorts = ['time', 'downloads', 'likes', 'favorites', 'tips', 'views', 'daily_views', 'rating'];
    for (const tab of tabs) {
        for (const sort of sorts) {
            removeCache(`ListCache_${tab}_${sort}`);
        }
    }
    
    console.log(`🔥 已焚毁资源 ${itemId} 的本地数据`);
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
    if (currentUser.is_admin) return true;
    return false;
}

/**
 * 显示删除确认弹窗
 */
function showDeleteConfirm(itemData, currentUser, onSuccess) {
    _showConfirmOverlay({
        title: t('item.confirm_delete_title'),
        titleColor: "#F44336",
        infoHtml: `
            <div style="font-size: 14px; margin-bottom: 10px;">${t('item.content_label')}${escapeHtml(itemData.title || t('item.untitled'))}</div>
            <div style="font-size: 13px; color: #888;">${t('item.type_label')}${escapeHtml(itemData.type || t('item.type_unknown'))}</div>
        `,
        warningHtml: `
            <div>🚨 <strong>${t('item.delete_consequence')}：</strong></div>
            <div style="margin-left: 20px; margin-top: 5px;">
                • ${t('item.delete_consequence_1')}<br>
                • ${t('item.delete_consequence_2')}<br>
                • ${t('item.delete_consequence_3')}
            </div>
        `,
        warningBgColor: "rgba(244,67,54,0.1)",
        warningBorderColor: "rgba(244,67,54,0.3)",
        confirmText: t('item.confirm_delete'),
        confirmColor: "#F44336",
        confirmHoverColor: "#D32F2F",
        processingText: t('item.deleting'),
        onConfirm: async (overlay) => {
            try {
                const res = await api.deleteItem(itemData.id);
                if (res.status === "success") {
                    // 清除相关缓存
                    invalidateRelatedCache(`/api/items/${itemData.id}`, "DELETE");

                    overlay.remove();
                    showToast(t('item.delete_success'), "success");

                    // 返回列表页
                    window.dispatchEvent(new CustomEvent("comfy-route-view", {
                        detail: { view: "market", type: itemData.type || "tool" }
                    }));

                    if (onSuccess) onSuccess();
                } else {
                    showToast(t('item.delete_failed_retry'), "error");
                    overlay.remove();
                }
            } catch (e) {
                showToast(t('item.delete_request_failed'), "error");
                overlay.remove();
            }
        }
    });
}

export function createItemDetailView(itemData, currentUser) {
    // 确保图片URL走本地缓存代理
    itemData = proxyImages(itemData);
    
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", 
        fontSize: "14px", padding: "15px", overflowY: "auto", flex: "none", height: "1220px", boxSizing: "border-box",
        backgroundColor: "#13151c" 
    });

    const authorCacheKey = `ComfyCommunity_ProfileCache_${itemData.author}`;
    const cachedAuthorStr = localStorage.getItem(authorCacheKey);
    let authorName = itemData.author;
    if (cachedAuthorStr) { try { authorName = JSON.parse(cachedAuthorStr).name || itemData.author; } catch(e) {} }

    // 🚀 使用统一工具渲染单品赞赏榜单（带星星/月亮/太阳等级）
    const boardData = itemData.tip_board || [];
    const boardHtml = renderTipBoardHTML(boardData, 10, t('item.no_tips_yet'), "normal");

    // 🗑️ 判断是否有权限删除
    const showDeleteBtn = canDeleteItem(itemData, currentUser);
    const deleteBtnHtml = showDeleteBtn ? `
        <button id="btn-delete-item" style="background: #F44336; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(244,67,54,0.3); transition: 0.2s; margin-left: 10px;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🗑️ ${t('common.delete')}</button>
    ` : '';

    let authorInfoHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
                <strong>${t('item.author')}：</strong> <span id="detail-author-name">${authorName}</span>
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
        <div style="margin-top: 10px; color: #888;">感谢 砚影科技 的支持！</div>
            
        <!-- 🔄 P7后悔模式：退款区域 -->
        <div id="refund-area"></div>
            
        <div style="margin-top: 15px; border-top: 1px dashed #333; padding-top: 15px;">
            <div style="font-size: 13px; font-weight: bold; color: #E91E63; margin-bottom: 10px;">💖 ${t('item.tip_board_title')}</div>
            ${boardHtml}
        </div>
    `;

    // 🚀 核心逻辑：比对云端探测版本与本地安装版本
    const localVersionHash = localStorage.getItem(`ComfyCommunity_LocalVer_${itemData.id}`);
    const cloudVersionHash = itemData.latest_version;
    const isFree = !itemData.price || itemData.price <= 0 || (currentUser && currentUser.account === itemData.author);
    
    let isUpdateAvailable = false;
    if (localVersionHash && cloudVersionHash && localVersionHash !== cloudVersionHash) {
        isUpdateAvailable = true;
    }

    let actionBtnHtml = '';
    if (!isUpdateAvailable && localVersionHash) {
        actionBtnHtml = `<button id="btn-use-item" style="flex: 1; padding: 12px; border-radius: 6px; border: none; background: #4CAF50; color: #fff; font-weight: bold; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.1s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">✅ ${t('item.owned_reinstall')}</button>`;
    } else if (isUpdateAvailable) {
        actionBtnHtml = `<button id="btn-use-item" style="flex: 1; padding: 12px; border-radius: 6px; border: 1px solid #FF9800; background: rgba(255, 152, 0, 0.2); color: #FF9800; font-weight: bold; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);" onmouseover="this.style.background='#FF9800'; this.style.color='#fff'" onmouseout="this.style.background='rgba(255, 152, 0, 0.2)'; this.style.color='#FF9800'">♻️ ${t('item.update_available')}</button>`;
    } else {
        actionBtnHtml = `<button id="btn-use-item" style="flex: 1; padding: 12px; border-radius: 6px; border: none; background: #2196F3; color: #fff; font-weight: bold; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.1s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">⬇️ ${t('item.get_now')} <span style="font-size: 12px; font-weight: normal; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${isFree ? t('item.free') : itemData.price + ' ' + t('common.credits')}</span></button>`;
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

    // 🚀 创建安装状态容器
    const inlineStatusBox = document.createElement("div");
    inlineStatusBox.id = "inline-status-box";
    Object.assign(inlineStatusBox.style, { display: "none", marginTop: "15px", padding: "12px", background: "var(--comfy-menu-bg)", borderRadius: "6px", border: "1px solid var(--border-color, #333)", fontSize: "13px" });
    container.appendChild(inlineStatusBox);

    container.querySelector("#btn-back-detail").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
    
    // 🚀 绑定安装/更新按钮事件
    const btnUseItem = container.querySelector("#btn-use-item");
    if (btnUseItem) {
        setupResourceInstall(btnUseItem, itemData, currentUser, inlineStatusBox);
    }
    
    // 🚀 绑定作品打赏按钮事件
    container.querySelector("#btn-tip-item").onclick = async () => {
        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
        await openTipModal(currentUser, { account: itemData.author }, (newBalance) => {
            currentUser.balance = newBalance;
            // 打赏成功后刷新局部或整体详情 (由框架重新渲染)
        }, itemData.id);
    };

    // 🗑️ 绑定删除按钮事件
    const btnDeleteItem = container.querySelector("#btn-delete-item");
    if (btnDeleteItem) {
        btnDeleteItem.onclick = () => {
            if (!currentUser) return showToast(t('feedback.login_required'), "warning");
            showDeleteConfirm(itemData, currentUser);
        };
    }

    // 🐛 Bug修复：跳过系统页面的作者信息查询（如关于页面）
    if (!itemData.isSystemPage) {
        api.getUserProfile(itemData.author).then(res => {
            const freshName = res.data.name || itemData.author;
            const nameEl = container.querySelector("#detail-author-name");
            if (nameEl) nameEl.innerText = freshName;
            localStorage.setItem(authorCacheKey, JSON.stringify(res.data));
        }).catch(() => {});
    }

    // 🔄 P7后悔模式：异步加载退款按钮状态
    renderRefundButton(container, itemData, currentUser);

    // 🔄 云端购买状态兜底：本地无版本戳时，查询云端是否已购买
    if (!localVersionHash && !isFree && currentUser) {
        api.getPurchaseStatus(currentUser.account, itemData.id).then(res => {
            const btnUseItem = container.querySelector("#btn-use-item");
            if (!btnUseItem) return;
            if (res.owned) {
                btnUseItem.innerHTML = `✅ ${t('item.owned_reinstall')}`;
                Object.assign(btnUseItem.style, {
                    background: "#4CAF50",
                    color: "#fff",
                    border: "none"
                });
            }
            // 未购买时保持默认的「立即获取使用」按钮
        }).catch(err => {
            console.warn("云端购买状态查询失败，fallback到本地逻辑:", err);
        });
    }

    return container;
}