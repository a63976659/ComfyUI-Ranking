// 前端页面/core/全局配置.js
// ==========================================
// ⚙️ 全局配置中心
// ==========================================
// 作用：集中管理所有配置常量，便于维护和修改
// 关联文件：
//   - 网络请求API.js (API基础地址)
//   - 性能优化工具.js (缓存配置)
//   - 侧边栏数据引擎.js (分页配置)
//   - 所有业务组件
// ==========================================
// 🏗️ P2架构优化：配置集中化
// 🏗️ P2质量优化：JSDoc 类型注释
// ==========================================


// ==========================================
// 🌐 API 配置
// ==========================================

/** @type {{ BASE_URL: string, TIMEOUT: number, MAX_RETRIES: number, RETRY_DELAY: number }} */
export const API = {
    // 云端 API 基础地址
    BASE_URL: "https://zhiwei666-comfyui-ranking-api.hf.space",
    
    // 请求超时时间（毫秒）
    TIMEOUT: 30000,
    
    // 重试次数
    MAX_RETRIES: 3,
    
    // 重试间隔（毫秒）
    RETRY_DELAY: 1000
};


// ==========================================
// 🔐 管理员配置 (P0安全修复：管理员账号配置化)
// ==========================================
// 注意：前端仅用于UI显示控制，后端从环境变量 ADMIN_ACCOUNTS 读取
// 修改此处需同步修改云端环境变量
export const ADMIN_ACCOUNTS = new Set(["123456", "888888"]);

/**
 * 检查账号是否为管理员
 * @param {string} account - 用户账号
 * @returns {boolean}
 */
export function isAdmin(account) {
    return ADMIN_ACCOUNTS.has(account);
}


// ==========================================
// 💾 缓存配置
// ==========================================
export const CACHE = {
    // 缓存键前缀
    PREFIX: "ComfyRanking_",
    
    // 默认缓存时间（毫秒）
    DEFAULT_TTL: 2 * 60 * 60 * 1000,  // 2小时
    
    // 各类数据缓存时间
    TTL: {
        LIST_DATA: 5 * 60 * 1000,      // 列表数据：5分钟
        USER_PROFILE: 2 * 60 * 1000,   // 用户资料：2分钟
        WALLET: 30 * 1000,              // 钱包数据：30秒
        CREATORS: 5 * 60 * 1000,        // 创作者列表：5分钟
        CHAT_HISTORY: 60 * 1000         // 聊天记录：1分钟
    },
    
    // 内存缓存最大条目数
    MAX_MEMORY_ITEMS: 100,
    
    // localStorage 键名（旧版兼容）
    LEGACY_KEYS: {
        USER: "ComfyCommunity_User",
        TOKEN: "ComfyCommunity_Token",
        LIST_CACHE: "ComfyCommunity_ListCache",
        PROFILE_CACHE: "ComfyCommunity_ProfileCache",
        CHAT_HISTORY: "ComfyCommunity_ChatHistory"
    },
    
    // 本地背景存储键（不上传云端）
    LOCAL_KEYS: {
        SIDEBAR_BACKGROUND: "ComfyRanking_SidebarBackground",      // 工具背景图 Base64
        PROFILE_BANNER_CACHE: "ComfyRanking_ProfileBannerCache",   // 个人资料背景图本地缓存
        ACQUIRED_ITEMS: "ComfyRanking_AcquiredItems",              // 已获取的资源记录
        // 🚀 新增：私信和通知本地缓存
        NOTIFICATIONS: "ComfyRanking_Notifications",               // 通知消息缓存
        CHAT_LIST: "ComfyRanking_ChatList",                        // 对话列表缓存
        CHAT_HISTORY_PREFIX: "ComfyRanking_ChatHistory_",          // 聊天记录前缀
        NOTIF_CLEAR_TIME: "ComfyRanking_NotifClearTime",           // 通知清空时间戳
        CHAT_CLEAR_PREFIX: "ComfyRanking_ChatCleared_"             // 聊天清空时间戳前缀
    },
    
    // 🚀 新增：消息轮询配置
    MESSAGE_POLL: {
        INTERVAL: 30 * 1000,     // 轮询间隔：30秒
        ENABLED: true             // 是否启用定时检查
    }
};


// ==========================================
// 📜 分页配置
// ==========================================
export const PAGINATION = {
    // 工具/应用每页数量
    ITEMS_PAGE_SIZE: 20,
    
    // 创作者每页数量
    CREATORS_PAGE_SIZE: 12,
    
    // 评论每页数量
    COMMENTS_PAGE_SIZE: 10,
    
    // 消息每页数量
    MESSAGES_PAGE_SIZE: 20,
    
    // 滚动加载触发阈值（距底部像素）
    SCROLL_THRESHOLD: 300,
    
    // 防抖延迟（毫秒）
    DEBOUNCE_DELAY: 100
};


// ==========================================
// 💰 打赏等级配置
// ==========================================
export const TIP_LEVELS = {
    // 每颗星星需要的积分
    POINTS_PER_STAR: 100,
    
    // 每个月亮需要的星星数
    STARS_PER_MOON: 5,
    
    // 每个太阳需要的月亮数
    MOONS_PER_SUN: 5,
    
    // 最高等级太阳数
    MAX_SUNS: 9,
    
    // 最高积分（9太阳 = 22500积分）
    MAX_POINTS: 22500,
    
    // 等级图标
    ICONS: {
        STAR: "⭐",
        MOON: "🌙",
        SUN: "☀️",
        CROWN: "👑"
    },
    
    // 等级称号
    TITLES: {
        MAX_LEVEL: "👑 至尊赞助者",
        HIGH_SUN: "超级赞助者",
        LOW_SUN: "黄金赞助者",
        HIGH_MOON: "白银赞助者",
        LOW_MOON: "青铜赞助者",
        HIGH_STAR: "热心粉丝",
        DEFAULT: "支持者"
    }
};


// ==========================================
// 🎨 UI 配置
// ==========================================
export const UI = {
    // Toast 消息配置
    TOAST: {
        DURATION: 3000,           // 显示时长（毫秒）
        MAX_VISIBLE: 3,           // 最大同时显示数量
        POSITION: "top-center"    // 位置
    },
    
    // 动画配置
    ANIMATION: {
        DURATION_FAST: 150,
        DURATION_NORMAL: 300,
        DURATION_SLOW: 500,
        EASING: "cubic-bezier(0.25, 0.8, 0.25, 1)"
    },
    
    // 颜色主题
    COLORS: {
        PRIMARY: "#2196F3",
        SUCCESS: "#4CAF50",
        WARNING: "#FF9800",
        ERROR: "#F44336",
        INFO: "#2196F3",
        TIP: "#E91E63",
        
        // 深色主题背景
        BG_DARK: "#1e1e1e",
        BG_CARD: "#2b2b2b",
        BG_INPUT: "#333",
        
        // 边框
        BORDER: "#444",
        BORDER_LIGHT: "#555"
    },
    
    // 图片占位图
    PLACEHOLDERS: {
        AVATAR: "https://via.placeholder.com/150",
        COVER: "https://via.placeholder.com/400x260",
        LOADING: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%231a1a1a' width='100' height='100'/%3E%3C/svg%3E"
    }
};


// ==========================================
// 📝 表单验证配置
// ==========================================
export const VALIDATION = {
    // 账号规则
    ACCOUNT: {
        MIN_LENGTH: 6,
        MAX_LENGTH: 20,
        PATTERN: /^[a-zA-Z0-9_]{6,20}$/,
        MESSAGE: "账号仅支持6-20位字母、数字、下划线"
    },
    
    // 密码规则
    PASSWORD: {
        MIN_LENGTH: 6,
        PATTERN: /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}$/,
        MESSAGE: "密码至少6位，支持字母、数字和常见特殊字符"
    },
    
    // 昵称规则
    NAME: {
        MIN_LENGTH: 1,
        MAX_LENGTH: 20,
        MESSAGE: "昵称长度1-20个字符"
    },
    
    // 个人介绍规则
    INTRO: {
        MAX_LENGTH: 100,
        MESSAGE: "个人介绍不能超过100字"
    },
    
    // 验证码规则
    VERIFY_CODE: {
        LENGTH: 6,
        PATTERN: /^\d{6}$/,
        EXPIRE_SECONDS: 600,
        MESSAGE: "请输入6位数字验证码"
    }
};


// ==========================================
// 🔧 功能开关
// ==========================================
export const FEATURES = {
    // 是否启用调试模式
    DEBUG: false,
    
    // 是否启用性能监控
    PERFORMANCE_MONITOR: false,
    
    // 是否启用离线模式提示
    OFFLINE_DETECTION: true,
    
    // 是否启用图片懒加载
    LAZY_LOAD_IMAGES: true,
    
    // 是否启用分页加载
    PAGINATION_ENABLED: true,
    
    // 是否启用请求缓存
    REQUEST_CACHE: true,
    
    // 是否启用骨架屏
    SKELETON_LOADING: true
};


// ==========================================
// 📊 统计埋点配置（预留）
// ==========================================
export const ANALYTICS = {
    // 是否启用统计
    ENABLED: false,
    
    // 统计服务地址
    ENDPOINT: "",
    
    // 采样率（0-1）
    SAMPLE_RATE: 1.0
};


// ==========================================
// 🔗 外部链接
// ==========================================
export const LINKS = {
    // GitHub 仓库
    GITHUB_REPO: "https://github.com/ZHIWEI666/ComfyUI-Ranking",
    
    // 文档地址
    DOCS: "",
    
    // 反馈地址
    FEEDBACK: ""
};


// ==========================================
// 🛠️ 辅助函数
// ==========================================

/**
 * 获取完整的 API 地址
 * @param {string} endpoint - API 端点
 * @returns {string}
 */
export function getApiUrl(endpoint) {
    return `${API.BASE_URL}${endpoint}`;
}

/**
 * 获取当前登录用户账号
 * @returns {string|null}
 */
export function getCurrentAccount() {
    try {
        const userStr = localStorage.getItem(CACHE.LEGACY_KEYS.USER) || sessionStorage.getItem(CACHE.LEGACY_KEYS.USER);
        if (userStr) {
            const userData = JSON.parse(userStr);
            return userData?.user?.account || null;
        }
    } catch (e) {
        console.warn("获取当前账号失败:", e);
    }
    return null;
}

/**
 * 获取账号区分的界面背景图存储键
 * @param {string} [account] - 账号，不传则自动获取当前登录账号
 * @returns {string}
 */
export function getBackgroundKey(account) {
    const acc = account || getCurrentAccount();
    return acc 
        ? `${CACHE.LOCAL_KEYS.SIDEBAR_BACKGROUND}_${acc}` 
        : CACHE.LOCAL_KEYS.SIDEBAR_BACKGROUND;
}

/**
 * 获取账号区分的个人资料卡背景缓存键
 * @param {string} [account] - 账号，不传则自动获取当前登录账号
 * @returns {string}
 */
export function getBannerCacheKey(account) {
    const acc = account || getCurrentAccount();
    return acc 
        ? `${CACHE.LOCAL_KEYS.PROFILE_BANNER_CACHE}_${acc}` 
        : CACHE.LOCAL_KEYS.PROFILE_BANNER_CACHE;
}

/**
 * 获取缓存键（带前缀）
 * @param {string} key - 缓存键
 * @returns {string}
 */
export function getCacheKey(key) {
    return `${CACHE.PREFIX}${key}`;
}

/**
 * 检查功能是否启用
 * @param {string} feature - 功能名
 * @returns {boolean}
 */
export function isFeatureEnabled(feature) {
    return FEATURES[feature] === true;
}

/**
 * 获取打赏等级配置
 * @returns {Object}
 */
export function getTipLevelConfig() {
    return { ...TIP_LEVELS };
}


// ==========================================
// 📦 导出默认配置对象
// ==========================================
export default {
    API,
    CACHE,
    PAGINATION,
    TIP_LEVELS,
    UI,
    VALIDATION,
    FEATURES,
    ANALYTICS,
    LINKS,
    getApiUrl,
    getCacheKey,
    isFeatureEnabled,
    getCurrentAccount,
    getBackgroundKey,
    getBannerCacheKey
};
