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
import { beginLocalPerformanceSample } from "./本机性能统计.js";
import { eventBus, EVENTS, logoutAndClearUserData, isOnline, isCloudReachable, markCloudDown, markCloudUp } from "./状态管理.js";
import { CACHE_CONFIG, CACHE_INVALIDATION_MAP, invalidateRelatedCache, _getCacheTTL, getCache, setCache, isPrivateApiGet, captureCacheWrite, captureCacheSource } from "./网络请求_缓存管理.js";
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
const cacheReadOwners = new Map();
const pendingRequestGuards = new WeakMap();
const responseCacheSources = new WeakMap();

function _cachedResponse(value, source) {
    if (value && typeof value === 'object') responseCacheSources.set(value, { source });
    return value;
}

export function getResponseCacheSource(value) {
    return responseCacheSources.get(value) || null;
}


function withRequestDiagnostic(error, response, data = null) {
    let headerId;
    try { headerId = response.headers?.get?.(API.REQUEST_ID_HEADER); } catch {}
    for (const value of [headerId, data?.error_id]) {
        if (typeof value === 'string' && API.REQUEST_ID_PATTERN.test(value)) {
            error.requestId = value;
            break;
        }
    }
    return error;
}

function httpErrorMessage(data, status) {
    if (typeof data.detail === 'string' && Object.hasOwn(API.REQUEST_BODY_ERRORS, data.detail)) {
        const rule = API.REQUEST_BODY_ERRORS[data.detail];
        if (rule.status === status) return t(rule.msgKey);
    }
    if (Array.isArray(data.detail)) return t('feedback.invalid_request_data');
    for (const value of [data.detail, data.message, data.error]) {
        if (typeof value === 'string' && value.trim()) return value;
    }
    return t('feedback.http_request_failed', { status });
}

// 🚀 P3优化：网络状态由 状态管理.js 的 isOnline() 统一提供（见下方离线模式支持），
// 本模块不再自行注册 online/offline 监听。

// 🔧 修复：401（Token 过期/签名无效）统一处理——清除本地凭证并提示重新登录。
// 背景：服务端更换 JWT_SECRET 或 Token 过期后，旧 Token 被云端拒签，若不清除
// 本地凭证会导致所有登录态操作反复报「Token 签名无效」。去重窗口：并发请求
// 同时收到 401 时只提示一次。
let _authExpiredAt = 0;
function _safeStorageGet(storageName, key) {
    try {
        const storage = window[storageName];
        return storage ? storage.getItem(key) : null;
    } catch (_) {
        return null;
    }
}

function _safeGetAuthToken() {
    return _safeStorageGet('localStorage', 'ComfyCommunity_Token')
        || _safeStorageGet('sessionStorage', 'ComfyCommunity_Token')
        || '';
}

/** 与实际 Authorization 使用同一存储读取；仅返回比较函数，不暴露凭证。 */
export function captureRequestSession() {
    const originalToken = _safeGetAuthToken();
    return () => originalToken === _safeGetAuthToken();
}

// 仅跟踪私有 GET；会话撤销不取消或重放已提交的业务写操作。
const activePrivateReads = new Set();
function revokePrivateReads(force = false) {
    for (const entry of activePrivateReads) {
        if (force || !entry.matches()) {
            entry.revoked = true;
            entry.controller?.abort();
        }
    }
}
for (const event of ['comfy-user-login', 'comfy-user-logout', 'comfy-ranking-auth-expired']) {
    window.addEventListener(event, () => revokePrivateReads(true));
}
window.addEventListener('storage', event => {
    if (event.key === null || event.key === CACHE.LEGACY_KEYS.USER) revokePrivateReads(true);
    else if (event.key === CACHE.LEGACY_KEYS.TOKEN) revokePrivateReads();
});
eventBus.on(EVENTS.USER_LOGIN, () => revokePrivateReads(true));
eventBus.on(EVENTS.USER_LOGOUT, () => revokePrivateReads(true));

function _safeClearAuthStorage() {
    for (const storageName of ['localStorage', 'sessionStorage']) {
        try {
            const storage = window[storageName];
            storage?.removeItem('ComfyCommunity_Token');
            storage?.removeItem('ComfyCommunity_User');
        } catch (_) {
            // 浏览器禁用 Storage 时仍继续完成内存登出和事件通知。
        }
    }
}

function notifyTokenExpired() {
    const now = Date.now();
    if (now - _authExpiredAt < 5000) return;
    _authExpiredAt = now;
    console.warn("⚠️ 登录凭证已失效，本地凭证已清除，请重新登录");
    // 动态 import UI 组件，与 proxyImages 同样避免模块初始化时序问题
    import("../components/UI交互提示组件.js").then(async ({ showToast }) => {
        const { t } = await import("../components/用户体验_国际化.js");
        showToast(t('auth.token_expired'), "warning", 4000);
    }).catch(() => {});
}

function handleAuthExpired(failedToken) {
    // 竞态防护：若用户在 401 返回前已重新登录（存储中的 Token 已更换），
    // 不清理新凭证；失败请求未携带 Token 时 401 与登录态无关，同样不打扰
    if (!failedToken) return false;
    const currentToken = _safeGetAuthToken();
    if (currentToken !== failedToken) return false;
    // 清除前取出账号，用于清理账号级 Profile 缓存
    let account = null;
    try {
        const userStr = _safeStorageGet('localStorage', "ComfyCommunity_User")
            || _safeStorageGet('sessionStorage', "ComfyCommunity_User");
        if (userStr) account = JSON.parse(userStr)?.user?.account || null;
    } catch (e) {}
    // 与手动登出同深度的完整清理：Token/User、私有数据缓存、内存缓存与安装版本戳
    logoutAndClearUserData(account);
    notifyTokenExpired();
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
    
    async add(fn, signal) {
        signal.throwIfAborted();
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
            const onAbort = () => {
                const index = this.pending.indexOf(run);
                if (index !== -1) this.pending.splice(index, 1);
                reject(signal.reason);
            };
            const run = async () => {
                signal.removeEventListener('abort', onAbort);
                try {
                    signal.throwIfAborted();
                    resolve(await fn());
                } catch (e) {
                    reject(e);
                }
            };
            this.pending.push(run);
            signal.addEventListener('abort', onAbort, { once: true });
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
    const sample = beginLocalPerformanceSample(endpoint, options.method || 'GET');
    try { return await performRequest(endpoint, options, sample); }
    finally { sample?.finish(); }
}

async function performRequest(endpoint, options = {}, sample = null) {
    const privateRead = (options.method || "GET").toUpperCase() === "GET" && isPrivateApiGet(endpoint);
    if (privateRead) {
        removeCache(`api_${endpoint}`);
        options = { ...options, noStore: true };
    }
    // 私有详情显式不留存：同时绕过响应命中/回退/去重、插件写缓存和浏览器缓存。
    if (options.noStore) options = { ...options, noCache: true, cache: "no-store" };
    const url = `${BASE_URL}${endpoint}`;
    const method = (options.method || "GET").toUpperCase();
    const validateResponse = method === "GET" ? options.validateResponse ?? null : null;
    if (validateResponse !== null && typeof validateResponse !== "function") throw new TypeError("Invalid response validator");
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) { headers["Content-Type"] = "application/json"; }
    const token = _safeGetAuthToken();
    const privateEntry = privateRead ? { revoked: false, controller: null, matches: () => token === _safeGetAuthToken() } : null;
    const assertReadSession = () => {
        if (privateRead && (privateEntry.revoked || !privateEntry.matches())) {
            const error = new Error(t('auth.session_changed'));
            error.name = 'SessionChangedError';
            error.isCancelled = true;
            throw error;
        }
    };
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
            _safeClearAuthStorage();
            window.dispatchEvent(new CustomEvent('comfy-ranking-auth-expired'));
            notifyTokenExpired();
        }
    }
    
    // 🚀 P4优化：组件级请求取消支持
    const componentId = options.componentId || '_global';
    
    // ⚡ P1性能优化：GET 请求缓存检查
    // 🔑 P0修复：cacheKey 必须包含完整 endpoint（含查询参数），不能截断 '?' 之后的部分
    // 例：'/api/items?type=tool&sort=time' 和 '/api/items?type=tool&sort=views' 必须产生不同的缓存 Key
    const cacheKey = `api_${endpoint}`;
    const readValidatedCacheMeta = () => {
        const metadata = getCacheWithMeta(cacheKey, true);
        if (metadata.found && validateResponse) {
            const source = captureCacheSource(cacheKey);
            try { validateResponse(metadata.value); }
            catch {
                source?.discard();
                return { value: null, expired: false, found: false };
            }
        }
        return metadata;
    };
    const isRequestCacheCurrent = method === "GET" && !options.noStore ? captureCacheWrite(cacheKey) : null;
    let isCacheWriteCurrent = isRequestCacheCurrent;
    const trackPendingRequest = method === "GET" && !options.noCache;
    const trackCacheOwner = method === "GET" && !options.noStore;
    if (method === "GET" && !options.noCache) {
        let cached = getCache(cacheKey);
        const source = cached ? captureCacheSource(cacheKey) : null;
        if (cached && validateResponse) {
            try { validateResponse(cached); }
            catch { source?.discard(); cached = null; }
        }
        if (cached) {
            const proxyFn = await getProxyImages();
            sample?.cacheHit();
            return _cachedResponse(proxyFn(cached), source);
        }
    }
    
    // 📴 本地兜底数据（含过期缓存）——一次读取，供下面三处复用：
    //   ① 离线/云端不可达时直接返回它；② 判定本次 GET 是否属于「后台补新」（走短预算）；
    //   ③ 重试耗尽后的最终回退仍按原口径自行重读一次（期间可能有并发请求写入更新的数据）
    const fallbackMeta = (method === "GET" && !options.noCache)
        ? readValidatedCacheMeta()  // 忽略过期
        : { value: null, expired: false, found: false };
    const conditionalRead = method === "GET" && !options.noStore && options.credentials !== "include"
        && !Object.keys(headers).some(name => name.toLowerCase() === "authorization")
        && API.PUBLIC_CONDITIONAL_GET_PATHS.includes(endpoint.split(/[?#]/)[0]);
    const conditionalMeta = conditionalRead ? readValidatedCacheMeta() : null;
    if (conditionalRead) {
        for (const name of Object.keys(headers)) if (name.toLowerCase() === "if-none-match") delete headers[name];
        if (conditionalMeta?.found && conditionalMeta.etag) headers["If-None-Match"] = conditionalMeta.etag;
    }

    // 🚀 P3优化：离线模式支持（网络状态取自 状态管理.js 的 isOnline()）
    // ☁️ 云端不可达冷却与本机断网同等对待：两者的结论都是「这次联网注定拿不到东西」，
    // 区别只在判据——前者看 navigator.onLine（本机网卡通不通），后者看上一次请求的
    // 失败结论是否还在冷却期内。没有这层的话，HF Space 单独连不上时 isOnline() 恒为 true，
    // 本分支永远不触发，于是每个界面、每轮 30 秒的消息轮询都要各自烧满 61~93 秒重试预算，
    // 而全局并发额度只有 6 个，挂死的后台请求会把前台请求全部挤到排队
    // noCache 只代表绕过该 endpoint 的响应缓存，不得绕过共享网络熔断；榜单强制刷新
    // 仍由列表层先显示自己的缓存，冷却期内直接失败返回，避免切换榜单逐个重试 HF。
    if (method === "GET" && (!isOnline() || !isCloudReachable())) {
        if (fallbackMeta.found) {
            console.log(`📴 ${isOnline() ? '☁️ 云端不可达' : '离线模式'}：返回${fallbackMeta.expired ? '过期' : ''}缓存`);
            const source = captureCacheSource(cacheKey);
            const proxyFn2 = await getProxyImages();
            sample?.cacheHit();
            return _cachedResponse(proxyFn2(fallbackMeta.value), source);
        }
        // 🔧 修复：原为硬编码中文，而本错误会被 12+ 处调用方直接 showToast(err.message) 弹给用户，
        // 导致英文界面下仍弹中文提示；现改走词典。云端不可达与本机断网分开用词，
        // 否则本机明明有网的用户会被「网络已断开」误导去查自己的路由器
        throw new Error(isOnline() ? t('feedback.cloud_unreachable_no_cache') : t('feedback.offline_no_cache'));
    }
    
    // ⚡ P1性能优化：请求去重（相同GET请求只发一次）
    if (trackPendingRequest) {
        const pending = pendingRequests.get(cacheKey);
        const guard = pendingRequestGuards.get(pending);
        if (pending && guard?.isCurrent() && guard.validateResponse === validateResponse && cacheReadOwners.get(cacheKey) === pending) {
            sample?.discard();
            return pending;
        }
    }
    
    const fetchOptions = { ...options, method, headers };
    delete fetchOptions.validateResponse;
    
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
    // 🐢 后台补新短预算：本地已有该请求的缓存，说明列表视图已经把内容渲染上屏了
    // （七大列表都是「本地数据先上屏 → 再发请求补新」），这次请求纯属后台行为，
    // 失败要快——它每多挂 1 秒就多占 1 个并发额度（全局仅 6 个）。用 Math.min 只收不放，
    // 不会把搜索类已经收紧过的 10s 预算又放宽回去。
    // noCache 请求不参与：调用方明确要权威新数据（余额、安装前的资源详情、广告配置），
    // 把它的超时砍短会把「慢但能成功」变成「快速失败」，违背调用方意图
    const useCacheBudget = method === "GET" && !options.noCache && fallbackMeta.found;
    if (useCacheBudget) {
        defaultTimeout = Math.min(defaultTimeout, API.BACKGROUND_TIMEOUT);
        defaultRetries = Math.min(defaultRetries, API.BACKGROUND_RETRIES);
    }
    const requestTimeout = options.timeout || defaultTimeout;
    const maxRetries = options.retries ?? defaultRetries;
    const retryDelay = options.retryDelay ?? API.RETRY_DELAY;  // 指数退避基数
    
    // ⚡ P1性能优化：封装请求 Promise（支持去重 + 重试）
    if (privateEntry) activePrivateReads.add(privateEntry);
    const requestPromise = (async () => {
        let lastError = null;
        // ☁️ 本次失败是否属于「网络层不可达」（超时 / 连不上），用于循环结束后决定是否打冷却。
        // 5xx 不置位：服务端已经应答说明云端可达，若也打冷却会让一个坏接口把全站 GET 拖下水
        let networkLevelFailure = false;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            assertReadSession();
            // 🚀 P1优化：指数退避延迟
            if (attempt > 0) {
                // ☁️ 冷却已生效就停止重试：另一个并发请求可能刚刚确证云端不可达，
                // 继续重试只是白烧一轮超时预算、白占一个并发额度，直接跳去下方缓存兜底
                if (method === "GET" && !isCloudReachable()) break;
                const delay = retryDelay * Math.pow(2, attempt - 1);  // 1s, 2s, 4s...
                console.log(`🔄 请求重试 (${attempt}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, delay));
            }
                    
            // 🚀 P4优化：使用请求取消管理器（支持超时 + 组件级取消）
            const controller = requestCancelManager.create(componentId);
            if (privateEntry) privateEntry.controller = controller;
            const currentFetchOptions = { ...fetchOptions, signal: controller.signal };
            let timeoutId = null;
            let timedOut = false;
            let fetchStarted = false;
            let transportFailed = false;
            const onTimeout = () => { timedOut = true; controller.abort(); };
            // 已有缓存时排队也计入预算，避免被无缓存的慢请求无限拖住。
            if (useCacheBudget) timeoutId = setTimeout(onTimeout, requestTimeout);
                    
            try {
                const result = await requestQueue.add(async () => {
                    if (!useCacheBudget) timeoutId = setTimeout(onTimeout, requestTimeout);
                    // 请求可能在云端故障被另一个并发请求确认前进入队列；出队发出 fetch
                    // 前复查共享状态，避免队列继续逐个访问已知不可达的 HF endpoint。
                    if (method === "GET" && (!isOnline() || !isCloudReachable())) {
                        const unavailableError = new Error(
                            isOnline() ? t('feedback.cloud_unreachable_no_cache') : t('feedback.offline_no_cache')
                        );
                        unavailableError.name = 'CloudUnavailableError';
                        throw unavailableError;
                    }
                    assertReadSession();
                    fetchStarted = true;
                    try {
                        if (isRequestCacheCurrent) isCacheWriteCurrent = captureCacheWrite(cacheKey);
                        let response = await fetch(url, currentFetchOptions);
                        let validatedData;
                        if (response.status === 304 && conditionalRead) {
                            const currentMeta = getCacheWithMeta(cacheKey, true);
                            if (conditionalMeta?.found && conditionalMeta.etag
                                && response.headers?.get?.('ETag') === conditionalMeta.etag
                                && currentMeta.found && currentMeta.etag === conditionalMeta.etag
                                && currentMeta.value === conditionalMeta.value) {
                                sample?.cacheHit();
                                validatedData = currentMeta.value;
                            } else {
                                // 缓存可能在等待期间被清理/写操作失效；同一预算内补取完整响应。
                                const fullHeaders = { ...currentFetchOptions.headers };
                                for (const name of Object.keys(fullHeaders)) if (name.toLowerCase() === "if-none-match") delete fullHeaders[name];
                                if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                                isCacheWriteCurrent = captureCacheWrite(cacheKey);
                                response = await fetch(url, { ...currentFetchOptions, headers: fullHeaders, cache: "no-store" });
                                if (response.status === 304) throw new SyntaxError('Unexpected not-modified response');
                            }
                        }
                        let data;
                        let bodyConfirmed = true;
                        try {
                            data = validatedData !== undefined ? validatedData
                                : response.status === 204 ? {} : await response.json();
                        } catch (error) {
                            // 错误响应的正文不可读时仍按 HTTP 状态处理，不能用缓存掩盖 401/403。
                            if (!response.ok && (error instanceof SyntaxError || error instanceof TypeError || (timedOut && error.name === 'AbortError'))) {
                                data = {};
                                bodyConfirmed = false;
                            } else {
                                throw error;
                            }
                        }
                        return { response, data, bodyConfirmed, validated: validatedData !== undefined };
                    } catch (error) {
                        transportFailed = error instanceof TypeError;
                        throw error;
                    }
                }, controller.signal);
                clearTimeout(timeoutId);
                requestCancelManager.remove(componentId, controller);
                const { response } = result;
                let responseData = result.data;
                assertReadSession();

                if (!response.ok && !result.validated) {
                    if (!responseData || typeof responseData !== "object" || Array.isArray(responseData)) responseData = {};
                    const errorMsg = httpErrorMessage(responseData, response.status);
                    
                    // 🚀 P1优化：4xx 错误不重试，5xx 错误可重试
                    if (response.status >= 400 && response.status < 500) {
                        if (response.status === 401) {
                            // 🔧 修复：清除失效凭证并提示重新登录（原实现仅广播事件，无人清理）；
                            // 传入本请求实际使用的 Token 做竞态比对，避免误清重新登录后签发的新凭证。
                            // 仅当确认凭证确实失效后才广播登出事件（导航停止轮询并重置登录态），
                            // 迟到的旧 401 或匿名请求的 401 不再误触发登录态重置。
                            // 登录接口的 401 语义是「密码错误」而非凭证失效，不走全局清理，
                            // 避免与登录表单自身的错误提示重复叠加
                            if (endpoint !== "/api/users/login" && handleAuthExpired(token)) {
                                window.dispatchEvent(new CustomEvent('comfy-ranking-auth-expired'));
                            }
                        }
                        const error = withRequestDiagnostic(new Error(errorMsg), response, responseData);
                        error.status = response.status;
                        if (typeof responseData.detail === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(responseData.detail)) error.code = responseData.detail;
                        if (result.bodyConfirmed && Object.hasOwn(API.REQUEST_BODY_ERRORS, error.code)
                                && API.REQUEST_BODY_ERRORS[error.code].status === error.status) {
                            error.requestBodyRejected = true;
                        }
                        throw error;
                    }

                    // 应用明确标记且正文可读的503只影响当前接口，仍允许其它榜单联网。
                    if (response.status === 503 && result.bodyConfirmed &&
                            response.headers?.get?.(API.ENDPOINT_ERROR_SCOPE_HEADER) === API.ENDPOINT_ERROR_SCOPE_VALUE) {
                        lastError = withRequestDiagnostic(new Error(errorMsg), response, responseData);
                        lastError.status = response.status;
                        networkLevelFailure = false;
                        break;
                    }

                    // Hugging Face Space / 网关不可用通常以 502、503 或 504 响应，
                    // 这类响应证明请求到达了代理层，但云端当前无法提供服务。
                    // 与超时/连接失败一样共享冷却，避免切换榜单时每个 endpoint
                    // 都重复访问一次；普通 500 仍只视为单接口服务端错误。
                    if ([502, 503, 504].includes(response.status)) {
                        lastError = withRequestDiagnostic(new Error(errorMsg), response, responseData);
                        lastError.status = response.status;
                        networkLevelFailure = true;
                        markCloudDown(endpoint);
                        break;
                    }
                    
                    lastError = withRequestDiagnostic(new Error(errorMsg), response, responseData);
                    lastError.status = response.status;
                    continue;  // 5xx 错误重试
                }

                // ☁️ 拿到了正常应答即证明云端可达，立即清零冷却（不必等它自然过期）。
                // 非 GET 的成功同样算数——写操作是冷却期内唯一还在联网的请求，天然是探针
                markCloudUp();

                if (validateResponse) {
                    try { validateResponse(responseData); }
                    catch (error) { lastError = error; break; }
                }

                // 🚀 P1优化：精确清除相关缓存（替代暴力清空）
                if (["POST", "PUT", "DELETE"].includes(method) && responseData?.status === "success") {
                    invalidateRelatedCache(endpoint, method);
                }

                // ⚡ P1性能优化：GET 请求结果缓存
                if (method === "GET" && !options.noStore && isCacheWriteCurrent() && cacheReadOwners.get(cacheKey) === requestPromise) {
                    const ttl = _getCacheTTL(endpoint);
                    if (ttl > 0) {
                        // 创作者列表不持久化到 localStorage，避免空间不足
                        const persist = !endpoint.includes('/api/creators');
                        setCache(cacheKey, responseData, ttl, persist,
                            conditionalRead ? { etag: response.headers?.get?.('ETag') } : {});
                    }
                }

                // 入口数据挂载代理
                const proxyFn3 = await getProxyImages();
                assertReadSession();
                responseData = proxyFn3(responseData);
                if (responseData && typeof responseData === "object") {
                    responseCacheSources.delete(responseData);
                    if (trackCacheOwner && (!isCacheWriteCurrent() || cacheReadOwners.get(cacheKey) !== requestPromise)) responseCacheSources.set(responseData, { source: null });
                }
                return responseData;
            } catch (error) {
                clearTimeout(timeoutId);  // 清除超时计时器
                // 🔍 失败/超时同样摘除 controller：成功路径在上方已 remove，这里不补的话，
                // 取消分组里会堆积已失效的 controller，使 cancelAll 的在途计数虚高
                requestCancelManager.remove(componentId, controller);
                assertReadSession();

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

                // 队列等待期间已有并发请求确证网络不可达：该请求尚未发出 fetch，
                // 直接交给统一缓存兜底，不重试、不延长冷却，也不把队列错误当作网络探测。
                if (error.name === 'CloudUnavailableError') {
                    lastError = error;
                    break;
                }
                
                // 🔧 P1优化：可重试的错误类型
                const isRetryable = (
                    error.name === 'AbortError' ||
                    transportFailed
                );
                
                if (isRetryable) {
                    // 🔧 修复：重试耗尽时不再直接 throw（否则循环后的「过期缓存兜底」
                    // 分支永远不可达，断网时无法无缝切换本地数据）。记录友好错误后跳出循环，
                    // 让 GET 请求走过期缓存回退；无缓存时仍以该友好错误抛出。
                    const isTimeout = error.name === 'AbortError';
                    lastError = isTimeout
                        ? new Error(t('feedback.network_timeout'))
                        : new Error(t('feedback.network_unavailable'));
                    lastError.code = isTimeout ? 'network_timeout' : 'network_unavailable';
                    if (fetchStarted) networkLevelFailure = true;
                    // ☁️ 连接层失败（被墙 / DNS 污染 / 拒绝连接 / 证书错误）几乎不会是偶发抖动，
                    // 打上冷却后其它界面与轮询就不用再各自烧一遍预算。但单次失败不足以定论，
                    // 故分两种口径：已配重试时要求第二次尝试仍失败才定论（连接层失败是毫秒级的，
                    // 多等一轮只多花约 1 秒，却能挡住偶发抖动误伤 60 秒）；
                    // 未配重试时（后台补新短预算，界面已用缓存上屏）误判零代价，立即定论。
                    // 超时则可能是 HF Space 冷启动（慢但能成功），不在此定论，耗尽后由下方统一处理
                    if (!isTimeout && (attempt >= 1 || maxRetries === 0)) markCloudDown(endpoint);
                    if (attempt < maxRetries) continue;  // 重试
                    break;  // 重试耗尽 → 跳到过期缓存兜底
                }
                
                // 🔧 P3优化：错误分类处理，提供更清晰的错误信息（不可重试错误直接抛出）
                if (error instanceof SyntaxError) {
                    throw new Error(t('feedback.response_format_error'));
                }
                throw error;
            }
        }
        
        // ☁️ 所有尝试都因网络层原因失败（超时耗尽重试也走这里）→ 打上冷却，
        // 接下来 API.CLOUD_DOWN_COOLDOWN 内的 GET 全部就地走缓存，不再重复等待
        if (networkLevelFailure) markCloudDown(endpoint);

        // 所有重试都失败，尝试回退到过期缓存
        if (method === "GET" && !options.noCache) {
            const fallback = readValidatedCacheMeta();  // true = 允许过期
            if (fallback.found) {
                console.warn('📴 网络请求失败，回退到本地缓存');
                const source = captureCacheSource(cacheKey);
                const proxyFn4 = await getProxyImages();
                sample?.cacheHit();
                return _cachedResponse(proxyFn4(fallback.value), source);  // 返回过期缓存数据
            }
        }
        // 仍无缓存，才抛异常
        throw lastError || new Error(t('feedback.error'));
    })();
    
    if (privateEntry) requestPromise.finally(() => activePrivateReads.delete(privateEntry)).catch(() => {});

    if (trackCacheOwner) {
        cacheReadOwners.set(cacheKey, requestPromise);
        requestPromise.finally(() => {
            if (cacheReadOwners.get(cacheKey) === requestPromise) cacheReadOwners.delete(cacheKey);
        }).catch(() => {});
    }

    // 记录进行中的请求
    if (trackPendingRequest) {
        pendingRequests.set(cacheKey, requestPromise);
        pendingRequestGuards.set(requestPromise, { isCurrent: isRequestCacheCurrent, validateResponse });
    }
    
    // 确保请求完成后清除去重记录
    // 🔧 补 .catch 空处理：finally 会派生出一个新的 Promise，而它从未被返回也无人接收，
    // 一旦请求失败（含主动撤销）就会在控制台抛 Uncaught (in promise)。
    // 原始 requestPromise 仍在下方正常返回给调用方处理，此处只是吞掉这份重复的拒绝
    if (trackPendingRequest) {
        requestPromise.finally(() => {
            if (pendingRequests.get(cacheKey) === requestPromise) pendingRequests.delete(cacheKey);
        }).catch(() => {});
    }
    
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
    const externalSignal = options.signal;
    const abortFromCaller = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

    // 📡 空闲超时检测：长时间无数据视为连接已断
    const IDLE_TIMEOUT_DEFAULT = 30000;  // 30 秒无数据视为空闲
    const IDLE_TIMEOUT_GRACE = 5000;     // 收到 finalResult 后的宽限期 5 秒
    let currentIdleTimeout = options.idleTimeout || IDLE_TIMEOUT_DEFAULT;
    let idleTimer = null;
    let finalResult = null;
    let streamReader = null;

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
            const error = withRequestDiagnostic(new Error(t('feedback.http_request_failed', { status: response.status })), response);
            error.status = response.status;
            // 仅当流式路由明确不存在/不接受该方法时，调用方可安全回退到旧端点。
            // 网络错误、超时和服务端错误都可能发生在操作已开始后，不可自动重发。
            error.fallbackSafe = response.status === 404 || response.status === 405;
            throw error;
        }

        const reader = streamReader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const decodeSSEChunk = (value, options) => {
            try {
                return decoder.decode(value, options);
            } catch (_) {
                const error = new Error(t('feedback.stream_invalid_encoding'));
                error.code = 'invalid_stream_encoding';
                error.outcomeUnknown = true;
                throw error;
            }
        };
        let totalBytes = 0, lineBytes = 0, lineCount = 0;
        let workBytes = 0, workLines = 0, workChunks = 0;
        const lineParts = [];
        const limitError = () => {
            const error = new Error(t('feedback.stream_limit_exceeded'));
            error.code = 'stream_limit_exceeded';
            error.outcomeUnknown = true;
            return error;
        };
        const appendLinePart = (part) => {
            if (!part) return;
            let level = 0;
            while (lineParts[level] !== undefined) {
                part = lineParts[level] + part;
                lineParts[level++] = undefined;
            }
            lineParts[level] = part;
        };
        const takeLine = () => {
            const line = lineParts.slice().reverse().filter(part => part !== undefined).join('');
            lineParts.length = 0;
            return line;
        };
        const yieldIfNeeded = async () => {
            if (workBytes >= API.SSE_YIELD_BYTES || workLines >= API.SSE_YIELD_LINES || workChunks >= API.SSE_YIELD_CHUNKS) {
                workBytes = workLines = workChunks = 0;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        };
        const checkChunkBudget = (value) => {
            totalBytes += value.byteLength;
            if (totalBytes > API.SSE_MAX_RESPONSE_BYTES) throw limitError();
            let start = 0, end;
            while ((end = value.indexOf(10, start)) !== -1) {
                lineBytes += end - start;
                if (lineBytes > API.SSE_MAX_LINE_BYTES) throw limitError();
                lineBytes = 0;
                start = end + 1;
            }
            lineBytes += value.byteLength - start;
            if (lineBytes > API.SSE_MAX_LINE_BYTES) throw limitError();
        };
        const processSSELine = (line) => {
            if (!line.startsWith("data: ")) return;
            let data;
            try {
                data = JSON.parse(line.slice(6));
            } catch (_) {
                console.warn("[SSE] 解析事件失败");
                return;
            }
            if (!data || typeof data !== "object" || Array.isArray(data)) {
                console.warn("[SSE] 忽略非对象事件");
                return;
            }
            if (data.status === "success" || data.status === "error") {
                // 先保存最终结果，UI 更新回调即使异常也不能丢失服务端结果。
                finalResult = data;
                currentIdleTimeout = IDLE_TIMEOUT_GRACE;
            }
            try {
                onProgress?.(data);
            } catch (callbackError) {
                console.warn("[SSE] 进度回调失败");
            }
        };
        const processSSEText = async (text, flush = false) => {
            let start = 0, end;
            while ((end = text.indexOf("\n", start)) !== -1) {
                if (++lineCount > API.SSE_MAX_LINES) throw limitError();
                appendLinePart(text.slice(start, end));
                processSSELine(takeLine());
                start = end + 1;
                workLines++;
                await yieldIfNeeded();
            }
            appendLinePart(text.slice(start));
            if (flush && lineParts.length) {
                if (++lineCount > API.SSE_MAX_LINES) throw limitError();
                processSSELine(takeLine());
            }
        };
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
                    return { status: "error", outcomeUnknown: true, message: t('feedback.stream_idle_timeout') };
                }
                throw e;
            }
            clearIdleTimer();

            const { done, value } = readResult;
            if (done) {
                await processSSEText(decodeSSEChunk(), true);
                break;
            }

            checkChunkBudget(value);
            workBytes += value.byteLength;
            workChunks++;
            await processSSEText(decodeSSEChunk(value, { stream: true }));
            await yieldIfNeeded();
        }

        return finalResult || { status: "error", outcomeUnknown: true, message: t('feedback.stream_missing_final') };
    } catch (err) {
        // 已收到最终事件时，后续连接关闭错误不应覆盖操作结果或触发重复提交。
        if (finalResult) return finalResult;
        if (err.name === "AbortError") {
            return {
                status: "error",
                outcomeUnknown: true,
                cancelRequested: !!externalSignal?.aborted,
                message: externalSignal?.aborted ? t('feedback.request_cancelled') : t('feedback.stream_timeout_unconfirmed')
            };
        }
        throw err;
    } finally {
        clearTimeout(globalTimer);
        clearIdleTimer();
        externalSignal?.removeEventListener("abort", abortFromCaller);
        try { controller.abort(); } catch (_) {}
        if (streamReader) {
            try { Promise.resolve(streamReader.cancel()).catch(() => {}); } catch (_) {}
            try { streamReader.releaseLock(); } catch (_) {}
            streamReader = null;
        }
    }
}

// 导出给外部使用
export { requestCancelManager, invalidateRelatedCache, request };
export default request;
