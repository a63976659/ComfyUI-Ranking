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

import { api } from "../core/网络请求API.js";
import { openTipModal } from "../profile/个人中心_赞赏组件.js";
import { setupResourceInstall } from "./资源安装引擎.js";
import { renderTipBoardHTML } from "../components/打赏等级工具.js";
import { t } from "../components/用户体验增强.js";
import { removeCache } from "../components/性能优化工具.js";

// 🔄 P7后悔模式：渲染退款按钮
async function renderRefundButton(container, itemData, currentUser) {
    if (!currentUser) return;
    
    const refundArea = container.querySelector("#refund-area");
    if (!refundArea) return;
    
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
                            🔄 后悔模式：还剩 <strong>${hoursLeft.toFixed(1)}</strong> 小时可申请退款
                        </div>
                        <button id="btn-refund" style="background: #FF5722; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
                            💸 申请退款
                        </button>
                    </div>
                    <div style="font-size: 11px; color: #888; margin-top: 8px;">
                        ⚠️ 退款后权限将被收回，已下载的文件将被删除，且 <strong>30天内禁止再次购买</strong> 此商品
                    </div>
                </div>
            `;
            
            refundArea.querySelector("#btn-refund").onclick = () => showRefundConfirm(itemData, currentUser, statusRes.price_paid);
        } else {
            refundArea.innerHTML = `
                <div style="margin-top: 12px; padding: 10px; background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 6px; font-size: 12px; color: #4CAF50;">
                    ✅ 已购买此资源，退款窗口已过期
                </div>
            `;
        }
    } catch (e) {
        console.warn("获取购买状态失败:", e);
    }
}

// 🔄 P7后悔模式：退款确认弹窗
function showRefundConfirm(itemData, currentUser, pricePaid) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", top: "0", left: "0", right: "0", bottom: "0",
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: "10000"
    });
    
    overlay.innerHTML = `
        <div style="background: #1e2233; border-radius: 12px; padding: 25px; max-width: 420px; width: 90%; color: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #FF5722; display: flex; align-items: center; gap: 10px;">
                ⚠️ 确认退款
            </div>
            
            <div style="background: #2a2d3e; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="font-size: 14px; margin-bottom: 10px;">商品：<strong>${itemData.title || '未命名资源'}</strong></div>
                <div style="font-size: 14px; color: #4CAF50;">退款金额：<strong>${pricePaid}</strong> 积分</div>
            </div>
            
            <div style="background: rgba(255,87,34,0.1); border: 1px solid rgba(255,87,34,0.3); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <div style="font-size: 13px; color: #FF9800; line-height: 1.8;">
                    <div>🚨 <strong>退款后果：</strong></div>
                    <div style="margin-left: 20px; margin-top: 5px;">
                        • 您将失去此资源的访问权限<br>
                        • 已下载的文件将被自动删除<br>
                        • <strong style="color: #F44336;">30天内禁止再次购买此商品</strong>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="btn-cancel-refund" style="background: #555; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: 0.2s;" onmouseover="this.style.background='#666'" onmouseout="this.style.background='#555'">
                    取消
                </button>
                <button id="btn-confirm-refund" style="background: #FF5722; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#E64A19'" onmouseout="this.style.background='#FF5722'">
                    确认退款
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector("#btn-cancel-refund").onclick = () => overlay.remove();
    
    overlay.querySelector("#btn-confirm-refund").onclick = async () => {
        const confirmBtn = overlay.querySelector("#btn-confirm-refund");
        confirmBtn.disabled = true;
        confirmBtn.innerText = "处理中...";
        
        try {
            const res = await api.requestRefund(currentUser.account, itemData.id);
            if (res.status === "success") {
                // 🔄 P7后悔模式：清除本地缓存和文件
                burnLocalFiles(itemData.id);
                
                overlay.innerHTML = `
                    <div style="background: #1e2233; border-radius: 12px; padding: 25px; max-width: 380px; width: 90%; color: #fff; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #4CAF50;">退款成功</div>
                        <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">
                            ${res.refund_amount} 积分已退还到您的账户<br>
                            <span style="color: #FF9800;">${res.ban_days}天内禁止再次购买此商品</span>
                        </div>
                        <button id="btn-close-refund" style="background: #4CAF50; color: #fff; border: none; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 14px;">
                            知道了
                        </button>
                    </div>
                `;
                overlay.querySelector("#btn-close-refund").onclick = () => {
                    overlay.remove();
                    window.dispatchEvent(new CustomEvent("comfy-route-back"));
                };
            } else {
                alert("退款失败：" + (res.detail || "未知错误"));
                overlay.remove();
            }
        } catch (e) {
            alert("退款请求失败：" + (e.message || "网络错误"));
            overlay.remove();
        }
    };
    
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// 🔄 P7后悔模式：焚毁本地文件和缓存
function burnLocalFiles(itemId) {
    // 清除本地版本标记
    localStorage.removeItem(`ComfyCommunity_LocalVer_${itemId}`);
    
    // 清除购买缓存
    removeCache(`ItemOwnership_${itemId}`);
    
    // 清除列表缓存（强制下次刷新）
    removeCache('ItemsCache_all');
    removeCache('ItemsCache_tools');
    removeCache('ItemsCache_apps');
    removeCache('ItemsCache_recommended');
    
    console.log(`🔥 已焚毁资源 ${itemId} 的本地数据`);
}

export function createItemDetailView(itemData, currentUser) {
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
    const boardHtml = renderTipBoardHTML(boardData, 10, "该资源暂无专属打赏，快来成为首个赞赏人吧！", "normal");

    let authorInfoHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div><strong>作者：</strong> <span id="detail-author-name">${authorName}</span></div>
            <button id="btn-tip-item" style="background: #E91E63; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(233,30,99,0.3); transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">💰 赞赏鼓励该作品</button>
        </div>
        <div style="margin-top: 10px; color: #888;">感谢 硊影科技 的支持！</div>
            
        <!-- 🔄 P7后悔模式：退款区域 -->
        <div id="refund-area"></div>
            
        <div style="margin-top: 15px; border-top: 1px dashed #333; padding-top: 15px;">
            <div style="font-size: 13px; font-weight: bold; color: #E91E63; margin-bottom: 10px;">💖 该作品赞赏贡献榜 (TOP 10)</div>
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
        actionBtnHtml = `<button id="btn-use-item" style="flex: 1; padding: 12px; border-radius: 6px; border: none; background: #4CAF50; color: #fff; font-weight: bold; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.1s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">✅ 已拥有 (点击重新覆盖安装)</button>`;
    } else if (isUpdateAvailable) {
        actionBtnHtml = `<button id="btn-use-item" style="flex: 1; padding: 12px; border-radius: 6px; border: 1px solid #FF9800; background: rgba(255, 152, 0, 0.2); color: #FF9800; font-weight: bold; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);" onmouseover="this.style.background='#FF9800'; this.style.color='#fff'" onmouseout="this.style.background='rgba(255, 152, 0, 0.2)'; this.style.color='#FF9800'">♻️ 发现新版本 (点击静默热更新)</button>`;
    } else {
        actionBtnHtml = `<button id="btn-use-item" style="flex: 1; padding: 12px; border-radius: 6px; border: none; background: #2196F3; color: #fff; font-weight: bold; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.1s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">⬇️ 立即获取使用 <span style="font-size: 12px; font-weight: normal; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${isFree ? '完全免费' : itemData.price + ' 积分'}</span></button>`;
    }

    // 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移
    container.innerHTML = `
        <button id="btn-back-detail" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin-bottom: 15px; width: fit-content; transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
            <span style="font-size: 14px;">⬅</span> ${t('common.back')}
        </button>

        <div style="background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); margin-bottom: 15px;">
            <div style="font-size: 16px; font-weight: bold; color: #00bcd4; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                ⚙️ 内容详情与介绍
            </div>
            <div style="color: #ddd; line-height: 1.8; font-size: 13px; white-space: pre-wrap; word-wrap: break-word;">${itemData.fullDesc || itemData.shortDesc}</div>
        </div>

        <div style="background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
            <div style="font-size: 16px; font-weight: bold; color: #4CAF50; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                🎉 其它信息
            </div>
            <div style="color: #eee; line-height: 1.6; font-size: 14px;">
                ${authorInfoHtml}
            </div>
        </div>
    `;

    container.querySelector("#btn-back-detail").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
    
    // 🚀 绑定安装/更新按钮事件
    const btnUseItem = container.querySelector("#btn-use-item");
    const inlineStatusBox = container.querySelector("#inline-status-box");
    if (btnUseItem && inlineStatusBox) {
        setupResourceInstall(btnUseItem, itemData, currentUser, inlineStatusBox);
    }
    
    // 🚀 绑定作品打赏按钮事件
    container.querySelector("#btn-tip-item").onclick = () => {
        if (!currentUser) return alert("请先登录您的账号！");
        openTipModal(currentUser, { account: itemData.author }, (newBalance) => {
            currentUser.balance = newBalance;
            // 打赏成功后刷新局部或整体详情 (由框架重新渲染)
        }, itemData.id); 
    };

    api.getUserProfile(itemData.author).then(res => {
        const freshName = res.data.name || itemData.author;
        const nameEl = container.querySelector("#detail-author-name");
        if (nameEl) nameEl.innerText = freshName;
        localStorage.setItem(authorCacheKey, JSON.stringify(res.data));
    }).catch(() => {});

    // 🔄 P7后悔模式：异步加载退款按钮状态
    renderRefundButton(container, itemData, currentUser);

    return container;
}