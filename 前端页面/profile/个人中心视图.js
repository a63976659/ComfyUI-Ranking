// 前端页面/profile/个人中心视图.js
import { api } from "../core/网络请求API.js";
import { openChatModal } from "../social/私信聊天组件.js";
import { createSettingsForm } from "./个人设置表单组件.js";
import { renderProfileListContent } from "./个人列表组件.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
// ==========================================
// 资金模块 (充值/提现)
// ==========================================
import { openRechargeModal } from "../market/资金与钱包_充值组件.js";
import { openWithdrawModal } from "../market/资金与钱包_提现组件.js"; 
import { buildProfileHTML } from "./个人中心_UI模板.js";   
import { openTipModal } from "./个人中心_赞赏组件.js";     
import { getBannerCacheKey, getCurrentAccount } from "../core/全局配置.js";
import { clearAllCache, clearSensitiveCache } from "../components/性能优化工具.js";
import { logout } from "../core/状态管理.js";


// ==========================================
// 🖼️ 个人资料卡背景图云端同步
// ==========================================
// 作用：当本地无缓存但云端有背景图时，下载并缓存到本地
async function syncBannerCache(account, bannerUrl) {
    if (!bannerUrl || !account) return;
    
    const cacheKey = getBannerCacheKey(account);
    const localCache = localStorage.getItem(cacheKey);
    
    // 本地已有缓存，无需同步
    if (localCache) return;
    
    try {
        // 处理代理 URL（云端 URL 可能需要通过本地代理访问）
        let fetchUrl = bannerUrl;
        if (bannerUrl.startsWith('http') && !bannerUrl.includes('/community_hub/image')) {
            fetchUrl = `/community_hub/image?url=${encodeURIComponent(bannerUrl)}`;
        }
        
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const blob = await response.blob();
        
        // ✅ 大图不存localStorage（超过512KB的图片转Base64后会轻松超过配额）
        if (blob.size > 512 * 1024) {
            // 大图改用 sessionStorage 临时缓存（关闭标签页即释放），或直接使用 blob URL
            const blobUrl = URL.createObjectURL(blob);
            window.dispatchEvent(new CustomEvent("comfy-banner-synced", { detail: { account, blobUrl } }));
            return;
        }
        
        // 转换为 Base64 并存储（仅小图）
        const reader = new FileReader();
        reader.onload = () => {
            try {
                localStorage.setItem(cacheKey, reader.result);
                window.dispatchEvent(new CustomEvent("comfy-banner-synced", { detail: { account } }));
            } catch (storageErr) {
                // 配额溢出：先清理其他用户的旧 banner 缓存后重试
                if (storageErr.name === "QuotaExceededError") {
                    try {
                        const keysToRemove = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && key.startsWith("ComfyRanking_ProfileBannerCache_") && key !== cacheKey) {
                                keysToRemove.push(key);
                            }
                        }
                        keysToRemove.forEach(k => localStorage.removeItem(k));
                        localStorage.setItem(cacheKey, reader.result);
                        window.dispatchEvent(new CustomEvent("comfy-banner-synced", { detail: { account } }));
                        return;
                    } catch (_) { /* 仍然失败，降级 */ }
                    // 最终降级：使用 blob URL（不占 localStorage）
                    const blobUrl = URL.createObjectURL(blob);
                    window.dispatchEvent(new CustomEvent("comfy-banner-synced", { detail: { account, blobUrl } }));
                }
            }
        };
        reader.onerror = () => console.warn("背景图读取失败");
        reader.readAsDataURL(blob);
    } catch (err) {
        console.warn(`背景图下载失败: ${err.message}`);
    }
}

// ==========================================
// 🔗 公共辅助：拉取用户资料+钱包数据
// ==========================================
async function _fetchProfileAndWallet(account, { logErrors = false } = {}) {
    const [profileRes, walletRes] = await Promise.all([
        api.getUserProfile(account).catch(err => {
            if (logErrors) console.warn(`⚠️ getUserProfile(${account}) 失败:`, err.message || err);
            return { data: {} };
        }),
        api.getWallet(account).catch(err => {
            if (logErrors) console.warn(`⚠️ getWallet(${account}) 失败:`, err.message || err);
            return {};
        })
    ]);
    const freshData = { ...profileRes.data, ...walletRes };
    Object.keys(freshData).forEach(key => freshData[key] == null && delete freshData[key]);
    return freshData;
}

/** 统一设置 Tab 按钮点击事件 */
function _setupTabButton(container, selector, tabId, onSwitch) {
    const btn = container.querySelector(selector);
    if (btn) btn.onclick = () => onSwitch(tabId);
}

export function showUserProfile(initialUserData, currentUser = null, isMe = true) {
    const container = document.createElement("div");
    Object.assign(container.style, { 
        display: "flex", flexDirection: "column", gap: "15px", color: "#eee", 
        fontSize: "14px", padding: "15px", flex: "none", height: "1220px", boxSizing: "border-box", overflowY: "auto", 
        background: "var(--comfy-menu-bg)"
    });

    let isSettingsView = false;
    let activeTab = localStorage.getItem(`Profile_ActiveTab_${isMe}`) || "published";
    let userData = initialUserData;

    // 🖼️ 监听背景图同步完成事件，自动刷新显示
    const bannerSyncHandler = (e) => {
        if (isMe && e.detail?.account === userData.account && !isSettingsView) {
            console.log(`✨ 背景图同步完成，刷新界面`);
            render();
        }
    };
    window.addEventListener("comfy-banner-synced", bannerSyncHandler);
    
    // 组件销毁时移除事件监听
    const observer = new MutationObserver(() => {
        if (!document.body.contains(container)) {
            window.removeEventListener("comfy-banner-synced", bannerSyncHandler);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function render() {
        container.innerHTML = ""; 

        let isFollowing = false;
        if (currentUser && userData.followers) { isFollowing = userData.followers.includes(currentUser.account); }

        const privacy = userData.privacy || {};
        const followingCount = (!isMe && privacy.follows) ? "***" : (userData.following ? userData.following.length : 0);

        const tabs = [{ id: "published", label: isMe ? t('profile.my_published') : t('profile.their_published') }];
        if (isMe) tabs.push({ id: "acquired", label: t('profile.my_purchased') });
        if (isMe) tabs.push({ id: "my_tasks", label: t('profile.my_tasks') });
        if (isMe) tabs.push({ id: "transactions", label: t('profile.transactions') });
        if (isMe) tabs.push({ id: "my_posts", label: t('profile.my_posts') });
        if (isMe) tabs.push({ id: "collected", label: t('profile.my_collected') });
        if (isMe || !privacy.likes) tabs.push({ id: "liked", label: t('profile.recent_likes') });
        if (isMe || !privacy.follows) tabs.push({ id: "following", label: t('profile.following') });
        if (isMe || !privacy.followers) tabs.push({ id: "followers", label: t('profile.followers') || "粉丝" });

        if (!tabs.find(t => t.id === activeTab)) activeTab = "published";

        // 调用解耦的模板引擎生成 HTML
        container.innerHTML = buildProfileHTML(userData, isMe, isSettingsView, isFollowing, followingCount, activeTab, tabs);

        if (isSettingsView && isMe) {
            const settingsContainer = createSettingsForm(
                userData,
                () => { isSettingsView = false; render(); }, 
                (newUserData) => { 
                    userData = newUserData;
                    if (container.updateData) container.updateData(userData);
                    isSettingsView = false;
                    render();
                }
            );
            container.appendChild(settingsContainer);
            container.querySelector("#btn-back-profile").onclick = () => { isSettingsView = false; render(); };
        } else {
            container.querySelector("#btn-back-profile").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));

            if (isMe) {
                container.querySelector("#btn-wallet").onclick = () => {
                    openRechargeModal(currentUser, (newBalance) => { userData.balance = newBalance; render(); });
                };
                container.querySelector("#btn-withdraw").onclick = async () => {
                    // 点击提现按钮前先刷新钱包数据
                    try {
                        const freshWallet = await api.getWallet(currentUser.account);
                        Object.assign(currentUser, freshWallet);
                    } catch (err) {
                        console.warn("刷新钱包数据失败:", err);
                    }
                    openWithdrawModal(currentUser, async () => { 
                        // 提现成功后重新拉取用户数据刷新余额
                        try {
                            const walletRes = await api.getWallet(currentUser.account);
                            userData.balance = walletRes.balance ?? userData.balance;
                            userData.earn_balance = walletRes.earn_balance ?? userData.earn_balance;
                            userData.tip_balance = walletRes.tip_balance ?? userData.tip_balance;
                            userData.total_withdrawn = walletRes.total_withdrawn ?? userData.total_withdrawn;
                        } catch (err) {
                            console.warn("提现后刷新钱包数据失败:", err);
                        }
                        render(); 
                    });
                };

                container.querySelector("#btn-open-settings").onclick = () => { isSettingsView = true; render(); };
                container.querySelector("#btn-logout").onclick = async () => {
                    if (await showConfirm(t('confirm.logout'))) {
                        // 获取当前账号（清除前获取）
                        const currentAccount = getCurrentAccount();

                        // 1. 清除当前用户的 Profile 缓存
                        if (currentAccount) {
                            localStorage.removeItem(`ComfyCommunity_ProfileCache_${currentAccount}`);
                            localStorage.removeItem(`ComfyRanking_SidebarBackground_${currentAccount}`);
                            localStorage.removeItem(`ComfyRanking_ProfileBannerCache_${currentAccount}`);
                        }

                        // 2. 清除通用用户数据缓存
                        localStorage.removeItem("ComfyCommunity_ListCache");
                        localStorage.removeItem("ComfyCommunity_ChatHistory");
                        localStorage.removeItem("ComfyRanking_Notifications");
                        localStorage.removeItem("ComfyRanking_ChatList");

                        // 3. 清除所有 ComfyRanking_ 前缀的数据缓存
                        clearAllCache();

                        // 4. 清除内存中的敏感数据缓存
                        clearSensitiveCache();

                        // 5. 调用状态管理 logout（清除 Token、User、内存状态）
                        logout();

                        // 6. 触发事件
                        window.dispatchEvent(new CustomEvent("comfy-route-back"));
                        window.dispatchEvent(new CustomEvent("comfy-user-logout"));
                        showToast(t('feedback.logged_out'), "info");
                    }
                };
            } else {
                const btnTip = container.querySelector("#btn-tip-user");
                if (btnTip) {
                    btnTip.onclick = async () => {
                        if (!currentUser) return showToast(t('feedback.login_required_tip'), "warning");
                        await openTipModal(currentUser, userData, (newBalance) => {
                            currentUser.balance = newBalance;
                            openOtherUserProfileModal(userData.account, currentUser); 
                        });
                    };
                }

                const btnFollow = container.querySelector("#btn-follow-user");
                if (btnFollow) {
                    btnFollow.onclick = async () => {
                        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
                        btnFollow.innerHTML = `⏳ ${t('common.processing')}...`; btnFollow.disabled = true;
                        try {
                            const newStatus = !isFollowing;
                            await api.toggleFollow(currentUser.account, userData.account, newStatus);
                            isFollowing = newStatus;
                            
                            if (!userData.followers) userData.followers = [];
                            if (isFollowing) { if (!userData.followers.includes(currentUser.account)) userData.followers.push(currentUser.account); } 
                            else { userData.followers = userData.followers.filter(a => a !== currentUser.account); }
                            render(); 
                        } catch (err) { showToast(t('feedback.operation_failed') + err.message, "error"); btnFollow.innerHTML = isFollowing ? `✔️ ${t('social.followed')}` : `➕ ${t('social.follow')}`; } 
                        finally { btnFollow.disabled = false; }
                    };
                }

                const btnSendMsg = container.querySelector("#btn-send-msg");
                if (btnSendMsg) {
                    btnSendMsg.onclick = () => {
                        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
                        openChatModal(currentUser, userData.account);
                    };
                }
            }

            container.querySelectorAll(".profile-tab-btn").forEach(btn => {
                btn.onclick = (e) => {
                    activeTab = e.target.getAttribute("data-id");
                    localStorage.setItem(`Profile_ActiveTab_${isMe}`, activeTab); 
                    render();
                };
            });

            // 粉丝/关注数点击跳转对应列表
            const _switchTab = (tabId) => { activeTab = tabId; localStorage.setItem(`Profile_ActiveTab_${isMe}`, tabId); render(); };
            _setupTabButton(container, "#btn-followers", "followers", _switchTab);
            _setupTabButton(container, "#btn-following", "following", _switchTab);

            const listDOM = container.querySelector("#profile-list-container");
            renderProfileListContent(activeTab, listDOM, userData, currentUser, openOtherUserProfileModal);

            // =========================================================
            // 【新增】：管理后台入口按钮绑定事件
            // =========================================================
            const btnAdminPanel = container.querySelector("#btn-admin-panel");
            if (btnAdminPanel) {
                btnAdminPanel.onclick = () => {
                    import("./管理后台组件.js").then(module => {
                        const view = module.createAdminPanelView(currentUser);
                        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
                    }).catch(err => { console.error('加载管理后台失败:', err); });
                };
            }
        }
    }

    container.updateData = function(newUserData) {
        const safeNewData = { ...newUserData };
        Object.keys(safeNewData).forEach(key => safeNewData[key] == null && delete safeNewData[key]);
        const mergedData = { ...userData, ...safeNewData };
        if (JSON.stringify(userData) !== JSON.stringify(mergedData)) { 
            userData = mergedData; 
            if (!isSettingsView) { render(); } 
        }
    };

    render();
    return container;
}

export function openUserProfileModal(userData) {
    const view = showUserProfile(userData, userData, true);
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));

    // 同步拉取云端 JSON 资料表与 SQL 金融账本
    _fetchProfileAndWallet(userData.account).then(freshData => {
        const storage = localStorage.getItem("ComfyCommunity_User") ? localStorage : sessionStorage;
        try {
            const savedStr = storage.getItem("ComfyCommunity_User");
            if (savedStr) {
                const savedObj = JSON.parse(savedStr);
                savedObj.user = { ...savedObj.user, ...freshData };
                storage.setItem("ComfyCommunity_User", JSON.stringify(savedObj));
            }
        } catch(e){}
        
        // 🖼️ 同步个人资料卡背景图：云端有但本地无缓存时自动下载
        if (freshData.bannerUrl) {
            syncBannerCache(userData.account, freshData.bannerUrl);
        }
        
        // 立即更新界面，显示云端背景图（通过代理 URL）
        if (view.updateData) view.updateData(freshData);
    }).catch(err => console.warn("后台更新本人资料失败", err));
}

export async function openOtherUserProfileModal(targetAccount, currentUser) {
    if (currentUser && currentUser.account === targetAccount) { return openUserProfileModal(currentUser); }
    
    const cacheKey = `ComfyCommunity_ProfileCache_${targetAccount}`;
    const cachedStr = localStorage.getItem(cacheKey);
    let activeContainer = null;

    if (cachedStr) {
        try {
            const cachedData = JSON.parse(cachedStr);
            activeContainer = showUserProfile(cachedData, currentUser, false);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: activeContainer } }));
        } catch (e) {}
    }

    try {
        const freshData = await _fetchProfileAndWallet(targetAccount, { logErrors: true });
        
        // 如果 getUserProfile 失败（data 为空），用 targetAccount 兜底确保能渲染
        if (!freshData.account) freshData.account = targetAccount;
        
        try { localStorage.setItem(cacheKey, JSON.stringify(freshData)); } catch(e) { /* localStorage 满时忽略 */ }
        
        if (activeContainer) { if (activeContainer.updateData) activeContainer.updateData(freshData); } 
        else {
            const profileElement = showUserProfile(freshData, currentUser, false);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: profileElement } }));
        }
    } catch (err) {
        console.error(`❌ openOtherUserProfileModal(${targetAccount}) 异常:`, err);
        if (!activeContainer) showToast(t('feedback.user_fetch_failed'), "error");
    }
}