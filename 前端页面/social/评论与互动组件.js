// 前端页面/social/评论与互动组件.js
import { api } from "../core/网络请求API.js";
import { t } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR, isAdmin } from "../core/全局配置.js";

export function setupToggleButton(btnElement, initialState, initialCount, activeText, inactiveText, activeColor, apiCallback) {
    let isActive = initialState;
    let count = initialCount;
    let isProcessing = false; 

    const updateUI = () => {
        btnElement.innerText = `${isActive ? activeText : inactiveText} (${count})`;
        btnElement.style.color = isActive ? activeColor : "#aaa";
        btnElement.style.borderColor = isActive ? activeColor : "#555";
    };

    updateUI();

    btnElement.onclick = async (e) => {
        e.stopPropagation(); 
        if (isProcessing) return;
        
        isActive = !isActive;
        count += isActive ? 1 : -1;
        updateUI();

        isProcessing = true;
        try {
            await apiCallback(isActive); 
        } catch (error) {
            console.error("操作失败，状态回滚");
            isActive = !isActive;
            count += isActive ? 1 : -1;
            updateUI();
        } finally {
            setTimeout(() => { isProcessing = false; }, 500); 
        }
    };
}

// 🚀 核心修改：在参数末尾接收外部传进来的 onCountChange 回调函数
// 🚀 P0安全修复：新增 contentAuthor 参数用于判断内容作者权限
export function createCommentSection(itemId, commentsData, currentUser, onCountChange, contentAuthor = null) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#1e1e1e", borderRadius: "4px"
    });

    const listArea = document.createElement("div");
    Object.assign(listArea.style, { flex: "1", overflowY: "auto", padding: "10px", fontSize: "12px", color: "#ccc" });

    const inputArea = document.createElement("div");
    Object.assign(inputArea.style, { display: "flex", padding: "8px", borderTop: "1px solid #333", backgroundColor: "#2a2a2a", gap: "8px" });

    let currentReplyTarget = null; 

    const inputField = document.createElement("input");
    Object.assign(inputField.style, { flex: "1", padding: "6px 10px", borderRadius: "15px", border: "1px solid #555", backgroundColor: "#1e1e1e", color: "#fff", outline: "none" });
    inputField.placeholder = t('social.say_something');

    const submitBtn = document.createElement("button");
    submitBtn.innerText = t('common.send');
    Object.assign(submitBtn.style, { padding: "4px 12px", borderRadius: "15px", border: "none", backgroundColor: "#4CAF50", color: "#fff", cursor: "pointer", fontWeight: "bold" });

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
        Object.assign(itemDiv.style, { display: "flex", gap: "8px", marginBottom: "12px", paddingLeft: isSubReply ? "35px" : "0px" });

        if (comment.isDeleted) {
            if (!comment.replies || comment.replies.length === 0) return null;
            itemDiv.innerHTML = `
                <div style="width: ${isSubReply ? '24px' : '32px'}; height: ${isSubReply ? '24px' : '32px'}; border-radius: 50%; background: #333; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #555;">✖</div>
                <div style="flex: 1; background: #2a2a2a; padding: 6px 10px; border-radius: 4px; color: #666; font-style: italic; border: 1px dashed #444;">${t('social.comment_deleted')}</div>
            `;
        } else {
            const avatarSize = isSubReply ? "24px" : "32px";
            const replyLabel = comment.replyToUserName ? `<span style="color: #888;">${t('social.reply_to')} <span style="color: #2196F3;">@${comment.replyToUserName}</span>：</span>` : "";
            
            // 🚀 P0安全修复：权限判断 - 评论作者、内容作者或管理员可删除
            const isCommentAuthor = currentUser && currentUser.account === comment.author;
            const isContentAuthor = currentUser && contentAuthor && currentUser.account === contentAuthor;
            const isAdminUser = currentUser && isAdmin(currentUser.account);
            const canDelete = isCommentAuthor || isContentAuthor || isAdminUser;
            const deleteBtnHtml = canDelete ? `<span class="delete-btn" style="color: #F44336; cursor: pointer; margin-left: 10px; font-size: 10px;">${t('common.delete')}</span>` : "";

            // 🚀 SWR 缓存优先获取头像
            const account = comment.author;
            const cached = getCachedProfile(account);
            const avatar = cached?.avatar || comment.avatar || '';
            const avatarSrc = avatar || DEFAULT_AVATAR_SVG;

            itemDiv.innerHTML = `
                <img class="swr-avatar" src="${avatarSrc}" style="width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover; background: #333;">
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span class="swr-name" style="color: #aaa; font-weight: bold; font-size: 11px;">${comment.authorName || comment.author}</span>
                    </div>
                    <div style="line-height: 1.4; word-break: break-all;">${replyLabel}${comment.content}</div>
                    <div style="display: flex; gap: 15px; margin-top: 4px; font-size: 10px; color: #777;">
                        <span class="reply-btn" style="cursor: pointer; color: #aaa;">${t('social.reply')}</span>${deleteBtnHtml}
                    </div>
                </div>
            `;

            // 🚀 后台SWR校对头像
            getProfileWithSWR(account, api.getUserProfile, (profile) => {
                const avatarEl = itemDiv.querySelector('.swr-avatar');
                const nameEl = itemDiv.querySelector('.swr-name');
                if (avatarEl && profile.avatar) {
                    avatarEl.src = profile.avatar;
                }
                if (nameEl && profile.name) {
                    nameEl.textContent = profile.name;
                }
            });

            itemDiv.querySelector(".reply-btn").onclick = () => {
                currentReplyTarget = { 
                    account: comment.author, name: comment.authorName || comment.author,
                    parentId: isSubReply ? comment.parentId : comment.id 
                };
                inputField.placeholder = `${t('social.reply_to')} @${currentReplyTarget.name}:`;
                inputField.focus();
            };

            if (canDelete) {
                itemDiv.querySelector(".delete-btn").onclick = async () => {
                    if (confirm(t('social.delete_comment_confirm'))) {
                        try {
                            // 🚀 P0安全修复：删除评论不再传递author，后端从JWT中获取
                            await api.deleteComment(itemId, comment.id);
                            comment.isDeleted = true;
                            renderList(); 
                            triggerCountUpdate();
                        } catch(e) { alert(t('feedback.delete_failed')); }
                    }
                };
            }
        }
        return itemDiv;
    }

    function renderList() {
        listArea.innerHTML = "";
        if (!commentsData || commentsData.length === 0) {
            listArea.innerHTML = `<div style="text-align:center; padding: 20px; color:#666;">${t('social.no_comments')}</div>`;
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
        listArea.scrollTop = listArea.scrollHeight;
    }

    submitBtn.onclick = async () => {
        if (!currentUser) return alert(t('feedback.login_required'));
        const text = inputField.value.trim();
        if (!text) return;

        submitBtn.disabled = true;
        try {
            const parentId = currentReplyTarget ? currentReplyTarget.parentId : null;
            const replyToAcc = currentReplyTarget ? currentReplyTarget.account : null;
            
            const res = await api.postComment(itemId, currentUser.account, text, replyToAcc, parentId);
            const newComment = res.data;
            
            if (parentId) {
                let targetParent = commentsData.find(c => c.id === parentId);
                if (targetParent) {
                    if (!targetParent.replies) targetParent.replies = [];
                    targetParent.replies.push(newComment);
                }
            } else {
                commentsData.push(newComment);
            }
            
            inputField.value = ""; inputField.placeholder = t('social.say_something');
            currentReplyTarget = null;
            renderList();
            triggerCountUpdate();
        } catch (e) {
            alert(`${t('feedback.send_failed')}: ${e.message}`);
        } finally {
            submitBtn.disabled = false;
        }
    };

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
 * @param {Function} options.onRate - 评分回调 async (score) => {}
 * @param {boolean} options.compact - true=紧凑模式，false=完整模式
 * @returns {HTMLElement} 评分组件 DOM 元素
 */
export function createRatingStars(options) {
    const {
        ratingData = {},
        currentUser = null,
        authorAccount = "",
        onRate = null,
        compact = false
    } = options;

    // 解构评分数据
    let {
        rating_avg = 0,
        rating_count = 0,
        rating_dist = {},
        rated_by = {}
    } = ratingData;

    // 内部可变状态（用于乐观更新）
    let displayAvg = typeof rating_avg === "number" && !isNaN(rating_avg) ? rating_avg : 0;
    let displayCount = typeof rating_count === "number" && !isNaN(rating_count) ? rating_count : 0;
    // 归一化 rated_by：后端存储可能是对象 {score, time}，前端统一为数字
    let displayRatedBy = {};
    for (const [account, value] of Object.entries(rated_by || {})) {
        displayRatedBy[account] = typeof value === "number" ? value : (value?.score ?? 0);
    }

    const userAccount = currentUser?.account;
    let userRating = userAccount ? (displayRatedBy[userAccount] || null) : null;

    // 第6颗星条件
    const hasSixthStar = !compact && rating_count >= 5 && ((rating_dist["5"] || 0) / rating_count) >= 0.9;

    // 交互状态
    let isSubmitting = false;
    let hoverScore = 0;

    // 尺寸配置
    const starSize = compact ? "14px" : "20px";
    const gap = "2px";

    // 判断交互权限
    const isLoggedOut = !currentUser;
    const isSelf = currentUser && currentUser.account === authorAccount;
    const canInteract = !compact && onRate && !isLoggedOut && !isSelf;

    // ========== 根容器 ==========
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "inline-flex",
        flexDirection: "column",
        gap: compact ? "0px" : "4px",
        fontFamily: "inherit",
        position: "relative"
    });

    // 注入第6颗星动画样式
    if (hasSixthStar) {
        const styleEl = document.createElement("style");
        styleEl.textContent = `
            @keyframes rating-star-glow {
                0%, 100% { filter: drop-shadow(0 0 4px #FFD700) drop-shadow(0 0 8px #FFA500); }
                50% { filter: drop-shadow(0 0 8px #FFD700) drop-shadow(0 0 16px #FFA500); }
            }
        `;
        container.appendChild(styleEl);
    }

    // ========== 第一行：星星 + 分数 ==========
    const row1 = document.createElement("div");
    Object.assign(row1.style, {
        display: "inline-flex",
        alignItems: "center",
        gap: gap
    });

    // 星星元素数组
    const stars = [];

    // 计算取整到0.5的平均值
    const roundedAvg = Math.round(displayAvg * 2) / 2;

    function getStarConfig(score, index) {
        const filled = Math.min(Math.max(score - (index - 1), 0), 1);
        if (filled >= 0.75) {
            return { char: "★", color: "#FFD700", bg: null };
        } else if (filled >= 0.25) {
            return {
                char: "★",
                color: "transparent",
                bg: "linear-gradient(90deg, #FFD700 50%, #555 50%)"
            };
        } else {
            return { char: "☆", color: "#555", bg: null };
        }
    }

    function applyStarStyle(starEl, config, isHovered = false) {
        starEl.textContent = config.char;
        starEl.style.color = config.color;
        if (config.bg) {
            starEl.style.background = config.bg;
            starEl.style.webkitBackgroundClip = "text";
            starEl.style.backgroundClip = "text";
            starEl.style.webkitTextFillColor = "transparent";
        } else {
            starEl.style.background = "";
            starEl.style.webkitBackgroundClip = "";
            starEl.style.backgroundClip = "";
            starEl.style.webkitTextFillColor = "";
        }
        starEl.style.transform = isHovered ? "scale(1.1)" : "scale(1)";
    }

    function updateStars(previewScore = 0) {
        const targetScore = previewScore || roundedAvg;
        stars.forEach((star, i) => {
            const isHovered = previewScore > 0 && i + 1 <= previewScore;
            const config = getStarConfig(targetScore, i + 1);
            applyStarStyle(star, config, isHovered);
        });
    }

    if (compact) {
        // 紧凑模式：无评分时不显示，有评分时显示 ★ 分数
        if (displayCount === 0) {
            container.style.display = "none";
            return container;
        }
        const iconStar = document.createElement("span");
        iconStar.textContent = "★";
        iconStar.style.color = "#FFD700";
        iconStar.style.fontSize = starSize;
        iconStar.style.lineHeight = "1";
        row1.appendChild(iconStar);
    } else {
        // 完整模式：5颗基础星星
        for (let i = 1; i <= 5; i++) {
            const star = document.createElement("span");
            Object.assign(star.style, {
                fontSize: starSize,
                cursor: canInteract ? "pointer" : "default",
                transition: "transform 0.15s ease, color 0.15s ease",
                display: "inline-block",
                userSelect: "none",
                lineHeight: "1"
            });

            if (canInteract) {
                star.addEventListener("mouseenter", () => {
                    if (isSubmitting) return;
                    hoverScore = i;
                    updateStars(hoverScore);
                    showTooltip(`${i} ${t('rating.stars')}`);
                });
                star.addEventListener("click", async () => {
                    if (isSubmitting) return;
                    await submitRating(i);
                });
            }

            stars.push(star);
            row1.appendChild(star);
        }

        // 第6颗星彩蛋
        if (hasSixthStar) {
            const sixthStar = document.createElement("span");
            sixthStar.textContent = "★";
            Object.assign(sixthStar.style, {
                fontSize: `calc(${starSize} * 1.15)`,
                color: "#FFD700",
                animation: "rating-star-glow 2s ease-in-out infinite",
                marginLeft: "2px",
                cursor: "help",
                lineHeight: "1",
                display: "inline-block"
            });
            sixthStar.title = t('rating.sixth_star_tip');
            row1.appendChild(sixthStar);
        }
    }

    // 分数文本
    const scoreText = document.createElement("span");
    scoreText.style.color = compact ? "#aaa" : "#ccc";
    scoreText.style.fontSize = compact ? "12px" : "14px";
    if (compact) {
        scoreText.textContent = `${displayAvg.toFixed(1)}`;
    } else {
        scoreText.textContent = `${displayAvg.toFixed(1)} (${t('rating.count', { count: displayCount })})`;
    }
    row1.appendChild(scoreText);

    container.appendChild(row1);

    // ========== 第二行：用户评分（仅完整模式） ==========
    let userRatingRow = null;
    if (!compact && userRating) {
        userRatingRow = document.createElement("div");
        Object.assign(userRatingRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "12px",
            color: "#888"
        });

        const label = document.createElement("span");
        label.textContent = `${t('rating.your_score')}:`;
        userRatingRow.appendChild(label);

        const userStars = document.createElement("span");
        userStars.textContent = "★".repeat(userRating) + "☆".repeat(5 - userRating);
        userStars.style.color = "#FFD700";
        userStars.style.fontSize = "14px";
        userRatingRow.appendChild(userStars);

        container.appendChild(userRatingRow);
    }

    // ========== Tooltip ==========
    const tooltip = document.createElement("div");
    Object.assign(tooltip.style, {
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: "0",
        padding: "4px 8px",
        backgroundColor: "rgba(0,0,0,0.9)",
        color: "#fff",
        fontSize: "11px",
        borderRadius: "4px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        opacity: "0",
        transition: "opacity 0.2s ease",
        zIndex: "1000",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
    });
    container.appendChild(tooltip);

    function showTooltip(text) {
        tooltip.textContent = text;
        tooltip.style.opacity = "1";
    }
    function hideTooltip() {
        tooltip.style.opacity = "0";
    }

    // 非交互状态下的 tooltip 事件
    if (!compact) {
        if (isLoggedOut) {
            row1.addEventListener("mouseenter", () => showTooltip(t('rating.login_required')));
            row1.addEventListener("mouseleave", hideTooltip);
        } else if (isSelf) {
            row1.addEventListener("mouseenter", () => showTooltip(t('rating.self_forbidden')));
            row1.addEventListener("mouseleave", hideTooltip);
        } else if (canInteract) {
            row1.addEventListener("mouseleave", () => {
                hoverScore = 0;
                updateStars(0);
                hideTooltip();
            });
        }
    }

    // ========== 提交评分 ==========
    async function submitRating(score) {
        if (!onRate) return;
        isSubmitting = true;

        // 保存旧状态用于回滚
        const oldAvg = displayAvg;
        const oldCount = displayCount;
        const oldUserRating = userRating;

        // 乐观更新
        if (oldUserRating) {
            displayAvg = (oldAvg * oldCount - oldUserRating + score) / oldCount;
        } else {
            displayCount = oldCount + 1;
            displayAvg = (oldAvg * oldCount + score) / displayCount;
        }
        displayRatedBy[userAccount] = score;
        userRating = score;

        // 更新 UI
        scoreText.textContent = `${displayAvg.toFixed(1)} (${t('rating.count', { count: displayCount })})`;
        updateStars(0);
        updateUserRatingRow();

        try {
            const res = await onRate(score);
            if (!res || res.success === false) {
                throw new Error('Rating failed');
            }
            const { showToast } = await import('../components/UI交互提示组件.js');
            showToast(t('rating.submit_success'), 'success');
        } catch (err) {
            console.error('评分失败:', err);
            // 回滚
            displayAvg = oldAvg;
            displayCount = oldCount;
            userRating = oldUserRating;
            if (oldUserRating) {
                displayRatedBy[userAccount] = oldUserRating;
            } else {
                delete displayRatedBy[userAccount];
            }
            scoreText.textContent = `${displayAvg.toFixed(1)} (${t('rating.count', { count: displayCount })})`;
            updateStars(0);
            updateUserRatingRow();
            const { showToast } = await import('../components/UI交互提示组件.js');
            showToast(t('rating.submit_failed'), 'error');
        } finally {
            isSubmitting = false;
            hoverScore = 0;
            hideTooltip();
        }
    }

    // 更新/创建用户评分行
    function updateUserRatingRow() {
        if (userRatingRow) {
            userRatingRow.remove();
            userRatingRow = null;
        }
        if (userRating && !compact) {
            userRatingRow = document.createElement("div");
            Object.assign(userRatingRow.style, {
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: "#888"
            });

            const label = document.createElement("span");
            label.textContent = `${t('rating.your_score')}:`;
            userRatingRow.appendChild(label);

            const userStars = document.createElement("span");
            userStars.textContent = "★".repeat(userRating) + "☆".repeat(5 - userRating);
            userStars.style.color = "#FFD700";
            userStars.style.fontSize = "14px";
            userRatingRow.appendChild(userStars);

            container.appendChild(userRatingRow);
        }
    }

    // 初始化显示
    if (!compact) {
        updateStars(0);
    }

    return container;
}