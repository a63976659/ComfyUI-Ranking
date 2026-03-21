// 前端页面/资源详情页面组件.js
import { api } from "./网络请求API.js";

export function createItemDetailView(itemData, currentUser) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", 
        fontSize: "14px", padding: "15px", overflowY: "auto", flex: "1",
        backgroundColor: "#13151c" // 契合暗色背景
    });

    // 尝试从本地缓存拉取最新的作者名称
    const authorCacheKey = `ComfyCommunity_ProfileCache_${itemData.author}`;
    const cachedAuthorStr = localStorage.getItem(authorCacheKey);
    let authorName = itemData.author;
    if (cachedAuthorStr) { try { authorName = JSON.parse(cachedAuthorStr).name || itemData.author; } catch(e) {} }

    // 专属资料展示区构建
    let authorInfoHtml = '';
    if (itemData.author === 'a63976659') {
        authorInfoHtml = `
            <div><strong>作者：</strong> <span id="detail-author-name">${authorName}</span></div>
            <div style="margin-top: 8px;"><strong>小红书：</strong> 猪的飞行梦</div>
            <div style="margin-top: 8px;"><strong>QQ 交流群：</strong> 202018000</div>
            <div style="margin-top: 14px; color: #bbb;"><strong>获取最新教程与动态：</strong></div>
            <div style="margin-top: 8px;">
                <a href="https://space.bilibili.com/2114638644" target="_blank" style="text-decoration: none;">
                    <img src="https://img.shields.io/badge/bilibili-猪的飞行梦-00A1D6?logo=bilibili&logoColor=white" alt="Bilibili" style="border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                </a>
            </div>
        `;
    } else {
        authorInfoHtml = `
            <div><strong>作者：</strong> <span id="detail-author-name">${authorName}</span></div>
            <div style="margin-top: 10px; color: #888;">该作者暂未留下更多交流信息...</div>
        `;
    }

    // 【核心修改】：彻底移除了顶部的返回按钮
    container.innerHTML = `
        <div style="background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
            <div style="font-size: 16px; font-weight: bold; color: #00bcd4; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                ⚙️ 工具介绍与优势
            </div>
            <div style="color: #ddd; line-height: 1.8; font-size: 13px; white-space: pre-wrap; word-wrap: break-word;">${itemData.fullDesc || itemData.shortDesc}</div>
        </div>

        <div style="background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
            <div style="font-size: 16px; font-weight: bold; color: #4CAF50; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                👤 作者与交流
            </div>
            <div style="color: #eee; line-height: 1.6; font-size: 14px;">
                ${authorInfoHtml}
            </div>
        </div>
    `;

    // 静默更新作者名以防他改了名
    api.getUserProfile(itemData.author).then(res => {
        const freshName = res.data.name || itemData.author;
        const nameEl = container.querySelector("#detail-author-name");
        if (nameEl) nameEl.innerText = freshName;
        localStorage.setItem(authorCacheKey, JSON.stringify(res.data));
    }).catch(() => {});

    return container;
}