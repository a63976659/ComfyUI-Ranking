// 前端页面/core/侧边栏数据引擎.js
// ==========================================
// 📊 侧边栏数据加载引擎
// ==========================================
// 作用：负责列表数据的加载、缓存、分页、渲染
// 关联文件：
//   - 网络请求API.js (数据获取)
//   - 列表卡片组件.js (工具/应用卡片渲染)
//   - 创作者卡片组件.js (创作者卡片渲染)
//   - 性能优化工具.js (分页加载、骨架屏)
// ==========================================
// ⚡ P1性能优化：
//   - 首屏仅加载 PAGE_SIZE 条数据
//   - 滚动到底部自动加载更多
//   - 骨架屏加载动画
//   - 增强缓存策略
// ==========================================

import { api } from "./网络请求API.js";
import { proxyImages } from "./网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { createCreatorCard } from "../market/创作者卡片组件.js";
import { 
    createPaginationLoader, 
    createSkeleton, 
    setCache, 
    getCache,
    getCacheWithMeta,
    lazyLoadImages 
} from "../components/性能优化工具.js";
import { applyCardAnimation, getAnimationTypeForTab } from "../components/动画音效引擎.js";

// 💬 讨论区组件（动态导入）
let postsViewModule = null;
async function getPostsView() {
    if (!postsViewModule) {
        postsViewModule = await import("../post/讨论区组件.js");
    }
    return postsViewModule;
}

// 📝 任务榜组件（动态导入）
let tasksViewModule = null;
async function getTasksView() {
    if (!tasksViewModule) {
        tasksViewModule = await import("../task/任务榜组件.js");
    }
    return tasksViewModule;
}


// ==========================================
// 🔧 配置常量
// ==========================================
const PAGE_SIZE = 20;                           // 每页数量
const CREATORS_PAGE_SIZE = 12;                  // 创作者每页数量（卡片更大）

/**
 * ⏱️ 获取缓存过期时间（毫秒）
 * 从用户设置中读取，默认2小时（7200秒）
 * @returns {number} 缓存过期时间（毫秒）
 */
function getCacheExpireTime() {
    try {
        const settingsStr = localStorage.getItem('ComfyCommunity_Settings');
        if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            const seconds = parseInt(settings.cacheExpireSeconds);
            if (seconds && seconds >= 60 && seconds <= 86400) {
                return seconds * 1000;  // 转为毫秒
            }
        }
    } catch (e) {}
    return 1000 * 60 * 60 * 2;  // 默认2小时
}

// ==========================================
// 🔄 本地排序函数
// ==========================================
function sortDataLocally(data, tab, sort) {
    const sorted = [...data]; // 不修改原数组
    
    if (tab === "creators") {
        // 创作者排序（与后端 get_creators 一致）
        switch (sort) {
            case "likes": sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0)); break;
            case "favorites": sorted.sort((a, b) => (b.favorites || 0) - (a.favorites || 0)); break;
            case "downloads": sorted.sort((a, b) => (b.downloads || 0) - (a.downloads || 0)); break;
            case "tips": sorted.sort((a, b) => (b.recent_tips || 0) - (a.recent_tips || 0)); break;
            case "views": sorted.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
            case "daily_views": sorted.sort((a, b) => (b.daily_views || 0) - (a.daily_views || 0)); break;
            default: sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); break; // time
        }
    } else {
        // 工具/应用/推荐排序（与后端 get_items 一致）
        switch (sort) {
            case "downloads": sorted.sort((a, b) => (b.uses || 0) - (a.uses || 0)); break;
            case "likes": sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0)); break;
            case "favorites": sorted.sort((a, b) => (b.favorites || 0) - (a.favorites || 0)); break;
            case "tips": 
                // 后端使用 tip_history 的当月数据排序
                sorted.sort((a, b) => {
                    const now = new Date();
                    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const tipA = (a.tip_history || {})[currentMonth] || 0;
                    const tipB = (b.tip_history || {})[currentMonth] || 0;
                    return tipB - tipA;
                });
                break;
            case "views": sorted.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
            case "daily_views": sorted.sort((a, b) => (b.daily_views || 0) - (a.daily_views || 0)); break;
            default: sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); break; // time
        }
    }
    return sorted;
}

/**
 * 从同 tab 的任意排序状态中获取已有数据
 */
function findExistingTabData(tab) {
    for (const [key, state] of paginationStates) {
        if (key.startsWith(tab + "_") && state.allData.length > 0) {
            return state.allData;
        }
    }
    return null;
}


// ==========================================
// 📦 分页状态管理
// ==========================================
// 每个标签页独立的分页状态
const paginationStates = new Map();

/**
 * 获取或创建分页状态
 */
function getPaginationState(tab, sort) {
    const key = `${tab}_${sort}`;
    if (!paginationStates.has(key)) {
        paginationStates.set(key, {
            allData: [],        // 全量数据（从缓存或网络加载）
            displayedCount: 0,  // 已渲染数量
            loader: null,       // 分页加载器实例
            isFullyLoaded: false, // 是否已加载完所有数据
            isSearchResult: false // 标记是否为搜索结果（用于区分正常数据和搜索结果）
        });
    }
    return paginationStates.get(key);
}


// ==========================================
// 🚀 主加载函数
// ==========================================
export async function loadSidebarContent({ 
    tab, 
    sort, 
    keyword, 
    contentArea, 
    currentUser, 
    renderToken, 
    getRenderToken,
    force = false,
    expandItemId = null  // 新增：要自动展开的卡片ID
}) {
    // ========== 💬 讨论区特殊处理 ==========
    if (tab === "posts") {
        try {
            const postsModule = await getPostsView();
            const postsView = postsModule.createPostsView(currentUser, keyword);
            contentArea.innerHTML = "";
            contentArea.appendChild(postsView);
            // 触发帖子列表加载
            if (postsModule.loadPosts) {
                postsModule.loadPosts();
            }
        } catch (error) {
            console.error("讨论区加载失败:", error);
            // 使用安全的DOM操作替代innerHTML，防止XSS
            contentArea.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'text-align:center; padding: 40px 20px; color:#F44336;';
            errorDiv.textContent = `❌ 讨论区加载失败: ${error.message}`;
            contentArea.appendChild(errorDiv);
        }
        return;
    }
    
    // ========== 📝 任务榜特殊处理 ==========
    if (tab === "tasks") {
        try {
            const tasksModule = await getTasksView();
            const tasksView = tasksModule.createTasksView(currentUser, keyword);
            contentArea.innerHTML = "";
            contentArea.appendChild(tasksView);
        } catch (error) {
            console.error("任务榜加载失败:", error);
            // 使用安全的DOM操作替代innerHTML，防止XSS
            contentArea.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'text-align:center; padding: 40px 20px; color:#F44336;';
            errorDiv.textContent = `❌ 任务榜加载失败: ${error.message}`;
            contentArea.appendChild(errorDiv);
        }
        return;
    }
    
    const cacheKey = `ListCache_${tab}_${sort}`;
    const state = getPaginationState(tab, sort);
    const pageSize = tab === "creators" ? CREATORS_PAGE_SIZE : PAGE_SIZE;
    
    // ========== 🔄 强制刷新：清除当前 tab/sort 的内存缓存 ==========
    if (force) {
        state.allData = [];
        state.displayedCount = 0;
        state.isFullyLoaded = false;
    }
    
    // 停止之前的分页加载器
    if (state.loader) {
        state.loader.stop();
    }
    
    // ========== 渲染函数：渲染一批数据 ==========
    const renderBatch = (dataArray, append = false) => {
        if (renderToken !== getRenderToken()) return;
        
        // 搜索过滤（创作者Tab有keyword时不进行本地过滤，因为后端已过滤）
        let displayData = dataArray;
        if (keyword && tab !== "creators") {
            displayData = dataArray.filter(item => {
                const textStr = `${item.title||''} ${item.shortDesc||''} ${item.name||''} ${item.account||''}`.toLowerCase();
                return textStr.includes(keyword);
            });
        }
        
        // 首次渲染清空容器
        if (!append) {
            contentArea.innerHTML = "";
            state.displayedCount = 0;
        }
        
        // 空数据处理
        if (displayData.length === 0 && state.displayedCount === 0) {
            contentArea.innerHTML = `
                <div style='text-align:center; padding: 40px 20px; color:#888;'>
                    ${keyword ? '🔍 没有搜索到相关内容' : '📭 暂无数据，快来抢沙发吧！'}
                </div>
            `;
            return 0;
        }
        
        // 渲染卡片
        const fragment = document.createDocumentFragment();
        const animationType = getAnimationTypeForTab(tab);
        const cards = [];
        let targetCard = null;  // 用于保存需要展开的目标卡片
        
        if (tab === "tools" || tab === "apps" || tab === "recommends") {
            displayData.forEach(data => {
                const card = createItemCard(data, currentUser);
                cards.push(card);
                fragment.appendChild(card);
                // 检查是否是需要展开的卡片
                if (expandItemId && data.id === expandItemId) {
                    targetCard = card;
                }
            });
        } else if (tab === "creators") {
            displayData.forEach(data => {
                const card = createCreatorCard(data, currentUser);
                cards.push(card);
                fragment.appendChild(card);
            });
        }
        
        contentArea.appendChild(fragment);
        
        // ✨ 应用动画（仅对首次渲染的可见卡片）
        if (!append) {
            const visibleCount = Math.min(cards.length, 10); // 只对前10张卡片播放动画
            cards.forEach((card, index) => {
                applyCardAnimation(card, animationType, index, visibleCount);
            });
        }
        
        // 对新渲染的图片启用懒加载
        lazyLoadImages(contentArea, "img:not(.lazy-loaded):not(.lazy-loading)");
        
        // 🔔 自动展开目标卡片（如果有）
        if (targetCard && !append) {
            requestAnimationFrame(() => {
                // 滚动到卡片位置
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 模拟点击摘要区域展开卡片
                const summary = targetCard.querySelector('.item-summary') || targetCard.firstElementChild;
                if (summary) summary.click();
            });
        }
        
        // 【问题1修复】首屏未找到目标卡片，fallback到独立详情页
        if (expandItemId && !targetCard && !append) {
            (async () => {
                try {
                    const res = await api.getItemById(expandItemId);
                    if (res.status === "success" && res.data) {
                        const module = await import("../market/资源详情页面组件.js");
                        const view = module.createItemDetailView(res.data, currentUser);
                        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
                    }
                } catch (e) {
                    console.error("展开卡片 fallback 失败:", e);
                }
            })();
        }
        
        state.displayedCount += displayData.length;
        return displayData.length;
    };
    
    // ========== 分页加载更多函数 ==========
    const loadMoreData = async (page, size) => {
        // 计算要显示的数据范围
        const start = (page - 1) * size;
        const end = start + size;
        
        // 从全量数据中截取（创作者Tab有keyword时不进行本地过滤，因为后端已过滤）
        let dataSlice = state.allData;
        if (keyword && tab !== "creators") {
            dataSlice = state.allData.filter(item => {
                const textStr = `${item.title||''} ${item.shortDesc||''} ${item.name||''} ${item.account||''}`.toLowerCase();
                return textStr.includes(keyword);
            });
        }
        
        const batch = dataSlice.slice(start, end);
        
        if (batch.length > 0) {
            renderBatch(batch, true);
        }
        
        return batch;
    };
    
    // ========== 尝试从缓存加载 ==========
    // 获取完整缓存信息（包含过期状态）
    const { value: cachedData, expired: isCacheExpired, found: hasCacheData } = getCacheWithMeta(cacheKey, true);
    
    // 有缓存时直接渲染缓存（搜索时也使用缓存，renderBatch 会处理 keyword 过滤）
    // 🔍 创作者Tab有keyword时不使用缓存，每次都从后端搜索
    // 🔍 如果当前state是搜索结果且keyword为空，跳过缓存，强制从网络重新加载全量数据
    const skipCache = (tab === "creators" && keyword) || (tab === "creators" && !keyword && state.isSearchResult);
    if (!force && hasCacheData && !skipCache) {
        // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
        const proxiedData = proxyImages(cachedData);
        state.allData = proxiedData;
        state.isFullyLoaded = true;
        
        // 首屏渲染（仅第一页）
        const firstPage = proxiedData.slice(0, pageSize);
        renderBatch(firstPage, false);
        
        // 如果有更多数据，启动分页加载器
        if (proxiedData.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
        }
        
        // 【新增】Tab 切换后台静默刷新 —— 仅缓存过期时触发
        if (isCacheExpired) {
            console.log(`🔄 缓存已过期，${tab}_${sort} 启动后台静默刷新...`);
            
            setTimeout(async () => {
                // 防竞态检查1：用户是否已切走
                if (renderToken !== getRenderToken()) return;
                
                try {
                    let newData;
                    if (tab === "tools" || tab === "apps" || tab === "recommends") {
                        const itemType = tab === "tools" ? "tool" : (tab === "apps" ? "app" : "recommend");
                        const response = await api.getItems(itemType, sort, 200);
                        newData = proxyImages(response.data || []);
                    } else if (tab === "creators") {
                        const response = await api.getCreators(sort, 100);
                        newData = proxyImages(response.data || []);
                    } else {
                        return; // posts/tasks 不走这个路径
                    }
                    
                    // 防竞态检查2：网络请求完成后再验证
                    if (renderToken !== getRenderToken()) return;
                    
                    // 对比新旧数据
                    if (_shouldUpdateData(state.allData, newData)) {
                        console.log(`✅ ${tab}_${sort} 检测到新数据，执行静默更新`);
                        state.allData = newData;
                        state.displayedCount = 0; // 重置分页计数
                        const shouldPersist = tab !== "creators";
                        setCache(cacheKey, newData, getCacheExpireTime(), shouldPersist);
                        
                        // 完整重新渲染（替代之前只更新数字的方案）
                        contentArea.innerHTML = "";
                        const firstPage = newData.slice(0, pageSize);
                        renderBatch(firstPage, false);
                        
                        if (newData.length > pageSize) {
                            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
                        }
                    } else {
                        // 数据无变化，仅刷新缓存过期时间
                        const shouldPersist = tab !== "creators";
                        setCache(cacheKey, state.allData, getCacheExpireTime(), shouldPersist);
                    }
                } catch (err) {
                    console.warn(`⚠️ ${tab}_${sort} 后台刷新失败:`, err);
                }
            }, 0);
        }
        
        return;
    }
    
    // ========== 🔄 本地排序优先：同 tab 已有数据时直接排序渲染（强制刷新时跳过）==========
    // 🔍 创作者Tab有keyword时不走本地排序优先，必须调用后端搜索API
    // 🔍 创作者Tab清空搜索框后也不走本地排序优先，避免使用搜索时的部分结果
    // 🔍 如果当前state是搜索结果，也不走本地排序优先
    // 仅在"正在搜索"或"刚清空搜索但state仍是搜索结果"时跳过本地排序
    const isCreatorSearching = tab === "creators" && keyword;
    const isCreatorSearchCleared = tab === "creators" && !keyword && state.isSearchResult;
    const skipLocalSort = isCreatorSearching || isCreatorSearchCleared || state.isSearchResult;
    const existingData = findExistingTabData(tab);
    if (!force && !skipLocalSort && existingData && existingData.length > 0) {
        const locallySorted = sortDataLocally(existingData, tab, sort);
        state.allData = locallySorted;
        state.isFullyLoaded = true;
        
        // 首屏渲染
        const firstPage = locallySorted.slice(0, pageSize);
        renderBatch(firstPage, false);
        
        // 启动分页加载器
        if (locallySorted.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
        }
        
        // 存入当前排序的缓存（创作者数据不持久化到 localStorage）
        const shouldPersist = tab !== "creators";
        setCache(cacheKey, locallySorted, getCacheExpireTime(), shouldPersist);
        
        return; // 本地排序后直接返回，不需要后台刷新（数据是同一批）
    }
    
    // ========== 显示加载骨架屏 ==========
    contentArea.innerHTML = "";
    const skeleton = createSkeleton(tab === "creators" ? "list" : "card", 3);
    contentArea.appendChild(skeleton);
    
    // ========== 从网络加载数据 ==========
    try {
        let response, realData;
        
        if (tab === "tools" || tab === "apps" || tab === "recommends") {
            const itemType = tab === "tools" ? "tool" : (tab === "apps" ? "app" : "recommend");
            response = await api.getItems(itemType, sort, 200);  // 获取较多数据
            realData = response.data || [];
            realData = proxyImages(realData);  // 确保图片走本地缓存代理
        } else if (tab === "creators") {
            // 🔍 创作者搜索：有 keyword 时调用后端搜索API，否则获取列表
            if (keyword) {
                response = await api.searchCreators(keyword, sort);
                realData = response.data || [];
                realData = proxyImages(realData);  // 确保图片走本地缓存代理
                // 标记为搜索结果，不存入缓存，避免污染正常数据
                state.isSearchResult = true;
            } else {
                response = await api.getCreators(sort, 100);
                realData = response.data || [];
                realData = proxyImages(realData);  // 确保图片走本地缓存代理
                // 正常数据，清除搜索标记
                state.isSearchResult = false;
            }
        }
        
        // 存入缓存（创作者数据不持久化到 localStorage，且搜索结果不存入缓存）
        const shouldPersist = tab !== "creators";
        const isCreatorSearch = tab === "creators" && keyword;
        if (!isCreatorSearch) {
            setCache(cacheKey, realData, getCacheExpireTime(), shouldPersist);
        }
        
        // 更新状态
        state.allData = realData;
        state.isFullyLoaded = true;
        
        // 渲染首屏
        const firstPage = realData.slice(0, pageSize);
        renderBatch(firstPage, false);
        
        // 启动分页加载器
        if (realData.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
        }
        
    } catch (error) {
        console.error("数据加载失败:", error);
        
        // 🚀 回退到任何可用缓存（包括过期的）
        if (hasCacheData && cachedData) {
            console.warn(`📴 网络失败，降级显示${isCacheExpired ? '过期' : ''}缓存`);
            state.allData = cachedData;
            renderBatch(cachedData.slice(0, pageSize), false);
            
            // 如果是过期缓存，显示提示
            if (isCacheExpired) {
                const toastDiv = document.createElement('div');
                toastDiv.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#FF9800; color:white; padding:10px 20px; border-radius:4px; z-index:10000; font-size:14px;';
                toastDiv.textContent = '⚠️ 网络连接失败，展示的是上次缓存的数据';
                document.body.appendChild(toastDiv);
                setTimeout(() => toastDiv.remove(), 3000);
            }
            return;
        }
        
        // 无任何缓存，显示原有的错误信息
        // 使用安全的DOM操作替代innerHTML，防止XSS
        contentArea.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'text-align:center; padding: 40px 20px; color:#F44336;';
        const errorText = document.createElement('div');
        errorText.textContent = `❌ 数据加载失败: ${error.message}`;
        errorDiv.appendChild(errorText);
        const br = document.createElement('br');
        errorDiv.appendChild(br);
        const retryBtn = document.createElement('button');
        retryBtn.style.cssText = 'padding:8px 16px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; margin-top:16px;';
        retryBtn.textContent = '🔄 点击重试';
        retryBtn.onclick = () => location.reload();
        errorDiv.appendChild(retryBtn);
        contentArea.appendChild(errorDiv);
    }
}


// ==========================================
// 📜 设置分页加载器
// ==========================================
function _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab) {
    // 获取滚动容器（侧边栏主容器）
    const scrollContainer = contentArea.closest(".sidebar-scroll-container") || contentArea.parentElement;
    
    if (!scrollContainer) {
        console.warn("⚠️ 未找到滚动容器，分页加载无法启动");
        return;
    }
    
    // 计算数据总量（考虑搜索过滤，创作者Tab有keyword时不进行本地过滤，因为后端已过滤）
    const getTotalDataCount = () => {
        if (!keyword) return state.allData.length;
        // 创作者Tab后端搜索已过滤，直接返回全部数据
        if (tab === "creators") return state.allData.length;
        return state.allData.filter(item => {
            const textStr = `${item.title||''} ${item.shortDesc||''} ${item.name||''} ${item.account||''}`.toLowerCase();
            return textStr.includes(keyword);
        }).length;
    };
    
    // 创建分页加载器
    const loader = createPaginationLoader({
        container: scrollContainer,
        pageSize: pageSize,
        threshold: 300,
        loadMore: async (page, size) => {
            const totalCount = getTotalDataCount();
            
            // 如果已显示完所有数据，返回空数组停止加载
            if (state.displayedCount >= totalCount) {
                return [];
            }
            
            return loadMoreData(page, size);
        },
        onEnd: () => {
            // 显示"已经到底了"提示
            const totalCount = getTotalDataCount();
            // 只有在有数据且显示数量 >= 总数量时才显示
            if (totalCount > 0 && state.displayedCount >= totalCount) {
                _showEndIndicator(contentArea);
            }
        }
    });
    
    state.loader = loader;
    loader.start();
}

// ==========================================
// 🏁 显示"已经到底了"提示
// ==========================================
function _showEndIndicator(contentArea) {
    // 检查是否已存在
    if (contentArea.querySelector('.end-indicator')) return;
    
    const endIndicator = document.createElement('div');
    endIndicator.className = 'end-indicator';
    endIndicator.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #666; font-size: 13px;">
            — 已经到底了 —
        </div>
    `;
    contentArea.appendChild(endIndicator);
}


// ==========================================
// 🔄 刷新数据（强制从网络加载）
// ==========================================
export async function refreshSidebarContent(params) {
    const { tab, sort } = params;
    const cacheKey = `ListCache_${tab}_${sort}`;
    
    // 清除缓存
    const state = getPaginationState(tab, sort);
    state.allData = [];
    state.displayedCount = 0;
    state.isFullyLoaded = false;
    
    // 清除 localStorage 缓存
    try {
        localStorage.removeItem(`ComfyRanking_${cacheKey}`);
    } catch {}
    
    // 重新加载
    await loadSidebarContent(params);
}


/** 判断是否需要更新数据 —— 对比ID顺序和关键字段 */
function _shouldUpdateData(oldData, newData) {
    if (!oldData || !newData) return true;
    if (oldData.length !== newData.length) return true;
    
    // 检查ID顺序是否一致（检测排序变化、新增/删除）
    const checkCount = Math.min(10, oldData.length);
    for (let i = 0; i < checkCount; i++) {
        const oldId = oldData[i].id || oldData[i].account;
        const newId = newData[i].id || newData[i].account;
        if (oldId !== newId) return true;
        
        // 检查关键数字字段
        const keyFields = ['likes', 'downloads', 'uses', 'views', 'daily_views', 'recent_tips', 'favorites'];
        for (const field of keyFields) {
            if ((oldData[i][field] || 0) !== (newData[i][field] || 0)) return true;
        }
    }
    return false;
}



// ==========================================
// 📊 预加载相邻标签页数据
// ==========================================
export async function preloadAdjacentTabs(currentTab, sort) {
    const tabs = ["tools", "apps", "recommends", "creators", "tasks", "posts"];
    const currentIndex = tabs.indexOf(currentTab);
    
    // 预加载前后各一个标签页
    const adjacentTabs = [
        tabs[currentIndex - 1],
        tabs[currentIndex + 1]
    ].filter(Boolean);
    
    for (const tab of adjacentTabs) {
        const cacheKey = `ListCache_${tab}_${sort}`;
        const cached = getCache(cacheKey);
        
        // 如果没有缓存，后台静默加载
        if (!cached) {
            try {
                let response;
                let data;
                if (tab === "creators") {
                    response = await api.getCreators(sort, 100);
                    data = proxyImages(response.data || []);  // 确保图片走本地缓存代理
                    // 创作者数据不持久化到 localStorage，避免空间不足
                    setCache(cacheKey, data, getCacheExpireTime(), false);
                    continue;
                } else if (tab === "posts" || tab === "tasks") {
                    // 讨论区/任务榜使用独立组件，不需要预加载
                    continue;
                } else {
                    const itemType = tab === "tools" ? "tool" : (tab === "apps" ? "app" : "recommend");
                    response = await api.getItems(itemType, sort, 200);
                    data = proxyImages(response.data || []);  // 确保图片走本地缓存代理
                }
                setCache(cacheKey, data, getCacheExpireTime(), true);
            } catch {
                // 静默失败，不影响用户体验
            }
        }
    }
}
