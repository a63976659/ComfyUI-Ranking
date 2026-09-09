// 前端页面/core/状态管理.js
// ==========================================
// 🏪 全局状态管理中心
// ==========================================
// 作用：集中管理应用状态（含全项目网络状态），提供响应式更新和事件通知
// 关联文件：
//   - 类型定义.js (类型定义)
//   - 所有需要共享状态的组件
//   - 顶部导航组件.js (用户登录状态)
//   - 侧边栏主程序.js (当前视图状态)
//   - 网络请求_基础设施.js (调用 isOnline() / isCloudReachable() 决定是否走缓存回退，并回写 markCloudDown/markCloudUp)
//   - 网络请求_图片代理.js (仅调用 isOnline()：媒体链路的云端不可达已由本地插件层 api_cache.py 的熔断兜住，见技术文档 02 章 2.4.1.1)
// ==========================================
// 🏗️ P2架构优化：轻量级状态管理
// 🏗️ P2质量优化：JSDoc 类型注释
// ==========================================

/**
 * @typedef {import('./类型定义.js').UserData} UserData
 * @typedef {import('./类型定义.js').UserSession} UserSession
 * @typedef {import('./类型定义.js').WalletData} WalletData
 */

import { API, CACHE } from "./全局配置.js";
import { clearSensitiveCache, clearAllCache } from "../components/性能优化工具.js";


// ==========================================
// 📦 状态存储
// ==========================================

const state = {
    // 用户状态
    user: {
        isLoggedIn: false,
        account: null,
        name: null,
        avatar: null,
        token: null,
        wallet: null
    },
    
    // 视图状态
    view: {
        currentTab: "tools",
        currentSort: "latest",
        searchKeyword: "",
        isLoading: false
    },
    
    // 缓存状态
    cache: {
        items: new Map(),
        creators: new Map(),
        users: new Map()
    },
    
    // 网络状态（全项目唯一数据源，见下方「🌐 网络状态管理」与「☁️ 云端可达性」两个段落）
    network: {
        isOnline: navigator.onLine,
        // 云端不可达冷却的截止时间戳（0 = 云端可达）。与 isOnline 刻意分开：
        // 前者答「云端服务器能不能连上」，后者只答「本机网卡通不通」
        cloudDownUntil: 0
    }
};


// ==========================================
// 🎯 事件总线
// ==========================================
// 实现组件间解耦通信

const eventBus = {
    _listeners: new Map(),
    
    /**
     * 订阅事件
     * @param {string} event - 事件名
     * @param {Function} callback - 回调函数
     * @returns {Function} 取消订阅函数
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        
        // 返回取消订阅函数
        return () => this.off(event, callback);
    },
    
    /**
     * 订阅一次性事件
     * @param {string} event - 事件名
     * @param {Function} callback - 回调函数
     */
    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    },
    
    /**
     * 取消订阅
     * @param {string} event - 事件名
     * @param {Function} callback - 回调函数
     */
    off(event, callback) {
        if (this._listeners.has(event)) {
            this._listeners.get(event).delete(callback);
        }
    },
    
    /**
     * 触发事件
     * @param {string} event - 事件名
     * @param {any} data - 事件数据
     */
    emit(event, data) {
        if (this._listeners.has(event)) {
            this._listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`事件处理错误 [${event}]:`, error);
                }
            });
        }
    },
    
    /**
     * 清除所有订阅
     * @param {string} event - 可选，指定事件名
     */
    clear(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
};


// ==========================================
// 📋 预定义事件名
// ==========================================

export const EVENTS = {
    // 用户相关
    USER_LOGIN: "user:login",
    USER_LOGOUT: "user:logout",
    USER_UPDATE: "user:update",
    WALLET_UPDATE: "wallet:update",
    
    // 视图相关
    TAB_CHANGE: "view:tab-change",
    SORT_CHANGE: "view:sort-change",
    SEARCH: "view:search",
    REFRESH: "view:refresh",
    
    // 内容相关
    ITEM_CREATE: "item:create",
    ITEM_UPDATE: "item:update",
    ITEM_DELETE: "item:delete",
    COMMENT_CREATE: "comment:create",
    
    // 社交相关
    FOLLOW_TOGGLE: "social:follow",
    TIP_SENT: "social:tip",
    MESSAGE_RECEIVED: "social:message",
    
    // 系统相关
    NETWORK_CHANGE: "system:network",
    CACHE_CLEAR: "system:cache-clear",
    ERROR: "system:error"
};


// ==========================================
// 👤 用户状态管理
// ==========================================

/**
 * 构建已登录用户状态对象
 * @param {Object} userData - 用户数据
 * @param {string} token - 认证令牌
 * @returns {Object} 用户状态对象
 */
function _createUserState(userData, token) {
    return {
        isLoggedIn: true,
        account: userData.account,
        name: userData.name,
        avatar: userData.avatar || userData.avatarDataUrl,
        token: token,
        wallet: null
    };
}

/**
 * 初始化用户状态（从本地存储恢复）
 */
export function initUserState() {
    try {
        // 尝试从 localStorage 恢复
        const userStr = localStorage.getItem(CACHE.LEGACY_KEYS.USER);
        const token = localStorage.getItem(CACHE.LEGACY_KEYS.TOKEN);
        
        if (userStr && token) {
            const userData = JSON.parse(userStr);
            state.user = _createUserState(userData, token);
        } else {
            // 尝试从 sessionStorage 恢复
            const sessionUserStr = sessionStorage.getItem(CACHE.LEGACY_KEYS.USER);
            const sessionToken = sessionStorage.getItem(CACHE.LEGACY_KEYS.TOKEN);
            
            if (sessionUserStr && sessionToken) {
                const userData = JSON.parse(sessionUserStr);
                state.user = _createUserState(userData, sessionToken);
            }
        }
    } catch (error) {
        console.warn("用户状态恢复失败:", error);
    }
}

/**
 * 设置登录用户
 * @param {Object} userData - 用户数据
 * @param {string} token - 认证令牌
 * @param {boolean} remember - 是否记住登录
 */
export function setUser(userData, token, remember = true) {
    state.user = _createUserState(userData, token);
    
    // 持久化存储
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(CACHE.LEGACY_KEYS.USER, JSON.stringify(userData));
    storage.setItem(CACHE.LEGACY_KEYS.TOKEN, token);
    
    // 触发事件
    eventBus.emit(EVENTS.USER_LOGIN, state.user);
}

/**
 * 获取当前用户
 * @returns {Object|null}
 */
export function getUser() {
    return state.user.isLoggedIn ? { ...state.user } : null;
}

/**
 * 检查是否已登录
 * @returns {boolean}
 */
export function isLoggedIn() {
    return state.user.isLoggedIn;
}

/**
 * 获取认证令牌
 * @returns {string|null}
 */
export function getToken() {
    return state.user.token;
}

/**
 * 更新用户信息
 * @param {Object} updates - 更新的字段
 */
export function updateUser(updates) {
    Object.assign(state.user, updates);
    
    // 更新持久化存储
    const userStr = localStorage.getItem(CACHE.LEGACY_KEYS.USER) || 
                    sessionStorage.getItem(CACHE.LEGACY_KEYS.USER);
    if (userStr) {
        try {
            const userData = JSON.parse(userStr);
            Object.assign(userData, updates);
            const storage = localStorage.getItem(CACHE.LEGACY_KEYS.USER) ? localStorage : sessionStorage;
            storage.setItem(CACHE.LEGACY_KEYS.USER, JSON.stringify(userData));
        } catch {}
    }
    
    eventBus.emit(EVENTS.USER_UPDATE, state.user);
}

/**
 * 退出登录
 */
export function logout() {
    state.user = {
        isLoggedIn: false,
        account: null,
        name: null,
        avatar: null,
        token: null,
        wallet: null
    };

    // 清除内存缓存（items/creators/users）
    Object.values(state.cache).forEach(cache => cache.clear());

    // 清除敏感数据内存缓存
    clearSensitiveCache();

    // 清除存储
    localStorage.removeItem(CACHE.LEGACY_KEYS.USER);
    localStorage.removeItem(CACHE.LEGACY_KEYS.TOKEN);
    sessionStorage.removeItem(CACHE.LEGACY_KEYS.USER);
    sessionStorage.removeItem(CACHE.LEGACY_KEYS.TOKEN);

    // 清除资源安装版本戳（ComfyCommunity_LocalVer_*）
    // 避免切换账号后残留的版本戳导致详情页按钮状态错误
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ComfyCommunity_LocalVer_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
        console.warn('清除版本戳缓存失败:', e);
    }

    eventBus.emit(EVENTS.USER_LOGOUT);
}

/**
 * 🔧 新增：登出并清理用户私有数据缓存
 * 手动登出与 401 凭证失效强制登出共用，保证两条路径清理范围一致，
 * 避免强制登出后聊天记录/通知等私有缓存残留被下一账号读到
 * @param {string|null} account - 当前账号（清除账号级 Profile 缓存用，可为 null）
 */
export function logoutAndClearUserData(account = null) {
    // 清除当前账号的 Profile 级缓存
    if (account) {
        localStorage.removeItem(`ComfyCommunity_ProfileCache_${account}`);
        localStorage.removeItem(`ComfyRanking_SidebarBackground_${account}`);
        localStorage.removeItem(`ComfyRanking_ProfileBannerCache_${account}`);
    }
    // 清除通用用户数据缓存（列表/聊天记录/通知）
    localStorage.removeItem("ComfyCommunity_ListCache");
    localStorage.removeItem("ComfyCommunity_ChatHistory");
    localStorage.removeItem("ComfyRanking_Notifications");
    localStorage.removeItem("ComfyRanking_ChatList");
    // 清除所有 ComfyRanking_ 前缀的数据缓存与内存敏感数据
    clearAllCache();
    // logout() 内部已含 clearSensitiveCache 与 Token/User/版本戳清理
    logout();
}


// ==========================================
// 🔍 视图状态管理
// ==========================================

/**
 * 设置当前标签页
 * @param {string} tab - 标签页名称
 */
export function setCurrentTab(tab) {
    const oldTab = state.view.currentTab;
    state.view.currentTab = tab;
    eventBus.emit(EVENTS.TAB_CHANGE, { oldTab, newTab: tab });
}

/**
 * 获取当前标签页
 * @returns {string}
 */
export function getCurrentTab() {
    return state.view.currentTab;
}

/**
 * 设置排序方式
 * @param {string} sort - 排序方式
 */
export function setCurrentSort(sort) {
    const oldSort = state.view.currentSort;
    state.view.currentSort = sort;
    eventBus.emit(EVENTS.SORT_CHANGE, { oldSort, newSort: sort });
}

/**
 * 获取排序方式
 * @returns {string}
 */
export function getCurrentSort() {
    return state.view.currentSort;
}

/**
 * 设置搜索关键词
 * @param {string} keyword - 搜索关键词
 */
export function setSearchKeyword(keyword) {
    state.view.searchKeyword = keyword;
    eventBus.emit(EVENTS.SEARCH, { keyword });
}

/**
 * 获取搜索关键词
 * @returns {string}
 */
export function getSearchKeyword() {
    return state.view.searchKeyword;
}

/**
 * 设置加载状态
 * @param {boolean} loading - 是否加载中
 */
export function setLoading(loading) {
    state.view.isLoading = loading;
}

/**
 * 获取加载状态
 * @returns {boolean}
 */
export function isLoading() {
    return state.view.isLoading;
}


// ==========================================
// 🌐 网络状态管理
// ==========================================
// 🏗️ 全项目网络状态的唯一数据源。
// online/offline 事件只在本模块注册一次，下列消费方一律调用 isOnline()，
// 不再各自维护状态副本与重复监听，避免出现「横幅显示离线但列表仍在发请求」
// 这类多份状态不同步的分裂表现：
//   - 网络请求_基础设施.js —— 离线 GET 直返缓存、重试耗尽回退过期缓存
//   - 网络请求_图片代理.js —— 离线时不构造远程直链，保持相对路径原样
//
// ⚠️ isOnline() 只能回答「本机网卡通不通」。云端单独不可达（HF Space 宕机/冷启动、
// DNS 污染、被墙）时它仍为 true，因此另设下方「☁️ 云端可达性」作为第二个共享数据源。

/**
 * 更新网络状态（仅供内部 online/offline 监听调用）
 * @param {boolean} online - 是否在线
 */
export function setNetworkStatus(online) {
    const wasOnline = state.network.isOnline;
    state.network.isOnline = online;
    
    if (wasOnline !== online) {
        console.log(online ? '🌐 网络已恢复' : '📴 网络已断开');
        eventBus.emit(EVENTS.NETWORK_CHANGE, { online });
        // 🔗 本机网卡一旦真正断开，云端必然不可达，直接打上冷却，
        // 免得每个界面还要各自烧一遍重试预算才能得出同一个结论
        if (!online) markCloudDown('本机网络已断开');
    }
}

/**
 * 检查是否在线
 * 
 * 注意：navigator.onLine 仅反映本机网络接口状态，不代表云端服务可达；
 * 云端可达性请一律改问 isCloudReachable()（见下方段落）。
 * @returns {boolean}
 */
export function isOnline() {
    return state.network.isOnline;
}

// 自动监听网络状态（全项目唯一一次注册）
if (typeof window !== "undefined") {
    window.addEventListener("online", () => setNetworkStatus(true));
    window.addEventListener("offline", () => setNetworkStatus(false));
}


// ==========================================
// ☁️ 云端可达性（全项目共享，与 isOnline() 并列的第二个网络数据源）
// ==========================================
// 🏗️ 解决的问题：本机有网但云端连不上时，isOnline() 永远返回 true，
// 「离线直返缓存」的快速通道永远不触发，于是每个界面、每轮消息轮询都要从头
// 烧一遍完整重试预算（列表约 61s、其余 GET 约 93s），而全局并发额度只有 6 个，
// 挂死的后台请求会把前台请求全部挤到排队 —— 表现为「切哪个界面都要等」。
//
// 口径（三条，改动前务必看清）：
//   - 只有 GET 受冷却约束。POST/PUT/DELETE 是用户主动操作（登录、发布、购买、点赞），
//     一律照常发出，绝不允许被冷却拦下
//   - 被动探测：冷却期内不额外发任何探测请求；冷却一过，下一个真实请求充当探针
//   - 任意一次成功响应（含非 GET）立即清零，不必等到冷却自然结束

/**
 * 云端当前是否可达（冷却已过期或从未进入冷却即为可达）
 * @returns {boolean}
 */
export function isCloudReachable() {
    return Date.now() >= state.network.cloudDownUntil;
}

/**
 * 标记云端不可达，进入冷却
 * @param {string} [reason] - 仅用于日志定位（如失败的 endpoint）
 */
export function markCloudDown(reason = '') {
    const wasReachable = isCloudReachable();
    state.network.cloudDownUntil = Date.now() + API.CLOUD_DOWN_COOLDOWN;
    // 只在「可达 → 不可达」的跃迁时打一条日志：冷却期内的重复失败不再刷屏
    if (wasReachable) {
        console.warn(`☁️ 云端不可达，${API.CLOUD_DOWN_COOLDOWN / 1000} 秒内不再联网${reason ? `（${reason}）` : ''}`);
    }
}

/**
 * 标记云端已恢复（任意一次成功响应调用），立即清零冷却
 */
export function markCloudUp() {
    if (state.network.cloudDownUntil === 0) return;
    state.network.cloudDownUntil = 0;
    console.log('☁️ 云端已恢复，重新联网');
}


// ==========================================
// 📊 缓存状态管理
// ==========================================

/**
 * 设置缓存数据
 * @param {string} type - 缓存类型 (items/creators/users)
 * @param {string} key - 缓存键
 * @param {any} data - 缓存数据
 */
export function setCacheData(type, key, data) {
    if (state.cache[type]) {
        state.cache[type].set(key, {
            data,
            timestamp: Date.now()
        });
    }
}

/**
 * 获取缓存数据
 * @param {string} type - 缓存类型
 * @param {string} key - 缓存键
 * @param {number} maxAge - 最大有效期（毫秒）
 * @returns {any|null}
 */
export function getCacheData(type, key, maxAge = CACHE.DEFAULT_TTL) {
    if (state.cache[type] && state.cache[type].has(key)) {
        const cached = state.cache[type].get(key);
        if (Date.now() - cached.timestamp < maxAge) {
            return cached.data;
        }
        state.cache[type].delete(key);
    }
    return null;
}

/**
 * 清除缓存
 * @param {string} type - 可选，缓存类型
 */
export function clearCache(type) {
    if (type && state.cache[type]) {
        state.cache[type].clear();
    } else {
        Object.values(state.cache).forEach(cache => cache.clear());
    }
    eventBus.emit(EVENTS.CACHE_CLEAR, { type });
}


// ==========================================
// 📤 导出
// ==========================================

// 导出事件总线
export { eventBus };

// 导出状态快照（只读）
export function getState() {
    return JSON.parse(JSON.stringify({
        user: { ...state.user, token: "***" }, // 隐藏敏感信息
        view: state.view,
        network: state.network
    }));
}

// 初始化
if (typeof window !== "undefined") {
    initUserState();
}

// 默认导出
export default {
    // 事件
    eventBus,
    EVENTS,
    
    // 用户
    getUser,
    setUser,
    updateUser,
    isLoggedIn,
    getToken,
    logout,
    
    // 视图
    getCurrentTab,
    setCurrentTab,
    getCurrentSort,
    setCurrentSort,
    getSearchKeyword,
    setSearchKeyword,
    isLoading,
    setLoading,
    
    // 网络
    isOnline,
    setNetworkStatus,
    isCloudReachable,
    markCloudDown,
    markCloudUp,
    
    // 缓存
    setCacheData,
    getCacheData,
    clearCache,
    
    // 调试
    getState
};
