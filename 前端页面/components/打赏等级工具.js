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

/**
 * 等级规则（参考QQ等级系统）：
 * - 每 100 积分 = 1 颗星星 ⭐
 * - 每 5 颗星星 = 1 个月亮 🌙 (即 500 积分)
 * - 每 5 个月亮 = 1 个太阳 ☀️ (即 2500 积分)
 * - 上限：9 个太阳 = 22500 积分 (超过后不再接受打赏)
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
    
    // 计算太阳数量
    const suns = Math.floor(cappedAmount / POINTS_PER_SUN);
    let remaining = cappedAmount % POINTS_PER_SUN;
    
    // 计算月亮数量
    const moons = Math.floor(remaining / POINTS_PER_MOON);
    remaining = remaining % POINTS_PER_MOON;
    
    // 计算星星数量
    const stars = Math.floor(remaining / POINTS_PER_STAR);
    
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
        return `<span style="color:#666; font-size:11px;">${t('tip.new_fan')}</span>`;
    }
    
    const level = calculateTipLevel(amount);
    let html = '';
    
    // ========== 紧凑模式：只显示图标 ==========
    if (compact) {
        // 太阳（最高级别优先显示）
        if (level.suns > 0) {
            html += `<span style="font-size:12px;">${ICON_SUN.repeat(Math.min(level.suns, 3))}${level.suns > 3 ? '×' + level.suns : ''}</span>`;
        }
        // 月亮
        if (level.moons > 0) {
            html += `<span style="font-size:11px;">${ICON_MOON.repeat(level.moons)}</span>`;
        }
        // 星星
        if (level.stars > 0) {
            html += `<span style="font-size:10px;">${ICON_STAR.repeat(level.stars)}</span>`;
        }
        
        // 满级特效
        if (level.isMaxLevel) {
            html = `<span style="background: linear-gradient(90deg, #FFD700, #FF6B6B, #4CAF50); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold;">${html} 👑</span>`;
        }
        
        return html || `<span style="color:#888; font-size:10px;">⭐</span>`;
    }
    
    // ========== 完整模式：显示图标+数量 ==========
    const parts = [];
    
    if (level.suns > 0) {
        parts.push(`<span style="color:#FF6B00; font-weight:bold;">${ICON_SUN}×${level.suns}</span>`);
    }
    if (level.moons > 0) {
        parts.push(`<span style="color:#FFD700;">${ICON_MOON}×${level.moons}</span>`);
    }
    if (level.stars > 0) {
        parts.push(`<span style="color:#FFC107;">${ICON_STAR}×${level.stars}</span>`);
    }
    
    // 满级特效
    if (level.isMaxLevel) {
        return `<span style="background: linear-gradient(90deg, #FFD700, #FF6B6B, #4CAF50); padding: 2px 6px; border-radius: 4px; font-size:11px;">👑 ${t('tip.supreme_sponsor')}</span>`;
    }
    
    return parts.length > 0 
        ? `<span style="display:inline-flex; gap:4px; align-items:center; font-size:11px;">${parts.join(' ')}</span>` 
        : `<span style="color:#888; font-size:10px;">⭐</span>`;
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
    if (!amount || amount <= 0) return "新粉丝";
    
    const level = calculateTipLevel(amount);
    
    if (level.isMaxLevel) return "至尊赞助者 (已满级)";
    if (level.suns >= 5) return "超级赞助者";
    if (level.suns >= 1) return "黄金赞助者";
    if (level.moons >= 3) return "白银赞助者";
    if (level.moons >= 1) return "青铜赞助者";
    if (level.stars >= 3) return "热心粉丝";
    return "支持者";
}

/**
 * 生成打赏榜单项HTML（统一格式）
 * @param {object} tipData - 打赏数据 { account, amount, is_anon }
 * @param {number} rank - 排名（从0开始）
 * @param {string} size - 尺寸 'small' | 'normal' | 'large'
 * @returns {string} - 榜单项HTML
 */
export function renderTipBoardItemHTML(tipData, rank, size = 'normal') {
    const { account, amount, is_anon } = tipData;
    
    // 排名徽章颜色
    const badgeColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // 金银铜
    const badgeBg = rank < 3 ? badgeColors[rank] : '#444';
    const badgeColor = rank < 3 ? '#000' : '#aaa';
    
    // 尺寸配置
    const sizeConfig = {
        small: { badge: 16, font: 11, padding: 3 },
        normal: { badge: 20, font: 12, padding: 5 },
        large: { badge: 24, font: 14, padding: 8 }
    };
    const cfg = sizeConfig[size] || sizeConfig.normal;
    
    // 名称显示
    const displayName = is_anon ? '🔒 匿名' : account;
    const nameColor = is_anon ? '#888' : '#ddd';
    
    // 等级图标
    const levelHtml = renderTipLevelHTML(amount, true);
    
    return `
        <div style="display:flex; justify-content:space-between; padding:${cfg.padding}px 0; font-size:${cfg.font}px; align-items:center; border-bottom:1px dashed #333;">
            <span style="display:flex; align-items:center; gap:6px;">
                <span style="display:inline-flex; justify-content:center; align-items:center; width:${cfg.badge}px; height:${cfg.badge}px; border-radius:50%; background:${badgeBg}; color:${badgeColor}; font-weight:bold; font-size:${cfg.font - 2}px;">${rank + 1}</span>
                <span style="color:${nameColor};">${displayName}</span>
            </span>
            <span style="display:flex; align-items:center; gap:6px;">
                ${levelHtml}
                <span style="color:#4CAF50; font-weight:bold; font-size:${cfg.font - 1}px;">${amount}</span>
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
export function renderTipBoardHTML(boardData, maxShow = 5, emptyText = "暂无打赏，快来成为首个赞赏人吧！", size = 'normal') {
    if (!boardData || boardData.length === 0) {
        return `<div style="color:#666; font-size:12px; text-align:center; padding:12px 0;">${emptyText}</div>`;
    }
    
    return boardData.slice(0, maxShow).map((t, i) => renderTipBoardItemHTML(t, i, size)).join('');
}
