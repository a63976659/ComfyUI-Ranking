// 前端页面/core/网络请求_缓存管理.js
// ==========================================
// 💾 缓存管理模块
// ==========================================
// 作用：管理API请求的缓存配置、缓存失效策略和TTL计算
// 关联文件：
//   - 全局配置.js (CACHE 配置)
//   - 性能优化工具.js (缓存操作函数)
// ==========================================

import { CACHE } from "./全局配置.js";
import { removeCache, getCache, setCache } from "../components/性能优化工具.js";

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

// Re-export 缓存操作函数（供基础设施模块使用）
export { getCache, setCache };

// 导出配置和映射
export { CACHE_CONFIG, CACHE_INVALIDATION_MAP };
