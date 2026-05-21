// 前端页面/core/网络请求_缓存管理.js
// ==========================================
// 💾 缓存管理模块
// ==========================================
// 作用：管理API请求的缓存配置、缓存失效策略和TTL计算
// 同时包含缓存底层实现（内存+localStorage双层、LRU淘汰、分级TTL）
// 关联文件：
//   - 全局配置.js (CACHE 配置)
//   - 性能优化工具.js (重导出缓存函数，保持向后兼容)
// ==========================================

import { CACHE } from "./全局配置.js";

// ==========================================
// 📦 缓存底层实现
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
 * 生成完整缓存键（带前缀）
 * @param {string} key - 原始键
 * @returns {string} 完整键
 */
function _fullKey(key) {
    return CACHE_PREFIX + key;
}

/**
 * 检查缓存条目是否已过期
 * @param {{expireAt: number}} cached - 缓存条目
 * @returns {boolean}
 */
function _isExpired(cached) {
    return Date.now() >= cached.expireAt;
}

/**
 * 安全写入 localStorage，配额不足时先清理过期项再重试，仍失败则 LRU 淘汰后重试
 * @param {string} fullKey - 完整缓存键
 * @param {string} jsonStr - 序列化后的值
 */
function _safeStorageWrite(fullKey, jsonStr) {
    try {
        localStorage.setItem(fullKey, jsonStr);
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.warn('⚠️ localStorage 已满，尝试清理过期缓存...');
            _cleanExpiredStorage();
            try {
                localStorage.setItem(fullKey, jsonStr);
            } catch {
                let stored = false;
                for (let attempt = 0; attempt < 5 && !stored; attempt++) {
                    const evicted = _evictOldestStorage();
                    if (!evicted) break;
                    try {
                        localStorage.setItem(fullKey, jsonStr);
                        stored = true;
                    } catch {
                        // 继续淘汰
                    }
                }
                if (!stored) {
                    console.warn(`⚠️ localStorage 持久化失败，降级到仅内存缓存: ${fullKey}`);
                }
            }
        } else {
            console.warn('⚠️ localStorage 存储失败:', fullKey, e.message);
        }
    }
}

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {number} ttl - 过期时间（毫秒），默认2小时
 * @param {boolean} persist - 是否持久化到 localStorage
 */
export function setCache(key, value, ttl = DEFAULT_TTL, persist = true) {
    const fk = _fullKey(key);
    const expireAt = Date.now() + ttl;
    const cacheData = { value, expireAt };
    
    // 内存缓存
    memoryCache.set(fk, cacheData);
    _updateLRU(fk);
    _enforceCacheLimit();
    
    // 持久化缓存
    if (persist) {
        _safeStorageWrite(fk, JSON.stringify(cacheData));
    }
}

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {any|null} 缓存值，过期或不存在返回 null
 */
export function getCache(key) {
    const fk = _fullKey(key);
    
    // 优先从内存获取
    if (memoryCache.has(fk)) {
        const cached = memoryCache.get(fk);
        if (!_isExpired(cached)) {
            _updateLRU(fk);
            return cached.value;
        }
        // 过期，清除
        memoryCache.delete(fk);
    }
    
    // 降级到 localStorage
    try {
        const stored = localStorage.getItem(fk);
        if (stored) {
            const cached = JSON.parse(stored);
            if (!_isExpired(cached)) {
                // 回填内存缓存
                memoryCache.set(fk, cached);
                _updateLRU(fk);
                return cached.value;
            }
            // 过期，清除
            localStorage.removeItem(fk);
        }
    } catch (e) {
        console.warn("⚠️ 缓存读取失败:", key);
    }
    
    return null;
}

/**
 * 🚀 P3优化：获取缓存（带元信息，支持离线模式）
 * @param {string} key - 缓存键
 * @param {boolean} ignoreExpiry - 是否忽略过期时间（离线模式使用）
 * @returns {{value: any, expired: boolean, found: boolean}} 缓存结果
 */
export function getCacheWithMeta(key, ignoreExpiry = false) {
    const fk = _fullKey(key);
    
    // 优先从内存获取
    if (memoryCache.has(fk)) {
        const cached = memoryCache.get(fk);
        const expired = _isExpired(cached);
        
        if (!expired || ignoreExpiry) {
            _updateLRU(fk);
            return { value: cached.value, expired, found: true };
        }
        // 过期且不忽略，清除
        memoryCache.delete(fk);
    }
    
    // 降级到 localStorage
    try {
        const stored = localStorage.getItem(fk);
        if (stored) {
            const cached = JSON.parse(stored);
            const expired = _isExpired(cached);
            
            if (!expired || ignoreExpiry) {
                // 回填内存缓存
                memoryCache.set(fk, cached);
                _updateLRU(fk);
                return { value: cached.value, expired, found: true };
            }
            // 过期且不忽略，清除
            localStorage.removeItem(fk);
        }
    } catch (e) {
        console.warn("⚠️ 缓存读取失败:", key);
    }
    
    return { value: null, expired: false, found: false };
}

/**
 * 删除缓存
 * @param {string} key - 缓存键
 */
export function removeCache(key) {
    const fk = _fullKey(key);
    memoryCache.delete(fk);
    try {
        localStorage.removeItem(fk);
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
// @param {boolean} aggressive - 是否激进模式（同时清除所有项而非仅过期项）
function _cleanExpiredStorage(aggressive = false) {
    try {
        const now = Date.now();
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                if (aggressive) {
                    // 激进模式：清除所有缓存项
                    keysToRemove.push(key);
                } else {
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
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        if (keysToRemove.length > 0) {
            console.log(`🧹 清理 localStorage 过期缓存: ${keysToRemove.length} 个项`);
        }
    } catch {}
}

// LRU 淘汰：按最近使用时间删除最旧的 localStorage 缓存项
function _evictOldestStorage() {
    try {
        const entries = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    entries.push({ key, expireAt: cached.expireAt || 0 });
                } catch {
                    localStorage.removeItem(key);
                }
            }
        }
        
        if (entries.length === 0) return false;
        
        entries.sort((a, b) => a.expireAt - b.expireAt);
        
        // 🧹 批量淘汰策略：每次淘汰最旧的 30%（温和策略，减少频繁全量扫描）
        const evictCount = Math.max(1, Math.ceil(entries.length * 0.3));
        for (let i = 0; i < evictCount; i++) {
            localStorage.removeItem(entries[i].key);
        }
        console.warn(`⚠️ LRU 淘汰: 删除了 ${evictCount} 个最旧 localStorage 缓存项`);
        return true;
    } catch {
        return false;
    }
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

// 🏗️ P2架构优化：使用配置中心的缓存配置
const CACHE_CONFIG = {
    "/api/items": CACHE.TTL.LIST_DATA,
    "/api/creators": CACHE.TTL.CREATORS,
    "/api/users/": CACHE.TTL.USER_PROFILE,
    "/api/wallet/": CACHE.TTL.WALLET,
    "/api/tasks": CACHE.TTL.DETAIL_DATA,
    "/api/posts": CACHE.TTL.DETAIL_DATA,
    "/api/disputes": CACHE.TTL.DETAIL_DATA,
}; 

// 🚀 P1优化：精确缓存失效映射（按 HTTP 方法细分）
// 根据修改的 endpoint 和 HTTP 方法精确清除相关缓存
const CACHE_INVALIDATION_MAP = {
    // 任务相关
    "/api/tasks": {
        "POST": ["api_/api/tasks", "ComfyRanking_ListCache_tasks"],      // 创建任务，清除列表缓存
        "PUT": ["api_/api/tasks"],                                        // 更新任务，清除列表缓存
        "DELETE": ["api_/api/tasks", "ComfyRanking_ListCache_tasks"],    // 删除任务，清除列表缓存
        "INTERACTION": ["api_/api/tasks", "ComfyRanking_ListCache_tasks"] // 👍 互动操作（view/like/favorite/tip）
    },
    // 帖子相关
    "/api/posts": {
        "POST": ["api_/api/posts", "ComfyRanking_ListCache_posts"],      // 创建帖子，清除列表缓存
        "PUT": ["api_/api/posts"],                                        // 更新帖子，清除列表缓存
        "DELETE": ["api_/api/posts", "ComfyRanking_ListCache_posts"],    // 删除帖子，清除列表缓存
        "INTERACTION": ["api_/api/posts", "ComfyRanking_ListCache_posts"] // 👍 互动操作（view/like/favorite/tip）
    },
    // 评论相关
    "/api/comments": {
        "POST": ["api_/api/comments", "api_/api/posts", "api_/api/items"],  // 创建评论，清除评论和相关内容缓存
        "DELETE": ["api_/api/comments", "api_/api/posts", "api_/api/items"] // 删除评论，清除评论和相关内容缓存
    },
    // 商品相关
    "/api/items": {
        "POST": ["api_/api/items", "api_/api/creators"],                 // 创建商品，清除商品列表和创作者列表
        "PUT": ["api_/api/items"],                                        // 更新商品，仅清除商品列表（不碰创作者）
        "DELETE": ["api_/api/items", "api_/api/creators"],               // 删除商品，清除商品列表和创作者列表
        "INTERACTION": ["api_/api/items", "api_/api/creators"]           // 👍 互动操作（view/like）
    },
    // 用户相关
    "/api/users": {
        "PUT": [
            "api_/api/users",
            "ComfyRanking_ProfileCache_",
            "ComfyCommunity_ProfileCache_",  // 新增：SWR头像缓存
            "api_/api/creators",
            "ComfyRanking_ListCache_",       // 新增：所有列表缓存（含头像字段）
        ],
        "POST": ["api_/api/users"]                                        // 用户相关操作
    },
    // 钱包相关
    "/api/wallet": {
        "POST": ["api_/api/wallet"],                                      // 钱包操作（打赏、购买等）
        "PUT": ["api_/api/wallet"]                                        // 更新钱包
    },
    // 私信相关
    "/api/messages": {
        "POST": ["api_/api/messages", "ComfyRanking_ChatHistory_"]       // 发送消息，清除消息缓存
    }
};

/**
 * 🚀 P1优化：精确清除相关缓存（支持按 HTTP 方法细分）
 * @param {string} endpoint - 请求的 endpoint
 * @param {string} method - HTTP 方法（可选，向后兼容）
 */
export function invalidateRelatedCache(endpoint, method = null) {
    // 检测是否为互动操作（view/like/favorite/tip）
    const isInteraction = /\/(view|like|favorite|tip|use)$/.test(endpoint);
    
    // 查找匹配的缓存失效规则
    let patterns = [];
    for (const [pattern, methodMap] of Object.entries(CACHE_INVALIDATION_MAP)) {
        if (endpoint.startsWith(pattern)) {
            // 如果是互动操作，优先使用 INTERACTION 规则
            if (isInteraction && methodMap["INTERACTION"]) {
                patterns = methodMap["INTERACTION"];
            }
            // 如果传入了 method，使用对应方法的规则
            else if (method && methodMap[method]) {
                patterns = methodMap[method];
            } else if (method) {
                // 如果该 method 没有定义规则，使用空数组（不清除）
                patterns = [];
            } else {
                // 向后兼容：未传 method 时，合并所有方法的规则
                const allPatterns = new Set();
                Object.values(methodMap).forEach(arr => arr.forEach(p => allPatterns.add(p)));
                patterns = Array.from(allPatterns);
            }
            break;
        }
    }
    
    // 如果没有匹配规则，使用默认策略（清除所有列表缓存）
    if (patterns.length === 0) {
        patterns = ["ComfyRanking_ListCache_"];
    }
    
    let cleared = 0;
    Object.keys(localStorage).forEach(key => {
        for (const pattern of patterns) {
            // 自动补上缓存前缀，确保能匹配到实际的 localStorage 键
            // localStorage 中的 key 形如 "ComfyRanking_api_/api/tasks?..."
            const prefixedPattern = pattern.startsWith(CACHE.PREFIX) ? pattern : CACHE.PREFIX + pattern;
            if (key.startsWith(prefixedPattern)) {
                localStorage.removeItem(key);
                cleared++;
                break;
            }
        }
    });
    
    if (cleared > 0) {
        console.log(`🗑️ 精确清除缓存: ${cleared} 个项 (${endpoint}${method ? ` ${method}` : ''})`);
    }
} 

// 获取缓存TTL
export function _getCacheTTL(endpoint) {
    for (const [pattern, ttl] of Object.entries(CACHE_CONFIG)) {
        if (endpoint.startsWith(pattern)) {
            return ttl;
        }
    }
    return 0; // 默认不缓存
}

// 注：getCache/setCache/removeCache/clearAllCache/getCacheWithMeta 已在本文件内直接定义，无需 re-export

// 导出配置和映射
export { CACHE_CONFIG, CACHE_INVALIDATION_MAP };
