// 前端页面/侧边栏数据引擎.js
import { api } from "./网络请求API.js";
import { createItemCard } from "./列表卡片组件.js";
import { createCreatorCard } from "./创作者卡片组件.js";

export async function loadSidebarContent({ tab, sort, keyword, contentArea, currentUser, renderToken, getRenderToken }) {
    const cacheKey = `ComfyCommunity_ListCache_${tab}_${sort}`;
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasCache = false;

    const renderData = (dataArray) => {
        // 【防跳动拦截】: 如果网络返回时，用户已经切换了页面，则直接抛弃旧数据
        if (renderToken !== getRenderToken()) return; 
        
        // 执行本地过滤机制
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

    if (cachedDataStr) {
        try { renderData(JSON.parse(cachedDataStr)); hasCache = true; } catch (e) { localStorage.removeItem(cacheKey); }
    }

    if (!hasCache) { contentArea.innerHTML = "<div style='text-align:center; padding: 40px 20px; color:#888;'>🌐 正在连接服务器拉取数据...</div>"; }

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

        const freshDataStr = JSON.stringify(realData);
        if (freshDataStr !== cachedDataStr) {
            localStorage.setItem(cacheKey, freshDataStr); // 永远只缓存原始数据
            renderData(realData); // 渲染时再去筛选
        }
    } catch (error) {
        if (!hasCache && renderToken === getRenderToken()) { 
            contentArea.innerHTML = `<div style='text-align:center; padding: 40px 20px; color:#F44336;'><div>⚠️ 数据加载失败</div><div style='font-size:12px; margin-top:10px; color:#aaa;'>${error.message}</div></div>`; 
        }
    }
}