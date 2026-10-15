// 前端页面/components/互动工具函数.js
// ==========================================
// 👍 公共互动工具函数
// ==========================================
// 作用：提取任务、帖子、资源详情页中重复的互动逻辑
// 包括：访问量记录防抖、点赞/收藏按钮状态渲染、互动事件处理
// ==========================================

import { showToast } from "./UI交互提示组件.js";
import { t } from "./用户体验增强.js";
import { captureRequestSession } from "../core/网络请求_基础设施.js";
import { getUser } from "../core/状态管理.js";
// 本模块内部也需要转义（下方 renderInteractionButtonsHTML）；re-export 不会绑定本地标识符，故单独 import
import { escapeHtml } from "../core/全局配置.js";

// 开发模式检测，仅在本地环境输出调试日志
const DEBUG = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// ==========================================
// 👀 访问量记录防抖（通用版）
// ==========================================

const _viewRecordCache = {};
const VIEW_DEBOUNCE_MS = 300000;     // 5分钟成功冷却
const VIEW_ERROR_COOLDOWN_MS = 30000; // 30秒错误冷却

// 防重复提交状态跟踪
const _pendingActions = new WeakMap();

/**
 * 记录内容浏览量（带5分钟防抖）
 * @param {Function} apiMethod - API方法，如 api.recordTaskView
 * @param {string} contentId - 内容ID
 * @param {string} cachePrefix - 缓存前缀，如 'task', 'post', 'item'
 * @param {Function} onSuccess - 成功回调，接收返回数据
 * @returns {Promise<Object|null>}
 */
export async function recordView(apiMethod, contentId, cachePrefix, onSuccess = null) {
    // 🚀 登录检查：未登录时跳过浏览量记录，避免 401 错误
    const token = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
    // 🔒 P0同步：旧版 mock_token 已被后端拒绝，仅标准 JWT 格式才记录浏览量
    if (!token || token.split(".").length !== 3) {
        return null;
    }

    DEBUG && console.warn('浏览量记录开始');
    const now = Date.now();
    const cacheKey = `${cachePrefix}_${contentId}`;
    const cached = _viewRecordCache[cacheKey];

    // 检查是否在防抖/冷却时间内（成功5分钟，失败30秒）
    if (cached && now - cached.time < (cached.success ? VIEW_DEBOUNCE_MS : VIEW_ERROR_COOLDOWN_MS)) {
        DEBUG && console.warn('浏览量记录处于冷却期');
        return null; // 防抖中，跳过
    }

    try {
        const res = await apiMethod(contentId);
        DEBUG && console.warn('浏览量记录收到响应');
        if (res.status === "success") {
            // 成功后记录时间戳和成功状态
            _viewRecordCache[cacheKey] = { time: now, success: true };
            if (onSuccess) onSuccess(res);
            return res;
        }
    } catch (err) {
        // 失败时记录较短冷却时间，网络恢复后可快速重试
        _viewRecordCache[cacheKey] = { time: now, success: false };
        DEBUG && console.warn('浏览量记录失败');
    }
    return null;
}

// ==========================================
// 👍 点赞/收藏按钮 HTML 生成
// ==========================================

/**
 * 生成点赞/收藏按钮的 HTML
 * @param {Object} data - 内容数据，包含 likes, favorites, liked_by, favorited_by
 * @param {string} currentAccount - 当前用户账号
 * @param {Object} options - 配置选项
 * @param {boolean} options.showTip - 是否显示打赏按钮
 * @param {string} options.tipText - 打赏按钮文字
 * @returns {string} HTML字符串
 */
export function renderInteractionButtonsHTML(data, currentAccount, options = {}) {
    const { showTip = true, tipText = t('post.tip_author') } = options;
    
    const isLiked = data.liked_by?.includes(currentAccount) || false;
    const isFavorited = data.favorited_by?.includes(currentAccount) || false;
    
    const likeBtn = `
        <button id="btn-like" style="background: ${isLiked ? '#FF5722' : '#333'}; border: 1px solid ${isLiked ? '#FF5722' : '#555'}; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
            ❤️ <span id="like-count">${data.likes || 0}</span>
        </button>
    `;
    
    const favoriteBtn = `
        <button id="btn-favorite" style="background: ${isFavorited ? '#FFC107' : '#333'}; border: 1px solid ${isFavorited ? '#FFC107' : '#555'}; color: ${isFavorited ? '#000' : '#fff'}; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
            🔖 <span id="favorite-count">${data.favorites || 0}</span>
        </button>
    `;
    
    const tipBtn = showTip ? `
        <button id="btn-tip" style="background: #333; border: 1px solid #555; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
            💰 ${escapeHtml(tipText)}
        </button>
    ` : '';
    
    return `${likeBtn}${favoriteBtn}${tipBtn}`;
}

// ==========================================
// 🔗 点赞/收藏 toggle 事件处理
// ==========================================

/**
 * 通用 toggle 事件处理核心逻辑
 * @param {Function} apiMethod - API方法
 * @param {string} contentId - 内容ID
 * @param {HTMLElement} buttonEl - 按钮元素
 * @param {HTMLElement} countEl - 计数元素
 * @param {Object} currentUser - 当前用户
 * @param {Object} options - 配置
 * @param {string} options.actionPrefix - 防重复key前缀，如 'like' / 'favorite'
 * @param {string} options.countField - 响应中的计数字段名，如 'likes' / 'favorites'
 * @param {string} options.activeAction - 激活时的 res.action 值，如 'liked' / 'favorited'
 * @param {string} options.activeColor - 激活时的按钮背景色
 * @param {string} options.activeToastKey - 激活时 toast 的 i18n key
 * @param {string} [options.activeTextColor] - 激活时的按钮文字色（可选）
 * @param {string} [options.inactiveTextColor] - 取消激活时的按钮文字色（可选）
 * @param {string} options.inactiveAction - 服务端取消动作值
 * @param {Function} [options.isCurrent] - 原视图仍有效的检查
 * @returns {Promise<Object|null>}
 */
async function _handleToggleAction(apiMethod, contentId, buttonEl, countEl, currentUser, options) {
    const {
        actionPrefix,
        countField,
        activeAction,
        activeColor,
        activeToastKey,
        activeTextColor = null,
        inactiveTextColor = null,
        inactiveAction,
        isCurrent: viewCurrent = () => true
    } = options;

    const sessionMatches = captureRequestSession();
    const originalHandler = buttonEl?.onclick;
    const current = () => sessionMatches() && viewCurrent()
        && (!buttonEl || (buttonEl.isConnected && buttonEl.onclick === originalHandler))
        && (!countEl || countEl.isConnected)
        && (getUser()?.account || null) === (currentUser?.account || null);
    if (!current()) return null;
    if (!currentUser?.account) {
        showToast(t('auth.login_required'), "warning");
        return null;
    }

    // 同类内容ID可在不同业务存在；按实际API方法和账号隔离在途动作。
    const actionKey = JSON.stringify([currentUser.account, actionPrefix, contentId]);
    let pending = _pendingActions.get(apiMethod);
    if (!pending) { pending = new Set(); _pendingActions.set(apiMethod, pending); }
    if (pending.has(actionKey)) return null;
    pending.add(actionKey);

    if (buttonEl) buttonEl.disabled = true;

    try {
        const res = await apiMethod(contentId);
        if (!current()) return null;
        if (res?.status !== "success" || !Number.isSafeInteger(res[countField]) || res[countField] < 0
            || (res.action !== activeAction && res.action !== inactiveAction)) throw new Error();
        const count = res[countField];
        if (countEl) countEl.textContent = count;

        if (res.action === activeAction) {
            if (buttonEl) buttonEl.style.background = activeColor;
            if (buttonEl) buttonEl.style.borderColor = activeColor;
            if (buttonEl && activeTextColor) buttonEl.style.color = activeTextColor;
            showToast(t(activeToastKey), "success");
        } else {
            if (buttonEl) buttonEl.style.background = "#333";
            if (buttonEl) buttonEl.style.borderColor = "#555";
            if (buttonEl && inactiveTextColor) buttonEl.style.color = inactiveTextColor;
        }
        if (buttonEl) buttonEl.setAttribute("aria-pressed", String(res.action === activeAction));
        return res;
    } catch (_) {
        if (current()) showToast(t('task.operation_failed'), "error");
        return null;
    } finally {
        pending.delete(actionKey);
        if (current() && buttonEl) buttonEl.disabled = false;
    }
}

/**
 * 处理点赞按钮点击
 * @param {Function} apiMethod - API方法，如 api.toggleTaskLike
 * @param {string} contentId - 内容ID
 * @param {HTMLElement} buttonEl - 按钮元素
 * @param {HTMLElement} countEl - 计数元素
 * @param {Object} currentUser - 当前用户
 * @param {Object} [options] - 可选视图检查，原五参数调用保持
 * @returns {Promise<Object|null>}
 */
export async function handleToggleLike(apiMethod, contentId, buttonEl, countEl, currentUser, options = {}) {
    return _handleToggleAction(apiMethod, contentId, buttonEl, countEl, currentUser, {
        actionPrefix: 'like',
        countField: 'likes',
        activeAction: 'liked',
        activeColor: '#FF5722',
        activeToastKey: 'post.liked',
        inactiveAction: 'unliked',
        isCurrent: options.isCurrent
    });
}

/**
 * 处理收藏按钮点击
 * @param {Function} apiMethod - API方法，如 api.toggleTaskFavorite
 * @param {string} contentId - 内容ID
 * @param {HTMLElement} buttonEl - 按钮元素
 * @param {HTMLElement} countEl - 计数元素
 * @param {Object} currentUser - 当前用户
 * @param {Object} [options] - 可选视图检查，原五参数调用保持
 * @returns {Promise<Object|null>}
 */
export async function handleToggleFavorite(apiMethod, contentId, buttonEl, countEl, currentUser, options = {}) {
    return _handleToggleAction(apiMethod, contentId, buttonEl, countEl, currentUser, {
        actionPrefix: 'favorite',
        countField: 'favorites',
        activeAction: 'favorited',
        activeColor: '#FFC107',
        activeToastKey: 'post.favorited',
        activeTextColor: '#000',
        inactiveTextColor: '#fff',
        inactiveAction: 'unfavorited',
        isCurrent: options.isCurrent
    });
}

// ==========================================
// 🎁 打赏相关工具函数
// ==========================================

/**
 * 生成打赏金额选择对话框的 HTML
 * @param {Array<number>} amounts - 金额选项，默认 [10, 50, 100, 500]
 * @returns {string} HTML字符串
 */
export function renderTipDialogHTML(amounts = [10, 50, 100, 500]) {
    const amountButtons = amounts.map(amount => `
        <button class="tip-amount" data-amount="${amount}" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">${amount} ${t('task.points')}</button>
    `).join('');
    
    return `
        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 15px;">
            ${amountButtons}
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="tip-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
        </div>
    `;
}

/**
 * 检查是否可以打赏（不能打赏给自己）
 * @param {Object} currentUser - 当前用户
 * @param {string} targetAccount - 目标用户账号
 * @returns {boolean}
 */
export function canTip(currentUser, targetAccount) {
    if (!currentUser) {
        showToast(t('auth.login_required'), "warning");
        return false;
    }
    if (currentUser.account === targetAccount) {
        showToast(t('post.tip_self'), "warning");
        return false;
    }
    return true;
}

// ==========================================
// 🎁 渲染打赏榜单（重导出完整版，向后兼容）
// ==========================================
export { renderTipBoardHTML } from './打赏等级工具.js';

// ==========================================
// 🔒 HTML转义（通用工具）
// ==========================================
// 实现已下沉至 core/全局配置.js（零依赖的底层叶子模块），此处以 re-export 方式
// 对外暴露同名函数，既有调用方（个人列表组件.js 等）无需改动。
// 下沉原因：UI交互提示组件.js / 打赏等级工具.js 需要转义，而本文件反向依赖
// 这两者（导入 showToast、re-export renderTipBoardHTML），若仍在此定义会形成循环依赖。

export { escapeHtml } from "../core/全局配置.js";

/**
 * 读取用户设置中的列表缓存 TTL（统一版：讨论区/任务榜/提示词组件局部副本已归一到此）
 * @returns {number} 毫秒数，默认30分钟
 */
export function getCacheTTL() {
    try {
        const s = localStorage.getItem('ComfyCommunity_Settings');
        if (s) { const v = parseInt(JSON.parse(s).cacheExpireSeconds); if (v >= 60 && v <= 86400) return v * 1000; }
    } catch(e) {}
    return 1000 * 60 * 30;  // 默认30分钟
}

/**
 * 🕐 相对时间格式化（统一版："刚刚/n分钟前/..."，仅适用于相对时间语义，
 * 绝对日期/本地化时间场景请勿复用）
 * @param {number} timestamp - Unix 秒级时间戳
 * @returns {string}
 */
export function formatTime(timestamp) {
    if (timestamp === null || timestamp === undefined || timestamp === "" || timestamp === 0) return "";
    if (typeof timestamp !== "number" && typeof timestamp !== "string") return t('common.unknown');
    const seconds = typeof timestamp === "number" ? timestamp : timestamp.trim() === "" ? NaN : Number(timestamp);
    if (!Number.isFinite(seconds)) return t('common.unknown');
    const date = new Date(seconds * 1000);
    if (!Number.isFinite(date.getTime())) return t('common.unknown');
    const now = Date.now() / 1000;
    const diff = now - seconds;
    if (diff < 60) return t('time.just_now');
    if (diff < 3600) return t('time.minutes_ago', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('time.hours_ago', { n: Math.floor(diff / 3600) });
    if (diff < 604800) return t('time.days_ago', { n: Math.floor(diff / 86400) });
    return `${date.getMonth() + 1}/${date.getDate()}`;
}
