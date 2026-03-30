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
import { getBannerCacheKey, isAdmin } from "../core/全局配置.js";
import { getVersionConfig, getStageLabel } from "../components/关于插件组件.js";


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
        
        // 转换为 Base64 并存储
        const reader = new FileReader();
        reader.onload = () => {
            try {
                localStorage.setItem(cacheKey, reader.result);
                // 触发界面刷新，显示新缓存的背景图
                window.dispatchEvent(new CustomEvent("comfy-banner-synced", { detail: { account } }));
            } catch (storageErr) {
                console.warn("背景图本地缓存失败:", storageErr);
            }
        };
        reader.onerror = () => console.warn("背景图读取失败");
        reader.readAsDataURL(blob);
    } catch (err) {
        console.warn(`背景图下载失败: ${err.message}`);
    }
}

export function showUserProfile(initialUserData, currentUser = null, isMe = true) {
    const container = document.createElement("div");
    Object.assign(container.style, { 
        display: "flex", flexDirection: "column", gap: "15px", color: "#eee", 
        fontSize: "14px", padding: "15px", flex: "none", height: "1220px", boxSizing: "border-box", overflowY: "auto", 
        background: "var(--bg-color, #202020)"
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
        if (isMe || !privacy.likes) tabs.push({ id: "liked", label: t('profile.recent_likes') });
        if (isMe || !privacy.follows) tabs.push({ id: "following", label: t('profile.following') });

        if (!tabs.find(t => t.id === activeTab)) activeTab = "published";

        // 调用解耦的模板引擎生成 HTML
        container.innerHTML = buildProfileHTML(userData, isMe, isSettingsView, isFollowing, followingCount, activeTab, tabs);

        // 🏷️ 动态更新管理员特权徽章
        const adminBadge = container.querySelector('#admin-privilege-badge');
        if (adminBadge && isMe && isAdmin(userData.account)) {
            getVersionConfig().then(config => {
                const stageLabel = getStageLabel(config.stage);
                adminBadge.textContent = `${stageLabel}${t('profile.max_privilege')}`;
            }).catch(() => {
                adminBadge.textContent = t('profile.beta_max_privilege');
            });
        }

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
                container.querySelector("#btn-withdraw").onclick = () => {
                    openWithdrawModal(currentUser, () => { 
                        userData.earn_balance = 0; 
                        userData.tip_balance = 0;
                        render(); 
                    });
                };

                container.querySelector("#btn-open-settings").onclick = () => { isSettingsView = true; render(); };
                container.querySelector("#btn-logout").onclick = async () => {
                    if (await showConfirm(t('confirm.logout'))) {
                        localStorage.removeItem("ComfyCommunity_User"); localStorage.removeItem("ComfyCommunity_Token");
                        sessionStorage.removeItem("ComfyCommunity_User"); sessionStorage.removeItem("ComfyCommunity_Token");
                        window.dispatchEvent(new CustomEvent("comfy-route-back")); 
                        window.dispatchEvent(new CustomEvent("comfy-user-logout"));
                        showToast(t('feedback.logged_out'), "info");
                    }
                };
            } else {
                const btnTip = container.querySelector("#btn-tip-user");
                if (btnTip) {
                    btnTip.onclick = () => {
                        if (!currentUser) return showToast(t('feedback.login_required_tip'), "warning");
                        openTipModal(currentUser, userData, (newBalance) => {
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

            const listDOM = container.querySelector("#profile-list-container");
            renderProfileListContent(activeTab, listDOM, userData, currentUser, openOtherUserProfileModal);

            // =========================================================
            // 【新增】：为管理员系统公告发布按钮绑定事件
            // =========================================================
            const btnAdminAnnSend = container.querySelector("#btn-admin-ann-send");
            if (btnAdminAnnSend) {
                btnAdminAnnSend.onclick = async () => {
                    const contentArea = container.querySelector("#admin-ann-content");
                    const content = contentArea.value;
                    if (!content || !content.trim()) return showToast(`⚠️ ${t('admin.empty_content')}`, "warning");

                    const isConfirm = await showConfirm(t('admin.announce_confirm'));
                    if (!isConfirm) return;

                    btnAdminAnnSend.innerText = `🚀 ${t('admin.publishing')}...`;
                    btnAdminAnnSend.style.opacity = "0.7";
                    btnAdminAnnSend.disabled = true;

                    try {
                        await api.postSystemAnnouncement(currentUser.account, content);
                        contentArea.value = "";
                        showToast(`🎉 ${t('admin.publish_success')}`, "success");
                    } catch (error) {
                        console.error("Failed to post announcement:", error);
                        showToast(`❌ ${t('admin.publish_failed')}: ${error.message}`, "error");
                    } finally {
                        btnAdminAnnSend.innerText = `🚀 ${t('admin.confirm_publish')}`;
                        btnAdminAnnSend.style.opacity = "1";
                        btnAdminAnnSend.disabled = false;
                    }
                };
            }

            // =========================================================
            // 【新增】：管理员调试脚本执行按钮绑定事件
            // =========================================================
            const btnAdminRunScript = container.querySelector("#btn-admin-run-script");
            if (btnAdminRunScript) {
                btnAdminRunScript.onclick = async () => {
                    const scriptInput = container.querySelector("#admin-script-input");
                    const resultArea = container.querySelector("#admin-script-result");
                    const scriptName = scriptInput.value.trim();
                    
                    if (!scriptName) {
                        resultArea.innerHTML = `<span style="color: #f85149;">❌ ${t('admin.enter_script_name')}</span>`;
                        return;
                    }

                    btnAdminRunScript.innerText = `⏳ ${t('admin.executing')}...`;
                    btnAdminRunScript.disabled = true;
                    resultArea.innerHTML = `<span style="color: #58a6ff;">⚡ ${t('admin.running')} ${scriptName} ...</span>`;

                    try {
                        const response = await api.runAdminScript(currentUser.account, scriptName);
                        const output = response.output || response.message || JSON.stringify(response, null, 2);
                        resultArea.innerHTML = `<span style="color: #3fb950;">✅ ${t('admin.exec_success')}：</span>\n\n${output}`;
                    } catch (error) {
                        console.error("Script execution failed:", error);
                        resultArea.innerHTML = `<span style="color: #f85149;">❌ ${t('admin.exec_failed')}：</span>\n\n${error.message}`;
                    } finally {
                        btnAdminRunScript.innerText = `▶️ ${t('admin.execute')}`;
                        btnAdminRunScript.disabled = false;
                    }
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
    Promise.all([
        api.getUserProfile(userData.account).catch(() => ({ data: {} })),
        api.getWallet(userData.account).catch(() => ({}))
    ]).then(([profileRes, walletRes]) => {
        const freshData = { ...profileRes.data, ...walletRes };
        const safeFreshData = { ...freshData };
        Object.keys(safeFreshData).forEach(key => safeFreshData[key] == null && delete safeFreshData[key]);

        const storage = localStorage.getItem("ComfyCommunity_User") ? localStorage : sessionStorage;
        try {
            const savedStr = storage.getItem("ComfyCommunity_User");
            if (savedStr) {
                const savedObj = JSON.parse(savedStr);
                savedObj.user = { ...savedObj.user, ...safeFreshData };
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
        const [profileRes, walletRes] = await Promise.all([
            api.getUserProfile(targetAccount).catch(() => ({ data: {} })),
            api.getWallet(targetAccount).catch(() => ({}))
        ]);
        const freshData = { ...profileRes.data, ...walletRes };
        localStorage.setItem(cacheKey, JSON.stringify(freshData));
        
        if (activeContainer) { if (activeContainer.updateData) activeContainer.updateData(freshData); } 
        else {
            const profileElement = showUserProfile(freshData, currentUser, false);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: profileElement } }));
        }
    } catch (err) { if (!activeContainer) showToast(t('feedback.user_fetch_failed'), "error"); }
}