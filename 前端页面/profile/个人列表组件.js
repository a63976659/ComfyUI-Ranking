// 前端页面/profile/个人列表组件.js
import { api } from "../core/网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { getAcquiredItems, checkItemStatus } from "../market/资源安装引擎.js";
import { showToast } from "../components/UI交互提示组件.js";

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

    // 🚀 新增：已获取的资源列表
    if (tabId === "acquired") {
        const acquiredItems = getAcquiredItems();
        domElement.innerHTML = "";
        
        if (acquiredItems.length === 0) {
            domElement.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>
                <div style="font-size: 40px; margin-bottom: 10px;">📦</div>
                <div>还没有获取任何资源</div>
                <div style="font-size: 12px; color: #888; margin-top: 5px;">去榜单页面发现优秀工具吧！</div>
            </div>`;
            return;
        }
        
        // 并发获取云端最新版本信息
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 正在检查更新...</div>";
        
        try {
            const [toolsRes, appsRes] = await Promise.all([
                api.getItems("tool", "time", 200),
                api.getItems("app", "time", 200)
            ]);
            const allCloudItems = [...(toolsRes.data || []), ...(appsRes.data || [])];
            const cloudItemMap = {};
            allCloudItems.forEach(item => { cloudItemMap[item.id] = item; });
            
            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";
            
            acquiredItems.forEach(localItem => {
                const cloudItem = cloudItemMap[localItem.id];
                const status = checkItemStatus(localItem.id, cloudItem?.latest_version);
                
                const itemDiv = document.createElement("div");
                Object.assign(itemDiv.style, {
                    padding: "12px",
                    background: "#2a2a2a",
                    borderRadius: "8px",
                    border: "1px solid #444",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                });
                
                // 封面图
                const coverUrl = localItem.coverBase64 || "https://via.placeholder.com/60x40/333/888?text=No+Cover";
                
                // 状态标签
                let statusBadge = "";
                let statusColor = "#4CAF50";
                if (status.hasUpdate) {
                    statusBadge = `<span style="background: #FF9800; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">可更新</span>`;
                    statusColor = "#FF9800";
                } else {
                    statusBadge = `<span style="background: #4CAF50; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px;">已安装</span>`;
                }
                
                // 类型标签
                const typeLabel = (localItem.type === "tool" || localItem.type === "recommend_tool") ? "🔧 工具" : "📱 应用";
                
                itemDiv.innerHTML = `
                    <img src="${coverUrl}" style="width: 60px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #555;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: bold; color: #eee; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${localItem.title}</span>
                            ${statusBadge}
                        </div>
                        <div style="font-size: 11px; color: #888; display: flex; gap: 10px;">
                            <span>${typeLabel}</span>
                            <span>👤 ${localItem.author || '未知'}</span>
                        </div>
                    </div>
                    <button class="btn-action" style="padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; font-weight: bold; background: ${statusColor}; color: #fff; white-space: nowrap;">
                        ${status.hasUpdate ? '⬆️ 更新' : '✅ 已安装'}
                    </button>
                `;
                
                // 点击按钮时打开详情页
                itemDiv.querySelector(".btn-action").onclick = () => {
                    if (cloudItem) {
                        window.dispatchEvent(new CustomEvent("comfy-open-detail", {
                            detail: { itemData: cloudItem, currentUser }
                        }));
                    } else {
                        showToast("该资源已下架或不可用", "warning");
                    }
                };
                
                // 点击卡片打开详情
                itemDiv.style.cursor = "pointer";
                itemDiv.onclick = (e) => {
                    if (e.target.classList.contains("btn-action")) return;
                    if (cloudItem) {
                        window.dispatchEvent(new CustomEvent("comfy-open-detail", {
                            detail: { itemData: cloudItem, currentUser }
                        }));
                    }
                };
                
                listDiv.appendChild(itemDiv);
            });
            
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
            
        } catch (e) {
            // 如果网络失败，仍然显示本地记录
            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";
            
            acquiredItems.forEach(localItem => {
                const itemDiv = document.createElement("div");
                Object.assign(itemDiv.style, {
                    padding: "12px",
                    background: "#2a2a2a",
                    borderRadius: "8px",
                    border: "1px solid #444",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                });
                
                const coverUrl = localItem.coverBase64 || "https://via.placeholder.com/60x40/333/888?text=No+Cover";
                const typeLabel = (localItem.type === "tool" || localItem.type === "recommend_tool") ? "🔧 工具" : "📱 应用";
                
                itemDiv.innerHTML = `
                    <img src="${coverUrl}" style="width: 60px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #555;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: bold; color: #eee; margin-bottom: 4px;">${localItem.title}</div>
                        <div style="font-size: 11px; color: #888; display: flex; gap: 10px;">
                            <span>${typeLabel}</span>
                            <span>👤 ${localItem.author || '未知'}</span>
                        </div>
                    </div>
                    <span style="background: #666; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px;">已安装</span>
                `;
                
                listDiv.appendChild(itemDiv);
            });
            
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
        }
        return;
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