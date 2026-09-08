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
// 🔍 搜索时撤销上一次在途请求所需的取消管理器与分组 ID
import { requestCancelManager } from "./网络请求API.js";
import { API } from "./全局配置.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { createCreatorCard } from "../market/创作者卡片组件.js";
import { 
    createPaginationLoader, 
    createSkeleton, 
    setCache, 
    getCacheWithMeta,
    lazyLoadImages 
} from "../components/性能优化工具.js";
import { applyViewportAnimations, getAnimationTypeForTab } from "../components/动画音效引擎.js";
import { t } from "../components/用户体验增强.js";
import { showToast } from "../components/UI交互提示组件.js";  // 🔧 降级提示改走统一组件（原为手写 div）

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

// 🧩 提示词组件（动态导入）
let promptsViewModule = null;
async function getPromptsView() {
    if (!promptsViewModule) {
        promptsViewModule = await import("../prompt/提示词组件.js");
    }
    return promptsViewModule;
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
let _lastSortInput = null;
let _lastSortKey = '';
let _lastSortResult = null;

function sortDataLocally(data, tab, sort) {
    const sortKey = `${tab}_${sort}`;
    // 如果源数据引用相同且排序参数相同，返回缓存结果（避免重复创建数组拷贝）
    if (data === _lastSortInput && sortKey === _lastSortKey && _lastSortResult) {
        return _lastSortResult;
    }
    
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
            case "rating":
                sorted.sort((a, b) => {
                    const ratingA = a.rating_avg || 0;
                    const ratingB = b.rating_avg || 0;
                    if (ratingA === ratingB) {
                        return (b.rating_count || 0) - (a.rating_count || 0);
                    }
                    return ratingB - ratingA;
                });
                break;
            default: sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); break; // time
        }
    }
    
    // 缓存本次排序结果
    _lastSortInput = data;
    _lastSortKey = sortKey;
    _lastSortResult = sorted;
    return sorted;
}

/**
 * 从同 tab 的任意排序状态中获取已有数据
 */
function findExistingTabData(tab) {
    for (const [key, state] of paginationStates) {
        if (key.startsWith(tab + "_") && state.allData.length > 0 && state.isFullyLoaded) {
            return state.allData;
        }
    }
    return null;
}

/**
 * 从 sessionStorage 读取创作者缓存
 */
function getCreatorsFromSessionStorage() {
    try {
        const data = sessionStorage.getItem('ComfyRanking_CreatorsCache');
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.warn('读取创作者 sessionStorage 缓存失败:', e);
    }
    return null;
}

/**
 * 将创作者数据保存到 sessionStorage
 */
function saveCreatorsToSessionStorage(data) {
    try {
        sessionStorage.setItem('ComfyRanking_CreatorsCache', JSON.stringify(data));
    } catch (e) {
        console.warn('创作者数据写入 sessionStorage 失败:', e);
    }
}

/**
 * 本地搜索创作者数据
 * @param {string} keyword - 搜索关键词
 * @param {Array} data - 创作者数据数组
 * @returns {Array} 匹配的数据
 */
/**
 * 按关键词过滤列表数据（工具/应用/推荐Tab本地搜索）
 * @param {Array} items - 数据数组
 * @param {string} keyword - 搜索关键词
 * @returns {Array} 过滤后的数据
 */
function _filterBySearch(items, keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return items.filter(item => {
        const textStr = `${item.title||''} ${item.shortDesc||''} ${item.name||''} ${item.account||''}`.toLowerCase();
        return textStr.includes(lowerKeyword);
    });
}

/**
 * 本地搜索创作者数据
 * @param {string} keyword - 搜索关键词
 * @param {Array} data - 创作者数据数组
 * @returns {Array} 匹配的数据
 */
function searchCreatorsLocally(keyword, data) {
    const lowerKeyword = keyword.toLowerCase();
    return data.filter(item => {
        const name = (item.name || '').toLowerCase();
        const account = (item.account || '').toLowerCase();
        const shortDesc = (item.shortDesc || '').toLowerCase();
        return name.includes(lowerKeyword) || 
               account.includes(lowerKeyword) || 
               shortDesc.includes(lowerKeyword);
    });
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
            // 🔧 清理旧视图事件监听器
            Array.from(contentArea.children).forEach(child => {
                if (child._cleanup) child._cleanup();
            });
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
            // 🔧 清理旧视图事件监听器
            Array.from(contentArea.children).forEach(child => {
                if (child._cleanup) child._cleanup();
            });
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
    
    // ========== 🧩 提示词特殊处理 ==========
    if (tab === "prompts") {
        try {
            const promptsModule = await getPromptsView();
            const promptsView = promptsModule.createPromptsView(currentUser, keyword);
            // 🔧 清理旧视图事件监听器
            Array.from(contentArea.children).forEach(child => {
                if (child._cleanup) child._cleanup();
            });
            contentArea.innerHTML = "";
            contentArea.appendChild(promptsView);
        } catch (error) {
            console.error("提示词加载失败:", error);
            // 使用安全的DOM操作替代innerHTML，防止XSS
            contentArea.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'text-align:center; padding: 40px 20px; color:#F44336;';
            errorDiv.textContent = `❌ 提示词加载失败: ${error.message}`;
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
        state.loader = null;  // 清除引用，防止旧分页器状态残留
    }
    
    // ========== 🔍 搜索过滤统一入口 ==========
    // 🔧 修复：过滤职责原先分裂在三处且口径不一致 —— loadMoreData 与分页器的
    // getTotalDataCount 都是「先过滤再切片」（正确），而各首屏分支是「先切 20 条再过滤」，
    // renderBatch 内部又对切好的批次再过滤一次。后果不只是首屏条数偏少：首屏与分页
    // 处于不同的数据空间（首屏在「原始前 20 条」里找匹配，分页在「过滤后全集」里按 20
    // 步长切片），排在第 20 条之后的匹配项会永久丢失，甚至首屏直接显示「没有搜索到相关内容」。
    // 现统一收口到本函数：所有取数路径都先过滤、再切片，renderBatch 只负责渲染。
    // 创作者Tab的 keyword 由后端搜索接口过滤，此处不做本地过滤（与原口径一致）。
    const _applySearchScope = (dataArray) => {
        if (!keyword || tab === "creators") return dataArray;
        return _filterBySearch(dataArray, keyword);
    };
    
    // ========== 渲染函数：渲染一批数据（只渲染，过滤由 _applySearchScope 统一负责）==========
    const renderBatch = (dataArray, append = false) => {
        if (renderToken !== getRenderToken()) return;
        
        // 🔧 数据已由调用方经 _applySearchScope 过滤，本函数只负责渲染（不再二次过滤）
        const displayData = dataArray;
        
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
        
        // ✨ 应用视口感知动画：可见卡片依次错开载入，滚动/分页进入视口的卡片自动补播动画
        applyViewportAnimations(contentArea, cards, animationType, !append);
        
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
        
        // 从全量数据中截取（统一走 _applySearchScope，与首屏处于同一数据空间）
        const dataSlice = _applySearchScope(state.allData);
        
        const batch = dataSlice.slice(start, end);
        
        if (batch.length > 0) {
            renderBatch(batch, true);
        }
        
        return batch;
    };
    
    // ========== 尝试从缓存加载 ==========
    // 📌 本处的缓存口径与 任务榜/讨论区/提示词（统一走 性能优化工具.js 的
    // readListCache，命中后一律调 silentRefresh 后台补新）**刻意不同**，不是历史遗留，勿顺手归一：
    //   - 这里缓存的是全量数据（items 200 条 / creators 500 条），分页完全在本地做，
    //     所以缓存命中即等于「数据完整」，只在 expired 时才值得再发一次网络请求；
    //   - 那三个列表只缓存第一页，命中后数据必然不完整，故一律后台 silentRefresh 补新。
    // 若强行统一成「总是后台刷新」，插件榜会在每次 Tab 切换时多发一次 200 条的全量请求。
    // 获取完整缓存信息（包含过期状态）
    const { value: cachedData, expired: isCacheExpired, found: hasCacheData } = getCacheWithMeta(cacheKey, true);
    
    // 有缓存时直接渲染缓存（搜索时也使用缓存，renderBatch 会处理 keyword 过滤）
    // 🔍 创作者Tab有keyword时不使用缓存，每次都从后端搜索
    // 🔧 修复：原实现还把「刚清空搜索框」也列为跳过缓存的理由，但 cacheKey 不含 keyword、
    // 搜索结果也从不写入该键（见下方 isCreatorSearch 判断），缓存里存的始终是干净的全量列表，
    // 清空搜索框后完全可以直接用缓存上屏；强制联网只会让用户在弱网下白等一整个重试预算
    const skipCache = tab === "creators" && !!keyword;
    if (!force && hasCacheData && !skipCache) {
        // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
        const proxiedData = proxyImages(cachedData);
        state.allData = proxiedData;
        state.isFullyLoaded = true;
        // 缓存是全量列表而非搜索结果，清除搜索标记，避免下次加载仍被当作搜索结果处理
        if (tab === "creators" && !keyword) state.isSearchResult = false;
        
        // 首屏渲染（仅第一页）—— 先过滤再切片，与 loadMoreData 同一数据空间
        const scopedData = _applySearchScope(proxiedData);
        renderBatch(scopedData.slice(0, pageSize), false);
        
        // 如果有更多数据，启动分页加载器
        if (scopedData.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
        }
        
        // 【新增】Tab 切换后台静默刷新 —— 仅缓存过期时触发
        if (isCacheExpired) {
            console.log(`🔄 缓存已过期，${tab}_${sort} 启动后台静默刷新...`);
            
            setTimeout(async () => {
                // 保存当前上下文快照，防止网络延迟期间用户切换Tab导致竞态
                const savedToken = renderToken;
                const savedTab = tab;
                const savedSort = sort;
                
                // 防竞态检查1：回调开始执行时验证
                if (savedToken !== getRenderToken()) return;
                
                try {
                    let newData;
                    if (savedTab === "tools" || savedTab === "apps" || savedTab === "recommends") {
                        const itemType = savedTab === "tools" ? "tool" : (savedTab === "apps" ? "app" : "recommend");
                        const response = await api.getItems(itemType, savedSort, 200);
                        newData = proxyImages(response.data || []);
                    } else if (savedTab === "creators") {
                        const response = await api.getCreators(savedSort, 500);
                        newData = proxyImages(response.data || []);
                    } else {
                        return; // posts/tasks 不走这个路径
                    }
                    
                    // 防竞态检查2：网络请求完成后再次验证
                    if (savedToken !== getRenderToken()) return;
                    
                    // 只有token匹配时才同时更新state.allData和setCache
                    if (_shouldUpdateData(state.allData, newData)) {
                        console.log(`✅ ${savedTab}_${savedSort} 检测到新数据，执行静默更新`);
                        state.allData = newData;
                        state.displayedCount = 0; // 重置分页计数
                        // 📴 持久化到 localStorage，保证重启后离线仍可展示
                        setCache(cacheKey, newData, getCacheExpireTime(), true);
                        
                        // 更新创作者 sessionStorage 缓存
                        if (savedTab === "creators") {
                            saveCreatorsToSessionStorage(newData);
                        }
                        
                        // 完整重新渲染（替代之前只更新数字的方案）
                        contentArea.innerHTML = "";
                        // 🔧 先过滤再切片：搜索场景下静默刷新同样会触发，
                        // 原实现在 newData 前 20 条里过滤，会漏掉靠后的匹配项
                        const scopedNewData = _applySearchScope(newData);
                        renderBatch(scopedNewData.slice(0, pageSize), false);
                        
                        if (scopedNewData.length > pageSize) {
                            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, savedTab);
                        }
                    } else {
                        // 关键字段无变化 → 无需重渲染。但 newData 才是刚从云端取回的权威数据，
                        // 缓存必须回写 newData：若仍回写旧的 state.allData，等于把旧数据固化并
                        // 续期（续期后 isCacheExpired 转 false，下次连静默刷新都不再触发），
                        // 导致缓存中的旧版本号被长期锁死、卡片徽章无法出现。
                        // 注意此处刻意不更新 state.allData：首屏已按旧数据渲染，保持二者一致可
                        // 避免分页加载与已渲染卡片错位；新数据在下次进入读取缓存时生效
                        setCache(cacheKey, newData, getCacheExpireTime(), true);
                    }
                } catch (err) {
                    console.warn(`⚠️ ${savedTab}_${savedSort} 后台刷新失败:`, err);
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
        state.displayedCount = 0;  // 重置已显示计数，因为数据重新排序了
        
        // 首屏渲染（先过滤再切片）
        const scopedSorted = _applySearchScope(locallySorted);
        renderBatch(scopedSorted.slice(0, pageSize), false);
        
        // 启动分页加载器
        if (scopedSorted.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
        }
        
        // 存入当前排序的缓存（📴 创作者数据同样持久化到 localStorage，保证重启后离线可展示）
        setCache(cacheKey, locallySorted, getCacheExpireTime(), true);
        
        return; // 本地排序后直接返回，不需要后台刷新（数据是同一批）
    }
    
    // ========== 🚀 缓存先行：阻塞前先用本地已有数据上屏 ==========
    // 走到这里说明上面两条快路径都没命中：要么是 force 强制刷新（刻意跳过缓存），
    // 要么是本次会话还没有该 tab 的完整数据。弱网下一次列表请求最长要烧满整个重试预算，
    // 期间用户只能盯骨架屏；此刻若本地已有可用数据，就先渲染首屏，网络请求照常往下走，
    // 回来后按 renderToken + _shouldUpdateData 决定是否重渲染（与上方静默刷新同口径）。
    // 🔍 创作者搜索场景不参与：renderBatch 对创作者不做本地过滤，先上屏全量列表会混入非搜索结果
    let renderedInstant = false;
    if (!isCreatorSearching) {
        // 可立即上屏的数据：当前排序的列表缓存（force 时被跳过）→ 创作者 sessionStorage 降级副本
        let instantData = (hasCacheData && Array.isArray(cachedData) && cachedData.length > 0) ? cachedData : null;
        if (!instantData && tab === "creators") {
            const sessionData = getCreatorsFromSessionStorage();
            if (Array.isArray(sessionData) && sessionData.length > 0) instantData = sessionData;
        }
        if (instantData) {
            console.log(`🚀 ${tab}_${sort} 缓存先行：先用本地数据渲染首屏，网络请求转后台`);
            // 🚀 与上方缓存命中分支同口径：本地数据也过一遍图片代理（proxyImages 内部会先剥除
            // 已有代理前缀，幂等），确保代理规则新增的字段同样被处理
            // sessionStorage 副本的顺序不保证与当前排序一致，统一本地排一次（对已排序数据幂等）
            const sortedData = sortDataLocally(proxyImages(instantData), tab, sort);
            state.allData = sortedData;
            state.isFullyLoaded = true;
            state.isSearchResult = false;
            // 🔧 先过滤再切片（tools/apps/recommends 带 keyword 时同样会进入本分支）
            const scopedInstant = _applySearchScope(sortedData);
            renderBatch(scopedInstant.slice(0, pageSize), false);
            if (scopedInstant.length > pageSize) {
                _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
            }
            renderedInstant = true;
        }
    }
    
    // ========== 显示加载骨架屏（已有本地数据上屏时跳过，避免闪屏）==========
    if (!renderedInstant) {
        contentArea.innerHTML = "";
        const skeleton = createSkeleton(tab === "creators" ? "list" : "card", 3);
        contentArea.appendChild(skeleton);
    }
    
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
                // 🔍 先撤销上一次仍在途的搜索请求：用户继续输入后，上一次的关键词已经作废，
                // 但它的请求还会继续占用并发额度（全局最多 6 个）与最长 10 秒的超时预算，
                // 把最新这次搜索挤到后面排队，弱网下表现为「一直在转圈」。
                // 只撤销搜索分组，不影响列表、详情、点赞等任何其它请求
                requestCancelManager.cancelAll(API.SEARCH_COMPONENT_ID);
                response = await api.searchCreators(keyword, sort);
                realData = response.data || [];
                realData = proxyImages(realData);  // 确保图片走本地缓存代理
                // 标记为搜索结果，不存入缓存，避免污染正常数据
                state.isSearchResult = true;
            } else {
                response = await api.getCreators(sort, 500);
                realData = response.data || [];
                realData = proxyImages(realData);  // 确保图片走本地缓存代理
                // 正常数据，清除搜索标记
                state.isSearchResult = false;
            }
        }
        
        // 存入缓存（📴 创作者数据同样持久化到 localStorage，保证重启后离线可展示；搜索结果不存入缓存）
        const isCreatorSearch = tab === "creators" && keyword;
        if (!isCreatorSearch) {
            setCache(cacheKey, realData, getCacheExpireTime(), true);
        }
        
        // 创作者非搜索数据存入 sessionStorage（用于离线降级）
        if (tab === "creators" && !isCreatorSearch) {
            saveCreatorsToSessionStorage(realData);
        }
        
        state.isFullyLoaded = true;
        
        // 🚀 缓存先行场景：网络数据与已上屏的本地数据无实质差异时不重渲染，避免清屏重画
        // 打断用户已经滚动的阅读位置（与上方后台静默刷新同口径）。缓存已在上面回写权威新数据，
        // 此处刻意不更新 state.allData，保持与已渲染卡片一致，防止分页加载错位
        if (renderedInstant && !_shouldUpdateData(state.allData, realData)) {
            return;
        }
        
        // 更新状态
        state.allData = realData;
        
        // 渲染首屏（先过滤再切片：tools/apps/recommends 的 keyword 是本地搜索，
        // realData 是未过滤的全量数据，原实现在前 20 条里过滤会漏掉靠后的匹配项）
        const scopedReal = _applySearchScope(realData);
        renderBatch(scopedReal.slice(0, pageSize), false);
        
        // 启动分页加载器
        if (scopedReal.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
        }
        
    } catch (error) {
        // 🔍 防竞态：本次加载已被更新的加载取代（切Tab、换排序、继续输入关键词）时直接退出。
        // renderBatch 内部本来就有这道守卫，但它之外的降级分支会直接写 contentArea.innerHTML
        // 并弹提示，缺少守卫会让过期结果覆盖掉新内容
        if (renderToken !== getRenderToken()) {
            console.warn(`⏹️ ${tab}_${sort} 请求已过期，忽略本次失败`);
            return;
        }
        // 🔍 主动撤销（上方 cancelAll）不是网络故障：用户只是又敲了一个字，
        // 新一次加载已经在跑了。这里必须静默退出，否则会误弹「网络不可用」提示
        if (error && error.name === 'RequestCancelledError') {
            console.log(`⏹️ ${tab}_${sort} 搜索请求已被新关键词取代`);
            return;
        }
        console.error("数据加载失败:", error);
        
        // 🚀 缓存先行场景：首屏已经用本地数据上屏，网络失败时保持当前画面即可，不再走下面的
        // 降级分支（否则会把同一批数据重渲染一遍、重播卡片动画）。与上方后台静默刷新失败一致：
        // 只记录日志，不额外打扰用户
        if (renderedInstant) {
            console.warn(`📴 ${tab}_${sort} 网络刷新失败，保持已渲染的本地数据`);
            return;
        }
        
        // 🚀 回退到任何可用缓存（包括过期的）
        // 🔍 创作者Tab搜索场景跳过此分支：renderBatch 对创作者不做本地过滤，
        // 直接渲染全量缓存会导致搜索结果未过滤，改由下方本地搜索降级分支处理
        if (hasCacheData && cachedData && !(tab === "creators" && keyword)) {
            console.warn(`📴 网络失败，降级显示${isCacheExpired ? '过期' : ''}缓存`);
            state.allData = cachedData;
            // 🔧 先过滤再切片：本分支已排除 creators+keyword，但 tools/apps/recommends
            // 带 keyword 时会进来；renderBatch 不再自行过滤，此处必须显式过滤
            const scopedCached = _applySearchScope(cachedData);
            renderBatch(scopedCached.slice(0, pageSize), false);
            
            // 如果是过期缓存，显示提示
            // 🔧 改用统一提示组件 + 词典（原为手写 div、无动画不排队，且文案硬编码中文）
            if (isCacheExpired) {
                showToast(t('feedback.cache_fallback'), 'warning');
            }
            return;
        }
        
        // 🚀 创作者Tab：尝试从 sessionStorage 或内存中降级
        if (tab === "creators") {
            let fallbackData = null;
            
            // 1. 优先从当前内存状态获取
            if (state.allData && state.allData.length > 0) {
                fallbackData = state.allData;
            }
            // 2. 从本地列表缓存获取（含过期缓存，搜索结果不入库故不会污染）
            if (!fallbackData && hasCacheData && cachedData) {
                fallbackData = cachedData;
            }
            // 3. 尝试从 sessionStorage 获取
            if (!fallbackData) {
                fallbackData = getCreatorsFromSessionStorage();
            }
            // 4. 从其他排序状态获取
            if (!fallbackData) {
                fallbackData = findExistingTabData("creators");
            }
            
            if (fallbackData && fallbackData.length > 0) {
                let displayData = fallbackData;
                
                // 搜索场景：执行本地搜索
                if (keyword) {
                    displayData = searchCreatorsLocally(keyword, fallbackData);
                    if (displayData.length === 0) {
                        contentArea.innerHTML = `
                            <div style='text-align:center; padding: 40px 20px; color:#888;'>
                                🔍 没有搜索到相关内容
                            </div>
                        `;
                        
                        // 🔧 改用统一提示组件 + 词典（原为手写 div 且文案硬编码中文）
                        showToast(t('feedback.search_local_result'), 'warning');
                        return;
                    }
                }
                
                // 按当前排序排序
                displayData = sortDataLocally(displayData, tab, sort);
                state.allData = displayData;
                // 统一走 _applySearchScope（创作者Tab恒等返回，数据已由上方
                // searchCreatorsLocally 过滤），保证各渲染入口口径完全一致
                const scopedFallback = _applySearchScope(displayData);
                renderBatch(scopedFallback.slice(0, pageSize), false);
                
                // 启动分页加载器
                if (scopedFallback.length > pageSize) {
                    _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab);
                }
                
                // 🔧 改用统一提示组件 + 词典（原为手写 div 且两条文案均硬编码中文）
                showToast(keyword ? t('feedback.search_local_result') : t('feedback.cache_fallback'), 'warning');
                return;
            } else if (keyword) {
                contentArea.innerHTML = '';
                const emptyDiv = document.createElement('div');
                emptyDiv.style.cssText = 'text-align:center; padding: 40px 20px; color:#888;';
                emptyDiv.textContent = `🔌 ${t('common.network_error_retry')}`;
                contentArea.appendChild(emptyDiv);
                return;
            }
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
    // 安全清理旧分页器，防止状态残留和重复事件监听
    if (state.loader) {
        state.loader.stop();
    }
    state.loader = null;
    
    // 获取滚动容器（侧边栏主容器）
    const scrollContainer = contentArea.closest(".sidebar-scroll-container") || contentArea.parentElement;
    
    if (!scrollContainer) {
        console.warn("⚠️ 未找到滚动容器，分页加载无法启动");
        
        // 添加手动加载按钮作为 fallback
        let nextPage = 2;
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.textContent = t('task.load_more');
        loadMoreBtn.style.cssText = 'width:100%;padding:10px;margin-top:10px;cursor:pointer;border:1px solid #555;border-radius:6px;background:transparent;color:inherit;';
        loadMoreBtn.onclick = async () => {
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = t('common.loading');
            try {
                const result = await loadMoreData(nextPage, pageSize);
                if (result && result.length > 0) {
                    nextPage++;
                    loadMoreBtn.textContent = t('task.load_more');
                } else {
                    loadMoreBtn.textContent = t('common.no_more');
                    loadMoreBtn.style.cursor = 'default';
                    loadMoreBtn.onclick = null;
                }
            } catch (err) {
                console.error("手动加载更多失败:", err);
                loadMoreBtn.textContent = t('task.load_failed');
            }
            loadMoreBtn.disabled = false;
        };
        contentArea.appendChild(loadMoreBtn);
        return;
    }
    
    // 计算数据总量（考虑搜索过滤，创作者Tab有keyword时不进行本地过滤，因为后端已过滤）
    // 📌 口径必须与 loadSidebarContent 内的 _applySearchScope 一致（先过滤再计数）；
    // 本函数是模块级、拿不到那个闭包，故保留等价实现，改动其一务必同步另一处
    const getTotalDataCount = () => {
        if (!keyword) return state.allData.length;
        // 创作者Tab后端搜索已过滤，直接返回全部数据
        if (tab === "creators") return state.allData.length;
        return _filterBySearch(state.allData, keyword).length;
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


/** 判断是否需要更新数据 —— 对比ID顺序和关键字段 */
function _shouldUpdateData(oldData, newData) {
    if (!oldData || !newData) return true;
    if (oldData.length !== newData.length) return true;
    
    // 检查ID顺序是否一致（检测排序变化、新增/删除）
    // 比对条数覆盖首屏渲染量（PAGE_SIZE），避免首屏可见卡片（第 11~20 条）的版本/数字更新被漏检
    const checkCount = Math.min(PAGE_SIZE, oldData.length);
    for (let i = 0; i < checkCount; i++) {
        const oldId = oldData[i].id || oldData[i].account;
        const newId = newData[i].id || newData[i].account;
        if (oldId !== newId) return true;
        
        // 检查关键数字字段
        const keyFields = ['likes', 'downloads', 'uses', 'views', 'daily_views', 'recent_tips', 'favorites', 'rating_avg', 'rating_count'];
        for (const field of keyFields) {
            if ((oldData[i][field] || 0) !== (newData[i][field] || 0)) return true;
        }

        // 检查版本号（字符串）：云端扫描到插件新版本时往往只有 latest_version 变化，
        // 点赞/下载/浏览等数字字段全不动；若不比对它，卡片上的"可更新"徽章将永远刷不出来
        if ((oldData[i].latest_version || '') !== (newData[i].latest_version || '')) return true;
    }
    return false;
}


