// 前端页面/core/网络请求_基础设施.js
// ==========================================
// 🌐 网络请求基础设施模块
// ==========================================
// 作用：提供底层网络请求能力，包括缓存、重试、错误处理、请求取消等
// 关联文件：
//   - 全局配置.js (配置中心)
//   - 网络请求_缓存管理.js (缓存管理)
//   - 网络请求_图片代理.js (图片代理)
// ==========================================

import { removeCache, getCacheWithMeta } from "../components/性能优化工具.js";
import { API, CACHE } from "./全局配置.js";
import { CACHE_CONFIG, CACHE_INVALIDATION_MAP, invalidateRelatedCache, _getCacheTTL, getCache, setCache } from "./网络请求_缓存管理.js";
import { unproxyImages } from "./网络请求_图片代理.js";

// 🚀 动态时序导入：proxyImages 通过动态 import() 获取，避免模块初始化时序问题
let _proxyImages = null;
async function getProxyImages() {
    if (!_proxyImages) {
        const mod = await import("./网络请求_图片代理.js");
        _proxyImages = mod.proxyImages;
    }
    return _proxyImages;
}

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
    // 🔑 P0修复：cacheKey 必须包含完整 endpoint（含查询参数），不能截断 '?' 之后的部分
    // 例：'/api/items?type=tool&sort=time' 和 '/api/items?type=tool&sort=views' 必须产生不同的缓存 Key
    const cacheKey = `api_${endpoint}`;
    if (method === "GET" && !options.noCache) {
        const cached = getCache(cacheKey);
        if (cached) {
            const proxyFn = await getProxyImages();
            return proxyFn(cached);
        }
    }
    
    // 🚀 P3优化：离线模式支持
    if (!isOnline && method === "GET") {
        const { value, expired, found } = getCacheWithMeta(cacheKey, true);  // 忽略过期
        if (found) {
            console.log(`📴 离线模式：返回${expired ? '过期' : ''}缓存 (${endpoint})`);
            const proxyFn2 = await getProxyImages();
            return proxyFn2(value);
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
            const timeoutId = setTimeout(() => controller.abort(), options.timeout || API.TIMEOUT);
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
                        setCache(cacheKey, responseData, ttl, true); // 持久化到 localStorage，支持离线回退
                    }
                }

                // 入口数据挂载代理
                const proxyFn3 = await getProxyImages();
                responseData = proxyFn3(responseData);
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
        
        // 所有重试都失败，尝试回退到过期缓存
        if (method === "GET") {
            const fallback = getCacheWithMeta(cacheKey, true);  // true = 允许过期
            if (fallback.found) {
                console.warn(`📴 网络请求失败，回退到本地缓存: ${endpoint}`);
                const proxyFn4 = await getProxyImages();
                return proxyFn4(fallback.value);  // 返回过期缓存数据
            }
        }
        // 仍无缓存，才抛异常
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

// 导出给外部使用
export { requestCancelManager, invalidateRelatedCache, request };
export default request;
