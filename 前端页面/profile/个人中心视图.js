// 前端页面/profile/个人中心视图.js
import { api } from "../core/网络请求API.js";
import { openChatModal } from "../social/私信聊天组件.js";
import { createSettingsForm } from "./个人设置表单组件.js";
import { renderProfileListContent } from "./个人列表组件.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
// ==========================================
// 资金模块 (充值/提现)
// ==========================================
import { openRechargeModal } from "../market/资金与钱包_充值组件.js";
import { openWithdrawModal } from "../market/资金与钱包_提现组件.js"; 
import { buildProfileHTML } from "./个人中心_UI模板.js";   
import { openTipModal } from "./个人中心_赞赏组件.js";     

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

    function render() {
        container.innerHTML = ""; 

        let isFollowing = false;
        if (currentUser && userData.followers) { isFollowing = userData.followers.includes(currentUser.account); }

        const privacy = userData.privacy || {};
        const followingCount = (!isMe && privacy.follows) ? "***" : (userData.following ? userData.following.length : 0);

        const tabs = [{ id: "published", label: isMe ? "我的发布" : "TA的发布" }];
        if (isMe) tabs.push({ id: "acquired", label: "我获取的" }); // 🚀 新增：已安装/购买记录
        if (isMe || !privacy.likes) tabs.push({ id: "liked", label: "近期点赞" });
        if (isMe || !privacy.follows) tabs.push({ id: "following", label: "关注的人" });

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
                container.querySelector("#btn-withdraw").onclick = () => {
                    openWithdrawModal(currentUser, () => { 
                        userData.earn_balance = 0; 
                        userData.tip_balance = 0;
                        render(); 
                    });
                };

                container.querySelector("#btn-open-settings").onclick = () => { isSettingsView = true; render(); };
                container.querySelector("#btn-logout").onclick = async () => {
                    if (await showConfirm("确定要退出当前账号吗？")) {
                        localStorage.removeItem("ComfyCommunity_User"); localStorage.removeItem("ComfyCommunity_Token");
                        sessionStorage.removeItem("ComfyCommunity_User"); sessionStorage.removeItem("ComfyCommunity_Token");
                        window.dispatchEvent(new CustomEvent("comfy-route-back")); 
                        window.dispatchEvent(new CustomEvent("comfy-user-logout"));
                        showToast("已退出登录", "info");
                    }
                };
            } else {
                const btnTip = container.querySelector("#btn-tip-user");
                if (btnTip) {
                    btnTip.onclick = () => {
                        if (!currentUser) return showToast("请先登录您的账号后再进行赞赏！", "warning");
                        openTipModal(currentUser, userData, (newBalance) => {
                            currentUser.balance = newBalance;
                            openOtherUserProfileModal(userData.account, currentUser); 
                        });
                    };
                }

                const btnFollow = container.querySelector("#btn-follow-user");
                if (btnFollow) {
                    btnFollow.onclick = async () => {
                        if (!currentUser) return showToast("请先登录您的账号！", "warning");
                        btnFollow.innerHTML = "⏳ 处理中..."; btnFollow.disabled = true;
                        try {
                            const newStatus = !isFollowing;
                            await api.toggleFollow(currentUser.account, userData.account, newStatus);
                            isFollowing = newStatus;
                            
                            if (!userData.followers) userData.followers = [];
                            if (isFollowing) { if (!userData.followers.includes(currentUser.account)) userData.followers.push(currentUser.account); } 
                            else { userData.followers = userData.followers.filter(a => a !== currentUser.account); }
                            render(); 
                        } catch (err) { showToast("操作失败：" + err.message, "error"); btnFollow.innerHTML = isFollowing ? "✔️ 已关注" : "➕ 关注作者"; } 
                        finally { btnFollow.disabled = false; }
                    };
                }

                const btnSendMsg = container.querySelector("#btn-send-msg");
                if (btnSendMsg) {
                    btnSendMsg.onclick = () => {
                        if (!currentUser) return showToast("请先登录您的社区账号！", "warning");
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
                    if (!content || !content.trim()) return showToast("⚠️ 公告内容不能为空！", "warning");

                    const isConfirm = await showConfirm(`发送说明：\n\n1. 内容将下发给所有用户，无法撤回。\n2. 内容将在消息中心醒目展示。\n\n⚠️ 请确保内容准确，谨慎操作！`);
                    if (!isConfirm) return;

                    btnAdminAnnSend.innerText = "🚀 发布中...";
                    btnAdminAnnSend.style.opacity = "0.7";
                    btnAdminAnnSend.disabled = true;

                    try {
                        await api.postSystemAnnouncement(currentUser.account, content);
                        contentArea.value = ""; // 清空输入框
                        showToast("🎉 全站系统公告发布成功！", "success");
                    } catch (error) {
                        console.error("Failed to post announcement:", error);
                        showToast(`❌ 发布失败: ${error.message}`, "error");
                    } finally {
                        btnAdminAnnSend.innerText = "🚀 确认发布全站公告";
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
                        resultArea.innerHTML = '<span style="color: #f85149;">❌ 请输入脚本名称！</span>';
                        return;
                    }

                    btnAdminRunScript.innerText = "⏳ 执行中...";
                    btnAdminRunScript.disabled = true;
                    resultArea.innerHTML = '<span style="color: #58a6ff;">⚡ 正在执行 ' + scriptName + ' ...</span>';

                    try {
                        const response = await api.runAdminScript(currentUser.account, scriptName);
                        const output = response.output || response.message || JSON.stringify(response, null, 2);
                        resultArea.innerHTML = `<span style="color: #3fb950;">✅ 执行成功：</span>\n\n${output}`;
                    } catch (error) {
                        console.error("Script execution failed:", error);
                        resultArea.innerHTML = `<span style="color: #f85149;">❌ 执行失败：</span>\n\n${error.message}`;
                    } finally {
                        btnAdminRunScript.innerText = "▶️ 执行";
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

    // 【修改点】：同步拉取云端 JSON 资料表与 SQL 金融账本
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
    } catch (err) { if (!activeContainer) showToast("获取作者信息失败，可能该账号已注销。", "error"); }
}