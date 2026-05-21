// 前端页面/components/互动工具函数.js
// ==========================================
// 👍 公共互动工具函数
// ==========================================
// 作用：提取任务、帖子、资源详情页中重复的互动逻辑
// 包括：访问量记录防抖、点赞/收藏按钮状态渲染、互动事件处理
// ==========================================

import { showToast } from "./UI交互提示组件.js";
import { t } from "./用户体验增强.js";

// 开发模式检测，仅在本地环境输出调试日志
const DEBUG = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// ==========================================
// 👀 访问量记录防抖（通用版）
// ==========================================

const _viewRecordCache = {};
const VIEW_DEBOUNCE_MS = 300000;     // 5分钟成功冷却
const VIEW_ERROR_COOLDOWN_MS = 30000; // 30秒错误冷却

// 防重复提交状态跟踪
const _pendingActions = new Set();

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
    if (!token || token.split(".").length !== 3) {
        return null;
    }

    DEBUG && console.warn(`[浏览量调试] recordView 被调用 - prefix: ${cachePrefix}, id: ${contentId}`);
    const now = Date.now();
    const cacheKey = `${cachePrefix}_${contentId}`;
    const cached = _viewRecordCache[cacheKey];

    // 检查是否在防抖/冷却时间内（成功5分钟，失败30秒）
    if (cached && now - cached.time < (cached.success ? VIEW_DEBOUNCE_MS : VIEW_ERROR_COOLDOWN_MS)) {
        DEBUG && console.warn(`[浏览量调试] 防抖拦截 - ${cacheKey}, 距上次: ${now - cached.time}ms, 上次状态: ${cached.success ? 'success' : 'error'}`);
        return null; // 防抖中，跳过
    }

    try {
        const res = await apiMethod(contentId);
        DEBUG && console.warn(`[浏览量调试] API响应:`, res?.status, res);
        if (res.status === "success") {
            // 成功后记录时间戳和成功状态
            _viewRecordCache[cacheKey] = { time: now, success: true };
            if (onSuccess) onSuccess(res);
            return res;
        }
    } catch (err) {
        // 失败时记录较短冷却时间，网络恢复后可快速重试
        _viewRecordCache[cacheKey] = { time: now, success: false };
        // 浏览记录失败不影响页面显示，但输出详细错误便于调试
        DEBUG && console.warn(`[浏览量调试] 记录${cachePrefix}浏览量失败:`, err.message || err);
        DEBUG && console.warn(`[浏览量调试] 请求参数 - contentId: ${contentId}, cachePrefix: ${cachePrefix}`);
        DEBUG && console.warn(`[浏览量调试] 错误详情:`, err);
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
            💰 ${tipText}
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
 * @param {string} [options.warnLabel] - 日志警告用标签
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
        warnLabel = 'toggle'
    } = options;

    if (!currentUser) {
        showToast(t('auth.login_required'), "warning");
        return null;
    }

    const actionKey = `${actionPrefix}_${contentId}`;
    if (_pendingActions.has(actionKey)) return null;
    _pendingActions.add(actionKey);

    if (buttonEl) buttonEl.disabled = true;

    try {
        const res = await apiMethod(contentId);

        if (!res || res.status !== "success") {
            console.warn(`${warnLabel}响应异常:`, res);
            return null;
        }

        const count = typeof res[countField] === 'number' ? res[countField] : 0;
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
        return res;
    } catch (err) {
        console.error(`${warnLabel}操作失败:`, err);
        showToast(t('task.operation_failed'), "error");
        return null;
    } finally {
        _pendingActions.delete(actionKey);
        if (buttonEl) buttonEl.disabled = false;
    }
}

/**
 * 处理点赞按钮点击
 * @param {Function} apiMethod - API方法，如 api.toggleTaskLike
 * @param {string} contentId - 内容ID
 * @param {HTMLElement} buttonEl - 按钮元素
 * @param {HTMLElement} countEl - 计数元素
 * @param {Object} currentUser - 当前用户
 * @returns {Promise<Object|null>}
 */
export async function handleToggleLike(apiMethod, contentId, buttonEl, countEl, currentUser) {
    return _handleToggleAction(apiMethod, contentId, buttonEl, countEl, currentUser, {
        actionPrefix: 'like',
        countField: 'likes',
        activeAction: 'liked',
        activeColor: '#FF5722',
        activeToastKey: 'post.liked',
        warnLabel: '点赞'
    });
}

/**
 * 处理收藏按钮点击
 * @param {Function} apiMethod - API方法，如 api.toggleTaskFavorite
 * @param {string} contentId - 内容ID
 * @param {HTMLElement} buttonEl - 按钮元素
 * @param {HTMLElement} countEl - 计数元素
 * @param {Object} currentUser - 当前用户
 * @returns {Promise<Object|null>}
 */
export async function handleToggleFavorite(apiMethod, contentId, buttonEl, countEl, currentUser) {
    return _handleToggleAction(apiMethod, contentId, buttonEl, countEl, currentUser, {
        actionPrefix: 'favorite',
        countField: 'favorites',
        activeAction: 'favorited',
        activeColor: '#FFC107',
        activeToastKey: 'post.favorited',
        activeTextColor: '#000',
        inactiveTextColor: '#fff',
        warnLabel: '收藏'
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

/**
 * HTML转义
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}
