// 性能优化工具.js
// ==========================================
// ⚡ 性能优化工具模块
// ==========================================
// 作用：提供分页加载、图片懒加载、缓存管理等性能优化工具
// 关联文件：
//   - 全局配置.js (配置中心)
//   - 网络请求_缓存管理.js (列表缓存工具 readListCache/writeListCache 的底层实现)
//   - 列表卡片组件.js (使用分页加载)
//   - 创作者卡片组件.js (使用分页加载)
//   - 任务榜组件.js / 讨论区组件.js / 提示词组件.js (使用列表缓存工具)
//   - 所有图片渲染场景 (使用懒加载)
// ==========================================
// 🏗️ P2架构优化：使用配置中心常量
// 🔒 P0安全优化：敏感数据脱敏
// ==========================================

import { API, PAGINATION, LAZY_IMAGES } from "../core/全局配置.js";
import { t } from "./用户体验_国际化.js";
// 📦 列表缓存工具需要本地可用的缓存实现；下方「向后兼容重导出」那行是纯转发、
// 不会生成本地绑定，故此处必须单独 import（勿误删，否则 readListCache 运行时报错）
import { setCache, getCacheWithMeta, removeCache, getCacheKeysByPrefix } from "../core/网络请求_缓存管理.js";

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
// 📦 缓存管理器（已迁移到 网络请求_缓存管理.js）
// ==========================================
// 缓存实现已统一迁移到 ../core/网络请求_缓存管理.js
// 此处保持向后兼容重导出，调用方无需修改 import 路径
export { setCache, getCache, getCacheWithMeta, removeCache, removeCacheByPrefix, clearAllCache, CACHE_TTL, getRecommendedTTL, setSmartCache } from '../core/网络请求_缓存管理.js';


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
 * @param {Function} options.t - 本地化函数（分页状态和失败重试文案）
 * @param {number} options.pageSize - 每页数量，默认 20
 * @param {number} options.threshold - 触发阈值（距底部像素），默认 200
 * @param {Function} [options.autoFill] - 可选；返回 true 时继续搜索分页，无滚动空间时也会填充到可滚动
 * @returns {Object} 分页加载器实例
 */
export function createPaginationLoader(options) {
    const {
        container,
        loadMore,
        pageSize = 20,
        threshold = 200
    } = options;
    const translate = options.t;
    const autoFill = options.autoFill;
    const canLoad = options.canLoad;
    
    let currentPage = 1;  // 首屏已渲染第1页，loadMore前先递增，从第2页开始加载
    let isLoading = false;
    let hasMore = true;
    let debounceTimer = null;
    let generation = 0;  // 🔄 轻量级取消令牌，reset 时递增以丢弃飞行中请求
    let stopped = false;  // 保持创建后可手动加载；stop 后仅 start 能重新启用。
    const focusContainer = options.focusContainer || container;
    let retryFocus = null;
    
    // 加载指示器
    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "pagination-loading";
    loadingIndicator.setAttribute("role", "status");
    loadingIndicator.setAttribute("aria-live", "polite");
    loadingIndicator.setAttribute("aria-atomic", "true");
    const loadingSpinner = document.createElement("span");
    loadingSpinner.className = "pagination-loading__spinner";
    loadingSpinner.setAttribute("aria-hidden", "true");
    const loadingText = document.createElement("span");
    loadingText.textContent = translate("pagination.loading");
    loadingIndicator.append(loadingSpinner, loadingText);
    loadingIndicator.style.display = "none";
    
    // "没有更多"提示
    const endIndicator = document.createElement("div");
    endIndicator.className = "pagination-end";
    endIndicator.tabIndex = -1;
    endIndicator.setAttribute("role", "status");
    endIndicator.setAttribute("aria-live", "polite");
    endIndicator.textContent = translate("pagination.end");
    endIndicator.style.display = "none";

    const retryIndicator = document.createElement("div");
    retryIndicator.className = "pagination-error";
    retryIndicator.setAttribute("role", "alert");
    retryIndicator.setAttribute("aria-live", "assertive");
    const retryMessage = document.createElement("span");
    retryMessage.textContent = translate("pagination.failed");
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "pagination-error__retry";
    retryButton.textContent = translate("common.retry");
    retryIndicator.append(retryMessage, retryButton);
    retryIndicator.style.display = "none";
    
    const moveIndicatorsToEnd = () => {
        const parent = loadingIndicator.parentNode;
        if (!parent || endIndicator.parentNode !== parent || retryIndicator.parentNode !== parent) return;
        if (parent.lastChild === retryIndicator && retryIndicator.previousSibling === endIndicator &&
            endIndicator.previousSibling === loadingIndicator) return;
        parent.appendChild(loadingIndicator);
        parent.appendChild(endIndicator);
        parent.appendChild(retryIndicator);
    };

    const clearRetryFocus = () => {
        if (!retryFocus) return;
        retryFocus.doc.removeEventListener('focusin', retryFocus.onFocus, true);
        retryFocus.doc.removeEventListener('pointerdown', retryFocus.onPointer, true);
        retryFocus = null;
    };
    const captureRetryFocus = () => {
        clearRetryFocus();
        const doc = container.ownerDocument;
        if (doc.activeElement !== retryButton) return;
        const record = { generation, children: new Set(focusContainer.children), doc };
        record.onFocus = event => { if (event.target !== retryButton && event.target !== doc.body) clearRetryFocus(); };
        record.onPointer = () => clearRetryFocus();
        retryFocus = record;
        doc.addEventListener('focusin', record.onFocus, true);
        doc.addEventListener('pointerdown', record.onPointer, true);
    };
    const focusableSelector = 'button, a[href], input, select, textarea, [tabindex]';
    const firstFocusable = element => {
        const candidates = [element, ...element.querySelectorAll(focusableSelector)];
        return candidates.find(node => node.matches(focusableSelector) && !node.disabled && node.tabIndex >= 0
            && !node.closest('[inert], [aria-hidden="true"]') && node.getClientRects().length > 0
            && node.ownerDocument.defaultView.getComputedStyle(node).visibility !== 'hidden');
    };
    const restoreRetryFocus = willContinue => {
        if (!retryFocus) return;
        const doc = container.ownerDocument;
        if (stopped || retryFocus.generation !== generation || !container.isConnected || !focusContainer.isConnected
            || !doc.hasFocus() || !focusContainer.getClientRects().length
            || doc.defaultView.getComputedStyle(focusContainer).visibility === 'hidden'
            || (doc.activeElement !== doc.body && doc.activeElement !== retryButton)) {
            clearRetryFocus();
            return;
        }
        let target;
        if (retryIndicator.style.display !== 'none') target = retryButton;
        else {
            const children = Array.from(focusContainer.children);
            for (const child of children) {
                if (!retryFocus.children.has(child) && (target = firstFocusable(child))) break;
            }
            if (!target && willContinue) return;
            if (!target && !hasMore) target = endIndicator;
            if (!target) {
                for (const child of children.reverse()) {
                    if ((target = firstFocusable(child))) break;
                }
            }
            if (!target) {
                if (!focusContainer.hasAttribute('tabindex')) focusContainer.tabIndex = -1;
                target = focusContainer;
            }
        }
        clearRetryFocus();
        target.focus({ preventScroll: true });
    };

    // 滚动事件处理（带防抖）
    const handleScroll = () => {
        if (stopped) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        
        debounceTimer = setTimeout(() => {
            if (stopped || isLoading || !hasMore) return;
            
            const { scrollTop, scrollHeight, clientHeight } = container;
            const distanceToBottom = scrollHeight - scrollTop - clientHeight;
            
            if (distanceToBottom < threshold) {
                _loadNextPage();
            }
        }, 100);
    };
    
    // 加载下一页
    const _loadNextPage = async (retry = false) => {
        if (stopped || isLoading || (!hasMore && !retry)) return;
        if (typeof canLoad === "function" && !canLoad()) return;
        if (retry) {
            captureRetryFocus();
            retryIndicator.style.display = "none";
            hasMore = true;
        }
        
        isLoading = true;
        loadingIndicator.style.display = "block";
        const savedGen = generation;
        
        try {
            currentPage++;  // 先递增，再加载（首屏已渲染第1页，从第2页开始）
            const result = await loadMore(currentPage, pageSize, {
                isCurrent: () => savedGen === generation
            });
            if (savedGen !== generation) return;  // reset 被调用了，丢弃结果
            
            // 加载失败，允许重试
            if (result === null) {
                currentPage = Math.max(1, currentPage - 1);
                hasMore = false;
                loadingIndicator.style.display = "none";
                retryIndicator.style.display = "flex";
                return;
            }
            
            // 判断是否还有更多 - 返回空数组则停止
            if (!result || result.length === 0) {
                hasMore = false;
                loadingIndicator.style.display = "none";
                endIndicator.style.display = "block";
            } else {
                endIndicator.style.display = "none";
            }
        } catch (error) {
            if (savedGen === generation) {
                currentPage = Math.max(1, currentPage - 1);
                hasMore = false;
                retryIndicator.style.display = "flex";
                console.error("分页加载失败");
            }
        } finally {
            if (savedGen === generation) {
                moveIndicatorsToEnd();
                isLoading = false;
                loadingIndicator.style.display = "none";
                // Search callers can scan pages with no local matches without
                // changing pagination behavior for other lists.
                const willContinue = hasMore && typeof autoFill === "function" &&
                    (autoFill() || container.scrollHeight <= container.clientHeight + threshold);
                restoreRetryFocus(willContinue);
                if (willContinue) _loadNextPage();
            }
        }
    };

    retryButton.addEventListener("click", () => {
        if (stopped || isLoading) return;
        _loadNextPage(true);
    });
    
    // 启动监听
    const start = () => {
        stopped = false;
        container.addEventListener("scroll", handleScroll);
        // 添加指示器到容器末尾
        const scrollContent = container.querySelector(".scroll-content") || container;
        scrollContent.appendChild(loadingIndicator);
        scrollContent.appendChild(endIndicator);
        scrollContent.appendChild(retryIndicator);
    };
    
    // 停止监听
    const stop = () => {
        clearRetryFocus();
        stopped = true;
        generation++;
        if (isLoading) currentPage = Math.max(1, currentPage - 1);
        isLoading = false;
        container.removeEventListener("scroll", handleScroll);
        if (debounceTimer) clearTimeout(debounceTimer);
        loadingIndicator.style.display = "none";
        retryIndicator.style.display = "none";
        loadingIndicator.remove();
        endIndicator.remove();
        retryIndicator.remove();
    };
    
    // 重置状态
    const reset = () => {
        clearRetryFocus();
        generation++;  // 🔄 递增使飞行中请求结果被忽略
        currentPage = 1;  // 首屏已渲染第1页，分页器从第2页开始
        hasMore = true;
        isLoading = false;
        loadingIndicator.style.display = "none";
        endIndicator.style.display = "none";
        retryIndicator.style.display = "none";
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

/** Render an accessible, localized search state inside a list grid. */
export function renderListSearchMessage(container, message) {
    container.querySelector('.list-search-message')?.remove();
    const status = document.createElement("div");
    status.className = "list-search-message";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = message;
    Object.assign(status.style, {
        gridColumn: "1 / -1",
        textAlign: "center",
        padding: "24px 16px",
        color: "var(--descrip-text, #999)"
    });
    container.appendChild(status);
    return status;
}


// ==========================================
// 🖼️ 图片懒加载
// ==========================================
// 特点：
//   - 使用 IntersectionObserver API
//   - 支持占位图和加载动画
//   - 节点移除、读取超时与迟到结果清理

const lazyImages = new Map();
let lazyLoadObserver = null;
let lazyRemovalObserver = null;

function lazyPlaceholder(failed = false) {
    const text = t(failed ? 'image.load_failed' : 'image.loading');
    const fill = failed ? '%23ffeaea' : '%23f0f0f0';
    const color = failed ? '%23c44' : '%23999';
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='${fill}' width='100' height='100'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='${color}' font-size='12'%3E${encodeURIComponent(text)}%3C/text%3E%3C/svg%3E`;
}

function releaseLazyImage(record, restore = false) {
    const img = record.img;
    if (!img || lazyImages.get(img) !== record) return;
    if (restore && img.dataset.src === record.src && img.getAttribute('src') === record.placeholder) {
        img.loading = 'lazy';
        img.src = record.src;
        delete img.dataset.src;
        img.classList.remove('lazy-loading');
    }
    lazyImages.delete(img);
    lazyLoadObserver?.unobserve(img);
    if (record.timer !== null) clearTimeout(record.timer);
    record.timer = null;
    if (record.reader) {
        record.reader.onload = record.reader.onerror = null;
        record.reader.src = '';
        record.reader = null;
    }
    if (img._lazyCleanup === record.cleanup) delete img._lazyCleanup;
    record.img = null;
    record.cleanup = null;
    if (!lazyImages.size) {
        lazyLoadObserver?.disconnect(); lazyLoadObserver = null;
        lazyRemovalObserver?.disconnect(); lazyRemovalObserver = null;
    }
}

function ownsLazyImage(record) {
    const img = record.img;
    return !!img && lazyImages.get(img) === record && img.isConnected &&
        img.dataset.src === record.src && img.getAttribute('src') === record.placeholder;
}

function _initLazyLoadObserver() {
    if (lazyLoadObserver || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
        if (lazyLoadObserver !== observer) return;
        for (const entry of entries) {
            if (entry.isIntersecting) _loadImage(entry.target);
        }
    }, { rootMargin: LAZY_IMAGES.ROOT_MARGIN, threshold: LAZY_IMAGES.THRESHOLD });
    lazyLoadObserver = observer;
}

function watchLazyImages() {
    if (lazyRemovalObserver) return;
    const observer = new MutationObserver(mutations => {
        if (lazyRemovalObserver !== observer) return;
        for (const record of lazyImages.values()) {
            const img = record.img;
            if (mutations.some(mutation => [...mutation.addedNodes].some(node => node === img || node.contains?.(img)))) record.seen = true;
            if (img.isConnected) {
                record.seen = true;
                if (!record.reader && record.timer !== null) { clearTimeout(record.timer); record.timer = null; }
            }
            if ((!img.isConnected && record.seen) || img.dataset.src !== record.src || img.getAttribute('src') !== record.placeholder) {
                releaseLazyImage(record, !img.isConnected);
            }
        }
    });
    lazyRemovalObserver = observer;
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src'] });
}

function registerLazyImage(img, src) {
    const previous = lazyImages.get(img);
    if (previous) releaseLazyImage(previous);
    _initLazyLoadObserver();
    if (!lazyLoadObserver) {
        img.classList.add('lazy-image');
        img.src = src;
        delete img.dataset.src;
        img.classList.remove('lazy-loading', 'lazy-error');
        return;
    }
    const placeholder = lazyPlaceholder();
    img.dataset.src = src;
    img.src = placeholder;
    img.classList.remove('lazy-loaded', 'lazy-error');
    img.classList.add('lazy-image', 'lazy-loading');
    const record = { img, src, placeholder, seen: img.isConnected, reader: null, timer: null, cleanup: null };
    record.cleanup = () => releaseLazyImage(record, true);
    img._lazyCleanup = record.cleanup;
    lazyImages.set(img, record);
    watchLazyImages();
    if (!record.seen) record.timer = setTimeout(() => {
        if (ownsLazyImage(record)) { record.seen = true; record.timer = null; }
        else {
            const unmounted = !record.seen && img.dataset.src === src && img.getAttribute('src') === placeholder;
            releaseLazyImage(record);
            if (unmounted) { img.src = src; delete img.dataset.src; img.classList.remove('lazy-loading'); }
        }
    }, LAZY_IMAGES.MOUNT_TIMEOUT);
    lazyLoadObserver.observe(img);
}

function _loadImage(img) {
    const record = lazyImages.get(img);
    if (!record || record.reader) return;
    if (!ownsLazyImage(record)) {
        if (record.seen || img.dataset.src !== record.src || img.getAttribute('src') !== record.placeholder) releaseLazyImage(record, !img.isConnected);
        return;
    }
    record.seen = true;
    lazyLoadObserver?.unobserve(img);
    if (record.timer !== null) clearTimeout(record.timer);
    const reader = new Image();
    record.reader = reader;
    const finish = failed => {
        if (!ownsLazyImage(record)) { releaseLazyImage(record, !img.isConnected); return; }
        const src = record.src;
        releaseLazyImage(record);
        img.src = failed ? lazyPlaceholder(true) : src;
        img.classList.remove('lazy-loading');
        img.classList.add(failed ? 'lazy-error' : 'lazy-loaded');
        if (failed) img.dataset.retries = (parseInt(img.dataset.retries) || 0) + 1;
        else delete img.dataset.src;
    };
    reader.onload = () => finish(false);
    reader.onerror = () => finish(true);
    record.timer = setTimeout(() => finish(true), LAZY_IMAGES.READ_TIMEOUT);
    reader.src = record.src;
}

export function createLazyImage(src, alt = '', style = {}) {
    const img = document.createElement('img');
    img.alt = alt;
    Object.assign(img.style, { transition: 'opacity 0.3s ease', ...style });
    registerLazyImage(img, src);
    return img;
}

export function makeLazy(img) {
    if (!img.src || img.dataset.src) return;
    registerLazyImage(img, img.src);
}

export function lazyLoadImages(container, selector = 'img') {
    for (const img of container.querySelectorAll(selector)) {
        if (img.classList.contains('target-img') && img.closest('.img-viewport')?._sandboxCleanup) continue;
        if (img.dataset.src || img.src.startsWith('data:')) continue;
        makeLazy(img);
    }
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
    let generation = 0;
    const debounced = function(...args) {
        const current = ++generation;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            if (current !== generation) return;
            timer = null;
            fn.apply(this, args);
        }, delay);
    };
    debounced.cancel = () => {
        generation++;
        const pending = timer;
        timer = null;
        if (pending !== null) clearTimeout(pending);
    };
    return debounced;
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
//   - 跟随界面主题
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
                    <div style="display:flex;gap:12px;align-items:center;padding:8px;background:var(--comfy-menu-bg);border-radius:6px;border:1px solid var(--border-color, #333);">
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
    const resizeDebounce = debounce(() => {
        if (_isDestroyed) return;
        _containerHeight = container.clientHeight;
        render();
    }, 200);
    const handleResize = () => {
        if (!_isDestroyed) resizeDebounce();
    };
    
    // 初始化
    const init = () => {
        container.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleResize);
        render();
    };
    
    // 销毁
    const destroy = () => {
        _isDestroyed = true;
        resizeDebounce.cancel();
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

// ==========================================
// 🧹 P1优化：全局事件管理器
// ==========================================
// 特点：
//   - 统一管理所有 addEventListener
//   - 统一管理所有 setInterval/setTimeout
//   - 支持一键清理，防止内存泄漏
//   - 支持按组件分类管理

const eventManager = {
    // 存储所有注册的监听器 {componentId: [{target, event, handler, options}]}
    _listeners: new Map(),
    // 存储所有定时器 {componentId: Set<timerId>}
    _timers: new Map(),
    // 全局定时器（无组件关联）
    _globalTimers: new Set(),
    
    /**
     * 注册事件监听器
     * @param {string} componentId - 组件ID，用于分类管理
     * @param {EventTarget} target - 监听目标
     * @param {string} event - 事件类型
     * @param {Function} handler - 处理函数
     * @param {Object} options - 监听选项
     */
    addEventListener(componentId, target, event, handler, options = {}) {
        if (!target || !event || !handler) return;
        
        target.addEventListener(event, handler, options);
        
        if (!this._listeners.has(componentId)) {
            this._listeners.set(componentId, []);
        }
        this._listeners.get(componentId).push({ target, event, handler, options });
    },
    
    /**
     * 移除指定组件的所有事件监听器
     * @param {string} componentId - 组件ID
     */
    removeEventListeners(componentId) {
        const listeners = this._listeners.get(componentId);
        if (!listeners) return;
        
        listeners.forEach(({ target, event, handler, options }) => {
            try {
                target.removeEventListener(event, handler, options);
            } catch (e) {
                // 目标已销毁，忽略
            }
        });
        
        this._listeners.delete(componentId);
        console.log(`🧹 已清理 ${componentId} 的事件监听器`);
    },
    
    /**
     * 注册 setInterval
     * @param {string} componentId - 组件ID
     * @param {Function} fn - 回调函数
     * @param {number} delay - 间隔时间
     * @returns {number} 定时器ID
     */
    setInterval(componentId, fn, delay) {
        const id = setInterval(fn, delay);
        
        if (componentId) {
            if (!this._timers.has(componentId)) {
                this._timers.set(componentId, new Set());
            }
            this._timers.get(componentId).add(id);
        } else {
            this._globalTimers.add(id);
        }
        
        return id;
    },
    
    /**
     * 注册 setTimeout
     * @param {string} componentId - 组件ID
     * @param {Function} fn - 回调函数
     * @param {number} delay - 延迟时间
     * @returns {number} 定时器ID
     */
    setTimeout(componentId, fn, delay) {
        const id = setTimeout(() => {
            fn();
            // 执行后自动清除
            if (componentId) {
                const timers = this._timers.get(componentId);
                if (timers) timers.delete(id);
            } else {
                this._globalTimers.delete(id);
            }
        }, delay);
        
        if (componentId) {
            if (!this._timers.has(componentId)) {
                this._timers.set(componentId, new Set());
            }
            this._timers.get(componentId).add(id);
        } else {
            this._globalTimers.add(id);
        }
        
        return id;
    },
    
    /**
     * 清除指定组件的所有定时器
     * @param {string} componentId - 组件ID
     */
    clearTimers(componentId) {
        const timers = this._timers.get(componentId);
        if (!timers) return;
        
        timers.forEach(id => {
            clearInterval(id);
            clearTimeout(id);
        });
        
        this._timers.delete(componentId);
        console.log(`⏱️ 已清理 ${componentId} 的定时器`);
    },
    
    /**
     * 清理指定组件的所有资源（事件 + 定时器）
     * @param {string} componentId - 组件ID
     */
    cleanup(componentId) {
        this.removeEventListeners(componentId);
        this.clearTimers(componentId);
    },
    
    /**
     * 清理所有资源
     */
    cleanupAll() {
        // 清理所有组件的事件监听器
        this._listeners.forEach((_, componentId) => {
            this.removeEventListeners(componentId);
        });
        
        // 清理所有组件的定时器
        this._timers.forEach((_, componentId) => {
            this.clearTimers(componentId);
        });
        
        // 清理全局定时器
        this._globalTimers.forEach(id => {
            clearInterval(id);
            clearTimeout(id);
        });
        this._globalTimers.clear();
        
        console.log('🧹 已清理所有事件和定时器');
    },
    
    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        let totalListeners = 0;
        let totalTimers = 0;
        
        this._listeners.forEach(arr => totalListeners += arr.length);
        this._timers.forEach(set => totalTimers += set.size);
        totalTimers += this._globalTimers.size;
        
        return {
            components: this._listeners.size,
            listeners: totalListeners,
            timers: totalTimers
        };
    }
};

// 导出事件管理器
export { eventManager };

// ==========================================
// 🔍 列表缓存工具（列表视图缓存优先 / 详情页离线回退用）
// ==========================================

/**
 * 📴 读取列表首屏缓存（离线容灾口径，任务榜/讨论区/提示词统一走这里）
 *
 * 口径说明（原三处各自实现 getCacheWithMeta(key, true) + found && length>0，
 * 抄写三份容易在维护中走偏，故归一到本函数）：
 *   - 忽略过期：第二个参数传 true，缓存过期也算命中——断网/云端不通时首屏仍要能出内容，
 *     新鲜度交由调用方的 silentRefresh 后台补齐，不在此处拦
 *   - 空列表不算命中：云端确实返回过 0 条时同样落到网络分支重新拉取，
 *     避免用户新建第一条内容后被旧的空缓存挡住
 *   - 返回值是写入时的原始数据，调用方自行 proxyImages（与改造前完全一致）
 *
 * @param {string} cacheKey - 完整缓存 Key（含各自的筛选参数）
 * @returns {Array|null} 命中返回数组，未命中/空列表返回 null
 */
export function readListCache(cacheKey) {
    const { value, found } = getCacheWithMeta(cacheKey, true);  // true = 忽略过期
    if (!Array.isArray(value)) {
        if (found) removeCache(cacheKey);
        return null;
    }
    if (value.length === 0) return null;
    if (_hasInvalidListItem(value)) {
        removeCache(cacheKey);
        return null;
    }
    return value;
}

function _hasInvalidListItem(items) {
    return items.some(item => !item || typeof item !== "object" || Array.isArray(item));
}

/**
 * 💾 回写列表首屏缓存（持久化到 localStorage，保证重启后离线仍可展示）
 * @param {string} cacheKey - 完整缓存 Key
 * @param {Array} items - 原始数据（未经图片代理）
 * @param {number} ttl - 有效期（毫秒），由调用方传 getCacheTTL()
 */
export function writeListCache(cacheKey, items, ttl) {
    if (!Array.isArray(items) || _hasInvalidListItem(items)) return;
    setCache(cacheKey, items, ttl, true);  // true = 持久化 localStorage
}

/**
 * Validate a successful list endpoint envelope before data reaches UI state or cache.
 * @param {Object} response - API response envelope
 * @returns {Array} validated list data
 */
export function requireListResponseData(response) {
    if (response?.status !== "success" || !Array.isArray(response.data)
        || _hasInvalidListItem(response.data)) {
        const error = new Error("Invalid list response");
        error.name = "InvalidListResponseError";
        throw error;
    }
    return response.data;
}

/**
 * 判断后台成功响应的空数组是否会覆盖当前榜单已有内容。
 * 列表服务在冷启动/数据同步窗口可能暂时返回空数组；已有结果应继续显示，
 * 直到非空新数据到达。无缓存时的真实空列表仍按正常结果处理。
 * @param {Array} nextItems 本次请求得到的列表
 * @param {Array} currentItems 当前榜单已显示的数据
 * @returns {boolean} 是否应跳过此次缓存回写和列表替换
 */
export function isEmptyListRefreshWithExistingData(nextItems, currentItems) {
    return Array.isArray(nextItems) && nextItems.length === 0
        && Array.isArray(currentItems) && currentItems.length > 0;
}

/**
 * 渲染可访问的列表首屏失败状态，并提供显式重试入口。
 * 使用 DOM/textContent，避免错误文案进入 HTML sink。
 */
export function renderListLoadError(container, message, onRetry, t, error = null) {
    if (!container) return;
    const status = document.createElement("div");
    status.className = "comfy-ranking-list-error";
    status.setAttribute("role", "alert");
    status.setAttribute("aria-live", "assertive");

    const text = document.createElement("p");
    text.className = "comfy-ranking-list-error__message";
    text.textContent = message;

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "comfy-ranking-list-error__retry";
    retry.textContent = t("common.retry");
    retry.addEventListener("click", () => {
        if (!status.isConnected || status.parentNode !== container) return;
        onRetry?.();
    });

    status.append(text, retry);
    container.replaceChildren(status);
    appendRequestDiagnostic(container, error, t);
}


export function appendRequestDiagnostic(container, error, t, isCurrent = () => true) {
    if (!container || !isCurrent()) return;
    const requestId = error?.requestId;
    if (typeof requestId !== 'string' || !API.REQUEST_ID_PATTERN.test(requestId)) return;

    const details = document.createElement('details');
    details.className = 'comfy-ranking-request-diagnostic';
    const summary = document.createElement('summary');
    summary.textContent = t('feedback.diagnostic_details');
    const label = document.createElement('label');
    label.className = 'comfy-ranking-request-diagnostic__label';
    label.textContent = t('feedback.request_id');
    const input = document.createElement('input');
    input.type = 'text'; input.readOnly = true; input.spellcheck = false;
    input.value = requestId;
    label.append(input);
    const copy = document.createElement('button');
    copy.type = 'button'; copy.textContent = t('common.copy');
    const feedback = document.createElement('p');
    feedback.className = 'comfy-ranking-request-diagnostic__feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    let copying = false;
    copy.addEventListener('click', async () => {
        if (copying || !details.isConnected || !isCurrent()) return;
        copying = true; copy.setAttribute('aria-busy', 'true');
        try {
            if (typeof navigator.clipboard?.writeText !== 'function') throw new Error();
            await navigator.clipboard.writeText(requestId);
            if (details.isConnected && isCurrent()) feedback.textContent = t('feedback.copied');
        } catch {
            if (details.isConnected && isCurrent()) {
                feedback.textContent = t('feedback.copy_id_manually');
                if (document.activeElement === copy) { input.focus(); input.select(); }
            }
        } finally {
            copying = false;
            if (details.isConnected && isCurrent()) copy.setAttribute('aria-busy', 'false');
        }
    });
    details.append(summary, label, copy, feedback);
    container.append(details);
    return details;
}

/**
 * 🔍 从列表缓存中查找指定项（详情页离线回退用）
 * @param {string} prefix - 缓存Key前缀（如 "TasksCache_"、"PostsCache_"）
 * @param {string} id - 要查找的项目ID
 * @returns {Object|null} 找到的项目数据，或null
 */
export function findInListCache(prefix, id) {
    try {
        for (const cacheKey of getCacheKeysByPrefix(prefix)) {
            const items = readListCache(cacheKey);
            if (!items) continue;
            const item = items.find(entry => entry.id === id);
            if (item) return item;
        }
    } catch (e) {
        console.warn("列表缓存查找失败");
    }
    return null;
}


