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
const CACHE_EXPIRE_TIME = 1000 * 60 * 60 * 2;  // 缓存有效期：2小时
const PAGE_SIZE = 20;                           // 每页数量
const CREATORS_PAGE_SIZE = 12;                  // 创作者每页数量（卡片更大）


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
            isFullyLoaded: false // 是否已加载完所有数据
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
    getRenderToken 
}) {
    // ========== 💬 讨论区特殊处理 ==========
    if (tab === "posts") {
        try {
            const postsModule = await getPostsView();
            const postsView = postsModule.createPostsView(currentUser);
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
            const tasksView = tasksModule.createTasksView(currentUser);
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
    
    // 停止之前的分页加载器
    if (state.loader) {
        state.loader.stop();
    }
    
    // ========== 渲染函数：渲染一批数据 ==========
    const renderBatch = (dataArray, append = false) => {
        if (renderToken !== getRenderToken()) return;
        
        // 搜索过滤
        let displayData = dataArray;
        if (keyword) {
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
        
        if (tab === "tools" || tab === "apps" || tab === "recommends") {
            displayData.forEach(data => {
                const card = createItemCard(data, currentUser);
                cards.push(card);
                fragment.appendChild(card);
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
        
        state.displayedCount += displayData.length;
        return displayData.length;
    };
    
    // ========== 分页加载更多函数 ==========
    const loadMoreData = async (page, size) => {
        // 计算要显示的数据范围
        const start = (page - 1) * size;
        const end = start + size;
        
        // 从全量数据中截取
        let dataSlice = state.allData;
        if (keyword) {
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
    
    // 只有有效缓存才直接返回
    if (hasCacheData && !isCacheExpired && !keyword) {
        // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
        const proxiedData = proxyImages(cachedData);
        state.allData = proxiedData;
        state.isFullyLoaded = true;
        
        // 首屏渲染（仅第一页）
        const firstPage = proxiedData.slice(0, pageSize);
        renderBatch(firstPage, false);
        
        // 如果有更多数据，启动分页加载器
        if (proxiedData.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword);
        }
        
        return;
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
            response = await api.getCreators(sort, 100);
            realData = response.data || [];
            realData = proxyImages(realData);  // 确保图片走本地缓存代理
        }
        
        // 存入缓存
        setCache(cacheKey, realData, CACHE_EXPIRE_TIME, true);
        
        // 更新状态
        state.allData = realData;
        state.isFullyLoaded = true;
        
        // 渲染首屏
        const firstPage = realData.slice(0, pageSize);
        renderBatch(firstPage, false);
        
        // 启动分页加载器
        if (realData.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword);
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
function _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword) {
    // 获取滚动容器（侧边栏主容器）
    const scrollContainer = contentArea.closest(".sidebar-scroll-container") || contentArea.parentElement;
    
    if (!scrollContainer) {
        console.warn("⚠️ 未找到滚动容器，分页加载无法启动");
        return;
    }
    
    // 创建分页加载器
    const loader = createPaginationLoader({
        container: scrollContainer,
        pageSize: pageSize,
        threshold: 300,
        loadMore: async (page, size) => {
            // 过滤后的数据总量
            let totalData = state.allData;
            if (keyword) {
                totalData = state.allData.filter(item => {
                    const textStr = `${item.title||''} ${item.shortDesc||''} ${item.name||''} ${item.account||''}`.toLowerCase();
                    return textStr.includes(keyword);
                });
            }
            
            // 如果已显示完所有数据，返回空数组停止加载
            if (state.displayedCount >= totalData.length) {
                return [];
            }
            
            return loadMoreData(page, size);
        }
    });
    
    state.loader = loader;
    loader.start();
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
                } else if (tab === "posts" || tab === "tasks") {
                    // 讨论区/任务榜使用独立组件，不需要预加载
                    continue;
                } else {
                    const itemType = tab === "tools" ? "tool" : (tab === "apps" ? "app" : "recommend");
                    response = await api.getItems(itemType, sort, 200);
                    data = proxyImages(response.data || []);  // 确保图片走本地缓存代理
                }
                setCache(cacheKey, data, CACHE_EXPIRE_TIME, true);
            } catch {
                // 静默失败，不影响用户体验
            }
        }
    }
}
