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
//   - 管理员仲裁组件.js (管理员入口)
//   - 网络请求API.js (数据获取)
//   - 性能优化工具.js (缓存/骨架屏)
// ==========================================

import { api } from "../core/网络请求API.js";
import { proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { setCache, getCache, createSkeleton } from "../components/性能优化工具.js";
import { applyCardAnimation } from "../components/动画音效引擎.js";
import { t } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR } from "../core/全局配置.js";

// 缓存配置
const CACHE_KEY_PREFIX = "TasksCache";
const CACHE_TTL = 1000 * 60 * 30;  // 30分钟缓存
const PAGE_SIZE = 20;

// 缓存当前用户
let currentUserCache = null;

// 🔧 修复内存泄漏：保存当前筛选事件监听器引用，以便在重新创建时移除
let currentFilterHandler = null;

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
    { value: "favorites", label: "⭐ 最多收藏" }
];

/**
 * 📝 创建任务榜视图
 */
export function createTasksView(currentUser, keyword = "") {
    currentUserCache = currentUser;
    const searchKeyword = keyword.toLowerCase();
    
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
        <!-- 任务列表容器 -->
        <div id="tasks-list" style="display: flex; flex-direction: column; gap: 12px; padding: 15px; overflow-y: auto; flex: 1;">
            <!-- 加载占位 -->
            <div id="tasks-loading" style="text-align: center; padding: 40px; color: #888;">
                <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
                ${t('task.loading')}
            </div>
        </div>
        
        <!-- 加载更多 -->
        <div id="load-more-wrapper" style="display: none; padding: 15px; text-align: center; border-top: 1px solid #333;">
            <button id="btn-load-more" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">
                ${t('task.load_more')}
            </button>
        </div>
    `;
    
    // 🔌 绑定事件
    const tasksList = container.querySelector("#tasks-list");
    const loadMoreWrapper = container.querySelector("#load-more-wrapper");
    const loadMoreBtn = container.querySelector("#btn-load-more");
    
    let currentPage = 1;
    let currentStatus = "";
    let currentSort = "latest";
    let allTasksData = [];  // 全量数据缓存
    let isLoadingFromNetwork = false;
    
    // 🎯 监听外部筛选变化事件
    const handleFilterChange = (e) => {
        const { status, sort } = e.detail;
        
        // 状态变化时，需要重新加载数据（因为后端按状态过滤）
        if (status !== undefined && status !== currentStatus) {
            currentStatus = status;
            currentPage = 1;
            loadTasks(1, false);
            return;
        }
        
        // 排序变化时，本地排序优先
        if (sort) {
            currentSort = sort;
            currentPage = 1;
            
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
                sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case "deadline":
                sorted.sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity));
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
    const loadTasks = async (page = 1, append = false) => {
        const cacheKey = getCacheKey();
        
        // ✅ 优先从本地缓存读取
        if (!append && page === 1) {
            const cachedData = getCache(cacheKey);
            if (cachedData && cachedData.length > 0) {
                // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
                allTasksData = proxyImages(cachedData);
                renderTasksFromCache(allTasksData);
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
            
            const res = await api.getTasks(page, PAGE_SIZE, currentStatus || null, currentSort);
            const tasks = res.data || [];
            const total = res.total || 0;
            isLoadingFromNetwork = false;
            
            // 缓存第一页数据
            if (page === 1) {
                allTasksData = tasks;
                setCache(cacheKey, tasks, CACHE_TTL, true);  // 持久化到localStorage
            } else {
                allTasksData = [...allTasksData, ...tasks];
            }
            
            if (!append) {
                tasksList.innerHTML = "";
            }
            
            // 🔍 搜索过滤
            let displayTasks = tasks;
            if (searchKeyword) {
                displayTasks = tasks.filter(task => {
                    const text = `${task.title||''} ${task.description||''} ${task.publisher_name||''} ${task.publisher||''}`.toLowerCase();
                    return text.includes(searchKeyword);
                });
            }
            
            if (displayTasks.length === 0 && page === 1) {
                tasksList.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #666;">
                        <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📝</div>
                        <div style="font-size: 14px; margin-bottom: 8px;">${t('task.no_tasks')}</div>
                        <div style="font-size: 12px; color: #888;">${t('task.be_first')}</div>
                    </div>
                `;
                loadMoreWrapper.style.display = "none";
                return;
            }
            
            // 渲染任务卡片
            const cards = [];
            displayTasks.forEach(task => {
                const card = createTaskCard(task);
                cards.push(card);
                tasksList.appendChild(card);
            });
            
            // ✨ 应用数据流动画（仅首次加载）
            if (!append && page === 1) {
                const visibleCount = Math.min(cards.length, 8);
                cards.forEach((card, index) => {
                    applyCardAnimation(card, 'dataflow', index, visibleCount);
                });
            }
            
            // 显示/隐藏加载更多（基于过滤后的数据）
            const loadedCount = page * PAGE_SIZE;
            const filteredTotal = searchKeyword ? displayTasks.length : total;
            if (loadedCount < filteredTotal) {
                loadMoreWrapper.style.display = "block";
            } else {
                loadMoreWrapper.style.display = "none";
            }
            
        } catch (err) {
            console.error("加载任务失败:", err);
            isLoadingFromNetwork = false;
            // 网络失败时尝试从缓存读取
            if (!append) {
                const cachedData = getCache(cacheKey);
                if (cachedData && cachedData.length > 0) {
                    // 🚀 缓存数据也需要过一遍图片代理
                    allTasksData = proxyImages(cachedData);
                    renderTasksFromCache(allTasksData);
                    showToast(t('task.network_cache'), "warning");
                } else {
                    tasksList.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #F44336;">
                            <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                            ${t('task.load_failed')}
                        </div>
                    `;
                }
            }
        }
    };
    
    // 从缓存渲染任务列表
    const renderTasksFromCache = (tasks) => {
        tasksList.innerHTML = "";
        
        // 🔍 搜索过滤
        let filteredTasks = tasks;
        if (searchKeyword) {
            filteredTasks = tasks.filter(task => {
                const text = `${task.title||''} ${task.description||''} ${task.publisher_name||''} ${task.publisher||''}`.toLowerCase();
                return text.includes(searchKeyword);
            });
        }
        
        if (filteredTasks.length === 0) {
            tasksList.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #666;">
                    <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📝</div>
                    <div style="font-size: 14px; margin-bottom: 8px;">${t('task.no_tasks')}</div>
                    <div style="font-size: 12px; color: #888;">${t('task.be_first')}</div>
                </div>
            `;
            loadMoreWrapper.style.display = "none";
            return;
        }
        
        // 渲染第一页
        const firstPage = filteredTasks.slice(0, PAGE_SIZE);
        const cards = [];
        firstPage.forEach(task => {
            const card = createTaskCard(task);
            cards.push(card);
            tasksList.appendChild(card);
        });
        
        // ✨ 应用数据流动画
        const visibleCount = Math.min(cards.length, 8);
        cards.forEach((card, index) => {
            applyCardAnimation(card, 'dataflow', index, visibleCount);
        });
        
        // 显示加载更多
        if (filteredTasks.length > PAGE_SIZE) {
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
            const res = await api.getTasks(1, PAGE_SIZE, currentStatus || null, currentSort);
            const tasks = res.data || [];
            isLoadingFromNetwork = false;
            
            // 更新缓存
            const cacheKey = getCacheKey();
            setCache(cacheKey, tasks, CACHE_TTL, true);
            
            // 对比新旧数据，有变化时重新渲染
            if (_tasksDataChanged(allTasksData, tasks)) {
                console.log(`✅ 任务榜 ${currentSort} 检测到新数据，执行静默更新`);
                allTasksData = proxyImages(tasks);
                renderTasksFromCache(allTasksData);
            } else {
                allTasksData = tasks;
            }
        } catch (err) {
            isLoadingFromNetwork = false;
            console.warn("后台更新失败:", err);
        }
    };
    
    /** 对比任务数据是否有变化 */
    const _tasksDataChanged = (oldData, newData) => {
        if (!oldData || !newData) return true;
        if (oldData.length !== newData.length) return true;
        const checkCount = Math.min(10, oldData.length);
        for (let i = 0; i < checkCount; i++) {
            if ((oldData[i].id) !== (newData[i].id)) return true;
            if ((oldData[i].status) !== (newData[i].status)) return true;
            if ((oldData[i].likes || 0) !== (newData[i].likes || 0)) return true;
            if ((oldData[i].favorites || 0) !== (newData[i].favorites || 0)) return true;
            if ((oldData[i].views || 0) !== (newData[i].views || 0)) return true;
            if (((oldData[i].applicants || []).length) !== ((newData[i].applicants || []).length)) return true;
        }
        return false;
    };
    
    // 加载更多
    loadMoreBtn.onclick = () => {
        currentPage++;
        loadTasks(currentPage, true);
    };
    
    // 初始加载
    loadTasks(1);
    
    return container;
}

/**
 * 🎴 创建单个任务卡片
 */
function createTaskCard(task) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        background: "#1e1e1e",
        borderRadius: "10px",
        padding: "15px",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        border: "1px solid #333"
    });
    
    // 状态标签样式
    const statusStyles = {
        open: { bg: "#4CAF50", textKey: "task.status_open" },
        in_progress: { bg: "#2196F3", textKey: "task.status_in_progress" },
        submitted: { bg: "#FF9800", textKey: "task.status_submitted" },
        completed: { bg: "#9E9E9E", textKey: "task.status_completed" },
        disputed: { bg: "#F44336", textKey: "task.status_disputed" },
        cancelled: { bg: "#757575", textKey: "task.status_cancelled" },
        expired: { bg: "#795548", textKey: "task.status_expired" }
    };
    
    const status = statusStyles[task.status] || { bg: "#666", textKey: "task.status_unknown" };
    const statusText = t(status.textKey);
    const timeStr = formatTime(task.created_at);
    const deadline = formatDeadline(task.deadline);
    
    // 检查是否逾期（进行中但超过截止日期）
    const isOverdue = task.is_overdue || (task.status === "in_progress" && task.deadline && task.deadline < new Date().toISOString().slice(0, 10));
    const overdueTag = isOverdue ? `<span style="background: #F44336; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 6px;">${t('task.overdue')}</span>` : "";
    
    // 过期卡片样式
    if (task.status === "expired" || isOverdue) {
        card.style.opacity = "0.7";
        card.style.borderColor = "#F44336";
    }
    
    card.innerHTML = `
        <!-- 顶部：状态 + 价格 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; align-items: center;">
                <span style="background: ${status.bg}; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
                    ${statusText}
                </span>
                ${overdueTag}
            </div>
            <span style="color: #FF9800; font-size: 16px; font-weight: bold;">
                💰 ${task.total_price} ${t('task.points')}
            </span>
        </div>
        
        <!-- 标题 -->
        <div style="font-size: 15px; font-weight: 500; color: #fff; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
            ${escapeHtml(task.title)}
        </div>
        
        <!-- 描述 -->
        <div style="font-size: 12px; color: #999; margin-bottom: 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5;">
            ${escapeHtml(task.description)}
        </div>
        
        <!-- 底部信息 -->
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #888; padding-top: 10px; border-top: 1px solid #333;">
            <!-- 发布者（SWR 缓存头像） -->
            <div id="task-author-${task.id}" style="display: flex; align-items: center; gap: 6px;"></div>
            
            <!-- 截止日期 + 申请人数 + 访问量 + 点赞 + 收藏 -->
            <div style="display: flex; align-items: center; gap: 10px;">
                <span>⏰ ${deadline}</span>
                ${task.status === "open" ? `<span>👥 ${(task.applicants || []).length} ${t('task.applicants')}</span>` : ""}
                <span>🔥 ${task.views || 0}</span>
                <span>❤️ ${task.likes || 0}</span>
                <span>⭐ ${task.favorites || 0}</span>
            </div>
        </div>
    `;
    
    // 🚀 SWR 头像渲染：先从缓存读取，后台静默校对
    setTimeout(() => {
        const authorContainer = card.querySelector(`#task-author-${task.id}`);
        if (!authorContainer) return;
        
        const account = task.publisher;
        const cached = getCachedProfile(account);
        const avatar = cached?.avatar || task.publisher_avatar || '';
        const name = cached?.name || task.publisher_name || account || '';
        
        // 内联 SVG 默认头像（用户剪影图标）
        const DEFAULT_AVATAR_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23333'/%3E%3Ccircle cx='18' cy='14' r='6' fill='%23666'/%3E%3Cpath d='M6 32c0-6.6 5.4-12 12-12s12 5.4 12 12' fill='%23666'/%3E%3C/svg%3E";
        
        // 渲染头像（始终使用 img 标签）
        const avatarSrc = avatar || DEFAULT_AVATAR_SVG;
        const avatarHtml = `<img class="swr-avatar" src="${avatarSrc}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1px solid #444; background: #333;">`;
        
        authorContainer.innerHTML = `${avatarHtml}<span class="swr-name">${escapeHtml(name)}</span>`;
        
        // 后台静默校对
        getProfileWithSWR(account, api.getUserProfile, (profile) => {
            const avatarEl = authorContainer.querySelector('.swr-avatar');
            const nameEl = authorContainer.querySelector('.swr-name');
            if (avatarEl && profile.avatar) {
                avatarEl.src = profile.avatar;
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
        import("./任务详情组件.js").then(module => {
            const view = module.createTaskDetailView(task.id, currentUserCache);
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
 * 📅 格式化截止日期
 */
function formatDeadline(deadline) {
    if (!deadline) return t('time.unlimited');
    
    try {
        const date = new Date(deadline);
        const now = new Date();
        const diff = date - now;
        
        if (diff < 0) return t('time.deadline_ended');
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return t('time.deadline_today');
        if (days === 1) return t('time.deadline_tomorrow');
        if (days < 7) return t('time.deadline_days', { n: days });
        
        return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
        return deadline;
    }
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
