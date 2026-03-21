// 前端页面/侧边栏主程序.js
import { app } from "../../scripts/app.js";
import { createItemCard } from "./列表卡片组件.js";
import { createCreatorCard } from "./创作者卡片组件.js";
import { api } from "./网络请求API.js"; 
import { createPublishView } from "./发布内容组件.js";
import { createTopNav } from "./顶部导航组件.js";

const Store = {
    save(key, value) { localStorage.setItem(`ComfyCommunitySidebar_${key}`, value); },
    load(key, defaultValue) { return localStorage.getItem(`ComfyCommunitySidebar_${key}`) || defaultValue; }
};

function buildSidebarDOM() {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", height: "100%", width: "100%",
        backgroundColor: "var(--bg-color, #202020)", color: "var(--fg-color, #fff)", fontFamily: "sans-serif"
    });

    // 引入解耦后的顶部导航组件
    const topNav = createTopNav();

    const tabsContainer = document.createElement("div");
    Object.assign(tabsContainer.style, { display: "flex", borderBottom: "1px solid #444", padding: "10px 10px 0 10px" });
    const tabs = [{ id: "tools", label: "工具" }, { id: "apps", label: "应用" }, { id: "recommends", label: "推荐榜" }, { id: "creators", label: "创作者" }];

    const sortContainer = document.createElement("div");
    Object.assign(sortContainer.style, { padding: "10px", display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between" });
    sortContainer.innerHTML = `
        <div style="display: flex; gap: 10px; align-items: center;">
            <label style="font-size: 12px; color: #ccc;">排序:</label>
            <select id="hub-sort-select" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 4px;">
                <option value="time">最新发布</option>
                <option value="likes">点赞最多</option>
                <option value="favorites">收藏最多</option>
                <option value="downloads">下载使用量</option>
            </select>
        </div>
        <button id="btn-open-publish" style="background: #4CAF50; color: white; border: none; padding: 6px 15px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
            ➕ 发布新内容
        </button>
    `;

    const contentArea = document.createElement("div");
    Object.assign(contentArea.style, { flex: "1", overflowY: "auto", padding: "10px" });

    sortContainer.querySelector("#btn-open-publish").onclick = () => {
        const currentUser = topNav.getCurrentUser();
        if (!currentUser) return alert("⚠️ 请先登录您的社区账号后再进行发布！");
        
        tabsContainer.style.display = "none"; sortContainer.style.display = "none"; contentArea.style.display = "none";

        const publishView = createPublishView(currentUser, 
            () => { publishView.remove(); tabsContainer.style.display = "flex"; sortContainer.style.display = "flex"; contentArea.style.display = "block"; }, 
            () => { publishView.remove(); tabsContainer.style.display = "flex"; sortContainer.style.display = "flex"; contentArea.style.display = "block"; loadContent(currentTab, currentSort); }
        );
        container.appendChild(publishView);
    };

    let currentTab = Store.load("activeTab", "tools");
    let currentSort = Store.load("activeSort", "time");

    tabs.forEach(tab => {
        const btn = document.createElement("button");
        btn.innerText = tab.label;
        Object.assign(btn.style, {
            flex: "1", padding: "8px", cursor: "pointer", background: currentTab === tab.id ? "#444" : "transparent",
            color: currentTab === tab.id ? "#fff" : "#aaa", border: "none", borderBottom: currentTab === tab.id ? "2px solid #4CAF50" : "none"
        });
        btn.onclick = () => {
            currentTab = tab.id; Store.save("activeTab", currentTab);
            Array.from(tabsContainer.children).forEach(c => { c.style.background = "transparent"; c.style.color = "#aaa"; c.style.borderBottom = "none"; });
            btn.style.background = "#444"; btn.style.color = "#fff"; btn.style.borderBottom = "2px solid #4CAF50";
            loadContent(currentTab, currentSort);
        };
        tabsContainer.appendChild(btn);
    });

    const sortSelect = sortContainer.querySelector("#hub-sort-select");
    sortSelect.value = currentSort;
    sortSelect.onchange = (e) => { currentSort = e.target.value; Store.save("activeSort", currentSort); loadContent(currentTab, currentSort); };

    async function loadContent(tab, sort) {
        const cacheKey = `ComfyCommunity_ListCache_${tab}_${sort}`;
        const cachedDataStr = localStorage.getItem(cacheKey);
        let hasCache = false;

        const renderData = (dataArray) => {
            const currentUser = topNav.getCurrentUser();
            contentArea.innerHTML = ""; 
            if (dataArray.length === 0) {
                contentArea.innerHTML = `<div style='text-align:center; padding: 40px 20px; color:#888;'>${tab === 'creators' ? '暂无创作者数据' : '暂无数据，快来抢沙发吧！'}</div>`;
                return;
            }
            if (tab === "tools" || tab === "apps" || tab === "recommends") {
                dataArray.forEach(data => contentArea.appendChild(createItemCard(data, currentUser)));
            } else if (tab === "creators") {
                dataArray.forEach(data => contentArea.appendChild(createCreatorCard(data, currentUser)));
            }
        };

        if (cachedDataStr) {
            try {
                const cachedData = JSON.parse(cachedDataStr);
                renderData(cachedData);
                hasCache = true;
            } catch (e) { localStorage.removeItem(cacheKey); }
        }

        if (!hasCache) { contentArea.innerHTML = "<div style='text-align:center; padding: 40px 20px; color:#888;'>🌐 正在连接服务器拉取数据...</div>"; }

        try {
            let response, realData;
            if (tab === "tools" || tab === "apps" || tab === "recommends") {
                const itemType = tab === "tools" ? "tool" : (tab === "apps" ? "app" : "recommend");
                response = await api.getItems(itemType, sort, 20);
                realData = response.data || [];
            } else if (tab === "creators") {
                response = await api.getCreators(sort, 20);
                realData = response.data || [];
            }

            const freshDataStr = JSON.stringify(realData);
            if (freshDataStr !== cachedDataStr) {
                localStorage.setItem(cacheKey, freshDataStr);
                renderData(realData);
            }
        } catch (error) {
            if (!hasCache) { contentArea.innerHTML = `<div style='text-align:center; padding: 40px 20px; color:#F44336;'><div>⚠️ 数据加载失败</div><div style='font-size:12px; margin-top:10px; color:#aaa;'>${error.message}</div></div>`; }
        }
    }

    // 将各个模块组装入侧边栏主容器
    container.appendChild(topNav.dom); 
    container.appendChild(tabsContainer); 
    container.appendChild(sortContainer); 
    container.appendChild(contentArea);
    
    loadContent(currentTab, currentSort);
    return container;
}

let globalSidebarDOM = null;

app.registerExtension({
    name: "Comfy.CommunityLeaderboardSidebar",
    async setup(app) {
        if (!globalSidebarDOM) globalSidebarDOM = buildSidebarDOM();
        if (app.extensionManager && app.extensionManager.registerSidebarTab) {
            app.extensionManager.registerSidebarTab({
                id: "comfyui-ranking-sidebar", title: "社区精选", icon: "pi pi-trophy", type: "custom",
                render: (container) => { container.innerHTML = ''; container.appendChild(globalSidebarDOM); }
            });
        }
    }
});