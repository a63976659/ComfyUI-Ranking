// 前端页面/profile/个人列表组件.js
import { api } from "../core/网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { getAcquiredItems } from "../market/资源安装引擎.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t, tIfExists, getLanguage } from "../components/用户体验增强.js";
import { PLACEHOLDERS, PAGINATION, CACHE, API, getCachedProfile, getProfileWithSWR } from "../core/全局配置.js";
import { beginProfileListView, normalizeProfileItems, normalizeCollectedProfile, profileItemsFromResponse, readProfileListCache, writeProfileListCache } from './个人列表缓存.js';
import { escapeHtml } from "../components/互动工具函数.js";  // 🧹 P2归一：局部副本已移除

/**
 * 👤 渲染用户卡片（复用于粉丝列表和关注列表）
 * @param {string} account - 用户账号
 * @param {Object} currentUser - 当前登录用户
 * @param {Function} openOtherUserModalCb - 打开用户详情回调
 * @returns {HTMLElement} 用户卡片元素
 */
let nextUserCardId = 0;

function renderUserCard(account, currentUser, openOtherUserModalCb) {
    const card = document.createElement("button");
    const cardId = `ranking-profile-user-${++nextUserCardId}`;
    card.type = 'button';
    card.id = cardId;
    card.className = 'profile-user-card';
    card.setAttribute('aria-labelledby', `${cardId}-name ${cardId}-action`);
    card.setAttribute('aria-describedby', `${cardId}-intro`);
    card.onclick = () => openOtherUserModalCb(account, currentUser);

    const cached = getCachedProfile(account);
    const avatar = cached?.avatar || PLACEHOLDERS.AVATAR;
    const name = cached?.name || account;
    const intro = cached?.intro || '';
    card.innerHTML = `
        <img class="profile-user-card__avatar" alt="" src="${escapeHtml(avatar)}">
        <span class="profile-user-card__body">
            <span class="profile-user-card__name" id="${cardId}-name">@${escapeHtml(name)}</span>
            <span class="profile-user-card__intro" id="${cardId}-intro">${escapeHtml(intro || t('profile.no_intro'))}</span>
        </span>
        <span class="profile-user-card__action" id="${cardId}-action">${t('profile.homepage')}</span>
    `;
    const avatarImg = card.querySelector('.profile-user-card__avatar');
    const nameDiv = card.querySelector('.profile-user-card__name');
    const introDiv = card.querySelector('.profile-user-card__intro');
    getProfileWithSWR(account, api.getUserProfile, profile => {
        if (!card.isConnected || card.querySelector('.profile-user-card__name') !== nameDiv) return;
        if (profile.avatar) avatarImg.src = profile.avatar;
        if (profile.name) nameDiv.textContent = `@${profile.name}`;
        if (profile.intro !== undefined) introDiv.textContent = profile.intro || t('profile.no_intro');
    });
    return card;
}

/**
 * 🗂️ 渲染用户列表标签页（关注/粉丝通用：清空容器 → flex包装 → 分页渲染）
 * @param {Array} listData - 用户账号列表
 * @param {HTMLElement} domElement - 挂载点
 * @param {Object} currentUser - 当前登录用户
 * @param {Function} openOtherUserModalCb - 打开用户详情回调
 * @param {string} emptyMsg - 空列表提示文案
 */
function _renderUserListTab(listData, domElement, currentUser, openOtherUserModalCb, emptyMsg) {
    domElement.innerHTML = "";
    const containerDiv = document.createElement("div");
    containerDiv.className = 'profile-user-list';
    domElement.appendChild(containerDiv);
    renderPaginatedUserList(listData, containerDiv, currentUser, openOtherUserModalCb, emptyMsg);
}

/**
 * 📄 渲染分页用户列表（复用于粉丝列表和关注列表）
 * @param {Array} userList - 用户账号列表
 * {HTMLElement} containerDiv - 容器元素
 * {Object} currentUser - 当前登录用户
 * {Function} openOtherUserModalCb - 打开用户详情回调
 * {string} emptyMessage - 空列表提示消息
 */
function renderPaginatedUserList(userList, containerDiv, currentUser, openOtherUserModalCb, emptyMessage) {
    containerDiv.replaceChildren();
    const accounts = Array.isArray(userList) ? userList.filter(account => typeof account === 'string' && account.trim()) : [];
    if (!accounts.length) {
        const empty = document.createElement('div');
        empty.className = 'profile-user-list__empty';
        empty.setAttribute('role', 'status');
        empty.textContent = emptyMessage;
        containerDiv.appendChild(empty);
        return;
    }
    let displayedCount = 0;
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'profile-user-list__more';
    containerDiv.appendChild(loadMoreBtn);
    const appendPage = (fromUser = false) => {
        const nextCount = Math.min(displayedCount + PAGINATION.PROFILE_USERS_PAGE_SIZE, accounts.length);
        let firstAdded;
        for (const account of accounts.slice(displayedCount, nextCount)) {
            const card = renderUserCard(account, currentUser, openOtherUserModalCb);
            firstAdded ||= card;
            containerDiv.insertBefore(card, loadMoreBtn);
        }
        displayedCount = nextCount;
        if (displayedCount < accounts.length) {
            loadMoreBtn.textContent = t('profile.load_more', { count: accounts.length - displayedCount });
        } else {
            loadMoreBtn.remove();
            if (fromUser) firstAdded?.focus();
        }
    };
    loadMoreBtn.onclick = () => appendPage(true);
    appendPage();
}

function setProfileListState(element, message, role = 'status') {
    const state = document.createElement('div');
    state.className = 'profile-user-list__empty';
    state.setAttribute('role', role);
    state.textContent = message;
    element.replaceChildren(state);
}

export async function renderProfileListContent(tabId, domElement, userData, currentUser, openOtherUserModalCb) {
    const isCurrent = beginProfileListView(domElement, domElement._profileSessionCurrent);
    const isMe = currentUser && currentUser.account === userData.account;
    const privacy = userData.privacy || {};

    if (!isMe && ['acquired', 'my_tasks', 'transactions', 'my_posts', 'my_prompts'].includes(tabId)) {
        domElement.innerHTML = `<div role="status" class="profile-user-list__empty">${t('profile.privacy_hidden')}</div>`;
        return;
    }

    // 【修复】：从底层杜绝隐私被穿透抓取
    if (!isMe) {
        if ((tabId === "following" && privacy.follows) ||
            (tabId === "liked" && privacy.likes) ||
            (tabId === "followers" && privacy.follows) ||
            (tabId === "collected" && privacy.favorites)) {
            setProfileListState(domElement, t('profile.privacy_hidden'), 'status');
            return;
        }
    }

    // 👥 关注列表（使用 SWR 缓存技术）
    if (tabId === "following") {
        _renderUserListTab(userData.following || [], domElement, currentUser, openOtherUserModalCb, t('profile.no_following'));
        return;
    }

    // 👥 粉丝列表（使用 SWR 缓存技术）
    if (tabId === "followers") {
        _renderUserListTab(userData.followers || [], domElement, currentUser, openOtherUserModalCb, t('profile.no_followers'));
        return;
    }

    // 已获取资源先显示本地记录，再校对云端所有权与详情。
    if (tabId === 'acquired') {
        let localItems = [];
        try { localItems = normalizeProfileItems(getAcquiredItems()); } catch {}
        const renderAcquired = (items, hasOwnership = false) => {
            if (!isCurrent()) return;
            if (!items.length) {
                if (hasOwnership) {
                    const error = document.createElement('div');
                    error.className = 'profile-user-list__empty';
                    error.setAttribute('role', 'alert');
                    error.textContent = t('profile.load_failed');
                    domElement.replaceChildren(error);
                } else domElement.innerHTML = _renderEmptyState('📦', t('profile.no_purchased_resources'), t('profile.discover_resources'));
                return;
            }
            const list = document.createElement('div');
            list.className = 'profile-content-list';
            for (const item of items) list.appendChild(createItemCard(item, currentUser, 'acquired'));
            domElement.replaceChildren(list);
        };
        if (localItems.length) renderAcquired(localItems.map(item => ({ ...item, _isOffline: true })));
        else domElement.innerHTML = `<div role="status" class="profile-user-list__empty">${t('profile.loading_resources')}</div>`;
        let acquiredIds = localItems.map(item => String(item.id));
        try {
            if (currentUser?.account) {
                const response = await api.getUserPurchases(currentUser.account);
                if (!isCurrent()) return;
                if (response?.status !== 'success' || !Array.isArray(response.data)) throw new Error('Invalid purchases');
                const cloudIds = response.data.filter(record => record && typeof record === 'object'
                    && typeof record.item_id === 'string' && record.item_id).map(record => record.item_id);
                if (response.data.length && !cloudIds.length) throw new Error('Invalid purchase entries');
                acquiredIds = cloudIds;
            }
        } catch {
            if (!isCurrent()) return;
            console.warn('购买记录暂不可用，保留本地资源');
        }
        if (!acquiredIds.length) { renderAcquired([]); return; }
        const localMap = new Map(localItems.map(item => [String(item.id), item]));
        const cloudMap = new Map();
        const controller = new AbortController();
        const release = domElement._profileAddCleanup?.(() => controller.abort());
        let timer;
        try {
            const fetches = ['tool', 'skill', 'app'].map(async type => {
                const response = await api.getItems(type, 'time', PAGINATION.PROFILE_RESOURCE_FETCH_LIMIT, { signal: controller.signal });
                for (const item of profileItemsFromResponse(response)) cloudMap.set(String(item.id), item);
            });
            const deadline = new Promise(resolve => {
                timer = setTimeout(() => { controller.abort(); resolve(); }, API.PROFILE_RESOURCE_TIMEOUT);
            });
            await Promise.race([Promise.allSettled(fetches), deadline]);
            if (!isCurrent()) return;
            const enriched = [...new Set(acquiredIds)].map(id => cloudMap.get(id)
                || (localMap.has(id) ? { ...localMap.get(id), _isOffline: true } : null)).filter(Boolean);
            renderAcquired(enriched, true);
        } finally { clearTimeout(timer); release?.(); }
        return;
    }

    // 📝 新增：我的任务列表
    if (tabId === "my_tasks") {
        setProfileListState(domElement, t('profile.loading_tasks'), 'status');
        
        try {
            // 并行获取我发布的 + 我接的任务
            const [publishedRes, assignedRes] = await Promise.all([
                api.getMyTasks("publisher"),
                api.getMyTasks("assignee")
            ]);
            
            if (!isCurrent()) return;
            const publishedTasks = publishedRes.data || [];
            const assignedTasks = assignedRes.data || [];
            
            if (publishedTasks.length === 0 && assignedTasks.length === 0) {
                domElement.innerHTML = _renderEmptyState('📝', t('profile.no_task_records'), t('profile.go_tasks'));
                return;
            }
            
            const statusColors = {
                open: "#4CAF50", in_progress: "#2196F3", submitted: "#FF9800",
                completed: "#9E9E9E", disputed: "#F44336", cancelled: "#757575"
            };
            const statusLabels = {
                open: t('task.status_open'), in_progress: t('task.status_in_progress'), submitted: t('task.status_submitted'),
                completed: t('task.status_completed'), disputed: t('task.status_disputed'), cancelled: t('task.status_cancelled')
            };
            
            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";
            
            // 渲染我发布的任务
            if (publishedTasks.length > 0) {
                const sectionTitle = document.createElement("div");
                sectionTitle.style.cssText = "font-size: 13px; font-weight: bold; color: #FF9800; margin-bottom: 5px; padding: 5px 0;";
                sectionTitle.textContent = `📤 ${t('profile.published_tasks')} (${publishedTasks.length})`;
                listDiv.appendChild(sectionTitle);
                
                publishedTasks.forEach(task => {
                    const taskDiv = createTaskItem(task, statusColors, statusLabels, currentUser);
                    listDiv.appendChild(taskDiv);
                });
            }
            
            // 渲染我接的任务
            if (assignedTasks.length > 0) {
                const sectionTitle = document.createElement("div");
                sectionTitle.style.cssText = "font-size: 13px; font-weight: bold; color: #2196F3; margin-bottom: 5px; padding: 5px 0; margin-top: 15px;";
                sectionTitle.textContent = `📥 ${t('profile.assigned_tasks')} (${assignedTasks.length})`;
                listDiv.appendChild(sectionTitle);
                
                assignedTasks.forEach(task => {
                    const taskDiv = createTaskItem(task, statusColors, statusLabels, currentUser);
                    listDiv.appendChild(taskDiv);
                });
            }
            
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
            
        } catch (e) {
            if (!isCurrent()) return;
            console.error("加载任务失败");
            setProfileListState(domElement, t('profile.load_tasks_failed'), 'alert');
        }
        return;
    }
    
    // 💳 P6支付增强：交易明细列表
    if (tabId === "transactions") {
        setProfileListState(domElement, t('profile.loading_transactions'), 'status');
        
        try {
            // 并行获取任务统计、交易明细、打赏统计和销售统计
            const [statsRes, txRes, tipStatsRes, salesStatsRes] = await Promise.all([
                api.getTaskStats(currentUser.account),
                api.getTransactions(currentUser.account, 1, 30),
                api.getTipStats(currentUser.account).catch(() => ({ data: {} })),  // 新增，带容错
                api.getSalesStats(currentUser.account).catch(() => ({ data: {} }))  // 新增，带容错
            ]);
            
            if (!isCurrent()) return;
            const stats = statsRes.data || {};
            const transactions = txRes.data || [];
            const tipStats = tipStatsRes.data || {};
            const salesStats = salesStatsRes.data || {};
            
            const containerDiv = document.createElement("div");
            containerDiv.style.cssText = "display: flex; flex-direction: column; gap: 15px;";
            
            // 💰 销售统计卡片（放在最上方，与打赏统计样式一致）
            // 🔧 下方销售/打赏两处的 profile.transactions_unit 不再加 || '笔' 兜底：
            // 该词条英文值刻意留空（中文 5笔 → 英文 5），兜底会把中文量词引回英文界面
            containerDiv.appendChild(_createStatsCard(
                `💰 ${t('profile.sales_stats')}`,
                [
                    { value: `+${salesStats.total_sales || 0}`,    color: '#4CAF50', bgRgb: '76,175,80',  label: t('profile.sales_income') },
                    { value: `-${salesStats.total_purchase || 0}`,  color: '#F44336', bgRgb: '244,67,54', label: `${t('profile.purchase_expense')} (${salesStats.purchase_count || 0}${t('profile.transactions_unit')})` },
                    { value: `${(salesStats.net_sales || 0) > 0 ? '+' : ''}${salesStats.net_sales || 0}`, color: '#2196F3', bgRgb: '33,150,243', label: t('profile.net_sales') }
                ],
                ' margin-bottom: 15px;'
            ));

            // 📊 任务收益统计卡片
            containerDiv.appendChild(_createStatsCard(
                `📊 ${t('profile.task_earnings_stats')}`,
                [
                    { value: `+${stats.total_income || 0}`,   color: '#4CAF50', bgRgb: '76,175,80',  label: `${t('profile.task_income')} (${stats.income_count || 0}${t('profile.transactions_unit')})` },
                    { value: `-${stats.total_payment || 0}`,  color: '#F44336', bgRgb: '244,67,54', label: `${t('profile.task_expense')} (${stats.payment_count || 0}${t('profile.transactions_unit')})` },
                    { value: `${stats.net_earnings > 0 ? '+' : ''}${stats.net_earnings || 0}`, color: '#2196F3', bgRgb: '33,150,243', label: t('profile.net_earnings') }
                ]
            ));

            // 🎁 打赏统计卡片
            containerDiv.appendChild(_createStatsCard(
                `🎁 ${t('profile.tip_stats')}`,
                [
                    { value: `+${tipStats.total_tip_in || 0}`,  color: '#4CAF50', bgRgb: '76,175,80',  label: `${t('profile.tip_received')} (${tipStats.tip_in_count || 0}${t('profile.transactions_unit')})` },
                    { value: `-${tipStats.total_tip_out || 0}`, color: '#F44336', bgRgb: '244,67,54', label: `${t('profile.tip_sent')} (${tipStats.tip_out_count || 0}${t('profile.transactions_unit')})` },
                    { value: `${(tipStats.net_tips || 0) > 0 ? '+' : ''}${tipStats.net_tips || 0}`, color: '#2196F3', bgRgb: '33,150,243', label: t('profile.net_tips') }
                ],
                ' margin-bottom: 15px;'
            ));
            
            // 📝 交易明细列表
            const txListDiv = document.createElement("div");
            txListDiv.style.cssText = "display: flex; flex-direction: column; gap: 8px;";
            
            if (transactions.length === 0) {
                txListDiv.innerHTML = _renderEmptyState('💰', t('profile.no_transactions'));
            } else {
                transactions.forEach(tx => {
                    try {
                        const txCard = createTransactionCard(tx);
                        txListDiv.appendChild(txCard);
                    } catch (e) {
                        console.error("交易卡片渲染失败:", tx.tx_id, e);
                    }
                });
            }
            
            containerDiv.appendChild(txListDiv);
            domElement.innerHTML = "";
            domElement.appendChild(containerDiv);
            
        } catch (e) {
            if (!isCurrent()) return;
            console.error("加载交易记录失败");
            setProfileListState(domElement, t('profile.load_transactions_failed'), 'alert');
        }
        return;
    }
    
    // 💬 新增：我的帖子列表
    if (tabId === "my_posts") {
        setProfileListState(domElement, t('profile.loading_posts'), 'status');

        try {
            const res = await api.getMyPosts();
            if (!isCurrent()) return;
            const posts = res.data || [];

            if (posts.length === 0) {
                domElement.innerHTML = _renderEmptyState('💬', t('profile.no_posts'), t('profile.go_posts'));
                return;
            }

            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";

            posts.forEach(post => {
                const postDiv = createPostItem(post, currentUser);
                listDiv.appendChild(postDiv);
            });

            domElement.innerHTML = "";
            domElement.appendChild(listDiv);

        } catch (e) {
            if (!isCurrent()) return;
            console.error("加载帖子失败");
            setProfileListState(domElement, t('profile.load_posts_failed'), 'alert');
        }
        return;
    }

    // 🧩 新增：我的提示词列表
    if (tabId === "my_prompts") {
        setProfileListState(domElement, t('profile.loading_prompts'), 'status');

        try {
            const res = await api.getMyPrompts();
            if (!isCurrent()) return;
            const prompts = res.data || [];

            if (prompts.length === 0) {
                domElement.innerHTML = _renderEmptyState('🧩', t('profile.no_prompts'), t('profile.go_prompts'));
                return;
            }

            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";

            prompts.forEach(prompt => {
                const promptDiv = createPromptItem(prompt, currentUser);
                listDiv.appendChild(promptDiv);
            });

            domElement.innerHTML = "";
            domElement.appendChild(listDiv);

        } catch (e) {
            if (!isCurrent()) return;
            console.error("加载提示词失败");
            setProfileListState(domElement, t('profile.load_prompts_failed'), 'alert');
        }
        return;
    }

    // ⭐ 新增：我的收藏列表（资源 + 帖子 + 提示词）
    if (tabId === "collected") {
        const cacheKey = `${CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX}${userData.account}_collected`;
        const cached = readProfileListCache(cacheKey, normalizeCollectedProfile);
        const cachedStr = cached ? JSON.stringify(cached) : null;

        const applyDOM = (items, posts, prompts) => {
            if (!isCurrent()) return;
            domElement.innerHTML = "";
            if ((!items || items.length === 0) && (!posts || posts.length === 0) && (!prompts || prompts.length === 0)) {
                domElement.innerHTML = _renderEmptyState('🔖', t('profile.no_collected'), t('profile.go_discover'));
                return;
            }
            const listDiv = document.createElement("div");
            listDiv.style.cssText = "display:flex;flex-direction:column;gap:10px;";

            if (items && items.length > 0) {
                const sectionTitle = document.createElement("div");
                sectionTitle.style.cssText = "font-size: 13px; font-weight: bold; color: #FF9800; margin-bottom: 5px; padding: 5px 0;";
                sectionTitle.textContent = `📦 ${t('profile.collected_items')} (${items.length})`;
                listDiv.appendChild(sectionTitle);
                items.forEach(item => { listDiv.appendChild(createItemCard(item, currentUser)); });
            }

            if (posts && posts.length > 0) {
                const sectionTitle = document.createElement("div");
                sectionTitle.style.cssText = "font-size: 13px; font-weight: bold; color: #9C27B0; margin-bottom: 5px; padding: 5px 0;" + (items && items.length > 0 ? " margin-top: 15px;" : "");
                sectionTitle.textContent = `💬 ${t('profile.collected_posts')} (${posts.length})`;
                listDiv.appendChild(sectionTitle);
                posts.forEach(post => { listDiv.appendChild(createPostItem(post, currentUser)); });
            }

            if (prompts && prompts.length > 0) {
                const sectionTitle = document.createElement("div");
                sectionTitle.style.cssText = "font-size: 13px; font-weight: bold; color: #00BCD4; margin-bottom: 5px; padding: 5px 0;" + ((items && items.length > 0) || (posts && posts.length > 0) ? " margin-top: 15px;" : "");
                sectionTitle.textContent = `🧩 ${t('profile.collected_prompts')} (${prompts.length})`;
                listDiv.appendChild(sectionTitle);
                prompts.forEach(prompt => { listDiv.appendChild(createPromptItem(prompt, currentUser)); });
            }

            domElement.appendChild(listDiv);
        };

        if (cached) {
            applyDOM(cached.items, cached.posts, cached.prompts);
        } else {
            setProfileListState(domElement, t('profile.fetching_data'), 'status');
        }

        try {
            const [toolsRes, skillsRes, appsRes, postsRes, promptsRes] = await Promise.all([
                api.getItems("tool", "time", 100),
                api.getItems("skill", "time", 100),
                api.getItems("app", "time", 100),
                api.getPosts(1, 200, "latest"),
                api.getPrompts(null, null, 1, 200, "latest")
            ]);
            if (!isCurrent()) return;
        const allItems = [toolsRes, skillsRes, appsRes].flatMap(profileItemsFromResponse);
            const allPosts = profileItemsFromResponse(postsRes);
            const allPrompts = profileItemsFromResponse(promptsRes);
            const collectedItems = allItems.filter(item => Array.isArray(item.favorited_by) && item.favorited_by.includes(userData.account));
            const collectedPosts = allPosts.filter(post => Array.isArray(post.favorited_by) && post.favorited_by.includes(userData.account));
            const collectedPrompts = allPrompts.filter(prompt => Array.isArray(prompt.favorited_by) && prompt.favorited_by.includes(userData.account));

            const freshData = { items: collectedItems, posts: collectedPosts, prompts: collectedPrompts };
            const freshStr = JSON.stringify(freshData);
            if (freshStr !== cachedStr) {
                writeProfileListCache(cacheKey, freshData);
                applyDOM(collectedItems, collectedPosts, collectedPrompts);
            }
        } catch (error) {
            if (!isCurrent()) return;
            console.error("加载收藏失败");
            if (!cachedStr) setProfileListState(domElement, t('profile.load_collected_failed'), 'alert');
        }
        return;
    }

    const cacheKey = `${CACHE.LOCAL_KEYS.PROFILE_LIST_PREFIX}${userData.account}_${tabId}`;
    const cached = readProfileListCache(cacheKey);
    const cachedStr = cached ? JSON.stringify(cached) : null;
    
    const applyDOM = (items) => {
        if (!isCurrent()) return;
        domElement.innerHTML = "";
        if (items.length === 0) { domElement.innerHTML = _renderEmptyState('📋', t('profile.no_records')); return; }
        items.forEach(item => { domElement.appendChild(createItemCard(item, currentUser)); });
    };

    if (cached) {
        applyDOM(cached);
    } else {
        setProfileListState(domElement, t('profile.fetching_data'), 'status');
    }

    try {
        const [toolsRes, skillsRes, appsRes] = await Promise.all([ api.getItems("tool", "time", 100), api.getItems("skill", "time", 100), api.getItems("app", "time", 100) ]);
        if (!isCurrent()) return;
        const allItems = [toolsRes, skillsRes, appsRes].flatMap(profileItemsFromResponse);
        let filteredItems = [];

        if (tabId === "published") filteredItems = allItems.filter(item => item.author === userData.account);
        else if (tabId === "liked") filteredItems = allItems.filter(item => Array.isArray(item.liked_by) && item.liked_by.includes(userData.account));

        const freshStr = JSON.stringify(filteredItems);
        if (freshStr !== cachedStr) {
            writeProfileListCache(cacheKey, filteredItems);
            applyDOM(filteredItems);
        }
    } catch (error) {
        if (!isCurrent()) return;
        if (!cachedStr) setProfileListState(domElement, t('profile.load_failed'), 'alert');
    }
}

/**
 * 🎨 渲染空列表占位提示HTML
 * @param {string} icon - 图标emoji
 * @param {string} title - 主文案
 * @param {string} [subtitle] - 次要文案（可选）
 * @returns {string} HTML字符串
 */
function _renderEmptyState(icon, title, subtitle = '') {
    const subtitleHtml = subtitle
        ? `<div class="profile-list-empty__subtitle">${escapeHtml(subtitle)}</div>`
        : '';
    return `<div class="profile-list-empty" role="status">
        <div class="profile-list-empty__icon" aria-hidden="true">${escapeHtml(icon)}</div>
        <div>${escapeHtml(title)}</div>
        ${subtitleHtml}
    </div>`;
}

/**
 * 💳 创建统计卡片（销售统计、任务收益、打赏统计等通用结构）
 * @param {string} title - 卡片标题（含图标emoji）
 * @param {Array<{value: string, label: string}>} stats - 3列统计项
 * @param {string} [extraStyle] - 额外的卡片外层样式
 * @returns {HTMLElement}
 */
function _createStatsCard(title, stats, extraStyle = '') {
    const card = document.createElement('div');
    card.style.cssText = `background: linear-gradient(135deg, var(--comfy-input-bg), #1a1a1a); border-radius: 12px; padding: 15px; border: 1px solid #444;${extraStyle}`;
    const colsHtml = stats.map(s => `
        <div style="text-align: center; padding: 10px; background: rgba(${s.bgRgb || '76,175,80'},0.1); border-radius: 8px;">
            <div style="font-size: 20px; font-weight: bold; color: ${s.color};">${s.value}</div>
            <div style="font-size: 11px; color: #888;">${s.label}</div>
        </div>`).join('');
    card.innerHTML = `
        <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 12px;">${title}</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">${colsHtml}</div>
    `;
    return card;
}

/**
 * 📝 创建任务卡片项
 */
function createTaskItem(task, statusColors, statusLabels, currentUser) {
    const taskDiv = document.createElement("div");
    Object.assign(taskDiv.style, {
        padding: "12px",
        background: "var(--comfy-input-bg)",
        borderRadius: "8px",
        border: "1px solid #444",
        cursor: "pointer",
        transition: "0.2s"
    });
    
    const statusColor = statusColors[task.status] || "#666";
    const statusLabel = statusLabels[task.status] || t('task.status_unknown');
    
    taskDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="background: ${statusColor}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${statusLabel}</span>
            <span style="color: #FF9800; font-weight: bold;">💰 ${task.total_price} ${t('task.points')}</span>
        </div>
        <div style="font-weight: bold; color: #eee; margin-bottom: 6px; font-size: 14px;">${escapeHtml(task.title)}</div>
        <div style="font-size: 11px; color: #888; display: flex; gap: 15px;">
            <span>✈️ ${formatDeadline(task.deadline)}</span>
            ${task.status === "open" ? `<span>👥 ${(task.applicants || []).length} ${t('task.applicants')}</span>` : ""}
        </div>
    `;
    
    // 悬停效果
    taskDiv.onmouseover = () => { taskDiv.style.borderColor = "#666"; taskDiv.style.transform = "translateX(3px)"; };
    taskDiv.onmouseout = () => { taskDiv.style.borderColor = "#444"; taskDiv.style.transform = "translateX(0)"; };
    
    // 点击进入详情
    taskDiv.onclick = () => {
        import("../task/任务详情组件.js").then(module => {
            const view = module.createTaskDetailView(task.id, currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        });
    };
    
    return taskDiv;
}

/**
 * 📅 格式化截止日期
 */
function formatDeadline(deadline) {
    if (!deadline) return t('time.unlimited');
    try {
        const date = new Date(deadline);
        const now = new Date();
        const diff = date - now;
        if (diff < 0) return t('time.deadline_ended');
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return t('time.deadline_today');
        if (days === 1) return t('time.deadline_tomorrow');
        if (days < 7) return t('time.deadline_days', { n: days });
        return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch { return deadline; }
}

/**
 * 💬 创建帖子卡片项
 */
function createPostItem(post, currentUser) {
    const postDiv = document.createElement("div");
    Object.assign(postDiv.style, {
        padding: "12px",
        background: "var(--comfy-input-bg)",
        borderRadius: "8px",
        border: "1px solid #444",
        cursor: "pointer",
        transition: "all 0.2s"
    });
    
    // 截取内容摘要
    const contentPreview = (post.content || "").slice(0, 80) + ((post.content || "").length > 80 ? "..." : "");
    
    // 格式化时间
    const timeStr = formatPostTime(post.created_at);
    
    // 视频帖判断与封面图取值
    const isVideo = post.post_type === "video";
    let coverImageUrl = null;
    if (isVideo) {
        coverImageUrl = post.cover_image || null;
    } else {
        const imageCount = (post.images || []).length;
        coverImageUrl = imageCount > 0 ? post.images[0] : null;
    }
    
    postDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            ${coverImageUrl ? `
                <div style="position: relative; flex-shrink: 0;">
                    <img src="${escapeHtml(coverImageUrl)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; display: block;">
                    ${isVideo ? `
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                                width: 28px; height: 28px; background: rgba(0,0,0,0.6); border-radius: 50%;
                                display: flex; align-items: center; justify-content: center; pointer-events: none;">
                        <div style="width: 0; height: 0; border-left: 10px solid rgba(255,255,255,0.9);
                                    border-top: 6px solid transparent; border-bottom: 6px solid transparent;
                                    margin-left: 2px;"></div>
                    </div>
                    ` : ''}
                </div>
            ` : ""}
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; color: #fff; margin-bottom: 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${escapeHtml(contentPreview)}
                </div>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: #888;">
                    <span>❤️ ${post.like_count || 0}</span>
                    <span>💬 ${post.comment_count || 0}</span>
                    ${isVideo ? `<span>🎬 ${t('post.video_tag')}</span>` : ((post.images || []).length > 1 ? `<span>🖼️ ${(post.images || []).length}${t('post.images_unit')}</span>` : "")}
                    <span style="margin-left: auto;">${timeStr}</span>
                </div>
            </div>
        </div>
    `;
    
    // 悬停效果（使用 mouseenter/mouseleave 避免子元素边界闪烁）
    postDiv.onmouseenter = () => { postDiv.style.borderColor = "#9C27B0"; postDiv.style.transform = "translateX(2px)"; };
    postDiv.onmouseleave = () => { postDiv.style.borderColor = "#444"; postDiv.style.transform = "translateX(0)"; };
    
    // 点击进入详情
    postDiv.onclick = () => {
        import("../post/帖子详情组件.js").then(module => {
            const view = module.createPostDetailView(post.id, currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(err => {
            console.error("加载帖子详情组件失败:", err);
            showToast(t('profile.post_detail_load_failed'), "error");
        });
    };
    
    return postDiv;
}

/**
 * 🧩 创建提示词卡片项（复刻 createPostItem 模式）
 */
function createPromptItem(prompt, currentUser) {
    const promptDiv = document.createElement("div");
    Object.assign(promptDiv.style, {
        padding: "12px",
        background: "var(--comfy-input-bg)",
        borderRadius: "8px",
        border: "1px solid #444",
        cursor: "pointer",
        transition: "all 0.2s"
    });

    // 时间格式化（复用帖子时间格式函数）
    const timeStr = formatPostTime(prompt.created_at);

    // 视频提示词用封面图，图片提示词用 cover_image
    const isVideo = prompt.media_type === "video" || prompt.prompt_type === "video";
    const coverImageUrl = prompt.cover_image || null;

    // 价格徽标
    const priceBadge = (prompt.price > 0)
        ? `<span style="background: rgba(255,193,7,0.15); color: #FFC107; padding: 1px 6px; border-radius: 4px; font-size: 10px;">💎 ${prompt.price}</span>`
        : `<span style="background: rgba(76,175,80,0.15); color: #4CAF50; padding: 1px 6px; border-radius: 4px; font-size: 10px;">${t('prompt.free')}</span>`;

    promptDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            ${coverImageUrl ? `
                <div style="position: relative; flex-shrink: 0;">
                    <img src="${escapeHtml(coverImageUrl)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; display: block;">
                    ${isVideo ? `
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                                width: 28px; height: 28px; background: rgba(0,0,0,0.6); border-radius: 50%;
                                display: flex; align-items: center; justify-content: center; pointer-events: none;">
                        <div style="width: 0; height: 0; border-left: 10px solid rgba(255,255,255,0.9);
                                    border-top: 6px solid transparent; border-bottom: 6px solid transparent;
                                    margin-left: 2px;"></div>
                    </div>
                    ` : ''}
                </div>
            ` : ""}
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; color: #fff; margin-bottom: 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${escapeHtml(prompt.title || '')}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #888; flex-wrap: wrap;">
                    ${priceBadge}
                    ${prompt.category ? `<span style="background: rgba(0,188,212,0.12); color: #00BCD4; padding: 1px 6px; border-radius: 4px; font-size: 10px;">${escapeHtml(tIfExists('promptcat.' + prompt.category, prompt.category))}</span>` : ''}
                    <span>❤️ ${prompt.likes || 0}</span>
                    <span>⭐ ${prompt.favorites || 0}</span>
                    <span>👁️ ${prompt.views || 0}</span>
                    <span style="margin-left: auto;">${timeStr}</span>
                </div>
            </div>
        </div>
    `;

    // 悬停效果（青色主题，与提示词 Tab 配色一致）
    promptDiv.onmouseenter = () => { promptDiv.style.borderColor = "#00BCD4"; promptDiv.style.transform = "translateX(2px)"; };
    promptDiv.onmouseleave = () => { promptDiv.style.borderColor = "#444"; promptDiv.style.transform = "translateX(0)"; };

    // 点击进入提示词详情
    promptDiv.onclick = () => {
        import("../prompt/提示词详情组件.js").then(module => {
            const view = module.createPromptDetailView(prompt.id, currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(err => {
            console.error("加载提示词详情组件失败:", err);
            showToast(t('profile.prompt_detail_load_failed'), "error");
        });
    };

    return promptDiv;
}

/**
 * 🕒 格式化帖子时间
 */
function formatPostTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60 * 1000) return t('time.just_now');
    if (diff < 60 * 60 * 1000) return t('time.minutes_ago', { n: Math.floor(diff / 60000) });
    if (diff < 24 * 60 * 60 * 1000) return t('time.hours_ago', { n: Math.floor(diff / 3600000) });
    if (diff < 7 * 24 * 60 * 60 * 1000) return t('time.days_ago', { n: Math.floor(diff / 86400000) });
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 💳 创建交易记录卡片
 * 根据交易类型展示不同的详细信息
 */
function createTransactionCard(tx) {
    const txDiv = document.createElement("div");
    txDiv.style.cssText = "padding: 12px; background: var(--comfy-input-bg); border-radius: 8px; border: 1px solid #444; display: flex; justify-content: space-between; align-items: flex-start;";
    
    const isPositive = tx.amount > 0;
    const amountColor = isPositive ? '#4CAF50' : '#F44336';
    const timeStr = tx.created_at ? new Date(tx.created_at).toLocaleString(getLanguage(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    
    // 获取交易类型配置
    const typeConfig = getTransactionTypeConfig(tx.tx_type);
    
    // 构建描述文本
    let description = '';
    let detailLine = '';
    
    switch (tx.tx_type) {
        case 'WITHDRAW':
            // 提现：显示脱敏支付宝账号和姓名
            if (tx.alipay_account && tx.real_name) {
                description = `${tx.alipay_account} ${tx.real_name}`;
            }
            // 状态标签
            if (tx.withdraw_status === 'pending') {
                detailLine = `⏳ ${t('tx.withdraw_pending')}`;
            } else if (tx.withdraw_status === 'completed') {
                detailLine = `✅ ${t('tx.withdraw_completed')}`;
            }
            break;
            
        case 'TIP_IN':
            // 收到打赏
            description = tx.description || '';
            if (tx.related_user_name) {
                detailLine = `👤 ${tx.related_user_name}`;
            }
            break;
            
        case 'TIP_OUT':
            // 打赏支出
            description = tx.description || '';
            break;
            
        case 'PURCHASE':
            // 购买资源
            description = tx.item_title || '';
            break;
            
        case 'SALE':
            // 出售资源
            description = tx.item_title || '';
            if (tx.related_user_name) {
                detailLine = `👤 ${tx.related_user_name}`;
            }
            break;
            
        case 'TASK_DEPOSIT':
            // 任务订金
            description = tx.item_title || '';
            break;
            
        case 'TASK_PAYMENT':
            // 任务尾款
            description = tx.item_title || '';
            break;
            
        case 'TASK_INCOME':
            // 任务收入
            description = tx.item_title || '';
            if (tx.related_user_name) {
                detailLine = `👤 ${tx.related_user_name}`;
            }
            break;
            
        case 'TASK_PRICE_ADJUST':
        case 'TASK_FREEZE':
            // 任务冻结
            description = tx.item_title || '';
            break;
            
        case 'TASK_REFUND':
            // 任务退款
            description = tx.item_title || '';
            break;
            
        case 'RECHARGE':
            // 充值
            description = t('tx.recharge_desc');
            break;
            
        case 'REFUND':
        case 'SALE_REFUND':
            // 退款
            description = tx.item_title || '';
            break;
            
        case 'WITHDRAW_FEE':
            // 提现手续费
            description = t('tx.withdraw_fee_desc');
            break;
            
        default:
            description = tx.description || tx.item_title || '';
    }
    
    // 构建详情行（时间 + 对方 + 状态）
    const details = [timeStr];
    if (detailLine) details.push(detailLine);
    const detailText = details.join(' · ');
    
    // 判断是否使用详细展示模式（有description或item_title时）
    const hasDetailedInfo = description || tx.item_title;
    
    // 资源标题（如果有）
    const itemTitle = tx.item_title && tx.tx_type !== 'TIP_IN' && tx.tx_type !== 'TIP_OUT' 
        ? `<span style="color: #888; margin-left: 6px;">- ${escapeHtml(tx.item_title)}</span>` 
        : '';
    
    // 实到金额（仅提现类型）
    const netAmountHtml = (tx.tx_type === 'WITHDRAW' && tx.net_amount !== null && tx.net_amount !== undefined)
        ? `<div style="font-size: 11px; color: #888; text-align: right;">${t('tx.net_amount')}: ${tx.net_amount}</div>`
        : '';
    
    if (hasDetailedInfo) {
        // 详细展示模式
        txDiv.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0;">
                <span style="font-size: 20px; flex-shrink: 0;">${typeConfig.icon}</span>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; flex-wrap: wrap;">
                        <span style="font-weight: bold; color: #eee; font-size: 13px;">${typeConfig.title}</span>
                        ${itemTitle}
                    </div>
                    ${description ? `<div style="font-size: 11px; color: #aaa; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(description)}</div>` : ''}
                    ${detailText ? `<div style="font-size: 11px; color: #888; margin-top: 3px;">${escapeHtml(detailText)}</div>` : ''}
                </div>
            </div>
            <div style="text-align: right; flex-shrink: 0; margin-left: 10px;">
                <div style="font-weight: bold; font-size: 15px; color: ${amountColor};">
                    ${isPositive ? '+' : ''}${tx.amount}
                </div>
                ${netAmountHtml}
            </div>
        `;
    } else {
        // 简洁展示模式（向后兼容旧数据）
        txDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">${typeConfig.icon}</span>
                <div>
                    <div style="font-weight: bold; color: #eee; font-size: 13px;">${typeConfig.title}</div>
                    <div style="font-size: 11px; color: #888;">${timeStr}${tx.related_account ? ' · ' + escapeHtml(tx.related_account.substring(0, 8)) + '...' : ''}</div>
                </div>
            </div>
            <div style="font-weight: bold; font-size: 15px; color: ${amountColor};">
                ${isPositive ? '+' : ''}${tx.amount}
            </div>
        `;
    }
    
    return txDiv;
}

/**
 * 获取交易类型配置
 */
function getTransactionTypeConfig(txType) {
    const configs = {
        'WITHDRAW': { icon: '💸', title: t('tx.withdraw') },
        'TIP_IN': { icon: '🎁', title: t('tx.tip_in') },
        'TIP_OUT': { icon: '🎁', title: t('tx.tip_out') },
        'PURCHASE': { icon: '🛒', title: t('tx.purchase') },
        'TASK_DEPOSIT': { icon: '📋', title: t('tx.task_deposit') },
        'TASK_PAYMENT': { icon: '📋', title: t('tx.task_payment') },
        'TASK_INCOME': { icon: '📋', title: t('tx.task_income') },
        'TASK_FREEZE': { icon: '🔒', title: t('tx.task_freeze') },
        'TASK_PRICE_ADJUST': { icon: '🔒', title: t('tx.task_price_adjust') },
        'TASK_REFUND': { icon: '↩️', title: t('tx.task_refund') },
        'TASK_CANCEL_REFUND': { icon: '🔄', title: t('tx.task_cancel_refund') },
        'SALE': { icon: '💎', title: t('tx.sale'), color: '#28a745' },
        'RECHARGE': { icon: '💰', title: t('tx.recharge') },
        'REFUND': { icon: '↩️', title: t('tx.refund') },
        'SALE_REFUND': { icon: '↩️', title: t('tx.sale_refund') },
        'WITHDRAW_FEE': { icon: '💸', title: t('tx.withdraw_fee') }
    };
    
    return configs[txType] || { icon: '💰', title: txType };
}
