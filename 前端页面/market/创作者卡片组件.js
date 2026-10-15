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
import { renderTipLevelHTML, getTipLevelRuleShort } from "../components/打赏等级工具.js";
import { getBannerCacheKey, PLACEHOLDERS, getCachedProfile, getProfileWithSWR, escapeHtml, CACHE, API, getSettings, normalizeProfileImageUrl } from "../core/全局配置.js";
import { api } from "../core/网络请求_业务API.js";
import { captureRequestSession, requestCancelManager } from "../core/网络请求_基础设施.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
import { t } from "../components/用户体验增强.js";
import { loadECharts } from "../components/图表脚本加载.js";
import { showToast } from "../components/UI交互提示组件.js";
import { openTipModal } from "../profile/个人中心_赞赏组件.js";

// 当前展开卡片由原生展开按钮与鼠标摘要入口共同管理。
let currentExpandedCard = null;

// 身份事件共用底层订阅；每张卡片仍独立捕获会话并决定是否撤销。
const creatorSessionSubscribers = new Set();
let stopCreatorSessionSubscription = null;
let creatorSessionDispatchDepth = 0;
function releaseCreatorSessionSubscription() {
    if (creatorSessionSubscribers.size || creatorSessionDispatchDepth) return;
    const stop = stopCreatorSessionSubscription;
    stopCreatorSessionSubscription = null;
    stop?.();
}
function subscribeCreatorSessionChanges(notify) {
    const entry = { notify };
    creatorSessionSubscribers.add(entry);
    if (!stopCreatorSessionSubscription) {
        try {
            stopCreatorSessionSubscription = subscribeTaskSessionChanges(force => {
                creatorSessionDispatchDepth++;
                try {
                    // 本轮新建的卡片不接收旧事件，已清理的卡片不再被通知。
                    for (const current of [...creatorSessionSubscribers]) {
                        if (!creatorSessionSubscribers.has(current)) continue;
                        try { current.notify(force); }
                        catch (_) { console.warn('创作者会话通知失败，继续通知其它卡片。'); }
                    }
                } finally {
                    creatorSessionDispatchDepth--;
                    releaseCreatorSessionSubscription();
                }
            }, { target: window, eventBus, events: EVENTS,
                userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN });
        } catch (error) {
            creatorSessionSubscribers.delete(entry);
            throw error;
        }
    }
    return () => {
        creatorSessionSubscribers.delete(entry);
        releaseCreatorSessionSubscription();
    };
}

// 所有卡片共用一个移除观察器；不为未展开的卡片逐个扫描整页。
const mountedCreatorCards = new Map();
let creatorRemovalObserver = null;
function trackCreatorRemoval(card, dispose) {
    mountedCreatorCards.set(card, dispose);
    if (!creatorRemovalObserver) {
        creatorRemovalObserver = new MutationObserver(() => {
            for (const [node, cleanup] of mountedCreatorCards) {
                if (!node.isConnected) cleanup();
            }
        });
        creatorRemovalObserver.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
        mountedCreatorCards.delete(card);
        if (!mountedCreatorCards.size) {
            creatorRemovalObserver?.disconnect(); creatorRemovalObserver = null;
        }
    };
}

/**
 * 处理打赏创作者按钮点击
 * @param {object} creatorData - 创作者数据
 * @param {object} currentUser - 当前登录用户
 * @param {Function} onTipSuccess - 打赏成功回调
 */
async function handleTipCreator(creatorData, currentUser, onTipSuccess, parentCurrent) {
    if (parentCurrent && !parentCurrent()) return;
    // 检查用户是否登录
    if (!currentUser) {
        showToast(t('creator.tip_login_required'), "warning");
        return;
    }

    // 不能给自己打赏
    if (currentUser.account === creatorData.account) {
        showToast(t('creator.cannot_tip_self'), "warning");
        return;
    }

    // 打开打赏弹窗
    await openTipModal(currentUser, {
        account: creatorData.account,
        name: creatorData.name
    }, (newBalance) => {
        // 执行原有成功回调
        if (onTipSuccess) onTipSuccess();
    }, null, { isCurrent: parentCurrent });
}



/**
 * 渲染打赏榜单条目HTML（匿名/非匿名共用外层结构）
 */
function _renderTipBoardEntry(entry, idx, rankIcon, levelHtml, userHtml, containerId = '') {
    const idAttr = containerId ? ` id="${escapeHtml(containerId)}"` : '';
    return `<div${idAttr} class="creator-tip-entry">` +
        `<div class="creator-tip-entry__identity"><span class="creator-tip-entry__rank" aria-hidden="true">${rankIcon}</span>${userHtml}</div>` +
        `<div class="creator-tip-entry__value">${levelHtml}<span class="creator-tip-entry__amount">${escapeHtml(entry.amount)}</span></div></div>`;
}

/**
 * 🎁 通用赞赏贡献榜单渲染函数（带星星/月亮/太阳等级）
 * @param {Array} tipBoard - 榜单数据 [{account, amount, is_anon}, ...]
 * @param {string} title - 榜单标题
 * @param {Function} onUserClick - 点击用户名时的回调
 * @param {object} creatorData - 创作者数据（用于打赏）
 * @param {object} currentUser - 当前登录用户
 * @param {Function} onTipSuccess - 打赏成功回调
 */
export function createTipBoardSection(tipBoard = [], title = t('creator.tip_board.title'), onUserClick = null, creatorData = null, currentUser = null, onTipSuccess = null, parentCurrent = null) {
    const container = document.createElement("div");
    const current = () => container.isConnected && (!parentCurrent || parentCurrent());
    container.className = 'creator-tip-board';

    // 等级规则说明
    const levelRuleHtml = `
        <div class="creator-tip-board__rule">
            📊 ${t('creator.tip_level_rule')}：${getTipLevelRuleShort()}
        </div>
    `;

    if (!tipBoard || tipBoard.length === 0) {
        container.innerHTML = `
            <div class="creator-tip-board__header">
                <div class="creator-tip-board__title">
                    ${escapeHtml(title)}
                    <span class="creator-tip-board__count">(${t('creator.tip_board.count', {count: 0})})</span>
                </div>
                ${creatorData ? `<button id="btn-tip-creator-empty" type="button" class="creator-tip-btn">${t('creator.tip_this_creator')}</button>` : ''}
            </div>
            ${levelRuleHtml}
            <div class="creator-tip-board__empty">${t('creator.no_tips')}</div>
        `;

        // 绑定打赏按钮事件（空榜单时）
        if (creatorData) {
            const tipBtn = container.querySelector('#btn-tip-creator-empty');
            if (tipBtn) {
                tipBtn.onclick = async () => await handleTipCreator(creatorData, currentUser, onTipSuccess, current);
            }
        }

        return container;
    }

    // 榜单前10名
    const top10 = tipBoard.slice(0, 10);

    // 🚀 使用统一的打赏等级工具渲染星星/月亮/太阳
    let listHtml = top10.map((entry, idx) => {
        const rankIcon = idx < 3 ? ["🥇", "🥈", "🥉"][idx] : `#${idx + 1}`;

        // 使用统一等级工具获取等级图标
        const levelHtml = renderTipLevelHTML(entry.amount, true);

        if (entry.is_anon) {
            const userHtml = `<span class="creator-tip-entry__anonymous">${t('creator.anonymous')}</span>`;
            return _renderTipBoardEntry(entry, idx, rankIcon, levelHtml, userHtml);
        }

        // 🚀 SWR 模式：非匿名用户显示头像+用户名
        const containerId = `creator-tip-board-item-${entry.account}-${idx}-${Date.now()}`;

        // 从缓存获取初始数据（0延迟渲染）
        const cached = getCachedProfile(entry.account);
        const avatarUrl = normalizeProfileImageUrl(cached?.avatar) || normalizeProfileImageUrl(cached?.avatarDataUrl) || PLACEHOLDERS.AVATAR_SMALL;
        const userName = cached?.name || entry.account;

        // 后台静默校对并更新 DOM
        setTimeout(() => {
            if (!current()) return;
            getProfileWithSWR(entry.account, api.getUserProfile, (profile) => {
                const itemContainer = document.getElementById(containerId);
                if (!current() || !itemContainer || !profile || typeof profile !== 'object' || Array.isArray(profile) || (profile.account != null && profile.account !== entry.account)) return;

                const avatarImg = itemContainer.querySelector('.tip-board-avatar');
                const nameSpan = itemContainer.querySelector('.tip-board-name');

                const avatarSource = normalizeProfileImageUrl(profile.avatar);
                if (avatarImg && avatarSource) {
                    avatarImg.src = avatarSource;
                }
                if (nameSpan && typeof profile.name === 'string' && profile.name) {
                    nameSpan.textContent = profile.name;
                    const userControl = itemContainer.querySelector('.tip-board-user');
                    if (userControl) userControl.setAttribute('aria-label', `${t('creator.visit_profile')}: ${profile.name}`);
                }
            });
        }, 0);

        // 🔒 XSS防护：昵称/头像均来自用户可修改的资料，写入 HTML 前必须转义
        // （下方 SWR 刷新路径用的是 .src / .textContent，本身就是安全的）
        const userTag = onUserClick ? 'button' : 'span';
        const userHtml = `<${userTag} ${onUserClick ? 'type="button"' : ''} class="tip-board-user" data-account="${escapeHtml(entry.account)}" data-anon="false" aria-label="${escapeHtml(`${t('creator.visit_profile')}: ${userName}`)}"><img class="tip-board-avatar" src="${escapeHtml(avatarUrl)}" alt=""><span class="tip-board-name">${escapeHtml(userName)}</span></${userTag}>`;
        return _renderTipBoardEntry(entry, idx, rankIcon, levelHtml, userHtml, containerId);
    }).join("");

    container.innerHTML = `
        <div class="creator-tip-board__header">
            <div class="creator-tip-board__title">
                ${escapeHtml(title)}
                <span class="creator-tip-board__count">(${t('creator.tip_board.count', {count: tipBoard.length})})</span>
            </div>
            ${creatorData ? `<button id="btn-tip-creator" type="button" class="creator-tip-btn">${t('creator.tip_this_creator')}</button>` : ''}
        </div>
        ${levelRuleHtml}
        <div class="creator-tip-board__list">${listHtml}</div>
    `;

    // 绑定打赏按钮事件
    if (creatorData) {
        const tipBtn = container.querySelector('#btn-tip-creator');
        if (tipBtn) {
            tipBtn.onclick = async () => await handleTipCreator(creatorData, currentUser, onTipSuccess, current);
        }
    }

    // 绑定点击事件
    if (onUserClick) {
        container.querySelectorAll(".tip-board-user").forEach(el => {
            if (el.dataset.anon === "false") {
                el.onclick = (e) => {
                    e.stopPropagation();
                    if (current()) onUserClick(el.dataset.account);
                };
            }
        });
    }

    return container;
}

export function createCreatorCard(creatorData, currentUser = null) {
    const card = document.createElement("div");
    card.setAttribute("data-item-id", creatorData.account);
    card.className = 'creator-card';
    const chartContainerId = `creator-chart-${Math.random().toString(36).substr(2, 9)}`;
    const summaryView = document.createElement("div");
    summaryView.className = 'creator-card__summary';

    const avatarSrc = normalizeProfileImageUrl(creatorData.avatar) || PLACEHOLDERS.AVATAR;

    // ⚙️ 读取设置：是否显示创作者背景图
    const settings = getSettings();
    const showBanner = settings.showCreatorBanner;

    // 🖼️ 个人资料卡背景图：优先使用本地缓存（与个人资料界面共用同一份缓存）
    const cacheKey = getBannerCacheKey(creatorData.account);
    let cachedBanner = null;
    try { cachedBanner = localStorage.getItem(cacheKey); } catch (_) { /* 可选装饰缓存不可用时继续构建卡片。 */ }
    const validBanner = normalizeProfileImageUrl;
    const bannerUrl = validBanner(cachedBanner) || validBanner(creatorData.bannerUrl);
    const hasBanner = !!(showBanner && bannerUrl);  // 有效本地缓存优先，受显示设置控制

    summaryView.classList.toggle('creator-card__summary--banner', !!hasBanner);
    if (hasBanner) summaryView.style.backgroundImage = `url(${JSON.stringify(bannerUrl)})`;
    const profileName = typeof creatorData.name === 'string' && creatorData.name.trim() ? creatorData.name : creatorData.account;
    const profileLabel = `${t('creator.visit_profile')}: ${profileName}`;
    const stat = (field, label, value, unit = '') => `<div class="creator-card__stat" data-stat="${field}"><span>${escapeHtml(label)}</span><strong class="creator-card__stat-value"><span class="${/^\d+$/.test(String(value)) ? 'creator-card__number' : ''}">${escapeHtml(value)}</span>${unit ? ` <small>${escapeHtml(unit)}</small>` : ''}</strong></div>`;
    summaryView.innerHTML = `
        <div class="creator-card__identity">
            <button type="button" class="creator-avatar-link" aria-label="${escapeHtml(profileLabel)}"><img src="${escapeHtml(avatarSrc)}" alt=""></button>
            <button type="button" class="creator-name-link" aria-label="${escapeHtml(profileLabel)}">${escapeHtml(creatorData.name)}</button>
        </div>
        <div class="creator-card__usage" data-stat="downloads">${escapeHtml(t('creator.usage_count', {count: creatorData.downloads || 0}))}</div>
        <p class="creator-card__intro">${escapeHtml(creatorData.shortDesc && creatorData.shortDesc !== "null" ? creatorData.shortDesc : t('profile.no_intro'))}</p>
        <div class="creator-card__statistics">
            <div class="creator-card__stats">${stat('likes',t('creator.stats.likes'),creatorData.likes)}${stat('favorites',t('creator.stats.favorites'),creatorData.favorites)}${stat('followers',t('creator.stats.followers'),creatorData.followers)}</div>
            <div class="creator-card__outputs">${stat('toolsCount',t('creator.output.tools'),creatorData.toolsCount,t('creator.output.unit'))}${stat('skillsCount',t('creator.output.skills'),creatorData.skillsCount || 0,t('creator.output.unit'))}${stat('appsCount',t('creator.output.apps'),creatorData.appsCount,t('creator.output.unit'))}</div>
        </div>
    `;
    summaryView.tabIndex = 0;
    summaryView.setAttribute('role', 'button');
    summaryView.setAttribute('aria-expanded', 'false');
    summaryView.setAttribute('aria-controls', `detail-${chartContainerId}`);
    summaryView.setAttribute('aria-label', `${profileName}: ${t('creator.expand_details')}`);

    const jumpToProfile = (e) => {
        e.stopPropagation();
        if (scope.isCurrent() && card.isConnected) openOtherUserProfileModal(creatorData.account, currentUser);
    };
    summaryView.querySelector('.creator-avatar-link').onclick = jumpToProfile;
    summaryView.querySelector('.creator-name-link').onclick = jumpToProfile;

    const detailView = document.createElement("div");
    detailView.className = "creator-card__detail";
    detailView.id = `detail-${chartContainerId}`;
    detailView.hidden = true;
    detailView.style.display = "none";

    // 首次展开才挂载详情骨架；折叠保留节点和原评论实例。
    let detailMounted = false;
    function mountDetails() {
        if (detailMounted) return;
        detailView.innerHTML = `
            <div id="detail-content-${chartContainerId}" style="display: none;">
                <div class="creator-card__section-label">${t('creator.chart.download_trend')}</div>
                <div id="${chartContainerId}" class="creator-card__chart"></div>
                <div id="tipboard-${chartContainerId}"></div>
                <div class="creator-card__section-label creator-card__section-label--comments">${t('creator.message_board')}</div>
                <div id="board-${chartContainerId}" class="creator-card__comments"></div>
            </div>
            <div id="detail-loading-${chartContainerId}" class="creator-card__status" role="status">
                <div class="creator-card__status-copy">⏳ ${t('creator.loading_details')}</div>
            </div>
            <div id="detail-error-${chartContainerId}" class="creator-card__status creator-card__status--error" role="alert" style="display: none;">
                <div class="creator-card__status-copy">❌ ${t('creator.load_failed')}</div>
                <button id="btn-retry-${chartContainerId}" type="button" class="creator-card__retry">${t('creator.retry')}</button>
            </div>
        `;
        detailMounted = true;
    }

    // 状态标记
    let commentUI = null;
    let isDetailLoaded = false;
    let isChartRendered = false;
    let chartInstance = null;
    let generation = 0, detailPending = false, chartPending = false, detailRead = null;
    let widthObserver = null, widthTimer = null, resizeTimer = null;
    let stopTrackingRemoval = null, resizeSubscribed = false;
    let constructing = true;
    const matches = captureRequestSession();
    const account = currentUser?.account || null;
    const sessionMatches = () => matches() && (getUser()?.account || null) === account;
    const componentId = chartContainerId;
    const scope = createTaskViewScope({
        sessionMatches, connected: () => constructing || card.isConnected,
        subscribe: subscribeCreatorSessionChanges,
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => {
            detailView.replaceChildren();
            const notice = document.createElement('div');
            notice.setAttribute('role', 'status'); notice.textContent = t('auth.session_changed');
            detailView.append(notice); detailView.hidden = false; detailView.style.display = 'block';
            summaryView.setAttribute('aria-disabled', 'true'); summaryView.tabIndex = -1; summaryView.setAttribute('aria-expanded', 'true');
        }
    });
    const current = token => scope.isCurrent() && card.isConnected && detailView.style.display !== 'none' && token === generation;
    const clearChartWork = () => {
        widthObserver?.disconnect(); widthObserver = null;
        clearTimeout(widthTimer); clearTimeout(resizeTimer); widthTimer = resizeTimer = null;
        chartPending = false;
    };
    const pauseDetails = () => {
        generation++; detailPending = false;
        requestCancelManager.cancelAll(componentId);
        clearChartWork(); commentUI?._setActive?.(false);
    };

    // 🔄 加载详情数据
    async function loadCreatorDetails() {
        const token = generation;
        if (!current(token) || detailPending) return;
        const loadingEl = detailView.querySelector(`#detail-loading-${chartContainerId}`);
        const contentEl = detailView.querySelector(`#detail-content-${chartContainerId}`);
        const errorEl = detailView.querySelector(`#detail-error-${chartContainerId}`);

        // 如果已经加载过，直接显示
        if (isDetailLoaded && creatorData._detailData) {
            loadingEl.style.display = 'none';
            errorEl.style.display = 'none';
            contentEl.style.display = 'block';
            renderDetailContent(creatorData._detailData);
            return;
        }

        loadingEl.style.display = 'block';
        contentEl.style.display = 'none';
        errorEl.style.display = 'none';

        detailPending = true;
        let ownedRead = null;
        try {
            // 等待已取消的旧读取完成退出，避免网络层去重复用旧Promise。
            if (detailRead) { try { await detailRead; } catch (_) {} }
            if (!current(token)) return;
            ownedRead = api.getCreatorDetails(creatorData.account, { componentId });
            detailRead = ownedRead;
            const response = await ownedRead;
            if (!current(token)) return;
            if (response?.status === "success" && response.data && typeof response.data === 'object' && !Array.isArray(response.data)
                && response.data.account === creatorData.account
                && Array.isArray(response.data.commentsData) && Array.isArray(response.data.tip_board)
                && response.data.trendData && typeof response.data.trendData === 'object' && !Array.isArray(response.data.trendData)) {
                // 缓存详情数据到 creatorData 对象
                creatorData._detailData = response.data;
                creatorData.trendData = response.data.trendData;
                creatorData.commentsData = response.data.commentsData;
                creatorData.tip_board = response.data.tip_board;
                isDetailLoaded = true;

                loadingEl.style.display = 'none';
                contentEl.style.display = 'block';
                renderDetailContent(response.data);
            } else {
                throw new Error('Invalid creator details');
            }
        } catch (err) {
            if (!current(token)) return;
            loadingEl.style.display = 'none';
            errorEl.style.display = 'block';

            // 绑定重试按钮
            const retryBtn = errorEl.querySelector(`#btn-retry-${chartContainerId}`);
            if (retryBtn) {
                retryBtn.onclick = () => loadCreatorDetails();
            }
        } finally {
            if (ownedRead && detailRead === ownedRead) detailRead = null;
            if (current(token)) detailPending = false;
        }
    }

    // 🎨 渲染详情内容（图表、赞赏榜、留言板）
    function renderDetailContent(detailData) {
        const contentEl = detailView.querySelector(`#detail-content-${chartContainerId}`);

        // 🎁 添加赞赏贡献总榜
        const tipBoardContainer = contentEl.querySelector(`#tipboard-${chartContainerId}`);
        tipBoardContainer.innerHTML = ''; // 清空之前的内容

        // 打赏成功后的回调函数 - 刷新创作者数据
        const tipGeneration = generation;
        const onTipSuccess = () => {
            if (!current(tipGeneration)) return;
            // 触发重新加载创作者数据
            if (window.refreshCreatorData) {
                window.refreshCreatorData(creatorData.account);
            }
            // 清除缓存，下次展开重新加载
            creatorData._detailData = null;
            isDetailLoaded = false;
        };

        const tipBoardUI = createTipBoardSection(
            detailData.tip_board,
            t('creator.tip_board.title'),
            (account) => { if (current(tipGeneration)) openOtherUserProfileModal(account, currentUser); },
            creatorData,
            currentUser,
            onTipSuccess,
            () => current(tipGeneration)
        );
        tipBoardContainer.appendChild(tipBoardUI);

        // 💬 添加留言板
        const boardContainer = contentEl.querySelector(`#board-${chartContainerId}`);
        if (!commentUI) {
            boardContainer.innerHTML = '';
            commentUI = createCommentSection(creatorData.account, detailData.commentsData || [], currentUser, null, creatorData.account);
            boardContainer.appendChild(commentUI);
        }
        commentUI._setActive?.(detailView.style.display !== "none");

        // 📊 渲染趋势图表
        renderTrendChart(detailData.trendData);
    }

    // 📊 渲染趋势图表
    function _initTrendChart(chartDom, trendData, token) {
        if (!current(token)) return;
        loadECharts().then(echarts => {
            if (!current(token) || !chartDom.isConnected) return;
            chartDom.innerHTML = "";
            const theme = getComputedStyle(card);
            const textColor = theme.getPropertyValue('--rk-text').trim() || theme.color;
            const borderColor = theme.getPropertyValue('--rk-border').trim() || theme.borderColor;
            chartInstance = echarts.init(chartDom, null, { backgroundColor: 'transparent' });

            const data = trendData || { months: [], tools: [], skills: [], apps: [], recommends: [] };

            chartInstance.setOption({
                tooltip: { trigger: 'axis', textStyle: { fontSize: 11 } },
                grid: { top: 10, bottom: 20, left: 35, right: 10, containLabel: true },
                xAxis: { type: 'category', data: data.months, axisLabel: { color: textColor, fontSize: 10 }, axisLine: { lineStyle: { color: borderColor } } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: borderColor, type: 'dashed' } }, axisLabel: { color: textColor, fontSize: 10 }, minInterval: 1 },
                series: [
                    { name: t('creator.chart.series.tools'), type: 'line', data: data.tools, smooth: true, itemStyle: { color: '#4CAF50' }, lineStyle: { width: 2, type: 'dashed' } },
                    { name: t('creator.chart.series.skills'), type: 'line', data: data.skills || [], smooth: true, itemStyle: { color: '#7C4DFF' }, lineStyle: { width: 2, type: 'dashed' } },
                    { name: t('creator.chart.series.apps'), type: 'line', data: data.apps, smooth: true, itemStyle: { color: '#2196F3' }, lineStyle: { width: 2, type: 'dashed' } },
                    { name: t('creator.chart.series.recommends'), type: 'line', data: data.recommends, smooth: true, itemStyle: { color: '#FF9800' }, lineStyle: { width: 2, type: 'dashed' } }
                ]
            });
            isChartRendered = true;

            // 初始化完成后延迟调用resize确保正确渲染
            resizeTimer = setTimeout(() => {
                resizeTimer = null;
                if (current(token) && chartInstance) chartInstance.resize();
            }, 300);
        }).catch(() => {
            if (!current(token)) return;
            chartInstance?.dispose(); chartInstance = null; isChartRendered = false;
            chartDom.innerHTML = `<div class="creator-card__chart-status creator-card__chart-status--error" role="status">${t('creator.chart.load_failed')}</div>`;
        }).finally(() => { if (current(token)) chartPending = false; });
    }

    function renderTrendChart(trendData) {
        const token = generation;
        if (!current(token)) return;
        if (isChartRendered) { chartInstance?.resize(); return; }
        if (chartPending) return;
        chartPending = true;
        const chartDom = detailView.querySelector(`#${chartContainerId}`);
        if (!chartDom) { chartPending = false; return; }

        chartDom.innerHTML = `<div class="creator-card__chart-status" role="status">${t('creator.chart.loading')}</div>`;

        // 使用 ResizeObserver 等待容器获得有效宽度后再渲染
        if (chartDom.clientWidth === 0) {
            widthObserver = new ResizeObserver((entries) => {
                if (!current(token)) return;
                for (const entry of entries) {
                    if (entry.contentRect.width > 0) {
                        widthObserver?.disconnect(); widthObserver = null;
                        clearTimeout(widthTimer); widthTimer = null;
                        _initTrendChart(chartDom, trendData, token);
                        return;
                    }
                }
            });
            widthObserver.observe(chartDom);

            // 安全超时：5秒后如果仍未获得宽度，放弃并清理
            widthTimer = setTimeout(() => {
                if (!current(token)) return;
                widthObserver?.disconnect(); widthObserver = null; widthTimer = null; chartPending = false;
                if (chartDom.clientWidth === 0) {
                    chartDom.innerHTML = '';
                }
            }, 5000);
            return;
        }

        _initTrendChart(chartDom, trendData, token);
    }

    function setExpanded(expanded) {
        if (!scope.isCurrent()) return;
        if (expanded) {
            mountDetails();
            if (!resizeSubscribed) {
                window.addEventListener('resize', resizeHandler); resizeSubscribed = true;
            }
            if (currentExpandedCard && currentExpandedCard !== card) currentExpandedCard._closeDetails?.();
            detailView.hidden = false; detailView.style.display = "block";
            currentExpandedCard = card;
        } else {
            pauseDetails(); detailView.hidden = true; detailView.style.display = "none";
            if (currentExpandedCard === card) currentExpandedCard = null;
        }
        summaryView.setAttribute('aria-expanded', String(expanded));
        summaryView.setAttribute('aria-label', `${profileName}: ${t(expanded ? 'creator.collapse_details' : 'creator.expand_details')}`);
        if (expanded) loadCreatorDetails();
    }
    const toggleDetails = () => setExpanded(detailView.hidden);
    summaryView.onclick = event => {
        if (event.target.closest('button')) return;
        toggleDetails();
    };
    card._closeDetails = () => setExpanded(false);
    const keyHandler = event => {
        if (event.target === summaryView && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault(); event.stopPropagation(); toggleDetails(); return;
        }
        if (event.key !== 'Escape' || detailView.hidden || !card.contains(document.activeElement)) return;
        event.preventDefault(); event.stopPropagation();
        setExpanded(false); summaryView.focus();
    };
    card.addEventListener('keydown', keyHandler);

    const resizeHandler = () => { if (current(generation) && chartInstance) chartInstance.resize(); };

    card._pauseComments = () => commentUI?._setActive?.(false);
    card._pauseDetails = pauseDetails;
    scope.addCleanup(() => {
        pauseDetails(); stopTrackingRemoval?.(); stopTrackingRemoval = null;
        summaryView.onclick = null; card.removeEventListener('keydown', keyHandler);
        summaryView.setAttribute('aria-disabled', 'true'); summaryView.tabIndex = -1;
        commentUI?._cleanup?.();
        if (currentExpandedCard === card) currentExpandedCard = null;
        if (resizeSubscribed) window.removeEventListener('resize', resizeHandler);
        resizeSubscribed = false;
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }
    });
    card._cleanup = () => scope.dispose();
    queueMicrotask(() => {
        constructing = false;
        if (!scope.isCurrent()) return;
        stopTrackingRemoval = trackCreatorRemoval(card, () => scope.dispose());
    });

    card.appendChild(summaryView);
    card.appendChild(detailView);
    return card;
}
