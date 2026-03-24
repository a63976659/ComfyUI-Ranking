// 前端页面/components/顶部导航组件.js
import { createAuthView } from "../auth/用户注册登录组件.js";
import { openUserProfileModal } from "../profile/个人中心视图.js";
import { openChatModal } from "../social/私信聊天组件.js";
import { api } from "../core/网络请求API.js"; 
import { showToast } from "./UI交互提示组件.js";
import { showAboutInfo } from "./关于插件组件.js";
import { openNotificationCenter, loadUnreadCount } from "../social/通知中心组件.js"; // 【新增】：引入分离出去的通知中心引擎

export function createTopNav() {
    const userHeader = document.createElement("div");
    Object.assign(userHeader.style, {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "15px 10px", backgroundColor: "#1a1a1a", borderBottom: "1px solid #333"
    });

    const titleSpan = document.createElement("div");
    titleSpan.innerHTML = "<strong style='color:#4CAF50;'>ComfyUI</strong> 社区精选";
    
    Object.assign(titleSpan.style, { fontSize: "16px", cursor: "pointer", transition: "opacity 0.2s" });
    titleSpan.title = "查看关于本插件与作者信息";
    titleSpan.onmouseover = () => titleSpan.style.opacity = "0.8";
    titleSpan.onmouseout = () => titleSpan.style.opacity = "1";
    titleSpan.onclick = () => showAboutInfo(currentUser);

    const userActionBtn = document.createElement("button");
    Object.assign(userActionBtn.style, { padding: "6px 12px", backgroundColor: "#333", color: "#fff", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", fontSize: "12px", transition: "background 0.2s" });

    const chatEntryBtn = document.createElement("button");
    Object.assign(chatEntryBtn.style, { background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "18px", marginRight: "10px", transition: "0.2s" });
    chatEntryBtn.innerHTML = `✉️`;
    chatEntryBtn.title = "打开私信聊天中心";

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

    chatEntryBtn.onclick = () => {
        if (!currentUser) return showToast("请先登录您的社区账号！", "warning");
        openChatModal(currentUser);
    };

    // 【核心瘦身】：直接调用拆分出去的独立组件模块
    bellBtn.onclick = () => openNotificationCenter(currentUser, bellBtn);

    const updateUserButtonState = () => {
        if (currentUser) {
            userActionBtn.innerHTML = `👤 ${currentUser.name || currentUser.account || '未知用户'}`;
            userActionBtn.style.backgroundColor = "#2196F3";
            userActionBtn.style.borderColor = "#2196F3";
            userActionBtn.onclick = () => openUserProfileModal(currentUser);
            loadUnreadCount(currentUser, bellBtn); // 使用外部引入的未读计数器
        } else {
            userActionBtn.innerHTML = "🔑 登录 / 注册";
            userActionBtn.style.backgroundColor = "#333";
            userActionBtn.style.borderColor = "#555";
            bellBtn.querySelector("#unread-badge").style.display = "none";
            
            userActionBtn.onclick = () => {
                const view = createAuthView(async (formData) => {
                    try {
                        userActionBtn.innerHTML = "⏳ 处理中...";
                        let userData; let token; let isRemember = false;
                        
                        if (formData.type === "reset") {
                            userActionBtn.innerHTML = "⏳ 修改密码中...";
                            await api.resetPassword(
                                formData.account, formData.oldPassword, formData.newPassword, 
                                formData.verifyContact, formData.verifyType, formData.code
                            );
                            showToast("密码修改成功！请使用新密码重新登录。", "success");
                            window.dispatchEvent(new CustomEvent("comfy-route-back")); updateUserButtonState(); return; 
                        }
                        if (formData.type === "register") {
                            if (formData.avatarFile) {
                                userActionBtn.innerHTML = "⏳ 上传头像中...";
                                try {
                                    const uploadRes = await api.uploadFile(formData.avatarFile, "avatar");
                                    formData.avatarDataUrl = uploadRes.url; 
                                } catch (uploadErr) {}
                            }
                            userActionBtn.innerHTML = "⏳ 注册账号中...";
                            await api.register(formData);
                            showToast("注册成功！正在为您自动登录...", "success");
                            const res = await api.login(formData.account, formData.password);
                            userData = { account: formData.account, name: formData.name, avatar: res.avatar, ...res }; 
                            token = res.token; isRemember = true; 
                        } else if (formData.type === "login") {
                            const res = await api.login(formData.account, formData.password);
                            token = res.token; isRemember = formData.remember;
                            try {
                                if (isRemember) localStorage.setItem("ComfyCommunity_Token", token); 
                                else sessionStorage.setItem("ComfyCommunity_Token", token);
                                const profileRes = await api.getUserProfile(formData.account);
                                userData = { account: formData.account, ...profileRes.data };
                            } catch (e) {
                                userData = { account: formData.account, name: res.name || res.data?.name || formData.account, avatar: res.avatar || res.data?.avatar };
                            }
                            showToast("登录成功！", "success");
                        }
                        
                        currentUser = userData;
                        const sessionData = JSON.stringify({ user: currentUser, expireAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
                        if (isRemember) { localStorage.setItem("ComfyCommunity_User", sessionData); localStorage.setItem("ComfyCommunity_Token", token); } 
                        else { sessionStorage.setItem("ComfyCommunity_User", sessionData); sessionStorage.setItem("ComfyCommunity_Token", token); }

                        window.dispatchEvent(new CustomEvent("comfy-route-back"));
                        updateUserButtonState();
                        window.dispatchEvent(new CustomEvent("comfy-user-login")); 
                    } catch (err) {
                        showToast("操作失败: " + err.message, "error"); updateUserButtonState(); 
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
    
    userHeader.appendChild(titleSpan);
    userHeader.appendChild(actionWrapper);

    return {
        dom: userHeader,
        getCurrentUser: () => currentUser
    };
}