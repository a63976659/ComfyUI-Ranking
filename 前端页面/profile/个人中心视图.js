// 前端页面/profile/个人中心视图.js
import { api, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
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
import { getBannerCacheKey, getCurrentAccount, IS_WEB_MODE, CACHE, UI, API, getCachedProfile, setCachedProfile, normalizeProfileImageUrl } from "../core/全局配置.js";
import { logoutAndClearUserData, eventBus, EVENTS } from "../core/状态管理.js";


import { createTaskViewScope, subscribeTaskSessionChanges } from '../task/任务视图生命周期.js';
import { endProfileListView } from './个人列表缓存.js';
import { normalizeProfileData, normalizeWalletData, mergeStoredProfile } from './个人资料工具.js';

let profileSequence = 0;
let profileNavigation = 0;
const safeGet = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const safeSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
function sessionStorages() {
    return ['localStorage', 'sessionStorage'].map(name => { try { return window[name]; } catch (_) { return null; } });
}

// ==========================================
// 🖼️ 个人资料卡背景图云端同步
// ==========================================
// 作用：当本地无缓存但云端有背景图时，下载并缓存到本地
async function syncBannerCache(account, bannerUrl, scope, apply) {
    const source = normalizeProfileImageUrl(bannerUrl, true);
    if (!/^https?:\/\//i.test(source) || !scope.isCurrent()
        || normalizeProfileImageUrl(safeGet(getBannerCacheKey(account)))) return;
    const controller = new AbortController();
    const release = scope.addCleanup(() => controller.abort());
    const timer = setTimeout(() => controller.abort(), API.BACKGROUND_TIMEOUT);
    try {
        const fetchUrl = IS_WEB_MODE ? source : API.LOCAL_IMAGE_PROXY_PREFIX + encodeURIComponent(source);
        const response = await fetch(fetchUrl, { signal: controller.signal });
        if (!response.ok || !scope.isCurrent()) return;
        const blob = await response.blob();
        if (!scope.isCurrent() || !/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) return;
        if (blob.size <= UI.PROFILE_BANNER_CACHE_BYTES) {
            const data = await new Promise(resolve => {
                const reader = new FileReader();
                const off = scope.addCleanup(() => { reader.abort(); resolve(null); });
                reader.onload = () => { off(); resolve(reader.result); };
                reader.onerror = reader.onabort = () => { off(); resolve(null); };
                reader.readAsDataURL(blob);
            });
            if (!scope.isCurrent() || typeof data !== 'string') return;
            safeSet(getBannerCacheKey(account), data);
        }
        if (!scope.isCurrent()) return;
        const blobUrl = URL.createObjectURL(blob);
        scope.addCleanup(() => URL.revokeObjectURL(blobUrl));
        apply(blobUrl);
    } catch (_) { /* 背景同步失败保留当前背景，不影响资料。 */ }
    finally { clearTimeout(timer); release(); }
}

async function _fetchProfileAndWallet(account, { own = false, options = {} } = {}) {
    const profileRequest = api.getUserProfile(account, options).then(response => {
        if (response?.status !== 'success') throw new Error('Invalid profile response');
        return normalizeProfileData(response.data, account, own);
    });
    if (!own) return profileRequest;
    const [profile, wallet] = await Promise.allSettled([profileRequest, api.getWallet(account, options)]);
    return { ...(profile.status === 'fulfilled' ? profile.value : {}),
        ...(wallet.status === 'fulfilled' ? normalizeWalletData(wallet.value) : {}) };
}

/** 统一设置 Tab 按钮点击事件 */
function _setupTabButton(container, selector, tabId, onSwitch) {
    const btn = container.querySelector(selector);
    if (btn) btn.onclick = () => onSwitch(tabId);
}

export function showUserProfile(initialUserData, currentUser = null, isMe = true) {
    const container = document.createElement("div");
    container.className = "profile-view";

    let isSettingsView = false;
    let activeTab = safeGet(`Profile_ActiveTab_${isMe}`) || "published";
    let userData = normalizeProfileData(initialUserData, initialUserData.account, isMe);
    let constructing = true;
    let renderGeneration = 0;
    let logoutPending = false;
    const componentId = `profile-detail-${++profileSequence}`;
    const releaseChild = () => {
        const list = container.querySelector('#profile-list-container');
        if (list) endProfileListView(list);
        container.querySelector('.ranking-settings-form')?._cleanup?.();
    };
    const scope = createTaskViewScope({
        sessionMatches: captureRequestSession(), connected: () => constructing || container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => {
            releaseChild(); userData = { account: initialUserData.account };
            container.replaceChildren();
            const back = document.createElement('button'); back.type = 'button';
            back.className = 'about-back'; back.textContent = t('common.back');
            back.onclick = () => window.dispatchEvent(new CustomEvent('comfy-route-back'));
            const status = document.createElement('div'); status.setAttribute('role', 'status');
            status.textContent = t('auth.session_changed'); container.append(back, status);
        }
    });
    container._profileScope = scope;
    container._profileReadOptions = { componentId, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES };
    container._cleanup = () => { releaseChild(); scope.dispose(); container.replaceChildren(); };
    // 独立挂载者也能释放；正常侧栏路由在移除前调用 _cleanup。
    const observer = new MutationObserver(() => { if (!container.isConnected) container._cleanup(); });
    observer.observe(document.body, { childList: true, subtree: true });
    scope.addCleanup(() => { observer.disconnect(); releaseChild(); });

    function render() {
        if (!scope.isCurrent()) return;
        releaseChild();
        const generation = ++renderGeneration;
        const current = () => scope.isCurrent() && renderGeneration === generation;
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
        if (isMe) tabs.push({ id: "my_prompts", label: t('prompt.my_prompts') });
        if (isMe) tabs.push({ id: "collected", label: t('profile.my_collected') });
        if (isMe || !privacy.likes) tabs.push({ id: "liked", label: t('profile.recent_likes') });
        if (isMe || !privacy.follows) tabs.push({ id: "following", label: t('profile.following') });
        if (isMe || !privacy.followers) tabs.push({ id: "followers", label: t('profile.followers') });

        if (!tabs.find(t => t.id === activeTab)) activeTab = "published";

        // 调用解耦的模板引擎生成 HTML
        container.innerHTML = buildProfileHTML(userData, isMe, isSettingsView, isFollowing, followingCount, activeTab, tabs);

        if (isSettingsView && isMe) {
            const settingsContainer = createSettingsForm(
                userData,
                () => { if (!current()) return; isSettingsView = false; render(); },
                (newUserData) => {
                    if (!current()) return;
                    userData = normalizeProfileData(newUserData, userData.account, true);
                    if (container.updateData) container.updateData(userData);
                    isSettingsView = false;
                    render();
                },
                { isCurrent: current }
            );
            container.appendChild(settingsContainer);
            container.querySelector("#btn-back-profile").onclick = () => { isSettingsView = false; render(); };
        } else {
            container.querySelector("#btn-back-profile").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));

            if (isMe) {
                container.querySelector("#btn-wallet").onclick = () => {
                    if (!current()) return;
                    openRechargeModal(currentUser, (newBalance) => { if (!current()) return; userData.balance = newBalance; render(); });
                };
                container.querySelector("#btn-withdraw").onclick = async () => {
                    if (!current()) return;
                    const button = container.querySelector('#btn-withdraw');
                    if (button.disabled) return;
                    button.disabled = true;
                    // 点击提现按钮前先刷新钱包数据
                    try {
                        const freshWallet = await api.getWallet(currentUser.account, { componentId });
                        if (!current()) return;
                        Object.assign(currentUser, normalizeWalletData(freshWallet));
                    } catch (err) {
                        if (!current()) return;
                        console.warn("刷新钱包数据失败");
                    }
                    if (!current()) return;
                    button.disabled = false;
                    openWithdrawModal(currentUser, async () => {
                        if (!current()) return;
                        // 提现成功后重新拉取用户数据刷新余额
                        try {
                            const walletResponse = await api.getWallet(currentUser.account, { componentId });
                            if (!current()) return;
                            const walletRes = normalizeWalletData(walletResponse);
                            userData.balance = walletRes.balance ?? userData.balance;
                            userData.earn_balance = walletRes.earn_balance ?? userData.earn_balance;
                            userData.tip_balance = walletRes.tip_balance ?? userData.tip_balance;
                            userData.total_withdrawn = walletRes.total_withdrawn ?? userData.total_withdrawn;
                        } catch (err) {
                            if (!current()) return;
                            console.warn("提现后刷新钱包数据失败");
                        }
                        render();
                    });
                };

                container.querySelector("#btn-open-settings").onclick = () => { isSettingsView = true; render(); };
                container.querySelector("#btn-logout").onclick = async () => {
                    if (!current() || logoutPending) return;
                    const currentAccount = getCurrentAccount();
                    logoutPending = true;
                    try {
                        if (!await showConfirm(t('confirm.logout')) || !scope.isCurrent()
                            || getCurrentAccount() !== currentAccount) return;
                        logoutAndClearUserData(currentAccount);
                        window.dispatchEvent(new CustomEvent("comfy-route-back"));
                        window.dispatchEvent(new CustomEvent("comfy-user-logout"));
                        showToast(t('feedback.logged_out'), "info");
                    } finally {
                        logoutPending = false;
                    }
                };
            } else {
                const btnTip = container.querySelector("#btn-tip-user");
                if (btnTip) {
                    btnTip.onclick = async () => {
                        if (!current()) return;
                        if (!currentUser) return showToast(t('feedback.login_required_tip'), "warning");
                        await openTipModal(currentUser, userData, (newBalance) => {
                            if (!current()) return;
                            currentUser.balance = newBalance;
                            openOtherUserProfileModal(userData.account, currentUser);
                        }, null, { isCurrent: current });
                    };
                }

                const btnFollow = container.querySelector("#btn-follow-user");
                if (btnFollow) {
                    btnFollow.onclick = async () => {
                        if (!current()) return;
                        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
                        btnFollow.innerHTML = `⏳ ${t('common.processing')}...`; btnFollow.disabled = true;
                        try {
                            const newStatus = !isFollowing;
                            const response = await api.toggleFollow(currentUser.account, userData.account, newStatus);
                            if (!current()) return;
                            if (response?.status !== 'success') throw new Error('Invalid follow response');
                            isFollowing = newStatus;

                            if (!userData.followers) userData.followers = [];
                            if (isFollowing) { if (!userData.followers.includes(currentUser.account)) userData.followers.push(currentUser.account); }
                            else { userData.followers = userData.followers.filter(a => a !== currentUser.account); }
                            render();
                        } catch (_) { if (!current()) return; showToast(t('feedback.operation_failed'), "error"); btnFollow.innerHTML = isFollowing ? `✔️ ${t('social.followed')}` : `➕ ${t('social.follow')}`; }
                        finally { if (current()) btnFollow.disabled = false; }
                    };
                }

                const btnSendMsg = container.querySelector("#btn-send-msg");
                if (btnSendMsg) {
                    btnSendMsg.onclick = () => {
                        if (!current()) return;
                        if (!currentUser) return showToast(t('feedback.login_required'), "warning");
                        openChatModal(currentUser, userData.account);
                    };
                }
            }

            container.querySelectorAll(".profile-tab-btn").forEach(btn => {
                btn.onclick = (e) => {
                    if (!current()) return;
                    activeTab = e.currentTarget.getAttribute("data-id");
                    safeSet(`Profile_ActiveTab_${isMe}`, activeTab);
                    render();
                };
            });

            // 粉丝/关注数点击跳转对应列表
            const _switchTab = (tabId) => { if (!current()) return; activeTab = tabId; safeSet(`Profile_ActiveTab_${isMe}`, tabId); render(); };
            _setupTabButton(container, "#btn-followers", "followers", _switchTab);
            _setupTabButton(container, "#btn-following", "following", _switchTab);

            const listDOM = container.querySelector("#profile-list-container");
            listDOM._profileSessionCurrent = current;
            listDOM._profileAddCleanup = cleanup => scope.addCleanup(cleanup);
            renderProfileListContent(activeTab, listDOM, userData, currentUser, openOtherUserProfileModal);
        }
    }

    container.updateData = function(newUserData) {
        if (!scope.isCurrent() || !newUserData || typeof newUserData !== 'object' || Array.isArray(newUserData)) return;
        const safeNewData = normalizeProfileData({ ...userData, ...newUserData }, userData.account, isMe);
        Object.keys(safeNewData).forEach(key => safeNewData[key] == null && delete safeNewData[key]);
        const mergedData = { ...userData, ...safeNewData };
        if (JSON.stringify(userData) !== JSON.stringify(mergedData)) {
            userData = mergedData;
            if (!isSettingsView) { render(); }
        }
    };

    render();
    constructing = false;
    return container;
}

export function openUserProfileModal(userData) {
    ++profileNavigation;
    const view = showUserProfile(userData, userData, true);
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
    _fetchProfileAndWallet(userData.account, { own: true, options: view._profileReadOptions }).then(freshData => {
        if (!view._profileScope.isCurrent()) return;
        mergeStoredProfile(userData.account, freshData, sessionStorages(), CACHE.LEGACY_KEYS.USER);
        view.updateData(freshData);
        if (freshData.bannerUrl) syncBannerCache(userData.account, freshData.bannerUrl, view._profileScope,
            blobUrl => view.updateData({ bannerUrl: blobUrl }));
    }).catch(() => { if (view._profileScope.isCurrent()) console.warn('后台更新本人资料失败'); });
}

export async function openOtherUserProfileModal(targetAccount, currentUser) {
    if (currentUser && currentUser.account === targetAccount) return openUserProfileModal(currentUser);
    const generation = ++profileNavigation;
    const sessionMatches = captureRequestSession();
    const componentId = `profile-open-${++profileSequence}`;
    let activeContainer = null;
    const cached = getCachedProfile(targetAccount);
    if (cached) {
        try {
            activeContainer = showUserProfile({ ...cached, account: targetAccount }, currentUser, false);
            window.dispatchEvent(new CustomEvent('comfy-route-view', { detail: { view: activeContainer } }));
        } catch (_) {}
    }
    let obsolete = false;
    const cancel = () => { obsolete = true; requestCancelManager.cancelAll(componentId); };
    const onRouteView = event => { if (event.detail?.view !== activeContainer) cancel(); };
    window.addEventListener('comfy-route-back', cancel);
    window.addEventListener('comfy-route-view', onRouteView);
    const unsubscribe = subscribeTaskSessionChanges(force => { if (force || !sessionMatches()) cancel(); }, {
        target: window, eventBus, events: EVENTS, userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN
    });
    const current = () => !obsolete && generation === profileNavigation && sessionMatches()
        && (!activeContainer || activeContainer._profileScope.isCurrent());
    try {
        const freshData = await _fetchProfileAndWallet(targetAccount, {
            options: activeContainer?._profileReadOptions || { componentId }
        });
        if (!current()) return;
        setCachedProfile(targetAccount, freshData);
        if (activeContainer) activeContainer.updateData(freshData);
        else {
            activeContainer = showUserProfile(freshData, currentUser, false);
            window.dispatchEvent(new CustomEvent('comfy-route-view', { detail: { view: activeContainer } }));
        }
    } catch (_) {
        if (current() && !activeContainer) showToast(t('feedback.user_fetch_failed'), 'error');
    } finally {
        unsubscribe();
        window.removeEventListener('comfy-route-back', cancel);
        window.removeEventListener('comfy-route-view', onRouteView);
    }
}
