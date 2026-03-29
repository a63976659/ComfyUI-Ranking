// 性能优化工具.js
// ==========================================
// ⚡ 性能优化工具模块
// ==========================================
// 作用：提供分页加载、图片懒加载、缓存管理等性能优化工具
// 关联文件：
//   - 全局配置.js (配置中心)
//   - 列表卡片组件.js (使用分页加载)
//   - 创作者卡片组件.js (使用分页加载)
//   - 所有图片渲染场景 (使用懒加载)
// ==========================================
// 🏗️ P2架构优化：使用配置中心常量
// ==========================================

import { CACHE, PAGINATION } from "../core/全局配置.js";

// ==========================================
// 📦 缓存管理器
// ==========================================
// 特点：
//   - 多级缓存：内存 → localStorage
//   - 自动过期清理
//   - LRU 淘汰策略

// 🏗️ P2架构优化：使用配置中心常量
const CACHE_PREFIX = CACHE.PREFIX;
const DEFAULT_TTL = CACHE.DEFAULT_TTL;
const MAX_MEMORY_ITEMS = CACHE.MAX_MEMORY_ITEMS;

// 内存缓存（最快）
const memoryCache = new Map();
const memoryCacheOrder = []; // LRU 顺序追踪

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {number} ttl - 过期时间（毫秒），默认2小时
 * @param {boolean} persist - 是否持久化到 localStorage
 */
export function setCache(key, value, ttl = DEFAULT_TTL, persist = true) {
    const fullKey = CACHE_PREFIX + key;
    const expireAt = Date.now() + ttl;
    const cacheData = { value, expireAt };
    
    // 内存缓存
    memoryCache.set(fullKey, cacheData);
    _updateLRU(fullKey);
    _enforceCacheLimit();
    
    // 持久化缓存
    if (persist) {
        try {
            localStorage.setItem(fullKey, JSON.stringify(cacheData));
        } catch (e) {
            // localStorage 满了，清理过期项
            _cleanExpiredStorage();
            try {
                localStorage.setItem(fullKey, JSON.stringify(cacheData));
            } catch {
                console.warn("⚠️ localStorage 存储失败:", key);
            }
        }
    }
}

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {any|null} 缓存值，过期或不存在返回 null
 */
export function getCache(key) {
    const fullKey = CACHE_PREFIX + key;
    
    // 优先从内存获取
    if (memoryCache.has(fullKey)) {
        const cached = memoryCache.get(fullKey);
        if (Date.now() < cached.expireAt) {
            _updateLRU(fullKey);
            return cached.value;
        }
        // 过期，清除
        memoryCache.delete(fullKey);
    }
    
    // 降级到 localStorage
    try {
        const stored = localStorage.getItem(fullKey);
        if (stored) {
            const cached = JSON.parse(stored);
            if (Date.now() < cached.expireAt) {
                // 回填内存缓存
                memoryCache.set(fullKey, cached);
                _updateLRU(fullKey);
                return cached.value;
            }
            // 过期，清除
            localStorage.removeItem(fullKey);
        }
    } catch (e) {
        console.warn("⚠️ 缓存读取失败:", key);
    }
    
    return null;
}

/**
 * 删除缓存
 * @param {string} key - 缓存键
 */
export function removeCache(key) {
    const fullKey = CACHE_PREFIX + key;
    memoryCache.delete(fullKey);
    try {
        localStorage.removeItem(fullKey);
    } catch {}
}

/**
 * 清除所有缓存
 */
export function clearAllCache() {
    memoryCache.clear();
    memoryCacheOrder.length = 0;
    
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
}

// LRU 顺序更新
function _updateLRU(key) {
    const idx = memoryCacheOrder.indexOf(key);
    if (idx > -1) memoryCacheOrder.splice(idx, 1);
    memoryCacheOrder.push(key);
}

// 强制缓存数量限制
function _enforceCacheLimit() {
    while (memoryCacheOrder.length > MAX_MEMORY_ITEMS) {
        const oldest = memoryCacheOrder.shift();
        memoryCache.delete(oldest);
    }
}

// 清理过期的 localStorage 条目
function _cleanExpiredStorage() {
    try {
        const now = Date.now();
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    if (cached.expireAt < now) {
                        keysToRemove.push(key);
                    }
                } catch {
                    keysToRemove.push(key);
                }
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
}


// ==========================================
// 📜 分页加载管理器
// ==========================================
// 特点：
//   - 滚动到底部自动加载
//   - 防抖处理避免频繁触发
//   - 加载状态管理

/**
 * 创建分页加载器
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.container - 滚动容器
 * @param {Function} options.loadMore - 加载更多数据的函数，返回 Promise
 * @param {number} options.pageSize - 每页数量，默认 20
 * @param {number} options.threshold - 触发阈值（距底部像素），默认 200
 * @returns {Object} 分页加载器实例
 */
export function createPaginationLoader(options) {
    const {
        container,
        loadMore,
        pageSize = 20,
        threshold = 200
    } = options;
    
    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;
    let debounceTimer = null;
    
    // 加载指示器
    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "pagination-loading";
    loadingIndicator.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #888;">
            <span class="loading-spinner"></span>
            <span style="margin-left: 8px;">加载中...</span>
        </div>
    `;
    loadingIndicator.style.display = "none";
    
    // "没有更多"提示
    const endIndicator = document.createElement("div");
    endIndicator.className = "pagination-end";
    endIndicator.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #666; font-size: 13px;">
            — 已经到底了 —
        </div>
    `;
    endIndicator.style.display = "none";
    
    // 滚动事件处理（带防抖）
    const handleScroll = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        
        debounceTimer = setTimeout(() => {
            if (isLoading || !hasMore) return;
            
            const { scrollTop, scrollHeight, clientHeight } = container;
            const distanceToBottom = scrollHeight - scrollTop - clientHeight;
            
            if (distanceToBottom < threshold) {
                _loadNextPage();
            }
        }, 100);
    };
    
    // 加载下一页
    const _loadNextPage = async () => {
        if (isLoading || !hasMore) return;
        
        isLoading = true;
        loadingIndicator.style.display = "block";
        
        try {
            const result = await loadMore(currentPage, pageSize);
            
            // 判断是否还有更多
            if (!result || result.length < pageSize) {
                hasMore = false;
                loadingIndicator.style.display = "none";
                endIndicator.style.display = "block";
            } else {
                currentPage++;
            }
        } catch (error) {
            console.error("分页加载失败:", error);
        } finally {
            isLoading = false;
            if (hasMore) {
                loadingIndicator.style.display = "none";
            }
        }
    };
    
    // 启动监听
    const start = () => {
        container.addEventListener("scroll", handleScroll);
        // 添加指示器到容器末尾
        const scrollContent = container.querySelector(".scroll-content") || container;
        scrollContent.appendChild(loadingIndicator);
        scrollContent.appendChild(endIndicator);
    };
    
    // 停止监听
    const stop = () => {
        container.removeEventListener("scroll", handleScroll);
        if (debounceTimer) clearTimeout(debounceTimer);
    };
    
    // 重置状态
    const reset = () => {
        currentPage = 1;
        hasMore = true;
        isLoading = false;
        loadingIndicator.style.display = "none";
        endIndicator.style.display = "none";
    };
    
    // 手动触发加载
    const load = () => _loadNextPage();
    
    return {
        start,
        stop,
        reset,
        load,
        get isLoading() { return isLoading; },
        get hasMore() { return hasMore; },
        get currentPage() { return currentPage; }
    };
}


// ==========================================
// 🖼️ 图片懒加载
// ==========================================
// 特点：
//   - 使用 IntersectionObserver API
//   - 支持占位图和加载动画
//   - 自动重试失败的图片

// 默认占位图（Base64 灰色方块）
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='%23999' font-size='12'%3E加载中%3C/text%3E%3C/svg%3E";

// 错误占位图
const ERROR_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23ffeaea' width='100' height='100'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='%23c44' font-size='12'%3E加载失败%3C/text%3E%3C/svg%3E";

// 全局 Observer 实例
let lazyLoadObserver = null;

/**
 * 初始化图片懒加载（全局单例）
 */
function _initLazyLoadObserver() {
    if (lazyLoadObserver) return;
    
    // 检查浏览器支持
    if (!("IntersectionObserver" in window)) {
        console.warn("⚠️ 浏览器不支持 IntersectionObserver，懒加载降级为直接加载");
        return;
    }
    
    lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                _loadImage(img);
                lazyLoadObserver.unobserve(img);
            }
        });
    }, {
        rootMargin: "200px 0px", // 提前 200px 开始加载
        threshold: 0.01
    });
}

/**
 * 实际加载图片
 */
function _loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;
    
    // 创建临时图片测试加载
    const tempImg = new Image();
    
    tempImg.onload = () => {
        img.src = src;
        img.classList.remove("lazy-loading");
        img.classList.add("lazy-loaded");
        delete img.dataset.src;
    };
    
    tempImg.onerror = () => {
        // 加载失败，显示错误占位图
        img.src = ERROR_IMAGE;
        img.classList.remove("lazy-loading");
        img.classList.add("lazy-error");
        
        // 记录失败，后续可重试
        img.dataset.retries = (parseInt(img.dataset.retries) || 0) + 1;
    };
    
    tempImg.src = src;
}

/**
 * 创建懒加载图片元素
 * @param {string} src - 图片真实地址
 * @param {string} alt - 图片描述
 * @param {Object} style - 样式对象
 * @returns {HTMLImageElement}
 */
export function createLazyImage(src, alt = "", style = {}) {
    _initLazyLoadObserver();
    
    const img = document.createElement("img");
    img.alt = alt;
    img.src = PLACEHOLDER_IMAGE;
    img.dataset.src = src;
    img.className = "lazy-image lazy-loading";
    
    // 应用样式
    Object.assign(img.style, {
        transition: "opacity 0.3s ease",
        ...style
    });
    
    // 添加到观察队列
    if (lazyLoadObserver) {
        lazyLoadObserver.observe(img);
    } else {
        // 降级：直接加载
        img.src = src;
    }
    
    return img;
}

/**
 * 将现有图片转换为懒加载
 * @param {HTMLImageElement} img - 已存在的图片元素
 */
export function makeLazy(img) {
    if (!img.src || img.dataset.src) return;
    
    _initLazyLoadObserver();
    
    img.dataset.src = img.src;
    img.src = PLACEHOLDER_IMAGE;
    img.classList.add("lazy-image", "lazy-loading");
    
    if (lazyLoadObserver) {
        lazyLoadObserver.observe(img);
    }
}

/**
 * 批量设置容器内所有图片为懒加载
 * @param {HTMLElement} container - 容器元素
 * @param {string} selector - 图片选择器，默认 "img"
 */
export function lazyLoadImages(container, selector = "img") {
    const images = container.querySelectorAll(selector);
    images.forEach(img => {
        // 跳过已处理的和 data URL
        if (img.dataset.src || img.src.startsWith("data:")) return;
        makeLazy(img);
    });
}


// ==========================================
// 🔄 防抖与节流
// ==========================================

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} limit - 时间间隔（毫秒）
 * @returns {Function}
 */
export function throttle(fn, limit = 100) {
    let inThrottle = false;
    return function(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}


// ==========================================
// 📊 性能监控
// ==========================================

/**
 * 简单的性能计时器
 * @param {string} label - 标签名
 */
export function startTimer(label) {
    if (typeof performance !== "undefined") {
        performance.mark(`${label}-start`);
    }
}

export function endTimer(label) {
    if (typeof performance !== "undefined") {
        performance.mark(`${label}-end`);
        try {
            performance.measure(label, `${label}-start`, `${label}-end`);
            const measure = performance.getEntriesByName(label)[0];
            console.log(`⏱️ ${label}: ${measure.duration.toFixed(2)}ms`);
            performance.clearMarks(`${label}-start`);
            performance.clearMarks(`${label}-end`);
            performance.clearMeasures(label);
        } catch {}
    }
}


// ==========================================
// 🎨 骨架屏生成器
// ==========================================
// 特点：
//   - 适配深色主题
//   - 多种卡片类型
//   - 流畅的动画效果

/**
 * 创建骨架屏占位
 * @param {string} type - 类型：itemCard/creatorCard/list/avatar/text/detail
 * @param {number} count - 数量
 * @returns {HTMLElement}
 */
export function createSkeleton(type = "card", count = 1) {
    const container = document.createElement("div");
    container.className = "skeleton-container";
    
    // 🎨 深色主题骨架屏样式
    const skeletonStyles = `
        .skeleton-container {
            padding: 8px;
        }
        .skeleton-item {
            background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
            background-size: 200% 100%;
            animation: skeleton-shimmer 1.5s ease-in-out infinite;
            border-radius: 6px;
        }
        .skeleton-card {
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        }
        @keyframes skeleton-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        @keyframes skeleton-pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
        }
    `;
    
    // 注入样式（仅一次）
    if (!document.getElementById("skeleton-styles-v2")) {
        const styleEl = document.createElement("style");
        styleEl.id = "skeleton-styles-v2";
        styleEl.textContent = skeletonStyles;
        document.head.appendChild(styleEl);
    }
    
    for (let i = 0; i < count; i++) {
        const item = document.createElement("div");
        
        switch (type) {
            // 工具/应用卡片骨架
            case "card":
            case "itemCard":
                item.className = "skeleton-card";
                item.innerHTML = `
                    <div class="skeleton-item" style="width:65%;height:18px;margin-bottom:10px;"></div>
                    <div class="skeleton-item" style="width:100%;height:12px;margin-bottom:6px;"></div>
                    <div class="skeleton-item" style="width:80%;height:12px;margin-bottom:12px;"></div>
                    <div style="display:flex;gap:12px;">
                        <div class="skeleton-item" style="width:50px;height:14px;"></div>
                        <div class="skeleton-item" style="width:50px;height:14px;"></div>
                        <div class="skeleton-item" style="width:50px;height:14px;"></div>
                        <div class="skeleton-item" style="width:60px;height:14px;margin-left:auto;"></div>
                    </div>
                `;
                break;
            
            // 创作者卡片骨架
            case "creatorCard":
                item.className = "skeleton-card";
                item.innerHTML = `
                    <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px;">
                        <div class="skeleton-item" style="width:56px;height:56px;border-radius:50%;flex-shrink:0;"></div>
                        <div style="flex:1;">
                            <div class="skeleton-item" style="width:50%;height:16px;margin-bottom:8px;"></div>
                            <div class="skeleton-item" style="width:80%;height:12px;"></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <div class="skeleton-item" style="flex:1;height:28px;"></div>
                        <div class="skeleton-item" style="flex:1;height:28px;"></div>
                    </div>
                `;
                break;
            
            // 列表项骨架
            case "list":
                item.style.marginBottom = "12px";
                item.innerHTML = `
                    <div style="display:flex;gap:12px;align-items:center;padding:8px;background:#1e1e1e;border-radius:6px;border:1px solid #333;">
                        <div class="skeleton-item" style="width:48px;height:48px;border-radius:50%;flex-shrink:0;"></div>
                        <div style="flex:1;">
                            <div class="skeleton-item" style="width:55%;height:14px;margin-bottom:8px;"></div>
                            <div class="skeleton-item" style="width:35%;height:12px;"></div>
                        </div>
                        <div class="skeleton-item" style="width:60px;height:24px;border-radius:4px;"></div>
                    </div>
                `;
                break;
            
            // 头像骨架
            case "avatar":
                item.style.display = "inline-block";
                item.innerHTML = `<div class="skeleton-item" style="width:40px;height:40px;border-radius:50%;"></div>`;
                break;
            
            // 文本骨架
            case "text":
                item.style.marginBottom = "16px";
                item.innerHTML = `
                    <div class="skeleton-item" style="width:100%;height:14px;margin-bottom:8px;"></div>
                    <div class="skeleton-item" style="width:90%;height:14px;margin-bottom:8px;"></div>
                    <div class="skeleton-item" style="width:75%;height:14px;"></div>
                `;
                break;
            
            // 详情页骨架
            case "detail":
                item.className = "skeleton-card";
                item.innerHTML = `
                    <div class="skeleton-item" style="width:70%;height:22px;margin-bottom:16px;"></div>
                    <div class="skeleton-item" style="width:100%;height:180px;margin-bottom:16px;border-radius:8px;"></div>
                    <div class="skeleton-item" style="width:100%;height:14px;margin-bottom:8px;"></div>
                    <div class="skeleton-item" style="width:90%;height:14px;margin-bottom:8px;"></div>
                    <div class="skeleton-item" style="width:80%;height:14px;margin-bottom:16px;"></div>
                    <div style="display:flex;gap:10px;">
                        <div class="skeleton-item" style="flex:1;height:36px;border-radius:6px;"></div>
                        <div class="skeleton-item" style="flex:1;height:36px;border-radius:6px;"></div>
                        <div class="skeleton-item" style="flex:1;height:36px;border-radius:6px;"></div>
                    </div>
                `;
                break;
                
            // 兑容旧版 card 类型
            default:
                item.className = "skeleton-card";
                item.innerHTML = `
                    <div class="skeleton-item" style="width:100%;height:100px;margin-bottom:10px;"></div>
                    <div class="skeleton-item" style="width:70%;height:16px;margin-bottom:8px;"></div>
                    <div class="skeleton-item" style="width:45%;height:14px;"></div>
                `;
        }
        
        container.appendChild(item);
    }
    
    return container;
}

/**
 * 快速显示骨架屏到容器
 * @param {HTMLElement} container - 容器元素
 * @param {string} type - 骨架屏类型
 * @param {number} count - 数量
 */
export function showSkeletonIn(container, type = "itemCard", count = 3) {
    container.innerHTML = "";
    container.appendChild(createSkeleton(type, count));
}

/**
 * 移除容器中的骨架屏
 * @param {HTMLElement} container - 容器元素
 */
export function hideSkeletonIn(container) {
    const skeleton = container.querySelector(".skeleton-container");
    if (skeleton) {
        skeleton.style.opacity = "0";
        skeleton.style.transition = "opacity 0.2s";
        setTimeout(() => skeleton.remove(), 200);
    }
}


// ==========================================
// 🔗 批量请求合并
// ==========================================

const batchQueue = new Map(); // 请求队列
const BATCH_DELAY = 50; // 合并等待时间

/**
 * 批量请求合并器
 * 将多个相同类型的请求合并为一次批量请求
 * 
 * @param {string} batchKey - 批次标识（如 "getUserInfo"）
 * @param {string} itemId - 单个请求的ID
 * @param {Function} batchFetcher - 批量获取函数，接收 ID 数组，返回 Map
 * @returns {Promise<any>}
 */
export function batchRequest(batchKey, itemId, batchFetcher) {
    return new Promise((resolve, reject) => {
        if (!batchQueue.has(batchKey)) {
            batchQueue.set(batchKey, {
                ids: [],
                resolvers: new Map(),
                timer: null
            });
        }
        
        const batch = batchQueue.get(batchKey);
        batch.ids.push(itemId);
        batch.resolvers.set(itemId, { resolve, reject });
        
        // 重置定时器
        if (batch.timer) clearTimeout(batch.timer);
        
        batch.timer = setTimeout(async () => {
            const { ids, resolvers } = batch;
            batchQueue.delete(batchKey);
            
            try {
                // 去重
                const uniqueIds = [...new Set(ids)];
                const results = await batchFetcher(uniqueIds);
                
                // 分发结果
                resolvers.forEach((resolver, id) => {
                    if (results.has(id)) {
                        resolver.resolve(results.get(id));
                    } else {
                        resolver.resolve(null);
                    }
                });
            } catch (error) {
                resolvers.forEach(resolver => resolver.reject(error));
            }
        }, BATCH_DELAY);
    });
}
