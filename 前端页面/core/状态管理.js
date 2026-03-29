// 前端页面/core/状态管理.js
// ==========================================
// 🏪 全局状态管理中心
// ==========================================
// 作用：集中管理应用状态，提供响应式更新和事件通知
// 关联文件：
//   - 类型定义.js (类型定义)
//   - 所有需要共享状态的组件
//   - 顶部导航组件.js (用户登录状态)
//   - 侧边栏主程序.js (当前视图状态)
// ==========================================
// 🏗️ P2架构优化：轻量级状态管理
// 🏗️ P2质量优化：JSDoc 类型注释
// ==========================================

/**
 * @typedef {import('./类型定义.js').UserData} UserData
 * @typedef {import('./类型定义.js').UserSession} UserSession
 * @typedef {import('./类型定义.js').WalletData} WalletData
 */

import { CACHE } from "./全局配置.js";


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
    
    // 网络状态
    network: {
        isOnline: navigator.onLine,
        lastSyncTime: null
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
 * 初始化用户状态（从本地存储恢复）
 */
export function initUserState() {
    try {
        // 尝试从 localStorage 恢复
        const userStr = localStorage.getItem(CACHE.LEGACY_KEYS.USER);
        const token = localStorage.getItem(CACHE.LEGACY_KEYS.TOKEN);
        
        if (userStr && token) {
            const userData = JSON.parse(userStr);
            state.user = {
                isLoggedIn: true,
                account: userData.account,
                name: userData.name,
                avatar: userData.avatar || userData.avatarDataUrl,
                token: token,
                wallet: null
            };
        } else {
            // 尝试从 sessionStorage 恢复
            const sessionUserStr = sessionStorage.getItem(CACHE.LEGACY_KEYS.USER);
            const sessionToken = sessionStorage.getItem(CACHE.LEGACY_KEYS.TOKEN);
            
            if (sessionUserStr && sessionToken) {
                const userData = JSON.parse(sessionUserStr);
                state.user = {
                    isLoggedIn: true,
                    account: userData.account,
                    name: userData.name,
                    avatar: userData.avatar || userData.avatarDataUrl,
                    token: sessionToken,
                    wallet: null
                };
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
    state.user = {
        isLoggedIn: true,
        account: userData.account,
        name: userData.name,
        avatar: userData.avatar || userData.avatarDataUrl,
        token: token,
        wallet: null
    };
    
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
    
    // 清除存储
    localStorage.removeItem(CACHE.LEGACY_KEYS.USER);
    localStorage.removeItem(CACHE.LEGACY_KEYS.TOKEN);
    sessionStorage.removeItem(CACHE.LEGACY_KEYS.USER);
    sessionStorage.removeItem(CACHE.LEGACY_KEYS.TOKEN);
    
    eventBus.emit(EVENTS.USER_LOGOUT);
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

/**
 * 更新网络状态
 * @param {boolean} online - 是否在线
 */
export function setNetworkStatus(online) {
    const wasOnline = state.network.isOnline;
    state.network.isOnline = online;
    
    if (wasOnline !== online) {
        eventBus.emit(EVENTS.NETWORK_CHANGE, { online });
    }
}

/**
 * 检查是否在线
 * @returns {boolean}
 */
export function isOnline() {
    return state.network.isOnline;
}

// 自动监听网络状态
if (typeof window !== "undefined") {
    window.addEventListener("online", () => setNetworkStatus(true));
    window.addEventListener("offline", () => setNetworkStatus(false));
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
    
    // 缓存
    setCacheData,
    getCacheData,
    clearCache,
    
    // 调试
    getState
};
