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

/** @type {{ BASE_URL: string, TIMEOUT: number, MAX_RETRIES: number, RETRY_DELAY: number, LIST_RETRIES: number, SEARCH_TIMEOUT: number, SEARCH_RETRIES: number, BACKGROUND_TIMEOUT: number, BACKGROUND_RETRIES: number, CLOUD_DOWN_COOLDOWN: number, SEARCH_COMPONENT_ID: string }} */
export const API = {
    // 云端 API 基础地址
    BASE_URL: "https://zhiwei666-comfyui-ranking-api.hf.space",
    
    // 请求超时时间（毫秒）
    TIMEOUT: 30000,
    
    // GET 请求重试次数（实际尝试 MAX_RETRIES + 1 次）
    // 🔧 修复：此前本值为 3 且全库无人读取，真正的重试次数硬编码在 网络请求_基础设施.js 中为 2，
    // 现改为由基础设施读取本配置；取值 2 以保持既有的「共 3 次尝试」行为不变
    MAX_RETRIES: 2,
    
    // 重试间隔（毫秒，指数退避基数：1s、2s、4s…）
    RETRY_DELAY: 1000,
    
    // 🐢 弱网预算分级（仅作用于 GET，由 网络请求_基础设施.js 按 endpoint 路径精确匹配）
    // 默认预算下弱网一次列表请求最长要烧 3×30s + 1s + 2s = 93s，期间用户只能盯骨架屏。
    // 列表类：首屏已可由本地缓存先行上屏（见 侧边栏数据引擎.js），且列表往往是会话的第一个请求、
    // 可能撞上 HF Space 冷启动（本项目无预热机制），故只砍掉一次冗余重试、保留 30s 单次超时，
    // 93s → 61s，冷启动仍有机会在前两次尝试内完成
    LIST_RETRIES: 1,
    // 搜索类：必然发生在列表已加载之后（空间已被唤醒），可放心收紧，93s → 10s×2 + 1s = 21s
    SEARCH_TIMEOUT: 10000,
    SEARCH_RETRIES: 1,

    // 🐢 后台补新预算（仅作用于 GET，由 网络请求_基础设施.js 按「本地是否已有可兜底数据」判定）
    // 七大列表视图都是「本地数据先上屏 → 再发请求补新」，此时界面上已经有内容，
    // 这次请求纯属后台行为；它每多挂 1 秒就多占 1 个并发额度（全局仅 6 个），
    // 云端不通时会把前台请求（详情页、点赞、轮询）全部挤到排队，表现为「切哪个界面都要等」。
    // 故一旦本地已有该请求的缓存（含过期），单次超时压到 10s 且不再重试，最坏耗时 10s
    BACKGROUND_TIMEOUT: 10000,
    BACKGROUND_RETRIES: 0,

    // ☁️ 云端不可达冷却（消费方见 状态管理.js 的「云端可达性」段落）
    // navigator.onLine 只反映本机网卡，云端单独不可达（HF Space 宕机/冷启动、DNS 污染、被墙）
    // 时它仍为 true，于是每个界面、每次轮询都要从头烧一遍完整重试预算，且互不共享失败结论。
    // 首次确证云端不可达后进入冷却：冷却期内所有 GET 一律不联网（有缓存直接返回、无缓存立即失败），
    // 并发额度全部让给前台。被动探测——冷却一过，下一个真实请求充当探针；
    // 期间任意一次成功响应（含 POST/PUT/DELETE）立即清零，不需等到冷却结束
    CLOUD_DOWN_COOLDOWN: 60 * 1000,
    
    // 🔍 创作者搜索请求的取消分组 ID
    // 用户在搜索框继续输入时，侧边栏数据引擎.js 据此撤销上一次仍在途的搜索请求。
    // 不撤销的话，作废请求会持续占用并发额度（最多 6 个）与超时预算，
    // 把最新那次搜索挤到后面排队。仅搜索请求归入本分组，不影响其它任何请求
    SEARCH_COMPONENT_ID: "sidebar-search"
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
        DETAIL_DATA: 3 * 60 * 1000,    // 详情数据：3分钟
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
        BG_DARK: "var(--comfy-menu-bg)",
        BG_CARD: "var(--comfy-input-bg)",
        BG_INPUT: "var(--comfy-input-bg)",
        
        // 边框
        BORDER: "#444",
        BORDER_LIGHT: "#555"
    },
    
    // 图片占位图（🚀 关键修复：全部改为内联 SVG，避免外部网络请求）
    PLACEHOLDERS: {
        // 头像占位图（👤 图标）
        AVATAR: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect fill='%23333' width='150' height='150' rx='75'/%3E%3Ctext x='75' y='100' text-anchor='middle' fill='%23888' font-size='60'%3E👤%3C/text%3E%3C/svg%3E`,
        // 封面占位图（🖼️ 图标）
        COVER: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260'%3E%3Crect fill='%23222' width='400' height='260'/%3E%3Ctext x='200' y='140' text-anchor='middle' fill='%23666' font-size='48'%3E🖼️%3C/text%3E%3C/svg%3E`,
        // 小头像占位图（用于列表）
        AVATAR_SMALL: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect fill='%23333' width='40' height='40' rx='20'/%3E%3Ctext x='20' y='26' text-anchor='middle' fill='%23888' font-size='16'%3E👤%3C/text%3E%3C/svg%3E`,
        // 加载占位图
        LOADING: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%231a1a1a' width='100' height='100'/%3E%3C/svg%3E"
    }
};

// 🚀 导出 PLACEHOLDERS 便于直接使用
export const PLACEHOLDERS = UI.PLACEHOLDERS;


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
// 🌐 运行环境开关
// ==========================================
// 移动端网页版运行时开关：Web 引导页（云端Space代码/移动端网页/index.html）
// 在模块求值前置位 window.__RANKING_WEB_MODE__ = true；ComfyUI 环境不置位，恒为 false，
// 本地侧边栏行为零变化。所有「仅本地可用」功能的门控均以此为准
export const IS_WEB_MODE = typeof window !== "undefined" && window.__RANKING_WEB_MODE__ === true;


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
    GITHUB_REPO: "https://github.com/a63976659/ComfyUI-Ranking",
    
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
// 🚀 SWR 头像缓存工具（跨组件共享）
// ==========================================
// 实现原理：
//   1. 从 localStorage 读取缓存，0延迟渲染
//   2. 后台静默校对云端数据
//   3. 有更新时自动刷新 DOM
// 缓存键：ComfyCommunity_ProfileCache_{account}

const PROFILE_CACHE_PREFIX = "ComfyCommunity_ProfileCache_";
const _pendingProfileRequests = new Map();  // 防止 N+1 并发请求
const PENDING_TIMEOUT = 30000;  // 挂起请求超时清理时间（毫秒）

// ==========================================
// 🔒 HTML 转义（底层公共工具）
// ==========================================
// 放在本文件（零依赖的底层模块）而非 components/互动工具函数.js，是因为
// UI交互提示组件.js 与 打赏等级工具.js 都需要它，而互动工具函数.js 反向依赖这两者
// （导入 showToast、re-export renderTipBoardHTML），从那里导入会形成循环依赖。
// 互动工具函数.js 仍以 re-export 方式对外暴露同名函数，既有调用方无需改动。

/**
 * HTML转义（统一版：各组件局部副本已归一到此）
 * @param {*} str - 原始字符串（非字符串会先强制转换，兼容数字等入参）
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(str) {
    if (str === null || str === undefined || str === "") return "";
    return String(str).replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

/** 统一字段映射：将后端 avatarDataUrl 映射为前端 avatar */
function _mapAvatarField(profile) {
    if (profile && profile.avatarDataUrl && !profile.avatar) {
        profile.avatar = profile.avatarDataUrl;
    }
}

/**
 * 🚀 获取缓存的用户资料（同步）
 * @param {string} account - 用户账号
 * @returns {Object|null} 缓存的用户资料
 */
export function getCachedProfile(account) {
    if (!account) return null;
    try {
        const cached = localStorage.getItem(PROFILE_CACHE_PREFIX + account);
        if (!cached) return null;
        const profile = JSON.parse(cached);
        _mapAvatarField(profile);
        return profile;
    } catch {
        return null;
    }
}

/**
 * 🚀 保存用户资料到缓存
 * @param {string} account - 用户账号
 * @param {Object} profile - 用户资料
 */
export function setCachedProfile(account, profile) {
    if (!account || !profile) return;
    try {
        localStorage.setItem(PROFILE_CACHE_PREFIX + account, JSON.stringify(profile));
    } catch {}
}

/**
 * 🚀 SWR 模式获取用户资料（先返回缓存，后台校对）
 * @param {string} account - 用户账号
 * @param {Function} apiFn - API 调用函数 (account) => Promise<{data: profile}>
 * @param {Function} onUpdate - 数据更新时的回调 (profile) => void
 * @returns {Object|null} 初始缓存数据
 */
export function getProfileWithSWR(account, apiFn, onUpdate) {
    if (!account) return null;
    
    // 第一轨：同步返回缓存
    const cached = getCachedProfile(account);
    
    // 第二轨：异步静默校对（防止 N+1 并发）
    if (!_pendingProfileRequests.has(account)) {
        const promise = apiFn(account).then(res => {
            const profile = res.data || res;
            _mapAvatarField(profile);
            setCachedProfile(account, profile);
            if (onUpdate && typeof onUpdate === 'function') {
                onUpdate(profile);
            }
            return profile;
        }).catch(() => null).finally(() => {
            _pendingProfileRequests.delete(account);
        });
        _pendingProfileRequests.set(account, promise);
        // ⏱️ 超时自动清理：防止请求永不完成导致内存泄漏
        setTimeout(() => {
            if (_pendingProfileRequests.has(account)) {
                _pendingProfileRequests.delete(account);
            }
        }, PENDING_TIMEOUT);
    }
    
    return cached;
}

/**
 * 🚀 渲染带 SWR 缓存的头像+名称 HTML
 * @param {Object} options
 * @param {string} options.account - 用户账号
 * @param {string} options.fallbackAvatar - 备用头像 URL（从原始数据中获取）
 * @param {string} options.fallbackName - 备用名称
 * @param {number} options.avatarSize - 头像尺寸 (px)
 * @param {Function} options.apiFn - API 调用函数
 * @param {string} options.containerId - 唯一容器 ID（用于 DOM 更新）
 * @returns {string} HTML 字符串
 */
export function renderAvatarWithSWR(options) {
    const { account, fallbackAvatar, fallbackName, avatarSize = 24, apiFn, containerId } = options;
    
    // 从缓存获取
    const cached = getCachedProfile(account);
    const avatar = cached?.avatar || cached?.avatarDataUrl || fallbackAvatar || '';
    const name = cached?.name || fallbackName || account || '';
    
    // 后台静默校对并更新 DOM
    if (apiFn && containerId) {
        setTimeout(() => {
            getProfileWithSWR(account, apiFn, (profile) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                
                const avatarImg = container.querySelector('.swr-avatar');
                const nameSpan = container.querySelector('.swr-name');
                
                if (avatarImg && profile.avatar) {
                    avatarImg.src = profile.avatar;
                }
                if (nameSpan && profile.name) {
                    nameSpan.textContent = profile.name;
                }
            });
        }, 0);
    }
    
    // 生成初始 HTML（无头像时显示首字母背景）
    // 🔒 XSS防护：avatar/name/initial 均来自用户可修改的资料（昵称首字母可能是 < ），
    // 写入 HTML 前必须转义；上方 SWR 刷新路径用的是 .src / .textContent，本身就是安全的。
    const initial = (name || account || 'U')[0].toUpperCase();
    const avatarHtml = avatar 
        ? `<img class="swr-avatar" src="${escapeHtml(avatar)}" style="width: ${avatarSize}px; height: ${avatarSize}px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #333;">` 
        : `<div class="swr-avatar" style="width: ${avatarSize}px; height: ${avatarSize}px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: ${Math.floor(avatarSize * 0.5)}px; font-weight: bold; flex-shrink: 0;">${escapeHtml(initial)}</div>`;
    
    return `<span id="${escapeHtml(containerId)}" style="display: inline-flex; align-items: center; gap: 6px;">${avatarHtml}<span class="swr-name">${escapeHtml(name)}</span></span>`;
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
    IS_WEB_MODE,
    ANALYTICS,
    LINKS,
    getApiUrl,
    getCacheKey,
    isFeatureEnabled,
    getCurrentAccount,
    getBackgroundKey,
    getBannerCacheKey,
    getCachedProfile,
    setCachedProfile,
    getProfileWithSWR,
    renderAvatarWithSWR
};
