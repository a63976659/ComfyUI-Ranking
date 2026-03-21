// 前端页面/个人列表组件.js
import { api } from "./网络请求API.js";
import { createItemCard } from "./列表卡片组件.js";

export async function renderProfileListContent(tabId, domElement, userData, currentUser, openOtherUserModalCb) {
    if (tabId === "following") {
        const followingList = userData.following || [];
        domElement.innerHTML = "";
        if (followingList.length === 0) {
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>暂无关注的人</div>`; return;
        }
        const listDiv = document.createElement("div");
        listDiv.style.display = "flex"; listDiv.style.flexDirection = "column"; listDiv.style.gap = "8px";
        
        followingList.forEach(acc => {
            const item = document.createElement("div");
            Object.assign(item.style, { padding: "10px", background: "#2a2a2a", borderRadius: "6px", border: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center" });
            
            // 先渲染骨架占位
            item.innerHTML = `<span class="follow-name" style="color: #4CAF50; font-weight: bold; cursor: pointer;">@${acc}</span><button class="btn-view-user" data-acc="${acc}" style="padding: 4px 10px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">主页</button>`;
            
            // 【核心修复】：底层静默发起请求获取用户真实名称并替换
            const nameLabel = item.querySelector('.follow-name');
            api.getUserProfile(acc).then(res => {
                if (res.data && res.data.name) {
                    nameLabel.innerText = `@${res.data.name}`;
                }
            }).catch(e => { /* 失败则保持 ID 显示，不抛出异常干扰 */ });

            item.querySelector('.btn-view-user').onclick = () => openOtherUserModalCb(acc, currentUser);
            item.querySelector('span').onclick = () => openOtherUserModalCb(acc, currentUser);
            listDiv.appendChild(item);
        });
        domElement.appendChild(listDiv); return;
    }

    const cacheKey = `ProfileList_${userData.account}_${tabId}`;
    const cachedStr = localStorage.getItem(cacheKey);
    
    const applyDOM = (items) => {
        domElement.innerHTML = ""; 
        if (items.length === 0) { domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>暂无记录</div>`; return; }
        items.forEach(item => { domElement.appendChild(createItemCard(item, currentUser)); });
    };

    if (cachedStr) {
        try { applyDOM(JSON.parse(cachedStr)); } catch(e) { localStorage.removeItem(cacheKey); }
    } else {
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 正在拉取数据...</div>"; 
    }

    try {
        const [toolsRes, appsRes] = await Promise.all([ api.getItems("tool", "time", 100), api.getItems("app", "time", 100) ]);
        const allItems = [...(toolsRes.data || []), ...(appsRes.data || [])];
        let filteredItems = [];

        if (tabId === "published") filteredItems = allItems.filter(item => item.author === userData.account);
        else if (tabId === "liked") filteredItems = allItems.filter(item => item.liked_by && item.liked_by.includes(userData.account));

        const freshStr = JSON.stringify(filteredItems);
        if (freshStr !== cachedStr) {
            localStorage.setItem(cacheKey, freshStr);
            applyDOM(filteredItems);
        }
    } catch (error) { 
        if (!cachedStr) domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#F44336;'>数据加载失败</div>"; 
    }
}