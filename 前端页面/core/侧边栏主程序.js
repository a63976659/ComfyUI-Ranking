// 前端页面/core/侧边栏主程序.js
// ==========================================
// 🎯 侧边栏功能主体模块
// ==========================================
// 职责：构建侧边栏 DOM、管理 Tab/排序/搜索交互
// 由 侧边栏入口注册.js 动态加载
// ==========================================

import { createTopNav } from "../components/顶部导航组件.js";
import { loadSidebarContent, disposeSidebarContent } from "./侧边栏数据引擎.js";
import { showToast } from "../components/UI交互提示组件.js";
import { api, captureRequestSession } from "./网络请求API.js";  // 🔴 编辑模式需调用详情API获取完整数据
import { CACHE, UI, getBackgroundKey, IS_WEB_MODE, normalizeProfileImageUrl } from "./全局配置.js";
import { debounce } from "../components/性能优化工具.js";
import { scrollCardIntoView } from "../components/动画音效引擎.js";
import { cleanupImageSandbox } from "../components/图片沙盒组件.js";  // 🔧 P3优化：导入清理函数
import { getVersionConfig, formatVersionString } from "../components/关于插件组件.js";  // 🏷️ 动态版本号
// 🎯 P2 用户体验增强
import { initUXEnhancements, t, getLanguage } from "../components/用户体验增强.js";

// 初始化 UX 增强
try {
    initUXEnhancements();
} catch (e) {
    console.warn('🎯 UX 增强初始化失败');
}

// 统一设计 tokens 与键盘焦点样式；样式表只挂载一次，保持 ComfyUI 主题变量适配。
(function _injectSharedThemeStyles() {
    if (document.getElementById('hub-theme-style')) return;
    const link = document.createElement('link');
    link.id = 'hub-theme-style';
    link.rel = 'stylesheet';
    link.href = new URL('../styles/主题基础.css', import.meta.url).href;
    document.head.appendChild(link);
})();

// 🚫 筛选框选项防翻译：原生 <option> 不支持伪元素，无法用上面那套方案，
// 改用零宽空格打断词典匹配：翻译插件只做 T.Menu[txt] || T.Menu[txt.trim()] 精确取值，
// 而 trim() 不移除 U+200B，两路都查不到 → 不翻译。字符零宽，视觉与布局无变化，
// option 的 value 是独立字面量，排序/筛选逻辑不受影响
const noTr = (txt) => `${txt}\u200b`;

const sidebarPreferenceMemory = new Map();
const pendingSidebarPreferences = new Set();
const Store = {
    save(key, value) {
        const saved = String(value);
        sidebarPreferenceMemory.set(key, saved);
        try {
            localStorage.setItem(`ComfyCommunitySidebar_${key}`, saved);
            pendingSidebarPreferences.delete(key);
        } catch {
            pendingSidebarPreferences.add(key);
        }
    },
    load(key, defaultValue) {
        if (pendingSidebarPreferences.has(key)) return sidebarPreferenceMemory.get(key) || defaultValue;
        try {
            const saved = localStorage.getItem(`ComfyCommunitySidebar_${key}`);
            if (saved === null) sidebarPreferenceMemory.delete(key);
            else sidebarPreferenceMemory.set(key, saved);
            return saved || defaultValue;
        } catch {
            return sidebarPreferenceMemory.get(key) || defaultValue;
        }
    }
};

// 工具背景图本地存储管理（账号隔离）
// 📱 移动端适配：iOS 隐私模式/存储压力下 localStorage 写入会抛异常，写入/删除均做兜底（与个人设置表单写法一致）
const BackgroundStore = {
    save(base64) {
        try {
            localStorage.setItem(getBackgroundKey(), base64);
        } catch (e) {
            console.warn("⚠️ 界面背景保存失败（存储空间不足或不可用）");
        }
    },
    load() {
        try { return localStorage.getItem(getBackgroundKey()) || null; }
        catch { return null; }
    },
    clear() {
        try {
            localStorage.removeItem(getBackgroundKey());
        } catch (e) { /* 静默兜底 */ }
    }
};

// 🔧 P1修复：window 监听注册表（语言切换会重建 buildSidebarDOM，需先移除旧监听防止累积泄漏）
let _sidebarWindowListeners = [];
let _sidebarInstanceSequence = 0;
let _sidebarInlineViewCleanup = null;
let _sidebarListCleanup = null;
function _cleanupSidebarWindowListeners() {
    const cleanupList = _sidebarListCleanup;
    const cleanupInline = _sidebarInlineViewCleanup;
    _sidebarListCleanup = null;
    _sidebarInlineViewCleanup = null;
    for (const cleanup of [cleanupList, cleanupInline]) {
        try { cleanup?.(); }
        catch { console.warn('Sidebar cleanup failed'); }
    }
    for (const { event, handler } of _sidebarWindowListeners) {
        window.removeEventListener(event, handler);
    }
    _sidebarWindowListeners = [];
}
function _onSidebarWindow(event, handler) {
    window.addEventListener(event, handler);
    _sidebarWindowListeners.push({ event, handler });
}

async function loadDetailFactory() {
    return (await import('../market/资源详情页面组件.js')).createItemDetailView;
}

async function loadPublishFactory(kind) {
    if (kind === 'resource') return (await import('../market/发布内容组件.js')).createPublishView;
    if (kind === 'task') return (await import('../task/发布任务组件.js')).createPublishTaskView;
    if (kind === 'post') return (await import('../post/发布帖子组件.js')).createPublishPostView;
    if (kind === 'prompt') return (await import('../prompt/发布提示词组件.js')).createPublishPromptView;
    throw new Error('Invalid publish view');
}

function _applySidebarBackground(container, value) {
    const source = normalizeProfileImageUrl(value);
    const valid = !!source;
    container.style.backgroundImage = valid ? `url(${JSON.stringify(source)})` : "none";
    container.style.backgroundColor = valid ? "transparent" : "var(--comfy-menu-bg)";
    if (valid) {
        container.style.backgroundSize = "cover";
        container.style.backgroundPosition = "center";
    }
}

export function buildSidebarDOM() {
    // 🔧 P1修复：重建前先清理上一轮的 window 监听，避免重复注册
    _cleanupSidebarWindowListeners();

    const container = document.createElement("div");
    container.className = "comfy-ranking-root";
    
    // 加载本地背景图
    _applySidebarBackground(container, BackgroundStore.load());
    
    const topNav = createTopNav();
    const sidebarInstanceId = `comfy-ranking-${++_sidebarInstanceSequence}`;

    const tabsContainer = document.createElement("div");
    tabsContainer.id = `${sidebarInstanceId}-tablist`;
    tabsContainer.className = "hub-tablist";
    tabsContainer.setAttribute("role", "tablist");
    tabsContainer.setAttribute("aria-label", t("nav.board_navigation"));
    tabsContainer.setAttribute("aria-orientation", "horizontal");
    // 🌐 多语言支持：Tab 名称使用翻译函数
    const tabs = [
        { id: "tools", label: t('nav.tools') },
        { id: "skills", label: t('nav.skills') },
        { id: "apps", label: t('nav.apps') },
        { id: "recommends", label: t('nav.recommends') },
        { id: "creators", label: t('nav.creators') },
        { id: "tasks", label: t('nav.tasks') },
        { id: "posts", label: t('nav.posts') },
        { id: "prompts", label: t('nav.prompts') }
    ];

    const sortContainer = document.createElement("div");
    sortContainer.className = "hub-controls";
    sortContainer.innerHTML = `
        <!-- 通用排序选择框（工具/应用/推荐/创作者） -->
        <select id="hub-sort-select" class="hub-control-select hub-control-select--wide">
            <option value="time">${noTr(t('market.latest'))}</option>
            <option value="downloads">${noTr(t('market.downloads'))}</option>
            <option value="likes">${noTr(t('market.like'))}</option>
            <option value="favorites">${noTr(t('market.favorites'))}</option>
            <option value="tips">💰 ${noTr(t('market.tips_ranking'))}</option>
            <option value="views">${noTr(t('market.views'))}</option>
            <option value="daily_views">${noTr(t('market.daily_views'))}</option>
            <option value="rating">${noTr(t('market.rating'))}</option>
        </select>
        <!-- 任务榜筛选控件（状态+排序） -->
        <select id="task-status-filter" class="hub-control-select hub-control-select--compact" style="display: none;">
            <option value="">${noTr(t('task.filter_all'))}</option>
            <option value="open">${noTr(t('task.filter_open'))}</option>
            <option value="in_progress">${noTr(t('task.filter_in_progress'))}</option>
            <option value="submitted">${noTr(t('task.filter_submitted'))}</option>
            <option value="completed">${noTr(t('task.filter_completed'))}</option>
            <option value="disputed">${noTr(t('task.filter_disputed'))}</option>
        </select>
        <select id="task-sort-select" class="hub-control-select hub-control-select--compact" style="display: none;">
            <option value="latest">${noTr(t('task.sort_latest'))}</option>
            <option value="price">${noTr(t('task.sort_price'))}</option>
            <option value="deadline">${noTr(t('task.sort_deadline'))}</option>
            <option value="views">${noTr(t('task.sort_views'))}</option>
            <option value="daily_views">${noTr(t('task.sort_daily_views'))}</option>
            <option value="likes">${noTr(t('task.sort_likes'))}</option>
            <option value="favorites">${noTr(t('task.sort_favorites'))}</option>
        </select>
        <!-- 🎯 讨论区排序控件（专用） -->
        <select id="posts-sort-select" class="hub-control-select hub-control-select--wide" style="display: none;">
            <option value="latest">${noTr(t('post.sort_latest'))}</option>
            <option value="likes">${noTr(t('post.sort_likes'))}</option>
            <option value="favorites">${noTr(t('post.sort_favorites'))}</option>
            <option value="tips">${noTr(t('post.sort_tips'))}</option>
            <option value="views">${noTr(t('post.sort_views'))}</option>
            <option value="daily_views">${noTr(t('post.sort_daily_views'))}</option>
            <option value="rating">${noTr(t('post.sort_rating'))}</option>
        </select>
        <!-- 🧩 提示词排序控件（专用） -->
        <select id="prompts-sort-select" class="hub-control-select hub-control-select--wide" style="display: none;">
            <option value="latest">${noTr(t('prompt.sort_latest'))}</option>
            <option value="likes">${noTr(t('prompt.sort_likes'))}</option>
            <option value="favorites">${noTr(t('prompt.sort_favorites'))}</option>
            <option value="views">${noTr(t('prompt.sort_views'))}</option>
            <option value="daily_views">${noTr(t('prompt.sort_daily_views'))}</option>
        </select>
        <input type="search" id="hub-search-input" class="hub-search-input" autocomplete="off" placeholder="🔍 ${t('common.search')}...">
        <button id="btn-open-publish" class="hub-publish-button" type="button">➕ ${t('market.publish')}</button>
    `;

    const filterLabels = {
        "hub-sort-select": "common.sort_items",
        "task-status-filter": "common.filter_task_status",
        "task-sort-select": "common.sort_tasks",
        "posts-sort-select": "common.sort_posts",
        "prompts-sort-select": "common.sort_prompts",
        "hub-search-input": "common.search"
    };
    for (const [id, labelKey] of Object.entries(filterLabels)) {
        sortContainer.querySelector(`#${id}`)?.setAttribute("aria-label", t(labelKey));
    }

    // 📱 Web 模式：隐藏发布入口（网页版不支持发布族功能，编辑路由监听处另有中央兜底）
    if (IS_WEB_MODE) {
        const publishBtn = sortContainer.querySelector("#btn-open-publish");
        if (publishBtn) publishBtn.style.display = "none";
    }

    const contentBoxWrapper = document.createElement("div");
    contentBoxWrapper.className = "sidebar-content-wrapper";

    const contentArea = document.createElement("div");
    contentArea.className = "sidebar-scroll-container";
    contentArea.id = `${sidebarInstanceId}-tabpanel`;
    contentArea.setAttribute("role", "tabpanel");
    contentArea.setAttribute("tabindex", "0");
    // 🔧 自适应高度：flex 填充剩余空间，内容少时随内容收缩，避免容器框与底部页脚间出现空白
    contentBoxWrapper.appendChild(contentArea);

    // =========================================================================
    // 【新增】底部专业版权与合作伙伴信息区域 (Footer)
    // =========================================================================
    const footerContainer = document.createElement("div");
    footerContainer.className = "sidebar-footer";

    footerContainer.innerHTML = `
        <div class="sidebar-footer__links">
            <a href="https://github.com/a63976659/ComfyUI-Ranking" target="_blank" rel="noopener noreferrer" class="sidebar-footer__link sidebar-footer__link--community">🌍 ${t('footer.community_name')}</a>
            <a href="https://github.com/a63976659" target="_blank" rel="noopener noreferrer" class="sidebar-footer__link sidebar-footer__link--github">🐙 GitHub</a>
            <a href="https://huggingface.co/ZHIWEI666" target="_blank" rel="noopener noreferrer" class="sidebar-footer__link sidebar-footer__link--huggingface">🤗 Hugging Face</a>
            <a href="#" target="_blank" rel="noopener noreferrer" class="sidebar-footer__link sidebar-footer__link--company">🏢 砚影科技</a>
            <a href="https://www.bilibili.com/video/BV1x4XzBXEk9" target="_blank" rel="noopener noreferrer" class="sidebar-footer__link sidebar-footer__link--bilibili">📺 Bilibili</a>
        </div>
        <div class="sidebar-footer__meta">
            <span>MIT License Copyright (c) 2026 <a href="#" id="easter-egg-trigger" class="sidebar-footer__link sidebar-footer__link--easter-egg">猪的飞行梦</a></span>
            <span class="sidebar-footer__separator" aria-hidden="true">|</span>
            <span class="footer-version-label">${t('common.loading')}</span>
        </div>
    `;
    
    // 彩蛋触发
    const easterEggLink = footerContainer.querySelector('#easter-egg-trigger');
    if (easterEggLink) {
        easterEggLink.addEventListener('click', (e) => {
            e.preventDefault();
            const popup = window.open('', '_blank');
            if (!popup) return;
            import('../components/彩蛋动画引擎.js').then(mod => mod.openEasterEggPage(popup, {
                language: getLanguage(),
                title: t('easter.title'),
                hint: t('easter.hint'),
                speedLabel: t('easter.speed')
            })).catch(() => popup.close());
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
        if (versionLabel) versionLabel.textContent = formatVersionString(UI.DEFAULT_PROJECT_VERSION);
    });
    
    // 监听从设置页面触发的背景更新事件
    _onSidebarWindow("comfy-sidebar-bg-update", () => {
        _applySidebarBackground(container, BackgroundStore.load());
    });
    // =========================================================================

    let activeInlineView = null;
    let listNavigationGeneration = 0;
    const captureListNavigation = () => {
        const generation = listNavigationGeneration;
        return () => !activeInlineView && generation === listNavigationGeneration;
    };
    container._captureListNavigation = () => {
        const navigationCurrent = captureListNavigation();
        const renderToken = getRenderToken();
        const controls = Array.from(sortContainer.querySelectorAll('input, select'), control => [control, control.value]);
        const focusedElement = document.activeElement;
        return () => navigationCurrent() && renderToken === getRenderToken()
            && document.activeElement === focusedElement
            && controls.every(([control, value]) => control.value === value);
    };
    const releaseInlineView = () => {
        if (!activeInlineView) return;
        const view = activeInlineView;
        activeInlineView = null;
        try { view._cleanup?.(); }
        catch { console.warn('Sidebar inline view cleanup failed'); }
        try { cleanupImageSandbox(view); }
        finally { view.remove(); }
    };
    _sidebarInlineViewCleanup = releaseInlineView;

    const showInlineView = (viewDOM) => {
        listNavigationGeneration++;
        releaseInlineView();
        tabsContainer.style.display = "none";
        sortContainer.style.display = "none";
        contentBoxWrapper.style.display = "none";
        footerContainer.style.display = "none"; // 【核心】：打开详情/发布页时隐藏底部
        activeInlineView = viewDOM;
        container.appendChild(activeInlineView);
    };

    const hideInlineView = () => {
        listNavigationGeneration++;
        releaseInlineView();
        tabsContainer.style.display = "flex"; 
        sortContainer.style.display = "flex"; 
        contentBoxWrapper.style.display = "flex";
        footerContainer.style.display = "block"; // 【核心】：返回列表时恢复底部
        container._onListReturn?.();
    };

    _onSidebarWindow("comfy-route-view", (e) => {
        showInlineView(e.detail.view);
    });

    _onSidebarWindow("comfy-route-back", () => {
        hideInlineView();
    });

    _onSidebarWindow("comfy-open-detail", (e) => {
        const { itemData, currentUser } = e.detail;
        void openDetailView(itemData, currentUser);
    });

    const openInlineViewAfterLoad = async (prepareView, ownerCurrent) => {
        const matchesSession = captureRequestSession();
        const renderToken = getRenderToken();
        const loadingView = document.createElement('div');
        loadingView.className = 'hub-inline-load-state';
        const loadingMessage = document.createElement('span');
        loadingMessage.setAttribute('role', 'status');
        loadingMessage.setAttribute('aria-live', 'polite');
        loadingMessage.textContent = t('common.loading');
        const returnButton = document.createElement('button');
        returnButton.type = 'button';
        returnButton.className = 'ranking-publish-back';
        returnButton.textContent = t('common.back');
        const returnFocus = document.activeElement;
        loadingView.appendChild(loadingMessage);
        loadingView.appendChild(returnButton);
        loadingView._cleanup = () => { returnButton.onclick = null; };
        showInlineView(loadingView);
        const isCurrent = () => !sidebarDisposed && matchesSession() && ownerCurrent()
            && renderToken === getRenderToken()
            && activeInlineView === loadingView && loadingView.isConnected;
        returnButton.onclick = () => {
            if (activeInlineView !== loadingView || sidebarDisposed) return;
            hideInlineView();
            if (returnFocus?.isConnected) returnFocus.focus();
        };
        try {
            const createView = await prepareView(isCurrent);
            if (!isCurrent()) return;
            const view = createView();
            if (!isCurrent()) {
                try { view._cleanup?.(); }
                catch { console.warn('Unshown inline view cleanup failed'); }
                try { cleanupImageSandbox(view); }
                finally { view.remove(); }
                return;
            }
            showInlineView(view);
        } catch {
            if (isCurrent()) {
                loadingMessage.textContent = t('common.operation_failed');
                loadingMessage.setAttribute('role', 'alert');
                loadingMessage.setAttribute('aria-live', 'assertive');
            }
        } finally {
            if (activeInlineView === loadingView && !isCurrent()) hideInlineView();
        }
    };

    const openDetailView = async (itemData, currentUser) => {
        const account = currentUser?.account;
        const ownerCurrent = () => topNav.getCurrentUser()?.account === account;
        if (!ownerCurrent()) return;
        await openInlineViewAfterLoad(async () => {
            const createView = await loadDetailFactory();
            return () => createView(itemData, currentUser);
        }, ownerCurrent);
    };

    const openPublishView = async (kind, currentUser, editData = null, initialType) => {
        if (IS_WEB_MODE) return showToast(t('web.publish_not_supported'), 'warning');
        const account = currentUser?.account;
        const ownerCurrent = () => topNav.getCurrentUser()?.account === account;
        if (!account || !ownerCurrent()) return;
        await openInlineViewAfterLoad(async isCurrent => {
            let preparedData = editData;
            if (kind === 'resource' && editData) {
                const itemId = editData.id;
                const detailRes = await api.getItemById(itemId, { noStore: true });
                if (!isCurrent()) return;
                const data = detailRes?.data, revision = data?.edit_revision === undefined ? 0 : data.edit_revision;
                if (detailRes?.status !== 'success' || data?.id !== itemId || data?.author !== account
                    || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid edit detail');
                preparedData = { ...data, edit_revision: revision };
            }
            const createView = await loadPublishFactory(kind);
            if (!isCurrent()) return;
            return () => {
                let view;
                if (kind === 'resource') {
                    view = createView(currentUser,
                        () => { if (activeInlineView === view) hideInlineView(); },
                        () => { if (activeInlineView === view) { hideInlineView(); triggerLoad(true); } },
                        preparedData, initialType);
                } else {
                    view = createView(currentUser, preparedData);
                }
                return view;
            };
        }, ownerCurrent);
    };

    _onSidebarWindow("comfy-route-edit-publish", async (e) => {
        const { itemData, currentUser } = e.detail;
        await openPublishView('resource', currentUser, itemData);
    });

    // 监听进入任务编辑页面的请求
    _onSidebarWindow("comfy-route-edit-task", async (e) => {
        const { taskData, currentUser } = e.detail;
        await openPublishView('task', currentUser, taskData);
    });

    _onSidebarWindow("comfy-route-edit-post", async (e) => {
        const { postData, currentUser } = e.detail;
        await openPublishView('post', currentUser, postData);
    });

    _onSidebarWindow("comfy-route-edit-prompt", async (e) => {
        const { promptData, currentUser } = e.detail;
        await openPublishView('prompt', currentUser, promptData);
    });

    // 🔔 通知跳转：切换到对应Tab并展开指定卡片
    _onSidebarWindow("comfy-route-to-item", async (e) => {
        const detail = e.detail;
        if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return;
        const { itemId, itemType } = detail;
        if (!(typeof itemId === 'string' && itemId.trim()) &&
            !(Number.isSafeInteger(itemId) && itemId > 0)) return;
        
        // 1. 根据 itemType 确定 Tab
        let targetTab;
        if (itemType === "tool") targetTab = "tools";
        else if (itemType === "skill") targetTab = "skills";
        else if (itemType === "app") targetTab = "apps";
        else if (typeof itemType === 'string' && itemType.startsWith("recommend")) targetTab = "recommends";
        else targetTab = "tools"; // 兜底
        
        // 【问题2修复】如果已经在目标 Tab，先尝试在当前 DOM 中查找卡片
        if (currentTab === targetTab) {
            const existingCard = Array.from(contentArea.querySelectorAll('[data-item-id]'))
                .find(card => card.getAttribute('data-item-id') === String(itemId));
            if (existingCard) {
                // 关闭可能存在的通知中心等全屏视图
                if (activeInlineView) hideInlineView();
                
                const summary = existingCard.querySelector('.item-summary') || existingCard.firstElementChild;
                // 先确保卡片是折叠状态再展开（避免点击已展开的卡片把它收起来）
                scrollCardIntoView(existingCard);
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
            
            // 3. 同步选中态；视觉状态由共享主题 CSS 根据 aria-selected 绘制
            syncTabsA11y();
            
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
            isNavigationCurrent: captureListNavigation(),
            force: false,
            expandItemId: itemId  // 新增：要展开的卡片ID
        });
    });

    const savedTab = Store.load("activeTab", "tools");
    let currentTab = tabs.some(tab => tab.id === savedTab) ? savedTab : tabs[0].id;
    let currentSort = Store.load("activeSort", "time");
    let currentRenderToken = 0;
    let sidebarDisposed = false;
    let searchDebounce = null;
    const getRenderToken = () => currentRenderToken;
    _sidebarListCleanup = () => {
        sidebarDisposed = true;
        currentRenderToken++;
        try { searchDebounce?.cancel(); }
        finally {
            try { disposeSidebarContent(contentArea); }
            finally { cleanupImageSandbox(contentArea); }
        }
    };
    const syncTabsA11y = () => {
        const selectedTab = tabs.find(tab => tab.id === currentTab) || tabs[0];
        for (const tab of tabs) {
            const button = tabsContainer.querySelector(`[data-tab-id="${tab.id}"]`);
            if (!button) continue;
            const selected = tab.id === selectedTab.id;
            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
        }
        contentArea.setAttribute("aria-labelledby", `${sidebarInstanceId}-tab-${selectedTab.id}`);
    };

    const triggerLoad = (forceRefresh = false) => {
        if (sidebarDisposed) return;
        currentRenderToken++;
        loadSidebarContent({
            tab: currentTab, sort: currentSort,
            keyword: sortContainer.querySelector("#hub-search-input").value.trim().toLowerCase(),
            contentArea: contentArea, currentUser: topNav.getCurrentUser(),
            renderToken: currentRenderToken, getRenderToken: getRenderToken,
            isNavigationCurrent: captureListNavigation(),
            force: forceRefresh
        });
    };

    _onSidebarWindow("comfy-user-logout", triggerLoad);
    _onSidebarWindow("comfy-user-login", triggerLoad);
    
    // 监听子组件请求刷新列表
    _onSidebarWindow("comfy-trigger-sidebar-reload", (e) => { 
        triggerLoad(e.detail?.force ?? false); 
    });

    sortContainer.querySelector("#btn-open-publish").onclick = async () => {
        const currentUser = topNav.getCurrentUser();
        if (!currentUser) return showToast(t('auth.login_required'), 'warning');
        const kind = { tasks: 'task', posts: 'post', prompts: 'prompt' }[currentTab] || 'resource';
        await openPublishView(kind, currentUser, null, currentTab);
    };

    tabs.forEach(tab => {
        const btn = document.createElement("button");
        // 共享主题 CSS 从 aria-label 绘制伪元素文案，避免翻译插件改写标签。
        btn.className = "hub-tab-btn";
        btn.type = "button";
        btn.id = `${sidebarInstanceId}-tab-${tab.id}`;
        btn.dataset.tabId = tab.id;
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-controls", contentArea.id);
        btn.setAttribute("aria-label", tab.label);
        btn.onclick = () => {
            currentTab = tab.id; Store.save("activeTab", currentTab);
            sortContainer.querySelector("#hub-search-input").value = "";
            // 🎯 根据 Tab 切换筛选控件显示
            updateFilterVisibility(currentTab);
            syncTabsA11y();
            triggerLoad();
        };
        btn.addEventListener("keydown", (event) => {
            if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat
                || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
            const currentIndex = tabs.findIndex(item => item.id === tab.id);
            let nextIndex = currentIndex;
            if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
            else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = tabs.length - 1;
            else return;
            event.preventDefault();
            event.stopPropagation();
            const nextButton = tabsContainer.querySelector(`[data-tab-id="${tabs[nextIndex].id}"]`);
            nextButton?.focus();
            nextButton?.click();
        });
        tabsContainer.appendChild(btn);
    });
    syncTabsA11y();

    // 🎯 筛选控件显示切换函数
    const updateFilterVisibility = (tabId) => {
        const hubSortSelect = sortContainer.querySelector("#hub-sort-select");
        const taskStatusFilter = sortContainer.querySelector("#task-status-filter");
        const taskSortSelect = sortContainer.querySelector("#task-sort-select");
        const postsSortSelect = sortContainer.querySelector("#posts-sort-select");
        const promptsSortSelect = sortContainer.querySelector("#prompts-sort-select");
        const publishBtn = sortContainer.querySelector("#btn-open-publish");
        // 📱 Web 模式：发布按钮全程隐藏（初始化与切Tab均不恢复显示）
        const publishDisplay = IS_WEB_MODE ? "none" : "block";
        
        if (tabId === "tasks") {
            // 任务榜：隐藏通用排序，显示任务筛选
            hubSortSelect.style.display = "none";
            postsSortSelect.style.display = "none";
            promptsSortSelect.style.display = "none";
            taskStatusFilter.style.display = "block";
            taskSortSelect.style.display = "block";
            publishBtn.style.display = publishDisplay;
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
            publishBtn.style.display = publishDisplay;
        } else if (tabId === "prompts") {
            // 🧩 提示词：显示提示词排序，隐藏其他所有排序筛选
            hubSortSelect.style.display = "none";
            postsSortSelect.style.display = "none";
            promptsSortSelect.style.display = "block";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = publishDisplay;
        } else {
            // 其他Tab：显示通用排序，隐藏任务筛选和讨论区排序
            hubSortSelect.style.display = "block";
            postsSortSelect.style.display = "none";
            promptsSortSelect.style.display = "none";
            taskStatusFilter.style.display = "none";
            taskSortSelect.style.display = "none";
            publishBtn.style.display = publishDisplay;
            const ratingOpt = hubSortSelect.querySelector('option[value="rating"]');
            if (ratingOpt) ratingOpt.style.display = "";
        }
    };
    
    // 初始化筛选控件显示状态
    updateFilterVisibility(currentTab);

    sortContainer.querySelector("#hub-sort-select").value = currentSort;
    sortContainer.querySelector("#hub-sort-select").onchange = (e) => { currentSort = e.target.value; Store.save("activeSort", currentSort); triggerLoad(); };
    
    // 🔍 搜索防抖：300ms 延迟，避免每次按键都发起网络请求
    searchDebounce = debounce(() => {
        triggerLoad();
    }, 300);
    sortContainer.querySelector("#hub-search-input").oninput = () => {
        if (!sidebarDisposed) searchDebounce();
    };
    
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

