// 前端页面/core/网络请求API.js
// ==========================================
// 🌐 网络请求 API 封装
// ==========================================
// 作用：统一处理所有后端请求，包括缓存、重试、错误处理
// 关联文件：
//   - 全局配置.js (配置中心)
//   - 状态管理.js (状态管理)
//   - 侧边栏数据引擎.js (数据加载)
//   - 所有业务组件 (调用 API)
// ==========================================
// 🏗️ P2架构优化：使用配置中心常量
// 🚀 P3优化：离线模式支持
// ==========================================

import { setCache, getCache, removeCache, getCacheWithMeta } from "../components/性能优化工具.js";
import { API, CACHE } from "./全局配置.js";
import { getToken } from "./状态管理.js";

// 🏗️ P2架构优化：使用配置中心的 API 地址
const BASE_URL = API.BASE_URL;

// ⚡ P1性能优化：请求去重（相同GET请求只发一次）
const pendingRequests = new Map();

// 🚀 P3优化：网络状态监控
let isOnline = navigator.onLine;
window.addEventListener('online', () => { isOnline = true; console.log('🌐 网络已恢复'); });
window.addEventListener('offline', () => { isOnline = false; console.log('📴 网络已断开'); });

// 🚀 P4优化：请求取消管理器
const requestCancelManager = {
    _controllers: new Map(),  // {componentId: Set<AbortController>}
    
    /**
     * 创建并注册 AbortController
     * @param {string} componentId - 组件 ID
     * @returns {AbortController}
     */
    create(componentId = '_global') {
        if (!this._controllers.has(componentId)) {
            this._controllers.set(componentId, new Set());
        }
        const controller = new AbortController();
        this._controllers.get(componentId).add(controller);
        return controller;
    },
    
    /**
     * 移除已完成的 controller
     */
    remove(componentId, controller) {
        const controllers = this._controllers.get(componentId);
        if (controllers) {
            controllers.delete(controller);
        }
    },
    
    /**
     * 取消指定组件的所有请求
     * @param {string} componentId - 组件 ID
     */
    cancelAll(componentId) {
        const controllers = this._controllers.get(componentId);
        if (controllers) {
            for (const controller of controllers) {
                controller.abort();
            }
            controllers.clear();
            console.log(`🚫 已取消组件 [${componentId}] 的所有请求`);
        }
    },
    
    /**
     * 取消所有请求
     */
    cancelAllGlobal() {
        for (const [componentId, controllers] of this._controllers) {
            for (const controller of controllers) {
                controller.abort();
            }
            controllers.clear();
        }
        console.log('🚫 已取消所有进行中的请求');
    },
    
    /**
     * 获取统计信息
     */
    getStats() {
        let total = 0;
        for (const controllers of this._controllers.values()) {
            total += controllers.size;
        }
        return { components: this._controllers.size, activeRequests: total };
    }
};

// 导出给外部使用
export { requestCancelManager, invalidateRelatedCache };

// 🚀 P3优化：请求队列管理（限制并发数）
const requestQueue = {
    maxConcurrent: 6,  // 浏览器同域名默认限制 6 个并发
    running: 0,
    pending: [],
    
    async add(fn) {
        // 如果还有槽位，直接执行
        if (this.running < this.maxConcurrent) {
            this.running++;
            try {
                return await fn();
            } finally {
                this.running--;
                this._processNext();
            }
        }
        
        // 否则加入队列等待
        return new Promise((resolve, reject) => {
            this.pending.push(async () => {
                try {
                    resolve(await fn());
                } catch (e) {
                    reject(e);
                }
            });
        });
    },
    
    _processNext() {
        if (this.pending.length > 0 && this.running < this.maxConcurrent) {
            const next = this.pending.shift();
            this.running++;
            next().finally(() => {
                this.running--;
                this._processNext();
            });
        }
    },
    
    getStats() {
        return { running: this.running, pending: this.pending.length };
    }
};

// 🏗️ P2架构优化：使用配置中心的缓存配置
const CACHE_CONFIG = {
    "/api/items": CACHE.TTL.LIST_DATA,
    "/api/creators": CACHE.TTL.CREATORS,
    "/api/users/": CACHE.TTL.USER_PROFILE,
    "/api/wallet/": CACHE.TTL.WALLET,
}; 

// 🚀 P1优化：精确缓存失效映射（按 HTTP 方法细分）
// 根据修改的 endpoint 和 HTTP 方法精确清除相关缓存
const CACHE_INVALIDATION_MAP = {
    // 任务相关
    "/api/tasks": {
        "POST": ["api_/api/tasks", "ComfyRanking_ListCache_tasks"],      // 创建任务，清除列表缓存
        "PUT": ["api_/api/tasks"],                                        // 更新任务，清除列表缓存
        "DELETE": ["api_/api/tasks", "ComfyRanking_ListCache_tasks"]    // 删除任务，清除列表缓存
    },
    // 帖子相关
    "/api/posts": {
        "POST": ["api_/api/posts", "ComfyRanking_ListCache_posts"],      // 创建帖子，清除列表缓存
        "PUT": ["api_/api/posts"],                                        // 更新帖子，清除列表缓存
        "DELETE": ["api_/api/posts", "ComfyRanking_ListCache_posts"]    // 删除帖子，清除列表缓存
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
        "DELETE": ["api_/api/items", "api_/api/creators"]                // 删除商品，清除商品列表和创作者列表
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
function invalidateRelatedCache(endpoint, method = null) {
    // 查找匹配的缓存失效规则
    let patterns = [];
    for (const [pattern, methodMap] of Object.entries(CACHE_INVALIDATION_MAP)) {
        if (endpoint.startsWith(pattern)) {
            // 如果传入了 method，使用对应方法的规则
            if (method && methodMap[method]) {
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

// 🟢 入口清洗：接收云端数据时，转换为本地代理，并带【自愈机制】清理被污染的历史数据
// 🚀 统一缓存：所有头像字段都走同一个缓存代理，无需重复下载
const IMAGE_PROXY_FIELDS = [
    'coverUrl',           // 封面图
    'cover_image',        // 帖子封面图（后端字段名）
    'avatar',             // 通用头像
    'avatarDataUrl',      // 头像数据 URL
    'from_avatar',        // 消息发送者头像
    'bannerUrl',          // 背景图
    'publisher_avatar',   // 任务发布者头像
    'assignee_avatar',    // 任务接单者头像
    'author_avatar',      // 帖子/评论作者头像
    'target_avatar',      // 私信目标用户头像
];

// 🚀 新增：需要对数组元素进行代理的图片字段
const IMAGE_PROXY_ARRAY_FIELDS = ['images'];

// 🚀 导出图片代理函数，供其他组件在缓存读取后调用
export function proxyImages(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map(proxyImages);
    if (typeof obj === 'object') {
        for (let key in obj) {
            if (IMAGE_PROXY_FIELDS.includes(key) && typeof obj[key] === 'string') {
                
                let originalUrl = obj[key];
                // 自动修复：一层一层剥开已经被污染的多重代理前缀
                while (originalUrl.startsWith('/community_hub/image?url=')) {
                    try { originalUrl = decodeURIComponent(originalUrl.replace('/community_hub/image?url=', '')); }
                    catch(e) { break; }
                }

                // 只有最终剥离出来的确实是外部网络链接，才挂上代理
                if (originalUrl.startsWith('http')) {
                    obj[key] = `/community_hub/image?url=${encodeURIComponent(originalUrl)}`;
                } else {
                    obj[key] = originalUrl;
                }
            } else if (IMAGE_PROXY_ARRAY_FIELDS.includes(key) && Array.isArray(obj[key])) {
                // 🚀 新增：处理图片URL数组字段（如帖子的images数组）
                obj[key] = obj[key].map(url => {
                    if (typeof url === 'string') {
                        let originalUrl = url;
                        // 复用相同的URL清洗逻辑
                        while (originalUrl.startsWith('/community_hub/image?url=')) {
                            try { originalUrl = decodeURIComponent(originalUrl.replace('/community_hub/image?url=', '')); }
                            catch(e) { break; }
                        }
                        // 只有外部网络链接才挂上代理
                        if (originalUrl.startsWith('http')) {
                            return `/community_hub/image?url=${encodeURIComponent(originalUrl)}`;
                        }
                        return originalUrl;
                    }
                    return url;
                });
            } else {
                obj[key] = proxyImages(obj[key]);
            }
        }
    }
    return obj;
}

// 🟢 出口剥离：提交给云端前，强制扒掉本地代理外衣，还原为真实云端直链，彻底杜绝数据污染！
function unproxyImages(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
        let str = obj;
        while (str.startsWith('/community_hub/image?url=')) {
            try { str = decodeURIComponent(str.replace('/community_hub/image?url=', '')); }
            catch(e) { break; }
        }
        return str;
    }
    if (Array.isArray(obj)) return obj.map(unproxyImages);
    if (typeof obj === 'object') {
        const newObj = {};
        for (let key in obj) {
            newObj[key] = unproxyImages(obj[key]);
        }
        return newObj;
    }
    return obj;
}

async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const method = (options.method || "GET").toUpperCase();
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) { headers["Content-Type"] = "application/json"; }
    const token = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
    if (token) {
        // 验证 Token 是否为有效的三段式 JWT 格式
        const tokenParts = token.split(".");
        if (tokenParts.length === 3) {
            headers["Authorization"] = `Bearer ${token}`;
        } else {
            console.warn("⚠️ 检测到无效 Token 格式，已自动清除，请重新登录");
            localStorage.removeItem("ComfyCommunity_Token");
            localStorage.removeItem("ComfyCommunity_User");
            sessionStorage.removeItem("ComfyCommunity_Token");
            sessionStorage.removeItem("ComfyCommunity_User");
        }
    }
    
    // 🚀 P4优化：组件级请求取消支持
    const componentId = options.componentId || '_global';
    
    // ⚡ P1性能优化：GET 请求缓存检查
    const cacheKey = `api_${endpoint}`;
    if (method === "GET" && !options.noCache) {
        const cached = getCache(cacheKey);
        if (cached) {
            return proxyImages(cached);
        }
    }
    
    // 🚀 P3优化：离线模式支持
    if (!isOnline && method === "GET") {
        const { value, expired, found } = getCacheWithMeta(cacheKey, true);  // 忽略过期
        if (found) {
            console.log(`📴 离线模式：返回${expired ? '过期' : ''}缓存 (${endpoint})`);
            return proxyImages(value);
        }
        throw new Error('网络已断开，且无本地缓存');
    }
    
    // ⚡ P1性能优化：请求去重（相同GET请求只发一次）
    if (method === "GET") {
        if (pendingRequests.has(cacheKey)) {
            return pendingRequests.get(cacheKey);
        }
    }
    
    const fetchOptions = { method, headers, ...options };
    
    // 🚀 核心修改：在将 body 转为 JSON 字符串发送前，执行无情剥离！
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
        fetchOptions.body = JSON.stringify(unproxyImages(options.body));
    } else if (options.body instanceof FormData) {
        fetchOptions.body = options.body;
    }

    // 🚀 P1优化：重试配置
    const maxRetries = options.retries ?? (method === "GET" ? 2 : 0);  // GET 默认重试 2 次
    const retryDelay = options.retryDelay ?? 1000;  // 初始延迟 1 秒
    
    // ⚡ P1性能优化：封装请求 Promise（支持去重 + 重试）
    const requestPromise = (async () => {
        let lastError = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            // 🚀 P1优化：指数退避延迟
            if (attempt > 0) {
                const delay = retryDelay * Math.pow(2, attempt - 1);  // 1s, 2s, 4s...
                console.log(`🔄 请求重试 (${attempt}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, delay));
            }
                    
            // 🚀 P4优化：使用请求取消管理器（支持超时 + 组件级取消）
            const controller = requestCancelManager.create(componentId);
            // P2优化：支持通过 options 传入自定义超时
            const timeout = options.timeout ?? API.TIMEOUT;
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const currentFetchOptions = { ...fetchOptions, signal: controller.signal };
                    
            try {
                // 🚀 P3优化：使用请求队列限制并发
                const response = await requestQueue.add(() => fetch(url, currentFetchOptions));
                clearTimeout(timeoutId);  // 清除超时计时器
                requestCancelManager.remove(componentId, controller);  // 🚀 P4: 移除已完成的 controller
                let responseData = await response.json().catch(() => ({}));

                if (!response.ok) {
                    let errorMsg = `请求失败 (${response.status})`;
                    
                    // 🚀 核心修改：增加对 FastAPI 422 报错数组的解析
                    if (Array.isArray(responseData.detail)) {
                        errorMsg = "数据格式错误: " + responseData.detail.map(e => `${e.loc[e.loc.length-1]} (${e.type})`).join(", ");
                    } else if (typeof responseData.detail === "string") {
                        errorMsg = responseData.detail;
                    } else if (responseData.message) {
                        errorMsg = responseData.message;
                    } else if (responseData.error) {
                        errorMsg = responseData.error;
                    }
                    
                    // 🚀 P1优化：4xx 错误不重试，5xx 错误可重试
                    if (response.status >= 400 && response.status < 500) {
                        throw new Error(errorMsg);
                    }
                    
                    lastError = new Error(errorMsg);
                    continue;  // 5xx 错误重试
                }

                // 🚀 P1优化：精确清除相关缓存（替代暴力清空）
                if (["POST", "PUT", "DELETE"].includes(method)) {
                    invalidateRelatedCache(endpoint, method);
                }

                // ⚡ P1性能优化：GET 请求结果缓存
                if (method === "GET") {
                    const ttl = _getCacheTTL(endpoint);
                    if (ttl > 0) {
                        setCache(cacheKey, responseData, ttl, false); // 只存内存，不存 localStorage
                    }
                }

                // 入口数据挂载代理
                responseData = proxyImages(responseData);
                return responseData;
            } catch (error) {
                clearTimeout(timeoutId);  // 清除超时计时器
                
                // 🔧 P1优化：可重试的错误类型
                const isRetryable = (
                    error.name === 'AbortError' ||  // 超时
                    (error instanceof TypeError && error.message.includes('fetch'))  // 网络错误
                );
                
                if (isRetryable && attempt < maxRetries) {
                    lastError = error;
                    continue;  // 重试
                }
                
                // 🔧 P3优化：错误分类处理，提供更清晰的错误信息
                if (error.name === 'AbortError') {
                    throw new Error('网络请求超时，请检查网络连接');
                }
                if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
                    throw new Error('网络连接失败，请检查网络');
                }
                if (error instanceof SyntaxError) {
                    throw new Error('服务器响应格式错误');
                }
                throw error;
            }
        }
        
        // 所有重试都失败
        throw lastError || new Error('请求失败');
    })();
    
    // 记录进行中的请求
    if (method === "GET") {
        pendingRequests.set(cacheKey, requestPromise);
    }
    
    // 确保请求完成后清除去重记录
    requestPromise.finally(() => {
        pendingRequests.delete(cacheKey);
    });
    
    return requestPromise;
}

// 获取缓存TTL
function _getCacheTTL(endpoint) {
    for (const [pattern, ttl] of Object.entries(CACHE_CONFIG)) {
        if (endpoint.startsWith(pattern)) {
            return ttl;
        }
    }
    return 0; // 默认不缓存
}

// ============== 业务 API 导出 (保持原样) ==============
export const api = {
    async sendVerifyCode(contact, type, actionType, account = null) { return request("/api/users/send_code", { method: "POST", body: { contact, contact_type: type, action_type: actionType, account } }); },
    async register(data) { return request("/api/users/register", { method: "POST", body: data }); },
    async login(account, password) { return request("/api/users/login", { method: "POST", body: { account, password } }); },
    
    // 🚀 核心修复：究极数据打捞装甲与弹窗报警
    async resetPassword(...args) { 
        let payload = { verifyType: "email" };

        // 1. 深度搜刮：提取传入的对象数据
        args.forEach(arg => {
            if (typeof arg === 'object' && arg !== null) Object.assign(payload, arg);
        });

        // 2. 智能探测：从散装字符串中强行识别关键数据
        let strings = args.filter(a => typeof a === 'string' || typeof a === 'number').map(String);
        strings.forEach(str => {
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) payload.email = str; // 抓取邮箱
            else if (/^\d{6}$/.test(str)) payload.code = str; // 抓取6位验证码
            else if (str.length >= 6 && !payload.new_password && !/^\d+$/.test(str)) payload.new_password = str; // 抓取密码
            else if (!payload.account) payload.account = str; // 剩下的当账号
        });

        // 3. 字段合并与对齐
        payload.account = payload.account || payload.username;
        payload.new_password = payload.new_password || payload.password || payload.newPassword;
        payload.verifyContact = payload.verifyContact || payload.email || payload.phone || payload.verify_contact;

        // 4. 🚨 终极拦截门：如果到了这一步数据还是没找齐，直接弹窗指认“内鬼”！
        if (!payload.account || !payload.new_password || !payload.verifyContact || !payload.code) {
            const errorStr = JSON.stringify(payload, null, 2);
            alert(`🚨 发现前端传参严重丢失！\n\n系统拼命搜刮后只拿到了这些数据:\n${errorStr}\n\n👉 请立即检查【顶部导航组件.js】的第 82 行！\n\n必须把完整的表单数据传给 API，例如: api.resetPassword({account, password, email, code})`);
            throw new Error("被前端参数拦截装甲阻断：数据不完整");
        }

        return request("/api/users/reset_password", { method: "POST", body: payload }); 
    },

    async getUserProfile(account) { return request(`/api/users/${account}`); },
    async updateUserProfile(account, data) { return request(`/api/users/${account}`, { method: "PUT", body: data }); },
    async updatePrivacy(account, privacy) { return request(`/api/users/${account}/privacy`, { method: "PUT", body: privacy }); },
    async toggleFollow(userId, targetAccount, isActive) { return request("/api/users/follow", { method: "POST", body: { user_id: userId, target_account: targetAccount, is_active: isActive } }); },
    async getCreators(sort, limit) { return request(`/api/creators?sort=${sort}&limit=${limit}`); },
    async uploadFile(file, fileType) {
        const formData = new FormData();
        formData.append("file", file); formData.append("file_type", fileType);
        console.log(`📤 开始上传文件: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        return request("/api/upload", { 
            method: "POST", 
            body: formData,
            timeout: 120000,  // P2: 120秒上传专用超时
            retries: 1        // P3: 允许1次重试
        });
    },
    async publishItem(data) { return request("/api/items", { method: "POST", body: data }); },
    async updateItem(itemId, author, data) { return request(`/api/items/${itemId}?author=${author}`, { method: "PUT", body: data }); },
    async getItems(type, sort, limit) { return request(`/api/items?type=${type}&sort=${sort}&limit=${limit}`); },
    async deleteItem(itemId) { return request(`/api/items/${itemId}`, { method: "DELETE" }); },
    async recordItemUse(itemId) { return request(`/api/items/${itemId}/use`, { method: "POST" }); },
    async toggleInteraction(itemId, userId, actionType, isActive) { return request("/api/interactions/toggle", { method: "POST", body: { item_id: itemId, user_id: userId, action_type: actionType, is_active: isActive } }); },
    async postComment(itemId, author, content, replyTo = null, parentId = null) { return request("/api/comments", { method: "POST", body: { item_id: itemId, author, content, reply_to_user: replyTo, parent_id: parentId } }); },
    async deleteComment(itemId, commentId) { return request(`/api/comments/${itemId}/${commentId}`, { method: "DELETE" }); },
    async getMessages(account) { return request(`/api/messages/${account}`); },
    async markMessagesRead(account) { return request(`/api/messages/${account}/read`, { method: "POST" }); },
    async sendPrivateMessage(sender, receiver, content) { return request("/api/messages/private", { method: "POST", body: { sender, receiver, content } }); },
    async getChatList(account) { return request(`/api/chats/${account}`); },
    async getChatHistory(account, targetAccount) { return request(`/api/chats/${account}/${targetAccount}`); },
    async getWallet(account) { return request(`/api/wallet/${account}`); },
    
    // 💳 P6支付增强：交易明细查询
    async getTransactions(account, page = 1, limit = 20, txType = null) {
        let url = `/api/wallet/${account}/transactions?page=${page}&limit=${limit}`;
        if (txType) url += `&tx_type=${txType}`;
        return request(url);
    },
    
    // 💳 P6支付增强：任务收益统计
    async getTaskStats(account) {
        return request(`/api/wallet/${account}/task-stats`);
    },
    
    async tipUser(senderAccount, targetAccount, amount, isAnonymous, itemId = null) { 
        return request("/api/wallet/tip", { 
            method: "POST", 
            body: { sender_account: senderAccount, target_account: targetAccount, amount: amount, is_anonymous: isAnonymous, item_id: itemId } 
        }); 
    }, 
    async purchaseItem(account, itemId) { return request("/api/wallet/purchase", { method: "POST", body: { account: account, item_id: itemId } }); },
    async submitWithdraw(data) { return request("/api/wallet/withdraw", { method: "POST", body: data }); },
    async postSystemAnnouncement(adminAccount, contentText) {
        if (!contentText || !contentText.trim()) throw new Error("公告内容不能为空！");
        return request("/api/system/announcement", { method: "POST", body: { admin_account: adminAccount, content: contentText } });
    },

    // ==========================================
    // 🔧 管理员调试：执行 Python 脚本
    // ==========================================
    async runAdminScript(adminAccount, scriptName) {
        if (!scriptName || !scriptName.trim()) throw new Error("脚本名称不能为空！");
        return request("/api/admin/run-script", { method: "POST", body: { admin_account: adminAccount, script_name: scriptName } });
    },

    // ==========================================
    // 💬 讨论区 API
    // ==========================================
    async getPosts(page = 1, limit = 20) { 
        return request(`/api/posts?page=${page}&limit=${limit}`); 
    },
    async getPostDetail(postId) { 
        return request(`/api/posts/${postId}`); 
    },
    async createPost(data) { 
        return request("/api/posts", { method: "POST", body: data }); 
    },
    async updatePost(postId, data) { 
        return request(`/api/posts/${postId}`, { method: "PUT", body: data }); 
    },
    async deletePost(postId) { 
        return request(`/api/posts/${postId}`, { method: "DELETE" }); 
    },
    async togglePostLike(postId) { 
        return request(`/api/posts/${postId}/like`, { method: "POST" }); 
    },
    async togglePostFavorite(postId) { 
        return request(`/api/posts/${postId}/favorite`, { method: "POST" }); 
    },
    async tipPost(postId, amount, isAnon = false) { 
        return request(`/api/posts/${postId}/tip?amount=${amount}&is_anon=${isAnon}`, { method: "POST" }); 
    },
    async getPostComments(postId) { 
        return request(`/api/posts/${postId}/comments`); 
    },
    async addPostComment(postId, content) { 
        return request(`/api/posts/${postId}/comments?content=${encodeURIComponent(content)}`, { method: "POST" }); 
    },
    async getMyPosts() {
        return request("/api/my-posts");
    },

    // ==========================================
    // 📝 任务榜 API
    // ==========================================
    async getTasks(page = 1, limit = 20, status = null, sort = "latest") {
        let url = `/api/tasks?page=${page}&limit=${limit}&sort=${sort}`;
        if (status) url += `&status=${status}`;
        return request(url);
    },
    async getTaskDetail(taskId) {
        return request(`/api/tasks/${taskId}`);
    },
    async createTask(data) {
        return request("/api/tasks", { method: "POST", body: data });
    },
    async updateTask(taskId, data) {
        return request(`/api/tasks/${taskId}`, { method: "PUT", body: data });
    },
    async cancelTask(taskId) {
        return request(`/api/tasks/${taskId}`, { method: "DELETE" });
    },
    async applyTask(taskId, message = null) {
        let url = `/api/tasks/${taskId}/apply`;
        if (message) url += `?message=${encodeURIComponent(message)}`;
        return request(url, { method: "POST" });
    },
    async cancelApplyTask(taskId) {
        return request(`/api/tasks/${taskId}/apply`, { method: "DELETE" });
    },
    async assignTask(taskId, assignee) {
        return request(`/api/tasks/${taskId}/assign?assignee=${encodeURIComponent(assignee)}`, { method: "POST" });
    },
    async submitTask(taskId, deliverables, note = null) {
        let url = `/api/tasks/${taskId}/submit`;
        return request(url, { method: "POST", body: { deliverables, note } });
    },
    async acceptTask(taskId, isAccepted, feedback = null) {
        let url = `/api/tasks/${taskId}/accept?is_accepted=${isAccepted}`;
        if (feedback) url += `&feedback=${encodeURIComponent(feedback)}`;
        return request(url, { method: "POST" });
    },
    async disputeTask(taskId, reason, evidence = null) {
        return request(`/api/tasks/${taskId}/dispute`, { 
            method: "POST", 
            body: { reason, evidence: evidence || [] } 
        });
    },
    async getMyTasks(role = "publisher") {
        return request(`/api/my-tasks?role=${role}`);
    },

    // ==========================================
    // ⚖️ 申诉仲裁 API
    // ==========================================
    async getDisputeDetail(disputeId) {
        return request(`/api/disputes/${disputeId}`);
    },
    async respondDispute(disputeId, response, evidence = null) {
        return request(`/api/disputes/${disputeId}/respond`, {
            method: "POST",
            body: { response, evidence: evidence || [] }
        });
    },
    async getAdminDisputes(status = null) {
        let url = "/api/admin/disputes";
        if (status) url += `?status=${status}`;
        return request(url);
    },
    async resolveDispute(disputeId, resolution, ratio = null, note = null) {
        return request(`/api/admin/disputes/${disputeId}/resolve`, {
            method: "POST",
            body: { resolution, ratio, note }
        });
    },

    // ==========================================
    // 🔄 P7后悔模式：退款API
    // ==========================================
    async getPurchaseStatus(account, itemId) {
        return request(`/api/wallet/${account}/purchase/${itemId}`);
    },
    async requestRefund(account, itemId) {
        return request(`/api/wallet/refund?account=${encodeURIComponent(account)}&item_id=${encodeURIComponent(itemId)}`, {
            method: "POST"
        });
    },

    // ==========================================
    // 🔒 管理员：系统配置 API
    // ==========================================
    async getSystemConfig(configKey) {
        return request(`/api/admin/config/${configKey}`);
    },
    async setSystemConfig(configKey, value) {
        return request(`/api/admin/config/${configKey}`, {
            method: "PUT",
            body: value
        });
    }
};