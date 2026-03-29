// 前端页面/core/侧边栏主程序.js
import { app } from "../../../scripts/app.js"; 
import { createPublishView } from "../market/发布内容组件.js";
import { createTopNav } from "../components/顶部导航组件.js";
import { loadSidebarContent } from "./侧边栏数据引擎.js";
import { createItemDetailView } from "../market/资源详情页面组件.js";
import { showToast } from "../components/UI交互提示组件.js";
import { CACHE } from "./全局配置.js";

const Store = {
    save(key, value) { localStorage.setItem(`ComfyCommunitySidebar_${key}`, value); },
    load(key, defaultValue) { return localStorage.getItem(`ComfyCommunitySidebar_${key}`) || defaultValue; }
};

// 工具背景图本地存储管理
const BackgroundStore = {
    save(base64) { localStorage.setItem(CACHE.LOCAL_KEYS.SIDEBAR_BACKGROUND, base64); },
    load() { return localStorage.getItem(CACHE.LOCAL_KEYS.SIDEBAR_BACKGROUND) || null; },
    clear() { localStorage.removeItem(CACHE.LOCAL_KEYS.SIDEBAR_BACKGROUND); }
};

function buildSidebarDOM() {
    const container = document.createElement("div");
    
    // 加载本地背景图
    const savedBg = BackgroundStore.load();
    const bgStyle = savedBg 
        ? `background-image: url(${savedBg}); background-size: cover; background-position: center;`
        : `background-color: var(--bg-color, #202020);`;
    
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", height: "100%", width: "100%",
        color: "var(--fg-color, #fff)", fontFamily: "sans-serif"
    });
    container.style.cssText += bgStyle;

    const topNav = createTopNav();

    const tabsContainer = document.createElement("div");
    Object.assign(tabsContainer.style, { display: "flex", borderBottom: "1px solid #444", padding: "10px 10px 0 10px" });
    const tabs = [{ id: "tools", label: "工具" }, { id: "apps", label: "应用" }, { id: "recommends", label: "推荐榜" }, { id: "creators", label: "创作者" }];

    const sortContainer = document.createElement("div");
    Object.assign(sortContainer.style, { padding: "10px", display: "flex", gap: "8px", alignItems: "center", width: "100%", boxSizing: "border-box" });
    sortContainer.innerHTML = `
        <select id="hub-sort-select" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 90px; flex-shrink: 0;">
            <option value="time">最新发布</option>
    <option value="downloads">下载使用最多</option>
    <option value="likes">点赞最多</option>
    <option value="favorites">收藏最多</option>
    <option value="tips">💰 近期打赏榜</option> </select>
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

    // =========================================================================
    // 【新增】底部专业版权与合作伙伴信息区域 (Footer)
    // =========================================================================
    const footerContainer = document.createElement("div");
    Object.assign(footerContainer.style, {
        padding: "15px 10px 20px",
        textAlign: "center",
        fontSize: "12px",
        color: "#666",
        flexShrink: "0",
        background: "transparent"
    });

    footerContainer.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; gap: 16px; margin-bottom: 8px; flex-wrap: wrap;">
            <a href="https://github.com/a63976659/ComfyUI-Ranking" target="_blank" style="color: #888; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#4CAF50'" onmouseout="this.style.color='#888'">🌍 ComfyUI精选社区</a>
            <a href="https://github.com/a63976659" target="_blank" style="color: #888; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#888'">🐙 GitHub</a>
            <a href="https://huggingface.co/ZHIWEI666" target="_blank" style="color: #888; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#FFD21E'" onmouseout="this.style.color='#888'">🤗 Hugging Face</a>
            <a href="#" target="_blank" style="color: #888; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#2196F3'" onmouseout="this.style.color='#888'">🏢 砚影科技</a>
            <a href="https://space.bilibili.com/2114638644" target="_blank" style="color: #888; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#00A1D6'" onmouseout="this.style.color='#888'">📺 Bilibili</a>
        </div>
        <div style="display: flex; justify-content: center; align-items: center; gap: 10px; color: #555;">
            <span>MIT License Copyright (c) 2026 猪的飞行梦</span>
            <span style="color: #444;">|</span>
            <span>v1.2.0-Alpha</span>
        </div>
    `;
    
    // 监听从设置页面触发的背景更新事件
    window.addEventListener("comfy-sidebar-bg-update", () => {
        const newBg = BackgroundStore.load();
        if (newBg) {
            container.style.backgroundImage = `url(${newBg})`;
            container.style.backgroundSize = "cover";
            container.style.backgroundPosition = "center";
            container.style.backgroundColor = "transparent";
        } else {
            container.style.backgroundImage = "none";
            container.style.backgroundColor = "var(--bg-color, #202020)";
        }
    });
    // =========================================================================

    let activeInlineView = null; 

    const showInlineView = (viewDOM) => {
        if (activeInlineView) activeInlineView.remove();
        tabsContainer.style.display = "none"; 
        sortContainer.style.display = "none"; 
        contentBoxWrapper.style.display = "none";
        footerContainer.style.display = "none"; // 【核心】：打开详情/发布页时隐藏底部
        activeInlineView = viewDOM;
        container.appendChild(activeInlineView);
    };

    const hideInlineView = () => {
        if (activeInlineView) {
            activeInlineView.remove();
            activeInlineView = null;
        }
        tabsContainer.style.display = "flex"; 
        sortContainer.style.display = "flex"; 
        contentBoxWrapper.style.display = "flex";
        footerContainer.style.display = "block"; // 【核心】：返回列表时恢复底部
    };

    window.addEventListener("comfy-route-view", (e) => {
        showInlineView(e.detail.view);
    });

    window.addEventListener("comfy-route-back", () => {
        hideInlineView();
    });

    window.addEventListener("comfy-open-detail", (e) => {
        const { itemData, currentUser } = e.detail;
        const view = createItemDetailView(itemData, currentUser);
        showInlineView(view);
    });

    // 监听进入修改编辑页面的请求
    window.addEventListener("comfy-route-edit-publish", (e) => {
        const { itemData, currentUser } = e.detail;
        const publishView = createPublishView(currentUser, 
            () => hideInlineView(), 
            () => { hideInlineView(); triggerLoad(); },
            itemData 
        );
        showInlineView(publishView);
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
    
    // 监听子组件请求刷新列表
    window.addEventListener("comfy-trigger-sidebar-reload", () => { triggerLoad(); });

    sortContainer.querySelector("#btn-open-publish").onclick = () => {
        const currentUser = topNav.getCurrentUser();
        if (!currentUser) return showToast("⚠️ 请先登录您的社区账号后再进行发布！", "warning");
        
        const publishView = createPublishView(currentUser, 
            () => hideInlineView(), 
            () => { hideInlineView(); triggerLoad(); }
        );
        showInlineView(publishView);
    };

    // Tab 颜色配置：每个 Tab 不同的强调色
    const tabColors = {
        tools: { active: "#4CAF50", inactive: "#6BBF6B" },      // 工具 - 绿色
        apps: { active: "#2196F3", inactive: "#64B5F6" },       // 应用 - 蓝色
        recommends: { active: "#FF9800", inactive: "#FFB74D" }, // 推荐榜 - 橙色
        creators: { active: "#E91E63", inactive: "#F06292" }    // 创作者 - 粉色
    };

    // 文字阴影效果：多层阴影确保任何背景下都清晰可见
    const getTextShadow = (color, isActive) => {
        const baseShadow = "0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6), 1px 1px 3px rgba(0,0,0,0.5)";
        return isActive 
            ? `${baseShadow}, 0 0 10px ${color}, 0 0 20px ${color}` 
            : baseShadow;
    };

    tabs.forEach(tab => {
        const btn = document.createElement("button");
        btn.innerText = tab.label;
        const isActive = currentTab === tab.id;
        const color = tabColors[tab.id];
        Object.assign(btn.style, { 
            flex: "1", 
            padding: "8px", 
            cursor: "pointer", 
            background: isActive ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)", 
            color: isActive ? color.active : color.inactive, 
            border: "none", 
            borderBottom: isActive ? `2px solid ${color.active}` : "none",
            fontWeight: "bold",
            textShadow: getTextShadow(color.active, isActive),
            transition: "all 0.2s ease",
            fontSize: "13px"
        });
        btn.onclick = () => {
            currentTab = tab.id; Store.save("activeTab", currentTab);
            Array.from(tabsContainer.children).forEach((c, i) => { 
                const tabId = tabs[i].id;
                const tabColor = tabColors[tabId];
                c.style.background = "rgba(0,0,0,0.15)"; 
                c.style.color = tabColor.inactive; 
                c.style.borderBottom = "none"; 
                c.style.textShadow = getTextShadow(tabColor.active, false);
            });
            btn.style.background = "rgba(0,0,0,0.3)"; 
            btn.style.color = color.active; 
            btn.style.borderBottom = `2px solid ${color.active}`;
            btn.style.textShadow = getTextShadow(color.active, true);
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
    
    // 【核心新增】：将底部追加到容器的最下方
    container.appendChild(footerContainer);
    
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