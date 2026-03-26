// 前端页面/profile/个人列表组件.js
import { api } from "../core/网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";

export async function renderProfileListContent(tabId, domElement, userData, currentUser, openOtherUserModalCb) {
    const isMe = currentUser && currentUser.account === userData.account;
    const privacy = userData.privacy || {};

    // 【修复】：从底层杜绝隐私被穿透抓取
    if (!isMe) {
        if ((tabId === "following" && privacy.follows) || (tabId === "liked" && privacy.likes)) {
            domElement.innerHTML = `<div style='text-align:center; padding: 30px; color:#888;'>🔒 由于作者的隐私设置，该列表不对外公开</div>`;
            return;
        }
    }

    if (tabId === "following") {
        const followingList = userData.following || [];
        domElement.innerHTML = "";
        if (followingList.length === 0) {
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>暂无关注的人</div>`; return;
        }
        
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 正在加载用户数据...</div>"; 

        try {
            // 【修复】：并发获取所有关注者的最新资料，彻底解决闪烁和 ID 显示问题
            const followingDetails = await Promise.all(
                followingList.map(acc => api.getUserProfile(acc).then(res => res.data).catch(() => ({ account: acc, name: acc })))
            );

            const listDiv = document.createElement("div");
            listDiv.style.display = "flex"; listDiv.style.flexDirection = "column"; listDiv.style.gap = "8px";
            
            followingDetails.forEach(user => {
                const item = document.createElement("div");
                Object.assign(item.style, { padding: "10px", background: "#2a2a2a", borderRadius: "6px", border: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center" });
                
                // 直接使用 user.name 渲染
                item.innerHTML = `<span class="follow-name" style="color: #4CAF50; font-weight: bold; cursor: pointer;">@${user.name || user.account}</span><button class="btn-view-user" data-acc="${user.account}" style="padding: 4px 10px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">主页</button>`;
                
                item.querySelector('.btn-view-user').onclick = () => openOtherUserModalCb(user.account, currentUser);
                item.querySelector('span').onclick = () => openOtherUserModalCb(user.account, currentUser);
                listDiv.appendChild(item);
            });
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
        } catch (e) {
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#F44336;'>数据加载失败</div>`;
        }
        return;
    }

    const cacheKey = `ProfileList_${userData.account}_${tabId}`;
    const cachedStr = localStorage.getItem(cacheKey);
    
    const applyDOM = (items) => {
        domElement.innerHTML = ""; 
        if (items.length === 0) { domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>暂无记录</div>`; return; }
        
        // 🚀 性能黑科技 1：创建内存级的文档碎片购物车
        const fragment = document.createDocumentFragment();
        
        items.forEach(item => { 
            const card = createItemCard(item, currentUser);
            // 🚀 性能黑科技 2：启用原生 CSS 虚拟列表，不在可视区域不渲染！
            card.style.contentVisibility = "auto";
            card.style.containIntrinsicSize = "120px"; // 告诉浏览器卡片大概有多高，防止滚动条乱跳
            
            fragment.appendChild(card); // 先装进购物车，不触发页面渲染
        });
        
        // 最后只需一次性挂载，彻底告别点击卡顿！
        domElement.appendChild(fragment);
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