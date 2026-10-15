// 前端页面/profile/个人中心_UI模板.js
// ==========================================
// 👤 个人中心 UI 模板
// ==========================================
// 作用：生成个人中心界面的HTML结构
// 关联文件：
//   - 个人中心视图.js (调用此模板)
//   - 打赏等级工具.js (打赏榜单等级渲染)
// ==========================================

import { getBannerCacheKey, PLACEHOLDERS, normalizeProfileImageUrl } from "../core/全局配置.js";
import { t } from "../components/用户体验增强.js";
import { escapeHtml } from "../components/互动工具函数.js";  // 🧹 P2归一：局部副本已移除

/** 生成返回按钮HTML */
function _backButtonHtml(extraClass = '') {
    return `<button type="button" id="btn-back-profile" class="profile-nav-btn ${extraClass}">⬅ ${t('common.back')}</button>`;
}

export function buildProfileHTML(userData, isMe, isSettingsView, isFollowing, followingCount, activeTab, tabs) {
    // 个人资料卡背景图：
    // - 自己查看自己：优先使用本地缓存（账号区分键），否则使用云端 URL
    // - 他人查看：直接使用云端 URL (userData.bannerUrl)
    let bannerImageUrl = normalizeProfileImageUrl(userData.bannerUrl);
    if (isMe) {
        let localBannerCache = null;
        try { localBannerCache = localStorage.getItem(getBannerCacheKey(userData.account)); } catch (_) {}
        if (normalizeProfileImageUrl(localBannerCache)) {
            bannerImageUrl = localBannerCache;
        }
    }
    
    const hasBannerImage = !!bannerImageUrl;
    const bannerStyle = hasBannerImage
        ? `background-image: ${escapeHtml(`url(${JSON.stringify(bannerImageUrl)})`)}; background-size: cover; background-position: center;`
        : ``;

    // 设置视图时返回简化的返回按钮（与个人资料页按钮样式一致，但不显示背景图）
    if (isSettingsView && isMe) {
        return _backButtonHtml('profile-nav-btn--settings-return');
    }

    const actionButtons = isMe 
        ? `<div class="profile-wallet-actions">
               <button type="button" id="btn-wallet" class="profile-action-btn profile-action-btn--primary profile-action-btn--me">💰 ${t('profile.recharge')}</button>
               <button type="button" id="btn-withdraw" class="profile-action-btn profile-action-btn--withdraw profile-action-btn--me">💸 ${t('profile.withdraw')}</button>
           </div>`
        : `<button type="button" id="btn-tip-user" class="profile-tip-action profile-action-btn profile-action-btn--primary profile-action-btn--other">🎁 ${t('profile.tip_support')}</button>
           <button type="button" id="btn-send-msg" class="profile-action-btn profile-action-btn--send profile-action-btn--other">✉️ ${t('profile.send_message')}</button>
           <button type="button" id="btn-follow-user" class="profile-follow-action profile-action-btn profile-action-btn--follow profile-action-btn--other">${isFollowing ? `✔️ ${t('profile.followed')}` : `➕ ${t('profile.follow_author')}`}</button>`;

    // 统计数据区域（现在在背景图内）
    const statsHtml = `
        <div class="profile-stats">
            ${isMe ? `
                <div class="profile-wallet-stats">
                    <div class="profile-balance">
                        <span>💰 ${t('profile.balance')}: <strong class="profile-balance-amount">${escapeHtml(userData.balance || 0)}</strong></span>
                    </div>
                    <div class="profile-earnings">
                        <span>🛍️ ${t('profile.sales')}: ${escapeHtml(userData.earn_balance || 0)}</span>
                        <span class="profile-earning-item">🎁 ${t('profile.tips')}: ${escapeHtml(userData.tip_balance || 0)}</span>
                        <span class="profile-earning-item">📋 ${t('profile.task_earnings')}: ${escapeHtml(userData.task_balance || 0)}</span>
                    </div>
                </div>
            ` : ''}
            <div class="profile-counts">
                <span>👍 ${t('profile.received_likes')}: <strong class="profile-count">${escapeHtml(userData.receivedLikes || 0)}</strong></span>
                <span>🔖 ${t('profile.received_favorites')}: <strong class="profile-count">${escapeHtml(userData.receivedFavorites || 0)}</strong></span>
                <button type="button" class="profile-count-link" id="btn-followers">👥 ${t('profile.followers_count')}: <strong class="profile-count">${userData.followers ? userData.followers.length : 0}</strong></button>
                <button type="button" class="profile-count-link" id="btn-following">🏃 ${t('profile.following_count')}: <strong class="profile-count">${escapeHtml(followingCount)}</strong></button>
            </div>
        </div>
    `;

    // 整个头部区域（包括返回按钮、用户信息、统计数据）都在背景图内
    const headerHtml = `
        <div class="profile-header">
            <div class="profile-banner" style="${bannerStyle}">
                <!-- 顶部导航栏 -->
                <div class="profile-navigation">
                    <div class="profile-back-group">
                        ${_backButtonHtml()}
                    </div>
                    ${isMe ? `
                    <div class="profile-account-actions">
                        <button type="button" id="btn-open-settings" class="profile-header-btn profile-header-btn--settings">⚙️ ${t('profile.settings')}</button>
                        <button type="button" id="btn-logout" class="profile-header-btn profile-header-btn--logout">🚪 ${t('profile.logout')}</button>
                    </div>` : ''}
                </div>
                
                <!-- 用户信息区域 -->
                <div class="profile-identity">
                    <img alt="" class="profile-avatar" src="${escapeHtml(normalizeProfileImageUrl(userData.avatarDataUrl) || normalizeProfileImageUrl(userData.avatar) || PLACEHOLDERS.AVATAR)}">
                    <div class="profile-bio">
                        <div class="profile-name">
                            ${escapeHtml(userData.name)}
                            <span class="profile-age">${userData.gender === 'male' ? '♂️' : (userData.gender === 'female' ? '♀️' : '🔒')} ${userData.age !== undefined && userData.age !== null ? escapeHtml(userData.age) : t('profile.unknown_age')}${t('profile.age_years')}</span>
                        </div>
                        <div class="profile-location">📍 ${escapeHtml(userData.country) || t('profile.location_secret')} - ${escapeHtml(userData.region || '')}</div>
                        <div class="profile-intro">${escapeHtml(userData.intro) || t('profile.no_intro')}</div>
                    </div>
                    <div class="profile-actions">${actionButtons}</div>
                </div>
                
                <!-- 统计数据区域 -->
                ${statsHtml}
            </div>
        </div>
    `;

    let tabsHtml = `<div class="profile-tabs">`;
    tabs.forEach(tab => {
        const isActive = activeTab === tab.id;
        tabsHtml += `<button type="button" class="profile-tab-btn" data-id="${tab.id}" aria-pressed="${isActive}">${tab.label}</button>`;
    });
    tabsHtml += `</div><div class="profile-list" id="profile-list-container"></div>`;

    return headerHtml + tabsHtml;
}
