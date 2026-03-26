// 前端页面/core/侧边栏数据引擎.js (完整替换)
import { api } from "./网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { createCreatorCard } from "../market/创作者卡片组件.js";

// 设定本地缓存有效期为 2 小时 (防止反复刷新浪费算力和网络)
const CACHE_EXPIRE_TIME = 1000 * 60 * 60 * 2; 

export async function loadSidebarContent({ tab, sort, keyword, contentArea, currentUser, renderToken, getRenderToken }) {
    const cacheKey = `ComfyCommunity_ListCache_${tab}_${sort}`;
    const cachedDataStr = localStorage.getItem(cacheKey);

    const renderData = (dataArray) => {
        if (renderToken !== getRenderToken()) return; 
        
        let displayData = dataArray;
        if (keyword) {
            displayData = dataArray.filter(item => {
                const textStr = `${item.title||''} ${item.shortDesc||''} ${item.name||''} ${item.account||''}`.toLowerCase();
                return textStr.includes(keyword);
            });
        }

        contentArea.innerHTML = ""; 
        if (displayData.length === 0) {
            contentArea.innerHTML = `<div style='text-align:center; padding: 40px 20px; color:#888;'>${keyword ? '没有搜索到相关内容' : '暂无数据，快来抢沙发吧！'}</div>`;
            return;
        }
        if (tab === "tools" || tab === "apps" || tab === "recommends") {
            displayData.forEach(data => contentArea.appendChild(createItemCard(data, currentUser)));
        } else if (tab === "creators") {
            displayData.forEach(data => contentArea.appendChild(createCreatorCard(data, currentUser)));
        }
    };

    // 🟢 核心修改：极其严格的缓存优先策略
    if (cachedDataStr && !keyword) {
        try { 
            const cacheObj = JSON.parse(cachedDataStr);
            const isExpired = Date.now() - cacheObj.timestamp > CACHE_EXPIRE_TIME;
            
            // 如果缓存没过期，直接渲染并【终止执行】，坚决不发网络请求！
            if (!isExpired && cacheObj.data) {
                renderData(cacheObj.data);
                return; 
            }
        } catch (e) { 
            localStorage.removeItem(cacheKey); 
        }
    }

    contentArea.innerHTML = "<div style='text-align:center; padding: 40px 20px; color:#888;'>🌐 正在连接服务器拉取数据...</div>";

    try {
        let response, realData;
        if (tab === "tools" || tab === "apps" || tab === "recommends") {
            const itemType = tab === "tools" ? "tool" : (tab === "apps" ? "app" : "recommend");
            response = await api.getItems(itemType, sort, 100); 
            realData = response.data || [];
        } else if (tab === "creators") {
            response = await api.getCreators(sort, 100);
            realData = response.data || [];
        }

        // 🟢 将时间和数据一并存入缓存
        const freshCacheObj = { timestamp: Date.now(), data: realData };
        localStorage.setItem(cacheKey, JSON.stringify(freshCacheObj));
        
        renderData(realData); 
    } catch (error) {
        if (cachedDataStr) {
            try { renderData(JSON.parse(cachedDataStr).data); } catch(e){}
        } else {
            contentArea.innerHTML = `<div style='text-align:center; padding: 40px 20px; color:#F44336;'>❌ 数据加载失败: ${error.message}</div>`;
        }
    }
}