// 前端页面/core/侧边栏主程序.js
// ==========================================
// 🎯 侧边栏功能主体模块
// ==========================================
// 职责：构建侧边栏 DOM、管理 Tab/排序/搜索交互
// 由 侧边栏入口注册.js 动态加载
// ==========================================

import { createPublishView } from "../market/发布内容组件.js";
import { createPublishTaskView } from "../task/发布任务组件.js";  // 🎯 新增：任务发布
import { createPublishPostView } from "../post/发布帖子组件.js";  // 🎯 新增：帖子发布
import { createPublishPromptView } from "../prompt/发布提示词组件.js";  // 🎯 新增：提示词发布
import { createTopNav } from "../components/顶部导航组件.js";
import { loadSidebarContent } from "./侧边栏数据引擎.js";
import { createItemDetailView } from "../market/资源详情页面组件.js";
import { showToast } from "../components/UI交互提示组件.js";
import { api } from "./网络请求API.js";  // 🔴 编辑模式需调用详情API获取完整数据
import { CACHE, getBackgroundKey } from "./全局配置.js";
import { debounce } from "../components/性能优化工具.js";
import { cleanupImageSandbox } from "../components/图片沙盒组件.js";  // 🔧 P3优化：导入清理函数
import { getVersionConfig, formatVersionString } from "../components/关于插件组件.js";  // 🏷️ 动态版本号
// 🎯 P2 用户体验增强
import { initUXEnhancements, t } from "../components/用户体验增强.js";

// 初始化 UX 增强
try {
    initUXEnhancements();
} catch (e) {
    console.warn('🎯 UX 增强初始化失败:', e);
}

// 🚫 注入 Tab 文案样式（模块加载时执行一次）
// Tab 文案用伪元素 content 渲染而非文本节点，使其不存在于 DOM 树中，
// 从而既避开 ComfyUI 翻译插件（只改写文本节点 / innerText / title / option.text），
// 也避开浏览器翻译扩展；否则英文界面下 Tools 会被译成“工具”
(function _injectTabLabelStyle() {
    if (document.getElementById('hub-tab-label-style')) return;
    const style = document.createElement('style');
    style.id = 'hub-tab-label-style';
    style.textContent = '.hub-tab-btn::before { content: var(--tab-label); }';
    document.head.appendChild(style);
})();

// 🚫 筛选框选项防翻译：原生 <option> 不支持伪元素，无法用上面那套方案，
// 改用零宽空格打断词典匹配：翻译插件只做 T.Menu[txt] || T.Menu[txt.trim()] 精确取值，
// 而 trim() 不移除 U+200B，两路都查不到 → 不翻译。字符零宽，视觉与布局无变化，
// option 的 value 是独立字面量，排序/筛选逻辑不受影响
const noTr = (txt) => `${txt}\u200b`;

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

// 🔧 P1修复：window 监听注册表（语言切换会重建 buildSidebarDOM，需先移除旧监听防止累积泄漏）
let _sidebarWindowListeners = [];
function _cleanupSidebarWindowListeners() {
    for (const { event, handler } of _sidebarWindowListeners) {
        window.removeEventListener(event, handler);
    }
    _sidebarWindowListeners = [];
}
function _onSidebarWindow(event, handler) {
    window.addEventListener(event, handler);
    _sidebarWindowListeners.push({ event, handler });
}

export function buildSidebarDOM() {
    // 🔧 P1修复：重建前先清理上一轮的 window 监听，避免重复注册
    _cleanupSidebarWindowListeners();

    const container = document.createElement("div");
    
    // 加载本地背景图
    const savedBg = BackgroundStore.load();
    const bgStyle = savedBg 
        ? `background-image: url(${savedBg}); background-size: cover; background-position: center;`
        : `background-color: var(--comfy-menu-bg);`;
    
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
        { id: "posts", label: t('nav.posts') },
        { id: "prompts", label: t('nav.prompts') }
    ];

    const sortContainer = document.createElement("div");
    Object.assign(sortContainer.style, { padding: "10px", display: "flex", gap: "8px", alignItems: "center", width: "100%", boxSizing: "border-box" });
    sortContainer.innerHTML = `
        <!-- 通用排序选择框（工具/应用/推荐/创作者） -->
        <select id="hub-sort-select" style="background: var(--comfy-input-bg); color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 140px; flex-shrink: 0;">
            <option value="time">${noTr(t('market.latest'))}</option>
            <option value="downloads">${noTr(t('market.downloads'))}</option>
            <option value="likes">${noTr(t('market.like'))}</option>
            <option value="favorites">${noTr(t('market.favorites'))}</option>
            <option value="tips">💰 ${noTr(t('market.tips_ranking') || '近期打赏榜')}</option>
            <option value="views">${noTr(t('market.views'))}</option>
            <option value="daily_views">${noTr(t('market.daily_views'))}</option>
            <option value="rating">${noTr(t('market.rating'))}</option>
        </select>
        <!-- 任务榜筛选控件（状态+排序） -->
        <select id="task-status-filter" style="display: none; background: var(--comfy-input-bg); color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 100px; flex-shrink: 0;">
            <option value="">${noTr(t('task.filter_all'))}</option>
            <option value="open">${noTr(t('task.filter_open'))}</option>
            <option value="in_progress">${noTr(t('task.filter_in_progress'))}</option>
            <option value="submitted">${noTr(t('task.filter_submitted'))}</option>
            <option value="completed">${noTr(t('task.filter_completed'))}</option>
            <option value="disputed">${noTr(t('task.filter_disputed'))}</option>
        </select>
        <select id="task-sort-select" style="display: none; background: var(--comfy-input-bg); color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 100px; flex-shrink: 0;">
            <option value="latest">${noTr(t('task.sort_latest'))}</option>
            <option value="price">${noTr(t('task.sort_price'))}</option>
            <option value="deadline">${noTr(t('task.sort_deadline'))}</option>
            <option value="views">${noTr(t('task.sort_views'))}</option>
            <option value="daily_views">${noTr(t('task.sort_daily_views'))}</option>
            <option value="likes">${noTr(t('task.sort_likes'))}</option>
            <option value="favorites">${noTr(t('task.sort_favorites'))}</option>
        </select>
        <!-- 🎯 讨论区排序控件（专用） -->
        <select id="posts-sort-select" style="display: none; background: var(--comfy-input-bg); color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 140px; flex-shrink: 0;">
            <option value="latest">${noTr(t('post.sort_latest'))}</option>
            <option value="likes">${noTr(t('post.sort_likes'))}</option>
            <option value="favorites">${noTr(t('post.sort_favorites'))}</option>
            <option value="tips">${noTr(t('post.sort_tips'))}</option>
            <option value="views">${noTr(t('post.sort_views'))}</option>
            <option value="daily_views">${noTr(t('post.sort_daily_views'))}</option>
            <option value="rating">${noTr(t('post.sort_rating') || t('market.rating'))}</option>
        </select>
        <!-- 🧩 提示词排序控件（专用） -->
        <select id="prompts-sort-select" style="display: none; background: var(--comfy-input-bg); color: white; border: 1px solid #555; border-radius: 4px; outline: none; padding: 6px; width: 140px; flex-shrink: 0;">
            <option value="latest">${noTr(t('prompt.sort_latest'))}</option>
            <option value="likes">${noTr(t('prompt.sort_likes'))}</option>
            <option value="favorites">${noTr(t('prompt.sort_favorites'))}</option>
            <option value="views">${noTr(t('prompt.sort_views'))}</option>
            <option value="daily_views">${noTr(t('prompt.sort_daily_views'))}</option>
        </select>
        <input type="text" id="hub-search-input" autocomplete="off" placeholder="🔍 ${t('common.search')}..." style="flex: 1; padding: 6px 10px; border-radius: 4px; border: 1px solid #555; background: #222; color: white; outline: none;">
        <button id="btn-open-publish" style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">➕ ${t('market.publish')}</button>
    `;

    const contentBoxWrapper = document.createElement("div");
    Object.assign(contentBoxWrapper.style, { flex: "1", minHeight: "0", padding: "0 10px 10px 10px", display: "flex", flexDirection: "column" });

    const contentArea = document.createElement("div");
    contentArea.className = "sidebar-scroll-container";
    // 🔧 自适应高度：flex 填充剩余空间，内容少时随内容收缩，避免容器框与底部页脚间出现空白
    Object.assign(contentArea.style, {
        flex: "1 1 auto", minHeight: "0", overflowY: "auto", padding: "10px",
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
            <a href="https://www.bilibili.com/video/BV1x4XzBXEk9" target="_blank" style="color: #888; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#00A1D6'" onmouseout="this.style.color='#888'">📺 Bilibili</a>
        </div>
        <div style="display: flex; justify-content: center; align-items: center; gap: 10px; color: #555;">
            <span>MIT License Copyright (c) 2026 <a href="#" id="easter-egg-trigger" style="color: #888; text-decoration: none; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#ffb0c0'" onmouseout="this.style.color='#888'">猪的飞行梦</a></span>
            <span style="color: #444;">|</span>
            <span class="footer-version-label">加载中...</span>
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

    // 🏷️ 动态加载版本号（与关于页面保持一致）
    getVersionConfig().then(config => {
        const versionLabel = footerContainer.querySelector('.footer-version-label');
        if (versionLabel) {
            versionLabel.textContent = formatVersionString(config);
        }
    }).catch(() => {
        const versionLabel = footerContainer.querySelector('.footer-version-label');
        if (versionLabel) versionLabel.textContent = 'V2.0.0 Beta';
    });
    
    // 监听从设置页面触发的背景更新事件
    _onSidebarWindow("comfy-sidebar-bg-update", () => {
        const newBg = BackgroundStore.load();
        if (newBg) {
            container.style.backgroundImage = `url(${newBg})`;
            container.style.backgroundSize = "cover";
            container.style.backgroundPosition = "center";
            container.style.backgroundColor = "transparent";
        } else {
            container.style.backgroundImage = "none";
            container.style.backgroundColor = "var(--comfy-menu-bg)";
        }
    });
    // =========================================================================

    let activeInlineView = null; 

    const showInlineView = (viewDOM) => {
        if (activeInlineView) {
            if (activeInlineView._cleanup) activeInlineView._cleanup();
            activeInlineView.remove();
        }
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
            if (activeInlineView._cleanup) activeInlineView._cleanup();
            cleanupImageSandbox(activeInlineView);

            activeInlineView.remove();
            activeInlineView = null;
        }
        tabsContainer.style.display = "flex"; 
        sortContainer.style.display = "flex"; 
        contentBoxWrapper.style.display = "flex";
        footerContainer.style.display = "block"; // 【核心】：返回列表时恢复底部
    };

    _onSidebarWindow("comfy-route-view", (e) => {
        showInlineView(e.detail.view);
    });

    _onSidebarWindow("comfy-route-back", () => {
        hideInlineView();
    });

    _onSidebarWindow("comfy-open-detail", (e) => {
        const { itemData, currentUser } = e.detail;
        const view = createItemDetailView(itemData, currentUser);
        showInlineView(view);
    });

    // 监听进入修改编辑页面的请求
    // 🔴 修复：编辑时先获取详情API数据，确保 has_private_token 等字段完整（列表缓存可能缺少该字段）
    _onSidebarWindow("comfy-route-edit-publish", async (e) => {
        const { itemData, currentUser } = e.detail;

        // 先展示加载状态，避免用户感知延迟
        const loadingView = document.createElement("div");
        loadingView.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;height:400px;color:#888;font-size:14px;";
        loadingView.innerHTML = `<div style=\"font-size:24px;margin-bottom:10px;\">⏳</div><div>${t('common.loading') || '加载中...'}</div>`;
        showInlineView(loadingView);

        // 从详情API获取完整数据（确保 has_private_token、netdisk_password 等字段不缺失）
        let enrichedItemData = itemData;
        try {
            const detailRes = await api.getItemById(itemData.id);
            if (detailRes?.status === "success" && detailRes?.data) {
                // 合并详情数据，保留列表中的图片URL等已有字段
                enrichedItemData = { ...itemData, ...detailRes.data };
            }
        } catch (err) {
            console.warn("获取编辑详情失败，使用列表数据:", err);
        }

        const publishView = createPublishView(currentUser, 
            () => hideInlineView(), 
            () => { hideInlineView(); triggerLoad(true); },
            enrichedItemData 
        );
        showInlineView(publishView);
    });

    // 监听进入任务编辑页面的请求
    _onSidebarWindow("comfy-route-edit-task", (e) => {
        const { taskData, currentUser } = e.detail;
        try {
            const view = createPublishTaskView(currentUser, taskData);
            showInlineView(view);
        } catch (err) {
            console.error('创建编辑任务视图失败:', err);
        }
    });

    // 监听进入帖子编辑页面的请求
    _onSidebarWindow("comfy-route-edit-post", (e) => {
        const { postData, currentUser } = e.detail;
        const view = createPublishPostView(currentUser, postData);
        showInlineView(view);
    });

    // 监听进入提示词编辑页面的请求
    _onSidebarWindow("comfy-route-edit-prompt", (e) => {
        const { promptData, currentUser } = e.detail;
        const view = createPublishPromptView(currentUser, promptData);
        showInlineView(view);
    });

    // 🔔 通知跳转：切换到对应Tab并展开指定卡片
    _onSidebarWindow("comfy-route-to-item", async (e) => {
        const { itemId, itemType } = e.detail;
        if (!itemId) return;
        
        // 1. 根据 itemType 确定 Tab
        let targetTab;
        if (itemType === "tool") targetTab = "tools";
        else if (itemType === "app") targetTab = "apps";
        else if (itemType === "recommend") targetTab = "recommends";
        else targetTab = "tools"; // 兜底
        
        // 【问题2修复】如果已经在目标 Tab，先尝试在当前 DOM 中查找卡片
        if (currentTab === targetTab) {
            const existingCard = contentArea.querySelector(`[data-item-id="${itemId}"]`);
            if (existingCard) {
                // 关闭可能存在的通知中心等全屏视图
                if (activeInlineView) hideInlineView();
                
                const summary = existingCard.querySelector('.item-summary') || existingCard.firstElementChild;
                // 先确保卡片是折叠状态再展开（避免点击已展开的卡片把它收起来）
                existingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 检查详情区域是否已展开
                const detailView = existingCard.children[1]; // detailView 是第二个子元素
                if (detailView && detailView.style.display === 'none' && summary) {
                    summary.click();
                }
                return;
            }
        }
        
        // 2. 切换到目标 Tab（如果不同）
        if (currentTab !== targetTab) {
            currentTab = targetTab;
            Store.save("activeTab", currentTab);
            
            // 3. 更新 Tab 按钮的选中状态
            const tabBtns = tabsContainer.querySelectorAll('button');
            tabBtns.forEach((btn, index) => {
                const tabId = tabs[index].id;
                const tabColor = tabColors[tabId];
                if (tabId === currentTab) {
                    btn.style.background = "rgba(0,0,0,0.3)";
                    btn.style.color = tabColor.active;
                    btn.style.borderBottom = `2px solid ${tabColor.active}`;
                    btn.style.textShadow = getTextShadow(tabColor.active, true);
                } else {
                    btn.style.background = "rgba(0,0,0,0.15)";
                    btn.style.color = tabColor.inactive;
                    btn.style.borderBottom = "none";
                    btn.style.textShadow = getTextShadow(tabColor.active, false);
                }
            });
            
            // 4. 更新筛选控件可见性
            updateFilterVisibility(currentTab);
        }
        
        // 5. 隐藏可能存在的详情页视图
        hideInlineView();
        
        // 6. 触发加载，传入要展开的 itemId
        currentRenderToken++;
        await loadSidebarContent({
            tab: currentTab,
            sort: currentSort,
            keyword: "",
            contentArea: contentArea,
            currentUser: topNav.getCurrentUser(),
            renderToken: currentRenderToken,
            getRenderToken: getRenderToken,
            force: false,
            expandItemId: itemId  // 新增：要展开的卡片ID
        });
    });

    let currentTab = Store.load("activeTab", "tools");
    let currentSort = Store.load("activeSort", "time");
    let currentRenderToken = 0;
    const getRenderToken = () => currentRenderToken;

    const triggerLoad = (forceRefresh = false) => {
        currentRenderToken++; 
        loadSidebarContent({
            tab: currentTab, sort: currentSort,
            keyword: sortContainer.querySelector("#hub-search-input").value.trim().toLowerCase(),
            contentArea: contentArea, currentUser: topNav.getCurrentUser(),
            renderToken: currentRenderToken, getRenderToken: getRenderToken,
            force: forceRefresh
        });
    };

    _onSidebarWindow("comfy-user-logout", triggerLoad);
    _onSidebarWindow("comfy-user-login", triggerLoad);
    
    // 监听子组件请求刷新列表
    _onSidebarWindow("comfy-trigger-sidebar-reload", (e) => { 
        triggerLoad(e.detail?.force ?? false); 
    });

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
        } else if (currentTab === "prompts") {
            // 🧩 提示词 -> 打开发布提示词界面
            const view = createPublishPromptView(currentUser);
            showInlineView(view);
        } else {
            // 工具/应用/推荐 -> 打开发布内容界面，并自动设置对应类型
            const publishView = createPublishView(currentUser, 
                () => hideInlineView(), 
                () => { hideInlineView(); triggerLoad(true); },
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
        posts: { active: "#9C27B0", inactive: "#BA68C8" },      // 讨论区 - 紫色
        prompts: { active: "#00BCD4", inactive: "#4DD0E1" }     // 提示词 - 青色
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
        // 文案交由 ::before 渲染（见文件顶部 _injectTabLabelStyle），不产生文本节点；
        // 伪元素内容不参与可访问名计算，用 aria-label 补回无障碍名称
        btn.className = "hub-tab-btn";
        btn.style.setProperty("--tab-label", JSON.stringify(tab.label));
        btn.setAttribute("aria-label", tab.label);
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
        const postsSortSelect = sortContainer.querySelector("#posts-sort-select");
        const promptsSortSelect = sortContainer.querySelector("#prompts-sort-select");
        const publishBtn = sortContainer.querySelector("#btn-open-publish");
        
        if (tabId === "tasks") {
            // 任务榜：隐藏通用排序，显示任务筛选
            hubSortSelect.style.display = "none";
            postsSortSelect.style.display = "none";
            promptsSortSelect.style.display = "none";
            taskStatusFilter.style.display = "block";
            taskSortSelect.style.display = "block";
            publishBtn.style.display = "block";
        } else if (tabId === "creators") {
            // 🎯 创作者界面：隐藏发布按钮，隐藏评分排序（创作者无评分）
            hubSortSelect.style.display = "block";
            postsSortSelect.style.display = "none";
            promptsSortSelect.style.display = "none";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = "none";
            const ratingOpt = hubSortSelect.querySelector('option[value="rating"]');
            if (ratingOpt) ratingOpt.style.display = "none";
            if (hubSortSelect.value === "rating") { hubSortSelect.value = "time"; currentSort = "time"; Store.save("activeSort", currentSort); }
        } else if (tabId === "posts") {
            // 🎯 讨论区：显示讨论区排序，隐藏通用排序和任务筛选
            hubSortSelect.style.display = "none";
            postsSortSelect.style.display = "block";
            promptsSortSelect.style.display = "none";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = "block";
        } else if (tabId === "prompts") {
            // 🧩 提示词：显示提示词排序，隐藏其他所有排序筛选
            hubSortSelect.style.display = "none";
            postsSortSelect.style.display = "none";
            promptsSortSelect.style.display = "block";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = "block";
        } else {
            // 其他Tab：显示通用排序，隐藏任务筛选和讨论区排序
            hubSortSelect.style.display = "block";
            postsSortSelect.style.display = "none";
            promptsSortSelect.style.display = "none";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = "block";
            const ratingOpt = hubSortSelect.querySelector('option[value="rating"]');
            if (ratingOpt) ratingOpt.style.display = "";
        }
    };
    
    // 初始化筛选控件显示状态
    updateFilterVisibility(currentTab);

    sortContainer.querySelector("#hub-sort-select").value = currentSort;
    sortContainer.querySelector("#hub-sort-select").onchange = (e) => { currentSort = e.target.value; Store.save("activeSort", currentSort); triggerLoad(); };
    
    // 🔍 搜索防抖：300ms 延迟，避免每次按键都发起网络请求
    sortContainer.querySelector("#hub-search-input").oninput = debounce(() => {
        triggerLoad();
    }, 300);
    
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

    // 🎯 讨论区排序控件事件绑定
    sortContainer.querySelector("#posts-sort-select").onchange = () => {
        window.dispatchEvent(new CustomEvent("comfy-posts-filter-change", {
            detail: {
                sort: sortContainer.querySelector("#posts-sort-select").value
            }
        }));
    };

    // 🧩 提示词排序控件事件绑定
    sortContainer.querySelector("#prompts-sort-select").onchange = () => {
        window.dispatchEvent(new CustomEvent("comfy-prompts-filter-change", {
            detail: {
                sort: sortContainer.querySelector("#prompts-sort-select").value
            }
        }));
    };

    container.appendChild(topNav.dom); 
    container.appendChild(tabsContainer); 
    container.appendChild(sortContainer); 
    container.appendChild(contentBoxWrapper);
    
    // 【核心新增】：将底部追加到容器的最下方
    container.appendChild(footerContainer);
    
    // 🔧 自适应高度守护（事件驱动）：ComfyUI 侧边栏面板与本容器之间隔着一层未设高度的
    // 包裹 div，height:100% 会退化为内容撑开、flex 填充链失效；且 Tab 注销重注册/面板切换
    // 时 Vue 会重建该包裹层。因此监听侧边栏区域的 DOM 挂载事件，本容器每次被（重新）挂载
    // 时立即为当前包裹层补 height:100%，使容器始终锁定面板可视高度，内容超出时在容器内部
    // 滚动、页脚紧贴容器底部（零轮询，与 NodeCraft-AI 的 render 回调方案等效）
    window.__comfyRankingSidebarRoot = container;
    if (!window.__comfyRankingHeightFixerInstalled) {
        window.__comfyRankingHeightFixerInstalled = true;
        const 补包裹层高度 = () => {
            const root = window.__comfyRankingSidebarRoot;
            const wrapper = root && root.parentElement;
            if (wrapper && wrapper.style.height !== "100%") {
                wrapper.style.height = "100%";
            }
        };
        const 安装监听 = () => {
            // 锚定 ComfyUI 侧边栏布局的稳定节点（会话内不重建），包裹层的重建都发生在其内部
            const 锚点 = document.querySelector('.side-bar-panel') || document.querySelector('.sidebar-content-container');
            if (!锚点) return false;
            new MutationObserver((_, observer) => {
                // 锚点自身若被重建则断开并重新寻找挂载（极端情况，布局整体刷新时）
                if (!锚点.isConnected) {
                    observer.disconnect();
                    setTimeout(() => 尝试安装(10), 500);
                    return;
                }
                补包裹层高度();
            }).observe(锚点, { childList: true, subtree: true });
            return true;
        };
        // 锚点未就绪时延迟重试，保证监听一定装上
        const 尝试安装 = (剩余次数) => {
            if (安装监听() || 剩余次数 <= 0) return;
            setTimeout(() => 尝试安装(剩余次数 - 1), 500);
        };
        // 回调内引用：锚点自身被重建时走同样的延迟重试路径
        尝试安装(10);
    }

    triggerLoad();
    return container;
}

