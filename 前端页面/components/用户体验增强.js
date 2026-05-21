// 前端页面/components/用户体验增强.js
// ==========================================
// 🎯 P2 用户体验增强模块
// ==========================================
// 作用：提供表单自动保存、快捷键、主题、响应式、i18n等增强功能
// 关联文件：
//   - UI交互提示组件.js (toast/loading)
//   - 全局配置.js (配置中心)
//   - 侧边栏主程序.js (初始化入口)
//   - 用户体验_国际化.js (i18n 翻译字典)
// ==========================================

import { t } from './用户体验_国际化.js';


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
    
    // 销毁：在表单所在弹窗关闭或组件卸载时必须调用，
    // 以移除 input/change/beforeunload 事件监听并清理防抖定时器，
    // 防止内存泄漏和已卸载 DOM 上的事件监听器残留。
    // 调用时机：弹窗关闭回调、组件 unmount 钩子、或 beforeunload 兜底。
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
    bgSecondary: 'var(--comfy-menu-bg)',
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
 * 注入 style 标签（内部含已存在检查，幂等安全）
 * @param {string} id - style 标签的 id
 * @param {string} cssContent - CSS 内容
 */
function _injectStyleTag(id, cssContent) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = cssContent;
    document.head.appendChild(style);
}

/**
 * 注入主题 CSS 变量
 */
export function injectThemeVariables() {
    const cssVars = Object.entries(THEME_COLORS)
        .map(([key, value]) => `--cr-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};`)
        .join('\n    ');
    
    _injectStyleTag('comfy-ranking-theme-vars', `
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
    `);
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
    _injectStyleTag('comfy-ranking-responsive', `
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
    `);
}

/**
 * 添加安全区域适配（iPhone刘海屏等）
 */
export function applySafeAreaInsets() {
    _injectStyleTag('comfy-ranking-safe-area', `
    .comfy-ranking-root {
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
    }
    
    .comfy-ranking-bottom-bar {
        padding-bottom: env(safe-area-inset-bottom);
    }
    `);
}


// ==========================================
// 🌐 P2-6: 多语言支持 (i18n) - 已拆分到独立文件
// ==========================================
// 国际化模块已拆分到独立文件，此处保持向后兼容导出
export { t, setLanguage, getLanguage, initI18n, addTranslations } from './用户体验_国际化.js';



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
