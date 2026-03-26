// 前端页面/profile/个人中心_UI模板.js

export function buildProfileHTML(userData, isMe, isSettingsView, isFollowing, followingCount, activeTab, tabs) {
    const topBarHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <button id="btn-back-profile" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#333'; this.style.borderColor='#555'">
                <span style="font-size: 14px;">⬅</span> 返回
            </button>
            ${(isMe && !isSettingsView) ? `
            <div style="display: flex; gap: 10px;">
                <button id="btn-open-settings" style="background: transparent; border: 1px solid #555; color: #aaa; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.color='#fff'; this.style.borderColor='#888'" onmouseout="this.style.color='#aaa'; this.style.borderColor='#555'">⚙️ 设置</button>
                <button id="btn-logout" style="background: transparent; border: 1px solid #F44336; color: #F44336; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#F44336'; this.style.color='#fff'" onmouseout="this.style.background='transparent'; this.style.color='#F44336'">🚪 登出</button>
            </div>` : ''}
        </div>
    `;

    if (isSettingsView && isMe) return topBarHtml; 

    const actionButtons = isMe 
        ? `<div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
               <button id="btn-wallet" style="background: #FF9800; border: none; color: white; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">💰 充值积分</button>
               <button id="btn-withdraw" style="background: transparent; border: 1px solid #4CAF50; color: #4CAF50; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='rgba(76,175,80,0.1)'" onmouseout="this.style.background='transparent'">💸 收益提现</button>
           </div>`
        : `<button id="btn-tip-user" style="width: 100%; background: #FF9800; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s; margin-bottom: 8px;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🎁 打赏支持</button>
           <button id="btn-send-msg" style="width: 100%; background: #2196F3; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✉️ 私信</button>
           <button id="btn-follow-user" style="width: 100%; background: ${isFollowing ? '#4CAF50' : '#4CAF50'}; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-top: 8px;">${isFollowing ? '✔️ 已关注' : '➕ 关注作者'}</button>`;

    const balanceDisplayHtml = isMe 
        ? `<div style="display:flex; flex-direction:column; gap:4px;">
             <div>💰 我的余额: <strong style="color:#FF9800;">${userData.balance || 0}</strong></div>
             <div>🛍️ 销售收益: <strong style="color:#4CAF50;">${userData.earn_balance || 0}</strong></div>
             <div>🎁 打赏收益: <strong style="color:#E91E63;">${userData.tip_balance || 0}</strong></div>
           </div>`
        : '';

    const headerHtml = `
        <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 20px; position: relative;">
            <img src="${userData.avatarDataUrl || userData.avatar || 'https://via.placeholder.com/150'}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #4CAF50; object-fit: cover;">
            <div style="flex: 1; padding-right: 160px;">
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                    ${userData.name}
                    <span style="font-size: 12px; background: #444; padding: 2px 6px; border-radius: 4px; font-weight: normal;">${userData.gender === 'male' ? '♂️' : (userData.gender === 'female' ? '♀️' : '🔒')} ${userData.age !== undefined && userData.age !== null ? userData.age : '未知'}岁</span>
                </div>
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">📍 ${userData.country || '保密'} - ${userData.region || ''}</div>
                <div style="font-size: 13px; color: #ccc; line-height: 1.4; word-break: break-all;">${userData.intro || '这个人很懒，什么都没写...'}</div>
            </div>
            <div style="position: absolute; top: 0; right: 0; width: 140px; display: flex; flex-direction: column; gap: 8px;">${actionButtons}</div>
        </div>
        <div style="display: flex; gap: 20px; font-size: 13px; color: #bbb; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #333; flex-wrap: wrap;">
            ${balanceDisplayHtml}
            <div style="display:flex; flex-direction:column; gap:4px;">
                <div>👍 获赞: <strong style="color:#fff;">${userData.receivedLikes || 0}</strong></div>
                <div>⭐ 被收藏: <strong style="color:#fff;">${userData.receivedFavorites || 0}</strong></div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <div>👥 粉丝: <strong style="color:#fff;">${userData.followers ? userData.followers.length : 0}</strong></div>
                <div>🏃 关注的人: <strong style="color:#fff;">${followingCount}</strong></div>
            </div>
        </div>
    `;

    const getRankHtml = (amount) => {
        if (amount < 100) return "⭐"; 
        let suns = Math.floor(amount / 2500);
        let moons = Math.floor((amount % 2500) / 500);
        let stars = Math.floor((amount % 500) / 100);
        return "☀️".repeat(suns) + "🌙".repeat(moons) + "⭐".repeat(stars);
    };

    let tipItemsHtml = '<div style="color: #888; text-align: center; padding: 40px 0; font-size: 13px;">🎁 还没有人赞赏过哦，快来成为第一个支持 TA 的人吧！</div>';
    
    if (userData.tips_received && Object.keys(userData.tips_received).length > 0) {
        let tipList = Object.values(userData.tips_received).sort((a, b) => b.amount - a.amount);
        tipItemsHtml = tipList.map(t => {
            let name = t.is_anonymous ? "🕵️ 匿名支持者" : t.sender_name;
            return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,152,0,0.1); border-radius: 4px; margin-bottom: 6px;">
                        <span style="color: #FF9800; font-weight: bold; font-size: 13px;">${name}</span>
                        <span style="font-size: 14px;" title="总贡献: ${t.amount} 积分">${getRankHtml(t.amount)}</span>
                    </div>`;
        }).join('');
    }

    const tipsHtml = `
        <div style="margin-bottom: 15px; padding: 15px; background: #222; border-radius: 8px; border: 1px solid #444; height: 180px; display: flex; flex-direction: column;">
            <div style="font-size: 14px; font-weight: bold; color: #FF9800; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                🏆 赞赏贡献榜单
            </div>
            <div style="flex: 1; overflow-y: auto; padding-right: 5px;">
                ${tipItemsHtml}
            </div>
        </div>
    `;

    // ====================================================================
    // 【核心新增】：管理员专属系统公告发布 UI 面板 (仅自己且账号是管理员时可见)
    // ====================================================================
    let adminHtml = '';
    if (isMe && userData.account === '123456') {
        adminHtml = `
            <div id="admin-ann-panel" style="margin-bottom: 15px; background: #181b28; border: 1px solid #2d334a; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="font-weight: bold; font-size: 15px; color: #FF9800; display: flex; align-items: center; gap: 6px;">
                        📢 全站系统公告发布
                    </div>
                    <div style="font-size: 11px; color: #E91E63; background:rgba(233,30,99,0.1); padding: 2px 6px; border-radius: 4px;">内测最高特权</div>
                </div>
                <textarea id="admin-ann-content" placeholder="在此输入公告内容（例如 V1.2.0 内测更新公告），支持直接回车换行，内容将在所有用户的消息提醒中醒目展示，发布后无法撤回，请谨慎操作！" style="width: 100%; height: 120px; background: #232738; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; color: #eee; padding: 10px; font-size: 13px; line-height: 1.6; resize: none; margin-bottom: 12px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#FF9800'" onblur="this.style.borderColor='rgba(255,255,255,0.05)'"></textarea>
                <button id="btn-admin-ann-send" style="width: 100%; background: #E91E63; color: #fff; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; transition: background 0.2s, transform 0.1s;" onmouseover="this.style.background='#D81B60'; this.style.transform='scale(1.01)'" onmouseout="this.style.background='#E91E63'; this.style.transform='scale(1)'">
                    🚀 确认发布全站公告
                </button>
            </div>
        `;
    }

    let tabsHtml = `<div style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 5px;">`;
    tabs.forEach(tab => {
        const isActive = activeTab === tab.id;
        tabsHtml += `<button class="profile-tab-btn" data-id="${tab.id}" style="background: transparent; border: none; cursor: pointer; padding: 5px 10px; color: ${isActive ? '#4CAF50' : '#888'}; font-weight: ${isActive ? 'bold' : 'normal'}; border-bottom: ${isActive ? '2px solid #4CAF50' : 'none'};">${tab.label}</button>`;
    });
    tabsHtml += `</div><div id="profile-list-container" style="flex: 1; overflow-y: auto; padding-right: 5px;"></div>`;

    // 将 adminHtml 拼接在赞赏榜单之后，列表 Tab 之前
    return topBarHtml + headerHtml + tipsHtml + adminHtml + tabsHtml;
}