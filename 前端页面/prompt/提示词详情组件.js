// 前端页面/prompt/提示词详情组件.js
// ==========================================
// 🧩 提示词详情组件
// ==========================================
// 功能：封面媒体展示、提示词正文（付费遮罩+解锁+一键复制）、
//       互动（点赞/收藏/评论/打赏）、作者编辑/删除
// 关联文件：
//   - 图片沙盒组件.js (图片展示)
//   - 视频播放器组件.js (视频封面)
//   - 互动工具函数.js (点赞/收藏/打赏榜/浏览量)
//   - 全局弹窗管理器.js (购买确认/打赏/删除弹窗)
// ==========================================

import { api, proxyImages, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { getPromptPriceState } from "./价格校验.js";
import { showToast } from "../components/UI交互提示组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents, cleanupImageSandbox } from "../components/图片沙盒组件.js";
import { getVideoPlayerHTML, setupVideoPlayerEvents, cleanupVideoPlayer } from "../components/视频播放器组件.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t, tIfExists } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR, normalizeProfileImageUrl, IS_WEB_MODE, API, CACHE } from "../core/全局配置.js";
import { findInListCache } from "../components/性能优化工具.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { recordView, handleToggleLike, handleToggleFavorite, renderTipBoardHTML as renderCommonTipBoardHTML, escapeHtml, formatTime } from "../components/互动工具函数.js";  // 🧹 P2归一：局部 formatTime 已移除

import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

import { isConfirmedDedicatedCommentResponse, isDefiniteCommentRejection } from "../social/评论数据工具.js";

const viewContexts = new WeakMap();
let promptViewSequence = 0;
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
 */
function _generateAvatarHtml(avatar, name, size, extraStyle = '') {
    avatar = normalizeProfileImageUrl(avatar);
    const initial = (name || 'U')[0].toUpperCase();
    // 🔒 XSS防护：avatar / name 均来自他人可修改的资料（昵称首字母可能是 < ），写入 HTML 前必须转义
    if (avatar) {
        return `<img class="swr-avatar prompt-detail__avatar ${size === 24 ? 'prompt-detail__avatar--small' : 'prompt-detail__avatar--large'}" alt="" src="${escapeHtml(avatar)}">`;
    }
    return `<div class="swr-avatar prompt-detail__avatar prompt-detail__avatar--initial ${size === 24 ? 'prompt-detail__avatar--small' : 'prompt-detail__avatar--large'}" aria-hidden="true">${escapeHtml(initial)}</div>`;
}

/**
 * 🔄 用 SWR 回调更新已渲染的头像元素
 */
function _updateAvatarElement(avatarEl, profile, size, extraStyle = '') {
    const avatar = normalizeProfileImageUrl(profile?.avatar);
    if (!avatarEl || !avatar) return;
    if (avatarEl.tagName === 'IMG') {
        avatarEl.src = avatar;
    } else {
        avatarEl.outerHTML = `<img class="swr-avatar prompt-detail__avatar ${size === 24 ? 'prompt-detail__avatar--small' : 'prompt-detail__avatar--large'}" alt="" src="${escapeHtml(avatar)}">`;
    }
}

/**
 * 📄 创建提示词详情视图
 */
export function createPromptDetailView(promptId, currentUser) {
    const container = document.createElement("div");
    container.className = "prompt-detail";

    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div class="prompt-detail__header">
            <button type="button" id="btn-back-prompt-detail" class="prompt-detail__button">
                ⬅ ${t('common.back')}
            </button>
            <span class="prompt-detail__heading">${t('prompt.detail_title')}</span>
        </div>

        <!-- 内容区域 -->
        <div id="prompt-content" class="prompt-detail__content">
            <div class="prompt-detail__state" role="status">
                <div class="prompt-detail__state-icon" aria-hidden="true">⏳</div>
                ${t('prompt.loading')}
            </div>
        </div>
    `;

    const contentArea = container.querySelector("#prompt-content");
    const owner = currentUser?.account || null;
    const sessionMatches = captureRequestSession();
    const componentId = `prompt-detail-${++promptViewSequence}`;
    let constructing = true, observer;
    const scope = createTaskViewScope({
        sessionMatches: () => sessionMatches() && (getUser()?.account || null) === owner,
        connected: () => constructing || container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => contentArea.replaceChildren()
    });
    const context = { scope, purchasePending: false, tipPending: false,
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
    container.querySelector("#btn-back-prompt-detail").onclick = () => {
        scope.dispose(); window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    window.addEventListener("comfy-route-back", handleRouteBack);
    queueMicrotask(() => {
        constructing = false;
        if (!scope.isCurrent()) return;
        observer = new MutationObserver(() => { if (!container.isConnected) scope.dispose(); });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // 加载提示词详情
    loadPromptDetail(container, promptId, currentUser);

    return container;
}

/**
 * 📥 加载提示词详情
 */
async function loadPromptDetail(container, promptId, currentUser) {
    const contentArea = container.querySelector("#prompt-content");
    if (!isCurrent(container)) return;

    // 先清理旧的视频播放器全局事件（如果存在）
    if (contentArea) {
        cleanupImageSandbox(contentArea);
        cleanupVideoPlayer(contentArea);
    }

    let prompt = null;
    let fromCache = false;

    try {
        const res = await api.getPromptDetail(promptId, viewContexts.get(container).readOptions);
        if (!isCurrent(container)) return;
        prompt = res.data || res;
        if (!prompt || typeof prompt !== "object" || Array.isArray(prompt) || prompt.id !== promptId) prompt = null;
    } catch (err) {
        if (!isCurrent(container)) return;
        // 📴 从列表缓存回退（缓存中无 prompt_text，将显示付费遮罩）
        const cached = findInListCache("PromptsCache_", promptId);
        if (cached) {
            // 列表回退只恢复公开元信息，旧缓存也不得提供正文或拥有状态。
            prompt = { ...cached, prompt_text: null, owned: false, locked: true };
            fromCache = true;
        }
    }

    if (!prompt) {
        contentArea.innerHTML = `
            <div class="prompt-detail__state prompt-detail__state--error" role="alert">
                <div class="prompt-detail__state-icon" aria-hidden="true">⚠️</div>
                ${t('prompt.not_exist')}
            </div>
        `;
        return;
    }

    viewContexts.get(container).scope.addCleanup(() => { prompt.prompt_text = null; });
    prompt = proxyImages(prompt);  // 对提示词数据应用图片代理

    // 🔓 判断提示词是否可见（免费/作者/已购买 → prompt_text 已由服务端下发）
    const isOwner = currentUser && currentUser.account === prompt.author;
    const isUnlocked = !fromCache && typeof prompt.prompt_text === "string" && prompt.locked !== true;
    const priceState = getPromptPriceState(prompt.price);

    // 判断是否为视频封面
    const isVideo = prompt.media_type === "video" && prompt.video_url;

    // 准备媒体展示HTML（图像类型支持多图轮播，旧数据无 images 时回退单封面）
    const imageUrls = Array.isArray(prompt.images) && prompt.images.length > 0
        ? prompt.images
        : (prompt.cover_image ? [prompt.cover_image] : []);
    const mediaHTML = isVideo
        ? getVideoPlayerHTML(prompt.video_url, prompt.cover_image || '')
        : getCoverSandboxHTML(imageUrls);

    // 🎵 音乐提示词音频播放器（图片+音频方案，仅存在 audio_url 时渲染）
    const audioHTML = prompt.audio_url ? `
        <div class="prompt-detail__audio">
            <div class="prompt-detail__muted prompt-detail__audio-label">🎵 ${t('prompt.audio_label')}</div>
            <audio controls preload="metadata" src="${escapeHtml(prompt.audio_url)}" class="prompt-detail__audio-player"></audio>
        </div>` : '';

    // 检查当前用户是否已点赞/收藏
    const isLiked = prompt.liked_by?.includes(currentUser?.account) || false;
    const isFavorited = prompt.favorited_by?.includes(currentUser?.account) || false;

    contentArea.innerHTML = `
            <!-- 媒体展示区 -->
            <div id="media-area" class="prompt-detail__media">
                ${mediaHTML}
                ${audioHTML}
            </div>

            <!-- 标题 -->
            <div class="prompt-detail__title">
                ${escapeHtml(prompt.title)}
            </div>

            <!-- 原创标识 -->
            ${prompt.is_original ? `
            <div class="prompt-detail__badge prompt-detail__badge--original">
                🎨 ${t('prompt.original_badge')}
            </div>
            ` : ''}

            <!-- 分类与价格标签 -->
            <div class="prompt-detail__badges">
                <span class="prompt-detail__badge">${prompt.prompt_type === 'video' ? '🎬' : (prompt.prompt_type === 'music' ? '🎵' : '🎨')} ${escapeHtml(tIfExists('promptcat.' + (prompt.category || ''), prompt.category || ''))}</span>
                ${priceState !== 'free'
                    ? `<span class="prompt-detail__badge prompt-detail__badge--price">💎 ${escapeHtml(priceState === 'paid' ? prompt.price : t('common.unknown'))}</span>`
                    : `<span class="prompt-detail__badge">${t('prompt.free')}</span>`}
                ${prompt.owned ? `<span class="prompt-detail__badge">${t('prompt.owned_mark')}</span>` : ''}
            </div>

            <!-- 🏷️ 标签展示 -->
            ${(Array.isArray(prompt.tags) && prompt.tags.length) ? `
            <div class="prompt-detail__tags">
                ${prompt.tags.map(tag => `<span class="prompt-detail__badge">#${escapeHtml(tag)}</span>`).join('')}
            </div>` : ''}

            <!-- 作者信息（SWR 缓存头像） -->
            <div id="author-row" class="prompt-detail__author">
                <button type="button" id="btn-author-prompt" class="prompt-detail__author-link">
                <span class="swr-avatar-container prompt-detail__avatar-slot"></span>
                <span class="prompt-detail__author-info">
                    <span class="swr-name prompt-detail__author-name">${escapeHtml(prompt.author_name || prompt.author)}</span>
                    <span class="prompt-detail__muted prompt-detail__author-time">${escapeHtml(formatTime(prompt.created_at))}</span>
                </span>
                </button>
                ${isOwner ? `
                <div class="prompt-detail__author-actions">
                    ${IS_WEB_MODE ? '' : `<button type="button" id="btn-edit-prompt" class="prompt-detail__button" aria-label="${t('common.edit')}" title="${t('common.edit')}">✏️</button>`}
                    <button type="button" id="btn-delete-prompt" class="prompt-detail__button prompt-detail__button--danger" aria-label="${t('common.delete')}" title="${t('common.delete')}">🗑️</button>
                </div>
                ` : ''}
            </div>

            <!-- 简介内容 -->
            <div class="prompt-detail__description">${escapeHtml((prompt.content || '').trim())}</div>

            <!-- 🔑 提示词正文区（付费遮罩/解锁/复制） -->
            <div id="prompt-text-area" class="prompt-detail__text-area"></div>

            <!-- 互动按钮栏 -->
            <div id="interaction-bar" class="prompt-detail__interactions">
                <button type="button" id="btn-like" aria-label="${t('market.like')}" aria-pressed="${isLiked}" class="prompt-detail__button prompt-detail__interaction">
                    ❤️ <span id="like-count">${escapeHtml(prompt.likes || 0)}</span>
                </button>
                <button type="button" id="btn-favorite" aria-label="${t('market.favorite')}" aria-pressed="${isFavorited}" class="prompt-detail__button prompt-detail__interaction">
                    🔖 <span id="favorite-count">${escapeHtml(prompt.favorites || 0)}</span>
                </button>
                <button type="button" id="btn-tip" class="prompt-detail__button prompt-detail__interaction">
                    ${t('prompt.tip_author')}
                </button>
                <!-- 👀 浏览量统计（纯展示） -->
                <div class="prompt-detail__views">
                    <span class="prompt-detail__view-count">🔥 <span id="prompt-view-total">${escapeHtml(prompt.views || 0)}</span></span>
                    <span class="prompt-detail__view-count">📅 <span id="prompt-view-daily">${escapeHtml(prompt.daily_views || 0)}</span></span>
                </div>
            </div>

            <!-- 打赏榜单 -->
            <div id="tip-board-area" class="prompt-detail__tips">
                ${renderCommonTipBoardHTML(prompt.tip_board || [], 5, t('prompt.no_tips'))}
            </div>

            <!-- 评论区 -->
            <div class="prompt-detail__comments-heading">
                ${t('prompt.comments_title')} <span class="prompt-detail__muted">(${escapeHtml(prompt.comments || 0)})</span>
            </div>

            <!-- 评论输入框 -->
            <div class="prompt-detail__comment-form">
                <input type="text" id="comment-input" required aria-label="${escapeHtml(t('prompt.comment_placeholder'))}" placeholder="${t('prompt.comment_placeholder')}" class="prompt-detail__comment-input">
                <button type="button" id="btn-send-comment" class="prompt-detail__button prompt-detail__button--accent">
                    ${t('common.send')}
                </button>
            </div>

            <!-- 评论列表 -->
            <div id="comments-list" class="prompt-detail__comments">
                <div class="prompt-detail__state prompt-detail__state--compact" role="status" aria-label="${t('prompt.loading')}">⏳</div>
            </div>
        `;

        // 设置图片沙盒事件（视频无沙盒元素，函数会安全返回）
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

        // 🔑 渲染提示词正文区（解锁 / 付费遮罩）
        renderPromptTextArea(contentArea, prompt, currentUser, isUnlocked);

        // 🚀 SWR 头像渲染：作者头像
        const authorRow = contentArea.querySelector("#author-row");
        if (authorRow) {
            const avatarContainer = authorRow.querySelector(".swr-avatar-container");
            const nameEl = authorRow.querySelector(".swr-name");

            const account = prompt.author;
            const cached = getCachedProfile(account);
            const avatar = [cached?.avatar, prompt.author_avatar].map(value => normalizeProfileImageUrl(value)).find(Boolean) || '';
            const name = cached?.name || prompt.author_name || account || '';

            if (avatarContainer) {
                avatarContainer.innerHTML = _generateAvatarHtml(avatar, name, 40, 'border: 2px solid #444;');
            }
            if (nameEl) nameEl.textContent = name;

            getProfileWithSWR(account, api.getUserProfile, (profile) => {
                if (!isCurrent(contentArea)) return;
                const avatarEl = avatarContainer?.querySelector('.swr-avatar');
                _updateAvatarElement(avatarEl, profile, 40, 'border: 2px solid #444;');
                if (nameEl && profile.name) nameEl.textContent = profile.name;
            });
        }

        // 绑定作者点击
        contentArea.querySelector("#btn-author-prompt").onclick = (e) => {
            if (!isCurrent(contentArea)) return;
            if (e.target.id === 'btn-edit-prompt' || e.target.id === 'btn-delete-prompt') return;
            openOtherUserProfileModal(prompt.author, currentUser);
        };

        // 绑定编辑按钮
        const btnEdit = contentArea.querySelector("#btn-edit-prompt");
        if (btnEdit) {
            btnEdit.onclick = (e) => {
                if (!isCurrent(contentArea)) return;
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("comfy-route-edit-prompt", {
                    detail: { promptData: prompt, currentUser }
                }));
            };
        }

        // 绑定删除按钮
        const btnDelete = contentArea.querySelector("#btn-delete-prompt");
        if (btnDelete) {
            btnDelete.onclick = (e) => {
                if (!isCurrent(container)) return;
                e.stopPropagation();
                showDeleteConfirmDialog(prompt, container);
            };
        }

        // 绑定互动事件
        bindInteractionEvents(contentArea, prompt, currentUser);

        // 加载评论
        loadComments(contentArea, promptId, currentUser);

        if (fromCache) {
            showToast(t('prompt.network_cache'), "warning");
        } else {
            // 👀 记录浏览量（fire-and-forget，不阻塞渲染）
            recordPromptView(contentArea, promptId);
        }
}

// ==========================================
// 🔑 提示词正文区（付费遮罩/解锁/复制）
// ==========================================

/**
 * 渲染提示词正文区
 */
function renderPromptTextArea(contentArea, prompt, currentUser, isUnlocked) {
    if (!isCurrent(contentArea)) return;
    const textArea = contentArea.querySelector("#prompt-text-area");
    if (!textArea) return;
    const priceState = getPromptPriceState(prompt.price);

    if (isUnlocked && prompt.prompt_text) {
        // ✅ 已解锁：展示正文 + 一键复制
        textArea.innerHTML = `
            <div class="prompt-detail__text-box">
                <div class="prompt-detail__text-header">
                    <span class="prompt-detail__text-label">🔑 ${t('prompt.text_label')}</span>
                    <button type="button" id="btn-copy-prompt" class="prompt-detail__button prompt-detail__button--accent">
                        📋 ${t('prompt.copy')}
                    </button>
                </div>
                <div class="prompt-detail__text-body">${escapeHtml(prompt.prompt_text)}</div>
            </div>
        `;
        textArea.querySelector("#btn-copy-prompt").onclick = () => {
            if (isCurrent(contentArea)) copyToClipboard(prompt.prompt_text, textArea.querySelector("#btn-copy-prompt"), () => isCurrent(contentArea));
        };
    } else if (priceState === 'paid') {
        // 🔒 付费遮罩：模糊预览 + 解锁按钮
        textArea.innerHTML = `
            <div class="prompt-detail__locked">
                <div class="prompt-detail__locked-preview" aria-hidden="true">
                    ${escapeHtml((prompt.content || '') + '\n' + (prompt.content || ''))}
                </div>
                <div class="prompt-detail__locked-overlay">
                    <div class="prompt-detail__lock-icon" aria-hidden="true">🔒</div>
                    <div class="prompt-detail__lock-title">${t('prompt.locked_title')}</div>
                    <div class="prompt-detail__muted prompt-detail__locked-description">${t('prompt.locked_desc')}</div>
                    <button type="button" id="btn-unlock-prompt" class="prompt-detail__button prompt-detail__button--gold">
                        💎 ${t('prompt.unlock', { price: prompt.price })}
                    </button>
                </div>
            </div>
        `;
        textArea.querySelector("#btn-unlock-prompt").onclick = () => {
            showPurchaseConfirmDialog(contentArea, prompt, currentUser);
        };
    } else if (priceState === 'unknown') {
        const message = document.createElement('p');
        message.className = 'prompt-detail__muted';
        message.setAttribute('role', 'status');
        message.textContent = t('prompt.price_unknown');
        textArea.replaceChildren(message);
    }
}

/**
 * 📋 一键复制（navigator.clipboard 优先，execCommand 降级）
 */
function copyToClipboard(text, btnEl, current) {
    const onSuccess = () => {
        if (!current()) return;
        showToast(t('prompt.copied'), "success");
        if (btnEl) {
            const original = btnEl.innerHTML;
            btnEl.innerHTML = `✅ ${t('prompt.copied')}`;
            setTimeout(() => { if (current() && btnEl.isConnected) btnEl.innerHTML = original; }, 1500);
        }
    };
    const onFail = () => current() && showToast(t('prompt.copy_failed'), "error");

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => { if (current()) fallbackCopy(text, onSuccess, onFail); });
    } else {
        fallbackCopy(text, onSuccess, onFail);
    }
}

function fallbackCopy(text, onSuccess, onFail) {
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position: fixed; top: -9999px; opacity: 0;";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        ok ? onSuccess() : onFail();
    } catch (e) {
        onFail();
    }
}

/**
 * 💎 购买确认弹窗
 */
async function showPurchaseConfirmDialog(contentArea, prompt, currentUser) {
    if (!currentUser) {
        showToast(t('prompt.login_first'), "warning");
        return;
    }

    const context = viewContexts.get(contentArea);
    if (!context?.scope.isCurrent() || context.purchasePending) return;
    context.purchasePending = true;
    let balance;
    let expectedPrice;
    let purchaseTitle;
    try {
        const detailRes = await api.getPromptDetail(prompt.id, context.readOptions);
        if (!isCurrent(contentArea)) return;
        const latest = detailRes?.data;
        if (detailRes?.status !== "success" || !latest || Array.isArray(latest) || latest.id !== prompt.id ||
            typeof latest.owned !== "boolean" || !Number.isSafeInteger(latest.price) || latest.price < 0) throw new Error();
        if (latest.owned) {
            if (typeof latest.prompt_text !== "string") throw new Error();
            prompt.prompt_text = latest.prompt_text;
            prompt.owned = true;
            prompt.price = latest.price;
            renderPromptTextArea(contentArea, prompt, currentUser, true);
            context.purchasePending = false;
            return;
        }
        if (latest.price_confirmation_supported !== true) {
            context.purchasePending = false;
            showToast(t('acquire.purchase_verification_unavailable'), "warning");
            return;
        }
        expectedPrice = latest.price;
        purchaseTitle = typeof latest.title === "string" ? latest.title : prompt.title;
        const walletRes = await api.getWallet(currentUser.account, context.readOptions);
        if (!isCurrent(contentArea)) return;
        if (walletRes?.status !== "success" || !Number.isSafeInteger(walletRes.balance) || walletRes.balance < 0) throw new Error();
        balance = walletRes.balance;
    } catch (_) {
        if (isCurrent(contentArea)) { context.purchasePending = false; showToast(t('common.error'), "error"); }
        return;
    }

    const content = document.createElement("div");
    content.className = "prompt-detail-dialog";
    content.innerHTML = `
        <div class="prompt-detail-dialog__center">
            <div class="prompt-detail-dialog__icon" aria-hidden="true">💎</div>
            <div class="prompt-detail-dialog__title">${t('prompt.purchase_confirm_title')}</div>
            <div class="prompt-detail-dialog__description">${t('prompt.purchase_confirm_desc', { price: expectedPrice, title: escapeHtml(purchaseTitle) })}</div>
            <div class="prompt-detail-dialog__balance">
                ${t('prompt.purchase_balance')}: <strong class="prompt-detail-dialog__value">${balance}</strong>
            </div>
            <div class="prompt-detail-dialog__actions">
                <button type="button" id="purchase-cancel" class="prompt-detail__button">${t('common.cancel')}</button>
                <button type="button" id="purchase-confirm" class="prompt-detail__button prompt-detail__button--gold">💎 ${t('prompt.unlock', { price: expectedPrice })}</button>
            </div>
        </div>
    `;

    const modal = openOwnedModal(contentArea, `💎 ${t('prompt.purchase_confirm_title')}`, content, { width: "320px" });
    let submitted = false;
    const release = content._cleanup;
    content._cleanup = () => { release?.(); if (!submitted) context.purchasePending = false; };
    content.querySelector("#purchase-cancel").onclick = () => globalModal.closeModal(modal);
    content.querySelector("#purchase-confirm").onclick = async () => {
        if (submitted || !isCurrent(contentArea) || !modal?.isConnected) return;
        submitted = true;
        const confirmBtn = content.querySelector("#purchase-confirm");
        confirmBtn.disabled = true;
        confirmBtn.textContent = `⏳ ${t('prompt.purchasing')}`;
        try {
            const res = await api.purchasePrompt(prompt.id, expectedPrice);
            if (!isCurrent(contentArea)) return;
            if (res?.status !== "success" || typeof res.prompt_text !== "string") throw new Error();
            prompt.prompt_text = res.prompt_text;
            prompt.owned = true;
            prompt.price = expectedPrice;
            renderPromptTextArea(contentArea, prompt, currentUser, true);
            globalModal.closeModal(modal);
            showToast(t('prompt.purchase_success'), "success");
        } catch (error) {
            // 请求可能已扣款；保持本视图购买锁，重新进入详情确认拥有状态。
            if (!isCurrent(contentArea)) return;
            if (error?.code === "purchase_price_changed" || error?.code === "purchase_price_confirmation_required") {
                globalModal.closeModal(modal);
                showToast(t('acquire.price_changed'), "warning");
            } else showToast(t('prompt.purchase_failed'), "error");
        }
    };
}

/**
 * 👀 记录提示词浏览量（带60秒防抖）- 使用公共工具函数
 */
async function recordPromptView(contentArea, promptId) {
    if (!isCurrent(contentArea)) return;
    await recordView(api.recordPromptView, promptId, 'prompt', (res) => {
        if (!isCurrent(contentArea)) return;
        const totalEl = contentArea.querySelector("#prompt-view-total");
        const dailyEl = contentArea.querySelector("#prompt-view-daily");
        if (totalEl) totalEl.textContent = res.views || 0;
        if (dailyEl) dailyEl.textContent = res.daily_views || 0;
    });
}

/**
 * 🔗 绑定互动事件 - 使用公共工具函数
 */
function bindInteractionEvents(container, prompt, currentUser) {
    const btnLike = container.querySelector("#btn-like");
    const btnFavorite = container.querySelector("#btn-favorite");
    const btnTip = container.querySelector("#btn-tip");
    const likeCount = container.querySelector("#like-count");
    const favoriteCount = container.querySelector("#favorite-count");

    // 点赞
    btnLike.onclick = () => {
        if (!isCurrent(container)) return;
        handleToggleLike(api.togglePromptLike, prompt.id, btnLike, likeCount, currentUser, { isCurrent: () => isCurrent(container) });
    };

    // 收藏
    btnFavorite.onclick = () => {
        if (!isCurrent(container)) return;
        handleToggleFavorite(api.togglePromptFavorite, prompt.id, btnFavorite, favoriteCount, currentUser, { isCurrent: () => isCurrent(container) });
    };

    // 打赏
    btnTip.onclick = async () => {
        if (!isCurrent(container)) return;
        if (!currentUser) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        if (currentUser.account === prompt.author) {
            showToast(t('prompt.tip_self'), "warning");
            return;
        }
        await showTipDialog(prompt, currentUser, container);
    };
}

/**
 * 🎁 显示打赏对话框
 */
async function showTipDialog(prompt, currentUser, container) {
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
    content.className = "prompt-detail-dialog";
    content.innerHTML = `
        <div class="prompt-detail-dialog__balance">
            ${t('wallet.current_balance')}: <strong class="prompt-detail-dialog__value">${balance}</strong> ${t('wallet.credits')}
        </div>
        <div class="prompt-detail__tip-amounts">
            <button type="button" class="tip-amount prompt-detail__button" data-amount="10">10 ${t('task.points')}</button>
            <button type="button" class="tip-amount prompt-detail__button" data-amount="50">50 ${t('task.points')}</button>
            <button type="button" class="tip-amount prompt-detail__button" data-amount="100">100 ${t('task.points')}</button>
            <button type="button" class="tip-amount prompt-detail__button" data-amount="500">500 ${t('task.points')}</button>
        </div>
        <div class="prompt-detail-dialog__actions">
            <button type="button" id="tip-cancel" class="prompt-detail__button">${t('common.cancel')}</button>
        </div>
    `;

    const modal = openOwnedModal(container, `🎁 ${t('prompt.tip_dialog_title')}`, content, { width: "300px" });

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
                const res = await api.tipPrompt(prompt.id, amount, false);
                if (!isCurrent(container)) return;
                if (res?.status !== "success") throw new Error();
                context.tipPending = false;
                showToast(t('prompt.tip_success', { amount }), "success");
                globalModal.closeModal(modal);
                // 刷新页面
                loadPromptDetail(container.parentElement, prompt.id, currentUser);
            } catch (err) {
                if (isCurrent(container)) showToast(t('prompt.tip_failed'), "error");
            }
        };
    });
}

/**
 * 💬 加载评论
 */
async function loadComments(container, promptId, currentUser) {
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
        const res = await api.getPromptComments(promptId, viewContexts.get(container).readOptions);
        if (!current()) return;
        if (res?.status !== "success" || !Array.isArray(res.data)) throw new Error();
        let comments = res.data.filter(value => value && typeof value === "object" && !Array.isArray(value)
            && typeof value.author === "string" && typeof value.content === "string");
        comments = proxyImages(comments);

        if (comments.length === 0) {
            commentsList.innerHTML = `
                <div class="prompt-detail__state prompt-detail__state--compact" role="status">
                    ${t('prompt.no_comments')}
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
                    <div id="comment-${idx}" data-account="${escapeHtml(c.author)}" class="prompt-detail__comment">
                        <div class="prompt-detail__comment-header">
                            <div class="swr-avatar-container">${avatarHtml}</div>
                            <span class="swr-name prompt-detail__comment-name">${escapeHtml(name)}</span>
                            <span class="prompt-detail__muted prompt-detail__comment-time">${escapeHtml(formatTime(c.created_at))}</span>
                        </div>
                        <div class="prompt-detail__comment-body">
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
            <div class="prompt-detail__state prompt-detail__state--compact prompt-detail__state--error" role="alert">
                ${t('prompt.load_failed')}
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
            showToast(t('prompt.comment_required'), "warning");
            return;
        }
        commentInput.removeAttribute("aria-invalid");
        submission.phase = "submitting";
        sendBtn.disabled = true;
        sendBtn.setAttribute("aria-busy", "true");
        sendBtn.textContent = t('common.sending');
        try {
            const result = await api.addPromptComment(promptId, content);
            if (!submissionCurrent()) return;
            if (!isConfirmedDedicatedCommentResponse(result, account, content)) throw new Error("Unconfirmed comment");
            submission.phase = "committed";
            if (commentInput.value === originalInput) commentInput.value = "";
            showToast(t('prompt.comment_success'), "success");
            await loadComments(container, promptId, currentUser);
            if (submissionCurrent()) submission.phase = "idle";
        } catch (err) {
            if (!submissionCurrent()) return;
            if (submission.phase === "committed") {
                try { showToast(t('social.comment_refresh_required'), "warning"); } catch (_) {}
                return;
            }
            const rejected = isDefiniteCommentRejection(err);
            submission.phase = rejected ? "idle" : "unconfirmed";
            showToast(t(rejected ? 'prompt.comment_failed' : 'social.comment_unconfirmed'), rejected ? "error" : "warning");
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
 * 🗑️ 显示删除确认对话框
 */
function showDeleteConfirmDialog(prompt, container) {
    if (!isCurrent(container)) return;
    const content = document.createElement("div");
    content.className = "prompt-detail-dialog";
    content.innerHTML = `
        <div class="prompt-detail-dialog__center">
            <div class="prompt-detail-dialog__icon" aria-hidden="true">⚠️</div>
            <div class="prompt-detail-dialog__title">${t('prompt.delete_confirm')}</div>
            <div class="prompt-detail-dialog__description">${escapeHtml(prompt.title)}</div>
            <div class="prompt-detail-dialog__actions">
                <button type="button" id="delete-cancel" class="prompt-detail__button">${t('common.cancel')}</button>
                <button type="button" id="delete-confirm" class="prompt-detail__button prompt-detail__button--danger">${t('common.delete')}</button>
            </div>
        </div>
    `;

    const modal = openOwnedModal(container, t('prompt.delete_confirm'), content, { width: "300px" });

    content.querySelector("#delete-cancel").onclick = () => globalModal.closeModal(modal);
    let submitted = false;

    content.querySelector("#delete-confirm").onclick = async () => {
        if (submitted || !isCurrent(container) || !modal?.isConnected) return;
        submitted = true;
        try {
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('common.deleting');

            await api.deletePrompt(prompt.id);
            if (!isCurrent(container)) return;
            showToast(t('prompt.deleted'), "success");
            globalModal.closeModal(modal);

            // 通知列表刷新并返回
            window.dispatchEvent(new CustomEvent("comfy-prompts-refresh"));
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            if (!isCurrent(container)) return;
            showToast(t('common.error'), "error");
            submitted = false;
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.delete');
        }
    };
}
