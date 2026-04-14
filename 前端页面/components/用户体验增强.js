// 前端页面/components/用户体验增强.js
// ==========================================
// 🎯 P2 用户体验增强模块
// ==========================================
// 作用：提供表单自动保存、快捷键、主题、响应式、i18n等增强功能
// 关联文件：
//   - UI交互提示组件.js (toast/loading)
//   - 全局配置.js (配置中心)
//   - 侧边栏主程序.js (初始化入口)
// ==========================================


// ==========================================
// 📝 P2-2: 表单自动保存（草稿功能）
// ==========================================
// 特点：
//   - 输入防抖自动保存
//   - 离开页面前保存
//   - 恢复草稿提示

const DRAFT_PREFIX = 'comfy_ranking_draft_';
const DRAFT_DEBOUNCE = 2000;  // 2秒防抖

/**
 * 创建表单自动保存管理器
 * @param {string} formId - 表单唯一标识
 * @param {HTMLFormElement|HTMLElement} formElement - 表单元素
 * @param {Object} options - 配置选项
 */
export function createAutoSaver(formId, formElement, options = {}) {
    const {
        fields = [],           // 需要保存的字段选择器
        onRestore = null,      // 恢复草稿回调
        excludeFields = []     // 排除的字段
    } = options;
    
    let debounceTimer = null;
    const storageKey = DRAFT_PREFIX + formId;
    
    // 获取表单数据
    const getFormData = () => {
        const data = {};
        const inputs = formElement.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            const name = input.name || input.id;
            if (!name || excludeFields.includes(name)) return;
            
            if (input.type === 'checkbox') {
                data[name] = input.checked;
            } else if (input.type === 'radio') {
                if (input.checked) data[name] = input.value;
            } else {
                data[name] = input.value;
            }
        });
        
        return data;
    };
    
    // 保存草稿
    const saveDraft = () => {
        try {
            const data = getFormData();
            data._savedAt = Date.now();
            localStorage.setItem(storageKey, JSON.stringify(data));
            console.log(`📝 草稿已自动保存: ${formId}`);
        } catch (e) {
            console.warn('草稿保存失败:', e);
        }
    };
    
    // 加载草稿
    const loadDraft = () => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (!saved) return null;
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    };
    
    // 恢复草稿到表单
    const restoreDraft = (data) => {
        if (!data) return;
        
        const inputs = formElement.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            const name = input.name || input.id;
            if (!name || !(name in data)) return;
            
            if (input.type === 'checkbox') {
                input.checked = !!data[name];
            } else if (input.type === 'radio') {
                input.checked = input.value === data[name];
            } else {
                input.value = data[name] || '';
            }
        });
        
        if (onRestore) onRestore(data);
    };
    
    // 清除草稿
    const clearDraft = () => {
        localStorage.removeItem(storageKey);
    };
    
    // 检查是否有草稿
    const hasDraft = () => {
        const draft = loadDraft();
        return draft && draft._savedAt;
    };
    
    // 输入事件监听（防抖保存）
    const handleInput = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveDraft, DRAFT_DEBOUNCE);
    };
    
    // 页面离开前保存
    const handleBeforeUnload = () => {
        saveDraft();
    };
    
    // 初始化
    const init = () => {
        // 监听输入事件
        formElement.addEventListener('input', handleInput);
        formElement.addEventListener('change', handleInput);
        
        // 页面离开前保存
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        // 检查是否有草稿需要恢复
        const draft = loadDraft();
        if (draft && draft._savedAt) {
            const savedTime = new Date(draft._savedAt).toLocaleString();
            return { hasDraft: true, savedAt: savedTime, draft };
        }
        
        return { hasDraft: false };
    };
    
    // 销毁
    const destroy = () => {
        formElement.removeEventListener('input', handleInput);
        formElement.removeEventListener('change', handleInput);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (debounceTimer) clearTimeout(debounceTimer);
    };
    
    return {
        init,
        destroy,
        saveDraft,
        loadDraft,
        restoreDraft,
        clearDraft,
        hasDraft
    };
}


// ==========================================
// ⌨️ P2-3: 快捷键支持
// ==========================================
// 特点：
//   - Esc 关闭弹窗
//   - Enter 确认提交
//   - Ctrl+S 保存
//   - 可配置扩展

const keyboardShortcuts = new Map();
let shortcutsInitialized = false;

/**
 * 注册全局快捷键
 * @param {string} key - 按键组合 (如 'Escape', 'Enter', 'Ctrl+S')
 * @param {Function} handler - 处理函数
 * @param {Object} options - 配置选项
 */
export function registerShortcut(key, handler, options = {}) {
    const {
        scope = 'global',      // 作用域
        preventDefault = true, // 是否阻止默认行为
        description = ''       // 描述
    } = options;
    
    if (!keyboardShortcuts.has(key)) {
        keyboardShortcuts.set(key, []);
    }
    
    keyboardShortcuts.get(key).push({
        handler,
        scope,
        preventDefault,
        description
    });
}

/**
 * 移除快捷键
 * @param {string} key - 按键组合
 * @param {Function} handler - 处理函数（可选，不传则移除所有）
 */
export function unregisterShortcut(key, handler = null) {
    if (handler && keyboardShortcuts.has(key)) {
        const handlers = keyboardShortcuts.get(key);
        const filtered = handlers.filter(h => h.handler !== handler);
        if (filtered.length > 0) {
            keyboardShortcuts.set(key, filtered);
        } else {
            keyboardShortcuts.delete(key);
        }
    } else {
        keyboardShortcuts.delete(key);
    }
}

/**
 * 初始化快捷键系统
 */
export function initKeyboardShortcuts() {
    if (shortcutsInitialized) return;
    shortcutsInitialized = true;
    
    document.addEventListener('keydown', (e) => {
        // 构建按键标识
        let keyCombo = '';
        if (e.ctrlKey || e.metaKey) keyCombo += 'Ctrl+';
        if (e.altKey) keyCombo += 'Alt+';
        if (e.shiftKey) keyCombo += 'Shift+';
        keyCombo += e.key;
        
        // 也检查单独的按键
        const keysToCheck = [keyCombo];
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
            keysToCheck.push(e.key);
        }
        
        for (const key of keysToCheck) {
            if (keyboardShortcuts.has(key)) {
                const handlers = keyboardShortcuts.get(key);
                for (const { handler, preventDefault } of handlers) {
                    // 跳过在输入框中的快捷键（除了 Escape）
                    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
                    if (isInput && key !== 'Escape') continue;
                    
                    if (preventDefault) {
                        e.preventDefault();
                    }
                    handler(e);
                    return;
                }
            }
        }
    });
    
    // 注册默认快捷键
    _registerDefaultShortcuts();
}

function _registerDefaultShortcuts() {
    // Esc 关闭最上层弹窗
    registerShortcut('Escape', () => {
        const modals = document.querySelectorAll('[data-modal="true"]');
        if (modals.length > 0) {
            const topModal = modals[modals.length - 1];
            const closeBtn = topModal.querySelector('[data-close]');
            if (closeBtn) closeBtn.click();
        }
    }, { description: '关闭弹窗' });
    
    // Ctrl+S 保存（触发自定义事件）
    registerShortcut('Ctrl+s', () => {
        document.dispatchEvent(new CustomEvent('comfy-save-shortcut'));
    }, { description: '保存' });
}


// ==========================================
// 🎨 P2-4: 暗色主题适配
// ==========================================
// 特点：
//   - CSS 变量统一管理
//   - ComfyUI 原生变量兼容
//   - 动态主题切换

export const THEME_COLORS = {
    // 背景色
    bgPrimary: 'var(--comfy-input-bg, #2b2b2b)',
    bgSecondary: '#1e1e1e',
    bgTertiary: '#161616',
    bgOverlay: 'rgba(0, 0, 0, 0.6)',
    
    // 边框
    border: '#444',
    borderLight: '#555',
    borderDark: '#333',
    
    // 文字
    textPrimary: '#fff',
    textSecondary: '#ccc',
    textMuted: '#888',
    textDisabled: '#666',
    
    // 强调色
    accent: '#4CAF50',
    accentHover: '#66BB6A',
    accentDark: '#388E3C',
    
    // 状态色
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
    info: '#2196F3',
    
    // 交互
    hoverBg: 'rgba(255, 255, 255, 0.05)',
    activeBg: 'rgba(255, 255, 255, 0.1)',
    
    // 阴影
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.3)',
    shadowMd: '0 4px 16px rgba(0, 0, 0, 0.4)',
    shadowLg: '0 8px 32px rgba(0, 0, 0, 0.5)'
};

/**
 * 注入主题 CSS 变量
 */
export function injectThemeVariables() {
    const styleId = 'comfy-ranking-theme-vars';
    if (document.getElementById(styleId)) return;
    
    const cssVars = Object.entries(THEME_COLORS)
        .map(([key, value]) => `--cr-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};`)
        .join('\n    ');
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
    :root {
        ${cssVars}
    }
    
    /* 暗色主题基础样式 */
    .comfy-ranking-root {
        color-scheme: dark;
        background: var(--cr-bg-secondary);
        color: var(--cr-text-primary);
    }
    
    /* 滚动条样式 */
    .comfy-ranking-root ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    .comfy-ranking-root ::-webkit-scrollbar-track {
        background: var(--cr-bg-tertiary);
    }
    .comfy-ranking-root ::-webkit-scrollbar-thumb {
        background: var(--cr-border);
        border-radius: 4px;
    }
    .comfy-ranking-root ::-webkit-scrollbar-thumb:hover {
        background: var(--cr-border-light);
    }
    
    /* 输入框焦点状态 */
    .comfy-ranking-root input:focus,
    .comfy-ranking-root textarea:focus,
    .comfy-ranking-root select:focus {
        outline: none;
        border-color: var(--cr-accent) !important;
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
    }
    
    /* 按钮悬停效果 */
    .comfy-ranking-root button:not(:disabled):hover {
        filter: brightness(1.1);
    }
    `;
    
    document.head.appendChild(style);
}


// ==========================================
// 📱 P2-5: 移动端适配
// ==========================================
// 特点：
//   - 响应式断点
//   - 触摸友好的交互区域
//   - 侧边栏自适应

export const BREAKPOINTS = {
    mobile: 480,
    tablet: 768,
    desktop: 1024,
    wide: 1440
};

/**
 * 检测当前设备类型
 * @returns {'mobile'|'tablet'|'desktop'|'wide'}
 */
export function getDeviceType() {
    const width = window.innerWidth;
    if (width < BREAKPOINTS.mobile) return 'mobile';
    if (width < BREAKPOINTS.tablet) return 'tablet';
    if (width < BREAKPOINTS.desktop) return 'desktop';
    return 'wide';
}

/**
 * 检测是否为触摸设备
 */
export function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 注入响应式样式
 */
export function injectResponsiveStyles() {
    const styleId = 'comfy-ranking-responsive';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
    /* 移动端适配 */
    @media (max-width: ${BREAKPOINTS.tablet}px) {
        .comfy-ranking-sidebar {
            width: 100% !important;
            max-width: 100vw !important;
        }
        
        .comfy-ranking-card {
            padding: 12px !important;
        }
        
        /* 触摸友好的按钮尺寸 */
        .comfy-ranking-root button,
        .comfy-ranking-root .clickable {
            min-height: 44px;
            min-width: 44px;
        }
        
        /* 增大点击区域 */
        .comfy-ranking-root input,
        .comfy-ranking-root textarea,
        .comfy-ranking-root select {
            padding: 12px !important;
            font-size: 16px !important; /* 防止iOS缩放 */
        }
    }
    
    /* 平板适配 */
    @media (min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.desktop}px) {
        .comfy-ranking-sidebar {
            width: 400px !important;
        }
    }
    
    /* 触摸设备优化 */
    @media (hover: none) and (pointer: coarse) {
        .comfy-ranking-root button:active {
            transform: scale(0.97);
        }
        
        /* 禁用悬停效果 */
        .comfy-ranking-root .hover-effect:hover {
            background: transparent !important;
        }
    }
    `;
    
    document.head.appendChild(style);
}

/**
 * 添加安全区域适配（iPhone刘海屏等）
 */
export function applySafeAreaInsets() {
    const styleId = 'comfy-ranking-safe-area';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
    .comfy-ranking-root {
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
    }
    
    .comfy-ranking-bottom-bar {
        padding-bottom: env(safe-area-inset-bottom);
    }
    `;
    
    document.head.appendChild(style);
}


// ==========================================
// 🌐 P2-6: 多语言支持 (i18n)
// ==========================================
// 特点：
//   - 文案集中管理
//   - 动态切换语言
//   - 默认中文

let currentLang = 'zh-CN';

const translations = {
    'zh-CN': {
        // 通用
        'common.confirm': '确认',
        'common.cancel': '取消',
        'common.save': '保存',
        'common.saving': '保存中...',
        'common.delete': '删除',
        'common.deleting': '删除中...',
        'common.edit': '编辑',
        'common.close': '关闭',
        'common.reset': '重置',
        'common.loading': '加载中...',
        'common.chars': '字符',
        'common.digits': '位数',
        'common.success': '操作成功',
        'common.error': '操作失败',
        'common.retry': '重试',
        'common.retrying': '重试中...',
        'common.retry_failed': '重试失败，请稍后再试',
        'common.more': '更多',
        'common.back': '返回',
        'common.search': '搜索',
        'common.refresh': '刷新',
        'common.copy': '复制',
        'common.copied': '已复制',
        'common.share': '分享',
        'common.download': '下载',
        'common.upload': '上传',
        'common.select': '选择',
        'common.all': '全部',
        'common.none': '无',
        'common.yes': '是',
        'common.no': '否',
        'common.ok': '好的',
        'common.send': '发送',
        'common.reset': '重置',
        'common.install': '安装',
        'common.installed': '已安装',
        'common.update': '更新',
        'common.free': '免费',
        'common.paid': '付费',
        
        // 导航
        'nav.tools': '工具',
        'nav.apps': '应用',
        'nav.creators': '创作者',
        'nav.recommends': '推荐',
        'nav.posts': '讨论区',
        'nav.tasks': '任务榜',
        'nav.profile': '个人中心',
        'nav.settings': '设置',
        'nav.login': '登录 / 注册',
        'nav.logout': '退出登录',
        'nav.notifications': '消息',
        'nav.community': '社区精选',
        
        // 设置页面
        'settings.title': '界面设置',
        'settings.general': '通用设置',
        'settings.display': '显示偏好',
        'settings.animation': '动画与音效',
        'settings.language': '界面语言',
        'settings.language_desc': '选择界面显示语言',
        'settings.creator_banner': '创作者卡片背景图',
        'settings.creator_banner_desc': '开启后创作者列表卡片显示个人背景图，关闭后显示简洁纯色风格',
        'settings.animations': '榜单切换动画',
        'settings.animations_desc': '开启后切换榜单时卡片将播放科技感载入动画',
        'settings.sound': '动画音效',
        'settings.sound_desc': '开启后动画播放时会发出科技感音效（需开启动画）',
        'settings.auto_save': '设置会自动保存到本地',
        'settings.language_changed': '语言已切换为',
        'settings.animation_preview': '动画效果预览',
        'settings.anim_cascade': '工具/应用/推荐榜：瀑布式从左往右载入',
        'settings.anim_fan': '创作者榜：从下往上扇形展开',
        'settings.anim_abyss': '讨论区：伪3D深渊汇聚效果',
        'settings.anim_dataflow': '任务榜：数据流左右交替滑入',
        'settings.enabled': '已开启',
        'settings.disabled': '已关闭',
        'settings.data_cache': '💾 数据与缓存',
        'settings.cache_expire': '数据刷新间隔（秒）',
        'settings.cache_expire_desc': '设置本地缓存数据的刷新间隔，过期后切换页面时会自动后台更新数据。最小60秒，最大86400秒（1天）。',
        'settings.cache_trigger_desc': '当缓存超过设定时间后，切换页面标签时会自动在后台拉取最新数据并静默更新，不影响使用流畅度。手动刷新不受此设置影响。',
        
        // 认证
        'auth.login': '登录',
        'auth.title': '社区账号验证',
        'auth.register': '注册',
        'auth.logout': '退出',
        'auth.email': '邮箱',
        'auth.password': '密码',
        'auth.confirm_password': '确认密码',
        'auth.username': '用户名',
        'auth.nickname': '昵称',
        'auth.forgot_password': '忘记密码？',
        'auth.reset_password': '重置密码',
        'auth.verification_code': '验证码',
        'auth.send_code': '发送验证码',
        'auth.resend_code': '重新发送',
        'auth.login_success': '登录成功',
        'auth.register_success': '注册成功',
        'auth.logout_success': '已退出登录',
        'auth.password_mismatch': '两次密码不一致',
        'auth.invalid_email': '邮箱格式不正确',
        'auth.weak_password': '密码强度不足',
        'auth.account_exists': '账号已存在',
        'auth.invalid_credentials': '账号或密码错误',
        'auth.login_required': '请先登录您的社区账号！',
        'auth.resetting_password': '修改密码中...',
        'auth.password_reset_success': '密码修改成功！请使用新密码重新登录。',
        'auth.uploading_avatar': '上传头像中...',
        'auth.registering': '注册账号中...',
        'auth.auto_login': '！正在为您自动登录...',
        'common.unknown_user': '未知用户',
        'auth.agree_terms': '我已阅读并同意',
        'auth.terms': '用户协议',
        'auth.and': '和',
        'auth.privacy': '隐私政策',
        'auth.account': '登录账号',
        'auth.remember_me': '保持登录 30 天',
        'auth.no_account': '没有账号？',
        'auth.register_now': '立即注册',
        'auth.account_password_required': '账号和密码不能为空！',
        'auth.display_name': '显示名称',
        'auth.set_password': '设置密码',
        'auth.security_email': '安全邮箱',
        'auth.security_email_desc': '用于接收验证码',
        'auth.get_code': '获取验证码',
        'auth.resend': '重发',
        'auth.avatar': '头像',
        'auth.gender': '性别',
        'auth.male': '男',
        'auth.female': '女',
        'auth.birthday': '出生日期',
        'auth.age_years': '岁',
        'auth.country': '国家',
        'auth.region': '地区',
        'auth.intro': '个人介绍',
        'auth.intro_limit': '限100字',
        'auth.register_submit': '注 册 账 号',
        'auth.has_account': '已有账号？',
        'auth.back_to_login': '返回登录',
        'auth.file_too_large': '文件超出 3MB！',
        'auth.code_sent': '验证码已发送至邮箱，请查收',
        'auth.sending': '发送中...',
        'auth.required_fields': '带 * 号的均为必填项！',
        'auth.invalid_code': '请输入 6 位有效验证码！',
        'auth.account_format_error': '账号必须大于5个字符，且仅支持大小写英文字母、数字和下划线！',
        'auth.password_format_error': '密码必须大于等于6个字符！',
        'auth.new_password': '新密码',
        'auth.reset_submit': '重 置 密 码',
        'auth.reset_desc': '输入注册时的安全邮箱，通过验证码重置密码',
        'auth.verification_code': '验证码',
        'auth.phone': '手机号码',
        'auth.invalid_email': '请输入有效的安全邮箱！',
        'auth.confirm_password': '确认密码',
        'auth.password_mismatch': '两次输入的密码不一致！',
        'auth.current_account': '当前账号',
        'auth.enter_account': '输入要修改的账号',
        'auth.security_verify': '安全验证',
        'auth.bound_email': '绑定的邮箱',
        'auth.enter_bound_email': '请输入绑定的安全邮箱',
        'auth.enter_6_digit_code': '输入 6 位验证码',
        'auth.old_password': '原密码',
        'auth.old_password_tip': '如果是找回密码可留空',
        'auth.old_password_placeholder': '如忘记原密码请留空',
        'auth.confirm_new_password': '确认新密码',
        'auth.change_password': '修 改 密 码',
        'auth.enter_account_first': '请先输入要修改密码的当前账号！',
        'auth.reset_required_fields': '账号、安全验证、验证码和新密码均为必填项！',
        
        // 个人中心
        'profile.my_profile': '我的资料',
        'profile.my_published': '我的发布',
        'profile.their_published': 'TA的发布',
        'profile.my_purchased': '我购买的',
        'profile.my_tasks': '我的任务',
        'profile.transactions': '交易明细',
        'profile.my_posts': '我的帖子',
        'profile.recent_likes': '近期点赞',
        'profile.following': '关注的人',
        'profile.max_privilege': '最高特权',
        'profile.beta_max_privilege': '内测最高特权',
        'profile.edit_profile': '编辑资料',
        'profile.my_works': '我的作品',
        'profile.my_purchases': '我获取的',
        'profile.my_favorites': '我收藏的',
        'profile.my_following': '我关注的',
        'profile.my_followers': '关注我的',
        'profile.my_wallet': '我的钱包',
        'profile.transactions': '交易记录',
        'profile.statistics': '数据统计',
        'profile.followers': '粉丝',
        'profile.following': '关注',
        'profile.works': '作品',
        'profile.likes': '获赞',
        'profile.bio': '个人简介',
        'profile.location': '所在地',
        'profile.website': '个人网站',
        'profile.joined': '加入时间',
        'profile.follow': '关注',
        'profile.unfollow': '取消关注',
        'profile.message': '私信',
        'profile.block': '拉黑',
        'profile.report': '举报',
        
        // 表单
        'form.title': '标题',
        'form.description': '描述',
        'form.price': '价格',
        'form.submit': '提交',
        'form.draft_found': '发现未保存的草稿，是否恢复？',
        'form.draft_restored': '草稿已恢复',
        'form.draft_cleared': '草稿已清除',
        'form.required': '必填',
        'form.optional': '选填',
        'form.placeholder': '请输入...',
        
        // 钱包
        'wallet.balance': '余额',
        'wallet.recharge': '充值',
        'wallet.withdraw': '提现',
        'wallet.tip': '打赏',
        'wallet.purchase': '购买',
        'wallet.income': '收入',
        'wallet.expense': '支出',
        'wallet.points': '积分',
        'wallet.sales': '销售收入',
        'wallet.tips_received': '打赏收入',
        
        // 交易记录类型
        'tx.withdraw': '💸 提现申请',
        'tx.tip_in': '🎁 收到打赏',
        'tx.tip_out': '🎁 打赏支出',
        'tx.purchase': '🛒 购买资源',
        'tx.task_deposit': '📋 任务订金',
        'tx.task_payment': '📋 任务尾款',
        'tx.task_income': '📋 任务收入',
        'tx.task_freeze': '🔒 任务冻结',
        'tx.task_refund': '↩️ 任务退款',
        'tx.task_cancel_refund': '🔄 任务取消退款',
        'tx.recharge': '💰 充值',
        'tx.refund': '↩️ 退款',
        'tx.withdraw_fee': '💸 手续费',
        'tx.withdraw_pending': '待打款',
        'tx.withdraw_completed': '已完成',
        'tx.recharge_desc': '支付宝充值',
        'tx.withdraw_fee_desc': '提现手续费',
        'tx.net_amount': '实到',
        
        // 充值相关
        'wallet.recharge.title': '💰 积分充值中心',
        'wallet.recharge.current_balance': '当前账号余额',
        'wallet.recharge.select_amount': '选择充值金额',
        'wallet.recharge.exchange_rate': '(1 积分 = 1 元)',
        'wallet.recharge.points_suffix': '积分',
        'wallet.recharge.price_prefix': '￥',
        'wallet.recharge.custom': '自定义',
        'wallet.recharge.any_amount': '任意金额',
        'wallet.recharge.payment_method': '支付方式',
        'wallet.recharge.alipay': '📘 支付宝',
        'wallet.recharge.wechat': '📗 微信支付(暂未开通)',
        'wallet.recharge.get_qr': '获取支付二维码',
        'wallet.recharge.connecting': '⏳ 正在连接支付网关...',
        'wallet.recharge.scan_to_pay': '请使用手机扫码支付',
        'wallet.recharge.yuan': '元',
        'wallet.recharge.auto_redirect': '支付成功后此处将自动跳转，请勿关闭弹窗',
        'wallet.recharge.invalid_amount': '请输入 6 位以内有效的整数充值金额！',
        'wallet.recharge.order_failed': '❌ 创建订单失败: ',
        'wallet.recharge.success': '✅ 充值成功！已实时到账 {points} 积分。',
        'wallet.recharge.custom_placeholder': '请输入自定义金额 (1~999999)',
        
        // 提现相关
        'wallet.withdraw.title': '💳 收益提现中心',
        'wallet.withdraw.total_withdrawable': '总可提现积分',
        'wallet.withdraw.rmb_equivalent': '折合人民币 (扣除手续费前)',
        'wallet.withdraw.amount_label': '提现金额 (积分)',
        'wallet.withdraw.amount_placeholder': '1积分 = 1元',
        'wallet.withdraw.alipay_account': '收款支付宝账号',
        'wallet.withdraw.alipay_placeholder': '手机号或邮箱',
        'wallet.withdraw.real_name': '真实姓名 (需与支付宝实名一致)',
        'wallet.withdraw.real_name_placeholder': '收款人真实姓名',
        'wallet.withdraw.security_code': '安全验证码 (将发送至您绑定的邮箱)',
        'wallet.withdraw.code_placeholder': '6位验证码',
        'wallet.withdraw.get_code': '获取验证码',
        'wallet.withdraw.sending': '发送中...',
        'wallet.withdraw.resend_in': '{seconds}s 后重发',
        'wallet.withdraw.confirm': '确认提现 (金额将转入冻结审核)',
        'wallet.withdraw.submitting': '⏳ 提交中...',
        'wallet.withdraw.no_balance': '您的可提现收益为 0，快去发布优质工具赚取积分吧！',
        'wallet.withdraw.min_amount': '最低提现额度为 1 积分！',
        'wallet.withdraw.fill_account': '请完整填写收款人支付宝账号与真实姓名！',
        'wallet.withdraw.invalid_code': '请输入 6 位有效验证码！',
        'wallet.withdraw.code_sent': '验证码已发送，请查收邮箱 (注意检查垃圾箱)',
        'wallet.withdraw.code_failed': '发送失败: ',
        'wallet.withdraw.success': '🎉 提现申请提交成功！预计 1-3 个工作日内打款至您的支付宝。',
        'wallet.withdraw.submit_failed': '提交失败: ',
        'wallet.withdraw.fee_free_quota': '🎉 您目前享有平台 100元 内免手续费优惠福利！',
        'wallet.withdraw.fee_full_amount': '预计全额到账：',
        'wallet.withdraw.fee_quota_exhausted': '⚠️ 平台累计免手续费额度 (100积分) 已耗尽。',
        'wallet.withdraw.fee_deducted': '本次提现需扣除 10% 平台维护手续费：',
        'wallet.withdraw.fee_actual': '扣除后预计实际到账：',
        'wallet.withdraw.yuan': '元',
        
        // 市场
        'market.latest': '最新',
        'market.popular': '热门',
        'market.downloads': '下载量',
        'market.favorites': '收藏量',
        'market.publish': '发布',
        'market.detail': '详情',
        'market.comments': '评论',
        'market.reviews': '评价',
        'market.like': '点赞',
        'market.liked': '已赞',
        'market.favorite': '收藏',
        'market.favorited': '已收藏',
        'market.views': '🔥 浏览总量',
        'market.daily_views': '🔥 今日热门',
        'market.install_now': '立即安装',
        'market.load_workflow': '加载工作流',
        'market.price_free': '免费',
        'market.price_unit': '积分',
        'market.tips_ranking': '近期打赏榜',
        
        // 社交
        'social.chat': '聊天',
        'social.messages': '消息',
        'social.notifications': '通知',
        'social.comment': '评论',
        'social.reply': '回复',
        'social.share': '分享',
        'social.mention': '@提及',
        'social.new_message': '新消息',
        'social.no_messages': '暂无消息',
        'social.type_message': '输入消息...',
        
        // 任务
        'task.create': '发布任务',
        'task.apply': '申请接单',
        'task.deposit': '订金',
        'task.final_payment': '尾款',
        'task.deadline': '截止时间',
        'task.budget': '预算',
        'task.status': '状态',
        'task.pending': '待接单',
        'task.in_progress': '进行中',
        'task.completed': '已完成',
        'task.cancelled': '已取消',
        
        // 反馈
        'feedback.loading': '处理中...',
        'feedback.success': '操作成功',
        'feedback.error': '操作失败，请重试',
        'feedback.network_error': '网络连接失败',
        'feedback.offline': '当前处于离线状态',
        'feedback.timeout': '请求超时',
        'feedback.saved': '已保存',
        'feedback.logged_out': '已退出登录',
        'feedback.login_required': '请先登录您的账号！',
        'feedback.login_required_tip': '请先登录您的账号后再进行赞赏！',
        'feedback.operation_failed': '操作失败：',
        'feedback.user_fetch_failed': '获取作者信息失败，可能该账号已注销。',
        
        // 确认弹窗
        'confirm.logout': '确定要退出当前账号吗？',
        'confirm.delete': '确定要删除吗？',
        'confirm.yes': '确定',
        'confirm.no': '取消',
        
        // 社交
        'social.follow': '关注作者',
        'social.followed': '已关注',
        'social.unfollow': '取消关注',
        'social.send_message': '发消息',
        'social.tip_author': '赞赏作者',
        'social.say_something': '说点什么...',
        'social.reply': '回复',
        'social.reply_to': '回复',
        'social.comment_deleted': '此条评论已由用户删除',
        'social.delete_comment_confirm': '确定要删除这条评论吗？删除后将无法恢复。',
        'social.no_comments': '暂无留言，来抢沙发吧~',
        
        // 通用补充
        'common.send': '发送',
        'common.delete': '删除',
        
        // 反馈补充
        'feedback.send_failed': '发送失败',
        
        // 通知中心
        'notif.login_required': '请先登录您的社区账号查看消息！',
        'notif.title': '消息与通知',
        'notif.clear': '清空记录',
        'notif.no_messages': '暂无任何消息通知',
        'notif.private_msg': '给您发送了私信',
        'notif.followed_you': '关注了您',
        'notif.liked': '点赞了您的作品',
        'notif.favorited': '收藏了您的作品',
        'notif.commented_on': '在您的作品中回复了您',
        'notif.replied_on': '回复了您的评论',
        'notif.purchased': '购买了您的作品',
        'notif.income_received': '，收益已入账！',
        'notif.refunded': '退回了作品',
        'notif.tipped_you': '打赏了您！',
        'notif.task_apply': '申请了您的任务',
        'notif.task_assigned': '您已被指派接单',
        'notif.task_submitted': '已提交任务成果',
        'notif.task_completed': '任务已完成',
        'notif.task_rejected': '任务验收未通过',
        'notif.task_disputed': '对任务发起了申诉',
        'notif.dispute_responded': '已回应您的申诉',
        'notif.dispute_resolved': '申诉已裁决',
        'notif.system_announcement': '系统公告',
        'notif.clear_confirm': '确定要清空本地的所有通知记录吗？云端7天前的记录不会再同步下来。',
        'notif.cleared': '通知已清空',
        'notif.plugin_update_title': '插件更新',
        'notif.plugin_update': '插件',
        'notif.click_to_view': '点击查看',
        'notif.item_not_found': '资源不存在或已被删除',
        'notif.load_item_failed': '加载资源失败，请稍后重试',
        
        // 私信聊天
        'chat.title': '私信聊天',
        'chat.clear_messages': '清空消息',
        'chat.input_placeholder': '输入消息...',
        'chat.no_conversations': '暂无对话',
        'chat.me': '我',
        'chat.view_profile': '点击查看个人资料',
        
        // 创作者
        'creator.no_tips': '暂无赞赏记录',
        'creator.anonymous': '匿名用户',
        'creator.loading_details': '加载详情中...',
        'creator.load_failed': '加载失败',
        'creator.retry': '重试',
        'creator.usage_count': '被使用 {count} 次',
        'creator.stats.likes': '获赞',
        'creator.stats.favorites': '收藏',
        'creator.stats.followers': '粉丝',
        'creator.output.tools': '产出工具',
        'creator.output.apps': '产出应用',
        'creator.output.unit': '个',
        'creator.chart.download_trend': '📈 下载量增长趋势',
        'creator.chart.loading': '正在加载图表...',
        'creator.chart.load_failed': '图表库加载失败',
        'creator.chart.series.tools': '工具下载',
        'creator.chart.series.apps': '应用下载',
        'creator.chart.series.recommends': '推荐获取',
        'creator.tip_board.title': '🎁 赞赏贡献总榜',
        'creator.tip_board.count': '共{count}人',
        'creator.tip_this_creator': '赞赏此创作者',
        'creator.tip_level_rule': '等级规则',
        'creator.cannot_tip_self': '不能给自己打赏',
        'creator.tip_login_required': '请先登录',
        'creator.message_board': '💬 创作者留言板',
        'creator.visit_profile': '访问 TA 的主页',
        
        // 通用补充
        'common.back': '返回',
        
        // 管理员
        'admin.management_tools': '管理员功能',
        'admin.empty_content': '公告内容不能为空！',
        'admin.announce_confirm': '发送说明：\n\n1. 内容将下发给所有用户，无法撤回。\n2. 内容将在消息中心醒目展示。\n\n⚠️ 请确保内容准确，谨慎操作！',
        'admin.publishing': '发布中',
        'admin.publish_success': '全站系统公告发布成功！',
        'admin.publish_failed': '发布失败',
        'admin.confirm_publish': '确认发布全站公告',
        'admin.enter_script_name': '请输入脚本名称！',
        'admin.executing': '执行中',
        'admin.running': '正在执行',
        'admin.exec_success': '执行成功',
        'admin.exec_failed': '执行失败',
        'admin.execute': '执行',
        
        // 市场
        'market.uses': '使用',
        'market.points': '积分',
        'market.free': '免费',
        'market.author': '发布者',
        'market.update_available': '可更新',
        'market.installed': '已安装',
        'market.get_now': '立即获取',
        'market.liked': '已赞',
        'market.like': '点赞',
        'market.favorited': '已收藏',
        'market.favorite': '收藏',
        'market.usage_trend': '使用量增长曲线',
        'market.full_description': '详细说明',
        'market.no_tips_yet': '该资源暂无专属打赏，快来成为首个赞赏人吧！',
        'market.tip_board': '赞赏贡献榜',
        'market.tip': '打赏',
        'market.creator_manage': '创作者管理',
        'market.edit_content': '修改内容',
        'market.delete_permanently': '永久删除',
        'market.delete_confirm': '🚨 警告：确定要彻底删除该发布内容吗？<br><br><span style="color:#aaa;">该操作不可逆，且相关的所有评论数据也将被同步永久清空。</span>',
        'item.refundable': '支持退款',
        
        // 时间
        'time.hours_later': '小时后生效',
        
        // 反馈补充
        'feedback.deleted': '已成功删除',
        'feedback.delete_failed': '删除失败',
        
        // 通用
        'common.processing': '处理中',
        
        // 确认框
        'confirm.delete_title': '确认删除',
        'confirm.delete_message': '此操作不可撤销，确定要删除吗？',
        'confirm.logout_title': '确认退出',
        'confirm.logout_message': '确定要退出登录吗？',
        
        // 时间
        'time.just_now': '刚刚',
        'time.minutes_ago': '{n}分钟前',
        'time.hours_ago': '{n}小时前',
        'time.days_ago': '{n}天前',
        'time.months_ago': '{n}个月前',
        'time.deadline_today': '今天截止',
        'time.deadline_tomorrow': '明天截止',
        'time.deadline_days': '{n}天后',
        'time.deadline_ended': '已截止',
        'time.unlimited': '无限期',
        'time.expired': '已过期',
        
        // 任务榜
        'task.title': '任务榜',
        'task.publish': '📝 发布任务',
        'task.arbitrate': '⚖️ 仲裁',
        'task.filter_all': '全部',
        'task.filter_open': '🟢 开放接单',
        'task.filter_in_progress': '🔵 进行中',
        'task.filter_submitted': '🟡 待验收',
        'task.filter_completed': '✅ 已完成',
        'task.filter_disputed': '⚠️ 争议中',
        'task.sort_latest': '最新发布',
        'task.sort_price': '价格最高',
        'task.sort_deadline': '截止日期',
        'task.sort_views': '🔥 浏览总量',
        'task.sort_daily_views': '🔥 今日热门',
        'task.sort_likes': '👍 最多点赞',
        'task.sort_favorites': '⭐ 最多收藏',
        'task.status_open': '开放接单',
        'task.status_in_progress': '进行中',
        'task.status_submitted': '待验收',
        'task.status_completed': '已完成',
        'task.status_disputed': '争议中',
        'task.status_cancelled': '已取消',
        'task.status_expired': '已过期',
        'task.status_unknown': '未知',
        'task.overdue': '逾期',
        'task.loading': '加载中...',
        'task.load_more': '加载更多',
        'task.no_tasks': '暂无任务',
        'task.be_first': '成为第一个发布任务的人吧！',
        'task.load_failed': '加载失败，请稍后重试',
        'task.network_cache': '网络异常，已加载本地缓存',
        'task.points': '积分',
        'task.applicants': '人申请',
        'task.login_first': '请先登录后再发布任务',
        
        // 任务详情
        'task.detail_title': '任务详情',
        'task.deposit_ratio': '订金',
        'task.published_at': '发布于',
        'task.deadline_label': '截止日期',
        'task.description_label': '📄 任务描述',
        'task.ref_images': '🖼️ 参考图片',
        'task.ref_link': '🔗 参考链接',
        'task.assignee_label': '👷 接单者',
        'task.deliverables': '📦 交付成果',
        'task.deliverables_note': '备注',
        'task.applicants_title': '👥 申请者',
        'task.select_applicant': '选择TA',
        'task.assign_confirm': '确定选择 {name} 作为接单者吗？\n\n将从您的账户扣除订金 {amount} 积分',
        'task.assign_success': '指派成功！',
        'task.assign_failed': '指派失败',
        'task.login_to_operate': '请登录后操作',
        'task.cancel_task': '❌ 取消任务',
        'task.edit_task': '编辑任务',
        'task.title_label': '任务标题',
        'task.description_label': '任务描述',
        'task.title_required': '请输入任务标题',
        'task.edit_success': '任务修改成功',
        'task.edit_failed': '任务修改失败',
        'task.edit_limited_notice': '任务已有人接单，仅可修改标题、描述和参考链接',
        'task.delete_confirm_title': '确认删除任务',
        'task.delete_confirm_desc': '删除后无法恢复，确定要删除这个任务吗？',
        'task.delete_success': '任务已删除',
        'task.delete_failed': '删除失败',
        'task.cancel_apply': '撤回申请',
        'task.apply_task': '🙋 申请接单',
        'task.submit_result': '📤 提交成果',
        'task.accept': '✅ 验收通过',
        'task.reject': '❌ 验收不通过',
        'task.dispute': '⚖️ 发起申诉',
        'task.view_dispute': '⚖️ 查看申诉详情',
        'task.apply_message': '请输入申请留言（可选）：',
        'task.apply_success': '申请成功！',
        'task.apply_failed': '申请失败',
        'task.cancel_apply_confirm': '确定撤回申请吗？',
        'task.cancel_apply_success': '已撤回申请',
        'task.cancel_apply_failed': '撤回失败',
        'task.cancel_confirm': '确定取消任务吗？此操作不可撤销。',
        'task.cancel_success': '任务已取消',
        'task.cancel_failed': '取消失败',
        'task.accept_confirm': '确定验收通过吗？\n\n将支付尾款 {amount} 积分给接单者',
        'task.accept_success': '验收完成！款项已支付',
        'task.reject_reason': '请输入不通过的原因：',
        'task.reject_success': '已退回修改',
        'task.operation_failed': '操作失败',
        'task.private_message': '💬 私信',
        'task.post_not_exist': '帖子不存在或已被删除',
        
        // 提交成果弹窗
        'task.submit_title': '📤 提交成果',
        'task.submit_images': '交付图片 *',
        'task.submit_images_multi': '支持多张图片',
        'task.submit_note': '备注说明（可选）',
        'task.submit_note_placeholder': '对交付内容的说明...',
        'task.submit_confirm': '确认提交',
        'task.submit_uploading': '⏳ 上传中...',
        'task.submit_progress': '⏳ 上传 ({current}/{total})...',
        'task.submit_failed': '提交失败',
        'task.submit_upload_failed': '图片上传失败，请重试',
        'task.submit_submitting': '⏳ 提交中...',
        'task.submit_success': '成果已提交，等待发布者验收',
        'task.upload_images_required': '请上传交付图片',
        
        // 发布任务
        'task.publish_title': '📝 发布任务',
        'task.title_label': '📌 任务标题',
        'task.title_placeholder': '简洁描述您的需求，50字以内',
        'task.desc_label': '📄 任务描述',
        'task.desc_placeholder': '详细描述任务要求、交付标准、参考说明等...',
        'task.images_label': '🖼️ 参考图片（可选，最多6张）',
        'task.add_images': '+ 添加参考图片',
        'task.link_label': '🔗 参考链接（可选）',
        'task.total_price': '💰 总价格',
        'task.deposit_ratio_label': '📊 订金比例',
        'task.deduct_on_assign': '接单时扣除',
        'task.price_min': '最低10积分',
        'task.price_summary': '💡 价格说明',
        'task.price_total': '总价格',
        'task.price_deposit': '订金（指派接单时扣除）',
        'task.price_remaining': '尾款（验收通过时扣除）',
        'task.deadline_label_form': '⏰ 截止日期',
        'task.publish_submit': '🚀 发布任务',
        'task.publish_notice': '发布后可在「任务榜」中管理您的任务',
        'task.title_required': '请输入任务标题',
        'task.desc_required': '请输入任务描述',
        'task.price_min_error': '任务价格不能低于10积分',
        'task.deadline_required': '请选择截止日期',
        'task.publish_uploading': '⏳ 上传图片中...',
        'task.publish_progress': '⏳ 上传图片 ({current}/{total})...',
        'task.publish_submitting': '⏳ 发布中...',
        'task.publish_success': '任务发布成功！',
        'task.publish_failed': '发布失败，请稀后重试',
        'task.max_images': '最多上传6张图片',
        
        // 申诉相关
        'dispute.title': '申诉详情',
        'dispute.status_pending': '等待回应',
        'dispute.status_responded': '等待仲裁',
        'dispute.status_resolved': '已裁决',
        'dispute.task_label': '📋 关联任务',
        'dispute.parties': '👥 争议双方',
        'dispute.publisher': '发布者',
        'dispute.assignee': '接单者',
        'dispute.initiator': '（申诉方）',
        'dispute.respondent': '（被申诉方）',
        'dispute.initiator_statement': '📝 申诉方陈述',
        'dispute.respondent_response': '💬 被申诉方回应',
        'dispute.no_response': '暂无回应',
        'dispute.respond_placeholder': '请输入您的回应说明...',
        'dispute.upload_evidence': '📷 点击上传证据图片（可选）',
        'dispute.submit_response': '提交回应',
        'dispute.submitting': '提交中...',
        'dispute.response_success': '回应已提交',
        'dispute.response_failed': '提交失败',
        'dispute.resolution_title': '⚖️ 仲裁结果',
        'dispute.favor_initiator': '✅ 支持申诉方',
        'dispute.favor_respondent': '❌ 支持被申诉方',
        'dispute.split': '⚖️ 双方协商分成',
        'dispute.split_detail': '申诉方 {ratio}% : 被申诉方 {other}%',
        'dispute.resolved': '已裁决',
        'dispute.resolved_at': '裁决于',
        'dispute.submitted_at': '提交于',
        'dispute.responded_at': '回应于',
        'dispute.reason_required': '请输入申诉理由',
        'dispute.submit_dispute': '提交申诉',
        'dispute.uploading': '⏳ 上传图片 ({current}/{total})...',
        'dispute.submitting_dispute': '⏳ 提交申诉...',
        'dispute.dispute_success': '申诉已提交，等待对方回应',
        'dispute.dispute_failed': '申诉失败',
        'dispute.dialog_title': '⚖️ 发起申诉',
        'dispute.reason_label': '申诉理由',
        'dispute.evidence_label': '证据图片（可选，最多6张）',
        'dispute.notice_title': '⚠️ 注意事项：',
        'dispute.notice_1': '申诉后任务将进入争议状态，等待管理员仲裁',
        'dispute.notice_2': '对方将有机会回应您的申诉',
        'dispute.notice_3': '请提供真实有效的证据',
        'dispute.max_images': '最多上传6张图片',
        
        // 管理员仲裁
        'arbitrate.title': '⚖️ 申诉仲裁中心',
        'arbitrate.tab_all': '全部',
        'arbitrate.tab_pending': '待回应',
        'arbitrate.tab_responded': '待裁决',
        'arbitrate.tab_resolved': '已裁决',
        'arbitrate.loading': '⏳ 加载中...',
        'arbitrate.empty': '暂无申诉记录',
        'arbitrate.load_failed': '❌ 加载失败',
        'arbitrate.initiator_role': '申诉方',
        'arbitrate.resolve_title': '🔨 裁决操作',
        'arbitrate.option_favor_initiator': '支持申诉方',
        'arbitrate.option_favor_respondent': '支持被申诉方',
        'arbitrate.option_split': '协商分成',
        'arbitrate.option_split_desc': '按比例分配给双方',
        'arbitrate.ratio_label': '申诉方获得',
        'arbitrate.resolve_note': '裁决说明（可选）',
        'arbitrate.resolve_confirm': '确认裁决',
        'arbitrate.resolving': '处理中...',
        'arbitrate.resolve_success': '裁决成功',
        'arbitrate.resolve_failed': '裁决失败',
        
        // 讨论区/帖子
        'post.title': '讨论区',
        'post.publish': '✏️ 发布作品',
        'post.loading': '加载中...',
        'post.load_more': '加载更多',
        'post.no_posts': '还没有人发布作品',
        'post.be_first': '成为第一个分享创作的人吧！',
        'post.load_failed': '加载失败，请稍后重试',
        'post.network_cache': '网络异常，已加载本地缓存',
        'post.login_first': '请先登录后再发布作品',
        
        // 帖子详情
        'post.sort_latest': '最新',
        'post.sort_likes': '👍 最多点赞',
        'post.sort_favorites': '⭐ 最多收藏',
        'post.sort_tips': '💰 打赏榜',
        'post.sort_views': '🔥 浏览总量',
        'post.sort_daily_views': '🔥 今日热门',
        'post.detail_title': '📄 作品详情',
        'post.not_exist': '帖子不存在或已被删除',
        'post.load_detail_failed': '加载失败',
        'post.liked': '已点赞',
        'post.favorited': '已收藏',
        'post.tip_author': '🎁 打赏',
        'post.tip_dialog_title': '🎁 打赏作者',
        'post.tip_self': '不能打赏自己的作品',
        'post.tip_success': '成功打赏 {amount} 积分',
        'post.tip_failed': '打赏失败',
        'post.comments_title': '💬 评论',
        'post.comment_placeholder': '写下你的评论...',
        'post.no_comments': '暂无评论，来说两句吧～',
        'post.comment_loading': '加载评论中...',
        'post.comment_load_failed': '加载评论失败',
        'post.comment_required': '请输入评论内容',
        'post.comment_sending': '发送中...',
        'post.comment_success': '评论成功',
        'post.comment_failed': '评论失败',
        'post.tip_board_title': '🎁 打赏榜',
        'post.no_tips': '🎁 暂无打赏记录',
        
        // 发布帖子
        'post.publish_title': '✏️ 发布作品',
        'post.publish_submit': '🚀 发布',
        'post.images_label': '🖼️ 上传图片',
        'post.images_required': '（最多9张，第一张为封面）',
        'post.images_placeholder': '点击或拖拽上传图片',
        'post.title_label': '📝 标题',
        'post.title_placeholder': '给你的作品起个标题...',
        'post.content_label': '✍️ 正文',
        'post.content_placeholder': '分享你的创作心得、使用技巧...',
        'post.notice_title': '💡 发布须知：',
        'post.notice_1': '请上传原创作品或标明出处',
        'post.notice_2': '图片将自动压缩优化',
        'post.notice_3': '发布后可在个人中心管理',
        'post.cover': '封面',
        'post.images_required_error': '请至少上传一张图片',
        'post.title_required': '请输入标题',
        'post.uploading': '⏳ 上传图片中...',
        'post.upload_progress': '⏳ 上传图片 ({current}/{total})...',
        'post.submitting': '⏳ 发布中...',
        'post.publish_success': '发布成功！',
        'post.publish_failed': '发布失败',
        
        // 通用补充 - 组件使用
        'common.message': '私信',
        'common.credits': '积分',
        'common.unknown': '未知',
        'common.load_failed': '加载失败',
        
        // 🎰 打赏等级
        'tip.new_fan': '新粉丝',
        'tip.supreme_sponsor': '至尊赞助者',
        'tip.points': '积分',
        
        // 📊 图表
        'chart.loading': '正在加载图表...',
        'chart.load_failed': '图表库加载失败',
        
        // 🖼️ 图片
        'image.loading': '加载中...',
        'image.load_failed': '图片加载失败',
        'image.load_timeout': '加载超时',
        'image.gallery': '效果展示图',
        'common.operation_failed': '操作失败',
        'common.login_required': '请登录后操作',
        'common.publish': '发布',
        'common.confirm_submit': '确认提交',
        'common.uploading': '上传中',
        'common.upload_progress': '上传 ({current}/{total})',
        'common.submitting': '提交中',
        'common.upload_image_progress': '上传图片 ({current}/{total})',
        'common.unknown_task': '未知任务',
        
        // 任务详情补充
        'task.description': '任务描述',
        'task.reference_images': '参考图片',
        'task.reference_link': '参考链接',
        'task.assignee': '接单者',
        'task.note': '备注',
        'task.applicants_count': '人',
        'task.choose_assignee': '选择TA',
        'task.confirm_assign': '确定选择 {assignee} 作为接单者吗？',
        'task.confirm_deposit': '将从您的账户扣除订金 {amount} 积分',
        'task.apply_message_prompt': '请输入申请留言（可选）：',
        'task.confirm_cancel_apply': '确定撤回申请吗？',
        'task.apply_cancelled': '已撤回申请',
        'task.cancel_apply_failed': '撤回失败',
        'task.confirm_cancel_task': '确定取消任务吗？此操作不可撤销。',
        'task.task_cancelled': '任务已取消',
        'task.cancel_task_failed': '取消失败',
        'task.confirm_accept': '确定验收通过吗？',
        'task.confirm_pay_remaining': '将支付尾款 {amount} 积分给接单者',
        'task.reject_reason_prompt': '请输入不通过的原因：',
        'task.work_returned': '已退回修改',
        'task.submit_work': '提交成果',
        'task.deliverable_images': '交付图片',
        'task.support_multiple_images': '支持多张图片',
        'task.note_optional': '备注说明（可选）',
        'task.note_placeholder': '对交付内容的说明...',
        'task.please_upload_deliverables': '请上传交付图片',
        'task.upload_failed_retry': '图片上传失败，请重试',
        'task.submit_success_waiting': '成果已提交，等待发布者验收',
        'task.start_dispute': '发起申诉',
        'task.view_dispute': '查看申诉详情',
        'task.accept_work': '验收通过',
        'task.reject_work': '验收不通过',
        
        // 发布任务补充
        'task.task_title': '任务标题',
        'task.title_placeholder': '简洁描述您的需求，50字以内',
        'task.description_placeholder': '详细描述任务要求、交付标准、参考说明等...',
        'task.reference_images_optional': '参考图片（可选，最多6张）',
        'task.add_reference_image': '添加参考图片',
        'task.reference_link_optional': '参考链接（可选）',
        'task.deposit_ratio': '订金比例',
        'task.min_10_credits': '最低10积分',
        'task.deposit_deducted_on_assign': '接单时扣除',
        'task.price_description': '价格说明',
        'task.deposit_on_assign': '订金（指派接单时扣除）',
        'task.remaining_on_accept': '尾款（验收通过时扣除）',
        'task.publish_task': '发布任务',
        'task.manage_in_task_list': '发布后可在「任务榜」中管理您的任务',
        'task.please_enter_title': '请输入任务标题',
        'task.please_enter_description': '请输入任务描述',
        'task.price_min_10': '任务价格不能低于10积分',
        'task.please_select_deadline': '请选择截止日期',
        'task.uploading_images': '上传图片中',
        'task.upload_progress': '上传图片 ({current}/{total})',
        'task.publishing': '发布中',
        'task.max_6_images': '最多上传6张图片',
        
        // 申诉详情补充
        'dispute.start': '发起申诉',
        'dispute.reason': '申诉理由',
        'dispute.reason_placeholder': '请详细说明您的申诉理由...',
        'dispute.evidence_optional': '证据图片（可选，最多6张）',
        'dispute.click_upload_evidence': '点击上传证据图片',
        'dispute.submit': '提交申诉',
        'dispute.submit_success': '申诉已提交，等待对方回应',
        'dispute.submit_failed': '申诉失败',
        'dispute.max_6_images': '最多上传6张图片',
        'dispute.please_enter_reason': '请输入申诉理由',
        'dispute.get_detail_failed': '获取申诉详情失败',
        'dispute.related_task': '关联任务',
        'dispute.task_id': '任务ID',
        'dispute.click_upload_evidence_optional': '点击上传证据图片（可选）',
        'dispute.resolution_result': '仲裁结果',
        'dispute.upload_failed': '上传失败',
        'dispute.please_enter_response': '请输入回应内容',
        'dispute.response_submitted': '回应已提交',
        'dispute.split_result': '双方协商分成',
        
        // 管理员仲裁补充
        'arbitrate.center': '申诉仲裁中心',
        'arbitrate.all': '全部',
        'arbitrate.pending_response': '待回应',
        'arbitrate.pending_ruling': '待裁决',
        'arbitrate.ruled': '已裁决',
        'arbitrate.no_disputes': '暂无申诉记录',
        'arbitrate.no_reason': '无申诉理由',
        'arbitrate.initiator': '申诉方',
        'arbitrate.ruling_operation': '裁决操作',
        'arbitrate.refund_publisher': '退还发布者订金',
        'arbitrate.assignee_full_pay': '接单者获得全款',
        'arbitrate.negotiate_split': '协商分成',
        'arbitrate.split_desc': '按比例分配给双方',
        'arbitrate.ruling_note_optional': '裁决说明（可选）',
        'arbitrate.confirm_ruling': '确认裁决',
        'arbitrate.ruling_success': '裁决成功',
        'arbitrate.ruling_failed': '裁决失败',
        
        // 管理员提现管理
        'withdraw.manage_title': '提现管理',
        'withdraw.pending_payment': '待打款',
        'withdraw.completed': '已完成',
        'withdraw.pending': '待打款',
        'withdraw.no_pending': '暂无待打款提现申请',
        'withdraw.no_completed': '暂无已完成提现记录',
        'withdraw.alipay_account': '支付宝账号',
        'withdraw.real_name': '收款人姓名',
        'withdraw.apply_time': '申请时间',
        'withdraw.enter_order_id': '请输入打款订单号',
        'withdraw.confirm_payment': '确认打款',
        'withdraw.payment_completed': '打款完成',
        'withdraw.order_id': '订单号',
        'withdraw.order_required': '请输入打款订单号',
        'withdraw.confirm_title': '确认已打款?',
        'withdraw.confirm_desc': '请确认您已完成实际转账操作后再点击确认',
        'withdraw.payment_success': '打款确认成功',
        'withdraw.payment_failed': '打款确认失败',
        
        // 发布帖子补充
        'post.upload_images': '上传图片',
        'post.max_9_images': '最多9张，第一张为封面',
        'post.click_upload': '点击或拖拽上传图片',
        'post.title_label': '标题',
        'post.content_label': '正文',
        'post.publish_notice': '发布须知',
        'post.notice_original': '请上传原创作品或标明出处',
        'post.notice_compress': '图片将自动压缩优化',
        'post.notice_manage': '发布后可在个人中心管理',
        'post.cover': '封面',
        'post.error_no_image': '请至少上传一张图片',
        'post.error_no_title': '请输入标题',
        'post.uploading_images': '上传图片中',
        'post.uploading_progress': '上传图片 ({current}/{total})',
        'post.compressing_images': '压缩图片中',
        'post.compressing_progress': '压缩图片 ({current}/{total})',
        'post.publishing': '发布中',
                'post.edit_title': '编辑帖子',
                'post.title_label': '标题',
                'post.content_label': '内容',
                'post.edit_success': '修改成功',
                'post.edit_failed': '修改失败',
                'post.delete_confirm_title': '确认删除',
                'post.delete_confirm_desc': '删除后无法恢复，确定要删除这篇帖子吗？',
                'post.delete_success': '删除成功',
                'post.delete_failed': '删除失败',
        
        // 发布内容
        'publish.new_content': '发布新内容',
        'publish.edit_content': '修改发布内容',
        'publish.save_changes': '保 存 修 改',
        'publish.confirm_publish': '确 认 发 布',
        'publish.main_category': '主类别',
        'publish.type_tool': '原创插件 / 工具',
        'publish.type_app': '原创工作流 / 应用',
        'publish.type_recommend': '推荐他人作品',
        'publish.recommend_form': '推荐形式 (三选一)',
        'publish.recommend_as_tool': '作为工具 (支持Git安装)',
        'publish.recommend_as_app': '作为应用 (加载JSON)',
        'publish.recommend_as_link': '纯链接 (新窗口打开)',
        'publish.name': '名称',
        'publish.name_placeholder': '例如：强烈推荐飞行翻译双语增强版！',
        'publish.short_desc': '简短描述 (一句话介绍)',
        'publish.short_desc_placeholder': '最多 50 字，突出核心亮点...',
        'publish.resource_type': '资源接入',
        'publish.resource_link': '外部链接 / Git',
        'publish.resource_json': '上传 JSON',
        'publish.resource_netdisk': '网盘链接',
        'publish.source_url': '源地址或外部 URL',
        'publish.source_url_placeholder': '输入外部地址或Git库链接...',
        'publish.select_json': '选择 JSON 文件',
        'publish.has_cloud_file': '已包含云端文件，重新选择将覆盖',
        'publish.netdisk_link': '网盘链接',
        'publish.netdisk_placeholder': '粘贴百度网盘/阿里云盘等分享链接...',
        'publish.netdisk_password': '网盘提取码 (可选)',
        'publish.netdisk_password_placeholder': '填写网盘密码，如：1234',
        'publish.security_guarantee': '安全保障',
        'publish.password_encrypted_hint': '密码加密存储于云端，仅在用户成功购买后所解密显示。未购买用户无法通过任何接口获取。',
        'publish.private_repo_hint': '这是一个私有 GitHub 仓库（需配置访问密钥）',
        'publish.pat_label': '私有库专属访问密钥 (PAT)',
        'publish.pat_hint': '系统使用此 Token 替购买者拉取源码。该密钥仅存储于云端后台，<span style="color:#F44336; font-weight:bold;">绝对不会在前端接口中公开暴露</span>。',
        'publish.effect_images': '效果展示图 (最多6张，可选)',
        'publish.reselect_override': '重新选择将覆盖原图',
        'publish.drag_select_hint': '支持拖拽多选，第一张将作为封面图',
        'publish.price': '标价 (积分)',
        'publish.price_hint': '填写 0 代表免费开源。',
        'publish.price_delay_hint': '修改价格将24小时后生效',
        'publish.full_desc': '详细说明',
        'publish.full_desc_placeholder': '介绍具体功能、使用方法、前置环境要求等...',
        'publish.current_price': '当前价格',
        'publish.will_change_in': '将在',
        'publish.hours_later': '小时后变更为',
        // 发布提交引擎
        'publish.processing_avatar': '正在本地处理和压缩头像...',
        'publish.uploading_file': '正在上传文件 {size}KB 至云端...',
        'publish.upload_success': '文件上传成功！',
        'publish.upload_failed': '文件上传失败',
        'publish.upload_error': '上传过程出现异常',
        'publish.pat_required': '勾选了私有仓库，请务必填写 PAT 访问密钥！',
        'publish.name_desc_required': '请填写名称和简短描述！',
        'publish.link_required': '第三方链接必须提供源地址！',
        'publish.git_required': '必须提供 Git 安装地址！',
        'publish.json_required': '必须上传工作流 JSON 文件！',
        'publish.netdisk_required': '必须填写网盘链接！',
        'publish.connecting': '正在连接云端...',
        'publish.uploading_secure': '正在安全上传文件...',
        'publish.uploading_images': '正在上传图片 ({current}/{total})...',
        'publish.syncing': '正在同步全网数据库...',
        'publish.save_success': '修改已保存并同步全网！',
        'publish.publish_success': '发布成功！您的作品已全网同步。',
        
        // 🌐 个人中心页面
        'profile.back': '返回',
        'profile.recharge': '充值积分',
        'profile.withdraw': '收益提现',
        'profile.settings': '设置',
        'profile.logout': '登出',
        'profile.balance': '余额',
        'profile.sales': '销售',
        'profile.tips': '打赏',
        'profile.task_earnings': '任务收益',
                
        // 个人列表
        'profile.privacy_hidden': '由于作者的隐私设置，该列表不对外公开',
        'profile.no_following': '暂无关注的人',
        'profile.loading_users': '正在加载用户数据...',
        'profile.load_failed': '数据加载失败',
        'profile.homepage': '主页',
        'profile.update_available': '可更新',
        'profile.installed': '已安装',
        'profile.tip_stats': '打赏统计',
        'profile.tip_received': '收到打赏',
        'profile.tip_sent': '打赏支出',
        'profile.net_tips': '净打赏',
        'profile.sales_stats': '销售统计',
        'profile.sales_income': '销售收入',
        'profile.purchase_expense': '购买支出',
        'profile.net_sales': '净销售',
        'profile.transactions_unit': '笔',
        'profile.received_likes': '获赞',
        'profile.received_favorites': '收藏',
        'profile.followers_count': '粉丝',
        'profile.following_count': '关注',
        'profile.tip_support': '打赏支持',
        'profile.send_message': '私信',
        'profile.follow_author': '关注作者',
        'profile.followed': '已关注',
        'profile.creator_tip_board': '创作者赞赏总榜 (TOP 10)',
        'profile.age_years': '岁',
        'profile.location_secret': '保密',
        'profile.no_intro': '这个人很懒，什么都没写...',
        'profile.unknown_age': '未知',
        
        // 🌐 编辑资料与隐私设置
        'settings_form.title': '编辑资料与隐私设置',
        'settings_form.change_avatar': '更换头像',
        'settings_form.avatar_hint': '支持 JPG/PNG，将在本地自动裁剪为 1:1 并压缩。',
        'settings_form.banner_title': '个人资料卡背景图',
        'settings_form.banner_upload': '上传并裁剪',
        'settings_form.banner_clear': '清除',
        'settings_form.banner_hint': '比例 16:9，可缩放拖动裁剪，压缩后上传云端。',
        'settings_form.ui_bg_title': '界面背景（仅本地）',
        'settings_form.ui_bg_hint': '比例 9:16，仅保存在本地，不占用云端空间。',
        'settings_form.display_name': '显示名称',
        'settings_form.gender': '性别',
        'settings_form.gender_male': '男 (Male)',
        'settings_form.gender_female': '女 (Female)',
        'settings_form.gender_secret': '保密 (Secret)',
        'settings_form.birthday': '出生日期 (选填)',
        'settings_form.country': '国家/地区',
        'settings_form.select_country': '请选择国家',
        'settings_form.select_country_first': '请先选择国家',
        'settings_form.intro': '个人简介',
        'settings_form.intro_placeholder': '介绍一下你自己...',
        'settings_form.privacy_title': '隐私设置',
        'settings_form.privacy_hint': '您可以选择向其他用户隐藏您在社区的足迹（不影响您自己查看）。',
        'settings_form.hide_follows': '不公开我关注的人',
        'settings_form.hide_likes': '不公开我点赞过的内容',
        'settings_form.hide_favorites': '不公开我收藏的内容',
        'settings_form.hide_downloads': '不公开我获取的记录',
        'settings_form.admin_title': '管理员设置',
        'settings_form.admin_hint': '以下设置影响整个平台，请谨慎操作。',
        'settings_form.image_moderation': '图像内容审核',
        'settings_form.image_moderation_hint': '启用后上传的图片将自动进行内容安全审核',
        'settings_form.version_title': '工具版本管理',
        'settings_form.version_hint': '统一修改项目阶段与版本号，将同步更新所有相关位置',
        'settings_form.project_stage': '项目阶段',
        'settings_form.version_number': '版本号',
        'settings_form.apply_version': '应用版本更改',
        'settings_form.cancel': '取消',
        'settings_form.save_all': '保存所有设置',
        'settings_form.save_failed': '设置失败',
        'settings_form.avatar_upload_success': '头像上传成功！请点击底部保存设置生效。',
        'settings_form.banner_cleared': '已清除背景图，请点击底部保存设置生效。'
    },
    
    'en-US': {
        // Common
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.save': 'Save',
        'common.saving': 'Saving...',
        'common.delete': 'Delete',
        'common.deleting': 'Deleting...',
        'common.edit': 'Edit',
        'common.close': 'Close',
        'common.reset': 'Reset',
        'common.loading': 'Loading...',
        'common.chars': 'chars',
        'common.digits': 'digits',
        'common.success': 'Success',
        'common.error': 'Error',
        'common.retry': 'Retry',
        'common.retrying': 'Retrying...',
        'common.retry_failed': 'Retry failed, please try again later',
        'common.more': 'More',
        'common.back': 'Back',
        'common.search': 'Search',
        'common.refresh': 'Refresh',
        'common.copy': 'Copy',
        'common.copied': 'Copied',
        'common.share': 'Share',
        'common.download': 'Download',
        'common.upload': 'Upload',
        'common.select': 'Select',
        'common.all': 'All',
        'common.none': 'None',
        'common.yes': 'Yes',
        'common.no': 'No',
        'common.ok': 'OK',
        'common.send': 'Send',
        'common.reset': 'Reset',
        'common.install': 'Install',
        'common.installed': 'Installed',
        'common.update': 'Update',
        'common.free': 'Free',
        'common.paid': 'Paid',
        
        // Navigation
        'nav.tools': 'Tools',
        'nav.apps': 'Apps',
        'nav.creators': 'Creators',
        'nav.recommends': 'Discover',
        'nav.posts': 'Forum',
        'nav.tasks': 'Tasks',
        'nav.profile': 'Profile',
        'nav.settings': 'Settings',
        'nav.login': 'Login / Register',
        'nav.logout': 'Logout',
        'nav.notifications': 'Notifications',
        'nav.community': 'Ranking',
        
        // Settings
        'settings.title': 'Settings',
        'settings.general': 'General',
        'settings.display': 'Display',
        'settings.animation': 'Animation & Sound',
        'settings.language': 'Language',
        'settings.language_desc': 'Select display language',
        'settings.creator_banner': 'Creator Card Banner',
        'settings.creator_banner_desc': 'Show personal banner on creator cards, disable for minimal style',
        'settings.animations': 'List Animations',
        'settings.animations_desc': 'Enable sci-fi loading animations when switching tabs',
        'settings.sound': 'Sound Effects',
        'settings.sound_desc': 'Enable sound effects with animations (requires animations)',
        'settings.auto_save': 'Settings are saved automatically',
        'settings.language_changed': 'Language changed to',
        'settings.animation_preview': 'Animation Preview',
        'settings.anim_cascade': 'Tools/Apps/Discover: Cascade from left to right',
        'settings.anim_fan': 'Creators: Fan out from bottom',
        'settings.anim_abyss': 'Forum: 3D abyss convergence',
        'settings.anim_dataflow': 'Tasks: Data flow alternating slides',
        'settings.enabled': 'Enabled',
        'settings.disabled': 'Disabled',
        'settings.data_cache': '💾 Data & Cache',
        'settings.cache_expire': 'Data Refresh Interval (seconds)',
        'settings.cache_expire_desc': 'Set the local cache refresh interval. Data will be silently updated in the background when switching tabs after expiry. Minimum 60 seconds, maximum 86400 seconds (1 day).',
        'settings.cache_trigger_desc': 'When the cache exceeds the set time, switching tabs will automatically fetch the latest data in the background and update silently without affecting usability. Manual refresh is not affected by this setting.',
        
        // Auth
        'auth.login': 'Login',
        'auth.title': 'Community Account',
        'auth.register': 'Register',
        'auth.logout': 'Logout',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.confirm_password': 'Confirm Password',
        'auth.username': 'Username',
        'auth.nickname': 'Nickname',
        'auth.forgot_password': 'Forgot Password?',
        'auth.reset_password': 'Reset Password',
        'auth.verification_code': 'Verification Code',
        'auth.send_code': 'Send Code',
        'auth.resend_code': 'Resend',
        'auth.login_success': 'Login successful',
        'auth.register_success': 'Registration successful',
        'auth.logout_success': 'Logged out',
        'auth.password_mismatch': 'Passwords do not match',
        'auth.invalid_email': 'Invalid email format',
        'auth.weak_password': 'Password too weak',
        'auth.account_exists': 'Account already exists',
        'auth.invalid_credentials': 'Invalid credentials',
        'auth.login_required': 'Please login first!',
        'auth.resetting_password': 'Resetting password...',
        'auth.password_reset_success': 'Password changed! Please login with new password.',
        'auth.uploading_avatar': 'Uploading avatar...',
        'auth.registering': 'Registering...',
        'auth.auto_login': '! Auto logging in...',
        'common.unknown_user': 'Unknown User',
        'auth.agree_terms': 'I have read and agree to the',
        'auth.terms': 'Terms of Service',
        'auth.and': 'and',
        'auth.privacy': 'Privacy Policy',
        'auth.account': 'Account',
        'auth.remember_me': 'Stay logged in for 30 days',
        'auth.no_account': 'No account?',
        'auth.register_now': 'Register now',
        'auth.account_password_required': 'Account and password are required!',
        'auth.display_name': 'Display Name',
        'auth.set_password': 'Set Password',
        'auth.security_email': 'Security Email',
        'auth.security_email_desc': 'For receiving verification code',
        'auth.get_code': 'Get Code',
        'auth.resend': 'Resend',
        'auth.avatar': 'Avatar',
        'auth.gender': 'Gender',
        'auth.male': 'Male',
        'auth.female': 'Female',
        'auth.birthday': 'Birthday',
        'auth.age_years': 'years old',
        'auth.country': 'Country',
        'auth.region': 'Region',
        'auth.intro': 'Bio',
        'auth.intro_limit': 'Max 100 chars',
        'auth.register_submit': 'Register',
        'auth.has_account': 'Have an account?',
        'auth.back_to_login': 'Back to login',
        'auth.file_too_large': 'File exceeds 3MB!',
        'auth.code_sent': 'Verification code sent to your email',
        'auth.sending': 'Sending...',
        'auth.required_fields': 'Fields with * are required!',
        'auth.invalid_code': 'Please enter a valid 6-digit code!',
        'auth.account_format_error': 'Account must be >5 chars, only letters, numbers and underscore!',
        'auth.password_format_error': 'Password must be at least 6 characters!',
        'auth.new_password': 'New Password',
        'auth.reset_submit': 'Reset Password',
        'auth.reset_desc': 'Enter your security email to reset password',
        'auth.verification_code': 'Verification Code',
        'auth.phone': 'Phone Number',
        'auth.invalid_email': 'Please enter a valid email!',
        'auth.confirm_password': 'Confirm Password',
        'auth.password_mismatch': 'Passwords do not match!',
        'auth.current_account': 'Current Account',
        'auth.enter_account': 'Enter account to modify',
        'auth.security_verify': 'Security Verification',
        'auth.bound_email': 'Bound Email',
        'auth.enter_bound_email': 'Enter your bound security email',
        'auth.enter_6_digit_code': 'Enter 6-digit code',
        'auth.old_password': 'Old Password',
        'auth.old_password_tip': 'Leave empty if recovering',
        'auth.old_password_placeholder': 'Leave empty if forgot',
        'auth.confirm_new_password': 'Confirm New Password',
        'auth.change_password': 'Change Password',
        'auth.enter_account_first': 'Please enter the account first!',
        'auth.reset_required_fields': 'Account, verification and new password are required!',
        
        // Profile
        'profile.my_profile': 'My Profile',
        'profile.my_published': 'My Published',
        'profile.their_published': 'Their Published',
        'profile.my_purchased': 'My Purchases',
        'profile.my_tasks': 'My Tasks',
        'profile.transactions': 'Transactions',
        'profile.my_posts': 'My Posts',
        'profile.recent_likes': 'Recent Likes',
        'profile.following': 'Following',
        'profile.max_privilege': ' Max Privilege',
        'profile.beta_max_privilege': 'Beta Max Privilege',
        'profile.edit_profile': 'Edit Profile',
        'profile.my_works': 'My Works',
        'profile.my_purchases': 'Purchased',
        'profile.my_favorites': 'Favorites',
        'profile.my_following': 'Following',
        'profile.my_followers': 'Followers',
        'profile.my_wallet': 'Wallet',
        'profile.transactions': 'Transactions',
        'profile.statistics': 'Statistics',
        'profile.followers': 'Followers',
        'profile.following': 'Following',
        'profile.works': 'Works',
        'profile.likes': 'Likes',
        'profile.bio': 'Bio',
        'profile.location': 'Location',
        'profile.website': 'Website',
        'profile.joined': 'Joined',
        'profile.follow': 'Follow',
        'profile.unfollow': 'Unfollow',
        'profile.message': 'Message',
        'profile.block': 'Block',
        'profile.report': 'Report',
        
        // Form
        'form.title': 'Title',
        'form.description': 'Description',
        'form.price': 'Price',
        'form.submit': 'Submit',
        'form.draft_found': 'Draft found. Restore?',
        'form.draft_restored': 'Draft restored',
        'form.draft_cleared': 'Draft cleared',
        'form.required': 'Required',
        'form.optional': 'Optional',
        'form.placeholder': 'Enter...',
        
        // Wallet
        'wallet.balance': 'Balance',
        'wallet.recharge': 'Recharge',
        'wallet.withdraw': 'Withdraw',
        'wallet.tip': 'Tip',
        'wallet.purchase': 'Purchase',
        'wallet.income': 'Income',
        'wallet.expense': 'Expense',
        'wallet.points': 'Points',
        'wallet.sales': 'Sales',
        'wallet.tips_received': 'Tips Received',
        
        // Transaction Types
        'tx.withdraw': '💸 Withdrawal Request',
        'tx.tip_in': '🎁 Tip Received',
        'tx.tip_out': '🎁 Tip Sent',
        'tx.purchase': '🛒 Purchase',
        'tx.task_deposit': '📋 Task Deposit',
        'tx.task_payment': '📋 Task Payment',
        'tx.task_income': '📋 Task Income',
        'tx.task_freeze': '🔒 Task Frozen',
        'tx.task_refund': '↩️ Task Refund',
        'tx.task_cancel_refund': '🔄 Task Cancel Refund',
        'tx.recharge': '💰 Recharge',
        'tx.refund': '↩️ Refund',
        'tx.withdraw_fee': '💸 Withdrawal Fee',
        'tx.withdraw_pending': 'Pending',
        'tx.withdraw_completed': 'Completed',
        'tx.recharge_desc': 'Alipay Recharge',
        'tx.withdraw_fee_desc': 'Withdrawal Fee',
        'tx.net_amount': 'Net Amount',
        
        // Recharge
        'wallet.recharge.title': '💰 Points Recharge Center',
        'wallet.recharge.current_balance': 'Current Account Balance',
        'wallet.recharge.select_amount': 'Select Recharge Amount',
        'wallet.recharge.exchange_rate': '(1 Point = ¥1)',
        'wallet.recharge.points_suffix': 'Points',
        'wallet.recharge.price_prefix': '¥',
        'wallet.recharge.custom': 'Custom',
        'wallet.recharge.any_amount': 'Any Amount',
        'wallet.recharge.payment_method': 'Payment Method',
        'wallet.recharge.alipay': '📘 Alipay',
        'wallet.recharge.wechat': '📗 WeChat Pay (Coming Soon)',
        'wallet.recharge.get_qr': 'Get Payment QR Code',
        'wallet.recharge.connecting': '⏳ Connecting to payment gateway...',
        'wallet.recharge.scan_to_pay': 'Please scan with mobile to pay',
        'wallet.recharge.yuan': 'CNY',
        'wallet.recharge.auto_redirect': 'Will auto-redirect after payment, please keep this window open',
        'wallet.recharge.invalid_amount': 'Please enter a valid amount (1-999999)!',
        'wallet.recharge.order_failed': '❌ Failed to create order: ',
        'wallet.recharge.success': '✅ Recharge successful! {points} points credited.',
        'wallet.recharge.custom_placeholder': 'Enter custom amount (1~999999)',
        
        // Withdraw
        'wallet.withdraw.title': '💳 Earnings Withdrawal Center',
        'wallet.withdraw.total_withdrawable': 'Total Withdrawable Points',
        'wallet.withdraw.rmb_equivalent': 'Equivalent in RMB (Before Fees)',
        'wallet.withdraw.amount_label': 'Withdrawal Amount (Points)',
        'wallet.withdraw.amount_placeholder': '1 Point = 1 CNY',
        'wallet.withdraw.alipay_account': 'Alipay Account for Payment',
        'wallet.withdraw.alipay_placeholder': 'Phone or Email',
        'wallet.withdraw.real_name': 'Real Name (Must Match Alipay ID)',
        'wallet.withdraw.real_name_placeholder': "Payee's Real Name",
        'wallet.withdraw.security_code': 'Security Code (Will Be Sent to Your Email)',
        'wallet.withdraw.code_placeholder': '6-digit Code',
        'wallet.withdraw.get_code': 'Get Code',
        'wallet.withdraw.sending': 'Sending...',
        'wallet.withdraw.resend_in': 'Resend in {seconds}s',
        'wallet.withdraw.confirm': 'Confirm Withdrawal (Funds Will Be Frozen for Review)',
        'wallet.withdraw.submitting': '⏳ Submitting...',
        'wallet.withdraw.no_balance': 'Your withdrawable balance is 0. Publish quality tools to earn points!',
        'wallet.withdraw.min_amount': 'Minimum withdrawal is 1 point!',
        'wallet.withdraw.fill_account': 'Please fill in both Alipay account and real name!',
        'wallet.withdraw.invalid_code': 'Please enter a valid 6-digit code!',
        'wallet.withdraw.code_sent': 'Code sent! Please check your email (including spam folder)',
        'wallet.withdraw.code_failed': 'Send failed: ',
        'wallet.withdraw.success': '🎉 Withdrawal submitted! Funds will be transferred within 1-3 business days.',
        'wallet.withdraw.submit_failed': 'Submit failed: ',
        'wallet.withdraw.fee_free_quota': '🎉 You enjoy fee-free withdrawal up to 100 CNY!',
        'wallet.withdraw.fee_full_amount': 'Expected full amount: ',
        'wallet.withdraw.fee_quota_exhausted': '⚠️ Free quota (100 points) has been used.',
        'wallet.withdraw.fee_deducted': '10% platform fee will be deducted: ',
        'wallet.withdraw.fee_actual': 'Expected amount after fee: ',
        'wallet.withdraw.yuan': 'CNY',
        
        // Market
        'market.latest': 'Latest',
        'market.popular': 'Popular',
        'market.downloads': 'Downloads',
        'market.favorites': 'Favorites',
        'market.publish': 'Publish',
        'market.detail': 'Details',
        'market.comments': 'Comments',
        'market.reviews': 'Reviews',
        'market.like': 'Like',
        'market.liked': 'Liked',
        'market.favorite': 'Favorite',
        'market.favorited': 'Favorited',
        'market.views': '🔥 Most Viewed',
        'market.daily_views': '🔥 Trending Today',
        'market.install_now': 'Install Now',
        'market.load_workflow': 'Load Workflow',
        'market.price_free': 'Free',
        'market.price_unit': 'pts',
        'market.tips_ranking': 'Top Tipped',
        
        // Social
        'social.chat': 'Chat',
        'social.messages': 'Messages',
        'social.notifications': 'Notifications',
        'social.comment': 'Comment',
        'social.reply': 'Reply',
        'social.share': 'Share',
        'social.mention': 'Mention',
        'social.new_message': 'New Message',
        'social.no_messages': 'No messages',
        'social.type_message': 'Type a message...',
        
        // Task
        'task.create': 'Create Task',
        'task.apply': 'Apply',
        'task.deposit': 'Deposit',
        'task.final_payment': 'Final Payment',
        'task.deadline': 'Deadline',
        'task.budget': 'Budget',
        'task.status': 'Status',
        'task.pending': 'Pending',
        'task.in_progress': 'In Progress',
        'task.completed': 'Completed',
        'task.cancelled': 'Cancelled',
        
        // Feedback
        'feedback.loading': 'Processing...',
        'feedback.success': 'Success',
        'feedback.error': 'Failed, please retry',
        'feedback.network_error': 'Network error',
        'feedback.offline': 'Currently offline',
        'feedback.timeout': 'Request timeout',
        'feedback.saved': 'Saved',
        'feedback.logged_out': 'Logged out',
        'feedback.login_required': 'Please log in first!',
        'feedback.login_required_tip': 'Please log in to tip!',
        'feedback.operation_failed': 'Operation failed: ',
        'feedback.user_fetch_failed': 'Failed to fetch user info. Account may be deleted.',
        
        // Confirm dialogs
        'confirm.logout': 'Are you sure you want to log out?',
        'confirm.delete': 'Are you sure you want to delete?',
        'confirm.yes': 'Yes',
        'confirm.no': 'Cancel',
        
        // Social
        'social.follow': 'Follow Author',
        'social.followed': 'Following',
        'social.unfollow': 'Unfollow',
        'social.send_message': 'Send Message',
        'social.tip_author': 'Tip Author',
        'social.say_something': 'Say something...',
        'social.reply': 'Reply',
        'social.reply_to': 'Reply to',
        'social.comment_deleted': 'This comment has been deleted',
        'social.delete_comment_confirm': 'Are you sure you want to delete this comment? This cannot be undone.',
        'social.no_comments': 'No comments yet. Be the first!',
        
        // Common additions
        'common.send': 'Send',
        'common.delete': 'Delete',
        
        // Feedback additions
        'feedback.send_failed': 'Send failed',
        
        // Notifications
        'notif.login_required': 'Please log in to view messages!',
        'notif.title': 'Messages & Notifications',
        'notif.clear': 'Clear All',
        'notif.no_messages': 'No messages yet',
        'notif.private_msg': 'sent you a private message',
        'notif.followed_you': 'followed you',
        'notif.liked': 'liked your work',
        'notif.favorited': 'favorited your work',
        'notif.commented_on': 'replied to your work',
        'notif.replied_on': 'replied to your comment',
        'notif.purchased': 'purchased your work',
        'notif.income_received': ', income received!',
        'notif.refunded': 'refunded your work',
        'notif.tipped_you': 'tipped you!',
        'notif.task_apply': 'applied for your task',
        'notif.task_assigned': 'You have been assigned',
        'notif.task_submitted': 'submitted task result',
        'notif.task_completed': 'Task completed',
        'notif.task_rejected': 'Task rejected',
        'notif.task_disputed': 'filed a dispute',
        'notif.dispute_responded': 'responded to your dispute',
        'notif.dispute_resolved': 'Dispute resolved',
        'notif.system_announcement': 'System Announcement',
        'notif.clear_confirm': 'Clear all local notifications? Records older than 7 days will not be synced again.',
        'notif.cleared': 'Notifications cleared',
        'notif.plugin_update_title': 'Plugin Update',
        'notif.plugin_update': 'Plugin',
        'notif.click_to_view': 'click to view',
        'notif.item_not_found': 'Item not found or deleted',
        'notif.load_item_failed': 'Failed to load item, please try again later',
        
        // Chat
        'chat.title': 'Private Messages',
        'chat.clear_messages': 'Clear Messages',
        'chat.input_placeholder': 'Type a message...',
        'chat.no_conversations': 'No conversations',
        'chat.me': 'Me',
        'chat.view_profile': 'View profile of',
        
        // Creator
        'creator.no_tips': 'No tips yet',
        'creator.anonymous': 'Anonymous',
        'creator.loading_details': 'Loading details...',
        'creator.load_failed': 'Failed to load',
        'creator.retry': 'Retry',
        'creator.usage_count': 'Used {count} times',
        'creator.stats.likes': 'Likes',
        'creator.stats.favorites': 'Favorites',
        'creator.stats.followers': 'Followers',
        'creator.output.tools': 'Tools',
        'creator.output.apps': 'Apps',
        'creator.output.unit': '',
        'creator.chart.download_trend': '📈 Download Growth Trend',
        'creator.chart.loading': 'Loading chart...',
        'creator.chart.load_failed': 'Chart failed to load',
        'creator.chart.series.tools': 'Tool Downloads',
        'creator.chart.series.apps': 'App Downloads',
        'creator.chart.series.recommends': 'Recommendations',
        'creator.tip_board.title': '🎁 Top Contributors',
        'creator.tip_board.count': '{count} contributors',
        'creator.tip_this_creator': 'Tip this Creator',
        'creator.tip_level_rule': 'Level Rules',
        'creator.cannot_tip_self': 'Cannot tip yourself',
        'creator.tip_login_required': 'Please login first',
        'creator.message_board': '💬 Creator Message Board',
        'creator.visit_profile': 'Visit profile',
        
        // Common additions
        'common.back': 'Back',
        
        // Admin
        'admin.empty_content': 'Announcement cannot be empty!',
        'admin.announce_confirm': 'Notice:\n\n1. Content will be sent to all users and cannot be revoked.\n2. Content will be displayed prominently in notification center.\n\n⚠️ Please ensure accuracy!',
        'admin.publishing': 'Publishing',
        'admin.publish_success': 'System announcement published!',
        'admin.publish_failed': 'Publish failed',
        'admin.confirm_publish': 'Confirm Publish Announcement',
        'admin.enter_script_name': 'Please enter script name!',
        'admin.executing': 'Executing',
        'admin.running': 'Running',
        'admin.exec_success': 'Execution successful',
        'admin.exec_failed': 'Execution failed',
        'admin.execute': 'Execute',
        
        // Market
        'market.uses': 'Uses',
        'market.points': 'Points',
        'market.free': 'Free',
        'market.author': 'Author',
        'market.update_available': 'Update',
        'market.installed': 'Installed',
        'market.get_now': 'Get Now',
        'market.liked': 'Liked',
        'market.like': 'Like',
        'market.favorited': 'Favorited',
        'market.favorite': 'Favorite',
        'market.usage_trend': 'Usage Trend',
        'market.full_description': 'Full Description',
        'market.no_tips_yet': 'No tips yet. Be the first to support!',
        'market.tip_board': 'Top Supporters',
        'market.tip': 'Tip',
        'market.creator_manage': 'Creator Tools',
        'market.edit_content': 'Edit',
        'market.delete_permanently': 'Delete',
        'market.delete_confirm': '🚨 Warning: Are you sure you want to permanently delete this content?<br><br><span style="color:#aaa;">This action is irreversible and all related comments will be deleted.</span>',
        'item.refundable': 'Refundable',
        
        // Time
        'time.hours_later': ' hours effective',
        
        // Feedback additions
        'feedback.deleted': 'Successfully deleted',
        'feedback.delete_failed': 'Delete failed',
        
        // Common
        'common.processing': 'Processing',
        
        // Confirm dialogs
        'confirm.delete_title': 'Confirm Delete',
        'confirm.delete_message': 'This action cannot be undone. Are you sure?',
        'confirm.logout_title': 'Confirm Logout',
        'confirm.logout_message': 'Are you sure you want to logout?',
        
        // Time
        'time.just_now': 'Just now',
        'time.minutes_ago': '{n}m ago',
        'time.hours_ago': '{n}h ago',
        'time.days_ago': '{n}d ago',
        'time.months_ago': '{n}mo ago',
        'time.deadline_today': 'Due today',
        'time.deadline_tomorrow': 'Due tomorrow',
        'time.deadline_days': 'In {n} days',
        'time.deadline_ended': 'Expired',
        'time.unlimited': 'No deadline',
        'time.expired': 'Expired',
        
        // Tasks
        'task.title': 'Tasks',
        'task.publish': '📝 Create Task',
        'task.arbitrate': '⚖️ Arbitrate',
        'task.filter_all': 'All',
        'task.filter_open': '🟢 Open',
        'task.filter_in_progress': '🔵 In Progress',
        'task.filter_submitted': '🟡 Submitted',
        'task.filter_completed': '✅ Completed',
        'task.filter_disputed': '⚠️ Disputed',
        'task.sort_latest': 'Latest',
        'task.sort_price': 'Highest Price',
        'task.sort_deadline': 'Deadline',
        'task.sort_views': '🔥 Most Viewed',
        'task.sort_daily_views': '🔥 Trending Today',
        'task.sort_likes': '👍 Most Liked',
        'task.sort_favorites': '⭐ Most Favorited',
        'task.status_open': 'Open',
        'task.status_in_progress': 'In Progress',
        'task.status_submitted': 'Submitted',
        'task.status_completed': 'Completed',
        'task.status_disputed': 'Disputed',
        'task.status_cancelled': 'Cancelled',
        'task.status_expired': 'Expired',
        'task.status_unknown': 'Unknown',
        'task.overdue': 'Overdue',
        'task.loading': 'Loading...',
        'task.load_more': 'Load More',
        'task.no_tasks': 'No tasks',
        'task.be_first': 'Be the first to create a task!',
        'task.load_failed': 'Failed to load, please retry',
        'task.network_cache': 'Network error, loaded from cache',
        'task.points': 'pts',
        'task.applicants': 'applicants',
        'task.login_first': 'Please login to create tasks',
        
        // Task Detail
        'task.detail_title': 'Task Details',
        'task.deposit_ratio': 'Deposit',
        'task.published_at': 'Published',
        'task.deadline_label': 'Deadline',
        'task.description_label': '📄 Description',
        'task.ref_images': '🖼️ Reference Images',
        'task.ref_link': '🔗 Reference Link',
        'task.assignee_label': '👷 Assignee',
        'task.deliverables': '📦 Deliverables',
        'task.deliverables_note': 'Note',
        'task.applicants_title': '👥 Applicants',
        'task.select_applicant': 'Select',
        'task.assign_confirm': 'Assign {name} as the assignee?\n\nDeposit of {amount} pts will be deducted',
        'task.assign_success': 'Assigned successfully!',
        'task.assign_failed': 'Assignment failed',
        'task.login_to_operate': 'Please login to operate',
        'task.cancel_task': '❌ Cancel Task',
        'task.edit_task': 'Edit Task',
        'task.title_label': 'Task Title',
        'task.description_label': 'Task Description',
        'task.title_required': 'Please enter task title',
        'task.edit_success': 'Task updated successfully',
        'task.edit_failed': 'Failed to update task',
        'task.edit_limited_notice': 'Task has been assigned. Only title, description and reference link can be modified.',
        'task.delete_confirm_title': 'Confirm Delete Task',
        'task.delete_confirm_desc': 'This action cannot be undone. Are you sure you want to delete this task?',
        'task.delete_success': 'Task deleted',
        'task.delete_failed': 'Failed to delete',
        'task.cancel_apply': 'Withdraw',
        'task.apply_task': '🙋 Apply',
        'task.submit_result': '📤 Submit Result',
        'task.accept': '✅ Accept',
        'task.reject': '❌ Reject',
        'task.dispute': '⚖️ Dispute',
        'task.view_dispute': '⚖️ View Dispute',
        'task.apply_message': 'Enter application message (optional):',
        'task.apply_success': 'Applied successfully!',
        'task.apply_failed': 'Application failed',
        'task.cancel_apply_confirm': 'Withdraw application?',
        'task.cancel_apply_success': 'Application withdrawn',
        'task.cancel_apply_failed': 'Withdrawal failed',
        'task.cancel_confirm': 'Cancel this task? This cannot be undone.',
        'task.cancel_success': 'Task cancelled',
        'task.cancel_failed': 'Cancellation failed',
        'task.accept_confirm': 'Accept deliverables?\n\nFinal payment of {amount} pts will be paid',
        'task.accept_success': 'Accepted! Payment sent',
        'task.reject_reason': 'Enter rejection reason:',
        'task.reject_success': 'Sent back for revision',
        'task.operation_failed': 'Operation failed',
        'task.private_message': '💬 Message',
        'task.post_not_exist': 'Post not found or deleted',
        
        // Submit Dialog
        'task.submit_title': '📤 Submit Deliverables',
        'task.submit_images': 'Deliverable Images *',
        'task.submit_images_multi': 'Multiple images supported',
        'task.submit_note': 'Note (optional)',
        'task.submit_note_placeholder': 'Describe your deliverables...',
        'task.submit_confirm': 'Submit',
        'task.submit_uploading': '⏳ Uploading...',
        'task.submit_progress': '⏳ Uploading ({current}/{total})...',
        'task.submit_failed': 'Submission failed',
        'task.submit_upload_failed': 'Upload failed, please retry',
        'task.submit_submitting': '⏳ Submitting...',
        'task.submit_success': 'Submitted, awaiting review',
        'task.upload_images_required': 'Please upload deliverable images',
        
        // Publish Task
        'task.publish_title': '📝 Create Task',
        'task.title_label': '📌 Title',
        'task.title_placeholder': 'Describe your requirements briefly, max 50 chars',
        'task.desc_label': '📄 Description',
        'task.desc_placeholder': 'Detailed requirements, deliverable standards, references...',
        'task.images_label': '🖼️ Reference Images (optional, max 6)',
        'task.add_images': '+ Add Images',
        'task.link_label': '🔗 Reference Link (optional)',
        'task.total_price': '💰 Total Price',
        'task.deposit_ratio_label': '📊 Deposit Ratio',
        'task.deduct_on_assign': 'Deducted on assignment',
        'task.price_min': 'Min 10 pts',
        'task.price_summary': '💡 Price Summary',
        'task.price_total': 'Total',
        'task.price_deposit': 'Deposit (on assignment)',
        'task.price_remaining': 'Final (on acceptance)',
        'task.deadline_label_form': '⏰ Deadline',
        'task.publish_submit': '🚀 Create Task',
        'task.publish_notice': 'Manage your tasks in Task Board after publishing',
        'task.title_required': 'Please enter task title',
        'task.desc_required': 'Please enter task description',
        'task.price_min_error': 'Price must be at least 10 pts',
        'task.deadline_required': 'Please select deadline',
        'task.publish_uploading': '⏳ Uploading images...',
        'task.publish_progress': '⏳ Uploading ({current}/{total})...',
        'task.publish_submitting': '⏳ Publishing...',
        'task.publish_success': 'Task published!',
        'task.publish_failed': 'Publishing failed, please retry',
        'task.max_images': 'Max 6 images',
        
        // Dispute
        'dispute.title': 'Dispute Details',
        'dispute.status_pending': 'Pending Response',
        'dispute.status_responded': 'Pending Arbitration',
        'dispute.status_resolved': 'Resolved',
        'dispute.task_label': '📋 Related Task',
        'dispute.parties': '👥 Parties',
        'dispute.publisher': 'Publisher',
        'dispute.assignee': 'Assignee',
        'dispute.initiator': '(Initiator)',
        'dispute.respondent': '(Respondent)',
        'dispute.initiator_statement': '📝 Initiator Statement',
        'dispute.respondent_response': '💬 Respondent Response',
        'dispute.no_response': 'No response yet',
        'dispute.respond_placeholder': 'Enter your response...',
        'dispute.upload_evidence': '📷 Upload evidence (optional)',
        'dispute.submit_response': 'Submit Response',
        'dispute.submitting': 'Submitting...',
        'dispute.response_success': 'Response submitted',
        'dispute.response_failed': 'Submission failed',
        'dispute.resolution_title': '⚖️ Resolution',
        'dispute.favor_initiator': '✅ In favor of initiator',
        'dispute.favor_respondent': '❌ In favor of respondent',
        'dispute.split': '⚖️ Split settlement',
        'dispute.split_detail': 'Initiator {ratio}% : Respondent {other}%',
        'dispute.resolved': 'Resolved',
        'dispute.resolved_at': 'Resolved at',
        'dispute.submitted_at': 'Submitted at',
        'dispute.responded_at': 'Responded at',
        'dispute.reason_required': 'Please enter dispute reason',
        'dispute.submit_dispute': 'Submit Dispute',
        'dispute.uploading': '⏳ Uploading ({current}/{total})...',
        'dispute.submitting_dispute': '⏳ Submitting dispute...',
        'dispute.dispute_success': 'Dispute submitted, awaiting response',
        'dispute.dispute_failed': 'Dispute failed',
        'dispute.dialog_title': '⚖️ File Dispute',
        'dispute.reason_label': 'Reason',
        'dispute.evidence_label': 'Evidence (optional, max 6)',
        'dispute.notice_title': '⚠️ Notice:',
        'dispute.notice_1': 'Task will enter dispute status pending arbitration',
        'dispute.notice_2': 'The other party will respond to your dispute',
        'dispute.notice_3': 'Please provide valid evidence',
        'dispute.max_images': 'Max 6 images',
        
        // Admin Arbitration
        'arbitrate.title': '⚖️ Arbitration Center',
        'arbitrate.tab_all': 'All',
        'arbitrate.tab_pending': 'Pending',
        'arbitrate.tab_responded': 'To Resolve',
        'arbitrate.tab_resolved': 'Resolved',
        'arbitrate.loading': '⏳ Loading...',
        'arbitrate.empty': 'No disputes',
        'arbitrate.load_failed': '❌ Load failed',
        'arbitrate.initiator_role': 'Initiator',
        'arbitrate.resolve_title': '🔨 Resolution',
        'arbitrate.option_favor_initiator': 'Favor Initiator',
        'arbitrate.option_favor_respondent': 'Favor Respondent',
        'arbitrate.option_split': 'Split Settlement',
        'arbitrate.option_split_desc': 'Split between parties',
        'arbitrate.ratio_label': 'Initiator gets',
        'arbitrate.resolve_note': 'Resolution note (optional)',
        'arbitrate.resolve_confirm': 'Confirm Resolution',
        'arbitrate.resolving': 'Processing...',
        'arbitrate.resolve_success': 'Resolved',
        'arbitrate.resolve_failed': 'Resolution failed',
        
        // Posts / Forum
        'post.title': 'Forum',
        'post.publish': '✏️ Create Post',
        'post.loading': 'Loading...',
        'post.load_more': 'Load More',
        'post.no_posts': 'No posts yet',
        'post.be_first': 'Be the first to share!',
        'post.load_failed': 'Failed to load, please retry',
        'post.network_cache': 'Network error, loaded from cache',
        'post.login_first': 'Please login to create posts',
        
        // Post Sorting
        'post.sort_latest': 'Latest',
        'post.sort_likes': '👍 Most Liked',
        'post.sort_favorites': '⭐ Most Favorited',
        'post.sort_tips': '💰 Top Tipped',
        'post.sort_views': '🔥 Most Viewed',
        'post.sort_daily_views': '🔥 Trending Today',
        
        // Post Detail
        'post.detail_title': '📄 Post Details',
        'post.not_exist': 'Post not found or deleted',
        'post.load_detail_failed': 'Failed to load',
        'post.liked': 'Liked',
        'post.favorited': 'Favorited',
        'post.tip_author': '🎁 Tip',
        'post.tip_dialog_title': '🎁 Tip Author',
        'post.tip_self': 'Cannot tip your own post',
        'post.tip_success': 'Tipped {amount} pts',
        'post.tip_failed': 'Tip failed',
        'post.comments_title': '💬 Comments',
        'post.comment_placeholder': 'Write a comment...',
        'post.no_comments': 'No comments yet, be the first!',
        'post.comment_loading': 'Loading comments...',
        'post.comment_load_failed': 'Failed to load comments',
        'post.comment_required': 'Please enter comment',
        'post.comment_sending': 'Sending...',
        'post.comment_success': 'Comment posted',
        'post.comment_failed': 'Comment failed',
        'post.tip_board_title': '🎁 Top Tippers',
        'post.no_tips': '🎁 No tips yet',
        
        // Publish Post
        'post.publish_title': '✏️ Create Post',
        'post.publish_submit': '🚀 Publish',
        'post.images_label': '🖼️ Upload Images',
        'post.images_required': '(Max 9, first is cover)',
        'post.images_placeholder': 'Click or drag to upload',
        'post.title_label': '📝 Title',
        'post.title_placeholder': 'Give your work a title...',
        'post.content_label': '✍️ Content',
        'post.content_placeholder': 'Share your thoughts, tips...',
        'post.notice_title': '💡 Guidelines:',
        'post.notice_1': 'Upload original work or cite sources',
        'post.notice_2': 'Images will be optimized automatically',
        'post.notice_3': 'Manage posts in your profile',
        'post.cover': 'Cover',
        'post.images_required_error': 'Please upload at least one image',
        'post.title_required': 'Please enter title',
        'post.uploading': '⏳ Uploading images...',
        'post.upload_progress': '⏳ Uploading ({current}/{total})...',
        'post.submitting': '⏳ Publishing...',
        'post.publish_success': 'Published!',
        'post.publish_failed': 'Publishing failed',
        
        // Common - Component usage
        'common.message': 'Message',
        'common.credits': 'pts',
        'common.unknown': 'Unknown',
        'common.load_failed': 'Load failed',
        
        // 🎰 Tip Levels
        'tip.new_fan': 'New Fan',
        'tip.supreme_sponsor': 'Supreme Sponsor',
        'tip.points': 'pts',
        
        // 📊 Chart
        'chart.loading': 'Loading chart...',
        'chart.load_failed': 'Chart library failed to load',
        
        // 🖼️ Image
        'image.loading': 'Loading...',
        'image.load_failed': 'Image load failed',
        'image.load_timeout': 'Load timeout',
        'image.gallery': 'Gallery',
        'common.operation_failed': 'Operation failed',
        'common.login_required': 'Please login first',
        'common.publish': 'Publish',
        'common.confirm_submit': 'Confirm',
        'common.uploading': 'Uploading',
        'common.upload_progress': 'Uploading ({current}/{total})',
        'common.submitting': 'Submitting',
        'common.upload_image_progress': 'Uploading image ({current}/{total})',
        'common.unknown_task': 'Unknown task',
        
        // Task Detail
        'task.description': 'Description',
        'task.reference_images': 'Reference Images',
        'task.reference_link': 'Reference Link',
        'task.assignee': 'Assignee',
        'task.note': 'Note',
        'task.applicants_count': '',
        'task.choose_assignee': 'Choose',
        'task.confirm_assign': 'Assign {assignee} as the assignee?',
        'task.confirm_deposit': 'Deposit of {amount} pts will be deducted',
        'task.apply_message_prompt': 'Enter application message (optional):',
        'task.confirm_cancel_apply': 'Withdraw application?',
        'task.apply_cancelled': 'Application withdrawn',
        'task.cancel_apply_failed': 'Withdrawal failed',
        'task.confirm_cancel_task': 'Cancel this task? This cannot be undone.',
        'task.task_cancelled': 'Task cancelled',
        'task.cancel_task_failed': 'Cancellation failed',
        'task.confirm_accept': 'Accept deliverables?',
        'task.confirm_pay_remaining': 'Final payment of {amount} pts will be paid',
        'task.reject_reason_prompt': 'Enter rejection reason:',
        'task.work_returned': 'Sent back for revision',
        'task.submit_work': 'Submit Deliverables',
        'task.deliverable_images': 'Deliverable images',
        'task.support_multiple_images': 'Multiple images supported',
        'task.note_optional': 'Note (optional)',
        'task.note_placeholder': 'Describe your deliverables...',
        'task.please_upload_deliverables': 'Please upload deliverable images',
        'task.upload_failed_retry': 'Upload failed, please retry',
        'task.submit_success_waiting': 'Submitted, awaiting review',
        'task.start_dispute': 'File Dispute',
        'task.view_dispute': 'View Dispute',
        'task.accept_work': 'Accept',
        'task.reject_work': 'Reject',
        
        // Publish Task
        'task.task_title': 'Task Title',
        'task.title_placeholder': 'Describe your requirements briefly',
        'task.description_placeholder': 'Detailed requirements, deliverable standards...',
        'task.reference_images_optional': 'Reference Images (optional, max 6)',
        'task.add_reference_image': 'Add Reference Image',
        'task.reference_link_optional': 'Reference Link (optional)',
        'task.deposit_ratio': 'Deposit Ratio',
        'task.min_10_credits': 'Minimum 10 pts',
        'task.deposit_deducted_on_assign': 'Deducted on assignment',
        'task.price_description': 'Price Summary',
        'task.deposit_on_assign': 'Deposit (on assignment)',
        'task.remaining_on_accept': 'Final (on acceptance)',
        'task.publish_task': 'Create Task',
        'task.manage_in_task_list': 'Manage your tasks in Task Board',
        'task.please_enter_title': 'Please enter task title',
        'task.please_enter_description': 'Please enter task description',
        'task.price_min_10': 'Price must be at least 10 pts',
        'task.please_select_deadline': 'Please select deadline',
        'task.uploading_images': 'Uploading images',
        'task.upload_progress': 'Uploading image ({current}/{total})',
        'task.publishing': 'Publishing',
        'task.max_6_images': 'Max 6 images',
        
        // Dispute Detail
        'dispute.start': 'File Dispute',
        'dispute.reason': 'Reason',
        'dispute.reason_placeholder': 'Please describe your dispute reason in detail...',
        'dispute.evidence_optional': 'Evidence images (optional, max 6)',
        'dispute.click_upload_evidence': 'Click to upload evidence',
        'dispute.submit': 'Submit Dispute',
        'dispute.submit_success': 'Dispute submitted, awaiting response',
        'dispute.submit_failed': 'Dispute failed',
        'dispute.max_6_images': 'Max 6 images',
        'dispute.please_enter_reason': 'Please enter dispute reason',
        'dispute.get_detail_failed': 'Failed to get dispute details',
        'dispute.related_task': 'Related Task',
        'dispute.task_id': 'Task ID',
        'dispute.click_upload_evidence_optional': 'Click to upload evidence (optional)',
        'dispute.resolution_result': 'Resolution',
        'dispute.upload_failed': 'Upload failed',
        'dispute.please_enter_response': 'Please enter your response',
        'dispute.response_submitted': 'Response submitted',
        'dispute.split_result': 'Split Settlement',
        
        // Admin Arbitration
        'arbitrate.center': 'Arbitration Center',
        'arbitrate.all': 'All',
        'arbitrate.pending_response': 'Pending Response',
        'arbitrate.pending_ruling': 'Pending Ruling',
        'arbitrate.ruled': 'Resolved',
        'arbitrate.no_disputes': 'No disputes',
        'arbitrate.no_reason': 'No reason provided',
        'arbitrate.initiator': 'Initiator',
        'arbitrate.ruling_operation': 'Resolution',
        'arbitrate.refund_publisher': 'Refund publisher deposit',
        'arbitrate.assignee_full_pay': 'Assignee gets full payment',
        'arbitrate.negotiate_split': 'Split Settlement',
        'arbitrate.split_desc': 'Split between parties',
        'arbitrate.ruling_note_optional': 'Resolution note (optional)',
        'arbitrate.confirm_ruling': 'Confirm Resolution',
        'arbitrate.ruling_success': 'Resolution successful',
        'arbitrate.ruling_failed': 'Resolution failed',
        
        // Publish Post
        'post.upload_images': 'Upload Images',
        'post.max_9_images': 'Max 9, first is cover',
        'post.click_upload': 'Click or drag to upload',
        'post.title_label': 'Title',
        'post.content_label': 'Content',
        'post.publish_notice': 'Guidelines',
        'post.notice_original': 'Upload original work or cite sources',
        'post.notice_compress': 'Images will be optimized automatically',
        'post.notice_manage': 'Manage posts in your profile',
        'post.cover': 'Cover',
        'post.error_no_image': 'Please upload at least one image',
        'post.error_no_title': 'Please enter title',
        'post.uploading_images': 'Uploading images',
        'post.uploading_progress': 'Uploading image ({current}/{total})',
        'post.compressing_images': 'Compressing images',
        'post.compressing_progress': 'Compressing image ({current}/{total})',
        'post.publishing': 'Publishing',
                'post.edit_title': 'Edit Post',
                'post.title_label': 'Title',
                'post.content_label': 'Content',
                'post.edit_success': 'Updated successfully',
                'post.edit_failed': 'Update failed',
                'post.delete_confirm_title': 'Confirm Delete',
                'post.delete_confirm_desc': 'This action cannot be undone. Are you sure you want to delete this post?',
                'post.delete_success': 'Deleted successfully',
                'post.delete_failed': 'Delete failed',
        
        // Publish Content
        'publish.new_content': 'Publish New Content',
        'publish.edit_content': 'Edit Content',
        'publish.save_changes': 'Save Changes',
        'publish.confirm_publish': 'Confirm Publish',
        'publish.main_category': 'Main Category',
        'publish.type_tool': 'Original Plugin / Tool',
        'publish.type_app': 'Original Workflow / App',
        'publish.type_recommend': 'Recommend Others Work',
        'publish.recommend_form': 'Recommend Form (Pick One)',
        'publish.recommend_as_tool': 'As Tool (Git Install)',
        'publish.recommend_as_app': 'As App (Load JSON)',
        'publish.recommend_as_link': 'Pure Link (New Tab)',
        'publish.name': 'Name',
        'publish.name_placeholder': 'e.g. Highly Recommend Flight Translator Enhanced!',
        'publish.short_desc': 'Short Description (One Line)',
        'publish.short_desc_placeholder': 'Max 50 chars, highlight core features...',
        'publish.resource_type': 'Resource Type',
        'publish.resource_link': 'External Link / Git',
        'publish.resource_json': 'Upload JSON',
        'publish.resource_netdisk': 'Cloud Drive Link',
        'publish.source_url': 'Source URL',
        'publish.source_url_placeholder': 'Enter external URL or Git repo link...',
        'publish.select_json': 'Select JSON File',
        'publish.has_cloud_file': 'Contains cloud file, reselect will override',
        'publish.netdisk_link': 'Cloud Drive Link',
        'publish.netdisk_placeholder': 'Paste Baidu/Aliyun drive share link...',
        'publish.netdisk_password': 'Extract Code (Optional)',
        'publish.netdisk_password_placeholder': 'Enter password, e.g. 1234',
        'publish.security_guarantee': 'Security Guaranteed',
        'publish.password_encrypted_hint': 'Password encrypted in cloud, only decrypted after purchase. Non-buyers cannot access via any API.',
        'publish.private_repo_hint': 'This is a private GitHub repository (requires access token)',
        'publish.pat_label': 'Private Repo Access Token (PAT)',
        'publish.pat_hint': 'System uses this token to pull source code for buyers. Token stored in cloud backend only, <span style="color:#F44336; font-weight:bold;">never exposed in frontend API</span>.',
        'publish.effect_images': 'Demo Images (Max 6, Optional)',
        'publish.reselect_override': 'Reselect will override original',
        'publish.drag_select_hint': 'Drag to select multiple, first one will be cover',
        'publish.price': 'Price (Credits)',
        'publish.price_hint': 'Enter 0 for free open source.',
        'publish.price_delay_hint': 'Price change takes effect after 24 hours',
        'publish.full_desc': 'Full Description',
        'publish.full_desc_placeholder': 'Describe features, usage, environment requirements...',
        'publish.current_price': 'Current price',
        'publish.will_change_in': 'Will change in',
        'publish.hours_later': 'hours to',
        // Publish Submit Engine
        'publish.processing_avatar': 'Processing and compressing avatar locally...',
        'publish.uploading_file': 'Uploading file {size}KB to cloud...',
        'publish.upload_success': 'File uploaded successfully!',
        'publish.upload_failed': 'File upload failed',
        'publish.upload_error': 'Upload error occurred',
        'publish.pat_required': 'Private repo selected, please provide PAT access token!',
        'publish.name_desc_required': 'Please fill in name and short description!',
        'publish.link_required': 'Third-party link must provide source URL!',
        'publish.git_required': 'Must provide Git installation URL!',
        'publish.json_required': 'Must upload workflow JSON file!',
        'publish.netdisk_required': 'Must fill in cloud storage link!',
        'publish.connecting': 'Connecting to cloud...',
        'publish.uploading_secure': 'Securely uploading file...',
        'publish.uploading_images': 'Uploading images ({current}/{total})...',
        'publish.syncing': 'Syncing to global database...',
        'publish.save_success': 'Changes saved and synced globally!',
        'publish.publish_success': 'Published! Your work is now synced globally.',
        
        // 🌐 Profile Page
        'profile.back': 'Back',
        'profile.recharge': 'Top Up',
        'profile.withdraw': 'Withdraw',
        'profile.settings': 'Settings',
        'profile.logout': 'Logout',
        'profile.balance': 'Balance',
        'profile.sales': 'Sales',
        'profile.tips': 'Tips',
        'profile.task_earnings': 'Task Earnings',
                
        // Profile Lists
        'profile.privacy_hidden': 'This list is private due to privacy settings',
        'profile.no_following': 'Not following anyone',
        'profile.loading_users': 'Loading user data...',
        'profile.load_failed': 'Failed to load data',
        'profile.homepage': 'Profile',
        'profile.update_available': 'Update',
        'profile.installed': 'Installed',
        'profile.tip_stats': 'Tip Statistics',
        'profile.tip_received': 'Tips Received',
        'profile.tip_sent': 'Tips Sent',
        'profile.net_tips': 'Net Tips',
        'profile.sales_stats': 'Sales Stats',
        'profile.sales_income': 'Sales Income',
        'profile.purchase_expense': 'Purchase Expense',
        'profile.net_sales': 'Net Sales',
        'profile.transactions_unit': 'txns',
        'profile.received_likes': 'Likes',
        'profile.received_favorites': 'Favorites',
        'profile.followers_count': 'Followers',
        'profile.following_count': 'Following',
        'profile.tip_support': 'Support',
        'profile.send_message': 'Message',
        'profile.follow_author': 'Follow',
        'profile.followed': 'Following',
        'profile.creator_tip_board': 'Creator Appreciation Board (TOP 10)',
        'profile.age_years': 'yrs',
        'profile.location_secret': 'Private',
        'profile.no_intro': 'This user has not written anything yet...',
        'profile.unknown_age': 'Unknown',
        
        // 🌐 Edit Profile & Privacy Settings
        'settings_form.title': 'Edit Profile & Privacy',
        'settings_form.change_avatar': 'Change Avatar',
        'settings_form.avatar_hint': 'Supports JPG/PNG, auto-cropped to 1:1 locally.',
        'settings_form.banner_title': 'Profile Banner',
        'settings_form.banner_upload': 'Upload & Crop',
        'settings_form.banner_clear': 'Clear',
        'settings_form.banner_hint': 'Ratio 16:9, can zoom and drag, compressed before upload.',
        'settings_form.ui_bg_title': 'UI Background (Local)',
        'settings_form.ui_bg_hint': 'Ratio 9:16, saved locally only, no cloud storage.',
        'settings_form.display_name': 'Display Name',
        'settings_form.gender': 'Gender',
        'settings_form.gender_male': 'Male',
        'settings_form.gender_female': 'Female',
        'settings_form.gender_secret': 'Private',
        'settings_form.birthday': 'Birthday (Optional)',
        'settings_form.country': 'Country/Region',
        'settings_form.select_country': 'Select Country',
        'settings_form.select_country_first': 'Select Country First',
        'settings_form.intro': 'Bio',
        'settings_form.intro_placeholder': 'Tell us about yourself...',
        'settings_form.privacy_title': 'Privacy Settings',
        'settings_form.privacy_hint': 'Hide your activity from other users (does not affect your own view).',
        'settings_form.hide_follows': 'Hide who I follow',
        'settings_form.hide_likes': 'Hide my liked content',
        'settings_form.hide_favorites': 'Hide my favorites',
        'settings_form.hide_downloads': 'Hide my downloads',
        'settings_form.admin_title': 'Admin Settings',
        'settings_form.admin_hint': 'These settings affect the entire platform. Use with caution.',
        'settings_form.image_moderation': 'Image Moderation',
        'settings_form.image_moderation_hint': 'Enable automatic content safety review for uploads',
        'settings_form.version_title': 'Version Management',
        'settings_form.version_hint': 'Update project stage and version number globally',
        'settings_form.project_stage': 'Project Stage',
        'settings_form.version_number': 'Version',
        'settings_form.apply_version': 'Apply Version Changes',
        'settings_form.cancel': 'Cancel',
        'settings_form.save_all': 'Save All Settings',
        'settings_form.save_failed': 'Settings failed',
        'settings_form.avatar_upload_success': 'Avatar uploaded! Click Save to apply.',
        'settings_form.banner_cleared': 'Banner cleared. Click Save to apply.'
    }
};

/**
 * 获取翻译文案
 * @param {string} key - 文案键
 * @param {Object} params - 插值参数
 * @returns {string}
 */
export function t(key, params = {}) {
    const lang = translations[currentLang] || translations['zh-CN'];
    let text = lang[key] || translations['zh-CN'][key] || key;
    
    // 处理插值 {name}
    Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    });
    
    return text;
}

/**
 * 设置当前语言
 * @param {string} lang - 语言代码 ('zh-CN' | 'en-US')
 */
export function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('comfy_ranking_lang', lang);
        
        // 触发语言变更事件
        document.dispatchEvent(new CustomEvent('comfy-language-change', { 
            detail: { lang } 
        }));
    }
}

/**
 * 获取当前语言
 * @returns {string}
 */
export function getLanguage() {
    return currentLang;
}

/**
 * 初始化 i18n
 */
export function initI18n() {
    // 🔧 修复：优先从全局设置读取语言
    try {
        const globalSettings = JSON.parse(localStorage.getItem('ComfyCommunity_Settings') || '{}');
        if (globalSettings.language && translations[globalSettings.language]) {
            currentLang = globalSettings.language;
            return;
        }
    } catch (e) {}
    
    // 回退：从旧的独立存储读取
    const savedLang = localStorage.getItem('comfy_ranking_lang');
    if (savedLang && translations[savedLang]) {
        currentLang = savedLang;
    } else {
        // 检测浏览器语言
        const browserLang = navigator.language;
        if (browserLang.startsWith('en')) {
            currentLang = 'en-US';
        } else {
            currentLang = 'zh-CN';
        }
    }
}

/**
 * 添加自定义翻译
 * @param {string} lang - 语言代码
 * @param {Object} texts - 翻译文案对象
 */
export function addTranslations(lang, texts) {
    if (!translations[lang]) {
        translations[lang] = {};
    }
    Object.assign(translations[lang], texts);
}


// ==========================================
// 🚀 统一初始化
// ==========================================

/**
 * 初始化所有用户体验增强功能
 */
export function initUXEnhancements() {
    // 注入主题变量
    injectThemeVariables();
    
    // 注入响应式样式
    injectResponsiveStyles();
    
    // 应用安全区域
    applySafeAreaInsets();
    
    // 初始化快捷键
    initKeyboardShortcuts();
    
    // 初始化 i18n
    initI18n();
    
    console.log('🎯 P2 用户体验增强已初始化');
}


// ==========================================
// 🔧 工具函数
// ==========================================

/**
 * 防止双击提交
 * @param {HTMLButtonElement} button - 按钮元素
 * @param {number} delay - 禁用时长（毫秒）
 */
export function preventDoubleClick(button, delay = 1000) {
    if (button.disabled) return false;
    
    button.disabled = true;
    setTimeout(() => {
        button.disabled = false;
    }, delay);
    
    return true;
}

/**
 * 平滑滚动到元素
 * @param {HTMLElement} element - 目标元素
 * @param {Object} options - 配置选项
 */
export function scrollToElement(element, options = {}) {
    const {
        behavior = 'smooth',
        block = 'start',
        offset = 0
    } = options;
    
    const top = element.getBoundingClientRect().top + window.pageYOffset + offset;
    
    window.scrollTo({
        top,
        behavior
    });
}

/**
 * 复制到剪贴板（带反馈）
 * @param {string} text - 要复制的文本
 */
export async function copyWithFeedback(text) {
    try {
        await navigator.clipboard.writeText(text);
        // 使用 UI 组件的 toast
        const { showToast } = await import('./UI交互提示组件.js');
        showToast(t('common.success'), 'success');
        return true;
    } catch {
        return false;
    }
}
