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
// ==========================================

import { setCache, getCache, removeCache } from "../components/性能优化工具.js";
import { API, CACHE } from "./全局配置.js";
import { getToken } from "./状态管理.js";

// 🏗️ P2架构优化：使用配置中心的 API 地址
const BASE_URL = API.BASE_URL;

// ⚡ P1性能优化：请求去重（相同GET请求只发一次）
const pendingRequests = new Map();

// 🏗️ P2架构优化：使用配置中心的缓存配置
const CACHE_CONFIG = {
    "/api/items": CACHE.TTL.LIST_DATA,
    "/api/creators": CACHE.TTL.CREATORS,
    "/api/users/": CACHE.TTL.USER_PROFILE,
    "/api/wallet/": CACHE.TTL.WALLET,
}; 

// 🟢 入口清洗：接收云端数据时，转换为本地代理，并带【自愈机制】清理被污染的历史数据
function proxyImages(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map(proxyImages);
    if (typeof obj === 'object') {
        for (let key in obj) {
            if ((key === 'coverUrl' || key === 'avatar' || key === 'avatarDataUrl' || key === 'from_avatar') 
                && typeof obj[key] === 'string') {
                
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
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    // ⚡ P1性能优化：GET 请求缓存检查
    const cacheKey = `api_${endpoint}`;
    if (method === "GET" && !options.noCache) {
        const cached = getCache(cacheKey);
        if (cached) {
            return proxyImages(cached);
        }
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

    // ⚡ P1性能优化：封装请求 Promise（支持去重）
    const requestPromise = (async () => {
        try {
            const response = await fetch(url, fetchOptions);
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
                throw new Error(errorMsg);
            }

            // 🚀 核心自愈修复：监听所有数据修改动作，强制销毁脏缓存！
            if (["POST", "PUT", "DELETE"].includes(method)) {
                // 清除旧版缓存
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith("ComfyCommunity_ListCache") || 
                        key.startsWith("ComfyCommunity_ProfileCache") || 
                        key.startsWith("ComfyCommunity_ChatHistory")) {
                        localStorage.removeItem(key);
                    }
                });
                // 清除新版缓存
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith("ComfyRanking_api_") || key.startsWith("ComfyRanking_ListCache_")) {
                        localStorage.removeItem(key);
                    }
                });
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
        } finally {
            // 清除请求去重记录
            pendingRequests.delete(cacheKey);
        }
    })();
    
    // 记录进行中的请求
    if (method === "GET") {
        pendingRequests.set(cacheKey, requestPromise);
    }
    
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
        return request("/api/upload", { method: "POST", body: formData });
    },
    async publishItem(data) { return request("/api/items", { method: "POST", body: data }); },
    async updateItem(itemId, author, data) { return request(`/api/items/${itemId}?author=${author}`, { method: "PUT", body: data }); },
    async getItems(type, sort, limit) { return request(`/api/items?type=${type}&sort=${sort}&limit=${limit}`); },
    async deleteItem(itemId, author) { return request(`/api/items/${itemId}?author=${author}`, { method: "DELETE" }); },
    async recordItemUse(itemId) { return request(`/api/items/${itemId}/use`, { method: "POST" }); },
    async toggleInteraction(itemId, userId, actionType, isActive) { return request("/api/interactions/toggle", { method: "POST", body: { item_id: itemId, user_id: userId, action_type: actionType, is_active: isActive } }); },
    async postComment(itemId, author, content, replyTo = null, parentId = null) { return request("/api/comments", { method: "POST", body: { item_id: itemId, author, content, reply_to_user: replyTo, parent_id: parentId } }); },
    async deleteComment(itemId, commentId, author) { return request(`/api/comments/${itemId}/${commentId}?author=${author}`, { method: "DELETE" }); },
    async getMessages(account) { return request(`/api/messages/${account}`); },
    async markMessagesRead(account) { return request(`/api/messages/${account}/read`, { method: "POST" }); },
    async sendPrivateMessage(sender, receiver, content) { return request("/api/messages/private", { method: "POST", body: { sender, receiver, content } }); },
    async getChatList(account) { return request(`/api/chats/${account}`); },
    async getChatHistory(account, targetAccount) { return request(`/api/chats/${account}/${targetAccount}`); },
    async getWallet(account) { return request(`/api/wallet/${account}`); },
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
    }
};