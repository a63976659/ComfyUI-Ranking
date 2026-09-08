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
import { logoutAndClearUserData, isOnline } from "./状态管理.js";
import { CACHE_CONFIG, CACHE_INVALIDATION_MAP, invalidateRelatedCache, _getCacheTTL, getCache, setCache } from "./网络请求_缓存管理.js";
import { unproxyImages } from "./网络请求_图片代理.js";
// 🔧 直接引入 i18n 叶子模块（而非 用户体验增强.js）：本文件处于依赖链最上游，
// 引入带 DOM 初始化副作用的增强层可能造成启动时序问题；国际化模块无副作用、零循环依赖
import { t } from "../components/用户体验_国际化.js";

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

// 🚀 P3优化：网络状态由 状态管理.js 的 isOnline() 统一提供（见下方离线模式支持），
// 本模块不再自行注册 online/offline 监听。

// 🔧 修复：401（Token 过期/签名无效）统一处理——清除本地凭证并提示重新登录。
// 背景：服务端更换 JWT_SECRET 或 Token 过期后，旧 Token 被云端拒签，若不清除
// 本地凭证会导致所有登录态操作反复报「Token 签名无效」。去重窗口：并发请求
// 同时收到 401 时只提示一次。
let _authExpiredAt = 0;
function notifyTokenExpired(serverMsg) {
    const now = Date.now();
    if (now - _authExpiredAt < 5000) return;
    _authExpiredAt = now;
    console.warn(`⚠️ 登录凭证已失效（${serverMsg}），本地 Token 已清除，请重新登录`);
    // 动态 import UI 组件，与 proxyImages 同样避免模块初始化时序问题
    import("../components/UI交互提示组件.js").then(async ({ showToast }) => {
        const { t } = await import("../components/用户体验_国际化.js");
        showToast(t('auth.token_expired'), "warning", 4000);
    }).catch(() => {});
}

function handleAuthExpired(serverMsg, failedToken) {
    // 竞态防护：若用户在 401 返回前已重新登录（存储中的 Token 已更换），
    // 不清理新凭证；失败请求未携带 Token 时 401 与登录态无关，同样不打扰
    if (!failedToken) return false;
    const currentToken = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
    if (currentToken !== failedToken) return false;
    // 清除前取出账号，用于清理账号级 Profile 缓存
    let account = null;
    try {
        const userStr = localStorage.getItem("ComfyCommunity_User") || sessionStorage.getItem("ComfyCommunity_User");
        if (userStr) account = JSON.parse(userStr)?.user?.account || null;
    } catch (e) {}
    // 与手动登出同深度的完整清理：Token/User、私有数据缓存、内存缓存与安装版本戳
    logoutAndClearUserData(account);
    notifyTokenExpired(serverMsg);
    return true;
}

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
            const count = controllers.size;
            for (const controller of controllers) {
                controller.abort();
            }
            controllers.clear();
            // 🔧 仅在实际撤销了请求时打日志：本方法会被搜索框的每一次输入触发，
            // 绝大多数时候并没有在途请求，无条件打印会刷出大量无意义日志
            if (count > 0) {
                console.log(`🚫 已取消组件 [${componentId}] 的 ${count} 个在途请求`);
            }
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
        const tokenParts = token.split(".");
        if (tokenParts.length === 3) {
            // 标准 JWT 格式
            headers["Authorization"] = `Bearer ${token}`;
        } else {
            // 🔒 P0同步：旧版 mock_token 已被后端明确拒绝（伪造后门已封堵），
            // 以及其他无法识别的格式，统一清除本地旧凭证并提示重新登录。
            // 🔧 修复：凭证既已清除，同步广播登出事件重置导航登录态/停止轮询，
            // 并给用户明确提示（原实现仅 console.warn 静默清理）
            console.warn("⚠️ 检测到无效/已过期的旧版 Token，已自动清除，请重新登录");
            localStorage.removeItem("ComfyCommunity_Token");
            localStorage.removeItem("ComfyCommunity_User");
            sessionStorage.removeItem("ComfyCommunity_Token");
            sessionStorage.removeItem("ComfyCommunity_User");
            window.dispatchEvent(new CustomEvent('comfy-ranking-auth-expired'));
            notifyTokenExpired("无效/已过期的旧版 Token");
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
    
    // 🚀 P3优化：离线模式支持（网络状态取自 状态管理.js 的 isOnline()）
    if (!isOnline() && method === "GET") {
        const { value, expired, found } = getCacheWithMeta(cacheKey, true);  // 忽略过期
        if (found) {
            console.log(`📴 离线模式：返回${expired ? '过期' : ''}缓存 (${endpoint})`);
            const proxyFn2 = await getProxyImages();
            return proxyFn2(value);
        }
        // 🔧 修复：原为硬编码中文，而本错误会被 12+ 处调用方直接 showToast(err.message) 弹给用户，
        // 导致英文界面下仍弹中文提示；现改走词典
        throw new Error(t('feedback.offline_no_cache'));
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

    // 🚀 P1优化：重试与超时预算
    // 🔧 修复：重试次数/间隔此前硬编码在本文件（2 / 1000），使 全局配置.js 的
    // API.MAX_RETRIES、API.RETRY_DELAY 成为死配置，现统一读取配置中心
    // 🐢 弱网预算分级：列表/搜索类 GET 有本地缓存兜底，失败上限适当收紧，
    // 避免弱网下用户长时间盯骨架屏；按去掉查询串的路径全匹配，
    // 不会误伤 /api/items/{id}、/api/creators/{account}/details 等详情请求
    const endpointPath = endpoint.split("?")[0];
    let defaultTimeout = API.TIMEOUT;
    let defaultRetries = method === "GET" ? API.MAX_RETRIES : 0;  // 非 GET 不重试
    if (method === "GET") {
        if (endpointPath === "/api/creators/search") {
            defaultTimeout = API.SEARCH_TIMEOUT;
            defaultRetries = API.SEARCH_RETRIES;
        } else if (endpointPath === "/api/items" || endpointPath === "/api/creators") {
            defaultRetries = API.LIST_RETRIES;
        }
    }
    const requestTimeout = options.timeout || defaultTimeout;
    const maxRetries = options.retries ?? defaultRetries;
    const retryDelay = options.retryDelay ?? API.RETRY_DELAY;  // 指数退避基数
    
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
            const currentFetchOptions = { ...fetchOptions, signal: controller.signal };
            // 🔧 修复：超时计时器改到真正发出 fetch 时才启动。原实现在入队前就 setTimeout，
            // 并发满 6 个时排队等待会白烧超时预算，排队时长超过超时值会导致 fetch 尚未发出就被 abort
            let timeoutId = null;
            // 🔍 区分「超时中止」与「调用方主动撤销」：两者抛出的都是 AbortError，
            // 但前者应该重试、后者绝不能重试（详见下方 catch 的主动取消分支）
            let timedOut = false;
                    
            try {
                // 🚀 P3优化：使用请求队列限制并发
                const response = await requestQueue.add(() => {
                    timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, requestTimeout);
                    return fetch(url, currentFetchOptions);
                });
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
                        if (response.status === 401) {
                            // 🔧 修复：清除失效凭证并提示重新登录（原实现仅广播事件，无人清理）；
                            // 传入本请求实际使用的 Token 做竞态比对，避免误清重新登录后签发的新凭证。
                            // 仅当确认凭证确实失效后才广播登出事件（导航停止轮询并重置登录态），
                            // 迟到的旧 401 或匿名请求的 401 不再误触发登录态重置。
                            // 登录接口的 401 语义是「密码错误」而非凭证失效，不走全局清理，
                            // 避免与登录表单自身的错误提示重复叠加
                            if (endpoint !== "/api/users/login" && handleAuthExpired(errorMsg, token)) {
                                window.dispatchEvent(new CustomEvent('comfy-ranking-auth-expired'));
                            }
                        }
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
                        // 创作者列表不持久化到 localStorage，避免空间不足
                        const persist = !endpoint.includes('/api/creators');
                        setCache(cacheKey, responseData, ttl, persist);
                    }
                }

                // 入口数据挂载代理
                const proxyFn3 = await getProxyImages();
                responseData = proxyFn3(responseData);
                return responseData;
            } catch (error) {
                clearTimeout(timeoutId);  // 清除超时计时器
                // 🔍 失败/超时同样摘除 controller：成功路径在上方已 remove，这里不补的话，
                // 取消分组里会堆积已失效的 controller，使 cancelAll 的在途计数虚高
                requestCancelManager.remove(componentId, controller);
                
                // 🔍 主动撤销（组件级取消）与超时都表现为 AbortError，但语义完全相反：
                // 超时该重试；主动撤销是调用方明确表示「这次结果我不要了」，绝不能重试，
                // 否则会白烧一轮超时预算（搜索场景下用户每敲一次键都可能触发一次撤销）。
                // 直接抛出而不走循环后的「过期缓存兜底」，避免把作废请求的结果上屏
                if (error.name === 'AbortError' && !timedOut) {
                    const cancelErr = new Error(t('feedback.request_cancelled'));
                    cancelErr.name = 'RequestCancelledError';
                    cancelErr.isCancelled = true;
                    throw cancelErr;
                }
                
                // 🔧 P1优化：可重试的错误类型
                const isRetryable = (
                    error.name === 'AbortError' ||  // 超时
                    (error instanceof TypeError && error.message.includes('fetch'))  // 网络错误
                );
                
                if (isRetryable) {
                    // 🔧 修复：重试耗尽时不再直接 throw（否则循环后的「过期缓存兜底」
                    // 分支永远不可达，断网时无法无缝切换本地数据）。记录友好错误后跳出循环，
                    // 让 GET 请求走过期缓存回退；无缓存时仍以该友好错误抛出。
                    lastError = error.name === 'AbortError'
                        ? new Error('网络请求超时，请检查网络连接')
                        : new Error('网络连接失败，请检查网络');
                    if (attempt < maxRetries) continue;  // 重试
                    break;  // 重试耗尽 → 跳到过期缓存兜底
                }
                
                // 🔧 P3优化：错误分类处理，提供更清晰的错误信息（不可重试错误直接抛出）
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
    // 🔧 补 .catch 空处理：finally 会派生出一个新的 Promise，而它从未被返回也无人接收，
    // 一旦请求失败（含主动撤销）就会在控制台抛 Uncaught (in promise)。
    // 原始 requestPromise 仍在下方正常返回给调用方处理，此处只是吞掉这份重复的拒绝
    requestPromise.finally(() => {
        pendingRequests.delete(cacheKey);
    }).catch(() => {});
    
    return requestPromise;
}

// ==========================================
// 📡 SSE 流式请求（用于安装进度等长时间操作）
// ==========================================

/**
 * 发起 SSE 流式请求（用于安装进度等长时间操作）
 * @param {string} endpoint - API端点路径（本地ComfyUI路径，如 /community_hub/install_tool_stream）
 * @param {Object} body - POST请求体
 * @param {Function} onProgress - 进度回调 ({stage, progress, message, status, data}) => void
 * @param {Object} [options] - 可选配置 { timeout: 300000 }
 * @returns {Promise<Object>} 最终结果事件
 */
export async function requestSSE(endpoint, body, onProgress, options = {}) {
    const timeout = options.timeout || 1200000; // 20分钟全局超时（大型工具克隆需要较长时间）
    const controller = new AbortController();
    const globalTimer = setTimeout(() => controller.abort(), timeout);

    // 📡 空闲超时检测：长时间无数据视为连接已断
    const IDLE_TIMEOUT_DEFAULT = 30000;  // 30 秒无数据视为空闲
    const IDLE_TIMEOUT_GRACE = 5000;     // 收到 finalResult 后的宽限期 5 秒
    let currentIdleTimeout = options.idleTimeout || IDLE_TIMEOUT_DEFAULT;
    let idleTimer = null;

    const clearIdleTimer = () => {
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    };

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult = null;

        while (true) {
            // 使用 Promise.race 实现空闲超时：reader.read() 与空闲定时器竞争
            const idlePromise = new Promise((_, reject) => {
                idleTimer = setTimeout(() => reject(new Error("SSE_IDLE_TIMEOUT")), currentIdleTimeout);
            });

            let readResult;
            try {
                readResult = await Promise.race([
                    reader.read(),
                    idlePromise
                ]);
            } catch (e) {
                clearIdleTimer();
                if (e.message === "SSE_IDLE_TIMEOUT") {
                    controller.abort();
                    // 如果已收到 finalResult，优先返回它（服务器只是没正确关闭连接）
                    if (finalResult) return finalResult;
                    // 否则返回空闲超时错误
                    return { status: "error", message: "连接超时：30秒未收到数据" };
                }
                throw e;
            }
            clearIdleTimer();

            const { done, value } = readResult;
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // 保留不完整行

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        onProgress?.(data);

                        if (data.status === "success" || data.status === "error") {
                            finalResult = data;
                            // 收到最终结果后，缩短空闲超时为宽限期，避免无谓等待连接关闭
                            currentIdleTimeout = IDLE_TIMEOUT_GRACE;
                        }
                    } catch (e) {
                        console.warn("[SSE] 解析事件失败:", line);
                    }
                }
            }
        }

        return finalResult || { status: "error", message: "未收到最终结果" };
    } catch (err) {
        if (err.name === "AbortError") {
            // 全局超时时，如果已收到 finalResult 仍返回它
            if (finalResult) return finalResult;
            return { status: "error", message: "安装超时，请检查网络后重试" };
        }
        throw err;
    } finally {
        clearTimeout(globalTimer);
        clearIdleTimer();
    }
}

// 导出给外部使用
export { requestCancelManager, invalidateRelatedCache, request };
export default request;
