// 前端页面/market/列表卡片组件.js
import { createCommentSection, setupToggleButton, createRatingStars, isValidRatingResponse } from "../social/评论与互动组件.js";
import { api, captureRequestSession } from "../core/网络请求API.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { recordView, escapeHtml } from "../components/互动工具函数.js";  // 🧹 P2归一：escapeHtml 局部副本已移除
import { renderItemTrendChart } from "../components/图表渲染组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { setupResourceInstall, checkItemStatus } from "./资源安装引擎.js";
import { showToast } from "../components/UI交互提示组件.js";
import { openTipModal } from "../profile/个人中心_赞赏组件.js";
import { renderTipBoardHTML, isMaxTipLevel } from "../components/打赏等级工具.js";
import { lazyLoadImages } from "../components/性能优化工具.js";
import { t } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR, IS_WEB_MODE } from "../core/全局配置.js";
import { getUser } from "../core/状态管理.js";
import { createPurchaseStatusScope, isValidPurchaseStatus } from "./购买状态生命周期.js";
import { showResourceDeleteDialog } from "./资源删除组件.js";
import { showResourceRefundDialog } from "./资源退款组件.js";

let nextCardId = 0;

/**
 * 生成价格显示HTML（含待生效价格提示）
 */
function _generatePriceHTML(itemData, t) {
    const formatPrice = (price) => price > 0 ? `${escapeHtml(price)} ${t('market.points')}` : t('market.free');

    if (itemData.pending_price !== null && itemData.pending_price !== undefined && itemData.pending_price_effective_at) {
        const effectiveTime = new Date(itemData.pending_price_effective_at);
        const now = new Date();
        if (effectiveTime > now) {
            const hoursLeft = Math.ceil((effectiveTime - now) / (1000 * 60 * 60));
            return `
                <span class="resource-detail__price">
                    <span>💰 ${formatPrice(itemData.price)}</span>
                    <span class="resource-detail__pending-price" title="${hoursLeft}${t('time.hours_later')}">
                        → ${escapeHtml(itemData.pending_price)}${t('market.points')}
                    </span>
                </span>
            `;
        } else {
            return `<span class="resource-detail__price">💰 ${formatPrice(itemData.pending_price)}</span>`;
        }
    } else {
        return `<span class="resource-detail__price">💰 ${formatPrice(itemData.price)}</span>`;
    }
}

/**
 * 使用SWR缓存机制加载作者资料并更新DOM
 * @param {string} account - 作者账号
 * @param {Object} callbacks - 回调集合 { onName, onAvatar, fallbackName }
 */
function _loadAuthorProfile(account, { onName, onAvatar, fallbackName } = {}) {
    if (!account) {
        onName?.(t('common.unknown_user'));
        return;
    }
    const cached = getCachedProfile(account);
    if (cached) {
        if (cached.name && onName) onName(cached.name);
        if (cached.avatar && onAvatar) onAvatar(cached.avatar);
    } else if (fallbackName && onName) {
        onName(fallbackName);
    }

    getProfileWithSWR(account, api.getUserProfile, (profile) => {
        if (!profile || typeof profile !== "object") return;
        if (profile.name && onName) onName(profile.name);
        if (profile.avatar && onAvatar) onAvatar(profile.avatar);
    });
}

export function createItemCard(itemData, currentUser = null, contextType = null) {
    const card = document.createElement("div");
    const ratingMatches = captureRequestSession();
    const ratingAccount = currentUser?.account || null;
    const ratingCurrent = () => card.isConnected && ratingMatches() && (getUser()?.account || null) === ratingAccount;
    const cardId = `ranking-resource-${++nextCardId}`;
    card.className = "ranking-item-card";
    card.setAttribute("data-item-id", itemData.id);

    // 🚀 核心新增：初始渲染时，动态计算真实的有效评论数（过滤软删除的废弃数据）
    const calcActiveComments = (data) => {
        if (!data || !Array.isArray(data)) return 0;
        return data.reduce((acc, c) => {
            if (!c || typeof c !== "object" || Array.isArray(c)) return acc;
            const parentCnt = c.isDeleted ? 0 : 1;
            const repliesCnt = Array.isArray(c.replies)
                ? c.replies.filter(r => r && typeof r === "object" && !Array.isArray(r) && !r.isDeleted).length
                : 0;
            return acc + parentCnt + repliesCnt;
        }, 0);
    };
    const initialCommentCount = itemData.commentsData ? calcActiveComments(itemData.commentsData) : (itemData.comments || 0);
    
    // 🚀 检查插件安装状态（用于显示更新徽章）
    // 徽章作为标题行的独立 flex 项（flex: none），不再追加在标题文本之后，
    // 避免标题容器的 overflow: hidden + ellipsis 在长标题时把徽章一并裁掉
    const installStatus = checkItemStatus(itemData.id, itemData.latest_version);
    const updateBadgeHtml = installStatus.hasUpdate 
        ? `<span class="card-update-badge">🔄 ${t('market.update_available')}</span>`
        : '';

    const summaryView = document.createElement("div");
    summaryView.className = "item-summary";
    
    // 🚀 核心修改：为评论计数的 span 加上专属的 class，并填入过滤后的真实数量
    // 🚀 布局重构：第1行标题+使用次数，第2行描述，第3行互动数据+发布者信息
    summaryView.innerHTML = `
        <!-- 第1行: 标题 + 更新徽章 + 使用次数 -->
        <div class="card-summary__title-row">
            <button type="button" id="${cardId}-toggle" class="card-summary__title card-summary__toggle" aria-expanded="false" aria-controls="${cardId}-details">${escapeHtml(itemData.title || t('item.untitled'))}</button>
            ${updateBadgeHtml}
            <span class="card-summary__top-stats">
                <span data-stat="uses" class="card-summary__stat">📥 ${escapeHtml(itemData.uses || 0)}</span>
                <span data-stat="views" class="card-summary__stat">🔥 ${escapeHtml(itemData.views || 0)}</span>
            </span>
        </div>
        <!-- 第2行: 描述 -->
        <div class="card-summary__description">${escapeHtml(itemData.shortDesc)}</div>
        <!-- 第3行: 互动数据 + 发布者信息 -->
        <div class="card-summary__footer">
            <span data-stat="likes">👍 ${escapeHtml(itemData.likes || 0)}</span> <span data-stat="favorites">🔖 ${escapeHtml(itemData.favorites || 0)}</span> <span class="card-comment-count">💬 ${escapeHtml(initialCommentCount)}</span>
            <button type="button" class="card-author-info card-summary__author" ${itemData.author ? '' : 'disabled'}>
                <img class="card-author-avatar card-summary__avatar" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='%23333' width='40' height='40' rx='20'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23666' font-size='16'%3E%3F%3C/text%3E%3C/svg%3E">
                <span class="card-author-name card-summary__author-name">${escapeHtml(itemData.author || t('common.unknown_user'))}</span>
            </button>
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
    ratingCompact.classList.add("card-rating-compact");
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
        
        // 使用统一辅助函数加载作者资料
        _loadAuthorProfile(itemData.author, {
            onName: (name) => { authorNameEl.textContent = name; },
            onAvatar: (avatar) => { authorAvatarEl.src = avatar; },
            fallbackName: itemData.author
        });
    }

    const detailView = document.createElement("div");
    detailView.id = `${cardId}-details`;
    detailView.hidden = true;
    detailView.setAttribute("role", "region");
    detailView.setAttribute("aria-labelledby", `${cardId}-toggle`);
    detailView.className = "resource-detail";
    detailView.style.display = "none";

    const authorInfo = document.createElement("div");
    authorInfo.className = "resource-detail__author";
    
    // 🔄 P7后悔模式：检查是否有待生效价格
    const priceHtml = _generatePriceHTML(itemData, t);
    
    authorInfo.innerHTML = `${t('market.author')}: <button type="button" class="author-name-link card-author-link" ${itemData.author ? '' : 'disabled'}>${t('common.loading')}...</button> ${priceHtml}`;
    detailView.appendChild(authorInfo);

    const nameDOM = authorInfo.querySelector('.author-name-link');
    
    // 使用统一辅助函数加载作者名称
    _loadAuthorProfile(itemData.author, {
        onName: (name) => { nameDOM.textContent = name; }
    });
    
    nameDOM.onclick = (e) => { e.stopPropagation(); openOtherUserProfileModal(itemData.author, currentUser); };

    // 原创内容标识
    if (itemData.is_original) {
        const originalBadge = document.createElement("div");
        originalBadge.className = "resource-detail__badge resource-detail__badge--original";
        originalBadge.textContent = "🎨 " + t('publish.mark_original');
        detailView.appendChild(originalBadge);
    }

    // 支持退款标识（仅工具、Skill和应用类型显示，且允许退款时）
    if (itemData.allow_refund !== false && (itemData.type === 'tool' || itemData.type === 'skill' || itemData.type === 'app')) {
        const refundBadge = document.createElement("div");
        refundBadge.className = "resource-detail__badge resource-detail__badge--refundable";
        refundBadge.textContent = `🛡️ ${t('item.refundable')}`;
        detailView.appendChild(refundBadge);
    }

    const actionArea = document.createElement("div");
    actionArea.className = "resource-detail__actions";
    const btnLike = document.createElement("button");
    btnLike.type = "button";
    const btnFav = document.createElement("button");
    btnFav.type = "button";
    
    // 🚀 根据安装状态显示不同的按钮样式（installStatus 已在上方声明）
    const btnUse = document.createElement("button");
    btnUse.type = "button";
    btnUse.className = "resource-detail__button resource-detail__use";
    
    if (installStatus.hasUpdate) {
        // 有更新可用
        btnUse.classList.add("resource-detail__button--warning");
        btnUse.innerHTML = `♻️ ${t('market.update_available')}`;
    } else if (installStatus.installed) {
        // 已安装
        btnUse.classList.add("resource-detail__button--success");
        btnUse.innerHTML = `✅ ${t('market.installed')}`;
    } else {
        // 未安装
        btnUse.classList.add("resource-detail__button--primary");
        btnUse.textContent = `🚀 ${t('market.get_now')} ${itemData.uses ? '(' + itemData.uses + ')' : ''}`;
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
        isCurrent: ratingCurrent,
        onRate: async (score, requestContext) => {
            const current = () => ratingCurrent() && (!requestContext || requestContext.isCurrent());
            if (!current()) return null;
            const res = await api.rateItem(itemData.id, score);
            if (!current()) return null;
            if (isValidRatingResponse(res, score)) {
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
                    newCompact.classList.add("card-rating-compact");
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
        if (!currentUser?.account) {
            showToast(t('feedback.login_required'), "warning");
            return { status: "cancelled" };
        }
        const response = await api.toggleInteraction(itemData.id, currentUser.account, type, isActive);
        if (response?.status === "success" && Number.isSafeInteger(response.new_count) && response.new_count >= 0) {
            const membershipKey = type === "like" ? "liked_by" : "favorited_by";
            const countKey = type === "like" ? "likes" : "favorites";
            const previousMembers = Array.isArray(itemData[membershipKey]) ? itemData[membershipKey] : [];
            const members = previousMembers.filter(account => account !== currentUser.account);
            if (isActive) members.push(currentUser.account);
            itemData[membershipKey] = members;
            itemData[countKey] = response.new_count;
            const summaryCount = summaryView.querySelector(type === "like" ? '[data-stat="likes"]' : '[data-stat="favorites"]');
            if (summaryCount) summaryCount.textContent = `${type === "like" ? "👍" : "🔖"} ${response.new_count}`;
        }
        return response ?? { status: "error" };
    };

    setupToggleButton(btnLike, isLiked, itemData.likes || 0, `👍 ${t('market.liked')}`, `👍 ${t('market.like')}`, "#FF5722", (isActive) => handleInteraction("like", isActive));
    setupToggleButton(btnFav, isFav, itemData.favorites || 0, `🔖 ${t('market.favorited')}`, `🔖 ${t('market.favorite')}`, "#FFC107", (isActive) => handleInteraction("favorite", isActive));

    const inlineStatusBox = document.createElement("div");
    inlineStatusBox.className = "resource-detail__status";
    inlineStatusBox.style.display = "none";
    detailView.appendChild(inlineStatusBox);
    setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox);

    const mediaArea = document.createElement("div");
    const chartContainerId = `chart-${Math.random().toString(36).substr(2, 9)}`;
    const chartHtml = `<div class="resource-detail__heading">📈 ${t('market.usage_trend')}</div><div id="${chartContainerId}" class="resource-detail__chart"></div>`;
    
    mediaArea.innerHTML = `
        ${chartHtml}
        ${getCoverSandboxHTML(itemData.imageUrls?.length > 0 ? itemData.imageUrls : itemData.coverUrl)}
        <div class="resource-detail__heading">📝 ${t('market.full_description')}</div>
        <div class="resource-detail__description">${escapeHtml(itemData.fullDesc)}</div>
    `;
    detailView.appendChild(mediaArea);

    // 🚀 新增：赞赏贡献榜单与打赏按钮（带等级显示）
    const tipArea = document.createElement("div");
    tipArea.className = "resource-detail__tips";
    
    // 使用统一的打赏榜单渲染工具（带星星/月亮/太阳等级）
    const boardData = Array.isArray(itemData.tip_board)
        ? itemData.tip_board.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        : [];
    const boardHtml = renderTipBoardHTML(boardData, 5, t('market.no_tips_yet'), "small");
    
    tipArea.innerHTML = `
        <div class="resource-detail__tip-header">
            <div class="resource-detail__heading resource-detail__tip-heading">💖 ${t('market.tip_board')} (TOP 5)</div>
            <button type="button" class="btn-tip-item resource-detail__button resource-detail__button--tip">💰 ${t('market.tip')}</button>
        </div>
        ${boardHtml}
    `;
    detailView.appendChild(tipArea);
    
    // 🚀 绑定打赏按钮事件
    tipArea.querySelector('.btn-tip-item').onclick = (e) => {
        e.stopPropagation();
        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
        // 🐛 Bug修复：防御性校验，防止 itemId 为空
        if (!itemData.id) {
            console.warn('⚠️ 列表卡片: itemData.id 为空，已拦截无效打赏请求');
            return showToast(t('item.invalid_id_tip'), "error");
        }
        openTipModal(currentUser, { account: itemData.author }, undefined, itemData.id,
            { isCurrent: () => card.isConnected });
    };

    // 🔄 P7后悔模式：退款区域（仅在"我购买的"列表中显示）
    const refundArea = document.createElement("div");
    refundArea.id = `refund-area-${itemData.id}`;
    refundArea.className = "resource-detail__refund";
    refundArea.style.display = "none";
    detailView.appendChild(refundArea);

    let isRendered = false;
    let commentUI = null;
    const toggleButton = summaryView.querySelector('.card-summary__toggle');
    const setExpanded = (expanded) => {
        if (expanded) mountComments();
        commentUI?._setActive?.(expanded);
        if (!expanded && detailView.contains(document.activeElement)) toggleButton.focus();
        detailView.hidden = !expanded;
        detailView.style.display = expanded ? "block" : "none";
        toggleButton.setAttribute("aria-expanded", String(expanded));
    };
    summaryView.onclick = (event) => {
        // 摘要中的作者、评分等独立控件不触发折叠；标题按钮使用浏览器原生键盘行为。
        const control = event.target.closest('button, a, input, select, textarea, [role="button"]');
        if (control && control !== toggleButton) return;
        const isHidden = detailView.hidden;
        setExpanded(isHidden);

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
                    if (viewsEl) viewsEl.textContent = `🔥 ${result.views}`;
                }
            });
            
            // 🔄 P7后悔模式：在"我购买的"列表中加载退款状态（仅当发布者允许退款时）
            if (contextType === "acquired" && currentUser && itemData.allow_refund !== false) {
                loadRefundStatus(refundArea, itemData, currentUser, card);
            }
        }
    };
    detailView.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        setExpanded(false);
        toggleButton.focus();
    });

    const commentsContainer = document.createElement("div");
    commentsContainer.className = "resource-detail__comments";
    
    // 🚀 核心修改：传入一个回调函数，当组件内部发送/删除留言时，外部的数字能实时响应刷新！
    // 🚀 P0安全修复：传递 itemData.author 作为 contentAuthor，使内容作者可以删除其内容下的评论
    function mountComments() {
        if (commentUI) return;
        commentUI = createCommentSection(itemData.id, itemData.commentsData || [], currentUser, (newCount) => {
            const badge = summaryView.querySelector(".card-comment-count");
            if (badge) badge.innerText = `💬 ${newCount}`;
        }, itemData.author);
        commentsContainer.appendChild(commentUI);
    }
    detailView.appendChild(commentsContainer);

    if (currentUser && currentUser.account === itemData.author) {
        const authorActionArea = document.createElement("div");
        authorActionArea.className = "resource-detail__manage";
        
        authorActionArea.innerHTML = `
            <div class="resource-detail__manage-title">👑 ${t('market.creator_manage')}</div>
            ${IS_WEB_MODE ? '' : `<button type="button" id="btn-edit-item" class="resource-detail__button resource-detail__button--primary">✏️ ${t('market.edit_content')}</button>`}
            <button type="button" id="btn-del-item" class="resource-detail__button resource-detail__button--danger">🗑️ ${t('market.delete_permanently')}</button>
        `;
        
        // 📱 Web 模式不渲染编辑按钮，此处需空值保护
        const btnEditItem = authorActionArea.querySelector("#btn-edit-item");
        if (btnEditItem) btnEditItem.onclick = (e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("comfy-route-edit-publish", { detail: { itemData, currentUser } }));
        };
        
        authorActionArea.querySelector("#btn-del-item").onclick = async (e) => {
            e.stopPropagation();
            await showResourceDeleteDialog({ itemData, currentUser, isCurrent: () => card.isConnected,
                onDeleted: () => window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload")) });
        };
        detailView.appendChild(authorActionArea);
    }

    // 🖼️ 启用图片懒加载（跳过 data URL 和已处理的）
    lazyLoadImages(card);

    card._cleanup = () => commentUI?._cleanup?.();
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
    const scope = createPurchaseStatusScope(refundArea, currentUser.account);
    if (!scope.isCurrent()) return;
    
    refundArea.style.display = "block";
    refundArea.innerHTML = `<div class="resource-detail__refund-loading">⏳ ${t('item.purchase_status_loading')}</div>`;
    
    try {
        const statusRes = await api.getPurchaseStatus(currentUser.account, itemData.id, scope.readOptions);
        if (!scope.isCurrent()) return;
        if (!isValidPurchaseStatus(statusRes)) throw new Error();
        
        if (!statusRes.owned) {
            refundArea.innerHTML = '';
            refundArea.style.display = "none";
            return;
        }
        
        if (statusRes.can_refund && statusRes.allow_refund) {
            const hoursLeft = Number(statusRes.refund_hours_left);
            if (!Number.isFinite(hoursLeft) || hoursLeft < 0) throw new Error("Invalid refund hours");
            refundArea.innerHTML = `
                <div class="resource-detail__refund-panel">
                    <div class="resource-detail__refund-header">
                        <div class="resource-detail__refund-copy">
                            🔄 ${t('item.regret_mode')}${t('item.hours_left', { hours: hoursLeft.toFixed(1) })}
                        </div>
                        <button type="button" class="btn-refund-item resource-detail__button resource-detail__button--warning">
                            💸 ${t('item.apply_refund')}
                        </button>
                    </div>
                    <div class="resource-detail__refund-warning">
                        ⚠️ ${t('item.refund_warning')}
                    </div>
                </div>
            `;
            
            const refundBtn = refundArea.querySelector('.btn-refund-item');
            if (refundBtn) {
                refundBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (!scope.isCurrent()) return;
                    showRefundConfirm(itemData, currentUser, statusRes.price_paid, card);
                };
            }
        } else {
            refundArea.innerHTML = `
                <div class="resource-detail__refund-expired">
                    ✅ ${t('item.refund_expired')}
                </div>
            `;
        }
    } catch (e) {
        if (!scope.isCurrent()) return;
        refundArea.innerHTML = '';
        refundArea.style.display = "none";
    }
}

/**
 * 显示退款确认弹窗
 */
function showRefundConfirm(itemData, currentUser, pricePaid, card) {
    let nextFocus;
    return showResourceRefundDialog({
        itemData, currentUser, pricePaid, isCurrent: () => !!card?.isConnected,
        onRefunded: () => {
            nextFocus = (card?.nextElementSibling || card?.previousElementSibling)?.querySelector('.card-summary__toggle');
            card?.remove();
        },
        onClosed: () => {
            const target = nextFocus?.isConnected ? nextFocus : document.querySelector('.comfy-ranking-root .card-summary__toggle');
            target?.focus();
        }
    });
}
