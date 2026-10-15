// 前端页面/components/顶部导航组件.js
import { openUserProfileModal } from "../profile/个人中心视图.js";
import { openChatModal, loadChatUnreadCount } from "../social/私信聊天组件.js";
import { api, captureRequestSession } from "../core/网络请求API.js";
import { showToast } from "./UI交互提示组件.js";
import { showAboutInfo } from "./关于插件组件.js";
import { loadUnreadCount } from "../social/未读角标工具.js";
import { setUser, updateUser, initUserState } from "../core/状态管理.js";
import { readUserSession, sessionProfile } from "../core/用户会话存储.js";
import { API, CACHE, PLACEHOLDERS } from "../core/全局配置.js";
import { t } from "./用户体验增强.js";  // 🌐 多语言支持
import { createTopBanner } from "./顶部广告组件.js";
import { uploadFile } from "../market/发布内容_提交引擎.js";  // 🖼️ 带压缩管线的统一上传包装器

// 🚀 新增：消息轮询定时器
let messagePollingTimer = null;
let pollingGeneration = 0;
let isPollingActive = false;  // 🔧 P3优化：防止重复启动轮询

// 🔧 P1修复：window 监听只安装一次并始终指向最新导航实例
// （createTopNav 会随侧边栏重建反复调用，若每次 addEventListener 会累积旧闭包，
//   旧闭包持有的 bellBtn/userActionBtn 已脱离 DOM，轮询徽标更新也随之失效）
let _navInstance = null;
let _navWindowHandlers = null;
function _registerNavWindowListeners() {
    if (_navWindowHandlers) {
        for (const { event, handler } of _navWindowHandlers) window.removeEventListener(event, handler);
    }
    _navWindowHandlers = [
        { event: "comfy-user-logout", handler: () => { if (_navInstance) _navInstance.onLogout(); } },
        // 🔧 修复：凭证失效（401）时除停止轮询外，同步重置导航登录态（原实现未重置，头像按钮仍显示已登录）
        { event: "comfy-ranking-auth-expired", handler: () => { stopMessagePolling(); if (_navInstance) _navInstance.onLogout(); } },
        { event: "storage", handler: (event) => { if (_navInstance) _navInstance.onStorage(event); } },
        // 🔔 聊天关闭后刷新 ✉️ 未读红点（打开会话已标记已读，未读数下降，需即时回写）
        { event: "comfy-chat-unread-changed", handler: () => { if (_navInstance) _navInstance.onChatUnreadChanged(); } }
    ];
    for (const { event, handler } of _navWindowHandlers) window.addEventListener(event, handler);
}

export function createTopNav() {
    stopMessagePolling();
    const userHeader = document.createElement("div");
    userHeader.className = "top-nav";

    const titleSpan = document.createElement("button");
    titleSpan.type = "button";
    titleSpan.className = "top-nav__brand";
    titleSpan.innerHTML = `<strong>ComfyUI</strong> ${t('nav.community')}`;
    titleSpan.title = t('nav.about_title');
    titleSpan.setAttribute("aria-label", t('nav.about_title'));
    titleSpan.onclick = () => showAboutInfo(currentUser);

    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = "top-nav__icon";
    settingsBtn.textContent = "⚙️";
    settingsBtn.title = t('nav.settings');
    settingsBtn.setAttribute("aria-label", t('nav.settings'));
    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        return openDeferredView(async () => {
            const { createSettingsView } = await import('./全局设置组件.js');
            return createSettingsView;
        }, settingsBtn);
    };

    const titleWrapper = document.createElement("div");
    titleWrapper.className = "top-nav__heading";
    titleWrapper.appendChild(titleSpan);
    titleWrapper.appendChild(settingsBtn);

    const userActionBtn = document.createElement("button");
    userActionBtn.type = "button";
    userActionBtn.className = "top-nav__identity";

    const chatEntryBtn = document.createElement("button");
    chatEntryBtn.type = "button";
    chatEntryBtn.className = "top-nav__icon";
    chatEntryBtn.innerHTML = `✉️<span id="chat-unread-badge" class="top-nav__badge" style="display:none">0</span>`;
    chatEntryBtn.title = t('social.chat');
    chatEntryBtn.setAttribute("aria-label", t('social.chat'));

    const bellBtn = document.createElement("button");
    bellBtn.type = "button";
    bellBtn.className = "top-nav__icon";
    bellBtn.innerHTML = `🔔<span id="unread-badge" class="top-nav__badge" style="display:none">0</span>`;
    bellBtn.title = t('social.notifications');
    bellBtn.setAttribute("aria-label", t('social.notifications'));

    let currentUser = null;
    let navigationGeneration = 0;
    chatEntryBtn.onclick = () => openChatModal(currentUser);
    bellBtn.onclick = () => {
        if (!currentUser?.account) return showToast(t('notif.login_required'), 'warning');
        const notificationUser = currentUser;
        return openDeferredView(async () => {
            const { openNotificationCenter } = await import('../social/通知中心组件.js');
            return () => openNotificationCenter(notificationUser, bellBtn);
        }, bellBtn, { ownsRoute: true });
    };
    const sessionStorages = () => ['localStorage', 'sessionStorage'].map(name => { try { return window[name]; } catch (_) { return null; } });
    const restoredSession = readUserSession(sessionStorages(), CACHE.LEGACY_KEYS);
    currentUser = restoredSession?.user || null;

    async function openDeferredView(loadFactory, trigger, { ownsRoute = false } = {}) {
        const generation = navigationGeneration;
        const matchesSession = captureRequestSession();
        const loadingView = document.createElement('div');
        loadingView.className = 'hub-inline-load-state';
        const message = document.createElement('span');
        message.textContent = t('common.loading');
        message.setAttribute('role', 'status');
        message.setAttribute('aria-live', 'polite');
        const back = document.createElement('button');
        back.type = 'button'; back.className = 'ranking-publish-back';
        back.textContent = t('common.back');
        let active = true;
        loadingView._cleanup = () => { active = false; back.onclick = null; };
        loadingView.appendChild(message); loadingView.appendChild(back);
        const currentLoad = () => active && loadingView.isConnected && userHeader.isConnected
            && _navInstance?.dom === userHeader && navigationGeneration === generation && matchesSession();
        back.onclick = () => {
            if (!active || !loadingView.isConnected || _navInstance?.dom !== userHeader) return;
            window.dispatchEvent(new CustomEvent('comfy-route-back'));
            if (trigger.isConnected) trigger.focus();
        };
        window.dispatchEvent(new CustomEvent('comfy-route-view', { detail: { view: loadingView } }));
        try {
            const createView = await loadFactory();
            if (!currentLoad()) return;
            if (ownsRoute) {
                await createView();
                if (currentLoad()) back.onclick();
                return;
            }
            const view = createView();
            if (!currentLoad()) { try { view._cleanup?.(); } finally { view.remove(); } return; }
            window.dispatchEvent(new CustomEvent('comfy-route-view', { detail: { view } }));
        } catch {
            if (currentLoad()) {
                message.textContent = t('common.operation_failed');
                message.setAttribute('role', 'alert'); message.setAttribute('aria-live', 'assertive');
            }
        } finally {
            if (active && !currentLoad()) {
                if (loadingView.isConnected && _navInstance?.dom === userHeader) window.dispatchEvent(new CustomEvent('comfy-route-back'));
                else { loadingView._cleanup(); loadingView.remove(); }
            }
        }
    }

    const updateUserButtonState = () => {
        navigationGeneration++;
        if (currentUser) {
            const avatar = document.createElement("img");
            avatar.className = "top-nav__avatar";
            avatar.alt = "";
            avatar.src = currentUser.avatarDataUrl || currentUser.avatar || PLACEHOLDERS.AVATAR_SMALL;
            avatar.onerror = () => {
                avatar.onerror = null;
                avatar.src = PLACEHOLDERS.AVATAR_SMALL;
            };
            userActionBtn.replaceChildren(avatar);
            userActionBtn.setAttribute("aria-label", t('nav.profile'));
            userActionBtn.dataset.authenticated = "true";
            userActionBtn.title = t('nav.profile');
            userActionBtn.onclick = () => openUserProfileModal(currentUser);
            loadUnreadCount(currentUser, bellBtn);
            loadChatUnreadCount(currentUser, chatEntryBtn);
            
            // 🚀 新增：启动消息定时轮询
            startMessagePolling(currentUser, bellBtn, chatEntryBtn);
        } else {
            // 🚀 新增：停止轮询
            stopMessagePolling();
            
            userActionBtn.innerHTML = `🔑 ${t('nav.login')}`;
            userActionBtn.dataset.authenticated = "false";
            userActionBtn.title = t('nav.login');
            userActionBtn.setAttribute("aria-label", t('nav.login'));
            bellBtn.querySelector("#unread-badge").style.display = "none";
            chatEntryBtn.querySelector("#chat-unread-badge").style.display = "none";
            
            userActionBtn.onclick = () => openDeferredView(async () => {
                const { createAuthView } = await import('../auth/用户注册登录组件.js');
                return () => createAuthView(async (formData, context) => {
                    const originalSession = captureRequestSession();
                    const current = () => context.isCurrent() && userHeader.isConnected
                        && _navInstance?.dom === userHeader && originalSession();
                    if (!current()) return;
                    try {
                        if (formData.type === 'reset') {
                            const reset = await api.resetPassword(formData);
                            if (reset?.status !== 'success') throw new Error('Unconfirmed reset');
                            if (!current()) return;
                            showToast(t('auth.password_reset_success'), 'success');
                            window.dispatchEvent(new CustomEvent('comfy-route-back')); updateUserButtonState(); return;
                        }
                        const account = formData.account;
                        const isRegister = formData.type === 'register';
                        if (!isRegister && formData.type !== 'login') return;
                        const pendingAvatarFile = isRegister ? formData.avatarFile : null;
                        if (isRegister) {
                            const registration = { ...formData }; delete registration.avatarFile; delete registration.avatarDataUrl;
                            const registered = await api.register(registration);
                            if (registered?.status !== 'success') throw new Error('Unconfirmed registration');
                            if (!current()) return;
                        }
                        const remember = isRegister || formData.remember === true;
                        const result = await api.login(account, formData.password, remember);
                        if (!current()) return;
                        if (result?.status !== 'success' || typeof result.token !== 'string' || !result.token
                            || (result.account && result.account !== account)) throw new Error('Invalid login response');
                        currentUser = setUser({ account, name: result.name || formData.name || account, avatar: result.avatar }, result.token, remember);
                        const authenticatedSession = captureRequestSession();
                        const sameLogin = () => authenticatedSession() && userHeader.isConnected
                            && _navInstance?.dom === userHeader && currentUser?.account === account;
                        showToast(t(isRegister ? 'auth.register_success' : 'auth.login_success'), 'success');
                        // 凭证已发布即完成登录，资料补充不阻塞页面返回。
                        window.dispatchEvent(new CustomEvent('comfy-route-back'));
                        window.dispatchEvent(new CustomEvent('comfy-user-login')); updateUserButtonState();
                        const applyProfile = data => {
                            if (!sameLogin() || data?.account !== account) return;
                            currentUser = sessionProfile({ ...currentUser, ...data });
                            if (currentUser.avatarDataUrl) currentUser.avatar = currentUser.avatarDataUrl;
                            updateUser(currentUser); updateUserButtonState();
                        };
                        try {
                            const profile = await api.getUserProfile(account, { timeout: API.BACKGROUND_TIMEOUT,
                                retries: API.BACKGROUND_RETRIES, componentId: `login-profile-${account}` });
                            if (profile?.status === 'success') applyProfile(profile.data);
                        } catch (_) {}
                        if (!sameLogin() || !pendingAvatarFile) return;
                        try {
                            const avatar = await uploadFile(pendingAvatarFile, 'avatar', { isCurrent: sameLogin, silent: true });
                            if (!sameLogin()) return;
                            if (!avatar) { showToast(t('auth.avatar_set_failed'), 'warning'); return; }
                            const updated = await api.updateUserProfile(account, { avatarDataUrl: avatar });
                            if (!sameLogin()) return;
                            if (updated?.status === 'success') applyProfile(updated.data);
                            else showToast(t('auth.avatar_set_failed'), 'warning');
                        } catch (_) { if (sameLogin()) showToast(t('auth.avatar_set_failed'), 'warning'); }
                    } catch (error) {
                        if (current()) {
                            let messageKey = 'common.error';
                            if (formData.type === 'login') {
                                messageKey = 'auth.login_failed';
                                if (error?.status === 401 || error?.status === 404) messageKey = 'auth.login_credentials_invalid';
                                else if (error?.status === 429) messageKey = 'auth.login_rate_limited';
                                else if (error?.status === 422) messageKey = 'auth.login_input_invalid';
                                else if (error?.status >= 500) messageKey = 'auth.login_service_unavailable';
                                else if (error?.code === 'network_timeout') messageKey = 'auth.login_timeout';
                                else if (error?.code === 'network_unavailable' || error?.name === 'CloudUnavailableError') messageKey = 'common.network_error_retry';
                            }
                            showToast(t(messageKey), 'error'); updateUserButtonState();
                        }
                    }
                });
            }, userActionBtn);
        }
    };

    // 🔄 跨标签页登录状态同步：其他标签页修改 localStorage 时触发
    // 🔧 P1修复：改为模块级统一注册的 storage 监听回调（onStorage），不再逐实例 addEventListener
    const handleCrossTabStorage = event => {
        if (event.key === null || [CACHE.LEGACY_KEYS.USER, CACHE.LEGACY_KEYS.TOKEN].includes(event.key)) {
            currentUser = readUserSession(sessionStorages(), CACHE.LEGACY_KEYS)?.user || null;
            stopMessagePolling();
            initUserState(); updateUserButtonState();
        }
    };

    updateUserButtonState();

    // 🔧 P1修复：注册为当前活跃实例，模块级监听将路由到本实例的回调
    _navInstance = {
        dom: userHeader,
        onLogout: () => { currentUser = null; updateUserButtonState(); },
        onStorage: handleCrossTabStorage,
        onChatUnreadChanged: () => loadChatUnreadCount(currentUser, chatEntryBtn)
    };
    _registerNavWindowListeners();

    const actionWrapper = document.createElement("div");
    actionWrapper.className = "top-nav__actions";
    actionWrapper.appendChild(chatEntryBtn); 
    actionWrapper.appendChild(bellBtn);
    actionWrapper.appendChild(userActionBtn);
    
    userHeader.appendChild(titleWrapper);
    userHeader.appendChild(actionWrapper);
    // 广告独占下一行，DOM/键盘顺序与视觉顺序一致。
    const banner = createTopBanner();
    if (banner) userHeader.appendChild(banner);

    return {
        dom: userHeader,
        getCurrentUser: () => currentUser
    };
}

// 🚀 新增：启动消息定时轮询
function startMessagePolling(currentUser, bellBtn, chatEntryBtn) {
    if (!CACHE.MESSAGE_POLL.ENABLED || isPollingActive) return;
    stopMessagePolling();
    isPollingActive = true;
    const generation = pollingGeneration;
    const sessionMatches = captureRequestSession();
    const current = () => isPollingActive && generation === pollingGeneration
        && sessionMatches() && _navInstance?.dom?.contains(bellBtn) && bellBtn.isConnected && chatEntryBtn.isConnected;
    const poll = async () => {
        if (!current()) {
            if (generation === pollingGeneration) stopMessagePolling();
            return;
        }
        await Promise.allSettled([loadUnreadCount(currentUser, bellBtn), loadChatUnreadCount(currentUser, chatEntryBtn)]);
        if (current()) messagePollingTimer = setTimeout(poll, CACHE.MESSAGE_POLL.INTERVAL);
        else if (generation === pollingGeneration) stopMessagePolling();
    };
    messagePollingTimer = setTimeout(poll, CACHE.MESSAGE_POLL.INTERVAL);
}

// 🚀 新增：停止消息定时轮询
function stopMessagePolling() {
    pollingGeneration++;
    isPollingActive = false;  // 🔧 P3优化：先标记为停止
    if (messagePollingTimer) {
        clearTimeout(messagePollingTimer);
        messagePollingTimer = null;
        console.log('📨 消息轮询已停止');
    }
}
