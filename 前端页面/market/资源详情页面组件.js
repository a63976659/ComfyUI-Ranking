// 前端页面/market/资源详情页面组件.js
// ==========================================
// 📦 资源详情页面组件
// ==========================================
// 作用：渲染工具/应用/推荐的详细信息页面
// 关联文件：
//   - 打赏等级工具.js (打赏榜单等级渲染)
//   - 资源安装引擎.js (安装/下载功能)
// ==========================================

import { api } from "../core/网络请求API.js";
import { openTipModal } from "../profile/个人中心_赞赏组件.js";
import { setupResourceInstall } from "./资源安装引擎.js";
import { renderTipBoardHTML } from "../components/打赏等级工具.js";

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
        <div style="margin-top: 10px; color: #888;">感谢 砚影科技 的支持！</div>
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
            <span style="font-size: 14px;">⬅</span> 返回
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

    return container;
}