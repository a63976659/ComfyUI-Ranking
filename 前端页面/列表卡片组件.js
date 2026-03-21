// 前端页面/列表卡片组件.js
import { createCommentSection, setupToggleButton } from "./评论与互动组件.js";
import { api } from "./网络请求API.js";
import { openOtherUserProfileModal } from "./个人中心视图.js";
import { renderItemTrendChart } from "./图表渲染组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "./图片沙盒组件.js";
import { setupResourceInstall } from "./资源安装引擎.js";

export function createItemCard(itemData, currentUser = null) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        backgroundColor: "var(--comfy-input-bg, #2b2b2b)", borderRadius: "8px", padding: "10px", 
        marginBottom: "12px", border: "1px solid #444", color: "#fff", fontFamily: "sans-serif"
    });

    // --- 1. 摘要信息层 ---
    const summaryView = document.createElement("div");
    summaryView.style.cursor = "pointer";
    
    // 【核心修复】：撤销超链接样式，还原为标准标题
    summaryView.innerHTML = `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #4CAF50;">${itemData.title}</div>
        <div style="font-size: 12px; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px;">${itemData.shortDesc}</div>
        <div style="display: flex; gap: 10px; font-size: 11px; color: #888;">
            <span>👍 ${itemData.likes || 0}</span> <span>⭐ ${itemData.favorites || 0}</span> <span>💬 ${itemData.comments || 0}</span>
            <span style="margin-left: auto; background: #444; padding: 2px 6px; border-radius: 4px; color: #fff;">使用: ${itemData.uses || 0}</span>
        </div>
    `;

    // --- 2. 详细信息层 (默认隐藏) ---
    const detailView = document.createElement("div");
    Object.assign(detailView.style, { display: "none", marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #555" });

    // 作者信息与点击跳转
    const authorInfo = document.createElement("div");
    Object.assign(authorInfo.style, { fontSize: "12px", color: "#ccc", marginBottom: "10px" });
    authorInfo.innerHTML = `发布者: <span class="author-name-link" style="color: #2196F3; cursor: pointer; text-decoration: underline;">加载中...</span> <span style="float: right; color: #FF9800;">💰 ${itemData.price > 0 ? itemData.price + ' 积分' : '免费'}</span>`;
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

    // 交互操作区
    const actionArea = document.createElement("div");
    Object.assign(actionArea.style, { display: "flex", gap: "8px", marginBottom: "12px" });
    const btnLike = document.createElement("button");
    Object.assign(btnLike.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    const btnFav = document.createElement("button");
    Object.assign(btnFav.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    const btnUse = document.createElement("button");
    Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#2196F3", border: "none", borderRadius: "4px", cursor: "pointer", color: "white", fontWeight: "bold" });
    btnUse.innerHTML = `🚀 立即获取 ${itemData.uses ? '(' + itemData.uses + ')' : ''}`;

    actionArea.appendChild(btnLike); actionArea.appendChild(btnFav); actionArea.appendChild(btnUse);
    detailView.appendChild(actionArea);

    const isLiked = currentUser && Array.isArray(itemData.liked_by) && itemData.liked_by.includes(currentUser.account);
    const isFav = currentUser && Array.isArray(itemData.favorited_by) && itemData.favorited_by.includes(currentUser.account);

    const handleInteraction = async (type, isActive) => {
        if (!currentUser) { alert("⚠️ 请先登录您的社区账号！"); throw new Error("User not logged in"); }
        await api.toggleInteraction(itemData.id, currentUser.account, type, isActive);
    };

    setupToggleButton(btnLike, isLiked, itemData.likes || 0, "👍 已赞", "👍 点赞", "#FF5722", (isActive) => handleInteraction("like", isActive));
    setupToggleButton(btnFav, isFav, itemData.favorites || 0, "⭐ 已收藏", "⭐ 收藏", "#FFC107", (isActive) => handleInteraction("favorite", isActive));

    // 内联状态弹框与底层安装逻辑剥离注入
    const inlineStatusBox = document.createElement("div");
    Object.assign(inlineStatusBox.style, { display: "none", margin: "0 0 15px 0", padding: "12px", background: "#222", border: "1px solid #444", borderRadius: "6px", fontSize: "12px", lineHeight: "1.5" });
    detailView.appendChild(inlineStatusBox);
    setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox);

    // 媒体区拼装
    const mediaArea = document.createElement("div");
    const chartContainerId = `chart-${Math.random().toString(36).substr(2, 9)}`;
    const chartHtml = `<div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📈 使用量增长曲线</div><div id="${chartContainerId}" style="width: 100%; height: 160px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; margin-bottom: 12px;"></div>`;
    
    mediaArea.innerHTML = `
        ${chartHtml}
        ${getCoverSandboxHTML(itemData.coverUrl)}
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📝 详细说明</div>
        <div style="background: #1e1e1e; padding: 10px; border-radius: 4px; font-size: 12px; color: #bbb; margin-bottom: 12px; max-height: 200px; overflow-y: auto; line-height: 1.6; border: 1px solid #333; word-wrap: break-word; white-space: pre-wrap;">${itemData.fullDesc}</div>
    `;
    detailView.appendChild(mediaArea);

    // --- 3. 展开与动态渲染逻辑 ---
    let isRendered = false;
    summaryView.onclick = () => {
        const isHidden = detailView.style.display === "none";
        detailView.style.display = isHidden ? "block" : "none";

        if (isHidden && !isRendered) {
            renderItemTrendChart(detailView.querySelector(`#${chartContainerId}`), itemData.uses);
            setupImageSandboxEvents(detailView);
            isRendered = true;
        }
    };

    // --- 4. 评论区注入 ---
    const commentsContainer = document.createElement("div");
    commentsContainer.style.height = "250px"; 
    const commentUI = createCommentSection(itemData.id, itemData.commentsData || [], currentUser);
    commentsContainer.appendChild(commentUI);
    detailView.appendChild(commentsContainer);

    card.appendChild(summaryView);
    card.appendChild(detailView);
    return card;
}