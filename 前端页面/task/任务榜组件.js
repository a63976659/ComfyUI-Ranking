import { captureListRead } from "../core/榜单数据来源.js";
// 前端页面/task/任务榜组件.js
// ==========================================
// 📝 任务榜组件（任务列表视图）
// ==========================================
// 功能：展示任务列表、状态筛选、发布任务入口
// 性能优化：
//   - 本地缓存优先读取
//   - 骨架屏加载动画
//   - 动态分页加载
// 关联文件：
//   - 任务详情组件.js (点击进入详情)
//   - 发布任务组件.js (发布入口)
//   - 管理功能（申诉仲裁）已迁移至云端控制台 /admin/
//   - 网络请求API.js (数据获取)
//   - 性能优化工具.js (缓存/骨架屏)
// ==========================================

import { createCardNavigationScope } from "../components/卡片导航生命周期.js";
import { api, captureRequestSession } from "../core/网络请求API.js";
import { getTaskApplicantCount } from "./任务数据工具.js";
import { proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { readListCache, isEmptyListRefreshWithExistingData, createSkeleton, createPaginationLoader, lazyLoadImages, renderListLoadError, renderListSearchMessage } from "../components/性能优化工具.js";
import { applyViewportAnimations, stopViewportAnimations } from "../components/动画音效引擎.js";
import { t } from "../components/用户体验增强.js";
import { API, CACHE, getCachedProfile, getProfileWithSWR, normalizeProfileImageUrl } from "../core/全局配置.js";
import { escapeHtml, formatTime, getCacheTTL } from "../components/互动工具函数.js";  // 🧹 P2归一：局部副本已移除

// 缓存配置
const CACHE_KEY_PREFIX = CACHE.PUBLIC_LISTS.tasks.prefix.slice(0, -1);
const PAGE_SIZE = 20;

// 缓存当前用户
let currentUserCache = null;

// 🔧 修复内存泄漏：保存当前筛选事件监听器引用，以便在重新创建时移除
let currentFilterHandler = null;
let activeViewCleanup = null;

// 状态筛选选项
const STATUS_FILTERS = [
    { value: "", labelKey: "task.filter_all" },
    { value: "open", labelKey: "task.filter_open" },
    { value: "in_progress", labelKey: "task.filter_in_progress" },
    { value: "submitted", labelKey: "task.filter_submitted" },
    { value: "completed", labelKey: "task.filter_completed" },
    { value: "disputed", labelKey: "task.filter_disputed" }
];

// 排序选项
const SORT_OPTIONS = [
    { value: "latest", labelKey: "task.sort_latest" },
    { value: "price", labelKey: "task.sort_price" },
    { value: "deadline", labelKey: "task.sort_deadline" },
    { value: "views", label: "🔥 浏览总量" },
    { value: "daily_views", label: "🔥 今日热门" },
    { value: "likes", label: "❤️ 最多点赞" },
    { value: "favorites", label: "🔖 最多收藏" }
];

// 数据对比字段配置（带默认值0的数值字段）
const COMPARE_FIELDS = ['likes', 'favorites', 'views', 'daily_views'];

/**
 * 🔍 按关键词过滤任务列表
 */
function _filterTasksByKeyword(tasks, keyword) {
    if (!keyword) return tasks;
    return tasks.filter(task => {
        const text = `${task.title||''} ${task.description||''} ${task.publisher_name||''} ${task.publisher||''}`.toLowerCase();
        return text.includes(keyword);
    });
}

/**
 * 📭 渲染空任务列表视图
 */
function _renderNoTasksView() {
    return `
        <div class="task-board__empty" role="status">
            <div class="task-board__empty-icon" aria-hidden="true">📝</div>
            <div class="task-board__empty-title">${t('task.no_tasks')}</div>
            <div class="task-board__empty-hint">${t('task.be_first')}</div>
        </div>
    `;
}

/**
 * 📝 创建任务榜视图
 */
export function createTasksView(currentUser, keyword = "", { sort: initialSort = "latest", status: initialStatus = "", force: initialForce = false } = {}) {
    if (activeViewCleanup) activeViewCleanup();
    currentUserCache = currentUser;
    const searchKeyword = keyword.toLowerCase();
    
    const container = document.createElement("div");
    container.className = "task-board";
    
    container.innerHTML = `
        <!-- 任务列表容器 -->
        <div id="tasks-list" class="task-board__list">
            <!-- 加载占位 -->
            <div id="tasks-loading" class="task-board__loading" role="status" aria-live="polite">
                <div class="task-board__loading-icon" aria-hidden="true">⏳</div>
                ${t('task.loading')}
            </div>
        </div>
        
        <!-- 加载更多 -->
        <div id="load-more-wrapper" class="task-board__load-more" style="display: none;">
            <button id="btn-load-more" class="task-board__load-more-button" type="button">
                ${t('task.load_more')}
            </button>
        </div>
    `;
    
    // 🔌 绑定事件
    const tasksList = container.querySelector("#tasks-list");
    const loadMoreWrapper = container.querySelector("#load-more-wrapper");
    const loadMoreBtn = container.querySelector("#btn-load-more");
    
    let currentStatus = initialStatus;
    let currentSort = initialSort;
    let allTasksData = [];  // 全量数据缓存
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
    let paginator = null;
    let searchPagePending = false;

    const continueSearchPagination = () => {
        if (disposed) return;
        if (!searchKeyword || allTasksData.some(task => _filterTasksByKeyword([task], searchKeyword).length)) {
            searchPagePending = false;
            return;
        }
        if (isLoadingFromNetwork || !paginator) {
            searchPagePending = true;
            return;
        }
        searchPagePending = false;
        paginator.load();
    };
    
    // 🎯 监听外部筛选变化事件
    const handleFilterChange = (e) => {
        if (disposed) return;
        const { status, sort } = e.detail;
        listViewGeneration++;
        
        // 状态变化时，需要重新加载数据（因为后端按状态过滤）
        if (status !== undefined && status !== currentStatus) {
            currentStatus = status;
            if (paginator) paginator.reset();
            loadTasks(1, false);
            return;
        }
        
        // 排序变化时，本地排序优先
        if (sort) {
            currentSort = sort;
            if (paginator) paginator.reset();
            
            // 🚀 本地排序优先：已有数据时直接本地排序渲染
            if (allTasksData.length > 0) {
                // 先应用状态过滤（如果有），再排序
                let filtered = allTasksData;
                if (currentStatus) {
                    filtered = allTasksData.filter(t => t.status === currentStatus);
                }
                const sorted = sortTasksLocally(filtered, currentSort);
                renderTasksFromCache(sorted);
                // 后台静默刷新最新数据
                silentRefresh();
            } else {
                // 无数据时走正常网络加载
                loadTasks(1, false);
            }
        }
    };
    
    // 🔧 修复内存泄漏：先移除旧的监听器，再添加新的
    if (currentFilterHandler) {
        window.removeEventListener("comfy-task-filter-change", currentFilterHandler);
    }
    currentFilterHandler = handleFilterChange;
    window.addEventListener("comfy-task-filter-change", handleFilterChange);
    
    // 获取缓存Key
    const getCacheKey = () => `${CACHE_KEY_PREFIX}_${currentStatus}_${currentSort}`;
    
    // 🔄 本地排序函数
    const sortTasksLocally = (tasks, sortBy) => {
        const sorted = [...tasks];
        switch (sortBy) {
            case "likes":
                sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
                break;
            case "favorites":
                sorted.sort((a, b) => (b.favorites || 0) - (a.favorites || 0));
                break;
            case "views":
                sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
                break;
            case "daily_views":
                sorted.sort((a, b) => (b.daily_views || 0) - (a.daily_views || 0));
                break;
            case "price":
                sorted.sort((a, b) => (b.total_price || 0) - (a.total_price || 0));
                break;
            case "deadline":
                const deadlineTime = value => parseTaskDeadline(value) ?? Infinity;
                sorted.sort((a, b) => deadlineTime(a.deadline) - deadlineTime(b.deadline));
                break;
            default: // latest
                sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                break;
        }
        return sorted;
    };
    
    // 显示骨架屏
    const showSkeleton = () => {
        tasksList.innerHTML = "";
        const skeleton = createSkeleton("card", 4);
        tasksList.appendChild(skeleton);
    };
    
    // 加载任务列表（支持缓存优先）
    const loadTasks = async (page = 1, append = false, forceRequest = false) => {
        if (disposed) return;
        const forceRefresh = !append && page === 1 && (forceRefreshPending || forceRequest === true);
        if (forceRefresh) forceRefreshPending = false;
        if (!append && page === 1) firstPageReady = false;
        const viewGeneration = !append && page === 1 ? ++listViewGeneration : listViewGeneration;
        const requestedStatus = currentStatus;
        const requestedSort = currentSort;
        const cacheKey = `${CACHE_KEY_PREFIX}_${requestedStatus}_${requestedSort}`;
        
        // ✅ 优先从本地缓存读取（含过期缓存：离线容灾，与插件榜/工作流/推荐榜策略一致）
        if (!append && page === 1) {
            const cachedData = readListCache(cacheKey);
            if (cachedData) {
                // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
                allTasksData = proxyImages(cachedData);
                renderTasksFromCache(allTasksData);
                // 后台静默更新
                silentRefresh(forceRefresh).finally(continueSearchPagination);
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
            const res = await api.getTasks(page, PAGE_SIZE, requestedStatus || null, requestedSort, ...(forceRefresh ? [{ noCache: true }] : []));
            if (viewGeneration !== listViewGeneration || requestGeneration !== networkRequestGeneration) {
                if (requestGeneration === networkRequestGeneration) {
                    isLoadingFromNetwork = false;
                    silentRefresh();
                }
                return;
            }
            const responseData = readResponse(res);
            const tasks = responseData.data;
            if (page === 1) firstPageReady = true;
            const total = res.total || 0;
            isLoadingFromNetwork = false;
            
            // 缓存第一页数据
            if (page === 1) {
                allTasksData = tasks;
                responseData.write(getCacheTTL());  // 持久化到 localStorage，供离线容灾
            } else {
                allTasksData = [...allTasksData, ...tasks];
            }
            
            if (!append) {
                tasksList.innerHTML = "";
            }
            
            // 🔍 搜索过滤
            const displayTasks = _filterTasksByKeyword(tasks, searchKeyword);
            
            if (displayTasks.length === 0 && page === 1) {
                if (searchKeyword) {
                    tasksList.innerHTML = "";
                    renderListSearchMessage(tasksList, total > PAGE_SIZE ? t('pagination.searching') : t('pagination.search_empty'));
                } else {
                    tasksList.innerHTML = _renderNoTasksView();
                }
                loadMoreWrapper.style.display = total > PAGE_SIZE ? "block" : "none";
                if (searchKeyword && total > PAGE_SIZE) continueSearchPagination();
                return;
            }
            
            // 渲染任务卡片
            const cards = [];
            displayTasks.forEach(task => {
                const card = createTaskCard(task, currentUser, () => !disposed, cardNavigation.capture);
                cards.push(card);
                tasksList.appendChild(card);
            });
            
            // 🖼️ 懒加载新渲染的图片
            lazyLoadImages(tasksList);
            
            // ✨ 应用视口感知动画：可见卡片依次错开载入，滚动/分页进入视口的卡片自动补播
            applyViewportAnimations(tasksList, cards, 'dataflow', !append);
            
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
            console.error("加载任务失败");
            // 网络失败时尝试从缓存读取（包括过期缓存，离线容灾）
            if (!append) {
                const cachedData = readListCache(cacheKey);
                if (cachedData) {
                    // 🚀 缓存数据也需要过一遍图片代理
                    allTasksData = proxyImages(cachedData);
                    renderTasksFromCache(allTasksData);
                    showToast(t('task.network_cache'), "warning");
                    continueSearchPagination();
                } else {
                    renderListLoadError(tasksList, err?.name === 'ListCacheChangedError' ? t('feedback.list_changed_retry') : t('task.load_failed'), () => {
                        if (disposed || isLoadingFromNetwork || requestedStatus !== currentStatus || requestedSort !== currentSort) return;
                        return loadTasks(1, false, forceRefresh);
                    }, t, err);
                }
            }
        }
    };
    
    // 从缓存渲染任务列表
    const renderTasksFromCache = (tasks) => {
        firstPageReady = true;
        const restoreFocus = cardNavigation.captureListFocus(tasksList);
        tasksList.innerHTML = "";
        
        // 🔍 搜索过滤
        const filteredTasks = _filterTasksByKeyword(tasks, searchKeyword);
        
        if (filteredTasks.length === 0) {
            if (searchKeyword) {
                renderListSearchMessage(tasksList, t('pagination.searching'));
                loadMoreWrapper.style.display = "block";
            } else {
                tasksList.innerHTML = _renderNoTasksView();
                loadMoreWrapper.style.display = "none";
            }
            restoreFocus();
            return;
        }
        
        // 渲染第一页
        const firstPage = filteredTasks.slice(0, PAGE_SIZE);
        const cards = [];
        firstPage.forEach(task => {
            const card = createTaskCard(task, currentUser, () => !disposed, cardNavigation.capture);
            cards.push(card);
            tasksList.appendChild(card);
        });
        
        // 🖼️ 懒加载新渲染的图片
        lazyLoadImages(tasksList);
        
        // ✨ 应用视口感知动画
        applyViewportAnimations(tasksList, cards, 'dataflow', true);
        
        // 显示加载更多
        if (filteredTasks.length > PAGE_SIZE) {
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
        const requestedStatus = currentStatus;
        const requestedSort = currentSort;
        const cacheKey = `${CACHE_KEY_PREFIX}_${requestedStatus}_${requestedSort}`;
        const requestGeneration = ++networkRequestGeneration;
        try {
            isLoadingFromNetwork = true;
            const readResponse = captureListRead(cacheKey);
            const res = await api.getTasks(1, PAGE_SIZE, requestedStatus || null, requestedSort, {
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
            const tasks = responseData.data;
            isLoadingFromNetwork = false;
            
            if (isEmptyListRefreshWithExistingData(tasks, allTasksData)) {
                console.warn(`🛡️ 任务榜 ${requestedSort} 后台返回空列表，保留当前数据与缓存`);
            } else {
                // 更新缓存
                responseData.write(getCacheTTL());

                // 对比新旧数据，有变化时重新渲染
                if (_tasksDataChanged(allTasksData, tasks)) {
                    console.log(`✅ 任务榜 ${currentSort} 检测到新数据，执行静默更新`);
                    allTasksData = proxyImages(tasks);
                    renderTasksFromCache(allTasksData);
                } else {
                    allTasksData = tasks;
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
            console.warn("后台更新任务失败（保留当前内容）");
            if (notifyFailure === true) showToast(t(err?.name === 'ListCacheChangedError'
                ? 'feedback.list_changed_retry' : 'feedback.refresh_failed_cached'), 'warning');
        }
        continueSearchPagination();
    };
    
    /** 对比任务数据是否有变化 */
    const _tasksDataChanged = (oldData, newData) => {
        if (!oldData || !newData) return true;
        if (oldData.length !== newData.length) return true;
        const checkCount = oldData.length;
        const contentFields = ["title", "description", "total_price", "deadline", "is_overdue", "publisher", "publisher_name", "created_at"];
        const mediaFields = ["publisher_avatar"];
        const normalizedImage = value => typeof value === 'string'
            ? proxyImages({ cover_image: value }).cover_image : value;
        for (let i = 0; i < checkCount; i++) {
            if (oldData[i].id !== newData[i].id) return true;
            if (oldData[i].status !== newData[i].status) return true;
            for (const field of contentFields) {
                if (!Object.is(oldData[i][field], newData[i][field])) return true;
            }
            for (const field of mediaFields) {
                if (!Object.is(normalizedImage(oldData[i][field]), normalizedImage(newData[i][field]))) return true;
            }
            for (const field of COMPARE_FIELDS) {
                if ((oldData[i][field] || 0) !== (newData[i][field] || 0)) return true;
            }
            if (getTaskApplicantCount(oldData[i]) !== getTaskApplicantCount(newData[i])) return true;
        }
        return false;
    };
    
    // 加载更多（原有按钮，将被自动分页替代）
    loadMoreBtn.onclick = () => {
        if (disposed) return;
        paginator?.load();
    };
    
    // 初始加载
    loadTasks(1);
    
    // 🚀 初始化自动分页（延迟以确保 DOM 已挂载）
    requestAnimationFrame(() => {
        if (disposed) return;
        setTimeout(() => {
            if (disposed) return;
            const scrollContainer = container.closest('.sidebar-scroll-container') || container;
            paginator = createPaginationLoader({
                container: scrollContainer,
                focusContainer: tasksList,
                canLoad: () => !disposed && firstPageReady && !isLoadingFromNetwork,
                autoFill: () => Boolean(searchKeyword) && !allTasksData.some(task => _filterTasksByKeyword([task], searchKeyword).length),
                loadMore: async (page, pageSize, { isCurrent = () => true } = {}) => {
                    if (disposed || !isCurrent()) return [];
                    try {
                        const readResponse = captureListRead(`${CACHE_KEY_PREFIX}_${currentStatus}_${currentSort}`);
                        const res = await api.getTasks(page, pageSize, currentStatus || null, currentSort);
                        if (disposed || !isCurrent()) return [];
                        const responseData = readResponse(res);
                        const tasks = responseData.data;
                        if (tasks.length === 0) {
                            if (searchKeyword && !allTasksData.some(task => _filterTasksByKeyword([task], searchKeyword).length)) {
                                renderListSearchMessage(tasksList, t('pagination.search_empty'));
                            } else {
                                tasksList.querySelector('.list-search-message')?.remove();
                            }
                        }
                        
                        if (tasks.length > 0) {
                            allTasksData = [...allTasksData, ...tasks];
                            
                            const displayTasks = _filterTasksByKeyword(tasks, searchKeyword);
                            
                            const newCards = [];
                            displayTasks.forEach(task => {
                                tasksList.querySelector('.list-search-message')?.remove();
                                const card = createTaskCard(task, currentUser, () => !disposed, cardNavigation.capture);
                                newCards.push(card);
                                tasksList.appendChild(card);
                            });
                            
                            // ✨ 视口感知动画：追加卡片复用同一观察器
                            if (newCards.length > 0) {
                                applyViewportAnimations(tasksList, newCards, 'dataflow', false);
                            }
                            
                            // 🖼️ 懒加载追加的图片
                            lazyLoadImages(tasksList);
                        }
                        
                        return tasks;
                    } catch (err) {
                        if (disposed || !isCurrent()) return [];
                        console.error("自动分页加载任务失败");
                        tasksList.querySelector('.list-search-message')?.remove();
                        return null;
                    }
                },
                pageSize: PAGE_SIZE,
                threshold: 200,
                t
            });
            paginator.start();
            loadMoreWrapper.style.display = "none";
            if (searchPagePending) continueSearchPagination();
        }, 0);
    });
    
    // 🧹 组件清理方法
    container._cleanup = () => {
        if (disposed) return;
        disposed = true;
        cardNavigation.dispose();
        if (activeViewCleanup === container._cleanup) activeViewCleanup = null;
        listViewGeneration++;
        networkRequestGeneration++;
        stopViewportAnimations(tasksList);
        const stoppedPaginator = paginator;
        paginator = null;
        try { stoppedPaginator?.stop(); } catch { console.warn("榜单分页器清理失败"); }
        window.removeEventListener("comfy-task-filter-change", handleFilterChange);
        if (currentFilterHandler === handleFilterChange) currentFilterHandler = null;
    };
    
    activeViewCleanup = container._cleanup;
    return container;
}

/**
 * 🎴 创建单个任务卡片
 */
function createTaskCard(task, currentUser = currentUserCache, isCurrent = () => true, captureNavigation = () => isCurrent) {
    const card = document.createElement("div");
    card.className = "task-card";
    if (typeof task.id === 'string' || (typeof task.id === 'number' && Number.isFinite(task.id))) {
        card._rankingListId = String(task.id);
    }
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    
    // 状态标签样式
    const statusStyles = {
        open: { textKey: "task.status_open" },
        in_progress: { textKey: "task.status_in_progress" },
        submitted: { textKey: "task.status_submitted" },
        completed: { textKey: "task.status_completed" },
        disputed: { textKey: "task.status_disputed" },
        cancelled: { textKey: "task.status_cancelled" },
        expired: { textKey: "task.status_expired" }
    };
    
    const status = Object.prototype.hasOwnProperty.call(statusStyles, task.status)
        ? statusStyles[task.status]
        : { textKey: "task.status_unknown" };
    const statusText = t(status.textKey);
    const timeStr = formatTime(task.created_at);
    const deadline = formatDeadline(task.deadline);
    
    // 检查是否逾期（进行中但超过截止日期）
    const isOverdue = task.is_overdue === true || (task.status === "in_progress" && parseTaskDeadline(task.deadline) != null && task.deadline.slice(0, 10) < new Date().toISOString().slice(0, 10));
    const overdueTag = isOverdue ? `<span class="task-card__overdue">${t('task.overdue')}</span>` : "";
    
    // 过期卡片样式
    if (task.status === "expired" || isOverdue) {
        card.classList.add("task-card--stale");
    }
    
    const initialAuthor = isCurrent() && typeof task.publisher === 'string' ? getCachedProfile(task.publisher) : null;
    const initialAuthorName = [initialAuthor?.name, task.publisher_name, task.publisher].find(value => typeof value === 'string' && value) || '';
    const DEFAULT_AVATAR_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23333'/%3E%3Ccircle cx='18' cy='14' r='6' fill='%23666'/%3E%3Cpath d='M6 32c0-6.6 5.4-12 12-12s12 5.4 12 12' fill='%23666'/%3E%3C/svg%3E";

    card.innerHTML = `
        <!-- 顶部：状态 + 价格 -->
        <div class="task-card__header">
            <div class="task-card__status-group">
                <span class="task-card__status" data-task-status="${escapeHtml(task.status || 'unknown')}">
                    ${statusText}
                </span>
                ${overdueTag}
            </div>
            <span class="task-card__price">
                💰 ${escapeHtml(task.total_price)} ${t('task.points')}
            </span>
        </div>
        
        <!-- 标题 -->
        <div class="task-card__title">
            ${escapeHtml(task.title)}
        </div>
        
        <!-- 描述 -->
        <div class="task-card__description">
            ${escapeHtml(task.description)}
        </div>
        
        <!-- 底部信息 -->
        <div class="task-card__footer">
            <!-- 发布者（SWR 缓存头像） -->
            <div class="task-card__author"><img class="swr-avatar task-card__avatar" alt="" src="${escapeHtml(DEFAULT_AVATAR_SVG)}"><span class="swr-name">${escapeHtml(initialAuthorName)}</span></div>
            
            <!-- 截止日期 + 申请人数 + 访问量 + 点赞 + 收藏 -->
            <div class="task-card__stats">
                <span>⏰ ${escapeHtml(deadline)}</span>
                ${task.status === "open" ? `<span>👥 ${escapeHtml(getTaskApplicantCount(task))} ${t('task.applicants')}</span>` : ""}
                <span>🔥 ${escapeHtml(task.views || 0)}</span>
                <span>❤️ ${escapeHtml(task.likes || 0)}</span>
                <span>🔖 ${escapeHtml(task.favorites || 0)}</span>
            </div>
        </div>
    `;
    
    // 🚀 SWR 头像渲染：先从缓存读取，后台静默校对
    setTimeout(() => {
        if (!isCurrent() || !card.isConnected) return;
        const authorContainer = card.querySelector(".task-card__author");
        if (!authorContainer) return;
        
        const account = task.publisher;
        const cached = initialAuthor;
        const avatar = [cached?.avatar, task.publisher_avatar].map(value => normalizeProfileImageUrl(value)).find(Boolean) || '';
        const name = initialAuthorName;
        
        
        // 渲染头像（始终使用 img 标签）
        const avatarSrc = avatar || DEFAULT_AVATAR_SVG;
        // 🔒 XSS防护：头像 URL 来自他人可修改的资料，写入 HTML 属性前必须转义
        const avatarHtml = `<img class="swr-avatar task-card__avatar" alt="" src="${escapeHtml(avatarSrc)}">`;
        
        authorContainer.innerHTML = `${avatarHtml}<span class="swr-name">${escapeHtml(name)}</span>`;
        
        // 后台静默校对
        const updateAuthor = (profile) => {
            if (!isCurrent() || !card.isConnected) return;
            const avatarEl = authorContainer.querySelector('.swr-avatar');
            const nameEl = authorContainer.querySelector('.swr-name');
            const avatar = normalizeProfileImageUrl(profile?.avatar);
            if (avatarEl && avatar) {
                if (avatarEl.getAttribute('src') !== avatar) avatarEl.src = avatar;
            }
            if (nameEl && typeof profile.name === 'string' && profile.name && nameEl.textContent !== profile.name) {
                nameEl.textContent = profile.name;
            }
        };
        const latestCached = getProfileWithSWR(account, api.getUserProfile, updateAuthor);
        if (latestCached) updateAuthor(latestCached);
    }, 0);
    
    // 点击进入详情；捕获创建视图的用户和点击时的导航范围。
    let opening = false;
    card.onclick = async () => {
        if (opening || !isCurrent() || !card.isConnected) return;
        const isNavigationCurrent = captureNavigation();
        if (!isNavigationCurrent()) { showToast(t('auth.reopen_list'), 'warning'); return; }
        opening = true;
        card.setAttribute('aria-busy', 'true');
        try {
            const module = await import("./任务详情组件.js");
            if (!isNavigationCurrent() || !card.isConnected || !card.getClientRects().length) return;
            const view = module.createTaskDetailView(task.id, currentUser);
            if (!isNavigationCurrent() || !card.isConnected) { view._cleanup?.(); return; }
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        } catch {
            if (isNavigationCurrent() && card.isConnected && card.getClientRects().length) showToast(t('task.load_failed'), 'error');
        } finally {
            opening = false;
            card.removeAttribute('aria-busy');
        }
    };
    card.addEventListener("keydown", (event) => {
        if (event.target === card && !event.repeat && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            card.click();
        }
    });
    
    return card;
}

function parseTaskDeadline(value) {
    if (typeof value !== 'string' || value.trim() !== value ||
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) return null;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (year < 1 || month < 1 || month > 12 || day < 1) return null;
    const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const lastDay = month === 2 ? (leap ? 29 : 28) : ([4, 6, 9, 11].includes(month) ? 30 : 31);
    if (day > lastDay) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

/**
 * 📅 格式化截止日期
 */
function formatDeadline(deadline) {
    if (deadline == null || deadline === '') return t('time.unlimited');
    const timestamp = parseTaskDeadline(deadline);
    if (timestamp == null) return t('common.unknown');
    
    try {
        const day = deadline.slice(0, 10);
        const now = new Date();
        const today = new Date(0);
        today.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
        const days = Math.round((Date.parse(day) - today.getTime()) / (1000 * 60 * 60 * 24));
        if (!Number.isFinite(days)) return t('common.unknown');
        if (days < 0) return t('time.deadline_ended');
        if (days === 0) return t('time.deadline_today');
        if (days === 1) return t('time.deadline_tomorrow');
        if (days < 7) return t('time.deadline_days', { n: days });
        
        return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
    } catch {
        return t('common.unknown');
    }
}
