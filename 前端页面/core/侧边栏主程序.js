// 前端页面/core/侧边栏主程序.js
import { app } from "../../../scripts/app.js"; 
import { createPublishView } from "../market/发布内容组件.js";
import { createPublishTaskView } from "../task/发布任务组件.js";  // 🎯 新增：任务发布
import { createPublishPostView } from "../post/发布帖子组件.js";  // 🎯 新增：帖子发布
import { createTopNav } from "../components/顶部导航组件.js";
import { loadSidebarContent } from "./侧边栏数据引擎.js";
import { createItemDetailView } from "../market/资源详情页面组件.js";
import { showToast } from "../components/UI交互提示组件.js";
import { CACHE, getBackgroundKey } from "./全局配置.js";
import { cleanupImageSandbox } from "../components/图片沙盒组件.js";  // 🔧 P3优化：导入清理函数
// 🎯 P2 用户体验增强
import { initUXEnhancements, t } from "../components/用户体验增强.js";

// 初始化 UX 增强
try {
    initUXEnhancements();
} catch (e) {
    console.warn('🎯 UX 增强初始化失败:', e);
}

const Store = {
    save(key, value) { localStorage.setItem(`ComfyCommunitySidebar_${key}`, value); },
    load(key, defaultValue) { return localStorage.getItem(`ComfyCommunitySidebar_${key}`) || defaultValue; }
};

// 工具背景图本地存储管理（账号隔离）
const BackgroundStore = {
    save(base64) { localStorage.setItem(getBackgroundKey(), base64); },
    load() { return localStorage.getItem(getBackgroundKey()) || null; },
    clear() { localStorage.removeItem(getBackgroundKey()); }
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
    // 🌐 多语言支持：Tab 名称使用翻译函数
    const tabs = [
        { id: "tools", label: t('nav.tools') },
        { id: "apps", label: t('nav.apps') },
        { id: "recommends", label: t('nav.recommends') },
        { id: "creators", label: t('nav.creators') },
        { id: "tasks", label: t('nav.tasks') },
        { id: "posts", label: t('nav.posts') }
    ];

    const sortContainer = document.createElement("div");
    Object.assign(sortContainer.style, { padding: "10px", display: "flex", gap: "8px", alignItems: "center", width: "100%", boxSizing: "border-box" });
    sortContainer.innerHTML = `
        <!-- 通用排序选择框（工具/应用/推荐/创作者） -->
        <select id="hub-sort-select" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 140px; flex-shrink: 0;">
            <option value="time">${t('market.latest')}</option>
            <option value="downloads">${t('market.downloads')}</option>
            <option value="likes">${t('market.like')}</option>
            <option value="favorites">${t('market.favorites')}</option>
            <option value="tips">💰 ${t('market.tips_ranking') || '近期打赏榜'}</option>
        </select>
        <!-- 任务榜筛选控件（状态+排序） -->
        <select id="task-status-filter" style="display: none; background: #333; color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 100px; flex-shrink: 0;">
            <option value="">${t('task.filter_all')}</option>
            <option value="open">${t('task.filter_open')}</option>
            <option value="in_progress">${t('task.filter_in_progress')}</option>
            <option value="submitted">${t('task.filter_submitted')}</option>
            <option value="completed">${t('task.filter_completed')}</option>
            <option value="disputed">${t('task.filter_disputed')}</option>
        </select>
        <select id="task-sort-select" style="display: none; background: #333; color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 100px; flex-shrink: 0;">
            <option value="latest">${t('task.sort_latest')}</option>
            <option value="price">${t('task.sort_price')}</option>
            <option value="deadline">${t('task.sort_deadline')}</option>
        </select>
        <input type="text" id="hub-search-input" placeholder="🔍 ${t('common.search')}..." style="flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid #555; background: #222; color: white; outline: none;">
        <button id="btn-open-publish" style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">➕ ${t('market.publish')}</button>
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
            <span>MIT License Copyright (c) 2026 <a href="#" id="easter-egg-trigger" style="color: #888; text-decoration: none; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#ffb0c0'" onmouseout="this.style.color='#888'">猪的飞行梦</a></span>
            <span style="color: #444;">|</span>
            <span>v1.2.0-Alpha</span>
        </div>
    `;
    
    // 彩蛋触发
    const easterEggLink = footerContainer.querySelector('#easter-egg-trigger');
    if (easterEggLink) {
        easterEggLink.addEventListener('click', (e) => {
            e.preventDefault();
            import('../components/彩蛋动画引擎.js').then(mod => mod.openEasterEggPage());
        });
    }
    
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
            // 🔧 P3优化：在移除视图前清理事件监听器
            cleanupImageSandbox(activeInlineView);
            
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
        
        // 🎯 根据当前Tab打开对应的发布界面
        if (currentTab === "tasks") {
            // 任务榜 -> 打开发布任务界面
            const view = createPublishTaskView(currentUser);
            showInlineView(view);
        } else if (currentTab === "posts") {
            // 讨论区 -> 打开发布帖子界面
            const view = createPublishPostView(currentUser);
            showInlineView(view);
        } else {
            // 工具/应用/推荐 -> 打开发布内容界面，并自动设置对应类型
            const publishView = createPublishView(currentUser, 
                () => hideInlineView(), 
                () => { hideInlineView(); triggerLoad(); },
                null,  // editItemData
                currentTab  // initialType: tools/apps/recommends
            );
            showInlineView(publishView);
        }
    };

    // Tab 颜色配置：每个 Tab 不同的强调色
    const tabColors = {
        tools: { active: "#4CAF50", inactive: "#6BBF6B" },      // 工具 - 绿色
        apps: { active: "#2196F3", inactive: "#64B5F6" },       // 应用 - 蓝色
        recommends: { active: "#FF9800", inactive: "#FFB74D" }, // 推荐榜 - 橙色
        creators: { active: "#E91E63", inactive: "#F06292" },   // 创作者 - 粉色
        tasks: { active: "#FF5722", inactive: "#FF8A65" },      // 任务榜 - 深橙色
        posts: { active: "#9C27B0", inactive: "#BA68C8" }       // 讨论区 - 紫色
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
            // 🎯 根据 Tab 切换筛选控件显示
            updateFilterVisibility(currentTab);
            triggerLoad();
        };
        tabsContainer.appendChild(btn);
    });

    // 🎯 筛选控件显示切换函数
    const updateFilterVisibility = (tabId) => {
        const hubSortSelect = sortContainer.querySelector("#hub-sort-select");
        const taskStatusFilter = sortContainer.querySelector("#task-status-filter");
        const taskSortSelect = sortContainer.querySelector("#task-sort-select");
        const publishBtn = sortContainer.querySelector("#btn-open-publish");
        
        if (tabId === "tasks") {
            // 任务榜：隐藏通用排序，显示任务筛选
            hubSortSelect.style.display = "none";
            taskStatusFilter.style.display = "block";
            taskSortSelect.style.display = "block";
            publishBtn.style.display = "block";
        } else if (tabId === "creators") {
            // 🎯 创作者界面：隐藏发布按钮
            hubSortSelect.style.display = "block";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = "none";
        } else {
            // 其他Tab：显示通用排序，隐藏任务筛选
            hubSortSelect.style.display = "block";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = "block";
        }
    };
    
    // 初始化筛选控件显示状态
    updateFilterVisibility(currentTab);

    sortContainer.querySelector("#hub-sort-select").value = currentSort;
    sortContainer.querySelector("#hub-sort-select").onchange = (e) => { currentSort = e.target.value; Store.save("activeSort", currentSort); triggerLoad(); };
    sortContainer.querySelector("#hub-search-input").oninput = triggerLoad;
    
    // 🎯 任务榜筛选控件事件绑定
    sortContainer.querySelector("#task-status-filter").onchange = () => {
        window.dispatchEvent(new CustomEvent("comfy-task-filter-change", {
            detail: {
                status: sortContainer.querySelector("#task-status-filter").value,
                sort: sortContainer.querySelector("#task-sort-select").value
            }
        }));
    };
    sortContainer.querySelector("#task-sort-select").onchange = () => {
        window.dispatchEvent(new CustomEvent("comfy-task-filter-change", {
            detail: {
                status: sortContainer.querySelector("#task-status-filter").value,
                sort: sortContainer.querySelector("#task-sort-select").value
            }
        }));
    };

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
let globalSidebarContainer = null;  // 🌐 保存容器引用，用于语言切换时替换
let pendingLanguageRefresh = false;  // 🌐 语言切换待刷新标志

// 🌐 语言切换监听器：标记需要刷新，待返回主界面时执行
document.addEventListener('comfy-language-change', () => {
    pendingLanguageRefresh = true;
});

// 🌐 返回主界面时检查是否需要刷新语言
window.addEventListener('comfy-route-back', () => {
    if (pendingLanguageRefresh && globalSidebarContainer) {
        pendingLanguageRefresh = false;
        // 延迟执行，确保当前视图已关闭
        setTimeout(() => {
            globalSidebarDOM = buildSidebarDOM();
            globalSidebarContainer.innerHTML = '';
            globalSidebarContainer.appendChild(globalSidebarDOM);
        }, 50);
    }
});

app.registerExtension({
    name: "Comfy.CommunityLeaderboardSidebar",
    async setup(app) {
        if (!globalSidebarDOM) globalSidebarDOM = buildSidebarDOM();
        if (app.extensionManager && app.extensionManager.registerSidebarTab) {
            app.extensionManager.registerSidebarTab({
                id: "comfyui-ranking-sidebar", title: "社区精选", icon: "pi pi-trophy", type: "custom",
                render: (container) => { 
                    globalSidebarContainer = container;  // 🌐 保存容器引用
                    container.innerHTML = ''; 
                    container.appendChild(globalSidebarDOM); 
                }
            });
        }
    }
});