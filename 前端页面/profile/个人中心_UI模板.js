// 前端页面/profile/个人中心_UI模板.js
// ==========================================
// 👤 个人中心 UI 模板
// ==========================================
// 作用：生成个人中心界面的HTML结构
// 关联文件：
//   - 个人中心视图.js (调用此模板)
//   - 打赏等级工具.js (打赏榜单等级渲染)
// ==========================================

import { CACHE, getBannerCacheKey, isAdmin, PLACEHOLDERS } from "../core/全局配置.js";
import { t } from "../components/用户体验增强.js";

export function buildProfileHTML(userData, isMe, isSettingsView, isFollowing, followingCount, activeTab, tabs) {
    // 个人资料卡背景图：
    // - 自己查看自己：优先使用本地缓存（账号区分键），否则使用云端 URL
    // - 他人查看：直接使用云端 URL (userData.bannerUrl)
    let bannerImageUrl = userData.bannerUrl;
    if (isMe) {
        const localBannerCache = localStorage.getItem(getBannerCacheKey(userData.account));
        if (localBannerCache) {
            bannerImageUrl = localBannerCache;
        }
    }
    
    const bannerStyle = bannerImageUrl 
        ? `background-image: url(${bannerImageUrl}); background-size: cover; background-position: center;`
        : `background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);`;

    // 设置视图时返回简化的返回按钮（与个人资料页按钮样式一致，但不显示背景图）
    if (isSettingsView && isMe) {
        return `
            <button id="btn-back-profile" style="align-self: flex-start; margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                <span style="font-size: 14px;">⬅</span> ${t('common.back')}
            </button>
        `;
    }

    const actionButtons = isMe 
        ? `<div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
               <button id="btn-wallet" style="background: #FF9800; border: none; color: white; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">💰 ${t('profile.recharge')}</button>
               <button id="btn-withdraw" style="background: rgba(76,175,80,0.2); border: 1px solid #4CAF50; color: #4CAF50; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='rgba(76,175,80,0.3)'" onmouseout="this.style.background='rgba(76,175,80,0.2)'">💸 ${t('profile.withdraw')}</button>
           </div>`
        : `<button id="btn-tip-user" style="width: 100%; background: #FF9800; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s; margin-bottom: 8px;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🎁 ${t('profile.tip_support')}</button>
           <button id="btn-send-msg" style="width: 100%; background: #2196F3; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✉️ ${t('profile.send_message')}</button>
           <button id="btn-follow-user" style="width: 100%; background: ${isFollowing ? '#4CAF50' : '#4CAF50'}; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-top: 8px;">${isFollowing ? `✔️ ${t('profile.followed')}` : `➕ ${t('profile.follow_author')}`}</button>`;

    // 统计数据区域（现在在背景图内）
    const statsHtml = `
        <div style="display: flex; gap: 15px; font-size: 12px; color: rgba(255,255,255,0.9); flex-wrap: wrap; margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
            ${isMe ? `
                <div style="display:flex; flex-direction: column; gap: 6px; width: 100%;">
                    <div style="font-size: 14px;">
                        <span>💰 ${t('profile.balance')}: <strong style="color:#FF9800; font-size: 16px;">${userData.balance || 0}</strong></span>
                    </div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.6);">
                        <span>🛍️ ${t('profile.sales')}: ${userData.earn_balance || 0}</span>
                        <span style="margin-left: 12px;">🎁 ${t('profile.tips')}: ${userData.tip_balance || 0}</span>
                        <span style="margin-left: 12px;">📋 ${t('profile.task_earnings') || '任务收益'}: ${userData.task_balance || 0}</span>
                    </div>
                </div>
            ` : ''}
            <div style="display:flex; gap: 12px;">
                <span>👍 ${t('profile.received_likes')}: <strong style="color:#fff;">${userData.receivedLikes || 0}</strong></span>
                <span>⭐ ${t('profile.received_favorites')}: <strong style="color:#fff;">${userData.receivedFavorites || 0}</strong></span>
                <span id="btn-followers" style="cursor: pointer;">👥 ${t('profile.followers_count')}: <strong style="color:#fff;">${userData.followers ? userData.followers.length : 0}</strong></span>
                <span id="btn-following" style="cursor: pointer;">🏃 ${t('profile.following_count')}: <strong style="color:#fff;">${followingCount}</strong></span>
            </div>
        </div>
    `;

    // 整个头部区域（包括返回按钮、用户信息、统计数据）都在背景图内
    const headerHtml = `
        <div style="position: relative; border-radius: 12px; overflow: hidden; margin-bottom: 15px;">
            <div style="${bannerStyle} padding: 15px; min-height: 200px;">
                <!-- 顶部导航栏 -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <button id="btn-back-profile" style="background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                        <span style="font-size: 14px;">⬅</span> ${t('common.back')}
                    </button>
                    ${isMe ? `
                    <div style="display: flex; gap: 10px;">
                        <button id="btn-open-settings" style="background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #ccc; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.color='#fff'; this.style.borderColor='#888'" onmouseout="this.style.color='#ccc'; this.style.borderColor='rgba(85,85,85,0.8)'">⚙️ ${t('profile.settings')}</button>
                        <button id="btn-logout" style="background: rgba(244,67,54,0.2); border: 1px solid #F44336; color: #F44336; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='#F44336'; this.style.color='#fff'" onmouseout="this.style.background='rgba(244,67,54,0.2)'; this.style.color='#F44336'">🚪 ${t('profile.logout')}</button>
                    </div>` : ''}
                </div>
                
                <!-- 用户信息区域 -->
                <div style="display: flex; align-items: flex-start; gap: 15px; position: relative;">
                    <img src="${userData.avatarDataUrl || userData.avatar || PLACEHOLDERS.AVATAR}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #4CAF50; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
                    <div style="flex: 1; padding-right: 150px;">
                        <div style="font-size: 20px; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; text-shadow: 0 2px 4px rgba(0,0,0,0.6);">
                            ${userData.name}
                            <span style="font-size: 12px; background: rgba(68,68,68,0.8); padding: 2px 6px; border-radius: 4px; font-weight: normal; backdrop-filter: blur(4px);">${userData.gender === 'male' ? '♂️' : (userData.gender === 'female' ? '♀️' : '🔒')} ${userData.age !== undefined && userData.age !== null ? userData.age : t('profile.unknown_age')}${t('profile.age_years')}</span>
                        </div>
                        <div style="font-size: 12px; color: rgba(255,255,255,0.85); margin-bottom: 8px; text-shadow: 0 1px 3px rgba(0,0,0,0.6);">📍 ${userData.country || t('profile.location_secret')} - ${userData.region || ''}</div>
                        <div style="font-size: 13px; color: rgba(255,255,255,0.95); line-height: 1.4; word-break: break-all; text-shadow: 0 1px 3px rgba(0,0,0,0.6);">${userData.intro || t('profile.no_intro')}</div>
                    </div>
                    <div style="position: absolute; top: 0; right: 0; width: 135px; display: flex; flex-direction: column; gap: 8px;">${actionButtons}</div>
                </div>
                
                <!-- 统计数据区域 -->
                ${statsHtml}
            </div>
        </div>
    `;

    // ====================================================================
    // 【核心新增】：管理员专属系统公告发布 UI 面板 (仅自己且账号是管理员时可见)
    // 🔒 P0安全修复：使用配置化的 isAdmin() 函数
    // ====================================================================
    let adminHtml = '';
    if (isMe && isAdmin(userData.account)) {
        adminHtml = `
            <!-- 管理员功能按钮区域 -->
            <div id="admin-actions-panel" style="margin-bottom: 15px; background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                <div style="font-weight: bold; font-size: 15px; color: #FF9800; display: flex; align-items: center; gap: 6px; margin-bottom: 12px;">
                    🛠️ ${t('admin.management_tools')}
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="btn-admin-withdraw" style="flex: 1; min-width: 120px; background: linear-gradient(135deg, #4CAF50, #388E3C); border: none; color: #fff; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s; box-shadow: 0 2px 6px rgba(76,175,80,0.3);" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        💰 ${t('withdraw.manage_title')}
                    </button>
                    <button id="btn-admin-dispute" style="flex: 1; min-width: 120px; background: linear-gradient(135deg, #9C27B0, #7B1FA2); border: none; color: #fff; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s; box-shadow: 0 2px 6px rgba(156,39,176,0.3);" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        ⚖️ ${t('task.arbitrate')}
                    </button>
                </div>
            </div>

            <div id="admin-ann-panel" style="margin-bottom: 15px; background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="font-weight: bold; font-size: 15px; color: #FF9800; display: flex; align-items: center; gap: 6px;">
                        📢 全站系统公告发布
                    </div>
                    <div id="admin-privilege-badge" style="font-size: 11px; color: #E91E63; background:rgba(233,30,99,0.1); padding: 2px 6px; border-radius: 4px;">加载中...</div>
                </div>
                <textarea id="admin-ann-content" placeholder="在此输入公告内容（例如 V1.2.0 内测更新公告），支持直接回车换行，内容将在所有用户的消息提醒中醒目展示，发布后无法撤回，请谨慎操作！" style="width: 100%; height: 120px; background: #232738; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; color: #eee; padding: 10px; font-size: 13px; line-height: 1.6; resize: none; margin-bottom: 12px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#FF9800'" onblur="this.style.borderColor='rgba(255,255,255,0.05)'"></textarea>
                <button id="btn-admin-ann-send" style="width: 100%; background: #E91E63; color: #fff; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; transition: background 0.2s, transform 0.1s;" onmouseover="this.style.background='#D81B60'; this.style.transform='scale(1.01)'" onmouseout="this.style.background='#E91E63'; this.style.transform='scale(1)'">
                    🚀 确认发布全站公告
                </button>
            </div>
            
            <!-- 管理员调试面板：Python 脚本执行 -->
            <div id="admin-debug-panel" style="margin-bottom: 15px; background: #1a1f2e; border: 1px solid #3d4663; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="font-weight: bold; font-size: 15px; color: #4CAF50; display: flex; align-items: center; gap: 6px;">
                        🔧 API 调试与脚本执行
                    </div>
                    <div style="font-size: 11px; color: #4CAF50; background:rgba(76,175,80,0.1); padding: 2px 6px; border-radius: 4px;">开发者工具</div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <input type="text" id="admin-script-input" placeholder="输入脚本名称，如: test_api.py 或 密码迁移.py" style="flex: 1; padding: 10px; background: #232738; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #eee; font-size: 13px; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#4CAF50'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                    <button id="btn-admin-run-script" style="padding: 10px 20px; background: #4CAF50; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; white-space: nowrap; transition: background 0.2s;" onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
                        ▶️ 执行
                    </button>
                </div>
                <div id="admin-script-result" style="background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 12px; min-height: 80px; max-height: 200px; overflow-y: auto; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: #8b949e; line-height: 1.5; white-space: pre-wrap; word-break: break-all;">
                    <span style="color: #6e7681;"># 结果将在这里显示...</span>
                </div>
            </div>
        `;
    }

    let tabsHtml = `<div style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 5px;">`;
    tabs.forEach(tab => {
        const isActive = activeTab === tab.id;
        tabsHtml += `<button class="profile-tab-btn" data-id="${tab.id}" style="background: transparent; border: none; cursor: pointer; padding: 5px 10px; color: ${isActive ? '#4CAF50' : '#888'}; font-weight: ${isActive ? 'bold' : 'normal'}; border-bottom: ${isActive ? '2px solid #4CAF50' : 'none'};">${tab.label}</button>`;
    });
    tabsHtml += `</div><div id="profile-list-container" style="flex: 1; overflow-y: auto; padding-right: 5px;"></div>`;

    return headerHtml + adminHtml + tabsHtml;
}