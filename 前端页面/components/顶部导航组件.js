// 前端页面/components/顶部导航组件.js
import { createAuthView } from "../auth/用户注册登录组件.js";
import { openUserProfileModal } from "../profile/个人中心视图.js";
import { openChatModal } from "../social/私信聊天组件.js";
import { api } from "../core/网络请求API.js"; 
import { showToast } from "./UI交互提示组件.js";
import { showAboutInfo } from "./关于插件组件.js";
import { openNotificationCenter, loadUnreadCount } from "../social/通知中心组件.js";
import { openSettingsPage } from "./全局设置组件.js";  // ⚙️ 新增
import { CACHE } from "../core/全局配置.js";
import { t } from "./用户体验增强.js";  // 🌐 多语言支持

// 🚀 新增：消息轮询定时器
let messagePollingTimer = null;
let isPollingActive = false;  // 🔧 P3优化：防止重复启动轮询

export function createTopNav() {
    const userHeader = document.createElement("div");
    Object.assign(userHeader.style, {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "15px 10px", backgroundColor: "#1a1a1a", borderBottom: "1px solid #333"
    });

    const titleSpan = document.createElement("div");
    titleSpan.innerHTML = `<strong style='color:#4CAF50;'>ComfyUI</strong> ${t('nav.community') || '社区精选'}`;
    
    Object.assign(titleSpan.style, { fontSize: "16px", cursor: "pointer", transition: "opacity 0.2s" });
    titleSpan.title = "查看关于本插件与作者信息";
    titleSpan.onmouseover = () => titleSpan.style.opacity = "0.8";
    titleSpan.onmouseout = () => titleSpan.style.opacity = "1";
    titleSpan.onclick = () => showAboutInfo(currentUser);

    // ⚙️ 设置按钮（放在社区精选旁边）
    const settingsBtn = document.createElement("button");
    Object.assign(settingsBtn.style, {
        background: "transparent",
        border: "none",
        color: "#888",
        cursor: "pointer",
        fontSize: "16px",
        marginLeft: "8px",
        padding: "4px",
        transition: "0.2s",
        verticalAlign: "middle"
    });
    settingsBtn.innerHTML = "⚙️";
    settingsBtn.title = t('nav.settings');
    settingsBtn.onmouseover = () => { settingsBtn.style.color = "#4CAF50"; settingsBtn.style.transform = "rotate(30deg)"; };
    settingsBtn.onmouseout = () => { settingsBtn.style.color = "#888"; settingsBtn.style.transform = "rotate(0deg)"; };
    settingsBtn.onclick = (e) => { e.stopPropagation(); openSettingsPage(); };

    // 📦 将标题和设置按钮包裹在一起
    const titleWrapper = document.createElement("div");
    titleWrapper.style.display = "flex";
    titleWrapper.style.alignItems = "center";
    titleWrapper.appendChild(titleSpan);
    titleWrapper.appendChild(settingsBtn);

    const userActionBtn = document.createElement("button");
    Object.assign(userActionBtn.style, { padding: "6px 12px", backgroundColor: "#333", color: "#fff", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", fontSize: "12px", transition: "background 0.2s" });

    const chatEntryBtn = document.createElement("button");
    Object.assign(chatEntryBtn.style, { background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "18px", marginRight: "10px", transition: "0.2s" });
    chatEntryBtn.innerHTML = `✉️`;
    chatEntryBtn.title = t('social.chat');

    const bellBtn = document.createElement("button");
    Object.assign(bellBtn.style, { background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "18px", position: "relative", marginRight: "15px" });
    bellBtn.innerHTML = `🔔<span id="unread-badge" style="display:none; position:absolute; top:-4px; right:-8px; background:#F44336; color:white; font-size:10px; font-weight:bold; padding:2px 5px; border-radius:10px; line-height:1;">0</span>`;
    
    let currentUser = null; 
    try {
        const savedUserStr = localStorage.getItem("ComfyCommunity_User");
        if (savedUserStr) {
            const data = JSON.parse(savedUserStr);
            if (data.expireAt && Date.now() < data.expireAt) { currentUser = data.user; } 
            else { localStorage.removeItem("ComfyCommunity_User"); localStorage.removeItem("ComfyCommunity_Token"); }
        } else {
            const tempUserStr = sessionStorage.getItem("ComfyCommunity_User");
            if (tempUserStr) { currentUser = JSON.parse(tempUserStr).user; }
        }
    } catch (e) {}

    window.addEventListener("comfy-user-logout", () => { currentUser = null; updateUserButtonState(); });

    window.addEventListener('comfy-ranking-auth-expired', () => {
        stopMessagePolling();
    });

    chatEntryBtn.onclick = () => {
        if (!currentUser) return showToast(t('auth.login_required') || "请先登录您的社区账号！", "warning");
        openChatModal(currentUser);
    };

    // 【核心瘦身】：直接调用拆分出去的独立组件模块
    bellBtn.onclick = () => openNotificationCenter(currentUser, bellBtn);

    const updateUserButtonState = () => {
        if (currentUser) {
            userActionBtn.innerHTML = `👤 ${currentUser.name || currentUser.account || t('common.unknown_user') || '未知用户'}`;
            userActionBtn.style.backgroundColor = "#2196F3";
            userActionBtn.style.borderColor = "#2196F3";
            userActionBtn.onclick = () => openUserProfileModal(currentUser);
            loadUnreadCount(currentUser, bellBtn);
            
            // 🚀 新增：启动消息定时轮询
            startMessagePolling(currentUser, bellBtn);
        } else {
            // 🚀 新增：停止轮询
            stopMessagePolling();
            
            userActionBtn.innerHTML = `🔑 ${t('nav.login')}`;
            userActionBtn.style.backgroundColor = "#333";
            userActionBtn.style.borderColor = "#555";
            bellBtn.querySelector("#unread-badge").style.display = "none";
            
            userActionBtn.onclick = () => {
                const view = createAuthView(async (formData) => {
                    try {
                        userActionBtn.innerHTML = `⏳ ${t('common.loading')}`;
                        let userData; let token; let isRemember = false;
                        
                        if (formData.type === "reset") {
                            userActionBtn.innerHTML = `⏳ ${t('auth.resetting_password') || '修改密码中...'}`;
                            
                            // 🚀 核心修复：停止错误地拆解字段导致 undefined，直接将包含所有数据的 formData 对象完整传给 API 装甲！
                            await api.resetPassword(formData);
                            
                            showToast(t('auth.password_reset_success') || "密码修改成功！请使用新密码重新登录。", "success");
                            window.dispatchEvent(new CustomEvent("comfy-route-back")); updateUserButtonState(); return; 
                        }
                        if (formData.type === "register") {
                            if (formData.avatarFile) {
                                userActionBtn.innerHTML = `⏳ ${t('auth.uploading_avatar') || '上传头像中...'}`;
                                try {
                                    const uploadRes = await api.uploadFile(formData.avatarFile, "avatar");
                                    formData.avatarDataUrl = uploadRes.url; 
                                } catch (uploadErr) {
                                    // 上传失败时清除 base64 数据，避免巨大字符串存入后端
                                    console.warn("头像上传失败，跳过头像设置:", uploadErr.message || uploadErr);
                                    delete formData.avatarDataUrl;
                                    delete formData.avatarFile;
                                }
                            }
                            userActionBtn.innerHTML = `⏳ ${t('auth.registering') || '注册账号中...'}`;
                            await api.register(formData);
                            showToast(t('auth.register_success') + (t('auth.auto_login') || '！正在为您自动登录...'), "success");
                            // 注册后自动登录，默认保持登录
                            const res = await api.login(formData.account, formData.password, true);
                            userData = { account: formData.account, name: formData.name, avatar: res.avatar, ...res }; 
                            token = res.token; isRemember = true; 
                        } else if (formData.type === "login") {
                            const res = await api.login(formData.account, formData.password, formData.remember);
                            token = res.token; isRemember = formData.remember;
                            try {
                                if (isRemember) localStorage.setItem("ComfyCommunity_Token", token); 
                                else sessionStorage.setItem("ComfyCommunity_Token", token);
                                const profileRes = await api.getUserProfile(formData.account);
                                userData = { account: formData.account, ...profileRes.data };
                            } catch (e) {
                                userData = { account: formData.account, name: res.name || res.data?.name || formData.account, avatar: res.avatar || res.data?.avatar };
                            }
                            showToast(t('auth.login_success'), "success");
                        }
                        
                        currentUser = userData;
                        const sessionData = JSON.stringify({ user: currentUser, expireAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
                        if (isRemember) { localStorage.setItem("ComfyCommunity_User", sessionData); localStorage.setItem("ComfyCommunity_Token", token); } 
                        else { sessionStorage.setItem("ComfyCommunity_User", sessionData); sessionStorage.setItem("ComfyCommunity_Token", token); }

                        window.dispatchEvent(new CustomEvent("comfy-route-back"));
                        updateUserButtonState();
                        window.dispatchEvent(new CustomEvent("comfy-user-login")); 
                    } catch (err) {
                        showToast(`${t('common.error')}: ` + err.message, "error"); updateUserButtonState(); 
                    }
                });
                window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
            };
        }
    };
    
    updateUserButtonState();

    const actionWrapper = document.createElement("div");
    actionWrapper.style.display = "flex"; actionWrapper.style.alignItems = "center";
    actionWrapper.appendChild(chatEntryBtn); 
    actionWrapper.appendChild(bellBtn);
    actionWrapper.appendChild(userActionBtn);
    
    userHeader.appendChild(titleWrapper);  // ⚙️ 改为 titleWrapper
    userHeader.appendChild(actionWrapper);

    return {
        dom: userHeader,
        getCurrentUser: () => currentUser
    };
}

// 🚀 新增：启动消息定时轮询
function startMessagePolling(currentUser, bellBtn) {
    if (!CACHE.MESSAGE_POLL.ENABLED) return;
    if (isPollingActive) return;  // 🔧 P3优化：防止重复启动
    
    // 清除旧的定时器
    stopMessagePolling();
    isPollingActive = true;
    
    // 创建新的定时器，每隔一定时间检查新消息
    messagePollingTimer = setInterval(async () => {
        // 🔧 P3优化：双重检查，确保用户仍在线
        if (!currentUser || !isPollingActive) {
            stopMessagePolling();
            return;
        }
        try {
            await loadUnreadCount(currentUser, bellBtn);
        } catch (e) {
            // 静默失败，不影响用户体验
        }
    }, CACHE.MESSAGE_POLL.INTERVAL);
    
    console.log(`📨 消息轮询已启动，间隔 ${CACHE.MESSAGE_POLL.INTERVAL / 1000} 秒`);
}

// 🚀 新增：停止消息定时轮询
function stopMessagePolling() {
    isPollingActive = false;  // 🔧 P3优化：先标记为停止
    if (messagePollingTimer) {
        clearInterval(messagePollingTimer);
        messagePollingTimer = null;
        console.log('📨 消息轮询已停止');
    }
}