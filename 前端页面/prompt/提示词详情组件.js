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
import { showToast } from "../components/UI交互提示组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { getVideoPlayerHTML, setupVideoPlayerEvents, cleanupVideoPlayer } from "../components/视频播放器组件.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t, tIfExists } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR, IS_WEB_MODE, API, CACHE } from "../core/全局配置.js";
import { findInListCache } from "../components/性能优化工具.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { recordView, handleToggleLike, handleToggleFavorite, renderTipBoardHTML as renderCommonTipBoardHTML, escapeHtml, formatTime } from "../components/互动工具函数.js";  // 🧹 P2归一：局部 formatTime 已移除

import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

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
    const initial = (name || 'U')[0].toUpperCase();
    // 🔒 XSS防护：avatar / name 均来自他人可修改的资料（昵称首字母可能是 < ），写入 HTML 前必须转义
    if (avatar) {
        return `<img class="swr-avatar" src="${escapeHtml(avatar)}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; ${extraStyle}">`;
    }
    const fontSize = Math.max(9, Math.round(size * 0.4));
    return `<div class="swr-avatar" style="width: ${size}px; height: ${size}px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: ${fontSize}px; font-weight: bold;">${escapeHtml(initial)}</div>`;
}

/**
 * 🔄 用 SWR 回调更新已渲染的头像元素
 */
function _updateAvatarElement(avatarEl, profile, size, extraStyle = '') {
    if (!avatarEl || !profile.avatar) return;
    if (avatarEl.tagName === 'IMG') {
        avatarEl.src = profile.avatar;
    } else {
        avatarEl.outerHTML = `<img class="swr-avatar" src="${escapeHtml(profile.avatar)}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; ${extraStyle}">`;
    }
}

/**
 * 📄 创建提示词详情视图
 */
export function createPromptDetailView(promptId, currentUser) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        color: "#ccc",
        fontSize: "14px",
        padding: "0",
        overflowY: "auto",
        flex: "1",
        boxSizing: "border-box"
    });

    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div style="display: flex; align-items: center; gap: 10px; padding: 15px; border-bottom: 1px solid #444; background: #1a1a1a;">
            <button id="btn-back-prompt-detail" style="background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#667eea'; this.style.borderColor='#667eea'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                ⬅ ${t('common.back')}
            </button>
            <span style="font-size: 16px; font-weight: bold; color: #fff;">${t('prompt.detail_title')}</span>
        </div>

        <!-- 内容区域 -->
        <div id="prompt-content" style="flex: 1; overflow-y: auto; padding: 15px;">
            <div style="text-align: center; padding: 60px; color: #888;">
                <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
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
            <div style="text-align: center; padding: 60px; color: #F44336;">
                <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
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
        <div style="margin-top: 12px; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 8px;">
            <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">🎵 ${t('prompt.audio_label')}</div>
            <audio controls preload="metadata" src="${escapeHtml(prompt.audio_url)}" style="width: 100%; display: block;"></audio>
        </div>` : '';

    // 检查当前用户是否已点赞/收藏
    const isLiked = prompt.liked_by?.includes(currentUser?.account) || false;
    const isFavorited = prompt.favorited_by?.includes(currentUser?.account) || false;

    contentArea.innerHTML = `
            <!-- 媒体展示区 -->
            <div id="media-area" style="margin-bottom: 15px;">
                ${mediaHTML}
                ${audioHTML}
            </div>

            <!-- 标题 -->
            <div style="font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 8px; line-height: 1.4;">
                ${escapeHtml(prompt.title)}
            </div>

            <!-- 原创标识 -->
            ${prompt.is_original ? `
            <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px;
                        background: linear-gradient(135deg, #FF6B35, #FF8F00); border-radius: 12px;
                        font-size: 11px; color: #fff; font-weight: 500; margin-bottom: 12px;">
                🎨 ${t('prompt.original_badge')}
            </div>
            ` : ''}

            <!-- 分类与价格标签 -->
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span style="display: inline-block; background: rgba(118, 75, 162, 0.25); border: 1px solid rgba(118, 75, 162, 0.5); color: #CE93D8; font-size: 11px; padding: 3px 10px; border-radius: 10px;">${prompt.prompt_type === 'video' ? '🎬' : (prompt.prompt_type === 'music' ? '🎵' : '🎨')} ${escapeHtml(tIfExists('promptcat.' + (prompt.category || ''), prompt.category || ''))}</span>
                ${prompt.price > 0
                    ? `<span style="background: linear-gradient(135deg, #FFD700, #FFA000); color: #333; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 10px;">💎 ${prompt.price}</span>`
                    : `<span style="background: rgba(76, 175, 80, 0.25); color: #4CAF50; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 10px; border: 1px solid rgba(76, 175, 80, 0.5);">${t('prompt.free')}</span>`}
                ${prompt.owned ? `<span style="background: rgba(33, 150, 243, 0.25); color: #64B5F6; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 10px; border: 1px solid rgba(33, 150, 243, 0.5);">${t('prompt.owned_mark')}</span>` : ''}
            </div>

            <!-- 🏷️ 标签展示 -->
            ${(Array.isArray(prompt.tags) && prompt.tags.length) ? `
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                ${prompt.tags.map(tag => `<span style="display: inline-block; background: rgba(0,188,212,0.12); border: 1px solid rgba(0,188,212,0.35); color: #4DD0E1; font-size: 11px; padding: 2px 8px; border-radius: 10px;">#${escapeHtml(tag)}</span>`).join('')}
            </div>` : ''}

            <!-- 作者信息（SWR 缓存头像） -->
            <div id="author-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: #1a1a1a; border-radius: 8px; cursor: pointer;">
                <div class="swr-avatar-container" style="width: 40px; height: 40px;"></div>
                <div style="flex: 1;">
                    <div class="swr-name" style="font-size: 14px; font-weight: 500; color: #fff;">${escapeHtml(prompt.author_name || prompt.author)}</div>
                    <div style="font-size: 11px; color: #888;">${formatTime(prompt.created_at)}</div>
                </div>
                ${isOwner ? `
                <div style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
                    ${IS_WEB_MODE ? '' : `<button id="btn-edit-prompt" style="background: #2196F3; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;" title="${t('common.edit')}">✏️</button>`}
                    <button id="btn-delete-prompt" style="background: #F44336; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;" title="${t('common.delete')}">🗑️</button>
                </div>
                ` : ''}
            </div>

            <!-- 简介内容 -->
            <div style="font-size: 14px; color: #ddd; line-height: 1.8; margin-bottom: 20px; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml((prompt.content || '').trim())}</div>

            <!-- 🔑 提示词正文区（付费遮罩/解锁/复制） -->
            <div id="prompt-text-area" style="margin-bottom: 20px;"></div>

            <!-- 互动按钮栏 -->
            <div id="interaction-bar" style="display: flex; align-items: center; gap: 15px; padding: 15px 0; border-top: 1px solid var(--border-color, #333); border-bottom: 1px solid var(--border-color, #333);">
                <button id="btn-like" style="background: ${isLiked ? '#FF5722' : 'var(--comfy-input-bg)'}; border: 1px solid ${isLiked ? '#FF5722' : '#555'}; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    ❤️ <span id="like-count">${prompt.likes || 0}</span>
                </button>
                <button id="btn-favorite" style="background: ${isFavorited ? '#FFC107' : 'var(--comfy-input-bg)'}; border: 1px solid ${isFavorited ? '#FFC107' : '#555'}; color: ${isFavorited ? '#000' : '#fff'}; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    🔖 <span id="favorite-count">${prompt.favorites || 0}</span>
                </button>
                <button id="btn-tip" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    ${t('prompt.tip_author')}
                </button>
                <!-- 👀 浏览量统计（纯展示） -->
                <div style="display: flex; align-items: center; gap: 12px; margin-left: auto; color: #888; font-size: 13px;">
                    <span style="display: flex; align-items: center; gap: 4px;">🔥 <span id="prompt-view-total">${prompt.views || 0}</span></span>
                    <span style="display: flex; align-items: center; gap: 4px;">📅 <span id="prompt-view-daily">${prompt.daily_views || 0}</span></span>
                </div>
            </div>

            <!-- 打赏榜单 -->
            <div id="tip-board-area" style="margin: 15px 0;">
                ${renderCommonTipBoardHTML(prompt.tip_board || [], 5, t('prompt.no_tips'))}
            </div>

            <!-- 评论区 -->
            <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                ${t('prompt.comments_title')} <span style="color: #888; font-weight: normal;">(${prompt.comments || 0})</span>
            </div>

            <!-- 评论输入框 -->
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <input type="text" id="comment-input" placeholder="${t('prompt.comment_placeholder')}" style="flex: 1; padding: 10px 12px; background: var(--comfy-input-bg); border: 1px solid #444; border-radius: 20px; color: #fff; font-size: 13px; outline: none;" onfocus="this.style.borderColor='#764ba2'" onblur="this.style.borderColor='#444'">
                <button id="btn-send-comment" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: #fff; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;">
                    ${t('common.send')}
                </button>
            </div>

            <!-- 评论列表 -->
            <div id="comments-list" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">⏳</div>
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
            const avatar = cached?.avatar || prompt.author_avatar || '';
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
        contentArea.querySelector("#author-row").onclick = (e) => {
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

    if (isUnlocked && prompt.prompt_text) {
        // ✅ 已解锁：展示正文 + 一键复制
        textArea.innerHTML = `
            <div style="background: #1a1a1a; border: 1px solid rgba(118, 75, 162, 0.5); border-radius: 8px; overflow: hidden;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #333; background: rgba(118, 75, 162, 0.15);">
                    <span style="font-size: 13px; font-weight: bold; color: #CE93D8;">🔑 ${t('prompt.text_label')}</span>
                    <button id="btn-copy-prompt" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: #fff; padding: 6px 16px; border-radius: 16px; cursor: pointer; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                        📋 ${t('prompt.copy')}
                    </button>
                </div>
                <div style="padding: 14px; font-size: 13px; color: #ddd; line-height: 1.7; font-family: monospace; white-space: pre-wrap; word-wrap: break-word; user-select: text;">${escapeHtml(prompt.prompt_text)}</div>
            </div>
        `;
        textArea.querySelector("#btn-copy-prompt").onclick = () => {
            if (isCurrent(contentArea)) copyToClipboard(prompt.prompt_text, textArea.querySelector("#btn-copy-prompt"), () => isCurrent(contentArea));
        };
    } else if (prompt.price > 0) {
        // 🔒 付费遮罩：模糊预览 + 解锁按钮
        textArea.innerHTML = `
            <div style="position: relative; min-height: 240px; background: #1a1a1a; border: 1px solid #444; border-radius: 8px; overflow: hidden;">
                <div style="padding: 14px; min-height: 240px; box-sizing: border-box; font-size: 13px; color: #ddd; line-height: 1.7; font-family: monospace; filter: blur(8px); user-select: none; pointer-events: none;">
                    ${escapeHtml((prompt.content || '') + '\n' + (prompt.content || ''))}
                </div>
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgba(0,0,0,0.35);">
                    <div style="font-size: 28px;">🔒</div>
                    <div style="font-size: 14px; font-weight: bold; color: #fff;">${t('prompt.locked_title')}</div>
                    <div style="font-size: 12px; color: #bbb; max-width: 80%; text-align: center;">${t('prompt.locked_desc')}</div>
                    <button id="btn-unlock-prompt" style="background: linear-gradient(135deg, #FFD700, #FFA000); border: none; color: #333; padding: 10px 28px; border-radius: 20px; cursor: pointer; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 6px; transition: 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        💎 ${t('prompt.unlock', { price: prompt.price })}
                    </button>
                </div>
            </div>
        `;
        textArea.querySelector("#btn-unlock-prompt").onclick = () => {
            showPurchaseConfirmDialog(contentArea, prompt, currentUser);
        };
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
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 36px; margin-bottom: 12px;">💎</div>
            <div style="font-size: 15px; font-weight: bold; color: #fff; margin-bottom: 10px;">${t('prompt.purchase_confirm_title')}</div>
            <div style="font-size: 13px; color: #aaa; margin-bottom: 15px; line-height: 1.6;">${t('prompt.purchase_confirm_desc', { price: expectedPrice, title: escapeHtml(purchaseTitle) })}</div>
            <div style="margin-bottom: 15px; background: rgba(255,152,0,0.1); padding: 10px; border-radius: 4px; border: 1px solid #FF9800;">
                ${t('prompt.purchase_balance')}: <strong style="color:#FF9800;">${balance}</strong>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="purchase-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="purchase-confirm" style="flex: 1; background: linear-gradient(135deg, #FFD700, #FFA000); border: none; color: #333; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">💎 ${t('prompt.unlock', { price: expectedPrice })}</button>
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
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="margin-bottom: 12px; background: rgba(255,152,0,0.1); padding: 10px; border-radius: 4px; border: 1px solid #FF9800; text-align: center;">
            ${t('wallet.current_balance')}: <strong style="color:#FF9800;">${balance}</strong> ${t('wallet.credits')}
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 15px;">
            <button class="tip-amount" data-amount="10" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">10 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="50" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">50 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="100" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">100 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="500" style="background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">500 ${t('task.points')}</button>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="tip-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
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
                <div style="text-align: center; padding: 30px; color: #666; font-size: 13px;">
                    ${t('prompt.no_comments')}
                </div>
            `;
        } else {
            // 🚀 SWR 头像渲染：评论作者头像
            commentsList.innerHTML = comments.map((c, idx) => {
                const cached = getCachedProfile(c.author);
                const avatar = cached?.avatar || c.author_avatar || '';
                const name = cached?.name || c.author_name || c.author || '';

                const avatarHtml = _generateAvatarHtml(avatar, name, 24, 'background: var(--comfy-input-bg);');

                return `
                    <div id="comment-${idx}" data-account="${escapeHtml(c.author)}" style="background: #1a1a1a; padding: 12px; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <div class="swr-avatar-container">${avatarHtml}</div>
                            <span class="swr-name" style="font-size: 13px; color: #fff; font-weight: 500;">${escapeHtml(name)}</span>
                            <span style="font-size: 11px; color: #888; margin-left: auto;">${formatTime(c.created_at)}</span>
                        </div>
                        <div style="font-size: 13px; color: #ddd; line-height: 1.5; padding-left: 32px;">
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
            <div style="text-align: center; padding: 20px; color: #F44336; font-size: 12px;">
                ${t('prompt.load_failed')}
            </div>
        `;
    }

    // 发送评论
    sendBtn.onclick = async () => {
        if (!isCurrent(container) || !sendBtn.isConnected || sendBtn.disabled) return;
        if (!currentUser) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        const content = commentInput.value.trim();
        if (!content) {
            showToast(t('prompt.comment_required'), "warning");
            return;
        }
        try {
            sendBtn.disabled = true;
            sendBtn.textContent = t('common.sending');
            const result = await api.addPromptComment(promptId, content);
            if (!isCurrent(container) || !sendBtn.isConnected) return;
            if (result?.status !== "success") throw new Error();
            if (commentInput.value.trim() === content) commentInput.value = "";
            showToast(t('prompt.comment_success'), "success");
            loadComments(container, promptId, currentUser);
        } catch (err) {
            if (isCurrent(container) && sendBtn.isConnected) showToast(t('prompt.comment_failed'), "error");
        } finally {
            if (!isCurrent(container) || !sendBtn.isConnected) return;
            sendBtn.disabled = false;
            sendBtn.textContent = t('common.send');
        }
    };

    // 回车发送
    commentInput.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
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
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 10px;">${t('prompt.delete_confirm')}</div>
            <div style="font-size: 13px; color: #888; margin-bottom: 20px;">${escapeHtml(prompt.title)}</div>
            <div style="display: flex; gap: 10px;">
                <button id="delete-cancel" style="flex: 1; background: var(--comfy-input-bg); border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="delete-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.delete')}</button>
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
