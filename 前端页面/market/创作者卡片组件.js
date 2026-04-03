// 前端页面/market/创作者卡片组件.js
// ==========================================
// 👤 创作者卡片组件
// ==========================================
// 作用：渲染创作者列表卡片和赞赏榜单
// 关联文件：
//   - 打赏等级工具.js (打赏等级计算与显示)
//   - 个人中心视图.js (点击头像跳转)
// ==========================================

import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { createCommentSection } from "../social/评论与互动组件.js";
import { renderTipLevelHTML } from "../components/打赏等级工具.js";
import { getBannerCacheKey, PLACEHOLDERS, getCachedProfile, getProfileWithSWR } from "../core/全局配置.js";
import { api } from "../core/网络请求_业务API.js";
import { getSettings } from "../components/全局设置组件.js";
import { t } from "../components/用户体验增强.js";

function loadECharts() {
    return new Promise((resolve, reject) => {
        if (window.echarts) { resolve(window.echarts); return; }
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js";
        script.onload = () => resolve(window.echarts);
        script.onerror = () => reject(new Error("ECharts load failed"));
        document.head.appendChild(script);
    });
}

/**
 * 🎁 通用赞赏贡献榜单渲染函数（带星星/月亮/太阳等级）
 * @param {Array} tipBoard - 榜单数据 [{account, amount, is_anon}, ...]
 * @param {string} title - 榜单标题
 * @param {Function} onUserClick - 点击用户名时的回调
 */
export function createTipBoardSection(tipBoard = [], title = "🎁 赞赏贡献榜", onUserClick = null) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        background: "#1a1d2e", border: "1px solid #2d334a", borderRadius: "6px",
        padding: "10px", marginTop: "10px"
    });

    if (!tipBoard || tipBoard.length === 0) {
        container.innerHTML = `
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #FF9800;">${title}</div>
            <div style="color: #666; font-size: 12px; text-align: center; padding: 15px 0;">${t('creator.no_tips')}</div>
        `;
        return container;
    }

    // 榜单前10名
    const top10 = tipBoard.slice(0, 10);
    const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"]; // 金银铜

    // 🚀 使用统一的打赏等级工具渲染星星/月亮/太阳
    let listHtml = top10.map((entry, idx) => {
        const rankColor = rankColors[idx] || "#888";
        const rankIcon = idx < 3 ? ["🥇", "🥈", "🥉"][idx] : `<span style="color:${rankColor}">#${idx + 1}</span>`;
        
        // 使用统一等级工具获取等级图标
        const levelHtml = renderTipLevelHTML(entry.amount, true);
        
        // 匿名用户处理
        if (entry.is_anon) {
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: ${idx % 2 === 0 ? '#222' : '#1e1e1e'}; border-radius: 4px; margin-bottom: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px; min-width: 24px;">${rankIcon}</span>
                        <span style="color: #888; font-style: italic; font-size: 13px;">${t('creator.anonymous')}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${levelHtml}
                        <span style="color: #4CAF50; font-weight: bold; font-size: 11px;">${entry.amount}</span>
                    </div>
                </div>
            `;
        }
        
        // 🚀 SWR 模式：非匿名用户显示头像+用户名
        const containerId = `creator-tip-board-item-${entry.account}-${idx}-${Date.now()}`;
        
        // 从缓存获取初始数据（0延迟渲染）
        const cached = getCachedProfile(entry.account);
        const avatarUrl = cached?.avatar || cached?.avatarDataUrl || PLACEHOLDERS.AVATAR_SMALL;
        const userName = cached?.name || entry.account;
        
        // 后台静默校对并更新 DOM
        setTimeout(() => {
            getProfileWithSWR(entry.account, api.getUserProfile, (profile) => {
                const itemContainer = document.getElementById(containerId);
                if (!itemContainer) return;
                
                const avatarImg = itemContainer.querySelector('.tip-board-avatar');
                const nameSpan = itemContainer.querySelector('.tip-board-name');
                
                if (avatarImg && profile.avatar) {
                    avatarImg.src = profile.avatar;
                }
                if (nameSpan && profile.name) {
                    nameSpan.textContent = profile.name;
                }
            });
        }, 0);
        
        return `
            <div id="${containerId}" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: ${idx % 2 === 0 ? '#222' : '#1e1e1e'}; border-radius: 4px; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 14px; min-width: 24px;">${rankIcon}</span>
                    <span class="tip-board-user" data-account="${entry.account}" data-anon="false" style="display: flex; align-items: center; gap: 6px; color: #4CAF50; cursor: pointer; font-size: 13px;">
                        <img class="tip-board-avatar" src="${avatarUrl}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #333;">
                        <span class="tip-board-name">${userName}</span>
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${levelHtml}
                    <span style="color: #4CAF50; font-weight: bold; font-size: 11px;">${entry.amount}</span>
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #FF9800; display: flex; align-items: center; gap: 6px;">
            ${title}
            <span style="font-size: 10px; color: #888; font-weight: normal;">(${t('creator.tip_board.count', {count: tipBoard.length})})</span>
        </div>
        <div style="max-height: 200px; overflow-y: auto;">${listHtml}</div>
    `;

    // 绑定点击事件
    if (onUserClick) {
        container.querySelectorAll(".tip-board-user").forEach(el => {
            if (el.dataset.anon === "false") {
                el.onclick = (e) => {
                    e.stopPropagation();
                    onUserClick(el.dataset.account);
                };
            }
        });
    }

    return container;
}

export function createCreatorCard(creatorData, currentUser = null) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        backgroundColor: "var(--comfy-input-bg, #2b2b2b)", borderRadius: "8px", 
        marginBottom: "12px", border: "1px solid #444", color: "#fff", fontFamily: "sans-serif",
        overflow: "hidden"  // 🖼️ 背景图需要隐藏溢出
    });

    const chartContainerId = `creator-chart-${Math.random().toString(36).substr(2, 9)}`;
    const summaryView = document.createElement("div");
    summaryView.style.cursor = "pointer";

    const avatarSrc = creatorData.avatar || PLACEHOLDERS.AVATAR;
    
    // ⚙️ 读取设置：是否显示创作者背景图
    const settings = getSettings();
    const showBanner = settings.showCreatorBanner;
    
    // 🖼️ 个人资料卡背景图：优先使用本地缓存（与个人资料界面共用同一份缓存）
    const cacheKey = getBannerCacheKey(creatorData.account);
    const cachedBanner = localStorage.getItem(cacheKey);
    const bannerUrl = cachedBanner || creatorData.bannerUrl;  // 优先用本地缓存
    const hasBanner = showBanner && bannerUrl && bannerUrl.trim() !== '';  // ⚙️ 受设置控制
    
    // 🖼️ 全覆盖背景图样式
    const cardBgStyle = hasBanner 
        ? `background-image: url(${bannerUrl}); background-size: cover; background-position: center;`
        : '';
    
    summaryView.innerHTML = `
        <div style="${cardBgStyle} position: relative; padding: 10px; border-radius: 8px;">
            ${hasBanner ? '<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.2); border-radius: 8px;"></div>' : ''}
            <div style="position: relative; z-index: 1;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px; padding: 5px 0;">
                    <img class="creator-avatar-link" src="${avatarSrc}" title="${t('creator.visit_profile')}" style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid ${hasBanner ? 'rgba(255,255,255,0.8)' : '#555'}; object-fit: cover; cursor: pointer; transition: 0.2s; ${hasBanner ? 'box-shadow: 0 2px 8px rgba(0,0,0,0.3);' : ''}" onmouseover="this.style.borderColor='#4CAF50'" onmouseout="this.style.borderColor='${hasBanner ? 'rgba(255,255,255,0.8)' : '#555'}'">
                    <div class="creator-name-link" title="${t('creator.visit_profile')}" style="font-weight: bold; font-size: 16px; cursor: pointer; transition: 0.2s; color: #FFD700; text-shadow: 0 1px 4px rgba(0,0,0,0.8), 0 0 8px rgba(255,215,0,0.3);" onmouseover="this.style.color='#FFA500'" onmouseout="this.style.color='#FFD700'">${creatorData.name}</div>
                    <div style="font-size: 12px; color: #FF6B6B; margin-left: auto; text-shadow: 0 1px 3px rgba(0,0,0,0.6);">${t('creator.usage_count', {count: creatorData.downloads || 0})}</div>
                </div>
                <div style="font-size: 12px; color: ${hasBanner ? '#ccc' : '#aaa'}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 10px;">${creatorData.shortDesc && creatorData.shortDesc !== "null" ? creatorData.shortDesc : t('profile.no_intro') || "这个人很懒，什么都没写..."}</div>
                <div style="background: rgba(34,34,34,${hasBanner ? '0.8' : '1'}); border-radius: 6px; padding: 8px 10px; border: 1px dashed #555;">
                    <div style="display: flex; gap: 15px; font-size: 12px; color: #eee; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #FF5722;">👍 ${t('creator.stats.likes')}: <strong>${creatorData.likes}</strong></span>
                        <span style="color: #FFC107;">⭐ ${t('creator.stats.favorites')}: <strong>${creatorData.favorites}</strong></span>
                        <span style="color: #4CAF50;">👥 ${t('creator.stats.followers')}: <strong>${creatorData.followers}</strong></span>
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 12px; color: #ccc; justify-content: center; border-top: 1px solid #333; padding-top: 8px;">
                        <span style="color: #2196F3;">🛠️ ${t('creator.output.tools')}: <strong>${creatorData.toolsCount}</strong> ${t('creator.output.unit')}</span>
                        <span style="color: #9C27B0;">📦 ${t('creator.output.apps')}: <strong>${creatorData.appsCount}</strong> ${t('creator.output.unit')}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const jumpToProfile = (e) => { 
        e.stopPropagation(); 
        openOtherUserProfileModal(creatorData.account, currentUser); 
    };
    summaryView.querySelector('.creator-avatar-link').onclick = jumpToProfile;
    summaryView.querySelector('.creator-name-link').onclick = jumpToProfile;

    const detailView = document.createElement("div");
    Object.assign(detailView.style, { display: "none", marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #555" });

    detailView.innerHTML = `
        <div style="background: #1e1e1e; padding: 8px; border-radius: 4px; font-size: 12px; color: #ccc; margin-bottom: 15px; line-height: 1.5;">${creatorData.fullDesc && creatorData.fullDesc !== "null" ? creatorData.fullDesc : t('profile.no_intro') || "这个人很懒，什么都没写..."}</div>
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #aaa;">${t('creator.chart.download_trend')}</div>
        <div id="${chartContainerId}" style="width: 100%; height: 180px; background: #222; border-radius: 4px; margin-bottom: 15px;"></div>
        <div id="tipboard-${chartContainerId}"></div>
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; margin-top: 15px; color: #aaa;">${t('creator.message_board')}</div>
        <div id="board-${chartContainerId}" style="height: 250px; border: 1px solid #444; border-radius: 4px; overflow: hidden;"></div>
    `;

    // 🎁 添加赞赏贡献总榜
    const tipBoardContainer = detailView.querySelector(`#tipboard-${chartContainerId}`);
    const tipBoardUI = createTipBoardSection(
        creatorData.tip_board, 
        t('creator.tip_board.title'),
        (account) => openOtherUserProfileModal(account, currentUser)
    );
    tipBoardContainer.appendChild(tipBoardUI);

    const boardContainer = detailView.querySelector(`#board-${chartContainerId}`);
    // 🚀 P0安全修复：传递创作者账号作为 contentAuthor，使创作者可以删除其主页下的评论
    const commentUI = createCommentSection(creatorData.account, creatorData.commentsData || [], currentUser, null, creatorData.account);
    boardContainer.appendChild(commentUI);

    let isChartRendered = false; let chartInstance = null;

    function renderTrendChart() {
        if (isChartRendered) return;
        const chartDom = detailView.querySelector(`#${chartContainerId}`);
        if (!chartDom) return;
        chartDom.innerHTML = `<div style="text-align:center; line-height:180px; color:#888;">${t('creator.chart.loading')}</div>`;
        loadECharts().then(echarts => {
            chartDom.innerHTML = ""; 
            chartInstance = echarts.init(chartDom, 'dark', { backgroundColor: 'transparent' });
            
            const trendData = creatorData.trendData || { months: [], tools: [], apps: [], recommends: [] };

            chartInstance.setOption({
                tooltip: { trigger: 'axis', textStyle: { fontSize: 11 } },
                grid: { top: 10, bottom: 20, left: 35, right: 10 },
                xAxis: { type: 'category', data: trendData.months, axisLabel: { color: '#888', fontSize: 10 }, axisLine: { lineStyle: { color: '#444' } } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: '#333', type: 'dashed' } }, axisLabel: { color: '#888', fontSize: 10 }, minInterval: 1 },
                series: [
                    { name: t('creator.chart.series.tools'), type: 'line', data: trendData.tools, smooth: true, itemStyle: { color: '#4CAF50' }, lineStyle: { width: 2, type: 'dashed' } },
                    { name: t('creator.chart.series.apps'), type: 'line', data: trendData.apps, smooth: true, itemStyle: { color: '#2196F3' }, lineStyle: { width: 2, type: 'dashed' } },
                    // 【核心修改】：添加第 3 根趋势折线 —— 推荐资源的点击与获取量
                    { name: t('creator.chart.series.recommends'), type: 'line', data: trendData.recommends, smooth: true, itemStyle: { color: '#FF9800' }, lineStyle: { width: 2, type: 'dashed' } }
                ]
            });
            isChartRendered = true;
        }).catch(err => { chartDom.innerHTML = `<div style="text-align:center; line-height:180px; color:#F44336;">${t('creator.chart.load_failed')}</div>`; });
    }

    summaryView.onclick = () => {
        const isHidden = detailView.style.display === "none";
        detailView.style.display = isHidden ? "block" : "none";
        if (isHidden) renderTrendChart();
    };

    window.addEventListener('resize', () => { if (chartInstance) chartInstance.resize(); });
    card.appendChild(summaryView); card.appendChild(detailView);
    return card;
}