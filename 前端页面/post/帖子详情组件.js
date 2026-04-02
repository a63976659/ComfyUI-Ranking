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

import { api, proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { getCoverSandboxHTML, setupImageSandboxEvents } from "../components/图片沙盒组件.js";
import { renderTipLevelHTML } from "../components/打赏等级工具.js";
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { t } from "../components/用户体验增强.js";
import { PLACEHOLDERS, getCachedProfile, getProfileWithSWR } from "../core/全局配置.js";
import { removeCache, findInListCache } from "../components/性能优化工具.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { recordView, handleToggleLike, handleToggleFavorite, renderTipBoardHTML as renderCommonTipBoardHTML, escapeHtml } from "../components/互动工具函数.js";

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
    
    let post = null;
    let fromCache = false;
    
    try {
        const res = await api.getPostDetail(postId);
        post = res.data;
    } catch (err) {
        console.error("加载帖子详情失败:", err);
        // 📴 从列表缓存回退
        const cached = findInListCache("PostsCache_", postId);
        if (cached) {
            console.warn("📴 从列表缓存回退加载帖子详情:", postId);
            post = cached;
            fromCache = true;
        }
    }
    
    if (!post) {
        contentArea.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #F44336;">
                <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                ${t('post.not_exist')}
            </div>
        `;
        return;
    }
    
    post = proxyImages(post);  // 对帖子数据应用图片代理
    
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
            <div style="font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 8px; line-height: 1.4;">
                ${escapeHtml(post.title)}
            </div>
            
            <!-- 原创标识 -->
            ${post.is_original ? `
            <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; 
                        background: linear-gradient(135deg, #FF6B35, #FF8F00); border-radius: 12px; 
                        font-size: 11px; color: #fff; font-weight: 500; margin-bottom: 12px;">
                🎨 原创内容，请勿商用
            </div>
            ` : ''}
            
            <!-- 作者信息（SWR 缓存头像） -->
            <div id="author-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: #1a1a1a; border-radius: 8px; cursor: pointer;">
                <div class="swr-avatar-container" style="width: 40px; height: 40px;"></div>
                <div style="flex: 1;">
                    <div class="swr-name" style="font-size: 14px; font-weight: 500; color: #fff;">${escapeHtml(post.author_name || post.author)}</div>
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
                <!-- 👀 浏览量统计（纯展示） -->
                <div style="display: flex; align-items: center; gap: 12px; margin-left: auto; color: #888; font-size: 13px;">
                    <span style="display: flex; align-items: center; gap: 4px;">🔥 <span id="post-view-total">${post.views || 0}</span></span>
                    <span style="display: flex; align-items: center; gap: 4px;">📅 <span id="post-view-daily">${post.daily_views || 0}</span></span>
                </div>
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
        
        // 🚀 SWR 头像渲染：作者头像
        const authorRow = contentArea.querySelector("#author-row");
        if (authorRow) {
            const avatarContainer = authorRow.querySelector(".swr-avatar-container");
            const nameEl = authorRow.querySelector(".swr-name");
            
            const account = post.author;
            const cached = getCachedProfile(account);
            const avatar = cached?.avatar || post.author_avatar || '';
            const name = cached?.name || post.author_name || account || '';
            const initial = (name || 'U')[0].toUpperCase();
            
            // 渲染初始头像
            if (avatarContainer) {
                avatarContainer.innerHTML = avatar 
                    ? `<img class="swr-avatar" src="${avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #444;">` 
                    : `<div class="swr-avatar" style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; font-weight: bold;">${initial}</div>`;
            }
            if (nameEl) nameEl.textContent = name;
            
            // 后台静默校对
            getProfileWithSWR(account, api.getUserProfile, (profile) => {
                const avatarEl = avatarContainer?.querySelector('.swr-avatar');
                if (avatarEl && profile.avatar) {
                    if (avatarEl.tagName === 'IMG') {
                        avatarEl.src = profile.avatar;
                    } else {
                        avatarEl.outerHTML = `<img class="swr-avatar" src="${profile.avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #444;">`;
                    }
                }
                if (nameEl && profile.name) nameEl.textContent = profile.name;
            });
        }
        
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
                window.dispatchEvent(new CustomEvent("comfy-route-edit-post", { 
                    detail: { postData: post, currentUser } 
                }));
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
        
        if (fromCache) {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#FF9800; color:white; padding:10px 20px; border-radius:4px; z-index:10000; font-size:14px;';
            toast.textContent = '⚠️ 网络连接失败，展示的是缓存的数据';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        } else {
            // 👀 记录浏览量（fire-and-forget，不阻塞渲染）
            recordPostView(contentArea, postId);
        }
}

/**
 * 👀 记录帖子浏览量（带60秒防抖）- 使用公共工具函数
 */
async function recordPostView(contentArea, postId) {
    await recordView(api.recordPostView, postId, 'post', (res) => {
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
        handleToggleLike(api.togglePostLike, post.id, btnLike, likeCount, currentUser);
    };
    
    // 收藏 - 使用公共工具函数
    btnFavorite.onclick = () => {
        handleToggleFavorite(api.togglePostFavorite, post.id, btnFavorite, favoriteCount, currentUser);
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
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 15px;">
            <button class="tip-amount" data-amount="10" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">10 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="50" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">50 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="100" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">100 ${t('task.points')}</button>
            <button class="tip-amount" data-amount="500" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 20px; border-radius: 6px; cursor: pointer;">500 ${t('task.points')}</button>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="tip-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
        </div>
    `;

    globalModal.openModal(`🎁 ${t('post.tip_dialog_title')}`, content, { width: "300px" });

    // 取消按钮
    content.querySelector("#tip-cancel").onclick = () => globalModal.closeTopModal();

    // 打赏金额按钮
    content.querySelectorAll(".tip-amount").forEach(btn => {
        btn.onclick = async () => {
            const amount = parseInt(btn.dataset.amount);
            try {
                await api.tipPost(post.id, amount, false);
                showToast(t('post.tip_success', { amount }), "success");
                globalModal.closeTopModal();
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
        let comments = res.data || [];
        comments = proxyImages(comments);  // 新增：对评论数据应用图片代理
        
        if (comments.length === 0) {
            commentsList.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #666; font-size: 13px;">
                    ${t('post.no_comments')}
                </div>
            `;
        } else {
            // 🚀 SWR 头像渲染：评论作者头像
            commentsList.innerHTML = comments.map((c, idx) => {
                const cached = getCachedProfile(c.author);
                const avatar = cached?.avatar || c.author_avatar || '';
                const name = cached?.name || c.author_name || c.author || '';
                const initial = (name || 'U')[0].toUpperCase();
                
                const avatarHtml = avatar 
                    ? `<img class="swr-avatar" src="${avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: #333;">` 
                    : `<div class="swr-avatar" style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">${initial}</div>`;
                
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
                    const commentEl = commentsList.querySelector(`#comment-${idx}`);
                    if (!commentEl) return;
                    const avatarContainer = commentEl.querySelector('.swr-avatar-container');
                    const nameEl = commentEl.querySelector('.swr-name');
                    const avatarEl = avatarContainer?.querySelector('.swr-avatar');
                    
                    if (avatarEl && profile.avatar) {
                        if (avatarEl.tagName === 'IMG') {
                            avatarEl.src = profile.avatar;
                        } else {
                            avatarEl.outerHTML = `<img class="swr-avatar" src="${profile.avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: #333;">`;
                        }
                    }
                    if (nameEl && profile.name) nameEl.textContent = profile.name;
                });
            });
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
 * 🎁 渲染打赏榜单 - 使用公共工具函数
 */
function renderTipBoard(tipBoard) {
    return renderCommonTipBoardHTML(tipBoard, 5, t('post.no_tips'));
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
 * 🗑️ 显示删除确认对话框
 */
function showDeleteConfirmDialog(post, container) {
    const content = document.createElement("div");
    content.style.color = "#ccc";
    content.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
            <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 10px;">${t('post.delete_confirm_title')}</div>
            <div style="font-size: 13px; color: #888; margin-bottom: 20px;">${t('post.delete_confirm_desc')}</div>
            <div style="display: flex; gap: 10px;">
                <button id="delete-cancel" style="flex: 1; background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer;">${t('common.cancel')}</button>
                <button id="delete-confirm" style="flex: 1; background: #F44336; border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">${t('common.delete')}</button>
            </div>
        </div>
    `;

    globalModal.openModal(t('post.delete_confirm_title'), content, { width: "300px" });

    // 取消按钮
    content.querySelector("#delete-cancel").onclick = () => globalModal.closeTopModal();

    // 确认删除按钮
    content.querySelector("#delete-confirm").onclick = async () => {
        try {
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('common.deleting');

            await api.deletePost(post.id);
            showToast(t('post.delete_success'), "success");
            globalModal.closeTopModal();

            // 返回列表页
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        } catch (err) {
            showToast(t('post.delete_failed') + ": " + err.message, "error");
            const confirmBtn = content.querySelector("#delete-confirm");
            confirmBtn.disabled = false;
            confirmBtn.textContent = t('common.delete');
        }
    };
}
