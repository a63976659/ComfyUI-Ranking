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
// 🔒 P0安全优化：敏感数据脱敏
// ==========================================

import { CACHE, PAGINATION } from "../core/全局配置.js";

// ==========================================
// 🔒 P0安全优化：敏感数据脱敏工具
// ==========================================
// 特点：
//   - 金额数据加密传输
//   - 敏感数据不存 localStorage
//   - 内存缓存自动过期

// 🔐 加密密钥（每次会话随机生成）
const SESSION_KEY = crypto.getRandomValues(new Uint8Array(16)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '');

// 🔐 敏感数据内存缓存（不存 localStorage）
const sensitiveCache = new Map();

// 🔧 P3优化：缓存大小限制和统一清理定时器
const MAX_SENSITIVE_ITEMS = 100;
let sensitiveCacheCleanupTimer = null;

/**
 * 🔒 简单加密（用于前端显示脱敏，非安全加密）
 * @param {number} amount - 金额
 * @returns {string} 加密后的字符串
 */
export function encryptAmount(amount) {
    const str = String(amount);
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i) ^ SESSION_KEY.charCodeAt(i % SESSION_KEY.length);
        result += String.fromCharCode(charCode);
    }
    return btoa(result);
}

/**
 * 🔒 解密金额
 * @param {string} encrypted - 加密字符串
 * @returns {number} 原始金额
 */
export function decryptAmount(encrypted) {
    try {
        const decoded = atob(encrypted);
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            const charCode = decoded.charCodeAt(i) ^ SESSION_KEY.charCodeAt(i % SESSION_KEY.length);
            result += String.fromCharCode(charCode);
        }
        return parseInt(result, 10) || 0;
    } catch {
        return 0;
    }
}

/**
 * 🔒 设置敏感数据缓存（仅内存，不存 localStorage）
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {number} ttl - 过期时间（毫秒），默认5分钟
 */
export function setSensitiveCache(key, value, ttl = 5 * 60 * 1000) {
    // 🔧 P3优化：限制缓存大小，防止内存持续增长
    if (sensitiveCache.size >= MAX_SENSITIVE_ITEMS) {
        // 删除最早的项
        const firstKey = sensitiveCache.keys().next().value;
        sensitiveCache.delete(firstKey);
    }
    
    const expireAt = Date.now() + ttl;
    sensitiveCache.set(key, { value, expireAt });
    
    // 🔧 P3优化：统一清理定时器（仅一个，避免创建大量 setTimeout）
    if (!sensitiveCacheCleanupTimer) {
        sensitiveCacheCleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [k, v] of sensitiveCache) {
                if (now >= v.expireAt) {
                    sensitiveCache.delete(k);
                }
            }
            // 缓存清空时停止定时器
            if (sensitiveCache.size === 0) {
                clearInterval(sensitiveCacheCleanupTimer);
                sensitiveCacheCleanupTimer = null;
            }
        }, 60000);  // 每分钟清理一次
    }
}

/**
 * 🔒 获取敏感数据缓存
 * @param {string} key - 缓存键
 * @returns {any|null}
 */
export function getSensitiveCache(key) {
    if (!sensitiveCache.has(key)) return null;
    
    const cached = sensitiveCache.get(key);
    if (Date.now() >= cached.expireAt) {
        sensitiveCache.delete(key);
        return null;
    }
    return cached.value;
}

/**
 * 🔒 清除敏感数据缓存
 * @param {string} key - 缓存键，不传则清除全部
 */
export function clearSensitiveCache(key) {
    if (key) {
        sensitiveCache.delete(key);
    } else {
        sensitiveCache.clear();
    }
}

/**
 * 🔒 敏感字段列表（这些字段不应该存到 localStorage）
 */
export const SENSITIVE_FIELDS = [
    'balance',           // 余额
    'earn_balance',      // 收益余额
    'tip_balance',       // 打赏余额
    'frozen_balance',    // 冻结余额
    'password',          // 密码
    'password_hash',     // 密码哈希
    'token',             // Token
    'netdisk_password',  // 网盘密码
    'github_token',      // GitHub Token
    'transactions',      // 交易记录
    'tx_hash',           // 交易哈希
];

/**
 * 🔒 过滤敏感字段（用于存储前脱敏）
 * @param {Object} data - 原始数据
 * @returns {Object} 脱敏后的数据
 */
export function filterSensitiveData(data) {
    if (!data || typeof data !== 'object') return data;
    
    const filtered = Array.isArray(data) ? [...data] : { ...data };
    
    if (Array.isArray(filtered)) {
        return filtered.map(item => filterSensitiveData(item));
    }
    
    for (const field of SENSITIVE_FIELDS) {
        if (field in filtered) {
            delete filtered[field];
        }
    }
    
    // 递归处理嵌套对象
    for (const key in filtered) {
        if (filtered[key] && typeof filtered[key] === 'object') {
            filtered[key] = filterSensitiveData(filtered[key]);
        }
    }
    
    return filtered;
}

/**
 * 🔒 金额显示脱敏（部分隐藏）
 * @param {number} amount - 金额
 * @param {boolean} hide - 是否隐藏
 * @returns {string}
 */
export function maskAmount(amount, hide = false) {
    if (hide) {
        return '****';
    }
    return String(amount);
}

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


// ==========================================
// 🚀 P1性能优化：虚拟滚动组件
// ==========================================
// 特点：
//   - 只渲染可视区域 + 缓冲区 DOM，大幅减少 DOM 节点
//   - 支持动态高度卡片
//   - 平滑滚动体验

/**
 * 创建虚拟滚动列表
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.container - 滚动容器
 * @param {Array} options.items - 数据数组
 * @param {Function} options.renderItem - 渲染单个卡片的函数 (item, index) => HTMLElement
 * @param {number} options.itemHeight - 预估卡片高度（px），默认 160
 * @param {number} options.buffer - 缓冲区卡片数，默认 5
 * @returns {Object} 虚拟滚动实例
 */
export function createVirtualScroller(options) {
    const {
        container,
        items = [],
        renderItem,
        itemHeight = 160,
        buffer = 5
    } = options;
    
    let _items = [...items];
    let _itemHeights = new Map();  // 记录实际高度
    let _scrollTop = 0;
    let _containerHeight = container.clientHeight || 600;
    let _isDestroyed = false;
    
    // 创建内部结构
    const wrapper = document.createElement("div");
    wrapper.className = "virtual-scroll-wrapper";
    wrapper.style.cssText = "position: relative; width: 100%;";
    
    const content = document.createElement("div");
    content.className = "virtual-scroll-content";
    content.style.cssText = "position: absolute; top: 0; left: 0; right: 0;";
    
    wrapper.appendChild(content);
    container.innerHTML = "";
    container.appendChild(wrapper);
    
    // 计算总高度
    const getTotalHeight = () => {
        let total = 0;
        for (let i = 0; i < _items.length; i++) {
            total += _itemHeights.get(i) || itemHeight;
        }
        return total;
    };
    
    // 获取可见范围
    const getVisibleRange = () => {
        let startIdx = 0;
        let endIdx = 0;
        let accHeight = 0;
        
        // 找开始索引
        for (let i = 0; i < _items.length; i++) {
            const h = _itemHeights.get(i) || itemHeight;
            if (accHeight + h >= _scrollTop) {
                startIdx = Math.max(0, i - buffer);
                break;
            }
            accHeight += h;
        }
        
        // 找结束索引
        accHeight = 0;
        for (let i = 0; i < _items.length; i++) {
            accHeight += _itemHeights.get(i) || itemHeight;
            if (accHeight >= _scrollTop + _containerHeight) {
                endIdx = Math.min(_items.length - 1, i + buffer);
                break;
            }
        }
        if (endIdx === 0) endIdx = Math.min(_items.length - 1, startIdx + Math.ceil(_containerHeight / itemHeight) + buffer * 2);
        
        return { startIdx, endIdx };
    };
    
    // 计算偶移量
    const getOffsetTop = (idx) => {
        let offset = 0;
        for (let i = 0; i < idx; i++) {
            offset += _itemHeights.get(i) || itemHeight;
        }
        return offset;
    };
    
    // 渲染可见卡片
    const render = () => {
        if (_isDestroyed) return;
        
        const { startIdx, endIdx } = getVisibleRange();
        const fragment = document.createDocumentFragment();
        
        for (let i = startIdx; i <= endIdx; i++) {
            const item = _items[i];
            if (!item) continue;
            
            const el = renderItem(item, i);
            el.style.position = "absolute";
            el.style.top = getOffsetTop(i) + "px";
            el.style.left = "0";
            el.style.right = "0";
            el.dataset.virtualIdx = i;
            
            fragment.appendChild(el);
        }
        
        content.innerHTML = "";
        content.appendChild(fragment);
        
        // 更新容器高度
        wrapper.style.height = getTotalHeight() + "px";
        
        // 测量实际高度（延迟执行）
        requestAnimationFrame(() => {
            content.querySelectorAll("[data-virtual-idx]").forEach(el => {
                const idx = parseInt(el.dataset.virtualIdx);
                const actualHeight = el.offsetHeight;
                if (actualHeight && actualHeight !== (_itemHeights.get(idx) || itemHeight)) {
                    _itemHeights.set(idx, actualHeight);
                }
            });
        });
    };
    
    // 滚动事件（节流）
    let rafId = null;
    const handleScroll = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            _scrollTop = container.scrollTop;
            render();
            rafId = null;
        });
    };
    
    // 窗口尺寸变化
    const handleResize = debounce(() => {
        _containerHeight = container.clientHeight;
        render();
    }, 200);
    
    // 初始化
    const init = () => {
        container.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleResize);
        render();
    };
    
    // 销毁
    const destroy = () => {
        _isDestroyed = true;
        container.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
        if (rafId) cancelAnimationFrame(rafId);
    };
    
    // 更新数据
    const setItems = (newItems) => {
        _items = [...newItems];
        _itemHeights.clear();
        render();
    };
    
    // 滚动到指定位置
    const scrollToIndex = (idx) => {
        const offset = getOffsetTop(idx);
        container.scrollTop = offset;
    };
    
    init();
    
    return {
        render,
        destroy,
        setItems,
        scrollToIndex,
        get items() { return _items; },
        get visibleRange() { return getVisibleRange(); }
    };
}


// ==========================================
// 🚀 P1性能优化：分级缓存 TTL
// ==========================================
// 特点：
//   - 榜单数据 5 分钟
//   - 用户资料 30 分钟
//   - 静态配置 24 小时

export const CACHE_TTL = {
    REALTIME: 1 * 60 * 1000,       // 1分钟：实时数据（如在线状态）
    HOT: 5 * 60 * 1000,            // 5分钟：热点数据（榜单、趋势）
    NORMAL: 30 * 60 * 1000,        // 30分钟：普通数据（用户资料）
    STATIC: 24 * 60 * 60 * 1000,   // 24小时：静态数据（配置、图片）
    PERMANENT: 7 * 24 * 60 * 60 * 1000  // 7天：几乎不变的数据
};

/**
 * 根据数据类型获取推荐 TTL
 * @param {string} dataType - 数据类型
 * @returns {number} TTL 毫秒数
 */
export function getRecommendedTTL(dataType) {
    const ttlMap = {
        // 热点数据（5分钟）
        'items_list': CACHE_TTL.HOT,
        'creators_list': CACHE_TTL.HOT,
        'rankings': CACHE_TTL.HOT,
        'tip_board': CACHE_TTL.HOT,
        'trend_data': CACHE_TTL.HOT,
        
        // 普通数据（30分钟）
        'user_profile': CACHE_TTL.NORMAL,
        'user_settings': CACHE_TTL.NORMAL,
        'comments': CACHE_TTL.NORMAL,
        'notifications': CACHE_TTL.NORMAL,
        
        // 静态数据（24小时）
        'config': CACHE_TTL.STATIC,
        'categories': CACHE_TTL.STATIC,
        'image_url': CACHE_TTL.STATIC,
        
        // 默认
        'default': CACHE_TTL.NORMAL
    };
    
    return ttlMap[dataType] || ttlMap['default'];
}

/**
 * 智能缓存设置（自动选择 TTL）
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {string} dataType - 数据类型（用于自动选择 TTL）
 * @param {boolean} persist - 是否持久化
 */
export function setSmartCache(key, value, dataType = 'default', persist = true) {
    const ttl = getRecommendedTTL(dataType);
    setCache(key, value, ttl, persist);
}


// ==========================================
// 🚀 P1性能优化：WebP 图片转换
// ==========================================

// 检测浏览器是否支持 WebP
let _webpSupported = null;
export async function isWebPSupported() {
    if (_webpSupported !== null) return _webpSupported;
    
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            _webpSupported = img.width > 0 && img.height > 0;
            resolve(_webpSupported);
        };
        img.onerror = () => {
            _webpSupported = false;
            resolve(false);
        };
        img.src = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
    });
}

/**
 * 转换图片 URL 为 WebP 格式（如果服务器支持）
 * @param {string} url - 原始图片 URL
 * @returns {string} 转换后的 URL
 */
export function toWebP(url) {
    if (!url || typeof url !== 'string') return url;
    
    // 已经是 WebP 或 data URL，跳过
    if (url.endsWith('.webp') || url.startsWith('data:')) return url;
    
    // 检查是否是我们的图片代理 URL
    if (url.includes('/api/image_proxy')) {
        // 添加 webp 参数
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}format=webp`;
    }
    
    return url;
}

/**
 * 批量转换图片数组为 WebP
 * @param {string[]} urls - 图片 URL 数组
 * @returns {string[]} 转换后的数组
 */
export async function toWebPBatch(urls) {
    const supported = await isWebPSupported();
    if (!supported) return urls;
    
    return urls.map(url => toWebP(url));
}
