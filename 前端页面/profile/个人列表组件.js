// 前端页面/profile/个人列表组件.js
import { api } from "../core/网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { getAcquiredItems, checkItemStatus } from "../market/资源安装引擎.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { PLACEHOLDERS } from "../core/全局配置.js";

export async function renderProfileListContent(tabId, domElement, userData, currentUser, openOtherUserModalCb) {
    const isMe = currentUser && currentUser.account === userData.account;
    const privacy = userData.privacy || {};

    // 【修复】：从底层杜绝隐私被穿透抓取
    if (!isMe) {
        if ((tabId === "following" && privacy.follows) || (tabId === "liked" && privacy.likes)) {
            domElement.innerHTML = `<div style='text-align:center; padding: 30px; color:#888;'>🔒 ${t('profile.privacy_hidden')}</div>`;
            return;
        }
    }

    if (tabId === "following") {
        const followingList = userData.following || [];
        domElement.innerHTML = "";
        if (followingList.length === 0) {
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#666;'>${t('profile.no_following')}</div>`; return;
        }
        
        domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#888;'>⏳ ${t('profile.loading_users')}</div>`;

        try {
            // 【修复】：并发获取所有关注者的最新资料，彻底解决闪烁和 ID 显示问题
            const followingDetails = await Promise.all(
                followingList.map(acc => api.getUserProfile(acc).then(res => res.data).catch(() => ({ account: acc, name: acc })))
            );

            const listDiv = document.createElement("div");
            listDiv.style.display = "flex"; listDiv.style.flexDirection = "column"; listDiv.style.gap = "8px";
            
            followingDetails.forEach(user => {
                const item = document.createElement("div");
                Object.assign(item.style, { padding: "10px", background: "#2a2a2a", borderRadius: "6px", border: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center" });
                
                // 直接使用 user.name 渲染
                item.innerHTML = `<span class="follow-name" style="color: #4CAF50; font-weight: bold; cursor: pointer;">@${user.name || user.account}</span><button class="btn-view-user" data-acc="${user.account}" style="padding: 4px 10px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">${t('profile.homepage')}</button>`;
                
                item.querySelector('.btn-view-user').onclick = () => openOtherUserModalCb(user.account, currentUser);
                item.querySelector('span').onclick = () => openOtherUserModalCb(user.account, currentUser);
                listDiv.appendChild(item);
            });
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
        } catch (e) {
            domElement.innerHTML = `<div style='text-align:center; padding: 20px; color:#F44336;'>${t('profile.load_failed')}</div>`;
        }
        return;
    }

    // 🚀 新增：已获取的资源列表
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
        
        // 并发获取云端最新版本信息
        domElement.innerHTML = "<div style='text-align:center; padding: 20px; color:#888;'>⏳ 正在检查更新...</div>";
        
        try {
            const [toolsRes, appsRes] = await Promise.all([
                api.getItems("tool", "time", 200),
                api.getItems("app", "time", 200)
            ]);
            const allCloudItems = [...(toolsRes.data || []), ...(appsRes.data || [])];
            const cloudItemMap = {};
            allCloudItems.forEach(item => { cloudItemMap[item.id] = item; });
            
            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";
            
            acquiredItems.forEach(localItem => {
                const cloudItem = cloudItemMap[localItem.id];
                const status = checkItemStatus(localItem.id, cloudItem?.latest_version);
                
                const itemDiv = document.createElement("div");
                Object.assign(itemDiv.style, {
                    padding: "12px",
                    background: "#2a2a2a",
                    borderRadius: "8px",
                    border: "1px solid #444",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                });
                
                // 封面图
                const coverUrl = localItem.coverBase64 || PLACEHOLDERS.COVER;
                
                // 状态标签
                let statusBadge = "";
                let statusColor = "#4CAF50";
                if (status.hasUpdate) {
                    statusBadge = `<span style="background: #FF9800; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">${t('profile.update_available')}</span>`;
                    statusColor = "#FF9800";
                } else {
                    statusBadge = `<span style="background: #4CAF50; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${t('profile.installed')}</span>`;
                }
                
                // 类型标签
                const typeLabel = (localItem.type === "tool" || localItem.type === "recommend_tool") ? "🔧 工具" : "📱 应用";
                
                itemDiv.innerHTML = `
                    <img src="${coverUrl}" style="width: 60px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #555;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: bold; color: #eee; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${localItem.title}</span>
                            ${statusBadge}
                        </div>
                        <div style="font-size: 11px; color: #888; display: flex; gap: 10px;">
                            <span>${typeLabel}</span>
                            <span>👤 ${localItem.author || '未知'}</span>
                        </div>
                    </div>
                    <button class="btn-action" style="padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; font-weight: bold; background: ${statusColor}; color: #fff; white-space: nowrap;">
                        ${status.hasUpdate ? '⬆️ 更新' : '✅ 已安装'}
                    </button>
                `;
                
                // 点击按钮时打开详情页
                itemDiv.querySelector(".btn-action").onclick = () => {
                    if (cloudItem) {
                        window.dispatchEvent(new CustomEvent("comfy-open-detail", {
                            detail: { itemData: cloudItem, currentUser }
                        }));
                    } else {
                        showToast("该资源已下架或不可用", "warning");
                    }
                };
                
                // 点击卡片打开详情
                itemDiv.style.cursor = "pointer";
                itemDiv.onclick = (e) => {
                    if (e.target.classList.contains("btn-action")) return;
                    if (cloudItem) {
                        window.dispatchEvent(new CustomEvent("comfy-open-detail", {
                            detail: { itemData: cloudItem, currentUser }
                        }));
                    }
                };
                
                listDiv.appendChild(itemDiv);
            });
            
            domElement.innerHTML = "";
            domElement.appendChild(listDiv);
            
        } catch (e) {
            // 如果网络失败，仍然显示本地记录
            const listDiv = document.createElement("div");
            listDiv.style.display = "flex";
            listDiv.style.flexDirection = "column";
            listDiv.style.gap = "10px";
            
            acquiredItems.forEach(localItem => {
                const itemDiv = document.createElement("div");
                Object.assign(itemDiv.style, {
                    padding: "12px",
                    background: "#2a2a2a",
                    borderRadius: "8px",
                    border: "1px solid #444",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                });
                
                const coverUrl = localItem.coverBase64 || PLACEHOLDERS.COVER;
                const typeLabel = (localItem.type === "tool" || localItem.type === "recommend_tool") ? "🔧 工具" : "📱 应用";
                
                itemDiv.innerHTML = `
                    <img src="${coverUrl}" style="width: 60px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #555;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: bold; color: #eee; margin-bottom: 4px;">${localItem.title}</div>
                        <div style="font-size: 11px; color: #888; display: flex; gap: 10px;">
                            <span>${typeLabel}</span>
                            <span>👤 ${localItem.author || '未知'}</span>
                        </div>
                    </div>
                    <span style="background: #666; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px;">已安装</span>
                `;
                
                listDiv.appendChild(itemDiv);
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
            // 并行获取任务统计和交易明细
            const [statsRes, txRes] = await Promise.all([
                api.getTaskStats(currentUser.account),
                api.getTransactions(currentUser.account, 1, 30)
            ]);
            
            const stats = statsRes.data || {};
            const transactions = txRes.data || [];
            
            const containerDiv = document.createElement("div");
            containerDiv.style.cssText = "display: flex; flex-direction: column; gap: 15px;";
            
            // 📊 统计卡片
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
            
            // 📝 交易明细列表
            const txListDiv = document.createElement("div");
            txListDiv.style.cssText = "display: flex; flex-direction: column; gap: 8px;";
            
            if (transactions.length === 0) {
                txListDiv.innerHTML = `<div style='text-align:center; padding: 30px; color:#666;'>
                    <div style="font-size: 32px; margin-bottom: 10px;">💰</div>
                    <div>暂无交易记录</div>
                </div>`;
            } else {
                const txTypeLabels = {
                    'RECHARGE': { icon: '💵', label: '充值', color: '#4CAF50' },
                    'PURCHASE': { icon: '🛒', label: '购买', color: '#F44336' },
                    'TIP_OUT': { icon: '🎁', label: '打赏支出', color: '#FF9800' },
                    'TIP_IN': { icon: '🎁', label: '收到打赏', color: '#4CAF50' },
                    'WITHDRAW': { icon: '🏧', label: '提现', color: '#F44336' },
                    'WITHDRAW_FEE': { icon: '💸', label: '提现手续费', color: '#757575' },
                    'TASK_FREEZE': { icon: '❄️', label: '任务冻结', color: '#2196F3' },
                    'TASK_DEPOSIT': { icon: '💳', label: '订金支付', color: '#FF9800' },
                    'TASK_PAYMENT': { icon: '💳', label: '尾款支付', color: '#F44336' },
                    'TASK_INCOME': { icon: '💰', label: '任务收入', color: '#4CAF50' },
                    'TASK_REFUND': { icon: '🔄', label: '任务退款', color: '#9C27B0' }
                };
                
                transactions.forEach(tx => {
                    const typeInfo = txTypeLabels[tx.tx_type] || { icon: '💰', label: tx.tx_type, color: '#888' };
                    const isPositive = tx.amount > 0;
                    const amountColor = isPositive ? '#4CAF50' : '#F44336';
                    const timeStr = tx.created_at ? new Date(tx.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                    
                    const txDiv = document.createElement("div");
                    txDiv.style.cssText = "padding: 12px; background: #2a2a2a; border-radius: 8px; border: 1px solid #444; display: flex; justify-content: space-between; align-items: center;";
                    txDiv.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 20px;">${typeInfo.icon}</span>
                            <div>
                                <div style="font-weight: bold; color: #eee; font-size: 13px;">${typeInfo.label}</div>
                                <div style="font-size: 11px; color: #888;">${timeStr}${tx.related_account ? ' · ' + tx.related_account.substring(0, 8) + '...' : ''}</div>
                            </div>
                        </div>
                        <div style="font-weight: bold; font-size: 15px; color: ${amountColor};">
                            ${isPositive ? '+' : ''}${tx.amount}
                        </div>
                    `;
                    txListDiv.appendChild(txDiv);
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