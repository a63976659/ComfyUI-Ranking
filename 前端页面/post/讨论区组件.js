import { captureListRead } from "../core/榜单数据来源.js";
// 前端页面/post/讨论区组件.js
// ==========================================
// 💬 讨论区组件（小红书风格瀑布流列表）
// ==========================================
// 功能：瀑布流展示帖子封面、标题、作者、点赞数
// 性能优化：
//   - 本地缓存优先读取
//   - 骨架屏加载动画
//   - 动态分页加载
// 关联文件：
//   - 帖子详情组件.js (点击进入详情)
//   - 发布帖子组件.js (发布入口)
//   - 网络请求API.js (数据获取)
//   - 性能优化工具.js (缓存/骨架屏)
// ==========================================

import { createCardNavigationScope } from "../components/卡片导航生命周期.js";
import { api, captureRequestSession } from "../core/网络请求API.js";
import { proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { readListCache, isEmptyListRefreshWithExistingData, createSkeleton, createPaginationLoader, lazyLoadImages, renderListLoadError, renderListSearchMessage } from "../components/性能优化工具.js";
import { applyViewportAnimations, stopViewportAnimations } from "../components/动画音效引擎.js";
import { t } from "../components/用户体验增强.js";
import { API, CACHE, getCachedProfile, getProfileWithSWR, normalizeProfileImageUrl } from "../core/全局配置.js";
import { createRatingStars } from "../social/评论与互动组件.js";
import { escapeHtml, formatTime, getCacheTTL } from "../components/互动工具函数.js";  // 🧹 P2归一：局部副本已移除

// 缓存配置
const CACHE_KEY_PREFIX = CACHE.PUBLIC_LISTS.posts.prefix.slice(0, -1);
const PAGE_SIZE = 20;

// 缓存当前用户
let currentUserCache = null;

// 排序选项
const SORT_OPTIONS = [
    { value: "latest", label: "最新" },
    { value: "likes", label: "最多点赞" },
    { value: "favorites", label: "最多收藏" },
    { value: "views", label: "🔥 浏览总量" },
    { value: "daily_views", label: "🔥 今日热门" }
];

// 🔧 修复内存泄漏：保存当前筛选事件监听器引用，以便在重新创建时移除
let currentFilterHandler = null;

// 当前视图清理入口；分页器由各视图实例持有。
let activeViewCleanup = null;

/**
 * 🔍 判断帖子是否匹配搜索关键词
 */
function _matchesSearch(post, keyword) {
    if (!keyword) return true;
    const text = `${post.title||''} ${post.content||''} ${post.author_name||''} ${post.author||''}`.toLowerCase();
    return text.includes(keyword);
}

/**
 * 📭 渲染空状态 HTML（无帖子时的占位内容）
 */
function _renderEmptyState(t) {
    return `
        <div class="posts-empty" role="status">
            <div class="posts-empty__icon" aria-hidden="true">📝</div>
            <div class="posts-empty__title">${t('post.no_posts')}</div>
            <div class="posts-empty__hint">${t('post.be_first')}</div>
        </div>
    `;
}

/**
 * 🖼️ 生成头像 HTML 字符串
 * @param {string} avatar - 头像 URL
 * @param {string} name - 用户名（用于首字母回退）
 */
function _generateAvatarHtml(avatar, name) {
    avatar = normalizeProfileImageUrl(avatar);
    const initial = (name || 'U')[0].toUpperCase();
    if (avatar) {
        return `<img class="swr-avatar posts-card__avatar" alt="" src="${escapeHtml(avatar)}">`;
    }
    return `<div class="swr-avatar posts-card__avatar posts-card__avatar--initial" aria-hidden="true">${escapeHtml(initial)}</div>`;
}

/**
 * 💬 创建讨论区视图
 */
export function createPostsView(currentUser, keyword = "", { sort: initialSort = "latest", force: initialForce = false } = {}) {
    if (activeViewCleanup) activeViewCleanup();
    
    currentUserCache = currentUser;
    const searchKeyword = (keyword || "").substring(0, 100).toLowerCase();
    
    const container = document.createElement("div");
    container.className = "posts-view";
    
    container.innerHTML = `
        <!-- 🎯 瀑布流容器（发布按钮已移至顶部统一发布按钮） -->
        <div id="posts-grid" class="posts-grid">
            <!-- 加载占位 -->
            <div id="posts-loading" class="posts-loading" role="status">
                <div class="posts-loading__icon" aria-hidden="true">⏳</div>
                ${t('post.loading')}
            </div>
        </div>
        
        <!-- 加载更多 -->
        <div id="load-more-wrapper" class="posts-more" style="display: none;">
            <button type="button" id="btn-load-more" class="posts-more__button">
                ${t('post.load_more')}
            </button>
        </div>
    `;
    
    // 🔌 绑定事件
    
    // 加载帖子数据
    let currentSort = initialSort;
    let allPostsData = [];  // 全量数据缓存
    let isLoadingFromNetwork = false;
    let listViewGeneration = 0;
    let networkRequestGeneration = 0;
    let disposed = false;
    let firstPageReady = false;
    let forceRefreshPending = initialForce === true;
    const cardNavigation = createCardNavigationScope(window, () => !disposed, {
        captureSession: captureRequestSession,
        storageKeys: [CACHE.LEGACY_KEYS.TOKEN, CACHE.LEGACY_KEYS.USER]
    });
    let currentPaginator = null;
    const postsGrid = container.querySelector("#posts-grid");
    const loadMoreWrapper = container.querySelector("#load-more-wrapper");
    const loadMoreBtn = container.querySelector("#btn-load-more");
    
    // 🚀 自动分页加载回调
    const loadMorePosts = async (page, pageSize, { isCurrent = () => true } = {}) => {
        if (disposed || !isCurrent()) return [];
        try {
            const readResponse = captureListRead(`${CACHE_KEY_PREFIX}_${currentSort}`);
            const res = await api.getPosts(page, pageSize, currentSort);
            if (disposed || !isCurrent()) return [];
            const responseData = readResponse(res);
            const posts = responseData.data;
            
            if (posts.length === 0) {
                if (searchKeyword && !allPostsData.some(post => _matchesSearch(post, searchKeyword))) {
                    renderListSearchMessage(postsGrid, t('pagination.search_empty'));
                } else {
                    postsGrid.querySelector('.list-search-message')?.remove();
                }
                return [];
            }
            
            allPostsData = [...allPostsData, ...proxyImages(posts)];
            
            // 搜索过滤
            let displayPosts = posts.filter(post => _matchesSearch(post, searchKeyword));
            
            // 渲染帖子卡片
            const newCards = [];
            displayPosts.forEach(post => {
                postsGrid.querySelector('.list-search-message')?.remove();
                const card = createPostCard(post, currentUser, () => !disposed, cardNavigation.capture);
                newCards.push(card);
                postsGrid.appendChild(card);
            });
            
            // ✨ 视口感知动画：追加卡片复用同一观察器
            if (newCards.length > 0) {
                applyViewportAnimations(postsGrid, newCards, 'abyss', false);
            }
            
            // 图片懒加载
            lazyLoadImages(postsGrid);
            
            return posts;
        } catch (err) {
            if (disposed || !isCurrent()) return [];
            console.error("分页加载帖子失败");
            postsGrid.querySelector('.list-search-message')?.remove();
            return null;  // 返回 null 表示加载失败（区别于空数组表示没有更多数据）
        }
    };
    
    // 🚀 启动自动分页
    const startAutoPagination = () => {
        if (disposed) return;
        if (currentPaginator) {
            currentPaginator.stop();
        }
        
        const scrollContainer = container.closest('.sidebar-scroll-container') || container;
        
        currentPaginator = createPaginationLoader({
            container: scrollContainer,
            focusContainer: postsGrid,
            canLoad: () => !disposed && firstPageReady && !isLoadingFromNetwork,
            loadMore: loadMorePosts,
            pageSize: PAGE_SIZE,
            threshold: 200,
            autoFill: () => Boolean(searchKeyword) && !allPostsData.some(post => _matchesSearch(post, searchKeyword)),
            t
        });
        
        currentPaginator.start();
        
        // 隐藏原有加载更多按钮
        loadMoreWrapper.style.display = "none";
    };
    
    // 获取缓存Key（包含排序参数）
    const getCacheKey = () => `${CACHE_KEY_PREFIX}_${currentSort}`;
    
    // 排序字段映射（简单字段排序，特殊逻辑单独处理）
    const SORT_FIELDS = {
        likes: 'likes', favorites: 'favorites', views: 'views', daily_views: 'daily_views'
    };

    // 🔄 本地排序函数
    const sortPostsLocally = (posts, sortBy) => {
        const sorted = [...posts]; // 不修改原数组
        const field = SORT_FIELDS[sortBy];
        if (field) {
            sorted.sort((a, b) => (b[field] || 0) - (a[field] || 0));
            return sorted;
        }
        switch (sortBy) {
            case "tips":
                sorted.sort((a, b) => {
                    const sumA = (a.tip_board || []).reduce((s, t) => s + (t.amount || 0), 0);
                    const sumB = (b.tip_board || []).reduce((s, t) => s + (t.amount || 0), 0);
                    return sumB - sumA;
                });
                break;
            case "rating":
                sorted.sort((a, b) => {
                    const ra = a.rating_avg || 0;
                    const rb = b.rating_avg || 0;
                    if (ra === rb) return (b.rating_count || 0) - (a.rating_count || 0);
                    return rb - ra;
                });
                break;
            default: // latest
                sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                break;
        }
        return sorted;
    };
    
    // 🎯 监听外部筛选变化事件（与任务榜保持一致）
    const handleFilterChange = (e) => {
        if (disposed) return;
        const { sort } = e.detail;
        if (sort) {
            listViewGeneration++;
            currentSort = sort;
            
            // 🚀 重置分页器
            if (currentPaginator) {
                currentPaginator.reset();
            }
            
            // 🚀 本地排序优先：已有数据时直接本地排序渲染
            if (allPostsData.length > 0) {
                const sorted = sortPostsLocally(allPostsData, currentSort);
                renderPostsFromCache(sorted, true);
                // 后台静默刷新最新数据
                silentRefresh();
            } else {
                // 无数据时走正常网络加载
                loadPosts(1, false);
            }
        }
    };
    
    // 🔧 修复内存泄漏：先移除旧的监听器，再添加新的
    if (currentFilterHandler) {
        window.removeEventListener("comfy-posts-filter-change", currentFilterHandler);
    }
    currentFilterHandler = handleFilterChange;
    window.addEventListener("comfy-posts-filter-change", handleFilterChange);
    
    // 监听外部评分刷新事件（帖子详情页评分后通知列表刷新）
    const refreshHandler = () => {
        if (disposed) return;
        listViewGeneration++;
        if (allPostsData.length > 0) {
            const sorted = sortPostsLocally(allPostsData, currentSort);
            renderPostsFromCache(sorted, true);
        }
        silentRefresh();
    };
    window.addEventListener("comfy-posts-refresh", refreshHandler);
    
    // 显示骨架屏
    const showSkeleton = () => {
        postsGrid.innerHTML = "";
        // 创建瀑布流式骨架屏
        for (let i = 0; i < 4; i++) {
            const skeletonCard = document.createElement("div");
            skeletonCard.className = "posts-skeleton";
            skeletonCard.setAttribute('aria-hidden', 'true');
            skeletonCard.innerHTML = `
                <div class="posts-skeleton__cover"></div>
                <div class="posts-card__body">
                    <div class="posts-skeleton__line"></div>
                    <div class="posts-skeleton__line posts-skeleton__line--short"></div>
                </div>
            `;
            postsGrid.appendChild(skeletonCard);
        }
        const status = document.createElement('div');
        status.className = 'posts-loading';
        status.setAttribute('role', 'status');
        status.textContent = t('post.loading');
        postsGrid.appendChild(status);
    };
    
    const loadPosts = async (page = 1, append = false, forceRequest = false) => {
        if (disposed) return;
        const forceRefresh = !append && page === 1 && (forceRefreshPending || forceRequest === true);
        if (forceRefresh) forceRefreshPending = false;
        if (!append && page === 1) firstPageReady = false;
        const viewGeneration = !append && page === 1 ? ++listViewGeneration : listViewGeneration;
        const requestedSort = currentSort;
        const cacheKey = `${CACHE_KEY_PREFIX}_${requestedSort}`;
        
        // ✅ 优先从本地缓存读取（含过期缓存：离线容灾，与插件榜/工作流/推荐榜策略一致）
        if (!append && page === 1) {
            const cachedData = readListCache(cacheKey);
            if (cachedData) {
                // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
                allPostsData = proxyImages(cachedData);
                renderPostsFromCache(allPostsData, true);
                // 后台静默更新
                silentRefresh(forceRefresh).finally(() => {
                    if (disposed || viewGeneration !== listViewGeneration) return;
                    if (searchKeyword && !allPostsData.some(post => _matchesSearch(post, searchKeyword))) {
                        currentPaginator?.load();
                    }
                });
                return;
            }
        }
        
        let requestGeneration = null;
        try {
            if (!append) {
                showSkeleton();
            }
            
            requestGeneration = ++networkRequestGeneration;
            isLoadingFromNetwork = true;
            const readResponse = captureListRead(cacheKey);
            const res = await api.getPosts(page, PAGE_SIZE, requestedSort, ...(forceRefresh ? [{ noCache: true }] : []));
            if (viewGeneration !== listViewGeneration || requestGeneration !== networkRequestGeneration) {
                if (requestGeneration === networkRequestGeneration) {
                    isLoadingFromNetwork = false;
                    silentRefresh();
                }
                return;
            }
            const responseData = readResponse(res);
            const posts = responseData.data;
            if (page === 1) firstPageReady = true;
            const total = res.total || 0;
            isLoadingFromNetwork = false;
            
            // 缓存第一页数据
            if (page === 1) {
                allPostsData = proxyImages(posts);
                responseData.write(getCacheTTL());  // 存原始数据，离线时经图片代理后可展示
            } else {
                allPostsData = [...allPostsData, ...proxyImages(posts)];
            }
            
            if (!append) {
                postsGrid.innerHTML = "";
            }
            
            // 🔍 搜索过滤
            let displayPosts = posts.filter(post => _matchesSearch(post, searchKeyword));
            
            if (displayPosts.length === 0 && page === 1) {
                if (searchKeyword) {
                    postsGrid.innerHTML = "";
                    renderListSearchMessage(postsGrid, total > PAGE_SIZE ? t('pagination.searching') : t('pagination.search_empty'));
                    if (total > PAGE_SIZE) {
                        startAutoPagination();
                        currentPaginator?.load();
                    } else {
                        loadMoreWrapper.style.display = "none";
                    }
                } else {
                    postsGrid.innerHTML = _renderEmptyState(t);
                    loadMoreWrapper.style.display = "none";
                }
                return;
            }
            
            // 渲染帖子卡片
            const cards = [];
            displayPosts.forEach(post => {
                const card = createPostCard(post, currentUser, () => !disposed, cardNavigation.capture);
                cards.push(card);
                postsGrid.appendChild(card);
            });
            
            // ✨ 应用视口感知动画：可见卡片依次错开汇聚，滚动/分页进入视口的卡片自动补播
            applyViewportAnimations(postsGrid, cards, 'abyss', !append);
            
            // 🚀 图片懒加载
            lazyLoadImages(postsGrid);
            
            // 🚀 启动自动分页（首屏加载完成后）
            if (!append && page === 1) {
                startAutoPagination();
            }
            
            // 显示/隐藏加载更多（基于过滤后的数据）
            const loadedCount = page * PAGE_SIZE;
            if (loadedCount < total) {
                loadMoreWrapper.style.display = "block";
            } else {
                loadMoreWrapper.style.display = "none";
            }
            
        } catch (err) {
            if (disposed) return;
            if (viewGeneration !== listViewGeneration || requestGeneration !== networkRequestGeneration) {
                if (requestGeneration !== networkRequestGeneration) return;
                isLoadingFromNetwork = false;
                silentRefresh();
                return;
            }
            isLoadingFromNetwork = false;
            console.error("加载帖子失败");
            // 网络失败时尝试从缓存读取（包括过期缓存，离线容灾）
            if (!append) {
                const cachedData = readListCache(cacheKey);
                if (cachedData) {
                    // 🚀 缓存数据也需要过一遍图片代理
                    allPostsData = proxyImages(cachedData);
                    renderPostsFromCache(allPostsData);
                    showToast(t('post.network_cache'), "warning");
                } else {
                    renderListLoadError(postsGrid, err?.name === 'ListCacheChangedError' ? t('feedback.list_changed_retry') : t('post.load_failed'), () => {
                        if (disposed || isLoadingFromNetwork || requestedSort !== currentSort) return;
                        return loadPosts(1, false, forceRefresh);
                    }, t, err);
                }
            }
        }
    };
    
    // 从缓存渲染帖子列表
    const renderPostsFromCache = (posts, deferSearchScan = false) => {
        firstPageReady = true;
        const restoreFocus = cardNavigation.captureListFocus(postsGrid);
        postsGrid.innerHTML = "";
        
        // 🔍 搜索过滤
        const filteredPosts = posts.filter(post => _matchesSearch(post, searchKeyword));
        
        if (filteredPosts.length === 0) {
            if (searchKeyword) {
                renderListSearchMessage(postsGrid, t('pagination.searching'));
                startAutoPagination();
                loadMoreWrapper.style.display = "none";
                if (!deferSearchScan) currentPaginator?.load();
            } else {
                postsGrid.innerHTML = _renderEmptyState(t);
                loadMoreWrapper.style.display = "none";
            }
            restoreFocus();
            return;
        }
        
        // 渲染第一页
        const firstPage = filteredPosts.slice(0, PAGE_SIZE);
        const cards = [];
        firstPage.forEach(post => {
            const card = createPostCard(post, currentUser, () => !disposed, cardNavigation.capture);
            cards.push(card);
            postsGrid.appendChild(card);
        });
        
        // ✨ 应用视口感知动画
        applyViewportAnimations(postsGrid, cards, 'abyss', true);
        
        // 🚀 图片懒加载
        lazyLoadImages(postsGrid);
        
        // 🚀 启动自动分页
        startAutoPagination();
        
        // 显示加载更多
        if (filteredPosts.length > PAGE_SIZE) {
            loadMoreWrapper.style.display = "block";
        } else {
            loadMoreWrapper.style.display = "none";
        }
        restoreFocus();
    };
    
    // 后台静默更新
    const silentRefresh = async (notifyFailure = false) => {
        if (disposed || isLoadingFromNetwork) return;
        const viewGeneration = listViewGeneration;
        const requestedSort = currentSort;
        const cacheKey = `${CACHE_KEY_PREFIX}_${requestedSort}`;
        const requestGeneration = ++networkRequestGeneration;
        try {
            isLoadingFromNetwork = true;
            const readResponse = captureListRead(cacheKey);
            const res = await api.getPosts(1, PAGE_SIZE, requestedSort, {
                noCache: true,
                timeout: API.BACKGROUND_TIMEOUT,
                retries: API.BACKGROUND_RETRIES
            });
            if (viewGeneration !== listViewGeneration || requestGeneration !== networkRequestGeneration) {
                if (requestGeneration === networkRequestGeneration) {
                    isLoadingFromNetwork = false;
                    silentRefresh();
                }
                return;
            }
            const responseData = readResponse(res);
            const posts = responseData.data;
            isLoadingFromNetwork = false;
            
            if (isEmptyListRefreshWithExistingData(posts, allPostsData)) {
                console.warn(`🛡️ 讨论区 ${requestedSort} 后台返回空列表，保留当前数据与缓存`);
            } else {
                // 更新缓存
                responseData.write(getCacheTTL());

                // 对比新旧数据，有变化时重新渲染
                if (_postsDataChanged(allPostsData, posts)) {
                    console.log(`✅ 讨论区 ${currentSort} 检测到新数据，执行静默更新`);
                    allPostsData = proxyImages(posts);
                    renderPostsFromCache(allPostsData);
                } else {
                    allPostsData = proxyImages(posts);
                }
            }
        } catch (err) {
            if (viewGeneration !== listViewGeneration || requestGeneration !== networkRequestGeneration) {
                if (requestGeneration === networkRequestGeneration) {
                    isLoadingFromNetwork = false;
                    silentRefresh();
                }
                return;
            }
            isLoadingFromNetwork = false;
            console.warn("后台更新帖子失败（保留当前内容）");
            if (notifyFailure === true) showToast(t(err?.name === 'ListCacheChangedError'
                ? 'feedback.list_changed_retry' : 'feedback.refresh_failed_cached'), 'warning');
        }
        if (searchKeyword && !allPostsData.some(post => _matchesSearch(post, searchKeyword))) {
            currentPaginator?.load();
        }
    };
    
    /** 对比帖子数据是否有变化 */
    const _postsDataChanged = (oldData, newData) => {
        if (!oldData || !newData) return true;
        if (oldData.length !== newData.length) return true;
        const checkCount = oldData.length;
        const COMPARE_FIELDS = ['likes', 'favorites', 'views', 'daily_views', 'comments_count'];
        const contentFields = ["title", "content", "post_type", "created_at", "author", "author_name"];
        const mediaFields = ["cover_image", "author_avatar"];
        const normalizedImage = value => typeof value === 'string'
            ? proxyImages({ cover_image: value }).cover_image : value;
        for (let i = 0; i < checkCount; i++) {
            if ((oldData[i].id) !== (newData[i].id)) return true;
            for (const field of contentFields) {
                if (!Object.is(oldData[i][field], newData[i][field])) return true;
            }
            for (const field of mediaFields) {
                if (!Object.is(normalizedImage(oldData[i][field]), normalizedImage(newData[i][field]))) return true;
            }
            for (const f of COMPARE_FIELDS) {
                if ((oldData[i][f] || 0) !== (newData[i][f] || 0)) return true;
            }
            const ratingText = value => (typeof value === 'number' && Number.isFinite(value) ? value : 0).toFixed(1);
            if (ratingText(oldData[i].rating_avg) !== ratingText(newData[i].rating_avg)) return true;
        }
        return false;
    };
    
    // 加载更多按钮
    loadMoreBtn.onclick = () => {
        if (disposed) return;
        currentPaginator?.load();
    };
    
    // 初始加载
    loadPosts(1);
    
    // 🔧 组件生命周期清理方法
    container._cleanup = () => {
        if (disposed) return;
        disposed = true;
        cardNavigation.dispose();
        if (activeViewCleanup === container._cleanup) activeViewCleanup = null;
        listViewGeneration++;
        networkRequestGeneration++;
        stopViewportAnimations(postsGrid);
        // 清理筛选事件监听器
        window.removeEventListener("comfy-posts-filter-change", handleFilterChange);
        if (currentFilterHandler === handleFilterChange) currentFilterHandler = null;
        // 清理刷新事件监听器
        if (typeof refreshHandler !== 'undefined') {
            window.removeEventListener("comfy-posts-refresh", refreshHandler);
        }
        // 如果有分页器，停止它
        const stoppedPaginator = currentPaginator;
        currentPaginator = null;
        try { stoppedPaginator?.stop(); } catch { console.warn("榜单分页器清理失败"); }
    };
    
    activeViewCleanup = container._cleanup;
    return container;
}

/**
 * 🎴 创建单个帖子卡片（小红书风格）
 */
function createPostCard(post, currentUser = currentUserCache, isCurrent = () => true, captureNavigation = () => isCurrent) {
    const card = document.createElement("div");
    card.className = "business-list-card posts-card";
    if (typeof post.id === 'string' || (typeof post.id === 'number' && Number.isFinite(post.id))) {
        card._rankingListId = String(post.id);
    }
    
    // 格式化时间
    const timeStr = formatTime(post.created_at);
    
    // 判断是否为视频帖子
    const isVideo = post.post_type === "video";
    const initialAuthor = isCurrent() && typeof post.author === 'string' ? getCachedProfile(post.author) : null;
    const initialAuthorName = [initialAuthor?.name, post.author_name, post.author].find(value => typeof value === 'string' && value) || '';
    
    card.innerHTML = `
        <!-- 封面图 -->
        <div class="posts-card__cover">
            <img src="${escapeHtml(post.cover_image || 'data:image/svg+xml,...')}"
                 class="posts-card__image"
                 alt="">
            ${isVideo ? `
            <!-- 视频播放按钮 -->
            <div class="posts-card__play" aria-hidden="true">
                <div class="posts-card__play-icon"></div>
            </div>
            ` : ''}
        </div>
        
        <!-- 内容区 -->
        <div class="posts-card__body">
            <!-- 标题 -->
            <button type="button" class="business-list-card__title">
                ${escapeHtml(post.title)}
            </button>
            
            <!-- 作者信息（SWR 缓存头像） -->
            <div class="business-list-card__author posts-card__author">${_generateAvatarHtml('', initialAuthorName)}<span class="swr-name posts-card__name">${escapeHtml(initialAuthorName)}</span></div>
            
            <!-- 互动数据 -->
            <div class="posts-card__stats">
                <span>❤️ ${escapeHtml(post.likes || 0)}</span>
                <span>🔖 ${escapeHtml(post.favorites || 0)}</span>
                <span>🔥 ${escapeHtml(post.views || 0)}</span>
                <span class="posts-card__rating">★ ${(typeof post.rating_avg === 'number' && Number.isFinite(post.rating_avg) ? post.rating_avg : 0).toFixed(1)}</span>
                <span class="posts-card__time">${escapeHtml(timeStr)}</span>
            </div>
        </div>
    `;
    
    // 🚀 SWR 头像渲染：先从缓存读取，后台静默校对
    setTimeout(() => {
        if (!isCurrent() || !card.isConnected) return;
        const authorContainer = card.querySelector(".business-list-card__author");
        if (!authorContainer) return;
        
        const account = post.author;
        const cached = initialAuthor;
        const avatar = [cached?.avatar, post.author_avatar].map(value => normalizeProfileImageUrl(value)).find(Boolean) || '';
        const name = initialAuthorName;
        const initial = (name || 'U')[0].toUpperCase();
        
        // 渲染初始头像
        const avatarHtml = _generateAvatarHtml(avatar, name);
        
        authorContainer.innerHTML = `${avatarHtml}<span class="swr-name posts-card__name">${escapeHtml(name)}</span>`;
        
        // 后台静默校对
        const updateAuthor = (profile) => {
            if (!isCurrent() || !card.isConnected) return;
            const avatarEl = authorContainer.querySelector('.swr-avatar');
            const nameEl = authorContainer.querySelector('.swr-name');
            const avatar = normalizeProfileImageUrl(profile?.avatar);
            if (avatarEl && avatar) {
                if (avatarEl.tagName === 'IMG') {
                    if (avatarEl.getAttribute('src') !== avatar) avatarEl.src = avatar;
                } else {
                    avatarEl.outerHTML = _generateAvatarHtml(avatar, typeof profile.name === 'string' && profile.name ? profile.name : name);
                }
            }
            if (nameEl && typeof profile.name === 'string' && profile.name && nameEl.textContent !== profile.name) {
                nameEl.textContent = profile.name;
            }
        };
        const latestCached = getProfileWithSWR(account, api.getUserProfile, updateAuthor);
        if (latestCached) updateAuthor(latestCached);
    }, 0);
    
    const cover = card.querySelector('img');
    if (cover) cover.onerror = () => {
        cover.onerror = null;
        cover.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23222" width="200" height="200"/%3E%3C/svg%3E';
    };

    let opening = false;
    card.onclick = async () => {
        if (opening || !isCurrent() || !card.isConnected) return;
        const isNavigationCurrent = captureNavigation();
        if (!isNavigationCurrent()) { showToast(t('auth.reopen_list'), 'warning'); return; }
        opening = true;
        card.setAttribute('aria-busy', 'true');
        try {
            const module = await import("./帖子详情组件.js");
            if (!isNavigationCurrent() || !card.isConnected || !card.getClientRects().length) return;
            const view = module.createPostDetailView(post.id, currentUser);
            if (!isNavigationCurrent() || !card.isConnected) { view._cleanup?.(); return; }
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        } catch {
            if (isNavigationCurrent() && card.isConnected && card.getClientRects().length) showToast(t('post.load_failed'), 'error');
        } finally {
            opening = false;
            card.removeAttribute('aria-busy');
        }
    };

    return card;
}
