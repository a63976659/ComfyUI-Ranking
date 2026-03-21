// 前端页面/评论与互动组件.js
import { api } from "./网络请求API.js";

// ==========================================
// 1. 防抖与状态 Toggle 逻辑 (Optimistic UI)
// ==========================================
export function setupToggleButton(btnElement, initialState, initialCount, activeText, inactiveText, activeColor, apiCallback) {
    let isActive = initialState;
    let count = initialCount;
    let isProcessing = false; // 防止狂点

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
            isActive = !isActive;
            count += isActive ? 1 : -1;
            updateUI();
        } finally {
            setTimeout(() => { isProcessing = false; }, 500); 
        }
    };
}

// ==========================================
// 2. 仿小红书/TikTok 的评论楼层与软删除系统
// ==========================================
export function createCommentSection(itemId, commentsData, currentUser) {
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
    inputField.placeholder = "说点什么...";

    const submitBtn = document.createElement("button");
    submitBtn.innerText = "发送";
    Object.assign(submitBtn.style, { padding: "4px 12px", borderRadius: "15px", border: "none", backgroundColor: "#4CAF50", color: "#fff", cursor: "pointer", fontWeight: "bold" });

    function renderCommentItem(comment, isSubReply = false) {
        const itemDiv = document.createElement("div");
        Object.assign(itemDiv.style, { display: "flex", gap: "8px", marginBottom: "12px", paddingLeft: isSubReply ? "35px" : "0px" });

        if (comment.isDeleted) {
            if (!comment.replies || comment.replies.length === 0) return null;
            itemDiv.innerHTML = `
                <div style="width: ${isSubReply ? '24px' : '32px'}; height: ${isSubReply ? '24px' : '32px'}; border-radius: 50%; background: #333; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #555;">✖</div>
                <div style="flex: 1; background: #2a2a2a; padding: 6px 10px; border-radius: 4px; color: #666; font-style: italic; border: 1px dashed #444;">此条评论已由用户删除</div>
            `;
        } else {
            const avatarSize = isSubReply ? "24px" : "32px";
            const replyLabel = comment.replyToUserName ? `<span style="color: #888;">回复 <span style="color: #2196F3;">@${comment.replyToUserName}</span>：</span>` : "";
            
            const isMine = currentUser && currentUser.account === comment.author;
            const deleteBtnHtml = isMine ? `<span class="delete-btn" style="color: #F44336; cursor: pointer; margin-left: 10px; font-size: 10px;">删除</span>` : "";

            itemDiv.innerHTML = `
                <img src="${comment.avatar}" style="width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover;">
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span style="color: #aaa; font-weight: bold; font-size: 11px;">${comment.authorName || comment.author}</span>
                    </div>
                    <div style="line-height: 1.4; word-break: break-all;">${replyLabel}${comment.content}</div>
                    <div style="display: flex; gap: 15px; margin-top: 4px; font-size: 10px; color: #777;">
                        <span class="reply-btn" style="cursor: pointer; color: #aaa;">回复</span>${deleteBtnHtml}
                    </div>
                </div>
            `;

            itemDiv.querySelector(".reply-btn").onclick = () => {
                currentReplyTarget = { 
                    account: comment.author, name: comment.authorName || comment.author,
                    parentId: isSubReply ? comment.parentId : comment.id 
                };
                inputField.placeholder = `回复 @${currentReplyTarget.name}:`;
                inputField.focus();
            };

            if (isMine) {
                itemDiv.querySelector(".delete-btn").onclick = async () => {
                    if (confirm("确定要删除这条评论吗？删除后将无法恢复。")) {
                        try {
                            await api.deleteComment(itemId, comment.id, currentUser.account);
                            comment.isDeleted = true;
                            renderList(); 
                        } catch(e) { alert("删除失败"); }
                    }
                };
            }
        }
        return itemDiv;
    }

    function renderList() {
        listArea.innerHTML = "";
        if (!commentsData || commentsData.length === 0) {
            listArea.innerHTML = `<div style="text-align:center; padding: 20px; color:#666;">暂无评论，来抢沙发吧~</div>`;
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
        if (!currentUser) return alert("请先登录您的社区账号！");
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
            
            inputField.value = ""; inputField.placeholder = "说点什么...";
            currentReplyTarget = null;
            renderList();
        } catch (e) {
            alert("发送失败: " + e.message);
        } finally {
            submitBtn.disabled = false;
        }
    };

    inputArea.appendChild(inputField); inputArea.appendChild(submitBtn);
    container.appendChild(listArea); container.appendChild(inputArea);
    renderList(); 
    return container;
}