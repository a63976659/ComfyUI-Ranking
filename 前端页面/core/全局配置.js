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

/** @type {{ BASE_URL: string, TIMEOUT: number, VIDEO_UPLOAD_TIMEOUT: number, VIDEO_UPLOAD_RESPONSE_MAX_CHARS: number, LOCAL_CACHE_STATS_TIMEOUT: number, LOCAL_CACHE_CLEAR_TIMEOUT: number, LOCAL_CACHE_RESPONSE_MAX_BYTES: number, SSE_MAX_RESPONSE_BYTES: number, SSE_MAX_LINE_BYTES: number, SSE_MAX_LINES: number, SSE_YIELD_LINES: number, SSE_YIELD_BYTES: number, SSE_YIELD_CHUNKS: number, MAX_RETRIES: number, RETRY_DELAY: number, LIST_RETRIES: number, SEARCH_TIMEOUT: number, SEARCH_RETRIES: number, PROFILE_RESOURCE_TIMEOUT: number, CREATOR_CHART_SCRIPT_URL: string, BACKGROUND_TIMEOUT: number, BANNER_IMAGE_TIMEOUT: number, BACKGROUND_RETRIES: number, WORKFLOW_DOWNLOAD_TIMEOUT: number, CLOUD_DOWN_COOLDOWN: number, SEARCH_COMPONENT_ID: string, IMAGE_PROXY_PATH: string, PROFILE_MEDIA_URL_MAX_BYTES: number, LOCAL_IMAGE_PROXY_PREFIX: string, COMPLETE_IMAGE_QUERY_SUFFIX: string, PRIVATE_GET_PATTERNS: RegExp[], PUBLIC_CONDITIONAL_GET_PATHS: string[], CONDITIONAL_ETAG_PATTERN: RegExp, REQUEST_ID_HEADER: string, REQUEST_ID_PATTERN: RegExp, ENDPOINT_ERROR_SCOPE_HEADER: string, ENDPOINT_ERROR_SCOPE_VALUE: string, REQUEST_BODY_ERRORS: Record<string, { status: number, msgKey: string }> }} */
export const API = {
    REQUEST_ID_HEADER: "X-Ranking-Request-Id",
    REQUEST_ID_PATTERN: /^(?:[a-f0-9]{32}|ERR_[0-9]{10,13}_[a-f0-9]{1,8})$/,
    ENDPOINT_ERROR_SCOPE_HEADER: "X-Ranking-Error-Scope",
    ENDPOINT_ERROR_SCOPE_VALUE: "endpoint",
    REQUEST_BODY_ERRORS: {
        request_body_invalid: { status: 400, msgKey: 'feedback.invalid_request_data' },
        request_body_disconnected: { status: 400, msgKey: 'feedback.network_unavailable' },
        request_body_too_large: { status: 413, msgKey: 'feedback.request_too_large' },
        request_body_timeout: { status: 408, msgKey: 'feedback.request_receive_timeout' },
        request_body_busy: { status: 429, msgKey: 'feedback.request_busy' },
        request_body_encoding: { status: 415, msgKey: 'feedback.request_encoding_unsupported' },
    },
    // 仅公开榜单使用由正文派生的条件验证器，私有响应仍禁止留存。
    PUBLIC_CONDITIONAL_GET_PATHS: ['/api/items', '/api/creators', '/api/creators/search', '/api/posts', '/api/prompts', '/api/tasks'],
    CONDITIONAL_ETAG_PATTERN: /^W\/"rk-[a-f0-9]{64}"$/,

    // 云端 API 基础地址
    BASE_URL: "https://zhiwei666-comfyui-ranking-api.hf.space",
    
    // 请求超时时间（毫秒）
    TIMEOUT: 30000,
    VIDEO_UPLOAD_TIMEOUT: 300000,
    VIDEO_UPLOAD_RESPONSE_MAX_CHARS: 65536,
    LOCAL_CACHE_STATS_TIMEOUT: 10000,
    LOCAL_CACHE_CLEAR_TIMEOUT: 60000,
    LOCAL_CACHE_RESPONSE_MAX_BYTES: 8192,
    // 工作流终态编码上限为512 MiB，另保留64 MiB进度数据；行预算包含data前缀。
    SSE_MAX_RESPONSE_BYTES: 576 * 1024 * 1024,
    SSE_MAX_LINE_BYTES: 512 * 1024 * 1024,
    SSE_MAX_LINES: 262144,
    SSE_YIELD_LINES: 256,
    SSE_YIELD_BYTES: 1024 * 1024,
    SSE_YIELD_CHUNKS: 256,

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
    PROFILE_RESOURCE_TIMEOUT: 5000,
    CREATOR_CHART_SCRIPT_URL: "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js",

    // 🐢 后台补新预算（仅作用于 GET，由 网络请求_基础设施.js 按「本地是否已有可兜底数据」判定）
    // 七大列表视图都是「本地数据先上屏 → 再发请求补新」，此时界面上已经有内容，
    // 这次请求纯属后台行为；它每多挂 1 秒就多占 1 个并发额度（全局仅 6 个），
    // 云端不通时会把前台请求（详情页、点赞、轮询）全部挤到排队，表现为「切哪个界面都要等」。
    // 故一旦本地已有该请求的缓存（含过期），单次超时压到 10s 且不再重试，最坏耗时 10s
    BACKGROUND_TIMEOUT: 10000,
    BANNER_IMAGE_TIMEOUT: 75000,
    WORKFLOW_DOWNLOAD_TIMEOUT: 120000,  // 工作流流式下载预算（2 分钟）
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
    SEARCH_COMPONENT_ID: "sidebar-search",
    // 上传相对路径的云端图片读取入口。
    IMAGE_PROXY_PATH: "/api/image_proxy",
    PROFILE_MEDIA_URL_MAX_BYTES: 16384,
    // 本地广告预载要求真实图片，熔断占位图不能作为下载成功。
    LOCAL_IMAGE_PROXY_PREFIX: "/community_hub/image?url=",
    COMPLETE_IMAGE_QUERY_SUFFIX: "&require_complete=1",
    // 身份相关或私有 GET 禁止通用响应缓存；公开列表仍使用原缓存策略。
    PRIVATE_GET_PATTERNS: [
        /^\/api\/(wallet|messages|chats|admin|disputes|users)(?:\/|$)/,
        /^\/api\/my-(posts|prompts|tasks)(?:\/|$)/,
        /^\/api\/(tasks|prompts)\/[^/]+$/
    ]
};


export const LOCAL_PERFORMANCE = Object.freeze({
    MAX_ENDPOINT_CHARS: 4096,
    MAX_COUNT: 1000000,
    MAX_DURATION_MS: 600000,
    ITEM_CATEGORIES: Object.freeze({ tool: 'tools', skill: 'skills', app: 'apps', recommend: 'recommends' }),
    LIST_CATEGORIES: Object.freeze({ '/api/creators': 'creators', '/api/creators/search': 'creators', '/api/tasks': 'tasks', '/api/posts': 'posts', '/api/prompts': 'prompts' }),
    LABELS: Object.freeze({ tools: 'nav.tools', skills: 'nav.skills', apps: 'nav.apps', recommends: 'nav.recommends', creators: 'nav.creators', tasks: 'nav.tasks', posts: 'nav.posts', prompts: 'nav.prompts' })
});

export const LOCAL_INSTALL_DIRECTORY = Object.freeze({
    PATH: '/community_hub/open_install_directory',
    TIMEOUT: 25000,
    RESPONSE_MAX_BYTES: 8192
});

export const SKILL_INSTALL = Object.freeze({
    PATH: '/community_hub/skill_install',
    PREFLIGHT_TIMEOUT: 30000,
    CONTROL_TIMEOUT: 45000,
    RESULT_TIMEOUT: 5000,
    STREAM_TIMEOUT: 1200000,
    RESPONSE_MAX_BYTES: 1024 * 1024,
    PATH_MAX_BYTES: 32768,
    MAX_DIRECTORIES: 128,
    MAX_ITEMS: 1,
    MODAL_WIDTH: '640px'
});

export const CHART_LIFECYCLE = Object.freeze({
    WIDTH_WAIT_TIMEOUT: 5000,
    RESIZE_DELAY: 300
});

// 发布视频的本地读取预算，不改变云端上传额度。
export const LAZY_IMAGES = Object.freeze({
    ROOT_MARGIN: "200px 0px",
    THRESHOLD: 0.01,
    MOUNT_TIMEOUT: 30000,
    READ_TIMEOUT: 30000
});

export const PUBLISH_MEDIA_LIMITS = Object.freeze({
    MAX_IMAGES: 9,
    IMAGE_MAX_EDGE: 1920,
    IMAGE_QUALITY: 0.85,
    POST_AUDIO_UPLOAD_TYPE: 'post_music_audio',
    POST_AUDIO_MAX_BYTES: 100 * 1024 * 1024,
    POST_AUDIO_EXTENSIONS: Object.freeze(['mp3', 'wav', 'm4a', 'ogg']),
    VIDEO_MAX_BYTES: 100 * 1024 * 1024,
    VIDEO_MAX_SECONDS: 180,
    VIDEO_METADATA_TIMEOUT: 15000
});

// 上传前处理预算；浏览器解码本身仍由宿主管理。
export const IMAGE_PROCESS = {
    HEADER_BYTES: 256 * 1024,
    MAX_INPUT_BYTES: 50 * 1024 * 1024,
    MAX_PIXELS: 40 * 1024 * 1024,
    MAX_SOURCE_EDGE: 16384,
    MAX_OUTPUT_EDGE: 4096,
    MAX_OUTPUT_BYTES: 5 * 1024 * 1024,
    TIMEOUT: 15000,
    MIN_QUALITY: 0.3,
    QUALITY_STEP: 0.1,
    AVATAR_MAX_BYTES: 2 * 1024 * 1024,
    AVATAR_SIZE: 512
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
export function getSidebarListCacheKey(tab, sort) {
    const list = tab === 'creators' ? 'creators_full' : tab;
    return `ListCache_${list}_${sort}`;
}

const RESOURCE_LIST_PREFIXES = [
    "ListCache_tools_", "ListCache_skills_", "ListCache_apps_", "ListCache_recommends_"
];
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

    // 本插件 localStorage 持久缓存的估算容量上限（不影响用户/会话等其它键）
    MAX_STORAGE_BYTES: 2 * 1024 * 1024,
    
    // localStorage 键名（旧版兼容）
    SESSION_REMEMBER_TTL: 30 * 24 * 60 * 60 * 1000,
    INSTALLED_VERSION_UNCONFIRMED: "__installed_unconfirmed__", // 安装成功但没有实际版本证明
    SESSION_TEMP_TTL: 24 * 60 * 60 * 1000,
    LEGACY_KEYS: {
        USER: "ComfyCommunity_User",
        TOKEN: "ComfyCommunity_Token",
        LIST_CACHE: "ComfyCommunity_ListCache",
        PROFILE_CACHE: "ComfyCommunity_ProfileCache",
        CHAT_HISTORY: "ComfyCommunity_ChatHistory"
    },
    
    // 本地背景存储键（不上传云端）
    LOCAL_KEYS: {
        BANNER_CONFIG: "ComfyRanking_BannerConfig",                // 广告配置持久缓存
        CREATORS_SESSION: "ComfyRanking_CreatorsCache",             // 沿用创作者临时缓存键
        SIDEBAR_BACKGROUND: "ComfyRanking_SidebarBackground",      // 工具背景图 Base64
        PROFILE_BANNER_CACHE: "ComfyRanking_ProfileBannerCache",   // 个人资料背景图本地缓存
        ACQUIRED_ITEMS: "ComfyRanking_AcquiredItems",              // 已获取的资源记录
        PROFILE_LIST_PREFIX: "ProfileList_",                     // 兼容旧个人列表业务键
        INSTALLED_VERSION_PREFIX: "ComfyCommunity_LocalVer_",      // 沿用既有安装版本键
        ITEM_OWNERSHIP_PREFIX: "ItemOwnership_",                  // 缓存管理器业务键前缀
        // 🚀 新增：私信和通知本地缓存
        NOTIFICATIONS: "ComfyRanking_Notifications",               // 通知消息缓存
        CHAT_LIST: "ComfyRanking_ChatList",                        // 对话列表缓存
        CHAT_HISTORY_PREFIX: "ComfyRanking_ChatHistory_",          // 聊天记录前缀
        NOTIF_CLEAR_TIME: "ComfyRanking_NotifClearTime",           // 通知清空时间戳
        CHAT_CLEAR_PREFIX: "ComfyRanking_ChatCleared_"             // 聊天清空时间戳前缀
    },
    
    REFUND_CACHE_PREFIXES: [
        "api_/api/items", "api_/api/creators", "api_/api/wallet",
        ...RESOURCE_LIST_PREFIXES
    ],
    RESOURCE_LIST_PREFIXES,
    CREATOR_DETAILS_CACHE_PREFIX: "api_/api/creators/",
    PUBLIC_LISTS: {
        tasks: { prefix: "TasksCache_", endpoint: "/api/tasks" },
        posts: { prefix: "PostsCache_", endpoint: "/api/posts" },
        prompts: { prefix: "PromptsCache_", endpoint: "/api/prompts" }
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
    SIDEBAR_ITEM_FETCH_LIMIT: 200,
    SIDEBAR_CREATOR_FETCH_LIMIT: 500,
    SIDEBAR_CREATOR_SEARCH_LIMIT: 50,
    PROFILE_USERS_PAGE_SIZE: 20,
    PROFILE_RESOURCE_FETCH_LIMIT: 200,
    
    // 评论每页数量
    COMMENTS_PAGE_SIZE: 10,
    
    // 消息每页数量
    MESSAGES_PAGE_SIZE: 20,
    CHAT_MESSAGES_PAGE_SIZE: 50,
    
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
    INSTALL_SOURCE: Object.freeze({
        MAX_URL_BYTES: 4096,
        CASE_INSENSITIVE_HOSTS: Object.freeze(['github.com'])
    }),
    INSTALL_TRANSFER: Object.freeze({
        MAX_BYTES: 2 * 1024 * 1024 * 1024,
        MAX_RATE: Number.MAX_SAFE_INTEGER,
        BASE: 1024,
        STAGES: Object.freeze(['downloading', 'download_done']),
        UNIT_KEYS: Object.freeze(['install.transfer_b', 'install.transfer_kib', 'install.transfer_mib', 'install.transfer_gib'])
    }),

    CHAT_MAX_MSG_LENGTH: 1000,
    CHAT_TIME_GAP_SECONDS: 5 * 60,
    MAX_DISPUTE_EVIDENCE: 6,
    RECHARGE_POLL_INTERVAL: 3000,
    RECHARGE_POLL_LIMIT: 100,
    RECHARGE_QR_MAX_BYTES: 2048,
    PROFILE_BANNER_CACHE_BYTES: 512 * 1024,
    // 与云端公开版本接口的缺省值一致；用于网络不可用时的本地展示。
    DEFAULT_PROJECT_VERSION: Object.freeze({ stage: "beta", major: 2, minor: 0, patch: 0 }),
    ABOUT: {
        AUTHOR_URL: "https://space.bilibili.com/2114638644",
        AUTHOR_BADGE_URL: "https://img.shields.io/badge/bilibili-猪的飞行梦-00A1D6?logo=bilibili&logoColor=white"
    },
    // Toast 消息配置
    TOAST: {
        OFFSET: 50,
        GAP: 10,
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
        console.warn("获取当前账号失败。");
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
let profileCacheDefault = { readable: true };
const profileCacheStates = new Map();
const profileCacheState = account => profileCacheStates.get(account) || profileCacheDefault;
function rememberProfileCacheState(account, readable) {
    if (!profileCacheStates.has(account) && profileCacheStates.size >= CACHE.MAX_MEMORY_ITEMS) {
        profileCacheStates.clear();
        profileCacheDefault = { readable: false };
        for (const pending of _pendingProfileRequests.values()) {
            clearTimeout(pending.timer);
            pending.listeners.clear();
        }
        _pendingProfileRequests.clear();
    }
    const state = { readable };
    profileCacheStates.set(account, state);
    return state;
}

export function captureProfileRead(account) {
    const state = profileCacheStates.get(account) || rememberProfileCacheState(account, profileCacheDefault.readable);
    return () => profileCacheState(account) === state;
}

export function invalidateCachedProfiles(accounts) {
    for (const account of new Set(accounts)) {
        if (typeof account !== 'string' || !account.trim()) continue;
        rememberProfileCacheState(account, false);
        const pending = _pendingProfileRequests.get(account);
        if (pending) {
            _pendingProfileRequests.delete(account);
            clearTimeout(pending.timer);
            pending.listeners.clear();
        }
        try { localStorage.removeItem(PROFILE_CACHE_PREFIX + account); } catch {}
    }
}

const _pendingProfileRequests = new Map();  // 每账号共享请求与全部订阅者
const PENDING_TIMEOUT = 30000;  // 挂起请求超时清理时间（毫秒）
let nextAvatarRenderId = 0;

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

/** 资料图片只接受明确的图片表示或网络地址，不相对宿主解析业务路径。 */
export function normalizeProfileImageUrl(value, unwrapProxy = false, serviceBaseUrl = API.BASE_URL) {
    if (typeof value !== 'string' || !value || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) return '';
    let source = value;
    let layers = 0;
    while (source.startsWith(API.LOCAL_IMAGE_PROXY_PREFIX)) {
        if (++layers > 10) return '';
        let encoded = source.slice(API.LOCAL_IMAGE_PROXY_PREFIX.length);
        if (encoded.endsWith(API.COMPLETE_IMAGE_QUERY_SUFFIX)) encoded = encoded.slice(0, -API.COMPLETE_IMAGE_QUERY_SUFFIX.length);
        try { source = decodeURIComponent(encoded); } catch (_) { return ''; }
        if (!source || source.trim() !== source || /[\u0000-\u001f\u007f]/.test(source)) return '';
    }
    if (!layers && /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,.+$/i.test(source)) return value;
    if (!layers && /^blob:https?:\/\//i.test(source)) {
        try {
            const blob = new URL(source);
            if (typeof location !== 'undefined' && location.origin && blob.origin !== location.origin) return '';
            return blob.origin === 'null' ? '' : value;
        } catch (_) { return ''; }
    }
    if (!/^https?:\/\//i.test(source) || source.includes('\\')) return '';
    try {
        if (value.length > API.PROFILE_MEDIA_URL_MAX_BYTES
            || encodeURIComponent(value).replace(/%[0-9a-f]{2}/gi, 'x').length > API.PROFILE_MEDIA_URL_MAX_BYTES) return '';
        const url = new URL(source);
        const authority = source.match(/^https?:\/\/([^/?#]*)/i)?.[1];
        if (!authority || authority.includes('@') || authority.includes('%') || authority.endsWith(':') || url.port === '0') return '';
        if (url.username || url.password) return '';
        const host = url.hostname.toLowerCase().replace(/\.$/, '');
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host)
            && authority.replace(/:[0-9]+$/, '').replace(/\.$/, '').toLowerCase() !== host) return '';
        const base = new URL(serviceBaseUrl);
        const baseHost = base.hostname.toLowerCase().replace(/\.$/, '');
        if (host === baseHost) {
            const expectedPath = base.pathname.replace(/\/$/, '') + API.IMAGE_PROXY_PATH;
            const sourcePath = source.slice(source.indexOf('://') + 3 + authority.length).split(/[?#]/, 1)[0] || '/';
            if (url.protocol !== base.protocol || url.port !== base.port || sourcePath !== expectedPath) return '';
            return unwrapProxy ? source : value;
        }
        if (!host.startsWith('[') && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            const labels = host.split('.');
            if (host.length > 253 || labels.length < 2 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
                || /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(labels.at(-1))) return '';
        }
        if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return '';
        if (host.startsWith('[')) {
            if (!/^\[[23][0-9a-f]{0,3}:/i.test(host)) return '';
            const pieces = host.slice(1, -1).split('::');
            const left = pieces[0] ? pieces[0].split(':').map(part => parseInt(part, 16)) : [];
            const right = pieces[1] ? pieces[1].split(':').map(part => parseInt(part, 16)) : [];
            const groups = pieces.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
            const [first, second, third] = groups;
            if (first === 0x2002 || (first === 0x3fff && second < 0x1000) || (first === 0x2001 && second === 0xdb8)) return '';
            if (first === 0x2001 && second < 0x200) {
                const exception = (second === 1 && groups.slice(2, 7).every(part => part === 0) && [1, 2].includes(groups[7]))
                    || second === 3 || (second === 4 && third === 0x112) || (second >= 0x20 && second <= 0x3f);
                if (!exception) return '';
            }
        } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            const rawHost = authority.replace(/:[0-9]+$/, '').replace(/\.$/, '').toLowerCase();
            if (rawHost !== host) return '';
            const [a,b,c,last] = host.split('.').map(Number);
            if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
                || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
                || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19))
                || (a === 192 && b === 0 && ((c === 0 && ![9, 10].includes(last)) || c === 2))
                || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return '';
        }
        return unwrapProxy ? source : value;
    } catch (_) { return ''; }
}

/** 统一字段映射：将后端 avatarDataUrl 映射为前端 avatar */
function _mapAvatarField(profile) {
    if (profile && profile.avatarDataUrl && !profile.avatar) {
        profile.avatar = profile.avatarDataUrl;
    }
}

const PUBLIC_PROFILE_FIELDS = ["account", "name", "avatar", "avatarDataUrl", "intro", "gender", "age",
    "country", "region", "created_at", "followers", "following", "following_count", "privacy", "is_admin", "bannerUrl",
    "receivedLikes", "receivedFavorites", "receivedUses"];
function _publicProfile(profile) {
    const result = Object.fromEntries(PUBLIC_PROFILE_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(profile, key))
        .map(key => [key, ['avatar', 'avatarDataUrl', 'bannerUrl'].includes(key)
            ? normalizeProfileImageUrl(profile[key]) : profile[key]]));
    result.following_count = Number.isSafeInteger(result.following_count) && result.following_count >= 0
        ? result.following_count : (Array.isArray(result.following) ? result.following.length : 0);
    if (result.privacy?.follows === true) result.following = [];
    return result;
}

function _validProfile(profile) {
    return !!profile && typeof profile === 'object' && !Array.isArray(profile)
        && ['name', 'avatar', 'avatarDataUrl'].every(field => profile[field] == null || typeof profile[field] === 'string');
}

/**
 * 🚀 获取缓存的用户资料（同步）
 * @param {string} account - 用户账号
 * @returns {Object|null} 缓存的用户资料
 */
export function getCachedProfile(account) {
    if (!account || !profileCacheState(account).readable) return null;
    try {
        const cached = localStorage.getItem(PROFILE_CACHE_PREFIX + account);
        if (!cached) return null;
        const profile = JSON.parse(cached);
        if (!_validProfile(profile)) return null;
        const publicProfile = _publicProfile(profile);
        _mapAvatarField(publicProfile);
        // 旧资料缓存可能含联系方式；读取返回过滤副本并尝试迁移，不因迁移失败隐藏公开内容。
        if (JSON.stringify(publicProfile) !== cached) {
            try { localStorage.setItem(PROFILE_CACHE_PREFIX + account, JSON.stringify(publicProfile)); } catch (_) {}
        }
        return publicProfile;
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
    if (!account || !_validProfile(profile)) return;
    try {
        localStorage.setItem(PROFILE_CACHE_PREFIX + account, JSON.stringify(_publicProfile(profile)));
        const state = profileCacheStates.get(account);
        if (state) state.readable = true;
        else rememberProfileCacheState(account, true);
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
    
    // 第二轨：同账号只取一次，但每个视图都订阅结果。
    let entry = _pendingProfileRequests.get(account);
    if (!entry && typeof apiFn === 'function') {
        const isCurrent = captureProfileRead(account);
        entry = { listeners: new Set(), timer: null };
        _pendingProfileRequests.set(account, entry);
        const release = () => {
            if (_pendingProfileRequests.get(account) === entry) _pendingProfileRequests.delete(account);
            clearTimeout(entry.timer);
            entry.listeners.clear();
        };
        entry.timer = setTimeout(release, PENDING_TIMEOUT);
        Promise.resolve().then(() => apiFn(account)).then(res => {
            // 超时后的旧结果不能覆盖新请求，也不能重新写入旧资料。
            if (_pendingProfileRequests.get(account) !== entry || !isCurrent()) return;
            if (res?.status && res.status !== 'success') return;
            const data = res && Object.hasOwn(res, 'data') ? res.data : res;
            if (!_validProfile(data)) return;
            const profile = _publicProfile(data);
            _mapAvatarField(profile);
            setCachedProfile(account, profile);
            for (const listener of Array.from(entry.listeners)) {
                try { listener(profile); } catch { /* 单个视图异常不阻断其它订阅者 */ }
            }
        }).catch(() => {}).finally(release);
    }
    if (entry && typeof onUpdate === 'function') entry.listeners.add(onUpdate);
    
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
    const renderId = String(++nextAvatarRenderId);
    const size = typeof avatarSize === 'number' || typeof avatarSize === 'string' ? Number(avatarSize) : NaN;
    const safeSize = Number.isFinite(size) && size > 0 ? size : 24;
    
    // 从缓存获取
    const cached = getCachedProfile(account);
    const avatar = cached?.avatar || cached?.avatarDataUrl || normalizeProfileImageUrl(fallbackAvatar);
    const name = cached?.name || fallbackName || account || '';
    
    // 后台静默校对并更新 DOM
    if (apiFn && containerId) {
        setTimeout(() => {
            const container = document.getElementById(containerId);
            if (!container || container.dataset.profileRender !== renderId) return;
            getProfileWithSWR(account, apiFn, (profile) => {
                if (!container.isConnected || document.getElementById(containerId) !== container
                    || container.dataset.profileRender !== renderId) return;
                
                const avatarImg = container.querySelector('.swr-avatar');
                const nameSpan = container.querySelector('.swr-name');
                
                if (avatarImg && profile.avatar) {
                    if (avatarImg.tagName === 'IMG') avatarImg.src = profile.avatar;
                    else {
                        const image = document.createElement('img');
                        image.className = 'swr-avatar';
                        image.alt = '';
                        image.style.cssText = avatarImg.style.cssText;
                        image.style.objectFit = 'cover';
                        image.src = profile.avatar;
                        avatarImg.replaceWith(image);
                    }
                } else if (avatarImg && avatarImg.tagName !== 'IMG' && profile.name) {
                    avatarImg.textContent = Array.from(profile.name)[0]?.toUpperCase() || 'U';
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
    const initial = Array.from(String(name || account || 'U'))[0].toUpperCase();
    const avatarHtml = avatar 
        ? `<img class="swr-avatar" alt="" src="${escapeHtml(avatar)}" style="width: ${safeSize}px; height: ${safeSize}px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #333;">`
        : `<div class="swr-avatar" aria-hidden="true" style="width: ${safeSize}px; height: ${safeSize}px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: ${Math.floor(safeSize * 0.5)}px; font-weight: bold; flex-shrink: 0;">${escapeHtml(initial)}</div>`;
    
    return `<span id="${escapeHtml(containerId)}" data-profile-render="${renderId}" style="display: inline-flex; align-items: center; gap: 6px;">${avatarHtml}<span class="swr-name">${escapeHtml(name)}</span></span>`;
}


// ==========================================
// 📦 导出默认配置对象
// ==========================================
export default {
    IMAGE_PROCESS,
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


// 提示词定价输入边界，与云端 PromptCreate/PromptUpdate 对应。
export const PROMPT_LIMITS = Object.freeze({ MAX_PRICE: 10000 });

// 任务定价边界，与云端 task_publication/task_terms 对应。
export const TASK_LIMITS = Object.freeze({ MAX_PRICE: 2147483647, MAX_REFERENCE_IMAGES: 6, DEPOSIT_RATIOS: Object.freeze([10, 20, 30, 50]), TIP_AMOUNTS: Object.freeze([10, 50, 100, 500]) });


export const TYPE_RULES = {
    tool: {
        recommendForm: false, resType: { selectable: ['link', 'netdisk'] },
        privateRepoWhenLink: true, price: true, refund: true, originalRequired: true
    },
    skill: {
        recommendForm: false, resType: { selectable: ['link', 'netdisk'] },
        privateRepoWhenLink: true, price: true, refund: true, originalRequired: true
    },
    app: {
        recommendForm: false, resType: { fixed: 'json' },
        privateRepoWhenLink: true, price: true, refund: true, originalRequired: true
    },
    recommend: {
        recommendForm: true, resType: { lockedByForm: true },
        privateRepoWhenLink: false, price: false, refund: false, originalRequired: false,
        formToResType: { recommend_tool: 'link', recommend_skill: 'link', recommend_app: 'json', recommend_link: 'netdisk' }
    }
};

// 🔧 设置项 localStorage Key
const SETTINGS_KEY = "ComfyCommunity_Settings";

// 🔧 默认设置值
const DEFAULT_SETTINGS = {
    enableKeyboardShortcuts: false,
    enableLocalPerformanceStats: false,
    showCreatorBanner: true,  // 创作者卡片显示背景图
    enableAnimations: true,   // ✨ 榜单切换动画
    enableSoundEffects: true, // 🔊 动画音效
    language: 'zh-CN',        // 🌐 界面语言
    cacheExpireSeconds: 7200, // ⏱️ 缓存刷新间隔（秒），默认2小时
    // 🚀 后续可扩展更多设置项
    // compactMode: false,    // 紧凑模式
    // darkMode: true,        // 深色模式
};

/**
 * 📦 获取当前设置
 */
export function getSettings(options = {}) {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            const value = JSON.parse(saved);
            if (options.strict && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Invalid settings');
            return { ...DEFAULT_SETTINGS, ...value };
        }
    } catch (e) { if (options.strict) throw e; }
    return { ...DEFAULT_SETTINGS };
}

/**
 * 💾 保存设置
 */
export function areKeyboardShortcutsEnabled() {
    return getSettings().enableKeyboardShortcuts === true;
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        // 🔔 广播设置变更事件，让其他组件响应
        window.dispatchEvent(new CustomEvent("comfy-settings-changed", { detail: settings }));
        return true;
    } catch (e) { return false; }
}
