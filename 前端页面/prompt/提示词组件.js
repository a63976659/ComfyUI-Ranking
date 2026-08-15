// ==========================================
// 🧩 提示词组件（小红书风格瀑布流列表）
// ==========================================
// 功能：图像/视频/音乐三模块、分类筛选、瀑布流展示提示词封面
//       （分类的添加/删除由云端管理界面统一管理）
// 性能优化：
//   - 本地缓存优先读取
//   - 骨架屏加载动画
//   - 动态分页加载
// 关联文件：
//   - 提示词详情组件.js (点击进入详情)
//   - 发布提示词组件.js (发布入口)
//   - 网络请求API.js (数据获取)
//   - 性能优化工具.js (缓存/骨架屏)
// ==========================================

import { api, proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { setCache, getCache, createPaginationLoader, lazyLoadImages } from "../components/性能优化工具.js";
import { applyCardAnimation } from "../components/动画音效引擎.js";
import { t, tIfExists } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR } from "../core/全局配置.js";

// 缓存配置
const CACHE_KEY_PREFIX = "PromptsCache";
function getCacheTTL() {
    try {
        const s = localStorage.getItem('ComfyCommunity_Settings');
        if (s) { const v = parseInt(JSON.parse(s).cacheExpireSeconds); if (v >= 60 && v <= 86400) return v * 1000; }
    } catch(e) {}
    return 1000 * 60 * 30;  // 默认30分钟
}
const PAGE_SIZE = 20;

// 缓存当前用户
let currentUserCache = null;

// 🔧 修复内存泄漏：保存当前筛选事件监听器引用，以便在重新创建时移除
let currentFilterHandler = null;

// 🔧 自动分页器引用（用于组件切换时清理）
let currentPaginator = null;

// 分类数据缓存（避免重复请求）
let categoriesCache = null;

/**
 * 🔍 判断提示词是否匹配搜索关键词
 */
function _matchesSearch(prompt, keyword) {
    if (!keyword) return true;
    const tagsStr = Array.isArray(prompt.tags) ? prompt.tags.join(' ') : '';
    const text = `${prompt.title||''} ${prompt.content||''} ${prompt.category||''} ${prompt.author||''} ${tagsStr}`.toLowerCase();
    return text.includes(keyword);
}

/**
 * 🏷️ 分类双语显示（内置分类翻译，自定义分类原样）
 */
function _catLabel(name) {
    return tIfExists('promptcat.' + name, name);
}

/**
 * 📭 渲染空状态 HTML（无提示词时的占位内容）
 */
function _renderEmptyState() {
    return `
        <div style="grid-column: span 2; text-align: center; padding: 60px 20px; color: #666;">
            <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">🧩</div>
            <div style="font-size: 14px; margin-bottom: 8px;">${t('prompt.no_prompts')}</div>
            <div style="font-size: 12px; color: #888;">${t('prompt.be_first')}</div>
        </div>
    `;
}

/**
 * 🖼️ 生成头像 HTML 字符串
 */
function _generateAvatarHtml(avatar, name, size) {
    const initial = (name || 'U')[0].toUpperCase();
    if (avatar) {
        return `<img class="swr-avatar" src="${avatar}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; border: 1px solid #444; background: #333;">`;
    }
    const fontSize = Math.max(9, Math.round(size * 0.5));
    return `<div class="swr-avatar" style="width: ${size}px; height: ${size}px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: ${fontSize}px; font-weight: bold;">${initial}</div>`;
}

/**
 * 🧩 创建提示词视图
 */
export function createPromptsView(currentUser, keyword = "") {
    // 清理旧分页器
    if (currentPaginator) {
        currentPaginator.stop();
        currentPaginator = null;
    }

    currentUserCache = currentUser;
    const searchKeyword = (keyword || "").substring(0, 100).toLowerCase();

    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        color: "#ccc",
        fontSize: "14px",
        padding: "0",
        overflowY: "auto",
        flex: "1",
        boxSizing: "border-box"
    });

    container.innerHTML = `
        <!-- 🎨 模块切换（图像/视频/音乐） -->
        <div id="prompt-type-tabs" style="display: flex; gap: 8px; padding: 12px 15px 0 15px;">
            <button class="prompt-type-tab" data-type="image" style="flex: 1; padding: 10px 0; border-radius: 8px; border: 1px solid #555; background: var(--comfy-input-bg); color: #fff; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                🎨 ${t('prompt.tab_image')}
            </button>
            <button class="prompt-type-tab" data-type="video" style="flex: 1; padding: 10px 0; border-radius: 8px; border: 1px solid #555; background: var(--comfy-input-bg); color: #fff; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                🎬 ${t('prompt.tab_video')}
            </button>
            <button class="prompt-type-tab" data-type="music" style="flex: 1; padding: 10px 0; border-radius: 8px; border: 1px solid #555; background: var(--comfy-input-bg); color: #fff; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                🎵 ${t('prompt.tab_music')}
            </button>
        </div>

        <!-- 🏷️ 分类选择条（换行自适应侧边栏宽度） -->
        <div id="prompt-category-bar" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 15px 0 15px; flex-shrink: 0;">
            <div style="color: #888; font-size: 12px; padding: 6px 0;">⏳</div>
        </div>

        <!-- 🎯 瀑布流容器 -->
        <div id="prompts-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 15px; overflow-y: auto; flex: 1;">
            <div id="prompts-loading" style="grid-column: span 2; text-align: center; padding: 40px; color: #888;">
                <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
                ${t('prompt.loading')}
            </div>
        </div>

        <!-- 加载更多 -->
        <div id="load-more-wrapper" style="display: none; padding: 15px; text-align: center; border-top: 1px solid var(--border-color, #333);">
            <button id="btn-load-more" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='var(--comfy-input-bg)'">
                ${t('post.load_more')}
            </button>
        </div>
    `;

    // 🔌 状态与元素引用
    let currentPage = 1;
    let currentSort = "latest";
    let currentType = "image";      // 当前模块：image / video / music
    let currentCategory = null;     // 当前分类（null = 全部）
    let allPromptsData = [];        // 全量数据缓存
    let isLoadingFromNetwork = false;

    const promptsGrid = container.querySelector("#prompts-grid");
    const loadMoreWrapper = container.querySelector("#load-more-wrapper");
    const loadMoreBtn = container.querySelector("#btn-load-more");
    const categoryBar = container.querySelector("#prompt-category-bar");

    // 获取缓存Key（包含模块/分类/排序参数）
    const getCacheKey = () => `${CACHE_KEY_PREFIX}_${currentType}_${currentCategory || 'all'}_${currentSort}`;

    // 🎨 模块切换样式
    const applyTypeTabStyles = () => {
        container.querySelectorAll(".prompt-type-tab").forEach(btn => {
            const active = btn.dataset.type === currentType;
            btn.style.background = active ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "var(--comfy-input-bg)";
            btn.style.borderColor = active ? "#764ba2" : "#555";
        });
    };

    // 🏷️ 渲染分类选择条（全部 + 分类；增删由云端管理界面管理）
    const renderCategoryBar = (categories) => {
        categoryBar.innerHTML = "";
        const allChip = _createCategoryChip(t('prompt.category_all'), null, currentCategory === null);
        categoryBar.appendChild(allChip);

        (categories || []).forEach(cat => {
            categoryBar.appendChild(_createCategoryChip(_catLabel(cat), cat, currentCategory === cat));
        });
    };

    // 🏷️ 单个分类 chip
    const _createCategoryChip = (label, value, active) => {
        const chip = document.createElement("button");
        chip.textContent = label;
        Object.assign(chip.style, {
            flexShrink: "0",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            padding: "6px 14px",
            borderRadius: "16px",
            border: `1px solid ${active ? "#764ba2" : "#555"}`,
            background: active ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "var(--comfy-input-bg)",
            color: "#fff",
            fontSize: "12px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "0.2s"
        });
        chip.onclick = () => {
            if (currentCategory === value) return;
            currentCategory = value;
            currentPage = 1;
            allPromptsData = [];
            resetPagination();
            loadCategoriesAndReload();
        };
        return chip;
    };

    // 📥 加载分类并刷新列表
    const loadCategoriesAndReload = async () => {
        try {
            const res = await api.getPromptCategories(currentType);
            categoriesCache = { type: currentType, list: res.data || res || [] };
        } catch (err) {
            console.warn("加载提示词分类失败:", err);
            if (!categoriesCache || categoriesCache.type !== currentType) {
                categoriesCache = { type: currentType, list: [] };
            }
        }
        renderCategoryBar(categoriesCache.list);
        loadPrompts(1);
    };

    // 🚀 自动分页加载回调
    const loadMorePrompts = async (page, pageSize) => {
        try {
            isLoadingFromNetwork = true;
            const res = await api.getPrompts(currentType, currentCategory, page, pageSize, currentSort);
            const prompts = res.data || [];
            isLoadingFromNetwork = false;

            if (prompts.length === 0) return [];

            allPromptsData = [...allPromptsData, ...proxyImages(prompts)];

            // 搜索过滤
            let displayPrompts = prompts.filter(p => _matchesSearch(p, searchKeyword));

            // 渲染卡片
            displayPrompts.forEach(p => {
                promptsGrid.appendChild(createPromptCard(p));
            });

            // 图片懒加载
            lazyLoadImages(promptsGrid);

            return prompts;
        } catch (err) {
            console.error("分页加载提示词失败:", err);
            isLoadingFromNetwork = false;
            return null;  // 返回 null 表示加载失败（区别于空数组表示没有更多数据）
        }
    };

    // 🚀 启动自动分页
    const startAutoPagination = () => {
        if (currentPaginator) {
            currentPaginator.stop();
        }

        const scrollContainer = container.closest('.sidebar-scroll-container') || container;

        currentPaginator = createPaginationLoader({
            container: scrollContainer,
            loadMore: loadMorePrompts,
            pageSize: PAGE_SIZE,
            threshold: 200
        });

        currentPaginator.start();

        // 隐藏原有加载更多按钮
        loadMoreWrapper.style.display = "none";
    };

    // 🚀 重置分页器（切换模块/分类/排序时）
    const resetPagination = () => {
        if (currentPaginator) {
            currentPaginator.reset();
        }
    };

    // 排序字段映射（简单字段排序）
    const SORT_FIELDS = {
        likes: 'likes', favorites: 'favorites', views: 'views', daily_views: 'daily_views'
    };

    // 🔄 本地排序函数
    const sortPromptsLocally = (prompts, sortBy) => {
        const sorted = [...prompts]; // 不修改原数组
        const field = SORT_FIELDS[sortBy];
        if (field) {
            sorted.sort((a, b) => (b[field] || 0) - (a[field] || 0));
            return sorted;
        }
        // latest
        sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        return sorted;
    };

    // 🎯 监听外部筛选变化事件（侧边栏排序下拉）
    const handleFilterChange = (e) => {
        const { sort } = e.detail;
        if (sort) {
            currentSort = sort;
            currentPage = 1;

            // 🚀 重置分页器
            resetPagination();

            // 🚀 本地排序优先：已有数据时直接本地排序渲染
            if (allPromptsData.length > 0) {
                const sorted = sortPromptsLocally(allPromptsData, currentSort);
                renderPromptsFromCache(sorted);
                // 后台静默刷新最新数据
                silentRefresh();
            } else {
                // 无数据时走正常网络加载
                loadPrompts(1, false);
            }
        }
    };

    // 🔧 修复内存泄漏：先移除旧的监听器，再添加新的
    if (currentFilterHandler) {
        window.removeEventListener("comfy-prompts-filter-change", currentFilterHandler);
    }
    currentFilterHandler = handleFilterChange;
    window.addEventListener("comfy-prompts-filter-change", handleFilterChange);

    // 监听外部刷新事件（详情页互动后通知列表刷新）
    const refreshHandler = () => {
        if (allPromptsData.length > 0) {
            const sorted = sortPromptsLocally(allPromptsData, currentSort);
            renderPromptsFromCache(sorted);
        }
        silentRefresh();
    };
    window.addEventListener("comfy-prompts-refresh", refreshHandler);

    // 显示骨架屏
    const showSkeleton = () => {
        promptsGrid.innerHTML = "";
        for (let i = 0; i < 4; i++) {
            const skeletonCard = document.createElement("div");
            skeletonCard.style.cssText = "background: var(--comfy-input-bg); border-radius: 10px; overflow: hidden; animation: pulse 1.5s infinite;";
            skeletonCard.innerHTML = `
                <div style="width: 100%; padding-top: 120%; background: linear-gradient(90deg, #2a2a2a 25%, #333 50%, #2a2a2a 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                <div style="padding: 10px;">
                    <div style="height: 14px; background: #333; border-radius: 4px; margin-bottom: 8px;"></div>
                    <div style="height: 12px; background: #333; border-radius: 4px; width: 60%;"></div>
                </div>
            `;
            promptsGrid.appendChild(skeletonCard);
        }
        if (!document.getElementById("prompts-skeleton-style")) {
            const style = document.createElement("style");
            style.id = "prompts-skeleton-style";
            style.textContent = `
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
            `;
            document.head.appendChild(style);
        }
    };

    const loadPrompts = async (page = 1, append = false) => {
        const cacheKey = getCacheKey();

        // ✅ 优先从本地缓存读取
        if (!append && page === 1) {
            const cachedData = getCache(cacheKey);
            if (cachedData && cachedData.length > 0) {
                allPromptsData = proxyImages(cachedData);
                renderPromptsFromCache(allPromptsData);
                // 后台静默更新
                silentRefresh();
                return;
            }
        }

        try {
            if (!append) {
                showSkeleton();
            }

            isLoadingFromNetwork = true;
            const res = await api.getPrompts(currentType, currentCategory, page, PAGE_SIZE, currentSort);
            const prompts = res.data || [];
            const total = res.total || 0;
            isLoadingFromNetwork = false;

            // 缓存第一页数据
            if (page === 1) {
                allPromptsData = proxyImages(prompts);
                setCache(cacheKey, prompts, getCacheTTL(), true);
            } else {
                allPromptsData = [...allPromptsData, ...proxyImages(prompts)];
            }

            if (!append) {
                promptsGrid.innerHTML = "";
            }

            // 🔍 搜索过滤
            let displayPrompts = prompts.filter(p => _matchesSearch(p, searchKeyword));

            if (displayPrompts.length === 0 && page === 1) {
                promptsGrid.innerHTML = _renderEmptyState();
                loadMoreWrapper.style.display = "none";
                return;
            }

            // 渲染卡片
            const cards = [];
            displayPrompts.forEach(p => {
                const card = createPromptCard(p);
                cards.push(card);
                promptsGrid.appendChild(card);
            });

            // ✨ 应用堆积下坠动画（仅首次加载；prompts-grid 的 overflow-y:auto 会裁剪坠落起始段，卡片从容器上沿内侧滑入）
            if (!append && page === 1) {
                const visibleCount = Math.min(cards.length, 8);
                cards.forEach((card, index) => {
                    applyCardAnimation(card, 'tetris', index, visibleCount);
                });
            }

            // 🚀 图片懒加载
            lazyLoadImages(promptsGrid);

            // 🚀 启动自动分页（首屏加载完成后）
            if (!append && page === 1) {
                startAutoPagination();
            }

            // 显示/隐藏加载更多（基于过滤后的数据）
            const loadedCount = page * PAGE_SIZE;
            const filteredTotal = searchKeyword ? displayPrompts.length : total;
            if (loadedCount < filteredTotal) {
                loadMoreWrapper.style.display = "block";
            } else {
                loadMoreWrapper.style.display = "none";
            }

        } catch (err) {
            console.error("加载提示词失败:", err);
            isLoadingFromNetwork = false;
            // 网络失败时尝试从缓存读取
            if (!append) {
                const cachedData = getCache(cacheKey);
                if (cachedData && cachedData.length > 0) {
                    allPromptsData = proxyImages(cachedData);
                    renderPromptsFromCache(allPromptsData);
                    showToast(t('prompt.network_cache'), "warning");
                } else {
                    promptsGrid.innerHTML = `
                        <div style="grid-column: span 2; text-align: center; padding: 40px; color: #F44336;">
                            <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                            ${t('prompt.load_failed')}
                        </div>
                    `;
                }
            }
        }
    };

    // 从缓存渲染提示词列表
    const renderPromptsFromCache = (prompts) => {
        promptsGrid.innerHTML = "";

        // 🔍 搜索过滤
        const filteredPrompts = prompts.filter(p => _matchesSearch(p, searchKeyword));

        if (filteredPrompts.length === 0) {
            promptsGrid.innerHTML = _renderEmptyState();
            loadMoreWrapper.style.display = "none";
            return;
        }

        // 渲染第一页
        const firstPage = filteredPrompts.slice(0, PAGE_SIZE);
        const cards = [];
        firstPage.forEach(p => {
            const card = createPromptCard(p);
            cards.push(card);
            promptsGrid.appendChild(card);
        });

        // ✨ 应用堆积下坠动画
        const visibleCount = Math.min(cards.length, 8);
        cards.forEach((card, index) => {
            applyCardAnimation(card, 'tetris', index, visibleCount);
        });

        // 🚀 图片懒加载
        lazyLoadImages(promptsGrid);

        // 🚀 启动自动分页
        startAutoPagination();

        // 显示加载更多
        if (filteredPrompts.length > PAGE_SIZE) {
            loadMoreWrapper.style.display = "block";
        } else {
            loadMoreWrapper.style.display = "none";
        }
    };

    // 后台静默更新
    const silentRefresh = async () => {
        if (isLoadingFromNetwork) return;

        try {
            isLoadingFromNetwork = true;
            const res = await api.getPrompts(currentType, currentCategory, 1, PAGE_SIZE, currentSort);
            const prompts = res.data || [];
            isLoadingFromNetwork = false;

            // 更新缓存
            const cacheKey = getCacheKey();
            setCache(cacheKey, prompts, getCacheTTL(), true);

            // 对比新旧数据，有变化时重新渲染
            if (_promptsDataChanged(allPromptsData, prompts)) {
                console.log(`✅ 提示词 ${currentType}/${currentSort} 检测到新数据，执行静默更新`);
                allPromptsData = proxyImages(prompts);
                renderPromptsFromCache(allPromptsData);
            } else {
                allPromptsData = proxyImages(prompts);
            }
        } catch (err) {
            isLoadingFromNetwork = false;
            console.warn("后台更新失败:", err);
        }
    };

    /** 对比提示词数据是否有变化 */
    const _promptsDataChanged = (oldData, newData) => {
        if (!oldData || !newData) return true;
        if (oldData.length !== newData.length) return true;
        const checkCount = Math.min(10, oldData.length);
        const COMPARE_FIELDS = ['likes', 'favorites', 'views', 'daily_views', 'comments'];
        for (let i = 0; i < checkCount; i++) {
            if ((oldData[i].id) !== (newData[i].id)) return true;
            for (const f of COMPARE_FIELDS) {
                if ((oldData[i][f] || 0) !== (newData[i][f] || 0)) return true;
            }
        }
        return false;
    };

    // 🎨 模块切换（图像/视频/音乐）
    container.querySelectorAll(".prompt-type-tab").forEach(btn => {
        btn.onclick = () => {
            if (btn.dataset.type === currentType) return;
            currentType = btn.dataset.type;
            currentCategory = null;
            currentPage = 1;
            allPromptsData = [];
            applyTypeTabStyles();
            resetPagination();
            loadCategoriesAndReload();
        };
    });

    // 加载更多按钮
    loadMoreBtn.onclick = () => {
        currentPage++;
        loadPrompts(currentPage, true);
    };

    // 初始加载
    applyTypeTabStyles();
    loadCategoriesAndReload();

    // 🔧 组件生命周期清理方法
    container._cleanup = () => {
        // 清理筛选事件监听器
        if (currentFilterHandler) {
            window.removeEventListener("comfy-prompts-filter-change", currentFilterHandler);
            currentFilterHandler = null;
        }
        // 清理刷新事件监听器
        window.removeEventListener("comfy-prompts-refresh", refreshHandler);
        // 如果有分页器，停止它
        if (currentPaginator) {
            currentPaginator.stop();
            currentPaginator = null;
        }
    };

    return container;
}

/**
 * 🎴 创建单个提示词卡片（小红书风格）
 */
function createPromptCard(prompt) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        background: "var(--comfy-menu-bg)",
        borderRadius: "8px",
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        border: "1px solid var(--border-color, #333)"
    });

    // 格式化时间
    const timeStr = formatTime(prompt.created_at);

    // 判断是否为视频封面
    const isVideo = prompt.media_type === "video";

    // 价格徽标：免费绿色 / 💎价格金色
    const priceHtml = (prompt.price > 0)
        ? `<span style="background: linear-gradient(135deg, #FFD700, #FFA000); color: #333; font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 10px;">💎 ${prompt.price}</span>`
        : `<span style="background: rgba(76, 175, 80, 0.25); color: #4CAF50; font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(76, 175, 80, 0.5);">${t('prompt.free')}</span>`;

    card.innerHTML = `
        <!-- 封面图 -->
        <div style="position: relative; width: 100%; padding-top: 100%; background: #111;">
            <img src="${prompt.cover_image || 'data:image/svg+xml,...'}" 
                 style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23222%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%22100%22 y=%22100%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2224%22%3E🖼️%3C/text%3E%3C/svg%3E'">
            ${isVideo ? `
            <!-- 视频播放按钮 -->
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        width: 48px; height: 48px; background: rgba(0,0,0,0.6); border-radius: 50%;
                        display: flex; align-items: center; justify-content: center; pointer-events: none;">
                <div style="width: 0; height: 0; border-left: 16px solid rgba(255,255,255,0.9);
                            border-top: 10px solid transparent; border-bottom: 10px solid transparent;
                            margin-left: 4px;"></div>
            </div>
            ` : ''}
            <!-- 价格徽标 -->
            <div style="position: absolute; top: 8px; right: 8px; pointer-events: none;">
                ${priceHtml}
            </div>
            <!-- 🔒 付费锁标识 -->
            ${prompt.price > 0 ? `
            <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; pointer-events: none;">🔒</div>
            ` : ''}
        </div>
        
        <!-- 内容区 -->
        <div style="padding: 10px;">
            <!-- 标题 -->
            <div style="font-size: 13px; font-weight: 500; color: #fff; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
                ${escapeHtml(prompt.title)}
            </div>
            
            <!-- 分类标签 -->
            <div style="margin-bottom: 6px;">
                <span style="display: inline-block; background: rgba(118, 75, 162, 0.25); border: 1px solid rgba(118, 75, 162, 0.5); color: #CE93D8; font-size: 10px; padding: 2px 8px; border-radius: 10px;">${escapeHtml(_catLabel(prompt.category || ''))}</span>
                ${(Array.isArray(prompt.tags) && prompt.tags.length) ? prompt.tags.slice(0, 3).map(tag => `<span style="display: inline-block; background: rgba(0,188,212,0.12); border: 1px solid rgba(0,188,212,0.35); color: #4DD0E1; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 4px;">#${escapeHtml(tag)}</span>`).join('') : ''}
            </div>
            
            <!-- 作者信息（SWR 缓存头像） -->
            <div id="prompt-author-${prompt.id}" style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;"></div>
            
            <!-- 互动数据 -->
            <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: #888;">
                <span>❤️ ${prompt.likes || 0}</span>
                <span>🔖 ${prompt.favorites || 0}</span>
                <span>🔥 ${prompt.views || 0}</span>
                <span style="margin-left: auto; font-size: 10px;">${timeStr}</span>
            </div>
        </div>
    `;

    // 🚀 SWR 头像渲染：先从缓存读取，后台静默校对
    setTimeout(() => {
        const authorContainer = card.querySelector(`#prompt-author-${prompt.id}`);
        if (!authorContainer) return;

        const account = prompt.author;
        const cached = getCachedProfile(account);
        const avatar = cached?.avatar || '';
        const name = cached?.name || account || '';

        // 渲染初始头像
        const avatarHtml = _generateAvatarHtml(avatar, name, 18);

        authorContainer.innerHTML = `${avatarHtml}<span class="swr-name" style="font-size: 11px; color: #999; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</span>`;

        // 后台静默校对
        getProfileWithSWR(account, api.getUserProfile, (profile) => {
            const avatarEl = authorContainer.querySelector('.swr-avatar');
            const nameEl = authorContainer.querySelector('.swr-name');
            if (avatarEl && profile.avatar) {
                if (avatarEl.tagName === 'IMG') {
                    avatarEl.src = profile.avatar;
                } else {
                    avatarEl.outerHTML = _generateAvatarHtml(profile.avatar, profile.name || name, 18);
                }
            }
            if (nameEl && profile.name) {
                nameEl.textContent = profile.name;
            }
        });
    }, 0);

    // 悬停效果
    card.onmouseover = () => {
        card.style.transform = "translateY(-2px)";
        card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    };
    card.onmouseout = () => {
        card.style.transform = "translateY(0)";
        card.style.boxShadow = "none";
    };

    // 点击进入详情
    card.onclick = () => {
        import("./提示词详情组件.js").then(module => {
            const view = module.createPromptDetailView(prompt.id, currentUserCache);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        });
    };

    return card;
}

/**
 * 🕐 格式化时间
 */
function formatTime(timestamp) {
    if (!timestamp) return "";

    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return t('time.just_now');
    if (diff < 3600) return t('time.minutes_ago', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('time.hours_ago', { n: Math.floor(diff / 3600) });
    if (diff < 604800) return t('time.days_ago', { n: Math.floor(diff / 86400) });

    const date = new Date(timestamp * 1000);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 🔒 HTML转义
 */
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}
