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

import { API, CACHE } from "./全局配置.js";

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
const CACHE_SCHEMA_VERSION = 2;
const MAX_STORAGE_BYTES = CACHE.MAX_STORAGE_BYTES;
let storageUsageBytes = null;
let lastStorageBudgetSweepAt = 0;

// 内存缓存（最快）
const memoryCache = new Map();
const memoryCacheOrder = []; // LRU 顺序追踪
const memoryOnlyEntries = new WeakSet();

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

function _isValidCacheEntry(cached) {
    return !!cached && typeof cached === "object"
        && Object.prototype.hasOwnProperty.call(cached, "value")
        && Number.isFinite(cached.expireAt)
        && (cached.schemaVersion == null || (Number.isInteger(cached.schemaVersion)
            && cached.schemaVersion >= 1 && cached.schemaVersion <= CACHE_SCHEMA_VERSION));
}

// 同前缀的本地记录/配置使用独立格式；自动缓存清理不能处理它们。
function _isManagedStorageKey(key) {
    if (!key || !key.startsWith(CACHE_PREFIX)) return false;
    return !Object.values(CACHE.LOCAL_KEYS).some(localKey => key === localKey
        || key.startsWith(localKey.endsWith('_') ? localKey : localKey + '_'));
}

/**
 * 安全写入 localStorage，配额不足时先清理过期项再重试，仍失败则 LRU 淘汰后重试
 * @param {string} fullKey - 完整缓存键
 * @param {string} jsonStr - 序列化后的值
 */
function _safeStorageWrite(fullKey, jsonStr) {
    try {
        localStorage.setItem(fullKey, jsonStr);
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            storageUsageBytes = null;
            console.warn('⚠️ localStorage 已满，尝试清理过期缓存...');
            _cleanExpiredStorage();
            try {
                localStorage.setItem(fullKey, jsonStr);
                return true;
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
                    console.warn('localStorage 持久化失败，保留内存缓存');
                }
                return stored;
            }
        } else {
            console.warn('localStorage 存储不可用，保留内存缓存');
            return false;
        }
    }
}

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {number} ttl - 过期时间（毫秒），默认2小时
 * @param {boolean} persist - 是否持久化到 localStorage
 * @param {{etag?: string}} metadata - 可选的正文验证器，与value一同失效
 */
export function setCache(key, value, ttl = DEFAULT_TTL, persist = true, metadata = {}) {
    const fk = _fullKey(key);
    const expireAt = Date.now() + ttl;
    const cacheData = { schemaVersion: CACHE_SCHEMA_VERSION, value, expireAt, lastAccessAt: Date.now() };
    memoryOnlyEntries.add(cacheData);
    if (typeof metadata?.etag === "string" && API.CONDITIONAL_ETAG_PATTERN.test(metadata.etag)) cacheData.etag = metadata.etag;
    
    // 内存缓存
    memoryCache.set(fk, cacheData);
    _updateLRU(fk);
    _enforceCacheLimit();
    
    // 持久化缓存
    if (persist) {
        let jsonStr;
        try {
            jsonStr = JSON.stringify(cacheData);
        } catch {
            console.warn('缓存无法序列化，保留内存缓存');
            return;
        }
        if ((fk.length + jsonStr.length) * 2 > MAX_STORAGE_BYTES) {
            console.warn('缓存条目超过持久化预算，保留内存缓存');
            return;
        }
        let previousBytes = 0;
        let previousLengthKnown = false;
        try {
            const previous = localStorage.getItem(fk);
            previousBytes = previous === null ? 0 : (fk.length + previous.length) * 2;
            previousLengthKnown = true;
        } catch {}
        if (_safeStorageWrite(fk, jsonStr)) {
            memoryOnlyEntries.delete(cacheData);
            if (storageUsageBytes !== null && previousLengthKnown) {
                storageUsageBytes += (fk.length + jsonStr.length) * 2 - previousBytes;
            } else {
                storageUsageBytes = null;
            }
            _enforceStorageBudget(fk);
        }
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
        if (!_isValidCacheEntry(cached)) _deleteMemoryEntry(fk);
        else {
            if (!_isExpired(cached)) {
                _updateLRU(fk);
                _touchStorageEntry(fk, cached);
                return cached.value;
            }
            // 仅内存缓存也需要保留过期副本，供弱网回退使用。
        }
    }
    
    // 降级到 localStorage
    try {
        const stored = localStorage.getItem(fk);
        if (stored) {
            const cached = JSON.parse(stored);
            if (!_isValidCacheEntry(cached)) {
                localStorage.removeItem(fk);
                return null;
            }
            if (!_isExpired(cached)) {
                // 回填内存缓存
                memoryCache.set(fk, cached);
                _updateLRU(fk);
                _enforceCacheLimit();
                _touchStorageEntry(fk, cached);
                return cached.value;
            }
            // 🔧 修复：过期条目不再物理删除，保留给断网时的过期缓存兜底使用；
            // 过期数据的真正清理由配额溢出时的 _cleanExpiredStorage / LRU 淘汰承担。
            // （原实现此处删除会导致 request() 新鲜检查先删、离线兜底后读而落空）
        }
    } catch (e) {
        console.warn("⚠️ 缓存读取失败。");
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
        if (!_isValidCacheEntry(cached)) _deleteMemoryEntry(fk);
        else {
            const expired = _isExpired(cached);

            if (!expired || ignoreExpiry) {
                _updateLRU(fk);
                _touchStorageEntry(fk, cached);
                return { value: cached.value, expired, found: true, ...(typeof cached.etag === "string" && API.CONDITIONAL_ETAG_PATTERN.test(cached.etag) ? { etag: cached.etag } : {}) };
            }
            // 新鲜度检查不删除数据；淘汰仍由 LRU 和显式失效负责。
        }
    }
    
    // 降级到 localStorage
    try {
        const stored = localStorage.getItem(fk);
        if (stored) {
            const cached = JSON.parse(stored);
            if (!_isValidCacheEntry(cached)) {
                localStorage.removeItem(fk);
                return { value: null, expired: false, found: false };
            }
            const expired = _isExpired(cached);
            
            if (!expired || ignoreExpiry) {
                // 回填内存缓存
                memoryCache.set(fk, cached);
                _updateLRU(fk);
                _enforceCacheLimit();
                _touchStorageEntry(fk, cached);
                return { value: cached.value, expired, found: true, ...(typeof cached.etag === "string" && API.CONDITIONAL_ETAG_PATTERN.test(cached.etag) ? { etag: cached.etag } : {}) };
            }
            // 与内存层一致，保留过期条目供离线兜底。
        }
    } catch (e) {
        console.warn("⚠️ 缓存读取失败。");
    }
    
    return { value: null, expired: false, found: false };
}

/**
 * 删除内存缓存条目（同步维护 LRU 顺序数组）
 * 🔧 修复：原先各处只调 memoryCache.delete(fk)，残留在 memoryCacheOrder 里的幽灵键会
 * 占用 MAX_MEMORY_ITEMS 名额，使 _enforceCacheLimit 淘汰到已不存在的键，内存缓存实际容量缩水
 * @param {string} fk - 完整缓存键（已含前缀）
 */
function _deleteMemoryEntry(fk) {
    memoryCache.delete(fk);
    const idx = memoryCacheOrder.indexOf(fk);
    if (idx > -1) memoryCacheOrder.splice(idx, 1);
}

/**
 * 按业务前缀取得两级缓存键快照，返回不含 CACHE.PREFIX 的键。
 * 内存键排在前面并去重；存储访问失败不影响仅内存缓存的离线查找。
 * 此处只枚举键，条目结构与 TTL 仍由 getCacheWithMeta 校验。
 */
export function getCacheKeysByPrefix(prefix) {
    if (typeof prefix !== "string" || !prefix) return [];
    const fullPrefix = _fullKey(prefix);
    const keys = new Set();
    for (const key of memoryCache.keys()) {
        if (key.startsWith(fullPrefix)) keys.add(key.slice(CACHE_PREFIX.length));
    }
    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key && key.startsWith(fullPrefix)) keys.add(key.slice(CACHE_PREFIX.length));
        }
    } catch {
        // 禁用存储或浏览器隐私策略下，继续使用上面已取得的内存键。
    }
    return [...keys];
}

function _touchStorageEntry(key, cached) {
    if (memoryOnlyEntries.has(cached)) return;
    try {
        const now = Date.now();
        if (Number.isFinite(cached.lastAccessAt) && now - cached.lastAccessAt < 60_000) return;
        if (localStorage.getItem(key) === null) return;
        cached.lastAccessAt = now;
        localStorage.setItem(key, JSON.stringify(cached));
    } catch {}
}

/** Keep this plugin's persistent cache within its estimated UTF-16 storage budget. */
function _enforceStorageBudget(protectedKey = null) {
    const now = Date.now();
    if (storageUsageBytes !== null && storageUsageBytes <= MAX_STORAGE_BYTES
        && now - lastStorageBudgetSweepAt < 60_000) return;

    try {
        const entries = [];
        const invalidKeys = [];
        let totalBytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!_isManagedStorageKey(key)) continue;
            const raw = localStorage.getItem(key);
            if (raw === null) continue;
            let cached;
            try {
                cached = JSON.parse(raw);
            } catch {
                invalidKeys.push(key);
                continue;
            }
            if (!_isValidCacheEntry(cached)) {
                invalidKeys.push(key);
                continue;
            }
            const sizeBytes = (key.length + raw.length) * 2;
            const writtenAt = Number.isFinite(cached.expireAt) ? cached.expireAt - DEFAULT_TTL : 0;
            entries.push({ key, sizeBytes, lastAccessAt: Number.isFinite(cached.lastAccessAt) ? cached.lastAccessAt : writtenAt });
            totalBytes += sizeBytes;
        }
        invalidKeys.forEach(key => localStorage.removeItem(key));

        let evicted = 0;
        for (const entry of [...entries]) {
            if (entry.key === protectedKey && entry.sizeBytes > MAX_STORAGE_BYTES) {
                localStorage.removeItem(entry.key);
                totalBytes -= entry.sizeBytes;
                entries.splice(entries.indexOf(entry), 1);
                evicted++;
            }
        }
        entries.sort((a, b) => a.lastAccessAt - b.lastAccessAt);
        while (totalBytes > MAX_STORAGE_BYTES && entries.length > 0) {
            const oldest = entries.shift();
            localStorage.removeItem(oldest.key);
            totalBytes -= oldest.sizeBytes;
            evicted++;
        }
        storageUsageBytes = totalBytes;
        lastStorageBudgetSweepAt = now;
        if (evicted > 0) {
            console.warn(`⚠️ 本地缓存超过约 ${Math.round(MAX_STORAGE_BYTES / 1024)} KiB 预算，按最近访问时间淘汰 ${evicted} 项`);
        }
    } catch {
        // 存储不可用时保留内存缓存；下一次持久化再重试预算扫描。
        storageUsageBytes = null;
    }
}

/**
 * 删除缓存（精确键，内存 + localStorage 两级）
 * @param {string} key - 缓存键
 */
export function removeCache(key) {
    const fk = _fullKey(key);
    _deleteMemoryEntry(fk);
    try {
        localStorage.removeItem(fk);
    } catch {}
    storageUsageBytes = null;
}

/**
 * 🧹 按前缀删除缓存（内存 + localStorage 两级）
 * removeCache 是精确键删除，而 API 层缓存键总是带查询串（形如
 * api_/api/items?type=tool&sort=time&limit=200），调用方无法预知完整键，
 * 用 removeCache('api_/api/items') 删除会全部落空（no-op），故提供前缀删除。
 * 键空间兼容：本模块 setCache 写入的键带 CACHE.PREFIX；少数历史缓存
 * （如 SWR 头像 ComfyCommunity_ProfileCache_*）是直接写 localStorage 的裸键，
 * 两种都要匹配，避免无条件补前缀导致裸键类前缀永远命中不到。
 * @param {string} prefix - 缓存键前缀
 * @returns {number} 实际删除的缓存项数（两级按完整键去重）
 */
export function removeCacheByPrefix(prefix) {
    if (!prefix) return 0;
    return _removeCacheByPrefixes([prefix]);
}

function _removeCacheByPrefixes(prefixes) {
    const candidates = [...new Set(prefixes.flatMap(prefix =>
        prefix.startsWith(CACHE_PREFIX) ? [prefix] : [_fullKey(prefix), prefix]))];
    const isMatch = (key) => candidates.some(p => key.startsWith(p));
    const removed = new Set();

    // 🔧 内存层必须先清：getCache / getCacheWithMeta 都优先读 memoryCache，
    // 只清 localStorage 的话旧数据仍会命中内存并被直接返回（请求根本不会发出）
    for (const fk of Array.from(memoryCache.keys())) {
        if (isMatch(fk)) {
            _deleteMemoryEntry(fk);
            removed.add(fk);
        }
    }

    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && isMatch(k)) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => {
            localStorage.removeItem(k);
            removed.add(k);
        });
    } catch {}

    if (removed.size > 0) storageUsageBytes = null;
    return removed.size;
}

/**
 * 清除所有缓存
 */
export function clearAllCache() {
    memoryCache.clear();
    memoryCacheOrder.length = 0;
    storageUsageBytes = null;
    
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        return true;
    } catch {
        return false;
    }
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
            if (_isManagedStorageKey(key)) {
                if (aggressive) {
                    // 激进模式：清除所有缓存项
                    keysToRemove.push(key);
                } else {
                    let stored;
                    try { stored = localStorage.getItem(key); } catch { continue; }
                    if (stored === null) continue;
                    try {
                        const cached = JSON.parse(stored);
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
        const invalidKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (_isManagedStorageKey(key)) {
                let stored;
                try { stored = localStorage.getItem(key); } catch { continue; }
                if (stored === null) continue;
                try {
                    const cached = JSON.parse(stored);
                    if (!_isValidCacheEntry(cached)) {
                        invalidKeys.push(key);
                        continue;
                    }
                    const writtenAt = Number.isFinite(cached.expireAt) ? cached.expireAt - DEFAULT_TTL : 0;
                    entries.push({ key, lastAccessAt: Number.isFinite(cached.lastAccessAt) ? cached.lastAccessAt : writtenAt });
                } catch {
                    invalidKeys.push(key);
                }
            }
        }
        
        invalidKeys.forEach(key => localStorage.removeItem(key));
        if (entries.length === 0) return invalidKeys.length > 0;
        
        entries.sort((a, b) => a.lastAccessAt - b.lastAccessAt);
        
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
        "POST": ["api_/api/posts", "ComfyRanking_ListCache_posts", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],      // 创建帖子，清除列表缓存
        "PUT": ["api_/api/posts", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],                                        // 更新帖子，清除列表缓存
        "DELETE": ["api_/api/posts", "ComfyRanking_ListCache_posts", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],    // 删除帖子，清除列表缓存
        "INTERACTION": ["api_/api/posts", "ComfyRanking_ListCache_posts", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX] // 👍 互动操作（view/like/favorite/tip）
    },
    // 评论相关
    "/api/comments": {
        "POST": ["api_/api/comments", "api_/api/posts", "api_/api/items"],  // 创建评论，清除评论和相关内容缓存
        "DELETE": ["api_/api/comments", "api_/api/posts", "api_/api/items"] // 删除评论，清除评论和相关内容缓存
    },
    // 商品相关
    "/api/items": {
        "POST": ["api_/api/items", "api_/api/creators", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],                 // 创建商品，清除商品列表和创作者列表
        "PUT": ["api_/api/items", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],                                        // 更新商品，仅清除商品列表（不碰创作者）
        "DELETE": ["api_/api/items", "api_/api/creators", ...CACHE.RESOURCE_LIST_PREFIXES, CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX], // 删除商品也清除四类排序缓存
        "INTERACTION": ["api_/api/items", "api_/api/creators", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX]           // 👍 互动操作（view/like）
    },
    "/api/prompts": {
        "POST": ["api_/api/prompts", "PromptsCache_", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],
        "PUT": ["api_/api/prompts", "PromptsCache_", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],
        "DELETE": ["api_/api/prompts", "PromptsCache_", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX],
        "INTERACTION": ["api_/api/prompts", "PromptsCache_", CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX]
    },
    "/api/interactions": { "POST": ["api_/api/items", "api_/api/creators", ...CACHE.RESOURCE_LIST_PREFIXES, CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX] },
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
    
    // 🔧 修复：原实现只遍历 localStorage，漏清 memoryCache —— 而 getCache/getCacheWithMeta
    // 都优先读内存 Map，POST 成功后内存里的旧列表仍会命中并被直接返回（连请求都不发），
    // 表现为「发布/点赞已成功但界面还是旧数据」，要等内存条目 TTL 到期才自愈。
    // 🔧 同时修复：原实现无条件给 pattern 补 CACHE.PREFIX，使上方映射表中的裸键前缀
    // （ComfyCommunity_ProfileCache_，SWR 头像缓存直接写 localStorage、不带前缀）被拼成
    // ComfyRanking_ComfyCommunity_ProfileCache_，永远匹配不到，改头像/昵称后该缓存清不掉。
    // 复用两级前缀删除逻辑；同次失效合并为一次存储遍历，兼容带前缀与裸键。
    const cleared = _removeCacheByPrefixes(patterns);
    
    if (cleared > 0) {
        console.log(`🗑️ 精确清除缓存: ${cleared} 个项`);
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

/** 私有 GET 策略只匹配路径，不受分页/筛选查询串影响。 */
export function isPrivateApiGet(endpoint) {
    const path = endpoint.split(/[?#]/)[0];
    return API.PRIVATE_GET_PATTERNS.some(pattern => pattern.test(path));
}

/** 一次性移除旧通用私有响应；不处理独立本地记录或公开榜单缓存。 */
export function purgePrivateApiCache() {
    const keys = new Set(memoryCache.keys());
    try {
        for (let index = 0; index < localStorage.length; index++) keys.add(localStorage.key(index));
    } catch (_) {}
    const prefix = CACHE_PREFIX + "api_";
    for (const fullKey of keys) {
        if (fullKey?.startsWith(prefix) && isPrivateApiGet(fullKey.slice(prefix.length))) {
            removeCache(fullKey.slice(CACHE_PREFIX.length));
        }
    }
}
purgePrivateApiCache();
