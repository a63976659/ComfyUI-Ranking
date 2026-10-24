// 前端页面/social/评论与互动组件.js
import { api } from "../core/网络请求API.js";
import { t } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR, normalizeProfileImageUrl, isAdmin } from "../core/全局配置.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
// 🧹 P2归一：escapeHtml 局部副本已移除，改用统一版
import { escapeHtml } from "../components/互动工具函数.js";

import { captureRequestSession } from "../core/网络请求_基础设施.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { CACHE } from "../core/全局配置.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";
import { isConfirmedCommentResponse, isConfirmedCommentDeletion, isDefiniteCommentRejection } from "./评论数据工具.js";

export { setupToggleButton } from "./互动按钮.js";

// 🚀 核心修改：在参数末尾接收外部传进来的 onCountChange 回调函数
// 🚀 P0安全修复：新增 contentAuthor 参数用于判断内容作者权限
export function createCommentSection(itemId, commentsData, currentUser, onCountChange, contentAuthor = null) {
    const container = document.createElement("div");
    container.className = "comment-section";

    const listArea = document.createElement("div");
    listArea.className = "comment-section__list";

    const inputArea = document.createElement("div");
    inputArea.className = "comment-section__composer";

    let currentReplyTarget = null;
    let sending = false, deleting = false, blocked = false, scope = null, constructing = true, observer;
    let active = true, generation = 0, writePending = false;
    let sendFocus = null;
    const account = currentUser?.account || null;
    const matches = captureRequestSession();
    const sessionMatches = () => matches() && (getUser()?.account || null) === account;
    const current = () => active && (scope ? scope.isCurrent() : sessionMatches()) && container.isConnected;
    const profileCurrent = () => active && (scope ? scope.isCurrent() : sessionMatches()) && (constructing || container.isConnected);

    const inputField = document.createElement("input");
    inputField.className = "comment-section__input";
    inputField.placeholder = t('social.say_something');
    inputField.setAttribute('aria-label', inputField.placeholder);

    const submitBtn = document.createElement("button");
    submitBtn.innerText = t('common.send');
    submitBtn.className = "comment-section__send";
    submitBtn.type = "button";

    const notice = document.createElement('div');
    notice.className = 'comment-section__empty';
    notice.setAttribute('role', 'alert');
    function setControls() {
        const busy = sending || deleting;
        submitBtn.disabled = busy || blocked;
        inputField.readOnly = busy || blocked;
        submitBtn.setAttribute('aria-busy', String(busy));
        inputArea.setAttribute('aria-busy', String(busy));
        listArea.querySelectorAll('.reply-btn,.delete-btn').forEach(button => { button.disabled = busy || blocked; });
    }
    function clearSendFocus(record = sendFocus) {
        if (!record || record !== sendFocus) return;
        document.removeEventListener('focusin', record.onFocus, true);
        document.removeEventListener('pointerdown', record.onPointer, true);
        sendFocus = null;
    }
    function captureSendFocus() {
        clearSendFocus();
        if (document.activeElement !== submitBtn) return null;
        const record = { generation };
        record.onFocus = event => {
            if (event.target !== submitBtn && event.target !== document.body) clearSendFocus(record);
        };
        record.onPointer = () => clearSendFocus(record);
        sendFocus = record;
        document.addEventListener('focusin', record.onFocus, true);
        document.addEventListener('pointerdown', record.onPointer, true);
        return record;
    }
    function restoreSendFocus(record) {
        if (!record || record !== sendFocus) return;
        const target = blocked ? notice : inputField;
        const owned = current() && record.generation === generation && document.hasFocus()
            && (document.activeElement === document.body || document.activeElement === submitBtn)
            && !container.closest('[inert], [hidden], [aria-hidden="true"]')
            && target.isConnected && target.getClientRects().length > 0
            && getComputedStyle(target).visibility !== 'hidden';
        clearSendFocus(record);
        if (owned) {
            if (target === notice) notice.tabIndex = -1;
            target.focus({ preventScroll: true });
        }
    }

    function unconfirmed() {
        blocked = true;
        notice.textContent = t('social.comment_unconfirmed');
        inputArea.append(notice);
        setControls();
        showToast(t('social.comment_unconfirmed'), 'warning');
    }

    function refreshRequired() {
        blocked = true;
        notice.textContent = t('social.comment_refresh_required');
        inputArea.append(notice); setControls();
        showToast(t('social.comment_refresh_required'), 'warning');
    }

    // 🚀 核心新增：封装一个统计算法，每次发生数据变动时向外抛出真实的评论数量
    const triggerCountUpdate = () => {
        if (onCountChange) {
            const currentTotalCount = commentsData.reduce((acc, c) => {
                const parentCnt = c.isDeleted ? 0 : 1;
                const repliesCnt = (c.replies || []).filter(r => !r.isDeleted).length;
                return acc + parentCnt + repliesCnt;
            }, 0);
            onCountChange(currentTotalCount);
        }
    };

    // 内联 SVG 默认头像
    const DEFAULT_AVATAR_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23333'/%3E%3Ccircle cx='18' cy='14' r='6' fill='%23666'/%3E%3Cpath d='M6 32c0-6.6 5.4-12 12-12s12 5.4 12 12' fill='%23666'/%3E%3C/svg%3E";

    function renderCommentItem(comment, isSubReply = false) {
        const itemDiv = document.createElement("div");
        itemDiv.className = "comment-section__item" + (isSubReply ? " comment-section__item--reply" : "");

        if (comment.isDeleted) {
            if (!comment.replies || comment.replies.length === 0) return null;
            itemDiv.innerHTML = `
                <div class="comment-section__avatar comment-section__deleted-icon" aria-hidden="true">✖</div>
                <div class="comment-section__deleted">${t('social.comment_deleted')}</div>
            `;
        } else {
            const replyLabel = comment.replyToUserName ? `<span class="comment-section__reply-label">${t('social.reply_to')} <span class="comment-section__reply-name">@${escapeHtml(comment.replyToUserName)}</span>: </span>` : "";
            
            // 🚀 P0安全修复：权限判断 - 评论作者、内容作者或管理员可删除
            const isCommentAuthor = currentUser && currentUser.account === comment.author;
            const isContentAuthor = currentUser && contentAuthor && currentUser.account === contentAuthor;
            const isAdminUser = currentUser && isAdmin(currentUser.account);
            const canDelete = isCommentAuthor || isContentAuthor || isAdminUser;
            const deleteBtnHtml = canDelete ? `<button type="button" class="delete-btn comment-section__action comment-section__action--delete">${t('common.delete')}</button>` : "";

            // 🚀 SWR 缓存优先获取头像
            const account = comment.author;
            const cached = getCachedProfile(account);
            const avatar = [cached?.avatar, comment.avatar].map(value => normalizeProfileImageUrl(value)).find(Boolean) || '';
            const avatarSrc = avatar || DEFAULT_AVATAR_SVG;

            itemDiv.innerHTML = `
                <img class="swr-avatar comment-section__avatar" src="${escapeHtml(avatarSrc)}" alt="">
                <div class="comment-section__body">
                    <div class="comment-section__header">
                        <span class="swr-name comment-section__name">${escapeHtml(comment.authorName || comment.author)}</span>
                    </div>
                    <div class="comment-section__content">${replyLabel}${escapeHtml(comment.content)}</div>
                    <div class="comment-section__actions">
                        <button type="button" class="reply-btn comment-section__action" ${sending ? "disabled" : ""}>${t('social.reply')}</button>${deleteBtnHtml}
                    </div>
                </div>
            `;

            // 🚀 后台SWR校对头像
            const profileGeneration = generation;
            getProfileWithSWR(account, api.getUserProfile, (profile) => {
                const avatarEl = itemDiv.querySelector('.swr-avatar');
                const nameEl = itemDiv.querySelector('.swr-name');
                if (profileGeneration !== generation || !profileCurrent() || !profile || typeof profile !== 'object' || Array.isArray(profile)
                    || (profile.account != null && profile.account !== account)) return;
                const avatar = normalizeProfileImageUrl(profile.avatar);
                if (avatarEl && avatar) {
                    avatarEl.src = avatar;
                }
                if (nameEl && typeof profile.name === 'string' && profile.name) {
                    nameEl.textContent = profile.name;
                }
            });

            itemDiv.querySelector(".reply-btn").onclick = () => {
                if (!current() || sending || deleting || blocked) return;
                currentReplyTarget = { 
                    account: comment.author, name: comment.authorName || comment.author,
                    parentId: isSubReply ? comment.parentId : comment.id 
                };
                inputField.placeholder = `${t('social.reply_to')} @${currentReplyTarget.name}:`;
                inputField.setAttribute('aria-label', inputField.placeholder);
                inputField.focus();
            };

            if (canDelete) {
                itemDiv.querySelector(".delete-btn").onclick = async () => {
                    if (!current() || sending || deleting || blocked) return;
                    const operationGeneration = generation;
                    const startedWithFocus = container.contains(document.activeElement);
                    deleting = true; setControls();
                    let requested = false, confirmedWrite = false;
                    try {
                        const confirmed = await showConfirm(t('social.delete_comment_confirm'), {
                            title: t('social.delete_comment_title'), confirmText: t('common.confirm'),
                            cancelText: t('common.cancel'), type: 'danger', signal: confirmationAbort.signal
                        });
                        if (!confirmed || !current() || operationGeneration !== generation) return;
                        requested = true; writePending = true;
                        const response = await api.deleteComment(itemId, comment.id);
                        if (!current() || operationGeneration !== generation) return;
                        if (!isConfirmedCommentDeletion(response)) { unconfirmed(); return; }
                        confirmedWrite = true;
                        comment.isDeleted = true;
                        const restoreFocus = startedWithFocus && (container.contains(document.activeElement) || document.activeElement === document.body);
                        renderList();
                        if (restoreFocus) inputField.focus();
                        triggerCountUpdate();
                    } catch (error) {
                        if (!current() || operationGeneration !== generation) return;
                        if (confirmedWrite) refreshRequired();
                        else if (!requested || isDefiniteCommentRejection(error)) showToast(t('feedback.delete_failed') + t('feedback.retry_suffix'), 'error');
                        else unconfirmed();
                    } finally {
                        if (current() && operationGeneration === generation) {
                            deleting = false; writePending = false; setControls();
                            if (startedWithFocus && document.activeElement === document.body) {
                                const trigger = itemDiv.querySelector('.delete-btn');
                                (trigger?.isConnected && !trigger.disabled ? trigger : inputField).focus();
                            }
                        }
                    }
                };
            }
        }
        return itemDiv;
    }

    function renderList() {
        listArea.innerHTML = "";
        if (!commentsData || commentsData.length === 0) {
            listArea.innerHTML = `<div class="comment-section__empty">${t('social.no_comments')}</div>`;
            return;
        }

        commentsData.forEach(parentComment => {
            const parentDom = renderCommentItem(parentComment, false);
            if (parentDom) listArea.appendChild(parentDom);

            if (parentComment.replies && parentComment.replies.length > 0) {
                parentComment.replies.forEach(subComment => {
                    subComment.parentId = parentComment.id; 
                    const subDom = renderCommentItem(subComment, true);
                    if (subDom) listArea.appendChild(subDom);
                });
            }
        });
        if (!listArea.firstElementChild) {
            listArea.innerHTML = `<div class="comment-section__empty">${t('social.no_comments')}</div>`;
        }
        setControls();
        listArea.scrollTop = listArea.scrollHeight;
    }

    submitBtn.onclick = async () => {
        if (!current() || sending || deleting || blocked) return;
        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
        const text = inputField.value.trim();
        if (!text) return;

        const focusRecord = captureSendFocus();
        const operationGeneration = generation;
        sending = true;
        const submittedValue = inputField.value;
        setControls();
        let confirmedWrite = false;
        try {
            const parentId = currentReplyTarget ? currentReplyTarget.parentId : null;
            const replyToAcc = currentReplyTarget ? currentReplyTarget.account : null;
            
            writePending = true;
            const res = await api.postComment(itemId, currentUser.account, text, replyToAcc, parentId);
            if (!current() || operationGeneration !== generation) return;
            if (!isConfirmedCommentResponse(res, account, replyToAcc)
                || commentsData.some(c => c.id === res.data.id || (c.replies || []).some(r => r.id === res.data.id))) {
                unconfirmed(); return;
            }
            confirmedWrite = true;
            const newComment = res.data;
            
            if (parentId) {
                let targetParent = commentsData.find(c => c.id === parentId);
                if (!targetParent) { refreshRequired(); return; }
                if (targetParent) {
                    if (!targetParent.replies) targetParent.replies = [];
                    targetParent.replies.push(newComment);
                }
            } else {
                commentsData.push(newComment);
            }
            
            if (inputField.value === submittedValue) inputField.value = "";
            inputField.placeholder = t('social.say_something');
            inputField.setAttribute('aria-label', inputField.placeholder);
            currentReplyTarget = null;
            renderList();
            triggerCountUpdate();
        } catch (error) {
            if (!current() || operationGeneration !== generation) return;
            if (confirmedWrite) refreshRequired();
            else if (isDefiniteCommentRejection(error)) showToast(t('feedback.send_failed_retry'), 'error');
            else unconfirmed();
        } finally {
            if (current() && operationGeneration === generation) { writePending = false; sending = false; setControls(); }
            restoreSendFocus(focusRecord);
        }
    };

    let confirmationAbort = new AbortController();
    scope = createTaskViewScope({
        sessionMatches, connected: () => constructing || container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => {},
        invalidate: () => { notice.textContent = t('auth.session_changed'); container.append(notice); }
    });
    scope.addCleanup(() => {
        clearSendFocus();
        active = false; generation++;
        observer?.disconnect(); confirmationAbort.abort();
        inputField.value = ''; currentReplyTarget = null; commentsData = [];
        blocked = true; sending = deleting = false; setControls(); container.replaceChildren();
    });
    container._setActive = value => {
        const next = !!value;
        if (next === active) return;
        if (next && !scope.isCurrent()) return;
        clearSendFocus();
        generation++;
        active = next;
        if (!next) {
            if (writePending) {
                blocked = true;
                notice.textContent = t('social.comment_unconfirmed');
                inputArea.append(notice);
            }
            confirmationAbort.abort();
            inputField.value = ''; currentReplyTarget = null;
            inputField.placeholder = t('social.say_something');
            inputField.setAttribute('aria-label', inputField.placeholder);
            sending = deleting = writePending = false;
        } else confirmationAbort = new AbortController();
        setControls();
        if (!active) {
            submitBtn.disabled = true; inputField.readOnly = true;
            listArea.querySelectorAll('.reply-btn,.delete-btn').forEach(button => { button.disabled = true; });
        }
    };
    container._cleanup = () => scope.dispose();
    queueMicrotask(() => {
        constructing = false;
        if (!scope.isCurrent()) return;
        observer = new MutationObserver(() => { if (!container.isConnected) scope.dispose(); });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    inputArea.appendChild(inputField); inputArea.appendChild(submitBtn);
    container.appendChild(listArea); container.appendChild(inputArea);
    renderList();
    return container;
}

// ==========================================
// ⭐ 星星评分组件
// ==========================================

/**
 * 创建可复用的星星评分组件
 * @param {Object} options - 配置选项
 * @param {Object} options.ratingData - 评分数据 { rating_avg, rating_count, rating_dist, rated_by }
 * @param {Object} options.currentUser - 当前用户 { account }，null 表示未登录
 * @param {string} options.authorAccount - 作品作者 account
 * @param {Function} options.onRate - 评分回调 async (score, {isCurrent}) => response
 * @param {Function} [options.isCurrent] - 原页面仍有效的检查
 * @param {boolean} options.compact - true=紧凑模式，false=完整模式
 * @returns {HTMLElement} 评分组件 DOM 元素
 */
export { createRatingStars, isValidRatingResponse } from "./评分组件.js";
