// 前端页面/market/列表卡片组件.js
import { createCommentSection, setupToggleButton } from "../social/评论与互动组件.js";
import { api } from "../core/网络请求API.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { renderItemTrendChart } from "../components/图表渲染组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { setupResourceInstall } from "./资源安装引擎.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";

export function createItemCard(itemData, currentUser = null) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        backgroundColor: "var(--comfy-input-bg, #2b2b2b)", borderRadius: "8px", padding: "10px", 
        marginBottom: "12px", border: "1px solid #444", color: "#fff", fontFamily: "sans-serif"
    });

    const summaryView = document.createElement("div");
    summaryView.style.cursor = "pointer";
    
    summaryView.innerHTML = `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #4CAF50;">${itemData.title}</div>
        <div style="font-size: 12px; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px;">${itemData.shortDesc}</div>
        <div style="display: flex; gap: 10px; font-size: 11px; color: #888;">
            <span>👍 ${itemData.likes || 0}</span> <span>⭐ ${itemData.favorites || 0}</span> <span>💬 ${itemData.comments || 0}</span>
            <span style="margin-left: auto; background: #444; padding: 2px 6px; border-radius: 4px; color: #fff;">使用: ${itemData.uses || 0}</span>
        </div>
    `;

    const detailView = document.createElement("div");
    Object.assign(detailView.style, { display: "none", marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #555" });

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
        if (!currentUser) { showToast("⚠️ 请先登录您的社区账号！", "warning"); throw new Error("User not logged in"); }
        await api.toggleInteraction(itemData.id, currentUser.account, type, isActive);
    };

    setupToggleButton(btnLike, isLiked, itemData.likes || 0, "👍 已赞", "👍 点赞", "#FF5722", (isActive) => handleInteraction("like", isActive));
    setupToggleButton(btnFav, isFav, itemData.favorites || 0, "⭐ 已收藏", "⭐ 收藏", "#FFC107", (isActive) => handleInteraction("favorite", isActive));

    const inlineStatusBox = document.createElement("div");
    Object.assign(inlineStatusBox.style, { display: "none", margin: "0 0 15px 0", padding: "12px", background: "#222", border: "1px solid #444", borderRadius: "6px", fontSize: "12px", lineHeight: "1.5" });
    detailView.appendChild(inlineStatusBox);
    setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox);

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

    let isRendered = false;
    summaryView.onclick = () => {
        const isHidden = detailView.style.display === "none";
        detailView.style.display = isHidden ? "block" : "none";

        if (isHidden && !isRendered) {
            // 【核心修正】：传递完整的 itemData 以供图表模块提取 use_history
            renderItemTrendChart(detailView.querySelector(`#${chartContainerId}`), itemData);
            setupImageSandboxEvents(detailView);
            isRendered = true;
        }
    };

    const commentsContainer = document.createElement("div");
    commentsContainer.style.height = "250px"; 
    const commentUI = createCommentSection(itemData.id, itemData.commentsData || [], currentUser);
    commentsContainer.appendChild(commentUI);
    detailView.appendChild(commentsContainer);

    // =========================================================
    // 【核心新增】：如果是作者本人，追加授权管理控制台
    // =========================================================
    if (currentUser && currentUser.account === itemData.author) {
        const authorActionArea = document.createElement("div");
        Object.assign(authorActionArea.style, { display: "flex", gap: "10px", marginTop: "15px", paddingTop: "15px", borderTop: "1px dashed #555" });
        
        authorActionArea.innerHTML = `
            <div style="flex: 1; font-size: 12px; color: #FF9800; display: flex; align-items: center; font-weight: bold;">👑 创作者管理</div>
            <button id="btn-edit-item" style="padding: 6px 12px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">✏️ 修改内容</button>
            <button id="btn-del-item" style="padding: 6px 12px; background: #F44336; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🗑️ 永久删除</button>
        `;
        
        authorActionArea.querySelector("#btn-edit-item").onclick = (e) => {
            e.stopPropagation();
            // 派发事件，将当前内容数据传递给内联路由模块以打开修改界面
            window.dispatchEvent(new CustomEvent("comfy-route-edit-publish", { detail: { itemData, currentUser } }));
        };
        
        authorActionArea.querySelector("#btn-del-item").onclick = async (e) => {
            e.stopPropagation();
            if (await showConfirm("🚨 警告：确定要彻底删除该发布内容吗？<br><br><span style='color:#aaa;'>该操作不可逆，且相关的所有评论数据也将被同步永久清空。</span>")) {
                try {
                    await api.deleteItem(itemData.id, currentUser.account);
                    showToast("已成功删除", "success");
                    // 触发全局刷新以更新列表
                    window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload")); 
                } catch (err) {
                    showToast("删除失败: " + err.message, "error");
                }
            }
        };
        detailView.appendChild(authorActionArea);
    }

    card.appendChild(summaryView);
    card.appendChild(detailView);
    return card;
}