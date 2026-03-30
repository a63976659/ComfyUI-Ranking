// 前端页面/market/列表卡片组件.js
import { createCommentSection, setupToggleButton } from "../social/评论与互动组件.js";
import { api } from "../core/网络请求API.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { renderItemTrendChart } from "../components/图表渲染组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { setupResourceInstall, checkItemStatus } from "./资源安装引擎.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { openTipModal } from "../profile/个人中心_赞赏组件.js";
import { renderTipBoardHTML, isMaxTipLevel } from "../components/打赏等级工具.js";
import { t } from "../components/用户体验增强.js";

export function createItemCard(itemData, currentUser = null) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        backgroundColor: "var(--comfy-input-bg, #2b2b2b)", borderRadius: "8px", padding: "10px", 
        marginBottom: "12px", border: "1px solid #444", color: "#fff", fontFamily: "sans-serif"
    });

    // 🚀 核心新增：初始渲染时，动态计算真实的有效评论数（过滤软删除的废弃数据）
    const calcActiveComments = (data) => {
        if (!data) return 0;
        return data.reduce((acc, c) => {
            const parentCnt = c.isDeleted ? 0 : 1;
            const repliesCnt = (c.replies || []).filter(r => !r.isDeleted).length;
            return acc + parentCnt + repliesCnt;
        }, 0);
    };
    const initialCommentCount = itemData.commentsData ? calcActiveComments(itemData.commentsData) : (itemData.comments || 0);

    const summaryView = document.createElement("div");
    summaryView.style.cursor = "pointer";
    
    // 🚀 核心修改：为评论计数的 span 加上专属的 class，并填入过滤后的真实数量
    summaryView.innerHTML = `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #4CAF50;">${itemData.title}</div>
        <div style="font-size: 12px; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px;">${itemData.shortDesc}</div>
        <div style="display: flex; gap: 10px; font-size: 11px; color: #888;">
            <span>👍 ${itemData.likes || 0}</span> <span>⭐ ${itemData.favorites || 0}</span> <span class="card-comment-count">💬 ${initialCommentCount}</span>
            <span style="margin-left: auto; background: #444; padding: 2px 6px; border-radius: 4px; color: #fff;">${t('market.uses')}: ${itemData.uses || 0}</span>
        </div>
    `;

    const detailView = document.createElement("div");
    Object.assign(detailView.style, { display: "none", marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #555" });

    const authorInfo = document.createElement("div");
    Object.assign(authorInfo.style, { fontSize: "12px", color: "#ccc", marginBottom: "10px" });
    
    // 🔄 P7后悔模式：检查是否有待生效价格
    let priceHtml = '';
    if (itemData.pending_price !== null && itemData.pending_price !== undefined && itemData.pending_price_effective_at) {
        const effectiveTime = new Date(itemData.pending_price_effective_at);
        const now = new Date();
        if (effectiveTime > now) {
            const hoursLeft = Math.ceil((effectiveTime - now) / (1000 * 60 * 60));
            priceHtml = `
                <span style="float: right;">
                    <span style="color: #FF9800;">💰 ${itemData.price > 0 ? itemData.price + ` ${t('market.points')}` : t('market.free')}</span>
                    <span style="margin-left: 5px; font-size: 10px; color: #F44336; background: rgba(244,67,54,0.15); padding: 1px 4px; border-radius: 3px;" title="${hoursLeft}${t('time.hours_later')}">
                        → ${itemData.pending_price}${t('market.points')}
                    </span>
                </span>
            `;
        } else {
            priceHtml = `<span style="float: right; color: #FF9800;">💰 ${itemData.pending_price > 0 ? itemData.pending_price + ` ${t('market.points')}` : t('market.free')}</span>`;
        }
    } else {
        priceHtml = `<span style="float: right; color: #FF9800;">💰 ${itemData.price > 0 ? itemData.price + ` ${t('market.points')}` : t('market.free')}</span>`;
    }
    
    authorInfo.innerHTML = `${t('market.author')}: <span class="author-name-link" style="color: #2196F3; cursor: pointer; text-decoration: underline;">${t('common.loading')}...</span> ${priceHtml}`;
    detailView.appendChild(authorInfo);

    const nameDOM = authorInfo.querySelector('.author-name-link');
    const authorCacheKey = `ComfyCommunity_ProfileCache_${itemData.author}`;
    const cachedAuthorStr = localStorage.getItem(authorCacheKey);
    
    if (cachedAuthorStr) { try { nameDOM.innerText = JSON.parse(cachedAuthorStr).name || itemData.author; } catch(e) {} }
    nameDOM.onclick = (e) => { e.stopPropagation(); openOtherUserProfileModal(itemData.author, currentUser); };

    api.getUserProfile(itemData.author).then(res => {
        const freshName = res.data.name || itemData.author;
        if (nameDOM.innerText !== freshName) { nameDOM.innerText = freshName; }
        localStorage.setItem(authorCacheKey, JSON.stringify(res.data));
    }).catch(() => { if (!cachedAuthorStr) { nameDOM.innerText = itemData.author; } });

    const actionArea = document.createElement("div");
    Object.assign(actionArea.style, { display: "flex", gap: "8px", marginBottom: "12px" });
    const btnLike = document.createElement("button");
    Object.assign(btnLike.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    const btnFav = document.createElement("button");
    Object.assign(btnFav.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    
    // 🚀 根据安装状态显示不同的按钮样式
    const btnUse = document.createElement("button");
    const installStatus = checkItemStatus(itemData.id, itemData.latest_version);
    
    if (installStatus.hasUpdate) {
        // 有更新可用
        Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#FF9800", border: "none", borderRadius: "4px", cursor: "pointer", color: "white", fontWeight: "bold" });
        btnUse.innerHTML = `♻️ ${t('market.update_available')}`;
    } else if (installStatus.installed) {
        // 已安装
        Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#4CAF50", border: "none", borderRadius: "4px", cursor: "pointer", color: "white", fontWeight: "bold" });
        btnUse.innerHTML = `✅ ${t('market.installed')}`;
    } else {
        // 未安装
        Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#2196F3", border: "none", borderRadius: "4px", cursor: "pointer", color: "white", fontWeight: "bold" });
        btnUse.innerHTML = `🚀 ${t('market.get_now')} ${itemData.uses ? '(' + itemData.uses + ')' : ''}`;
    }

    actionArea.appendChild(btnLike); actionArea.appendChild(btnFav); actionArea.appendChild(btnUse);
    detailView.appendChild(actionArea);

    const isLiked = currentUser && Array.isArray(itemData.liked_by) && itemData.liked_by.includes(currentUser.account);
    const isFav = currentUser && Array.isArray(itemData.favorited_by) && itemData.favorited_by.includes(currentUser.account);

    const handleInteraction = async (type, isActive) => {
        if (!currentUser) { showToast(`⚠️ ${t('feedback.login_required')}`, "warning"); throw new Error("User not logged in"); }
        await api.toggleInteraction(itemData.id, currentUser.account, type, isActive);
    };

    setupToggleButton(btnLike, isLiked, itemData.likes || 0, `👍 ${t('market.liked')}`, `👍 ${t('market.like')}`, "#FF5722", (isActive) => handleInteraction("like", isActive));
    setupToggleButton(btnFav, isFav, itemData.favorites || 0, `⭐ ${t('market.favorited')}`, `⭐ ${t('market.favorite')}`, "#FFC107", (isActive) => handleInteraction("favorite", isActive));

    const inlineStatusBox = document.createElement("div");
    Object.assign(inlineStatusBox.style, { display: "none", margin: "0 0 15px 0", padding: "12px", background: "#222", border: "1px solid #444", borderRadius: "6px", fontSize: "12px", lineHeight: "1.5" });
    detailView.appendChild(inlineStatusBox);
    setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox);

    const mediaArea = document.createElement("div");
    const chartContainerId = `chart-${Math.random().toString(36).substr(2, 9)}`;
    const chartHtml = `<div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📈 ${t('market.usage_trend')}</div><div id="${chartContainerId}" style="width: 100%; height: 160px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; margin-bottom: 12px;"></div>`;
    
    mediaArea.innerHTML = `
        ${chartHtml}
        ${getCoverSandboxHTML(itemData.imageUrls?.length > 0 ? itemData.imageUrls : itemData.coverUrl)}
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📝 ${t('market.full_description')}</div>
        <div style="background: #1e1e1e; padding: 10px; border-radius: 4px; font-size: 12px; color: #bbb; margin-bottom: 12px; max-height: 200px; overflow-y: auto; line-height: 1.6; border: 1px solid #333; word-wrap: break-word; white-space: pre-wrap;">${itemData.fullDesc}</div>
    `;
    detailView.appendChild(mediaArea);

    // 🚀 新增：赞赏贡献榜单与打赏按钮（带等级显示）
    const tipArea = document.createElement("div");
    Object.assign(tipArea.style, { marginBottom: "12px", padding: "12px", background: "#1e1e1e", border: "1px solid #333", borderRadius: "6px" });
    
    // 使用统一的打赏榜单渲染工具（带星星/月亮/太阳等级）
    const boardData = itemData.tip_board || [];
    const boardHtml = renderTipBoardHTML(boardData, 5, t('market.no_tips_yet'), "small");
    
    tipArea.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:bold; color:#E91E63;">💖 ${t('market.tip_board')} (TOP 5)</div>
            <button id="btn-tip-item-${itemData.id}" style="background:#E91E63; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">💰 ${t('market.tip')}</button>
        </div>
        ${boardHtml}
    `;
    detailView.appendChild(tipArea);
    
    // 🚀 绑定打赏按钮事件
    tipArea.querySelector(`#btn-tip-item-${itemData.id}`).onclick = (e) => {
        e.stopPropagation();
        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
        openTipModal(currentUser, { account: itemData.author }, (newBalance) => {
            currentUser.balance = newBalance;
        }, itemData.id);
    };

    let isRendered = false;
    summaryView.onclick = () => {
        const isHidden = detailView.style.display === "none";
        detailView.style.display = isHidden ? "block" : "none";

        if (isHidden && !isRendered) {
            renderItemTrendChart(detailView.querySelector(`#${chartContainerId}`), itemData);
            setupImageSandboxEvents(detailView);
            isRendered = true;
        }
    };

    const commentsContainer = document.createElement("div");
    commentsContainer.style.height = "250px"; 
    
    // 🚀 核心修改：传入一个回调函数，当组件内部发送/删除留言时，外部的数字能实时响应刷新！
    const commentUI = createCommentSection(itemData.id, itemData.commentsData || [], currentUser, (newCount) => {
        const badge = summaryView.querySelector(".card-comment-count");
        if (badge) badge.innerText = `💬 ${newCount}`;
    });
    
    commentsContainer.appendChild(commentUI);
    detailView.appendChild(commentsContainer);

    if (currentUser && currentUser.account === itemData.author) {
        const authorActionArea = document.createElement("div");
        Object.assign(authorActionArea.style, { display: "flex", gap: "10px", marginTop: "15px", paddingTop: "15px", borderTop: "1px dashed #555" });
        
        authorActionArea.innerHTML = `
            <div style="flex: 1; font-size: 12px; color: #FF9800; display: flex; align-items: center; font-weight: bold;">👑 ${t('market.creator_manage')}</div>
            <button id="btn-edit-item" style="padding: 6px 12px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">✏️ ${t('market.edit_content')}</button>
            <button id="btn-del-item" style="padding: 6px 12px; background: #F44336; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🗑️ ${t('market.delete_permanently')}</button>
        `;
        
        authorActionArea.querySelector("#btn-edit-item").onclick = (e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("comfy-route-edit-publish", { detail: { itemData, currentUser } }));
        };
        
        authorActionArea.querySelector("#btn-del-item").onclick = async (e) => {
            e.stopPropagation();
            if (await showConfirm(t('market.delete_confirm'))) {
                try {
                    await api.deleteItem(itemData.id, currentUser.account);
                    showToast(t('feedback.deleted'), "success");
                    window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload")); 
                } catch (err) {
                    showToast(`${t('feedback.delete_failed')}: ${err.message}`, "error");
                }
            }
        };
        detailView.appendChild(authorActionArea);
    }

    card.appendChild(summaryView);
    card.appendChild(detailView);
    return card;
}