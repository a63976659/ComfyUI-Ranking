// 前端页面/components/打赏等级工具.js
// ==========================================
// 🏅 打赏等级计算与显示工具
// ==========================================
// 作用：根据打赏金额计算并渲染星星/月亮/太阳等级
// 关联文件：
//   - 列表卡片组件.js (工具/应用/推荐详情打赏榜)
//   - 个人中心_UI模板.js (创作者总榜)
//   - 创作者卡片组件.js (创作者列表)
//   - 资源详情页面组件.js (资源详情打赏榜)
// ===========================================

import { t } from "./用户体验增强.js";
import { getCachedProfile, getProfileWithSWR, PLACEHOLDERS, escapeHtml } from "../core/全局配置.js";
import { api } from "../core/网络请求_业务API.js";

let nextTipBoardItemId = 0;

/**
 * 等级规则（参考QQ等级系统）：
 * - 1-100 积分 = 1 颗星星 ⭐，101-200 积分 = 2 颗星星，以此类推
 * - 每 5 颗星星 = 1 个月亮 🌙 (即 500 积分 = 1月亮)
 * - 每 5 个月亮 = 1 个太阳 ☀️ (即 2500 积分 = 1太阳)
 * - 上限：9 个太阳 = 22500 积分 (超过后不再接受打赏)
 * - 注：1积分 = 1元，积分数即为元数
 */

// 等级图标定义
const ICON_STAR = "⭐";
const ICON_MOON = "🌙";
const ICON_SUN = "☀️";

// 等级阈值常量
const POINTS_PER_STAR = 100;      // 每颗星星需要100积分
const STARS_PER_MOON = 5;         // 每5颗星星升级为1个月亮
const MOONS_PER_SUN = 5;          // 每5个月亮升级为1个太阳
const MAX_SUNS = 9;               // 最高等级：9个太阳

// 计算各等级数量的阈值
const POINTS_PER_MOON = POINTS_PER_STAR * STARS_PER_MOON;   // 500积分 = 1月亮
const POINTS_PER_SUN = POINTS_PER_MOON * MOONS_PER_SUN;     // 2500积分 = 1太阳
const MAX_POINTS = POINTS_PER_SUN * MAX_SUNS;               // 22500积分 = 满级

/**
 * 计算打赏等级
 * @param {number} amount - 打赏金额（积分）
 * @returns {object} - 包含 suns, moons, stars 数量
 */
export function calculateTipLevel(amount) {
    // 限制最大值
    const cappedAmount = Math.min(amount, MAX_POINTS);
    
    // 计算总星级（使用 ceil：1-100积分=1星，101-200积分=2星，以此类推）
    const totalStars = cappedAmount > 0 ? Math.ceil(cappedAmount / POINTS_PER_STAR) : 0;
    
    // 转换为太阳、月亮、星星
    const suns = Math.floor(totalStars / (STARS_PER_MOON * MOONS_PER_SUN));
    const moons = Math.floor((totalStars % (STARS_PER_MOON * MOONS_PER_SUN)) / STARS_PER_MOON);
    const stars = totalStars % STARS_PER_MOON;
    
    return { suns, moons, stars, isMaxLevel: cappedAmount >= MAX_POINTS };
}

/**
 * 渲染等级图标HTML
 * @param {number} amount - 打赏金额（积分）
 * @param {boolean} compact - 是否紧凑模式（只显示图标不显示数量）
 * @returns {string} - 等级图标的HTML字符串
 */
export function renderTipLevelHTML(amount, compact = false) {
    if (!amount || amount <= 0) {
        return `<span class="tip-level tip-level--new">${t('tip.new_fan')}</span>`;
    }
    
    const level = calculateTipLevel(amount);
    let html = '';
    
    // ========== 紧凑模式：只显示图标 ==========
    if (compact) {
        // 太阳（最高级别优先显示）
        if (level.suns > 0) {
            html += `<span class="tip-level__icon tip-level__icon--sun">${ICON_SUN.repeat(Math.min(level.suns, 3))}${level.suns > 3 ? '×' + level.suns : ''}</span>`;
        }
        // 月亮
        if (level.moons > 0) {
            html += `<span class="tip-level__icon tip-level__icon--moon">${ICON_MOON.repeat(level.moons)}</span>`;
        }
        // 星星
        if (level.stars > 0) {
            html += `<span class="tip-level__icon tip-level__icon--star">${ICON_STAR.repeat(level.stars)}</span>`;
        }
        
        // 满级特效
        if (level.isMaxLevel) {
            html = `<span class="tip-level tip-level--max-compact">${html} 👑</span>`;
        }
        
        return html || `<span class="tip-level tip-level--fallback">⭐</span>`;
    }
    
    // ========== 完整模式：显示图标+数量 ==========
    const parts = [];
    
    if (level.suns > 0) {
        parts.push(`<span class="tip-level__part tip-level__part--sun">${ICON_SUN}×${level.suns}</span>`);
    }
    if (level.moons > 0) {
        parts.push(`<span class="tip-level__part tip-level__part--moon">${ICON_MOON}×${level.moons}</span>`);
    }
    if (level.stars > 0) {
        parts.push(`<span class="tip-level__part tip-level__part--star">${ICON_STAR}×${level.stars}</span>`);
    }
    
    // 满级特效
    if (level.isMaxLevel) {
        return `<span class="tip-level tip-level--max">👑 ${t('tip.supreme_sponsor')}</span>`;
    }
    
    return parts.length > 0 
        ? `<span class="tip-level tip-level--full">${parts.join(' ')}</span>` 
        : `<span class="tip-level tip-level--fallback">⭐</span>`;
}

/**
 * 检查是否达到打赏上限
 * @param {number} amount - 当前累计打赏金额
 * @returns {boolean} - 是否已达上限
 */
export function isMaxTipLevel(amount) {
    return amount >= MAX_POINTS;
}

/**
 * 获取等级描述文字
 * @param {number} amount - 打赏金额
 * @returns {string} - 等级描述
 */
export function getTipLevelDescription(amount) {
    if (!amount || amount <= 0) return t('tip.new_fan');
    
    const level = calculateTipLevel(amount);
    
    if (level.isMaxLevel) return t('tip.level_max');
    if (level.suns >= 5) return t('tip.level_super');
    if (level.suns >= 1) return t('tip.level_gold');
    if (level.moons >= 3) return t('tip.level_silver');
    if (level.moons >= 1) return t('tip.level_bronze');
    if (level.stars >= 3) return t('tip.level_fan');
    return t('tip.level_supporter');
}

/**
 * 生成打赏榜单项HTML（统一格式）
 * @param {object} tipData - 打赏数据 { account, amount, is_anon }
 * @param {number} rank - 排名（从0开始）
 * @param {string} size - 尺寸 'small' | 'normal' | 'large'
 * @returns {string} - 榜单项HTML
 */
export function renderTipBoardItemHTML(tipData, rank, size = 'normal') {
    if (!tipData || typeof tipData !== 'object' || Array.isArray(tipData)) return '';
    const { account, is_anon } = tipData;
    const amount = Number(tipData.amount);
    if (!Number.isFinite(amount) || amount < 0) return '';
    rank = Number.isSafeInteger(rank) && rank >= 0 ? rank : 0;
    
    const rankClass = rank < 3 ? ['gold', 'silver', 'bronze'][rank] : 'default';
    const sizeClass = size === 'small' || size === 'large' ? size : 'normal';
    
    // 等级图标
    const levelHtml = renderTipLevelHTML(amount, true);
    
    // 排名弽章 HTML（两个分支共用）
    const badgeHtml = `<span class="tip-board-badge tip-board-badge--${rankClass}">${rank + 1}</span>`;
    
    // 匿名用户处理
    if (is_anon) {
        return `
            <div class="tip-board-item tip-board-item--${sizeClass}">
                <span class="tip-board-group">
                    ${badgeHtml}
                    <span class="tip-board-anonymous">🔒 ${t('creator.anonymous')}</span>
                </span>
                <span class="tip-board-group">
                    ${levelHtml}
                    <span class="tip-board-amount">${amount}</span>
                </span>
            </div>
        `;
    }
    
    // 🚀 SWR 模式：非匿名用户显示头像+用户名
    const containerId = `ranking-tip-board-${++nextTipBoardItemId}`;
    
    // 从缓存获取初始数据（0延迟渲染）
    const cached = getCachedProfile(account);
    const avatarUrl = cached?.avatar || cached?.avatarDataUrl || PLACEHOLDERS.AVATAR_SMALL;
    const userName = cached?.name || account || t('common.unknown_user');
    
    // 后台静默校对并更新 DOM
    setTimeout(() => {
        const container = document.getElementById(containerId);
        if (!container) return;
        getProfileWithSWR(account, api.getUserProfile, (profile) => {
            if (!container.isConnected || document.getElementById(containerId) !== container) return;
            
            const avatarImg = container.querySelector('.tip-board-avatar');
            const nameSpan = container.querySelector('.tip-board-name');
            
            if (avatarImg && profile.avatar) {
                avatarImg.src = profile.avatar;
            }
            if (nameSpan && profile.name) {
                nameSpan.textContent = profile.name;
            }
        });
    }, 0);
    
    // 🔒 XSS防护：昵称/头像来自用户可修改的资料，写入 HTML 前必须转义
    // （上方 SWR 刷新路径用的是 .src / .textContent，本身就是安全的）
    return `
        <div id="${escapeHtml(containerId)}" class="tip-board-item tip-board-item--${sizeClass}">
            <span class="tip-board-group">
                ${badgeHtml}
                <span class="tip-board-group">
                    <img class="tip-board-avatar" alt="" src="${escapeHtml(avatarUrl)}">
                    <span class="tip-board-name">${escapeHtml(userName)}</span>
                </span>
            </span>
            <span class="tip-board-group">
                ${levelHtml}
                <span class="tip-board-amount">${amount}</span>
            </span>
        </div>
    `;
}

/**
 * 生成完整的打赏榜单HTML
 * @param {Array} boardData - 打赏榜数据数组
 * @param {number} maxShow - 最多显示数量
 * @param {string} emptyText - 无数据时的提示文字
 * @param {string} size - 尺寸
 * @returns {string} - 完整榜单HTML
 */
export function renderTipBoardHTML(boardData, maxShow = 5, emptyText = t('tip.no_tips_yet'), size = 'normal') {
    const entries = Array.isArray(boardData) ? boardData.filter(entry => entry && typeof entry === 'object'
        && !Array.isArray(entry) && Number.isFinite(Number(entry.amount)) && Number(entry.amount) >= 0) : [];
    if (entries.length === 0) {
        return `<div class="tip-board-empty">${escapeHtml(emptyText)}</div>`;
    }
    
    return entries.slice(0, maxShow).map((entry, i) => renderTipBoardItemHTML(entry, i, size)).join('');
}

/**
 * 获取等级规则说明（简短格式，用于榜单标题下方）
 * @returns {string} - 等级规则说明
 */
export function getTipLevelRuleShort() {
    return `1-100${t('tip.points')} = 1⭐ | 500${t('tip.points')} = 1🌙 | 2500${t('tip.points')} = 1☀️`;
}
