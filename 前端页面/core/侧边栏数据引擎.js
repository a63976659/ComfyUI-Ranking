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
import { createItemCard } from "../market/列表卡片组件.js";
import { createCreatorCard } from "../market/创作者卡片组件.js";
import { 
    createPaginationLoader, 
    createSkeleton, 
    setCache, 
    getCache,
    lazyLoadImages 
} from "../components/性能优化工具.js";


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
        
        if (tab === "tools" || tab === "apps" || tab === "recommends") {
            displayData.forEach(data => {
                fragment.appendChild(createItemCard(data, currentUser));
            });
        } else if (tab === "creators") {
            displayData.forEach(data => {
                fragment.appendChild(createCreatorCard(data, currentUser));
            });
        }
        
        contentArea.appendChild(fragment);
        
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
    const cachedData = getCache(cacheKey);
    
    if (cachedData && !keyword) {
        // 缓存命中，直接使用
        state.allData = cachedData;
        state.isFullyLoaded = true;
        
        // 首屏渲染（仅第一页）
        const firstPage = cachedData.slice(0, pageSize);
        renderBatch(firstPage, false);
        
        // 如果有更多数据，启动分页加载器
        if (cachedData.length > pageSize) {
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
        } else if (tab === "creators") {
            response = await api.getCreators(sort, 100);
            realData = response.data || [];
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
        
        // 尝试从缓存恢复（即使过期）
        if (cachedData) {
            state.allData = cachedData;
            renderBatch(cachedData.slice(0, pageSize), false);
        } else {
            contentArea.innerHTML = `
                <div style='text-align:center; padding: 40px 20px; color:#F44336;'>
                    ❌ 数据加载失败: ${error.message}
                    <br><br>
                    <button onclick="location.reload()" style="padding:8px 16px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer;">
                        🔄 点击重试
                    </button>
                </div>
            `;
        }
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
    const tabs = ["tools", "apps", "recommends", "creators"];
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
                if (tab === "creators") {
                    response = await api.getCreators(sort, 100);
                } else {
                    const itemType = tab === "tools" ? "tool" : (tab === "apps" ? "app" : "recommend");
                    response = await api.getItems(itemType, sort, 200);
                }
                setCache(cacheKey, response.data || [], CACHE_EXPIRE_TIME, true);
            } catch {
                // 静默失败，不影响用户体验
            }
        }
    }
}
