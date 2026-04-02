// 前端页面/components/互动工具函数.js
// ==========================================
// 👍 公共互动工具函数
// ==========================================
// 作用：提取任务、帖子、资源详情页中重复的互动逻辑
// 包括：访问量记录防抖、点赞/收藏按钮状态渲染、互动事件处理
// ==========================================

import { showToast } from "./UI交互提示组件.js";
import { t } from "./用户体验增强.js";

// ==========================================
// 👀 访问量记录防抖（通用版）
// ==========================================

const _viewRecordCache = {};
const VIEW_DEBOUNCE_MS = 60000; // 60秒防抖

/**
 * 记录内容浏览量（带60秒防抖）
 * @param {Function} apiMethod - API方法，如 api.recordTaskView
 * @param {string} contentId - 内容ID
 * @param {string} cachePrefix - 缓存前缀，如 'task', 'post', 'item'
 * @param {Function} onSuccess - 成功回调，接收返回数据
 * @returns {Promise<Object|null>}
 */
export async function recordView(apiMethod, contentId, cachePrefix, onSuccess = null) {
    console.log(`[浏览量调试] recordView 被调用 - prefix: ${cachePrefix}, id: ${contentId}`);
    const now = Date.now();
    const cacheKey = `${cachePrefix}_${contentId}`;
    
    // 检查是否在防抖时间内
    if (_viewRecordCache[cacheKey] && now - _viewRecordCache[cacheKey] < VIEW_DEBOUNCE_MS) {
        console.log(`[浏览量调试] 防抖拦截 - ${cacheKey}, 距上次: ${now - _viewRecordCache[cacheKey]}ms`);
        return null; // 防抖中，跳过
    }
    
    try {
        const res = await apiMethod(contentId);
        console.log(`[浏览量调试] API响应:`, res?.status, res);
        if (res.status === "success") {
            // 成功后才记录时间戳
            _viewRecordCache[cacheKey] = now;
            if (onSuccess) onSuccess(res);
            return res;
        }
    } catch (err) {
        // 浏览记录失败不影响页面显示，但输出详细错误便于调试
        console.error(`[浏览量调试] 记录${cachePrefix}浏览量失败:`, err.message || err);
        console.error(`[浏览量调试] 请求参数 - contentId: ${contentId}, cachePrefix: ${cachePrefix}`);
        console.error(`[浏览量调试] 错误详情:`, err);
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
            ⭐ <span id="favorite-count">${data.favorites || 0}</span>
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
 * 处理点赞按钮点击
 * @param {Function} apiMethod - API方法，如 api.toggleTaskLike
 * @param {string} contentId - 内容ID
 * @param {HTMLElement} buttonEl - 按钮元素
 * @param {HTMLElement} countEl - 计数元素
 * @param {Object} currentUser - 当前用户
 * @returns {Promise<Object|null>}
 */
export async function handleToggleLike(apiMethod, contentId, buttonEl, countEl, currentUser) {
    if (!currentUser) {
        showToast(t('auth.login_required'), "warning");
        return null;
    }
    
    try {
        const res = await apiMethod(contentId);
        
        // 🔥 防御性增强：检查响应数据有效性
        if (!res || res.status !== "success") {
            console.warn('点赞响应异常:', res);
            return null;
        }
        
        const likeCount = typeof res.likes === 'number' ? res.likes : 0;
        if (countEl) countEl.textContent = likeCount;
        
        if (res.action === "liked") {
            buttonEl.style.background = "#FF5722";
            buttonEl.style.borderColor = "#FF5722";
            showToast(t('post.liked'), "success");
        } else {
            buttonEl.style.background = "#333";
            buttonEl.style.borderColor = "#555";
        }
        return res;
    } catch (err) {
        console.error('点赞操作失败:', err);
        showToast(t('task.operation_failed'), "error");
        return null;
    }
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
    if (!currentUser) {
        showToast(t('auth.login_required'), "warning");
        return null;
    }
    
    try {
        const res = await apiMethod(contentId);
        
        // 🔥 防御性增强：检查响应数据有效性
        if (!res || res.status !== "success") {
            console.warn('收藏响应异常:', res);
            return null;
        }
        
        const favoriteCount = typeof res.favorites === 'number' ? res.favorites : 0;
        if (countEl) countEl.textContent = favoriteCount;
        
        if (res.action === "favorited") {
            buttonEl.style.background = "#FFC107";
            buttonEl.style.borderColor = "#FFC107";
            buttonEl.style.color = "#000";
            showToast(t('post.favorited'), "success");
        } else {
            buttonEl.style.background = "#333";
            buttonEl.style.borderColor = "#555";
            buttonEl.style.color = "#fff";
        }
        return res;
    } catch (err) {
        console.error('收藏操作失败:', err);
        showToast(t('task.operation_failed'), "error");
        return null;
    }
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
// 🎁 渲染打赏榜单（通用版）
// ==========================================

/**
 * 渲染打赏榜单 HTML
 * @param {Array} tipBoard - 打赏榜单数据
 * @param {number} maxItems - 最大显示条数，默认5
 * @param {string} emptyText - 空榜单提示文字
 * @returns {string} HTML字符串
 */
export function renderTipBoardHTML(tipBoard, maxItems = 5, emptyText = null) {
    if (!tipBoard || tipBoard.length === 0) {
        return `
            <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; text-align: center; color: #666; font-size: 12px;">
                ${emptyText || t('post.no_tips')}
            </div>
        `;
    }
    
    const items = tipBoard.slice(0, maxItems).map((t_item, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        const name = t_item.is_anon ? t('creator.anonymous') : (t_item.account || t('common.unknown_user'));
        return `
            <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0;">
                <span style="width: 24px; text-align: center;">${medal}</span>
                <span style="flex: 1; color: #ddd; font-size: 13px;">${escapeHtml(name)}</span>
                <span style="color: #FFC107; font-size: 12px;">${t_item.amount} ${t('task.points')}</span>
            </div>
        `;
    }).join("");
    
    return `
        <div style="background: #1a1a1a; padding: 12px; border-radius: 8px;">
            <div style="font-size: 13px; font-weight: bold; color: #FFC107; margin-bottom: 8px;">${t('post.tip_board_title')}</div>
            ${items}
        </div>
    `;
}

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
