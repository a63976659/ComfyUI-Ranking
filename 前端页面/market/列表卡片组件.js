// 前端页面/market/列表卡片组件.js
import { createCommentSection, setupToggleButton, createRatingStars } from "../social/评论与互动组件.js";
import { api } from "../core/网络请求API.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { recordView } from "../components/互动工具函数.js";
import { renderItemTrendChart } from "../components/图表渲染组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { setupResourceInstall, checkItemStatus } from "./资源安装引擎.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { openTipModal } from "../profile/个人中心_赞赏组件.js";
import { renderTipBoardHTML, isMaxTipLevel } from "../components/打赏等级工具.js";
import { lazyLoadImages } from "../components/性能优化工具.js";
import { t } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR, CACHE } from "../core/全局配置.js";

export function createItemCard(itemData, currentUser = null, contextType = null) {
    const card = document.createElement("div");
    card.setAttribute("data-item-id", itemData.id);
    Object.assign(card.style, {
        backgroundColor: "var(--comfy-input-bg, #2b2b2b)", borderRadius: "8px", padding: "10px", 
        marginBottom: "12px", border: "1px solid #444", color: "#fff", fontFamily: "sans-serif"
    });

    // 🚀 核心新增：初始渲染时，动态计算真实的有效评论数（过滤软删除的废弃数据）
    const calcActiveComments = (data) => {
        if (!data || !Array.isArray(data)) return 0;
        return data.reduce((acc, c) => {
            const parentCnt = c.isDeleted ? 0 : 1;
            const repliesCnt = (c.replies || []).filter(r => !r.isDeleted).length;
            return acc + parentCnt + repliesCnt;
        }, 0);
    };
    const initialCommentCount = itemData.commentsData ? calcActiveComments(itemData.commentsData) : (itemData.comments || 0);
    
    // 🚀 检查插件安装状态（用于显示更新徽章）
    const installStatus = checkItemStatus(itemData.id, itemData.latest_version);
    const updateBadgeHtml = installStatus.hasUpdate 
        ? `<span style="margin-left: 6px; background: linear-gradient(135deg, #FF9800, #F44336); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: bold; animation: pulse 2s infinite;">🔄 ${t('market.update_available')}</span>` 
        : '';

    const summaryView = document.createElement("div");
    summaryView.className = "item-summary";
    summaryView.style.cursor = "pointer";
    
    // 🚀 核心修改：为评论计数的 span 加上专属的 class，并填入过滤后的真实数量
    // 🚀 布局重构：第1行标题+使用次数，第2行描述，第3行互动数据+发布者信息
    summaryView.innerHTML = `
        <!-- 第1行: 标题 + 使用次数 -->
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
            <div style="font-weight: bold; font-size: 14px; color: #4CAF50; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${itemData.title}${updateBadgeHtml}</div>
            <span style="margin-left: auto; font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px;">
                <span data-stat="uses" style="display: flex; align-items: center; gap: 2px;">📥 ${itemData.uses || 0}</span>
                <span data-stat="views" style="display: flex; align-items: center; gap: 2px;">🔥 ${itemData.views || 0}</span>
            </span>
        </div>
        <!-- 第2行: 描述 -->
        <div style="font-size: 12px; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px;">${itemData.shortDesc}</div>
        <!-- 第3行: 互动数据 + 发布者信息 -->
        <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; color: #888;">
            <span data-stat="likes">👍 ${itemData.likes || 0}</span> <span data-stat="favorites">🔖 ${itemData.favorites || 0}</span> <span class="card-comment-count">💬 ${initialCommentCount}</span>
            <span style="margin-left: auto; display: flex; align-items: center; gap: 4px; cursor: pointer;" class="card-author-info">
                <img class="card-author-avatar" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='%23333' width='40' height='40' rx='20'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23666' font-size='16'%3E%3F%3C/text%3E%3C/svg%3E" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;">
                <span class="card-author-name" style="font-size: 12px; color: #aaa; transition: color 0.2s;">${itemData.author || '未知'}</span>
            </span>
        </div>
    `;

    // ⭐ 摘要区紧凑评分（插入到互动数据与作者信息之间）
    const ratingCompact = createRatingStars({
        ratingData: {
            rating_avg: itemData.rating_avg,
            rating_count: itemData.rating_count,
            rating_dist: itemData.rating_dist,
            rated_by: itemData.rated_by
        },
        compact: true
    });
    ratingCompact.className = "card-rating-compact";
    const authorInfoInSummary = summaryView.querySelector(".card-author-info");
    if (authorInfoInSummary && authorInfoInSummary.parentNode) {
        authorInfoInSummary.parentNode.insertBefore(ratingCompact, authorInfoInSummary);
    }

    // 🚀 添加发布者信息异步加载逻辑（使用SWR缓存机制）
    const authorInfoEl = summaryView.querySelector('.card-author-info');
    const authorAvatarEl = summaryView.querySelector('.card-author-avatar');
    const authorNameEl = summaryView.querySelector('.card-author-name');

    if (authorInfoEl && itemData.author) {
        // 点击跳转到发布者主页
        authorInfoEl.onclick = (e) => {
            e.stopPropagation();
            openOtherUserProfileModal(itemData.author, currentUser);
        };
        
        // hover效果：发布者名称颜色变亮
        authorInfoEl.onmouseenter = () => {
            if (authorNameEl) authorNameEl.style.color = '#4CAF50';
        };
        authorInfoEl.onmouseleave = () => {
            if (authorNameEl) authorNameEl.style.color = '#aaa';
        };
        
        // 同步读取缓存，0延迟渲染
        const cached = getCachedProfile(itemData.author);
        if (cached) {
            if (cached.name) authorNameEl.textContent = cached.name;
            if (cached.avatar) authorAvatarEl.src = cached.avatar;
        } else {
            authorNameEl.textContent = itemData.author;
        }
        
        // SWR后台校对，自动更新DOM和缓存
        getProfileWithSWR(itemData.author, api.getUserProfile, (profile) => {
            if (profile.name) authorNameEl.textContent = profile.name;
            if (profile.avatar) authorAvatarEl.src = profile.avatar;
        });
    }

    const detailView = document.createElement("div");
    Object.assign(detailView.style, { display: "none", marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #555" });

    const authorInfo = document.createElement("div");
    Object.assign(authorInfo.style, { fontSize: "12px", color: "#ccc", marginBottom: "10px" });
    
    // 🔄 P7后悔模式：检查是否有待生效价格
    let priceHtml = '';
    if (itemData.pending_price !== null && itemData.pending_price !== undefined && itemData.pending_price_effective_at) {
        const effectiveTime = new Date(itemData.pending_price_effective_at);
        const now = new Date();
        if (effectiveTime > now) {
            const hoursLeft = Math.ceil((effectiveTime - now) / (1000 * 60 * 60));
            priceHtml = `
                <span style="float: right;">
                    <span style="color: #FF9800;">💰 ${itemData.price > 0 ? itemData.price + ` ${t('market.points')}` : t('market.free')}</span>
                    <span style="margin-left: 5px; font-size: 10px; color: #F44336; background: rgba(244,67,54,0.15); padding: 1px 4px; border-radius: 3px;" title="${hoursLeft}${t('time.hours_later')}">
                        → ${itemData.pending_price}${t('market.points')}
                    </span>
                </span>
            `;
        } else {
            priceHtml = `<span style="float: right; color: #FF9800;">💰 ${itemData.pending_price > 0 ? itemData.pending_price + ` ${t('market.points')}` : t('market.free')}</span>`;
        }
    } else {
        priceHtml = `<span style="float: right; color: #FF9800;">💰 ${itemData.price > 0 ? itemData.price + ` ${t('market.points')}` : t('market.free')}</span>`;
    }
    
    authorInfo.innerHTML = `${t('market.author')}: <span class="author-name-link" style="color: #2196F3; cursor: pointer; text-decoration: underline;">${t('common.loading')}...</span> ${priceHtml}`;
    detailView.appendChild(authorInfo);

    const nameDOM = authorInfo.querySelector('.author-name-link');
    
    // 使用SWR缓存机制加载作者名称
    const cached = getCachedProfile(itemData.author);
    if (cached && cached.name) {
        nameDOM.textContent = cached.name;
    }
    
    getProfileWithSWR(itemData.author, api.getUserProfile, (profile) => {
        if (profile.name) nameDOM.textContent = profile.name;
    });
    
    nameDOM.onclick = (e) => { e.stopPropagation(); openOtherUserProfileModal(itemData.author, currentUser); };

    // 原创内容标识
    if (itemData.is_original) {
        const originalBadge = document.createElement("div");
        Object.assign(originalBadge.style, {
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "4px 12px", background: "linear-gradient(135deg, #FF6B35, #FF8F00)",
            borderRadius: "12px", fontSize: "11px", color: "#fff", fontWeight: "500",
            marginBottom: "10px"
        });
        originalBadge.textContent = "🎨 原创内容";
        detailView.appendChild(originalBadge);
    }

    // 支持退款标识（仅工具和应用类型显示，且允许退款时）
    if (itemData.allow_refund !== false && (itemData.type === 'tool' || itemData.type === 'app')) {
        const refundBadge = document.createElement("div");
        Object.assign(refundBadge.style, {
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "4px 12px", background: "linear-gradient(135deg, #4CAF50, #2E7D32)",
            borderRadius: "12px", fontSize: "11px", color: "#fff", fontWeight: "500",
            marginBottom: "10px", marginLeft: "8px"
        });
        refundBadge.textContent = `🛡️ ${t('item.refundable')}`;
        detailView.appendChild(refundBadge);
    }

    const actionArea = document.createElement("div");
    Object.assign(actionArea.style, { display: "flex", gap: "8px", marginBottom: "12px" });
    const btnLike = document.createElement("button");
    Object.assign(btnLike.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    const btnFav = document.createElement("button");
    Object.assign(btnFav.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    
    // 🚀 根据安装状态显示不同的按钮样式（installStatus 已在上方声明）
    const btnUse = document.createElement("button");
    
    if (installStatus.hasUpdate) {
        // 有更新可用
        Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#FF9800", border: "none", borderRadius: "4px", cursor: "pointer", color: "white", fontWeight: "bold" });
        btnUse.innerHTML = `♻️ ${t('market.update_available')}`;
    } else if (installStatus.installed) {
        // 已安装
        Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#4CAF50", border: "none", borderRadius: "4px", cursor: "pointer", color: "white", fontWeight: "bold" });
        btnUse.innerHTML = `✅ ${t('market.installed')}`;
    } else {
        // 未安装
        Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#2196F3", border: "none", borderRadius: "4px", cursor: "pointer", color: "white", fontWeight: "bold" });
        btnUse.innerHTML = `🚀 ${t('market.get_now')} ${itemData.uses ? '(' + itemData.uses + ')' : ''}`;
    }

    actionArea.appendChild(btnLike); actionArea.appendChild(btnFav); actionArea.appendChild(btnUse);
    detailView.appendChild(actionArea);

    // ⭐ 展开详情区完整评分组件（互动按钮栏下方、打赏榜单上方）
    const ratingSection = createRatingStars({
        ratingData: {
            rating_avg: itemData.rating_avg || 0,
            rating_count: itemData.rating_count || 0,
            rating_dist: itemData.rating_dist || {"1":0,"2":0,"3":0,"4":0,"5":0},
            rated_by: itemData.rated_by || {}
        },
        currentUser: currentUser,
        authorAccount: itemData.author,
        onRate: async (score) => {
            const res = await api.rateItem(itemData.id, score);
            if (res && res.status === "success") {
                itemData.rating_avg = res.rating_avg;
                itemData.rating_count = res.rating_count;
                itemData.rating_dist = res.rating_dist;
                if (!itemData.rated_by) itemData.rated_by = {};
                itemData.rated_by[currentUser.account] = { score: res.user_score, time: Date.now() / 1000 };

                // 同步更新摘要区紧凑评分
                const oldCompact = summaryView.querySelector(".card-rating-compact");
                if (oldCompact) {
                    const newCompact = createRatingStars({
                        ratingData: {
                            rating_avg: itemData.rating_avg,
                            rating_count: itemData.rating_count,
                            rating_dist: itemData.rating_dist,
                            rated_by: itemData.rated_by
                        },
                        compact: true
                    });
                    newCompact.className = "card-rating-compact";
                    oldCompact.parentNode.replaceChild(newCompact, oldCompact);
                }
            }
            return res;
        },
        compact: false
    });
    detailView.appendChild(ratingSection);

    const isLiked = currentUser && Array.isArray(itemData.liked_by) && itemData.liked_by.includes(currentUser.account);
    const isFav = currentUser && Array.isArray(itemData.favorited_by) && itemData.favorited_by.includes(currentUser.account);

    const handleInteraction = async (type, isActive) => {
        if (!currentUser) { showToast(`⚠️ ${t('feedback.login_required')}`, "warning"); throw new Error("User not logged in"); }
        await api.toggleInteraction(itemData.id, currentUser.account, type, isActive);
    };

    setupToggleButton(btnLike, isLiked, itemData.likes || 0, `👍 ${t('market.liked')}`, `👍 ${t('market.like')}`, "#FF5722", (isActive) => handleInteraction("like", isActive));
    setupToggleButton(btnFav, isFav, itemData.favorites || 0, `🔖 ${t('market.favorited')}`, `🔖 ${t('market.favorite')}`, "#FFC107", (isActive) => handleInteraction("favorite", isActive));

    const inlineStatusBox = document.createElement("div");
    Object.assign(inlineStatusBox.style, { display: "none", margin: "0 0 15px 0", padding: "12px", background: "#222", border: "1px solid #444", borderRadius: "6px", fontSize: "12px", lineHeight: "1.5" });
    detailView.appendChild(inlineStatusBox);
    setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox);

    const mediaArea = document.createElement("div");
    const chartContainerId = `chart-${Math.random().toString(36).substr(2, 9)}`;
    const chartHtml = `<div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📈 ${t('market.usage_trend')}</div><div id="${chartContainerId}" style="width: 100%; height: 160px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; margin-bottom: 12px;"></div>`;
    
    mediaArea.innerHTML = `
        ${chartHtml}
        ${getCoverSandboxHTML(itemData.imageUrls?.length > 0 ? itemData.imageUrls : itemData.coverUrl)}
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📝 ${t('market.full_description')}</div>
        <div style="background: #1e1e1e; padding: 10px; border-radius: 4px; font-size: 12px; color: #bbb; margin-bottom: 12px; max-height: 200px; overflow-y: auto; line-height: 1.6; border: 1px solid #333; word-wrap: break-word; white-space: pre-wrap;">${itemData.fullDesc}</div>
    `;
    detailView.appendChild(mediaArea);

    // 🚀 新增：赞赏贡献榜单与打赏按钮（带等级显示）
    const tipArea = document.createElement("div");
    Object.assign(tipArea.style, { marginBottom: "12px", padding: "12px", background: "#1e1e1e", border: "1px solid #333", borderRadius: "6px" });
    
    // 使用统一的打赏榜单渲染工具（带星星/月亮/太阳等级）
    const boardData = itemData.tip_board || [];
    const boardHtml = renderTipBoardHTML(boardData, 5, t('market.no_tips_yet'), "small");
    
    tipArea.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:bold; color:#E91E63;">💖 ${t('market.tip_board')} (TOP 5)</div>
            <button id="btn-tip-item-${itemData.id}" style="background:#E91E63; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">💰 ${t('market.tip')}</button>
        </div>
        ${boardHtml}
    `;
    detailView.appendChild(tipArea);
    
    // 🚀 绑定打赏按钮事件
    tipArea.querySelector(`#btn-tip-item-${itemData.id}`).onclick = (e) => {
        e.stopPropagation();
        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
        // 🐛 Bug修复：防御性校验，防止 itemId 为空
        if (!itemData.id) {
            console.warn('⚠️ 列表卡片: itemData.id 为空，已拦截无效打赏请求');
            return showToast("资源ID无效，无法打赏", "error");
        }
        openTipModal(currentUser, { account: itemData.author }, (newBalance) => {
            currentUser.balance = newBalance;
        }, itemData.id);
    };

    // 🔄 P7后悔模式：退款区域（仅在"我购买的"列表中显示）
    const refundArea = document.createElement("div");
    refundArea.id = `refund-area-${itemData.id}`;
    Object.assign(refundArea.style, { display: "none", marginBottom: "12px" });
    detailView.appendChild(refundArea);

    let isRendered = false;
    summaryView.onclick = async () => {
        const isHidden = detailView.style.display === "none";
        detailView.style.display = isHidden ? "block" : "none";

        if (isHidden && !isRendered) {
            renderItemTrendChart(detailView.querySelector(`#${chartContainerId}`), itemData);
            setupImageSandboxEvents(detailView);
            isRendered = true;

            // 🖼️ 详情区图片懒加载
            lazyLoadImages(detailView);

            // 🚀 恢复浏览量记录：工具、应用、推荐榜单的卡片展开即详情页，需要记录浏览量
            recordView(api.recordItemView, itemData.id, 'item', (result) => {
                if (result?.views !== undefined) {
                    const viewsEl = summaryView.querySelector('[data-stat="views"]');
                    if (viewsEl) viewsEl.innerHTML = `🔥 ${result.views}`;
                }
            });
            
            // 🔄 P7后悔模式：在"我购买的"列表中加载退款状态（仅当发布者允许退款时）
            if (contextType === "acquired" && currentUser && itemData.allow_refund !== false) {
                loadRefundStatus(refundArea, itemData, currentUser, card);
            }
        }
    };

    const commentsContainer = document.createElement("div");
    commentsContainer.style.height = "250px"; 
    
    // 🚀 核心修改：传入一个回调函数，当组件内部发送/删除留言时，外部的数字能实时响应刷新！
    // 🚀 P0安全修复：传递 itemData.author 作为 contentAuthor，使内容作者可以删除其内容下的评论
    const commentUI = createCommentSection(itemData.id, itemData.commentsData || [], currentUser, (newCount) => {
        const badge = summaryView.querySelector(".card-comment-count");
        if (badge) badge.innerText = `💬 ${newCount}`;
    }, itemData.author);
    
    commentsContainer.appendChild(commentUI);
    detailView.appendChild(commentsContainer);

    if (currentUser && currentUser.account === itemData.author) {
        const authorActionArea = document.createElement("div");
        Object.assign(authorActionArea.style, { display: "flex", gap: "10px", marginTop: "15px", paddingTop: "15px", borderTop: "1px dashed #555" });
        
        authorActionArea.innerHTML = `
            <div style="flex: 1; font-size: 12px; color: #FF9800; display: flex; align-items: center; font-weight: bold;">👑 ${t('market.creator_manage')}</div>
            <button id="btn-edit-item" style="padding: 6px 12px; background: #2196F3; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">✏️ ${t('market.edit_content')}</button>
            <button id="btn-del-item" style="padding: 6px 12px; background: #F44336; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">🗑️ ${t('market.delete_permanently')}</button>
        `;
        
        authorActionArea.querySelector("#btn-edit-item").onclick = (e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("comfy-route-edit-publish", { detail: { itemData, currentUser } }));
        };
        
        authorActionArea.querySelector("#btn-del-item").onclick = async (e) => {
            e.stopPropagation();
            if (await showConfirm(t('market.delete_confirm'))) {
                try {
                    await api.deleteItem(itemData.id, currentUser.account);
                    showToast(t('feedback.deleted'), "success");
                    window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload")); 
                } catch (err) {
                    showToast(`${t('feedback.delete_failed')}: ${err.message}`, "error");
                }
            }
        };
        detailView.appendChild(authorActionArea);
    }

    // 🖼️ 启用图片懒加载（跳过 data URL 和已处理的）
    lazyLoadImages(card);

    card.appendChild(summaryView);
    card.appendChild(detailView);
    return card;
}

// ==========================================
// 🔄 P7后悔模式：退款功能
// ==========================================

/**
 * 加载退款状态并渲染退款区域
 */
async function loadRefundStatus(refundArea, itemData, currentUser, card) {
    if (!refundArea || !currentUser) return;
    
    refundArea.style.display = "block";
    refundArea.innerHTML = `<div style="padding: 10px; color: #888; font-size: 12px;">⏳ 加载购买状态...</div>`;
    
    try {
        const statusRes = await api.getPurchaseStatus(currentUser.account, itemData.id);
        
        if (!statusRes.owned) {
            refundArea.innerHTML = '';
            refundArea.style.display = "none";
            return;
        }
        
        if (statusRes.can_refund) {
            const hoursLeft = statusRes.refund_hours_left;
            refundArea.innerHTML = `
                <div style="padding: 12px; background: rgba(255,152,0,0.1); border: 1px dashed #FF9800; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div style="font-size: 12px; color: #FF9800;">
                            🔄 后悔模式：还剩 <strong>${hoursLeft.toFixed(1)}</strong> 小时可申请退款
                        </div>
                        <button id="btn-refund-${itemData.id}" style="background: #FF5722; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
                            💸 申请退款
                        </button>
                    </div>
                    <div style="font-size: 11px; color: #888; margin-top: 8px;">
                        ⚠️ 退款后权限将被收回，已下载的文件将被删除，且 <strong>30天内禁止再次购买</strong> 此商品
                    </div>
                </div>
            `;
            
            const refundBtn = refundArea.querySelector(`#btn-refund-${itemData.id}`);
            if (refundBtn) {
                refundBtn.onclick = (e) => {
                    e.stopPropagation();
                    showRefundConfirm(itemData, currentUser, statusRes.price_paid, card);
                };
            }
        } else {
            refundArea.innerHTML = `
                <div style="padding: 10px; background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 6px; font-size: 12px; color: #4CAF50;">
                    ✅ 已购买此资源，退款窗口已过期
                </div>
            `;
        }
    } catch (e) {
        console.warn("获取购买状态失败:", e);
        refundArea.innerHTML = '';
        refundArea.style.display = "none";
    }
}

/**
 * 显示退款确认弹窗
 */
function showRefundConfirm(itemData, currentUser, pricePaid, card) {
    const overlay = document.createElement("div");
    overlay.id = "refund-confirm-overlay";
    Object.assign(overlay.style, {
        position: "fixed", top: "0", left: "0", right: "0", bottom: "0",
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: "10000"
    });
    
    overlay.innerHTML = `
        <div style="background: #1e2233; border-radius: 12px; padding: 25px; max-width: 420px; width: 90%; color: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #FF5722; display: flex; align-items: center; gap: 10px;">
                ⚠️ 确认退款
            </div>
            
            <div style="background: #2a2d3e; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="font-size: 14px; margin-bottom: 10px;">商品：<strong>${itemData.title || '未命名资源'}</strong></div>
                <div style="font-size: 14px; color: #4CAF50;">退款金额：<strong>${pricePaid}</strong> 积分</div>
            </div>
            
            <div style="background: rgba(255,87,34,0.1); border: 1px solid rgba(255,87,34,0.3); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <div style="font-size: 13px; color: #FF9800; line-height: 1.8;">
                    <div>🚨 <strong>退款后果：</strong></div>
                    <div style="margin-left: 20px; margin-top: 5px;">
                        • 您将失去此资源的访问权限<br>
                        • 已下载的文件将被自动删除<br>
                        • <strong style="color: #F44336;">30天内禁止再次购买此商品</strong>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="btn-cancel-refund" style="background: #555; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: 0.2s;" onmouseover="this.style.background='#666'" onmouseout="this.style.background='#555'">
                    取消
                </button>
                <button id="btn-confirm-refund" style="background: #FF5722; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#E64A19'" onmouseout="this.style.background='#FF5722'">
                    确认退款
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector("#btn-cancel-refund").onclick = () => overlay.remove();
    
    overlay.querySelector("#btn-confirm-refund").onclick = async () => {
        const confirmBtn = overlay.querySelector("#btn-confirm-refund");
        confirmBtn.disabled = true;
        confirmBtn.innerText = "处理中...";
        
        try {
            const res = await api.requestRefund(currentUser.account, itemData.id);
            if (res.status === "success") {
                // 清除本地购买记录
                const key = CACHE.LOCAL_KEYS.ACQUIRED_ITEMS;
                const acquiredItems = JSON.parse(localStorage.getItem(key) || '[]');
                const updated = acquiredItems.filter(i => i.id !== itemData.id);
                localStorage.setItem(key, JSON.stringify(updated));
                
                // 从DOM中移除卡片
                if (card && card.parentNode) {
                    card.remove();
                }
                
                overlay.innerHTML = `
                    <div style="background: #1e2233; border-radius: 12px; padding: 25px; max-width: 380px; width: 90%; color: #fff; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #4CAF50;">退款成功</div>
                        <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">
                            ${res.refund_amount} 积分已退还到您的账户<br>
                            <span style="color: #FF9800;">${res.ban_days}天内禁止再次购买此商品</span>
                        </div>
                        <button id="btn-close-refund" style="background: #4CAF50; color: #fff; border: none; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 14px;">
                            知道了
                        </button>
                    </div>
                `;
                overlay.querySelector("#btn-close-refund").onclick = () => overlay.remove();
                
                showToast("退款成功！积分已退还", "success");
            } else {
                showToast("退款失败：" + (res.detail || "未知错误"), "error");
                overlay.remove();
            }
        } catch (e) {
            showToast("退款请求失败：" + (e.message || "网络错误"), "error");
            overlay.remove();
        }
    };
}