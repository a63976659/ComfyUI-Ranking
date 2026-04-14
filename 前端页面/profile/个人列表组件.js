// 前端页面/profile/个人列表组件.js
import { api } from "../core/网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { getAcquiredItems, checkItemStatus } from "../market/资源安装引擎.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { PLACEHOLDERS, getCachedProfile, getProfileWithSWR } from "../core/全局配置.js";

/**
 * 👤 渲染用户卡片（复用于粉丝列表和关注列表）
 * @param {string} account - 用户账号
 * @param {Object} currentUser - 当前登录用户
 * @param {Function} openOtherUserModalCb - 打开用户详情回调
 * @returns {HTMLElement} 用户卡片元素
 */
function renderUserCard(account, currentUser, openOtherUserModalCb) {
    const card = document.createElement("div");
    card.id = `user-card-${account}`;
    card.style.cssText = "padding: 12px; background: #2a2a2a; border-radius: 8px; border: 1px solid #444; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.2s;";
    card.onmouseover = () => { card.style.borderColor = "#666"; card.style.transform = "translateX(3px)"; };
    card.onmouseout = () => { card.style.borderColor = "#444"; card.style.transform = "translateX(0)"; };
    card.onclick = () => openOtherUserModalCb(account, currentUser);

    // 先从缓存获取数据快速渲染
    const cached = getCachedProfile(account);
    const avatar = cached?.avatar || PLACEHOLDERS.AVATAR;
    const name = cached?.name || account;
    const intro = cached?.intro || '';

    card.innerHTML = `
        <img id="user-avatar-${account}" src="${avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #4CAF50; flex-shrink: 0;">
        <div style="flex: 1; min-width: 0;">
            <div id="user-name-${account}" style="font-weight: bold; color: #4CAF50; font-size: 14px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">@${name}</div>
            <div id="user-intro-${account}" style="font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${intro || t('profile.no_intro') || '暂无简介'}</div>
        </div>
        <button style="padding: 6px 12px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px; flex-shrink: 0;">${t('profile.homepage')}</button>
    `;

    // SWR：后台静默更新
    getProfileWithSWR(account, api.getUserProfile, (profile) => {
        const avatarImg = card.querySelector(`#user-avatar-${account}`);
        const nameDiv = card.querySelector(`#user-name-${account}`);
        const introDiv = card.querySelector(`#user-intro-${account}`);

        if (avatarImg && profile.avatar) {
            avatarImg.src = profile.avatar;
        }
        if (nameDiv && profile.name) {
            nameDiv.textContent = `@${profile.name}`;
        }
        if (introDiv && profile.intro !== undefined) {
            introDiv.textContent = profile.intro || t('profile.no_intro') || '暂无简介';
        }
    });

    return card;
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
    containerDiv.innerHTML = "";
    
    if (userList.length === 0) {
        containerDiv.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>${emptyMessage}</div>`;
        return;
    }

    // 分页逻辑：先加载前20个
    const PAGE_SIZE = 20;
    let displayedCount = Math.min(PAGE_SIZE, userList.length);

    // 渲染当前页的用户
    const renderPage = () => {
        // 保留容器但清空内容
        containerDiv.innerHTML = "";
        
        const pageAccounts = userList.slice(0, displayedCount);
        
        pageAccounts.forEach((account) => {
            const card = renderUserCard(account, currentUser, openOtherUserModalCb);
            containerDiv.appendChild(card);
        });

        // 如果有更多，显示"加载更多"按钮
        if (displayedCount < userList.length) {
            const loadMoreBtn = document.createElement("button");
            loadMoreBtn.textContent = t('profile.load_more') || `加载更多 (${userList.length - displayedCount})`;
            loadMoreBtn.style.cssText = "width: 100%; padding: 12px; background: #333; border: 1px solid #555; border-radius: 6px; color: #4CAF50; cursor: pointer; font-size: 13px; margin-top: 8px; transition: all 0.2s;";
            loadMoreBtn.onmouseover = () => { loadMoreBtn.style.background = "#3a3a3a"; };
            loadMoreBtn.onmouseout = () => { loadMoreBtn.style.background = "#333"; };
            loadMoreBtn.onclick = () => {
                displayedCount = Math.min(displayedCount + PAGE_SIZE, userList.length);
                renderPage();
            };
            containerDiv.appendChild(loadMoreBtn);
        }
    };

    renderPage();
}

export async function renderProfileListContent(tabId, domElement, userData, currentUser, openOtherUserModalCb) {
    const isMe = currentUser && currentUser.account === userData.account;
    const privacy = userData.privacy || {};

    // 【修复】：从底层杜绝隐私被穿透抓取
    if (!isMe) {
        if ((tabId === "following" && privacy.follows) || 
            (tabId === "liked" && privacy.likes) ||
            (tabId === "followers" && privacy.followers)) {
            domElement.innerHTML = `<div style='text-align:center; padding: 30px; color:#888;'>🔒 ${t('profile.privacy_hidden')}</div>`;
            return;
        }
    }

    // 👥 关注列表（使用 SWR 缓存技术）
    if (tabId === "following") {
        const followingList = userData.following || [];
        domElement.innerHTML = "";
        
        // 创建容器
        const containerDiv = document.createElement("div");
        containerDiv.style.display = "flex"; 
        containerDiv.style.flexDirection = "column"; 
        containerDiv.style.gap = "8px";
        domElement.appendChild(containerDiv);

        renderPaginatedUserList(
            followingList, 
            containerDiv, 
            currentUser, 
            openOtherUserModalCb, 
            t('profile.no_following') || '还没有关注任何人'
        );
        return;
    }

    // 👥 粉丝列表（使用 SWR 缓存技术）
    if (tabId === "followers") {
        const followersList = userData.followers || [];
        domElement.innerHTML = "";
        
        // 创建容器
        const containerDiv = document.createElement("div");
        containerDiv.style.display = "flex"; 
        containerDiv.style.flexDirection = "column"; 
        containerDiv.style.gap = "8px";
        domElement.appendChild(containerDiv);

        renderPaginatedUserList(
            followersList, 
            containerDiv, 
            currentUser, 
            openOtherUserModalCb, 
            t('profile.no_followers') || '还没有粉丝'
        );
        return;
    }

    // 🚀 已获取的资源列表（使用标准 createItemCard 组件）
    if (tabId === "acquired") {
        const acquiredItems = getAcquiredItems();
        domElement.innerHTML = "";

        if (acquiredItems.length === 0) {
            domElement.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>
                <div style="font-size: 40px; margin-bottom: 10px;">📦</div>
                <div>还没有购买任何资源</div>
                <div style="font-size: 12px; color: #888; margin-top: 5px;">去榜单页面发现优秀工具吧！</div>
            </div>`;
            return;
        }

        domElement.innerHTML = `<div style='padding: 20px; color:#888;'>⏳ 正在加载...</div>`;

        try {
            // 从云端获取完整数据（与 published 一致）
            const [toolsRes, appsRes] = await Promise.all([
                api.getItems("tool", "time", 200),
                api.getItems("app", "time", 200)
            ]);
            const cloudItems = [...(toolsRes.data || []), ...(appsRes.data || [])];
            const cloudMap = {};
            cloudItems.forEach(item => { cloudMap[item.id] = item; });

            // 用云端数据丰富本地记录
            const enrichedItems = acquiredItems.map(localItem => {
                return cloudMap[localItem.id] || localItem;
            }).filter(Boolean);

            // 使用 createItemCard 渲染（与 published 一致）
            const listDiv = document.createElement("div");
            listDiv.style.cssText = "display:flex;flex-direction:column;gap:10px;";

            enrichedItems.forEach(item => {
                const card = createItemCard(item, currentUser, "acquired");
                listDiv.appendChild(card);
            });

            domElement.innerHTML = "";
            domElement.appendChild(listDiv);

        } catch (e) {
            console.warn("获取云端资源失败，使用本地缓存:", e);
            // 网络失败时也用 createItemCard 渲染本地数据
            const listDiv = document.createElement("div");
            listDiv.style.cssText = "display:flex;flex-direction:column;gap:10px;";
            acquiredItems.forEach(item => {
                const card = createItemCard(item, currentUser, "acquired");
                listDiv.appendChild(card);
            });
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
        }
        return;
    }

    // 📝 新增：我的任务列表
    if (tabId === "my_tasks") {
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 加载任务中...</div>";
        
        try {
            // 并行获取我发布的 + 我接的任务
            const [publishedRes, assignedRes] = await Promise.all([
                api.getMyTasks("publisher"),
                api.getMyTasks("assignee")
            ]);
            
            const publishedTasks = publishedRes.data || [];
            const assignedTasks = assignedRes.data || [];
            
            if (publishedTasks.length === 0 && assignedTasks.length === 0) {
                domElement.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>
                    <div style="font-size: 40px; margin-bottom: 10px;">📝</div>
                    <div>还没有任何任务记录</div>
                    <div style="font-size: 12px; color: #888; margin-top: 5px;">去任务榜发布或接受任务吧！</div>
                </div>`;
                return;
            }
            
            const statusColors = {
                open: "#4CAF50", in_progress: "#2196F3", submitted: "#FF9800",
                completed: "#9E9E9E", disputed: "#F44336", cancelled: "#757575"
            };
            const statusLabels = {
                open: "开放接单", in_progress: "进行中", submitted: "待验收",
                completed: "已完成", disputed: "争议中", cancelled: "已取消"
            };
            
            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";
            
            // 渲染我发布的任务
            if (publishedTasks.length > 0) {
                const sectionTitle = document.createElement("div");
                sectionTitle.style.cssText = "font-size: 13px; font-weight: bold; color: #FF9800; margin-bottom: 5px; padding: 5px 0;";
                sectionTitle.textContent = `📤 我发布的任务 (${publishedTasks.length})`;
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
                sectionTitle.textContent = `📥 我接的任务 (${assignedTasks.length})`;
                listDiv.appendChild(sectionTitle);
                
                assignedTasks.forEach(task => {
                    const taskDiv = createTaskItem(task, statusColors, statusLabels, currentUser);
                    listDiv.appendChild(taskDiv);
                });
            }
            
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
            
        } catch (e) {
            console.error("加载任务失败:", e);
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#F44336;'>任务加载失败</div>`;
        }
        return;
    }
    
    // 💳 P6支付增强：交易明细列表
    if (tabId === "transactions") {
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 加载交易记录中...</div>";
        
        try {
            // 并行获取任务统计、交易明细、打赏统计和销售统计
            const [statsRes, txRes, tipStatsRes, salesStatsRes] = await Promise.all([
                api.getTaskStats(currentUser.account),
                api.getTransactions(currentUser.account, 1, 30),
                api.getTipStats(currentUser.account).catch(() => ({ data: {} })),  // 新增，带容错
                api.getSalesStats(currentUser.account).catch(() => ({ data: {} }))  // 新增，带容错
            ]);
            
            const stats = statsRes.data || {};
            const transactions = txRes.data || [];
            const tipStats = tipStatsRes.data || {};
            const salesStats = salesStatsRes.data || {};
            
            const containerDiv = document.createElement("div");
            containerDiv.style.cssText = "display: flex; flex-direction: column; gap: 15px;";
            
            // 💰 销售统计卡片（放在最上方，与打赏统计样式一致）
            const salesStatsCard = document.createElement("div");
            salesStatsCard.style.cssText = "background: linear-gradient(135deg, #2a2a2a, #1a1a1a); border-radius: 12px; padding: 15px; border: 1px solid #444; margin-bottom: 15px;";
            salesStatsCard.innerHTML = `
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 12px;">💰 ${t('profile.sales_stats') || '销售统计'}</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div style="text-align: center; padding: 10px; background: rgba(76,175,80,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #4CAF50;">+${salesStats.total_sales || 0}</div>
                        <div style="font-size: 11px; color: #888;">${t('profile.sales_income') || '销售收入'}</div>
                    </div>
                    <div style="text-align: center; padding: 10px; background: rgba(244,67,54,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #F44336;">-${salesStats.total_purchase || 0}</div>
                        <div style="font-size: 11px; color: #888;">${t('profile.purchase_expense') || '购买支出'} (${salesStats.purchase_count || 0}${t('profile.transactions_unit') || '笔'})</div>
                    </div>
                    <div style="text-align: center; padding: 10px; background: rgba(33,150,243,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #2196F3;">${(salesStats.net_sales || 0) > 0 ? '+' : ''}${salesStats.net_sales || 0}</div>
                        <div style="font-size: 11px; color: #888;">${t('profile.net_sales') || '净销售'}</div>
                    </div>
                </div>
            `;
            containerDiv.appendChild(salesStatsCard);
            
            // 📊 任务收益统计卡片
            const statsCard = document.createElement("div");
            statsCard.style.cssText = "background: linear-gradient(135deg, #2a2a2a, #1a1a1a); border-radius: 12px; padding: 15px; border: 1px solid #444;";
            statsCard.innerHTML = `
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 12px;">📊 任务收益统计</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div style="text-align: center; padding: 10px; background: rgba(76,175,80,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #4CAF50;">+${stats.total_income || 0}</div>
                        <div style="font-size: 11px; color: #888;">任务收入 (${stats.income_count || 0}笔)</div>
                    </div>
                    <div style="text-align: center; padding: 10px; background: rgba(244,67,54,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #F44336;">-${stats.total_payment || 0}</div>
                        <div style="font-size: 11px; color: #888;">任务支出 (${stats.payment_count || 0}笔)</div>
                    </div>
                    <div style="text-align: center; padding: 10px; background: rgba(33,150,243,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #2196F3;">${stats.net_earnings > 0 ? '+' : ''}${stats.net_earnings || 0}</div>
                        <div style="font-size: 11px; color: #888;">净收益</div>
                    </div>
                </div>
            `;
            containerDiv.appendChild(statsCard);
            
            // 🎁 打赏统计卡片
            const tipStatsCard = document.createElement("div");
            tipStatsCard.style.cssText = "background: linear-gradient(135deg, #2a2a2a, #1a1a1a); border-radius: 12px; padding: 15px; border: 1px solid #444; margin-bottom: 15px;";
            tipStatsCard.innerHTML = `
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 12px;">🎁 ${t('profile.tip_stats') || '打赏统计'}</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div style="text-align: center; padding: 10px; background: rgba(76,175,80,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #4CAF50;">+${tipStats.total_tip_in || 0}</div>
                        <div style="font-size: 11px; color: #888;">${t('profile.tip_received') || '收到打赏'} (${tipStats.tip_in_count || 0}${t('profile.transactions_unit') || '笔'})</div>
                    </div>
                    <div style="text-align: center; padding: 10px; background: rgba(244,67,54,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #F44336;">-${tipStats.total_tip_out || 0}</div>
                        <div style="font-size: 11px; color: #888;">${t('profile.tip_sent') || '打赏支出'} (${tipStats.tip_out_count || 0}${t('profile.transactions_unit') || '笔'})</div>
                    </div>
                    <div style="text-align: center; padding: 10px; background: rgba(33,150,243,0.1); border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: bold; color: #2196F3;">${(tipStats.net_tips || 0) > 0 ? '+' : ''}${tipStats.net_tips || 0}</div>
                        <div style="font-size: 11px; color: #888;">${t('profile.net_tips') || '净打赏'}</div>
                    </div>
                </div>
            `;
            containerDiv.appendChild(tipStatsCard);
            
            // 📝 交易明细列表
            const txListDiv = document.createElement("div");
            txListDiv.style.cssText = "display: flex; flex-direction: column; gap: 8px;";
            
            if (transactions.length === 0) {
                txListDiv.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>
                    <div style="font-size: 32px; margin-bottom: 10px;">💰</div>
                    <div>暂无交易记录</div>
                </div>`;
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
            console.error("加载交易记录失败:", e);
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#F44336;'>交易记录加载失败</div>`;
        }
        return;
    }
    
    // 💬 新增：我的帖子列表
    if (tabId === "my_posts") {
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 加载帖子中...</div>";
        
        try {
            const res = await api.getMyPosts();
            const posts = res.data || [];
            
            if (posts.length === 0) {
                domElement.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>
                    <div style="font-size: 40px; margin-bottom: 10px;">💬</div>
                    <div>还没有发布任何帖子</div>
                    <div style="font-size: 12px; color: #888; margin-top: 5px;">去讨论区分享你的想法吧！</div>
                </div>`;
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
            console.error("加载帖子失败:", e);
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#F44336;'>帖子加载失败</div>`;
        }
        return;
    }

    const cacheKey = `ProfileList_${userData.account}_${tabId}`;
    const cachedStr = localStorage.getItem(cacheKey);
    
    const applyDOM = (items) => {
        domElement.innerHTML = ""; 
        if (items.length === 0) { domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>暂无记录</div>`; return; }
        items.forEach(item => { domElement.appendChild(createItemCard(item, currentUser)); });
    };

    if (cachedStr) {
        try { applyDOM(JSON.parse(cachedStr)); } catch(e) { localStorage.removeItem(cacheKey); }
    } else {
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 正在拉取数据...</div>"; 
    }

    try {
        const [toolsRes, appsRes] = await Promise.all([ api.getItems("tool", "time", 100), api.getItems("app", "time", 100) ]);
        const allItems = [...(toolsRes.data || []), ...(appsRes.data || [])];
        let filteredItems = [];

        if (tabId === "published") filteredItems = allItems.filter(item => item.author === userData.account);
        else if (tabId === "liked") filteredItems = allItems.filter(item => item.liked_by && item.liked_by.includes(userData.account));

        const freshStr = JSON.stringify(filteredItems);
        if (freshStr !== cachedStr) {
            localStorage.setItem(cacheKey, freshStr);
            applyDOM(filteredItems);
        }
    } catch (error) { 
        if (!cachedStr) domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#F44336;'>数据加载失败</div>"; 
    }
}

/**
 * 📝 创建任务卡片项
 */
function createTaskItem(task, statusColors, statusLabels, currentUser) {
    const taskDiv = document.createElement("div");
    Object.assign(taskDiv.style, {
        padding: "12px",
        background: "#2a2a2a",
        borderRadius: "8px",
        border: "1px solid #444",
        cursor: "pointer",
        transition: "0.2s"
    });
    
    const statusColor = statusColors[task.status] || "#666";
    const statusLabel = statusLabels[task.status] || "未知";
    
    taskDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="background: ${statusColor}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${statusLabel}</span>
            <span style="color: #FF9800; font-weight: bold;">💰 ${task.total_price} 积分</span>
        </div>
        <div style="font-weight: bold; color: #eee; margin-bottom: 6px; font-size: 14px;">${escapeHtml(task.title)}</div>
        <div style="font-size: 11px; color: #888; display: flex; gap: 15px;">
            <span>✈️ ${formatDeadline(task.deadline)}</span>
            ${task.status === "open" ? `<span>👥 ${(task.applicants || []).length}人申请</span>` : ""}
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
 * 🔒 HTML转义
 */
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 📅 格式化截止日期
 */
function formatDeadline(deadline) {
    if (!deadline) return "无限期";
    try {
        const date = new Date(deadline);
        const now = new Date();
        const diff = date - now;
        if (diff < 0) return "已截止";
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return "今天截止";
        if (days === 1) return "明天截止";
        if (days < 7) return `${days}天后`;
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
        background: "#2a2a2a",
        borderRadius: "8px",
        border: "1px solid #444",
        cursor: "pointer",
        transition: "all 0.2s"
    });
    
    // 截取内容摘要
    const contentPreview = (post.content || "").slice(0, 80) + ((post.content || "").length > 80 ? "..." : "");
    
    // 格式化时间
    const timeStr = formatPostTime(post.created_at);
    
    // 图片数量
    const imageCount = (post.images || []).length;
    
    postDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            ${imageCount > 0 ? `
                <img src="${post.images[0]}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; flex-shrink: 0;">
            ` : ""}
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; color: #fff; margin-bottom: 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${escapeHtml(contentPreview)}
                </div>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: #888;">
                    <span>❤️ ${post.like_count || 0}</span>
                    <span>💬 ${post.comment_count || 0}</span>
                    ${imageCount > 1 ? `<span>🖼️ ${imageCount}张</span>` : ""}
                    <span style="margin-left: auto;">${timeStr}</span>
                </div>
            </div>
        </div>
    `;
    
    // 悬停效果
    postDiv.onmouseover = () => { postDiv.style.borderColor = "#9C27B0"; postDiv.style.transform = "translateX(2px)"; };
    postDiv.onmouseout = () => { postDiv.style.borderColor = "#444"; postDiv.style.transform = "translateX(0)"; };
    
    // 点击进入详情
    postDiv.onclick = () => {
        import("../post/帖子详情组件.js").then(module => {
            const view = module.createPostDetailView(post.id, currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(err => {
            console.error("加载帖子详情组件失败:", err);
            showToast("加载帖子详情失败", "error");
        });
    };
    
    return postDiv;
}

/**
 * 🕒 格式化帖子时间
 */
function formatPostTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 💳 创建交易记录卡片
 * 根据交易类型展示不同的详细信息
 */
function createTransactionCard(tx) {
    const txDiv = document.createElement("div");
    txDiv.style.cssText = "padding: 12px; background: #2a2a2a; border-radius: 8px; border: 1px solid #444; display: flex; justify-content: space-between; align-items: flex-start;";
    
    const isPositive = tx.amount > 0;
    const amountColor = isPositive ? '#4CAF50' : '#F44336';
    const timeStr = tx.created_at ? new Date(tx.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    
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
                detailLine = `⏳ ${t('tx.withdraw_pending') || '待打款'}`;
            } else if (tx.withdraw_status === 'completed') {
                detailLine = `✅ ${t('tx.withdraw_completed') || '已完成'}`;
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
            description = t('tx.recharge_desc') || '支付宝充值';
            break;
            
        case 'REFUND':
            // 退款
            description = tx.item_title || '';
            break;
            
        case 'WITHDRAW_FEE':
            // 提现手续费
            description = t('tx.withdraw_fee_desc') || '提现手续费';
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
        ? `<div style="font-size: 11px; color: #888; text-align: right;">${t('tx.net_amount') || '实到'}: ${tx.net_amount}</div>`
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
                    ${detailText ? `<div style="font-size: 11px; color: #888; margin-top: 3px;">${detailText}</div>` : ''}
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
                    <div style="font-size: 11px; color: #888;">${timeStr}${tx.related_account ? ' · ' + tx.related_account.substring(0, 8) + '...' : ''}</div>
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
        'WITHDRAW': { icon: '💸', title: t('tx.withdraw') || '提现申请' },
        'TIP_IN': { icon: '🎁', title: t('tx.tip_in') || '收到打赏' },
        'TIP_OUT': { icon: '🎁', title: t('tx.tip_out') || '打赏支出' },
        'PURCHASE': { icon: '🛒', title: t('tx.purchase') || '购买资源' },
        'TASK_DEPOSIT': { icon: '📋', title: t('tx.task_deposit') || '任务订金' },
        'TASK_PAYMENT': { icon: '📋', title: t('tx.task_payment') || '任务尾款' },
        'TASK_INCOME': { icon: '📋', title: t('tx.task_income') || '任务收入' },
        'TASK_FREEZE': { icon: '🔒', title: t('tx.task_freeze') || '任务冻结' },
        'TASK_REFUND': { icon: '↩️', title: t('tx.task_refund') || '任务退款' },
        'TASK_CANCEL_REFUND': { icon: '🔄', title: t('tx.task_cancel_refund') || '任务取消退款' },
        'RECHARGE': { icon: '💰', title: t('tx.recharge') || '充值' },
        'REFUND': { icon: '↩️', title: t('tx.refund') || '退款' },
        'WITHDRAW_FEE': { icon: '💸', title: t('tx.withdraw_fee') || '手续费' }
    };
    
    return configs[txType] || { icon: '💰', title: txType };
}