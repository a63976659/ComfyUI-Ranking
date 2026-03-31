// 前端页面/post/讨论区组件.js
// ==========================================
// 💬 讨论区组件（小红书风格瀑布流列表）
// ==========================================
// 功能：瀑布流展示帖子封面、标题、作者、点赞数
// 性能优化：
//   - 本地缓存优先读取
//   - 骨架屏加载动画
//   - 动态分页加载
// 关联文件：
//   - 帖子详情组件.js (点击进入详情)
//   - 发布帖子组件.js (发布入口)
//   - 网络请求API.js (数据获取)
//   - 性能优化工具.js (缓存/骨架屏)
// ==========================================

import { api } from "../core/网络请求API.js";
import { proxyImages } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { setCache, getCache, createSkeleton } from "../components/性能优化工具.js";
import { applyCardAnimation } from "../components/动画音效引擎.js";
import { t } from "../components/用户体验增强.js";
import { getCachedProfile, getProfileWithSWR } from "../core/全局配置.js";

// 缓存配置
const CACHE_KEY = "PostsCache";
const CACHE_TTL = 1000 * 60 * 30;  // 30分钟缓存
const PAGE_SIZE = 20;

// 缓存当前用户
let currentUserCache = null;

/**
 * 💬 创建讨论区视图
 */
export function createPostsView(currentUser) {
    currentUserCache = currentUser;
    
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
        <!-- 🎯 瀑布流容器（发布按钮已移至顶部统一发布按钮） -->
        <div id="posts-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 15px; overflow-y: auto; flex: 1;">
            <!-- 加载占位 -->
            <div id="posts-loading" style="grid-column: span 2; text-align: center; padding: 40px; color: #888;">
                <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
                ${t('post.loading')}
            </div>
        </div>
        
        <!-- 加载更多 -->
        <div id="load-more-wrapper" style="display: none; padding: 15px; text-align: center; border-top: 1px solid #333;">
            <button id="btn-load-more" style="background: #333; border: 1px solid #555; color: #fff; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">
                ${t('post.load_more')}
            </button>
        </div>
    `;
    
    // 🔌 绑定事件
    
    // 加载帖子数据
    let currentPage = 1;
    let allPostsData = [];  // 全量数据缓存
    let isLoadingFromNetwork = false;
    const postsGrid = container.querySelector("#posts-grid");
    const loadMoreWrapper = container.querySelector("#load-more-wrapper");
    const loadMoreBtn = container.querySelector("#btn-load-more");
    
    // 显示骨架屏
    const showSkeleton = () => {
        postsGrid.innerHTML = "";
        // 创建瀑布流式骨架屏
        for (let i = 0; i < 4; i++) {
            const skeletonCard = document.createElement("div");
            skeletonCard.style.cssText = "background: #2a2a2a; border-radius: 10px; overflow: hidden; animation: pulse 1.5s infinite;";
            skeletonCard.innerHTML = `
                <div style="width: 100%; padding-top: 120%; background: linear-gradient(90deg, #2a2a2a 25%, #333 50%, #2a2a2a 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                <div style="padding: 10px;">
                    <div style="height: 14px; background: #333; border-radius: 4px; margin-bottom: 8px;"></div>
                    <div style="height: 12px; background: #333; border-radius: 4px; width: 60%;"></div>
                </div>
            `;
            postsGrid.appendChild(skeletonCard);
        }
        // 添加动画样式
        if (!document.getElementById("posts-skeleton-style")) {
            const style = document.createElement("style");
            style.id = "posts-skeleton-style";
            style.textContent = `
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
            `;
            document.head.appendChild(style);
        }
    };
    
    const loadPosts = async (page = 1, append = false) => {
        // ✅ 优先从本地缓存读取
        if (!append && page === 1) {
            const cachedData = getCache(CACHE_KEY);
            if (cachedData && cachedData.length > 0) {
                // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
                allPostsData = proxyImages(cachedData);
                renderPostsFromCache(allPostsData);
                // 后台静默更新
                silentRefresh();
                return;
            }
        }
        
        try {
            if (!append) {
                showSkeleton();
            }
            
            isLoadingFromNetwork = true;
            const res = await api.getPosts(page, PAGE_SIZE);
            const posts = res.data || [];
            const total = res.total || 0;
            isLoadingFromNetwork = false;
            
            // 缓存第一页数据
            if (page === 1) {
                allPostsData = posts;
                setCache(CACHE_KEY, posts, CACHE_TTL, true);
            } else {
                allPostsData = [...allPostsData, ...posts];
            }
            
            if (!append) {
                postsGrid.innerHTML = "";
            }
            
            if (posts.length === 0 && page === 1) {
                postsGrid.innerHTML = `
                    <div style="grid-column: span 2; text-align: center; padding: 60px 20px; color: #666;">
                        <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📝</div>
                        <div style="font-size: 14px; margin-bottom: 8px;">${t('post.no_posts')}</div>
                        <div style="font-size: 12px; color: #888;">${t('post.be_first')}</div>
                    </div>
                `;
                loadMoreWrapper.style.display = "none";
                return;
            }
            
            // 渲染帖子卡片
            const cards = [];
            posts.forEach(post => {
                const card = createPostCard(post);
                cards.push(card);
                postsGrid.appendChild(card);
            });
            
            // ✨ 应用深渊汇聚动画（仅首次加载）
            if (!append && page === 1) {
                const visibleCount = Math.min(cards.length, 8);
                cards.forEach((card, index) => {
                    applyCardAnimation(card, 'abyss', index, visibleCount);
                });
            }
            
            // 显示/隐藏加载更多
            const loadedCount = page * PAGE_SIZE;
            if (loadedCount < total) {
                loadMoreWrapper.style.display = "block";
            } else {
                loadMoreWrapper.style.display = "none";
            }
            
        } catch (err) {
            console.error("加载帖子失败:", err);
            isLoadingFromNetwork = false;
            // 网络失败时尝试从缓存读取
            if (!append) {
                const cachedData = getCache(CACHE_KEY);
                if (cachedData && cachedData.length > 0) {
                    // 🚀 缓存数据也需要过一遍图片代理
                    allPostsData = proxyImages(cachedData);
                    renderPostsFromCache(allPostsData);
                    showToast(t('post.network_cache'), "warning");
                } else {
                    postsGrid.innerHTML = `
                        <div style="grid-column: span 2; text-align: center; padding: 40px; color: #F44336;">
                            <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                            ${t('post.load_failed')}
                        </div>
                    `;
                }
            }
        }
    };
    
    // 从缓存渲染帖子列表
    const renderPostsFromCache = (posts) => {
        postsGrid.innerHTML = "";
        
        if (posts.length === 0) {
            postsGrid.innerHTML = `
                <div style="grid-column: span 2; text-align: center; padding: 60px 20px; color: #666;">
                    <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📝</div>
                    <div style="font-size: 14px; margin-bottom: 8px;">${t('post.no_posts')}</div>
                    <div style="font-size: 12px; color: #888;">${t('post.be_first')}</div>
                </div>
            `;
            loadMoreWrapper.style.display = "none";
            return;
        }
        
        // 渲染第一页
        const firstPage = posts.slice(0, PAGE_SIZE);
        const cards = [];
        firstPage.forEach(post => {
            const card = createPostCard(post);
            cards.push(card);
            postsGrid.appendChild(card);
        });
        
        // ✨ 应用深渊汇聚动画
        const visibleCount = Math.min(cards.length, 8);
        cards.forEach((card, index) => {
            applyCardAnimation(card, 'abyss', index, visibleCount);
        });
        
        // 显示加载更多
        if (posts.length > PAGE_SIZE) {
            loadMoreWrapper.style.display = "block";
        } else {
            loadMoreWrapper.style.display = "none";
        }
    };
    
    // 后台静默更新
    const silentRefresh = async () => {
        if (isLoadingFromNetwork) return;
        
        try {
            isLoadingFromNetwork = true;
            const res = await api.getPosts(1, PAGE_SIZE);
            const posts = res.data || [];
            isLoadingFromNetwork = false;
            
            // 更新缓存
            setCache(CACHE_KEY, posts, CACHE_TTL, true);
            allPostsData = posts;
        } catch (err) {
            isLoadingFromNetwork = false;
            console.warn("后台更新失败:", err);
        }
    };
    
    // 加载更多按钮
    loadMoreBtn.onclick = () => {
        currentPage++;
        loadPosts(currentPage, true);
    };
    
    // 初始加载
    loadPosts(1);
    
    return container;
}

/**
 * 🎴 创建单个帖子卡片（小红书风格）
 */
function createPostCard(post) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        background: "#1e1e1e",
        borderRadius: "8px",
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        border: "1px solid #333"
    });
    
    // 格式化时间
    const timeStr = formatTime(post.created_at);
    
    card.innerHTML = `
        <!-- 封面图 -->
        <div style="position: relative; width: 100%; padding-top: 100%; background: #111;">
            <img src="${post.cover_image || 'data:image/svg+xml,...'}" 
                 style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23222%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%22100%22 y=%22100%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2224%22%3E🖼️%3C/text%3E%3C/svg%3E'">
        </div>
        
        <!-- 内容区 -->
        <div style="padding: 10px;">
            <!-- 标题 -->
            <div style="font-size: 13px; font-weight: 500; color: #fff; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
                ${escapeHtml(post.title)}
            </div>
            
            <!-- 作者信息（SWR 缓存头像） -->
            <div id="post-author-${post.id}" style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;"></div>
            
            <!-- 互动数据 -->
            <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: #888;">
                <span>❤️ ${post.likes || 0}</span>
                <span style="margin-left: auto; font-size: 10px;">${timeStr}</span>
            </div>
        </div>
    `;
    
    // 🚀 SWR 头像渲染：先从缓存读取，后台静默校对
    setTimeout(() => {
        const authorContainer = card.querySelector(`#post-author-${post.id}`);
        if (!authorContainer) return;
        
        const account = post.author;
        const cached = getCachedProfile(account);
        const avatar = cached?.avatar || post.author_avatar || '';
        const name = cached?.name || post.author_name || account || '';
        
        // 内联 SVG 默认头像（用户剪影图标）
        const DEFAULT_AVATAR_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23333'/%3E%3Ccircle cx='18' cy='14' r='6' fill='%23666'/%3E%3Cpath d='M6 32c0-6.6 5.4-12 12-12s12 5.4 12 12' fill='%23666'/%3E%3C/svg%3E";
        
        // 渲染头像（始终使用 img 标签）
        const avatarSrc = avatar || DEFAULT_AVATAR_SVG;
        const avatarHtml = `<img class="swr-avatar" src="${avatarSrc}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1px solid #444; background: #333;">`;
        
        authorContainer.innerHTML = `${avatarHtml}<span class="swr-name" style="font-size: 11px; color: #999; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</span>`;
        
        // 后台静默校对
        getProfileWithSWR(account, api.getUserProfile, (profile) => {
            const avatarEl = authorContainer.querySelector('.swr-avatar');
            const nameEl = authorContainer.querySelector('.swr-name');
            if (avatarEl && profile.avatar) {
                avatarEl.src = profile.avatar;
            }
            if (nameEl && profile.name) {
                nameEl.textContent = profile.name;
            }
        });
    }, 0);
    
    // 悬停效果
    card.onmouseover = () => {
        card.style.transform = "translateY(-2px)";
        card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    };
    card.onmouseout = () => {
        card.style.transform = "translateY(0)";
        card.style.boxShadow = "none";
    };
    
    // 点击进入详情
    card.onclick = () => {
        import("./帖子详情组件.js").then(module => {
            const view = module.createPostDetailView(post.id, currentUserCache);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        });
    };
    
    return card;
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
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}
