// 前端页面/侧边栏主程序.js
import { app } from "../../scripts/app.js";
import { createPublishView } from "./发布内容组件.js";
import { createTopNav } from "./顶部导航组件.js";
import { loadSidebarContent } from "./侧边栏数据引擎.js";
import { createItemDetailView } from "./资源详情页面组件.js";

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

    const topNav = createTopNav();

    const tabsContainer = document.createElement("div");
    Object.assign(tabsContainer.style, { display: "flex", borderBottom: "1px solid #444", padding: "10px 10px 0 10px" });
    const tabs = [{ id: "tools", label: "工具" }, { id: "apps", label: "应用" }, { id: "recommends", label: "推荐榜" }, { id: "creators", label: "创作者" }];

    const sortContainer = document.createElement("div");
    Object.assign(sortContainer.style, { padding: "10px", display: "flex", gap: "8px", alignItems: "center", width: "100%", boxSizing: "border-box" });
    sortContainer.innerHTML = `
        <select id="hub-sort-select" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 90px; flex-shrink: 0;">
            <option value="time">最新发布</option>
            <option value="likes">点赞最多</option>
            <option value="favorites">收藏最多</option>
            <option value="downloads">下载使用量</option>
        </select>
        <input type="text" id="hub-search-input" placeholder="🔍 搜索名称 / 简介..." style="flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid #555; background: #222; color: white; outline: none;">
        <button id="btn-open-publish" style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">➕ 发布</button>
    `;

    const contentBoxWrapper = document.createElement("div");
    Object.assign(contentBoxWrapper.style, { flex: "1", padding: "0 10px 10px 10px", display: "flex", flexDirection: "column" });

    const contentArea = document.createElement("div");
    Object.assign(contentArea.style, {
        flex: "none", height: "1122px", overflowY: "auto", padding: "10px",
        backgroundColor: "#1c1c1c", border: "1px solid #444", borderRadius: "8px",
        boxShadow: "inset 0 4px 10px rgba(0,0,0,0.3)"
    });
    contentBoxWrapper.appendChild(contentArea);

    let activeDetailView = null; // 用于记录当前是否打开了关于页面

    // 【核心调度枢纽】：监听大标题派发的点击事件
    window.addEventListener("comfy-open-detail", (e) => {
        const { itemData, currentUser } = e.detail;
        
        // 【核心修复】：如果已经打开了，则销毁它并恢复列表框（Toggle 开关效果）
        if (activeDetailView) {
            activeDetailView.remove();
            activeDetailView = null;
            tabsContainer.style.display = "flex"; 
            sortContainer.style.display = "flex"; 
            contentBoxWrapper.style.display = "flex";
            return; // 结束执行
        }
        
        // 瞬间隐藏旧的工作区
        tabsContainer.style.display = "none"; 
        sortContainer.style.display = "none"; 
        contentBoxWrapper.style.display = "none";
        
        // 渲染并挂载详情页
        activeDetailView = createItemDetailView(itemData, currentUser);
        container.appendChild(activeDetailView);
    });

    let currentTab = Store.load("activeTab", "tools");
    let currentSort = Store.load("activeSort", "time");
    let currentRenderToken = 0;
    const getRenderToken = () => currentRenderToken;

    const triggerLoad = () => {
        currentRenderToken++; 
        loadSidebarContent({
            tab: currentTab, sort: currentSort,
            keyword: sortContainer.querySelector("#hub-search-input").value.trim().toLowerCase(),
            contentArea: contentArea, currentUser: topNav.getCurrentUser(),
            renderToken: currentRenderToken, getRenderToken: getRenderToken
        });
    };

    window.addEventListener("comfy-user-logout", triggerLoad);
    window.addEventListener("comfy-user-login", triggerLoad);

    sortContainer.querySelector("#btn-open-publish").onclick = () => {
        const currentUser = topNav.getCurrentUser();
        if (!currentUser) return alert("⚠️ 请先登录您的社区账号后再进行发布！");
        
        tabsContainer.style.display = "none"; sortContainer.style.display = "none"; contentBoxWrapper.style.display = "none";
        const publishView = createPublishView(currentUser, 
            () => { publishView.remove(); tabsContainer.style.display = "flex"; sortContainer.style.display = "flex"; contentBoxWrapper.style.display = "flex"; }, 
            () => { publishView.remove(); tabsContainer.style.display = "flex"; sortContainer.style.display = "flex"; contentBoxWrapper.style.display = "flex"; triggerLoad(); }
        );
        container.appendChild(publishView);
    };

    tabs.forEach(tab => {
        const btn = document.createElement("button");
        btn.innerText = tab.label;
        Object.assign(btn.style, { flex: "1", padding: "8px", cursor: "pointer", background: currentTab === tab.id ? "#444" : "transparent", color: currentTab === tab.id ? "#fff" : "#aaa", border: "none", borderBottom: currentTab === tab.id ? "2px solid #4CAF50" : "none" });
        btn.onclick = () => {
            currentTab = tab.id; Store.save("activeTab", currentTab);
            Array.from(tabsContainer.children).forEach(c => { c.style.background = "transparent"; c.style.color = "#aaa"; c.style.borderBottom = "none"; });
            btn.style.background = "#444"; btn.style.color = "#fff"; btn.style.borderBottom = "2px solid #4CAF50";
            sortContainer.querySelector("#hub-search-input").value = ""; 
            triggerLoad();
        };
        tabsContainer.appendChild(btn);
    });

    sortContainer.querySelector("#hub-sort-select").value = currentSort;
    sortContainer.querySelector("#hub-sort-select").onchange = (e) => { currentSort = e.target.value; Store.save("activeSort", currentSort); triggerLoad(); };
    sortContainer.querySelector("#hub-search-input").oninput = triggerLoad;

    container.appendChild(topNav.dom); 
    container.appendChild(tabsContainer); 
    container.appendChild(sortContainer); 
    container.appendChild(contentBoxWrapper);
    
    triggerLoad();
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