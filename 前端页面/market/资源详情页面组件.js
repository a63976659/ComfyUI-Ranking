// 前端页面/market/资源详情页面组件.js
import { api } from "../core/网络请求API.js";

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

    let authorInfoHtml = `
        <div><strong>作者：</strong> <span id="detail-author-name">${authorName}</span></div>
        <div style="margin-top: 10px; color: #888;">感谢 砚影科技 的支持！</div>
    `;

    container.innerHTML = `
        <button id="btn-back-detail" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 15px; width: fit-content; transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#333'; this.style.borderColor='#555'">
    <span style="font-size: 14px;">⬅</span> 返回列表
</button>
        
        <div style="background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
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

    api.getUserProfile(itemData.author).then(res => {
        const freshName = res.data.name || itemData.author;
        const nameEl = container.querySelector("#detail-author-name");
        if (nameEl) nameEl.innerText = freshName;
        localStorage.setItem(authorCacheKey, JSON.stringify(res.data));
    }).catch(() => {});

    return container;
}