// 前端页面/post/帖子详情组件.js
// ==========================================
// 📄 帖子详情组件
// ==========================================
// 功能：图片轮播、正文、互动（点赞/收藏/评论/打赏）
// 关联文件：
//   - 图片沙盒组件.js (图片轮播)
//   - 评论与互动组件.js (评论功能)
//   - 打赏等级工具.js (打赏榜单)
// ==========================================

import { api, proxyImages, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents, cleanupImageSandbox } from "../components/图片沙盒组件.js";
import { getVideoPlayerHTML, setupVideoPlayerEvents, cleanupVideoPlayer } from "../components/视频播放器组件.js";
import { renderTipLevelHTML } from "../components/打赏等级工具.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t } from "../components/用户体验增强.js";
import { PLACEHOLDERS, getCachedProfile, getProfileWithSWR, normalizeProfileImageUrl, IS_WEB_MODE, API, CACHE } from "../core/全局配置.js";
import { removeCache, findInListCache } from "../components/性能优化工具.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { recordView, handleToggleLike, handleToggleFavorite, renderTipBoardHTML as renderCommonTipBoardHTML, escapeHtml, formatTime } from "../components/互动工具函数.js";  // 🧹 P2归一：局部 formatTime 已移除
import { createRatingStars, isValidRatingResponse } from "../social/评论与互动组件.js";

import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

import { isConfirmedDedicatedCommentResponse, isDefiniteCommentRejection } from "../social/评论数据工具.js";

const viewContexts = new WeakMap();
let postViewSequence = 0;
const isCurrent = node => !!viewContexts.get(node)?.scope.isCurrent();
function openOwnedModal(node, title, content, options) {
    const context = viewContexts.get(node);
    if (!context?.scope.isCurrent()) return null;
    const modal = globalModal.openModal(title, content, options);
    const removeCleanup = context.scope.addCleanup(() => globalModal.closeModal(modal));
    content._cleanup = removeCleanup;
    return modal;
}

/**
 * 🖼️ 生成头像 HTML 字符串
 * @param {string} avatar - 头像 URL
 * @param {string} name - 用户名（用于首字母回退）
 * @param {number} size - 头像尺寸（px）
 * @param {string} [extraStyle] - 额外内联样式（img 时追加）
 */
function _generateAvatarHtml(avatar, name, size, extraStyle = '') {
    avatar = normalizeProfileImageUrl(avatar);
    const initial = (name || 'U')[0].toUpperCase();
    // 🔒 XSS防护：avatar / name 均来自他人可修改的资料（昵称首字母可能是 < ），写入 HTML 前必须转义
    if (avatar) {
        return `<img alt="" class="swr-avatar post-detail-avatar ${extraStyle === 'border: 2px solid #444;' ? 'post-detail-avatar--border' : extraStyle === 'background: var(--comfy-input-bg);' ? 'post-detail-avatar--panel' : ''}" src="${escapeHtml(avatar)}" style="width: ${size}px; height: ${size}px; ${['border: 2px solid #444;', 'background: var(--comfy-input-bg);'].includes(extraStyle) ? '' : extraStyle}">`;
    }
    const fontSize = Math.max(9, Math.round(size * 0.4));
    return `<div class="swr-avatar post-detail-avatar ${extraStyle === 'border: 2px solid #444;' ? 'post-detail-avatar--border' : extraStyle === 'background: var(--comfy-input-bg);' ? 'post-detail-avatar--panel' : ''}" style="width: ${size}px; height: ${size}px; font-size: ${fontSize}px; font-weight: bold;">${escapeHtml(initial)}</div>`;
}

/**
 * 🔄 用 SWR 回调更新已渲染的头像元素
 * @param {Element} avatarEl - .swr-avatar 元素
 * @param {object} profile - 新的用户 profile
 * @param {number} size - 头像尺寸（px）
 * @param {string} [extraStyle] - img 额外内联样式
 */
function _updateAvatarElement(avatarEl, profile, size, extraStyle = '') {
    const avatar = normalizeProfileImageUrl(profile?.avatar);
    if (!avatarEl || !avatar) return;
    if (avatarEl.tagName === 'IMG') {
        avatarEl.src = avatar;
    } else {
        avatarEl.outerHTML = `<img alt="" class="swr-avatar post-detail-avatar ${extraStyle === 'border: 2px solid #444;' ? 'post-detail-avatar--border' : extraStyle === 'background: var(--comfy-input-bg);' ? 'post-detail-avatar--panel' : ''}" src="${escapeHtml(avatar)}" style="width: ${size}px; height: ${size}px; ${['border: 2px solid #444;', 'background: var(--comfy-input-bg);'].includes(extraStyle) ? '' : extraStyle}">`;
    }
}

/**
 * 📄 创建帖子详情视图
 */
export function createPostDetailView(postId, currentUser) {
    const container = document.createElement("div");
    container.className = "discussion-detail";
    
    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div class="post-detail__header">
            <button type="button" id="btn-back-detail" class="post-detail__back">
                ⬅ ${t('common.back')}
            </button>
            <span class="post-detail__heading">${t('post.detail_title')}</span>
        </div>
        
        <!-- 内容区域 -->
        <div id="post-content" class="post-detail__body">
            <div class="post-detail__loading" role="status">
                <div class="post-detail__icon">⏳</div>
                ${t('post.loading')}
            </div>
        </div>
    `;
    
    const contentArea = container.querySelector("#post-content");
    const owner = currentUser?.account || null;
    const sessionMatches = captureRequestSession();
    const componentId = `post-detail-${++postViewSequence}`;
    let constructing = true, observer;
    const scope = createTaskViewScope({
        sessionMatches: () => sessionMatches() && (getUser()?.account || null) === owner,
        connected: () => constructing || container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => contentArea.replaceChildren()
    });
    const context = { scope, tipPending: false,
        readOptions: { componentId, noCache: true, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES } };
    viewContexts.set(container, context); viewContexts.set(contentArea, context);
    const handleRouteBack = () => scope.dispose();
    scope.addCleanup(() => {
        cleanupImageSandbox(contentArea);
        cleanupVideoPlayer(contentArea);
        contentArea.querySelectorAll('audio').forEach(audio => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
        contentArea.replaceChildren(); observer?.disconnect();
        window.removeEventListener("comfy-route-back", handleRouteBack);
    });
    container._cleanup = () => scope.dispose();
    container.querySelector("#btn-back-detail").onclick = () => {
        scope.dispose(); window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    window.addEventListener("comfy-route-back", handleRouteBack);
    queueMicrotask(() => {
        constructing = false;
        if (!scope.isCurrent()) return;
        observer = new MutationObserver(() => { if (!container.isConnected) scope.dispose(); });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // 加载帖子详情
    loadPostDetail(container, postId, currentUser);
    
    return container;
}

/**
 * 📥 加载帖子详情
 */
async function loadPostDetail(container, postId, currentUser) {
    const contentArea = container.querySelector("#post-content");
    if (!isCurrent(container)) return;
    const context = viewContexts.get(container);
    const generation = context.loadGeneration = (context.loadGeneration || 0) + 1;
    const current = () => isCurrent(container) && context.loadGeneration === generation;
    
    // 先清理旧的视频播放器全局事件（如果存在）
    if (contentArea) {
        cleanupImageSandbox(contentArea);
        cleanupVideoPlayer(contentArea);
    }
    
    let post = null;
    let fromCache = false;
    
    try {
        const res = await api.getPostDetail(postId, { ...context.readOptions, noCache: false });
        if (!current()) return;
        post = res.data;
        if (!post || typeof post !== "object" || Array.isArray(post) || post.id !== postId) post = null;
    } catch (err) {
        if (!current()) return;
        // 📴 从列表缓存回退
        const cached = findInListCache("PostsCache_", postId);
        if (cached) {

            post = cached;
            fromCache = true;
        }
    }
    
    if (!post) {
        contentArea.innerHTML = `
            <div class="post-detail__error" role="alert">
                <div class="post-detail__icon">⚠️</div>
                ${t('post.not_exist')}
            </div>
        `;
        return;
    }
    
    post = proxyImages(post);  // 对帖子数据应用图片代理
    
    // 判断是否为视频帖子
    const isVideo = post.post_type === "video" && post.video_url;
    
    // 准备图片列表（视频帖也需要 cover_image 作为 poster）
    const images = post.images && post.images.length > 0 ? post.images : (post.cover_image ? [post.cover_image] : []);
    
    // 准备媒体展示HTML
    const mediaHTML = isVideo
        ? getVideoPlayerHTML(post.video_url, post.cover_image || '')
        : getCoverSandboxHTML(images);
    
    // 检查当前用户是否已点赞/收藏
    const isLiked = post.liked_by?.includes(currentUser?.account) || false;
    const isFavorited = post.favorited_by?.includes(currentUser?.account) || false;
    
    contentArea.innerHTML = `
            <!-- 图片展示区 -->
            <div id="images-area" class="post-detail__media">
                ${mediaHTML}
            </div>
            
            <!-- 标题 -->
            <div class="post-detail__title">
                ${escapeHtml(post.title)}
            </div>
            
            <!-- 原创标识 -->
            ${post.is_original ? `
            <div class="post-detail__original">
                🎨 ${t('publish.original_no_commercial')}
            </div>
            ` : ''}
            
            <!-- 作者信息（SWR 缓存头像） -->
            <div class="post-detail__author post-detail-author-row">
                <button type="button" id="author-row" class="post-detail-author-button"><div class="post-detail__avatar-slot swr-avatar-container"></div>
                <div class="post-detail__identity">
                    <div class="post-detail__name swr-name">${escapeHtml(post.author_name || post.author)}</div>
                    <div class="post-detail__timestamp">${formatTime(post.created_at)}</div>
                </div></button>
                ${currentUser && currentUser.account === post.author ? `
                <div onclick="event.stopPropagation()" class="post-detail__owner-actions">
                    ${IS_WEB_MODE ? '' : `<button type="button" id="btn-edit-post" aria-label="${t('common.edit')}" title="${t('common.edit')}" class="post-detail__edit">✏️</button>`}
                    <button type="button" id="btn-delete-post" aria-label="${t('common.delete')}" title="${t('common.delete')}" class="post-detail__delete">🗑️</button>
                </div>
                ` : ''}
            </div>
            
            <!-- 正文内容 -->
            <div class="post-detail__content">${escapeHtml(post.content)}</div>
            
            <!-- 互动按钮栏 -->
            <div id="interaction-bar" class="post-detail__interactions">
                <button type="button" id="btn-like" aria-label="${t('market.like')}" aria-pressed="${isLiked}" class="post-detail-toggle">
                    ❤️ <span id="like-count">${post.likes || 0}</span>
                </button>
                <button type="button" id="btn-favorite" aria-label="${t('market.favorite')}" aria-pressed="${isFavorited}" class="post-detail-toggle">
                    🔖 <span id="favorite-count">${post.favorites || 0}</span>
                </button>
                <button type="button" id="btn-tip" class="post-detail__tip">
                    ${t('post.tip_author')}
                </button>
                <!-- 👀 浏览量统计（纯展示） -->
                <div class="post-detail__stats">
                    <span class="post-detail__stat">🔥 <span id="post-view-total">${post.views || 0}</span></span>
                    <span class="post-detail__stat">📅 <span id="post-view-daily">${post.daily_views || 0}</span></span>
                </div>
            </div>
            
            <!-- 评分区域 -->
            <div id="rating-section" class="post-detail__rating"></div>
            
            <!-- 打赏榜单 -->
            <div id="tip-board-area" class="post-detail__media">
                ${renderTipBoard(post.tip_board || [])}
            </div>
            
            <!-- 评论区 -->
            <div class="post-detail__comments-heading">
                ${t('post.comments_title')} <span class="post-detail__comments-count">(${post.comments || 0})</span>
            </div>
            
            <!-- 评论输入框 -->
            <div class="post-detail__comment-composer">
                <input type="text" id="comment-input" required aria-label="${escapeHtml(t('post.comment_placeholder'))}" placeholder="${t('post.comment_placeholder')}" class="post-detail__comment-input">
                <button type="button" id="btn-send-comment" class="post-detail__comment-send">
                    ${t('common.send')}
                </button>
            </div>
            
            <!-- 评论列表 -->
            <div id="comments-list" class="post-detail__comments-list">
                <div class="post-detail__comments-loading" role="status">
                    ${t('post.comment_loading')}
                </div>
            </div>
        `;
        
        // 设置图片沙盒事件（视频帖无沙盒元素，函数会安全返回）
        contentArea.querySelectorAll("#images-area button:not([type])").forEach(button => { button.type = "button"; });
        setupImageSandboxEvents(contentArea);
        
        // 视频播放器事件绑定
        if (isVideo) {
            setupVideoPlayerEvents(contentArea);
            const videoEl = contentArea.querySelector('video');
            if (videoEl) {
                videoEl.addEventListener('error', () => {
                    console.warn('[VideoPlayer] 视频加载失败');
                });
            }
        }
        
        // 🚀 SWR 头像渲染：作者头像
        const authorRow = contentArea.querySelector("#author-row");
        if (authorRow) {
            const avatarContainer = authorRow.querySelector(".swr-avatar-container");
            const nameEl = authorRow.querySelector(".swr-name");
            
            const account = post.author;
            const cached = getCachedProfile(account);
            const avatar = [cached?.avatar, post.author_avatar].map(value => normalizeProfileImageUrl(value)).find(Boolean) || '';
            const name = cached?.name || post.author_name || account || '';
            const initial = (name || 'U')[0].toUpperCase();
            
            // 渲染初始头像
            if (avatarContainer) {
                avatarContainer.innerHTML = _generateAvatarHtml(avatar, name, 40, 'border: 2px solid #444;');
            }
            if (nameEl) nameEl.textContent = name;
            
            // 后台静默校对
            getProfileWithSWR(account, api.getUserProfile, (profile) => {
                if (!current()) return;
                const avatarEl = avatarContainer?.querySelector('.swr-avatar');
                _updateAvatarElement(avatarEl, profile, 40, 'border: 2px solid #444;');
                if (nameEl && profile.name) nameEl.textContent = profile.name;
            });
        }
        
        // 绑定作者点击
        contentArea.querySelector("#author-row").onclick = (e) => {
                if (!current()) return;
            // 如果点击的是编辑/删除按钮，不触发作者资料弹窗
            if (e.target.id === 'btn-edit-post' || e.target.id === 'btn-delete-post') return;
            openOtherUserProfileModal(post.author, currentUser);
        };
        
        // 绑定编辑按钮
        const btnEdit = contentArea.querySelector("#btn-edit-post");
        if (btnEdit) {
            btnEdit.onclick = (e) => {
                if (!current()) return;
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("comfy-route-edit-post", { 
                    detail: { postData: post, currentUser } 
                }));
            };
        }
        
        // 绑定删除按钮
        const btnDelete = contentArea.querySelector("#btn-delete-post");
        if (btnDelete) {
            btnDelete.onclick = (e) => {
                if (!current()) return;
                e.stopPropagation();
                showDeleteConfirmDialog(post, container);
            };
        }
        
        // 绑定互动事件
        bindInteractionEvents(contentArea, post, currentUser);
        
        // 渲染评分组件
        const ratingSectionEl = contentArea.querySelector("#rating-section");
        if (ratingSectionEl) {
            const ratingSection = createRatingStars({
                ratingData: {
                    rating_avg: post.rating_avg || 0,
                    rating_count: post.rating_count || 0,
                    rating_dist: post.rating_dist || {"1":0,"2":0,"3":0,"4":0,"5":0},
                    rated_by: post.rated_by || {}
                },
                currentUser: currentUser,
                authorAccount: post.author,
                isCurrent: current,
                onRate: async (score) => {
                    if (!current()) return null;
                    const res = await api.ratePost(post.id, score);
                    if (!current()) return null;
                    if (isValidRatingResponse(res, score)) {
                        post.rating_avg = res.rating_avg;
                        post.rating_count = res.rating_count;
                        post.rating_dist = res.rating_dist;
                        if (!post.rated_by) post.rated_by = {};
                        post.rated_by[currentUser.account] = { score: res.user_score, time: Date.now() / 1000 };
                        // 通知讨论区列表刷新
                        window.dispatchEvent(new CustomEvent("comfy-posts-refresh"));
                    }
                    return res;
                },
                compact: false
            });
            ratingSectionEl.replaceWith(ratingSection);
        }
        
        // 加载评论
        loadComments(contentArea, postId, currentUser);
        
        if (fromCache) {
            // 🔧 改用统一提示组件 + 词典：原为手写 div（无动画、不排队、不避重叠）且文案硬编码中文；
            // 原文「展示的是缓存的数据」与已有词条 feedback.cache_fallback 语义一致，直接复用避免重复建键
            showToast(t('feedback.cache_fallback'), 'warning');
        } else {
            // 👀 记录浏览量（fire-and-forget，不阻塞渲染）
            recordPostView(contentArea, postId);
        }
}

/**
 * 👀 记录帖子浏览量（带60秒防抖）- 使用公共工具函数
 */
async function recordPostView(contentArea, postId) {
    if (!isCurrent(contentArea)) return;
    await recordView(api.recordPostView, postId, 'post', (res) => {
        if (!isCurrent(contentArea)) return;
        updatePostViewStats(contentArea, res.views, res.daily_views);
    });
}

/**
 * 👀 更新帖子浏览量显示
 */
function updatePostViewStats(contentArea, views, dailyViews) {
    const totalEl = contentArea.querySelector("#post-view-total");
    const dailyEl = contentArea.querySelector("#post-view-daily");
    if (totalEl) totalEl.textContent = views || 0;
    if (dailyEl) dailyEl.textContent = dailyViews || 0;
}

/**
 * 🔗 绑定互动事件 - 使用公共工具函数
 */
function bindInteractionEvents(container, post, currentUser) {
    const btnLike = container.querySelector("#btn-like");
    const btnFavorite = container.querySelector("#btn-favorite");
    const btnTip = container.querySelector("#btn-tip");
    const likeCount = container.querySelector("#like-count");
    const favoriteCount = container.querySelector("#favorite-count");
    
    // 点赞 - 使用公共工具函数
    btnLike.onclick = () => {
        handleToggleLike(api.togglePostLike, post.id, btnLike, likeCount, currentUser, { isCurrent: () => isCurrent(container) });
    };
    
    // 收藏 - 使用公共工具函数
    btnFavorite.onclick = () => {
        handleToggleFavorite(api.togglePostFavorite, post.id, btnFavorite, favoriteCount, currentUser, { isCurrent: () => isCurrent(container) });
    };
    
    // 打赏
    btnTip.onclick = async () => {
        if (!isCurrent(container)) return;
        if (!currentUser) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        if (currentUser.account === post.author) {
            showToast(t('post.tip_self'), "warning");
            return;
        }
        await showTipDialog(post, currentUser, container);
    };
}

/**
 * 🎁 显示打赏对话框
 */
async function showTipDialog(post, currentUser, container) {
    const context = viewContexts.get(container);
    if (!isCurrent(container) || context.tipPending) return;
    context.tipPending = true;
    let balance;
    try {
        const res = await api.getWallet(currentUser.account, viewContexts.get(container).readOptions);
        if (!isCurrent(container)) return;
        if (res?.status !== "success" || !Number.isSafeInteger(res.balance) || res.balance < 0) throw new Error();
        balance = res.balance;
    } catch (_) {
        if (isCurrent(container)) { context.tipPending = false; showToast(t('common.error'), "error"); }
        return;
    }

    const content = document.createElement("div");
    content.className = "discussion-modal";
    content.innerHTML = `
        <div class="post-detail__balance">
            ${t('wallet.current_balance')}: <strong class="post-detail__balance-value">${balance}</strong> ${t('wallet.credits')}
        </div>
        <div class="post-detail__tip-options">
            <button type="button" class="post-detail__tip-amount tip-amount" data-amount="10">10 ${t('task.points')}</button>
            <button type="button" class="post-detail__tip-amount tip-amount" data-amount="50">50 ${t('task.points')}</button>
            <button type="button" class="post-detail__tip-amount tip-amount" data-amount="100">100 ${t('task.points')}</button>
            <button type="button" class="post-detail__tip-amount tip-amount" data-amount="500">500 ${t('task.points')}</button>
        </div>
        <div class="post-detail__modal-actions">
            <button type="button" id="tip-cancel" class="post-detail__modal-cancel">${t('common.cancel')}</button>
        </div>
    `;

    const modal = openOwnedModal(container, `🎁 ${t('post.tip_dialog_title')}`, content, { width: "300px" });

    content.querySelector("#tip-cancel").onclick = () => globalModal.closeModal(modal);
    let submitted = false;
    const release = content._cleanup;
    content._cleanup = () => { release?.(); if (!submitted) context.tipPending = false; };

    content.querySelectorAll(".tip-amount").forEach(btn => {
        btn.onclick = async () => {
            if (submitted || !isCurrent(container) || !modal?.isConnected) return;
            const amount = parseInt(btn.dataset.amount);

            // 本地前置余额校验
            if (balance < amount) {
                showToast(t('wallet.insufficient_balance'), "warning");
                return;
            }

            try {
                submitted = true;
                content.querySelectorAll(".tip-amount").forEach(button => { button.disabled = true; });
                const res = await api.tipPost(post.id, amount, false);
                if (!isCurrent(container)) return;
                if (res?.status !== "success") throw new Error();
                context.tipPending = false;
                showToast(t('post.tip_success', { amount }), "success");
                globalModal.closeModal(modal);
                // 刷新页面
                loadPostDetail(container.parentElement, post.id, currentUser);
            } catch (err) {
                if (isCurrent(container)) showToast(t('post.tip_failed'), "error");
            }
        };
    });
}

/**
 * 💬 加载评论
 */
async function loadComments(container, postId, currentUser) {
    const commentsList = container.querySelector("#comments-list");
    const commentInput = container.querySelector("#comment-input");
    const sendBtn = container.querySelector("#btn-send-comment");
    if (!isCurrent(container)) return;
    const context = viewContexts.get(container);
    const account = typeof currentUser === "string" ? currentUser : currentUser?.account;
    let submission = context.commentSubmission;
    if (!submission || submission.input !== commentInput || submission.button !== sendBtn || submission.account !== account) {
        submission = context.commentSubmission = { input: commentInput, button: sendBtn, account, phase: "idle", bound: false };
    }
    const submissionCurrent = () => isCurrent(container) && context.commentSubmission === submission
        && commentInput.isConnected && sendBtn.isConnected;
    const generation = context.commentGeneration = (context.commentGeneration || 0) + 1;
    const current = () => isCurrent(container) && context.commentGeneration === generation && commentsList.isConnected;

    try {
        const res = await api.getPostComments(postId, viewContexts.get(container).readOptions);
        if (!current()) return;
        if (res?.status !== "success" || !Array.isArray(res.data)) throw new Error();
        let comments = res.data.filter(value => value && typeof value === "object" && !Array.isArray(value)
            && typeof value.author === "string" && typeof value.content === "string");
        comments = proxyImages(comments);

        if (comments.length === 0) {
            commentsList.innerHTML = `
                <div class="post-detail__comments-empty">
                    ${t('post.no_comments')}
                </div>
            `;
        } else {
            // 🚀 SWR 头像渲染：评论作者头像
            commentsList.innerHTML = comments.map((c, idx) => {
                const cached = getCachedProfile(c.author);
                const avatar = [cached?.avatar, c.author_avatar].map(value => normalizeProfileImageUrl(value)).find(Boolean) || '';
                const name = cached?.name || c.author_name || c.author || '';

                const avatarHtml = _generateAvatarHtml(avatar, name, 24, 'background: var(--comfy-input-bg);');

                return `
                    <div id="comment-${idx}" data-account="${escapeHtml(c.author)}" class="post-detail__comment">
                        <div class="post-detail__comment-author">
                            <div class="swr-avatar-container">${avatarHtml}</div>
                            <span class="post-detail__comment-name swr-name">${escapeHtml(name)}</span>
                            <span class="post-detail__comment-time">${formatTime(c.created_at)}</span>
                        </div>
                        <div class="post-detail__comment-content">
                            ${escapeHtml(c.content)}
                        </div>
                    </div>
                `;
            }).join("");

            // 后台静默校对每个评论作者的头像
            comments.forEach((c, idx) => {
                getProfileWithSWR(c.author, api.getUserProfile, (profile) => {
                    if (!current()) return;
                    const commentEl = commentsList.querySelector(`#comment-${idx}`);
                    if (!commentEl) return;
                    const avatarContainer = commentEl.querySelector('.swr-avatar-container');
                    const nameEl = commentEl.querySelector('.swr-name');
                    const avatarEl = avatarContainer?.querySelector('.swr-avatar');
                    _updateAvatarElement(avatarEl, profile, 24, 'background: var(--comfy-input-bg);');
                    if (nameEl && profile.name) nameEl.textContent = profile.name;
                });
            });
        }
    } catch (err) {
        if (!current()) return;
        commentsList.innerHTML = `
            <div class="post-detail__comments-error" role="alert">
                ${t('post.comment_load_failed')}
            </div>
        `;
    }

    if (submission.bound || !submissionCurrent()) return;
    submission.bound = true;
    sendBtn.disabled = false;
    commentInput.readOnly = false;
    sendBtn.removeAttribute("aria-busy");
    commentInput.oninput = () => {
        if (submissionCurrent()) commentInput.removeAttribute("aria-invalid");
    };
    sendBtn.onclick = async () => {
        if (!submissionCurrent() || submission.phase !== "idle") return;
        if (typeof account !== "string" || !account.trim()) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        const originalInput = commentInput.value, content = originalInput.trim();
        if (!content) {
            commentInput.setAttribute("aria-invalid", "true");
            commentInput.focus();
            showToast(t('post.comment_required'), "warning");
            return;
        }
        commentInput.removeAttribute("aria-invalid");
        submission.phase = "submitting";
        sendBtn.disabled = true;
        sendBtn.setAttribute("aria-busy", "true");
        sendBtn.textContent = t('common.sending');
        try {
            const result = await api.addPostComment(postId, content);
            if (!submissionCurrent()) return;
            if (!isConfirmedDedicatedCommentResponse(result, account, content)) throw new Error("Unconfirmed comment");
            submission.phase = "committed";
            if (commentInput.value === originalInput) commentInput.value = "";
            showToast(t('post.comment_success'), "success");
            await loadComments(container, postId, currentUser);
            if (submissionCurrent()) submission.phase = "idle";
        } catch (err) {
            if (!submissionCurrent()) return;
            if (submission.phase === "committed") {
                try { showToast(t('social.comment_refresh_required'), "warning"); } catch (_) {}
                return;
            }
            const rejected = isDefiniteCommentRejection(err);
            submission.phase = rejected ? "idle" : "unconfirmed";
            showToast(t(rejected ? 'post.comment_failed' : 'social.comment_unconfirmed'), rejected ? "error" : "warning");
        } finally {
            if (!submissionCurrent()) return;
            sendBtn.disabled = submission.phase !== "idle";
            commentInput.readOnly = submission.phase !== "idle";
            sendBtn.removeAttribute("aria-busy");
            sendBtn.textContent = t(submission.phase === "unconfirmed" ? 'social.comment_pending' : 'common.send');
        }
    };

    // 回车发送
    commentInput.onkeydown = (e) => {
        if (isCurrent(container) && !e.defaultPrevented && e.key === "Enter"
            && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
            && !e.isComposing && e.keyCode !== 229 && !e.repeat
            && !commentInput.disabled && !commentInput.readOnly) {
            e.preventDefault();
            sendBtn.click();
        }
    };
}

/**
 * 🎁 渲染打赏榜单 - 使用公共工具函数
 */
function renderTipBoard(tipBoard) {
    return renderCommonTipBoardHTML(tipBoard, 5, t('post.no_tips'));
}

/**
 * 🗑️ 显示删除确认对话框
 */
function showDeleteConfirmDialog(post, container) {
    if (!isCurrent(container)) return;
    const content = document.createElement("div");
    content.className = "discussion-modal";
    content.innerHTML = `
        <div class="post-detail__modal-center">
            <div class="post-detail__warning-icon">⚠️</div>
            <div class="post-detail__modal-title">${t('post.delete_confirm_title')}</div>
            <div class="post-detail__modal-description">${t('post.delete_confirm_desc')}</div>
            <div class="post-detail__modal-actions">
                <button type="button" id="delete-cancel" class="post-detail__modal-cancel">${t('common.cancel')}</button>
                <button type="button" id="delete-confirm" class="post-detail__modal-danger">${t('common.delete')}</button>
            </div>
        </div>
    `;

    const modal = openOwnedModal(container, t('post.delete_confirm_title'), content, { width: "300px" });

    // 取消按钮
    content.querySelector("#delete-cancel").onclick = () => globalModal.closeModal(modal);
    let submitted = false;

    // 确认删除按钮
    content.querySelector("#delete-confirm").onclick = async () => {
        if (submitted || !isCurrent(container) || !modal?.isConnected) return;
        submitted = true;
        try {
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('common.deleting');

            const res = await api.deletePost(post.id);
            if (!isCurrent(container)) return;
            if (res?.status !== "success") throw new Error();
            showToast(t('post.delete_success'), "success");
            globalModal.closeModal(modal);

            // 返回列表页
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            if (!isCurrent(container)) return;
            showToast(t('post.delete_failed'), "error");
            submitted = false;
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.delete');
        }
    };
}
