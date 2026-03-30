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

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { renderTipLevelHTML } from "../components/打赏等级工具.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t } from "../components/用户体验增强.js";

/**
 * 📄 创建帖子详情视图
 */
export function createPostDetailView(postId, currentUser) {
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
            <button id="btn-back-detail" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                <span style="font-size: 14px;">⬅</span> ${t('common.back')}
            </button>
            <span style="font-size: 16px; font-weight: bold; color: #fff;">${t('post.detail_title')}</span>
        </div>
        
        <!-- 内容区域 -->
        <div id="post-content" style="flex: 1; overflow-y: auto; padding: 15px;">
            <div style="text-align: center; padding: 60px; color: #888;">
                <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
                ${t('post.loading')}
            </div>
        </div>
    `;
    
    // 返回按钮
    container.querySelector("#btn-back-detail").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 加载帖子详情
    loadPostDetail(container, postId, currentUser);
    
    return container;
}

/**
 * 📥 加载帖子详情
 */
async function loadPostDetail(container, postId, currentUser) {
    const contentArea = container.querySelector("#post-content");
    
    try {
        const res = await api.getPostDetail(postId);
        const post = res.data;
        
        if (!post) {
            contentArea.innerHTML = `
                <div style="text-align: center; padding: 60px; color: #F44336;">
                    <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                    ${t('post.not_exist')}
                </div>
            `;
            return;
        }
        
        // 准备图片列表
        const images = post.images && post.images.length > 0 ? post.images : (post.cover_image ? [post.cover_image] : []);
        
        // 检查当前用户是否已点赞/收藏
        const isLiked = post.liked_by?.includes(currentUser?.account) || false;
        const isFavorited = post.favorited_by?.includes(currentUser?.account) || false;
        
        contentArea.innerHTML = `
            <!-- 图片展示区 -->
            <div id="images-area" style="margin-bottom: 15px;">
                ${getCoverSandboxHTML(images)}
            </div>
            
            <!-- 标题 -->
            <div style="font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 12px; line-height: 1.4;">
                ${escapeHtml(post.title)}
            </div>
            
            <!-- 作者信息 -->
            <div id="author-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: #1a1a1a; border-radius: 8px; cursor: pointer;">
                <img src="${post.author_avatar || 'https://via.placeholder.com/40'}" 
                     style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #444;">
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: 500; color: #fff;">${escapeHtml(post.author_name || post.author)}</div>
                    <div style="font-size: 11px; color: #888;">${formatTime(post.created_at)}</div>
                </div>
                ${currentUser && currentUser.account === post.author ? `
                <div style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
                    <button id="btn-edit-post" style="background: #2196F3; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;" title="${t('common.edit')}">✏️</button>
                    <button id="btn-delete-post" style="background: #F44336; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;" title="${t('common.delete')}">🗑️</button>
                </div>
                ` : ''}
            </div>
            
            <!-- 正文内容 -->
            <div style="font-size: 14px; color: #ddd; line-height: 1.8; margin-bottom: 20px; white-space: pre-wrap; word-wrap: break-word;">
                ${escapeHtml(post.content)}
            </div>
            
            <!-- 互动按钮栏 -->
            <div style="display: flex; align-items: center; gap: 15px; padding: 15px 0; border-top: 1px solid #333; border-bottom: 1px solid #333; margin-bottom: 15px;">
                <button id="btn-like" style="background: ${isLiked ? '#FF5722' : '#333'}; border: 1px solid ${isLiked ? '#FF5722' : '#555'}; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    ❤️ <span id="like-count">${post.likes || 0}</span>
                </button>
                <button id="btn-favorite" style="background: ${isFavorited ? '#FFC107' : '#333'}; border: 1px solid ${isFavorited ? '#FFC107' : '#555'}; color: ${isFavorited ? '#000' : '#fff'}; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    ⭐ <span id="favorite-count">${post.favorites || 0}</span>
                </button>
                <button id="btn-tip" style="background: #333; border: 1px solid #555; color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    ${t('post.tip_author')}
                </button>
            </div>
            
            <!-- 打赏榜单 -->
            <div id="tip-board-area" style="margin-bottom: 15px;">
                ${renderTipBoard(post.tip_board || [])}
            </div>
            
            <!-- 评论区 -->
            <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                ${t('post.comments_title')} <span style="color: #888; font-weight: normal;">(${post.comments || 0})</span>
            </div>
            
            <!-- 评论输入框 -->
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <input type="text" id="comment-input" placeholder="${t('post.comment_placeholder')}" style="flex: 1; padding: 10px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 20px; color: #fff; font-size: 13px; outline: none;" onfocus="this.style.borderColor='#4CAF50'" onblur="this.style.borderColor='#444'">
                <button id="btn-send-comment" style="background: #4CAF50; border: none; color: #fff; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
                    ${t('common.send')}
                </button>
            </div>
            
            <!-- 评论列表 -->
            <div id="comments-list" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
                    ${t('post.comment_loading')}
                </div>
            </div>
        `;
        
        // 设置图片沙盒事件
        setupImageSandboxEvents(contentArea);
        
        // 绑定作者点击
        contentArea.querySelector("#author-row").onclick = (e) => {
            // 如果点击的是编辑/删除按钮，不触发作者资料弹窗
            if (e.target.id === 'btn-edit-post' || e.target.id === 'btn-delete-post') return;
            openOtherUserProfileModal(post.author, currentUser);
        };
        
        // 绑定编辑按钮
        const btnEdit = contentArea.querySelector("#btn-edit-post");
        if (btnEdit) {
            btnEdit.onclick = (e) => {
                e.stopPropagation();
                showEditPostDialog(post, currentUser, container);
            };
        }
        
        // 绑定删除按钮
        const btnDelete = contentArea.querySelector("#btn-delete-post");
        if (btnDelete) {
            btnDelete.onclick = (e) => {
                e.stopPropagation();
                showDeleteConfirmDialog(post, container);
            };
        }
        
        // 绑定互动事件
        bindInteractionEvents(contentArea, post, currentUser);
        
        // 加载评论
        loadComments(contentArea, postId, currentUser);
        
    } catch (err) {
        console.error("加载帖子详情失败:", err);
        contentArea.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #F44336;">
                <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                ${t('post.load_detail_failed')}: ${err.message}
            </div>
        `;
    }
}

/**
 * 🔗 绑定互动事件
 */
function bindInteractionEvents(container, post, currentUser) {
    const btnLike = container.querySelector("#btn-like");
    const btnFavorite = container.querySelector("#btn-favorite");
    const btnTip = container.querySelector("#btn-tip");
    const likeCount = container.querySelector("#like-count");
    const favoriteCount = container.querySelector("#favorite-count");
    
    // 点赞
    btnLike.onclick = async () => {
        if (!currentUser) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        try {
            const res = await api.togglePostLike(post.id);
            likeCount.textContent = res.likes;
            if (res.action === "liked") {
                btnLike.style.background = "#FF5722";
                btnLike.style.borderColor = "#FF5722";
                showToast(t('post.liked'), "success");
            } else {
                btnLike.style.background = "#333";
                btnLike.style.borderColor = "#555";
            }
        } catch (err) {
            showToast(t('task.operation_failed') + ": " + err.message, "error");
        }
    };
    
    // 收藏
    btnFavorite.onclick = async () => {
        if (!currentUser) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        try {
            const res = await api.togglePostFavorite(post.id);
            favoriteCount.textContent = res.favorites;
            if (res.action === "favorited") {
                btnFavorite.style.background = "#FFC107";
                btnFavorite.style.borderColor = "#FFC107";
                btnFavorite.style.color = "#000";
                showToast(t('post.favorited'), "success");
            } else {
                btnFavorite.style.background = "#333";
                btnFavorite.style.borderColor = "#555";
                btnFavorite.style.color = "#fff";
            }
        } catch (err) {
            showToast(t('task.operation_failed') + ": " + err.message, "error");
        }
    };
    
    // 打赏
    btnTip.onclick = () => {
        if (!currentUser) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        if (currentUser.account === post.author) {
            showToast(t('post.tip_self'), "warning");
            return;
        }
        showTipDialog(post, currentUser, container);
    };
}

/**
 * 🎁 显示打赏对话框
 */
function showTipDialog(post, currentUser, container) {
    const existing = document.querySelector('.tip-dialog-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement("div");
    overlay.className = "tip-dialog-overlay";
    Object.assign(overlay.style, {
        position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
        background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: "10000"
    });
    
    overlay.innerHTML = `
        <div style="background: #1e1e1e; border: 1px solid #444; border-radius: 12px; padding: 20px; width: 280px;">
            <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 15px; text-align: center;">${t('post.tip_dialog_title')}</div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 15px;">
                <button class="tip-amount" data-amount="10" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">10 ${t('task.points')}</button>
                <button class="tip-amount" data-amount="50" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">50 ${t('task.points')}</button>
                <button class="tip-amount" data-amount="100" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">100 ${t('task.points')}</button>
                <button class="tip-amount" data-amount="500" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">500 ${t('task.points')}</button>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="tip-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // 点击遮罩关闭
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    // 取消按钮
    overlay.querySelector("#tip-cancel").onclick = () => overlay.remove();
    
    // 打赏金额按钮
    overlay.querySelectorAll(".tip-amount").forEach(btn => {
        btn.onclick = async () => {
            const amount = parseInt(btn.dataset.amount);
            try {
                await api.tipPost(post.id, amount, false);
                showToast(t('post.tip_success', { amount }), "success");
                overlay.remove();
                // 刷新页面
                loadPostDetail(container.parentElement, post.id, currentUser);
            } catch (err) {
                showToast(t('post.tip_failed') + ": " + err.message, "error");
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
    
    try {
        const res = await api.getPostComments(postId);
        const comments = res.data || [];
        
        if (comments.length === 0) {
            commentsList.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #666; font-size: 13px;">
                    ${t('post.no_comments')}
                </div>
            `;
        } else {
            commentsList.innerHTML = comments.map(c => `
                <div style="background: #1a1a1a; padding: 12px; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <img src="${c.author_avatar || 'https://via.placeholder.com/24'}" 
                             style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                        <span style="font-size: 13px; color: #fff; font-weight: 500;">${escapeHtml(c.author_name || c.author)}</span>
                        <span style="font-size: 11px; color: #888; margin-left: auto;">${formatTime(c.created_at)}</span>
                    </div>
                    <div style="font-size: 13px; color: #ddd; line-height: 1.5; padding-left: 32px;">
                        ${escapeHtml(c.content)}
                    </div>
                </div>
            `).join("");
        }
    } catch (err) {
        commentsList.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #F44336; font-size: 12px;">
                ${t('post.comment_load_failed')}
            </div>
        `;
    }
    
    // 发送评论
    sendBtn.onclick = async () => {
        if (!currentUser) {
            showToast(t('auth.login_required'), "warning");
            return;
        }
        const content = commentInput.value.trim();
        if (!content) {
            showToast(t('post.comment_required'), "warning");
            return;
        }
        try {
            sendBtn.disabled = true;
            sendBtn.textContent = t('post.comment_sending');
            await api.addPostComment(postId, content);
            commentInput.value = "";
            showToast(t('post.comment_success'), "success");
            loadComments(container, postId, currentUser);
        } catch (err) {
            showToast(t('post.comment_failed') + ": " + err.message, "error");
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = t('common.send');
        }
    };
    
    // 回车发送
    commentInput.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };
}

/**
 * 🎁 渲染打赏榜单
 */
function renderTipBoard(tipBoard) {
    if (!tipBoard || tipBoard.length === 0) {
        return `
            <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; text-align: center; color: #666; font-size: 12px;">
                ${t('post.no_tips')}
            </div>
        `;
    }
    
    const items = tipBoard.slice(0, 5).map((t_item, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        const name = t_item.is_anon ? t('creator.anonymous') : (t_item.account || t('common.unknown_user'));
        return `
            <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0;">
                <span style="width: 24px; text-align: center;">${medal}</span>
                <span style="flex: 1; color: #ddd; font-size: 13px;">${escapeHtml(name)}</span>
                <span style="color: #FFC107; font-size: 12px;">${t_item.amount} ${t('task.points')}</span>
            </div>
        `;
    }).join("");
    
    return `
        <div style="background: #1a1a1a; padding: 12px; border-radius: 8px;">
            <div style="font-size: 13px; font-weight: bold; color: #FFC107; margin-bottom: 8px;">${t('post.tip_board_title')}</div>
            ${items}
        </div>
    `;
}

/**
 * 🕐 格式化时间
 */
function formatTime(timestamp) {
    if (!timestamp) return "";
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 60) return t('time.just_now');
    if (diff < 3600) return t('time.minutes_ago', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('time.hours_ago', { n: Math.floor(diff / 3600) });
    if (diff < 604800) return t('time.days_ago', { n: Math.floor(diff / 86400) });
    const date = new Date(timestamp * 1000);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 🔒 HTML转义
 */
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * ✏️ 显示编辑帖子对话框
 */
function showEditPostDialog(post, currentUser, container) {
    const existing = document.querySelector('.edit-post-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement("div");
    overlay.className = "edit-post-overlay";
    Object.assign(overlay.style, {
        position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: "10000"
    });
    
    overlay.innerHTML = `
        <div style="background: #1e1e1e; border: 1px solid #444; border-radius: 12px; padding: 20px; width: 90%; max-width: 400px; max-height: 80vh; overflow-y: auto;">
            <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 15px;">${t('post.edit_title')}</div>
            
            <div style="margin-bottom: 12px;">
                <label style="font-size: 12px; color: #888; display: block; margin-bottom: 4px;">${t('post.title_label')}</label>
                <input type="text" id="edit-title" value="${escapeHtml(post.title)}" style="width: 100%; padding: 10px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-size: 12px; color: #888; display: block; margin-bottom: 4px;">${t('post.content_label')}</label>
                <textarea id="edit-content" style="width: 100%; height: 150px; padding: 10px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; resize: vertical; box-sizing: border-box;">${escapeHtml(post.content)}</textarea>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button id="edit-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="edit-save" style="flex: 1; background: #4CAF50; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.save')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // 点击遮罩关闭
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    // 取消按钮
    overlay.querySelector("#edit-cancel").onclick = () => overlay.remove();
    
    // 保存按钮
    overlay.querySelector("#edit-save").onclick = async () => {
        const title = overlay.querySelector("#edit-title").value.trim();
        const content = overlay.querySelector("#edit-content").value.trim();
        
        if (!title) {
            showToast(t('post.error_no_title'), "warning");
            return;
        }
        
        try {
            const saveBtn = overlay.querySelector("#edit-save");
            saveBtn.disabled = true;
            saveBtn.textContent = t('common.saving');
            
            await api.updatePost(post.id, { title, content });
            showToast(t('post.edit_success'), "success");
            overlay.remove();
            
            // 刷新详情页
            loadPostDetail(container, post.id, currentUser);
        } catch (err) {
            showToast(t('post.edit_failed') + ": " + err.message, "error");
            const saveBtn = overlay.querySelector("#edit-save");
            saveBtn.disabled = false;
            saveBtn.textContent = t('common.save');
        }
    };
}

/**
 * 🗑️ 显示删除确认对话框
 */
function showDeleteConfirmDialog(post, container) {
    const existing = document.querySelector('.delete-confirm-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement("div");
    overlay.className = "delete-confirm-overlay";
    Object.assign(overlay.style, {
        position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: "10000"
    });
    
    overlay.innerHTML = `
        <div style="background: #1e1e1e; border: 1px solid #444; border-radius: 12px; padding: 20px; width: 280px; text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 10px;">${t('post.delete_confirm_title')}</div>
            <div style="font-size: 13px; color: #888; margin-bottom: 20px;">${t('post.delete_confirm_desc')}</div>
            <div style="display: flex; gap: 10px;">
                <button id="delete-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="delete-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.delete')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // 点击遮罩关闭
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    // 取消按钮
    overlay.querySelector("#delete-cancel").onclick = () => overlay.remove();
    
    // 确认删除按钮
    overlay.querySelector("#delete-confirm").onclick = async () => {
        try {
            const confirmBtn = overlay.querySelector("#delete-confirm");
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('common.deleting');
            
            await api.deletePost(post.id);
            showToast(t('post.delete_success'), "success");
            overlay.remove();
            
            // 返回列表页
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            showToast(t('post.delete_failed') + ": " + err.message, "error");
            const confirmBtn = overlay.querySelector("#delete-confirm");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.delete');
        }
    };
}
