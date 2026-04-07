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