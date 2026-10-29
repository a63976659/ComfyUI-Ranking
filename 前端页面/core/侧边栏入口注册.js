// 前端页面/core/侧边栏入口注册.js
// ==========================================
// 🎯 侧边栏入口注册（独立模块）
// ==========================================
// 职责：仅负责向 ComfyUI 注册侧边栏标签页
// 设计原则：此文件应极少修改，确保入口稳定性
// ==========================================

import { app } from "../../../scripts/app.js";

let globalSidebarDOM = null;
let globalSidebarContainer = null;
let pendingLanguageRefresh = false;

/**
 * 动态加载侧边栏功能模块并构建 DOM
 */
async function ensureSidebarDOM(isCurrent = () => true) {
    const { buildSidebarDOM } = await import('./侧边栏主程序.js');
    return isCurrent() ? buildSidebarDOM() : null;
}

app.registerExtension({
    name: "Comfy.CommunityLeaderboardSidebar",
    async setup(app) {
        const { t, initI18n } = await import('../components/用户体验_国际化.js');
        initI18n();
        let registeredTab = null;
        let initialSidebarLoad = null;
        let renderRevision = 0;
        let renderOwnerCurrent = () => false;
        let languageRevision = 0;
        let refreshTimer = null;
        let refreshInProgress = false;
        let refreshQueued = null;
        const queueLanguageRefresh = request => {
            if (refreshInProgress) {
                refreshQueued = request;
                return;
            }
            if (refreshTimer !== null) clearTimeout(refreshTimer);
            const { target, previous, revision, navigationCurrent } = request;
            refreshTimer = setTimeout(async () => {
                refreshTimer = null;
                refreshInProgress = true;
                refreshQueued = null;
                const isOwnerCurrent = () => pendingLanguageRefresh && revision === languageRevision
                    && target === globalSidebarContainer && previous === globalSidebarDOM
                    && target.isConnected && target.contains(previous);
                const isCurrent = () => isOwnerCurrent() && navigationCurrent();
                try {
                    if (!isCurrent()) return;
                    const next = await ensureSidebarDOM(isCurrent);
                    if (!next || !isOwnerCurrent()) return;
                    globalSidebarDOM = next;
                    bindLanguageRefresh(next);
                    target.replaceChildren(next);
                    pendingLanguageRefresh = false;
                } catch {
                    if (isOwnerCurrent()) console.error('Sidebar language refresh failed');
                } finally {
                    refreshInProgress = false;
                    const queued = refreshQueued;
                    refreshQueued = null;
                    if (queued && pendingLanguageRefresh) queueLanguageRefresh(queued);
                }
            }, 50);
        };
        const scheduleLanguageRefresh = () => {
            if (!pendingLanguageRefresh || !globalSidebarContainer) return;
            const previous = globalSidebarDOM;
            queueLanguageRefresh({
                target: globalSidebarContainer,
                previous,
                revision: languageRevision,
                navigationCurrent: previous?._captureListNavigation?.() ?? (() => true)
            });
        };
        const bindLanguageRefresh = root => {
            root._onListReturn = () => {
                if (root === globalSidebarDOM) scheduleLanguageRefresh();
            };
        };
        // 语言切换事件 - 标记需要刷新
        document.addEventListener('comfy-language-change', () => {
            pendingLanguageRefresh = true;
            languageRevision++;
            if (registeredTab) {
                const title = t('nav.community');
                const tabs = app.extensionManager?.getSidebarTabs?.();
                const currentTab = Array.isArray(tabs)
                    ? tabs.find(tab => tab.id === registeredTab.id) : null;
                if (currentTab) currentTab.title = title;
                registeredTab.title = title;
            }
        });
        
        // 返回主界面时，如果有语言切换则刷新
        window.addEventListener('comfy-route-back', scheduleLanguageRefresh);

        // 注册侧边栏 Tab
        if (app.extensionManager && app.extensionManager.registerSidebarTab) {
            registeredTab = {
                id: "comfyui-ranking-sidebar",
                order: 20, // 侧边栏排序规则：数字小的排前面（由 NodeCraft AI 的侧边栏排序器统一排序）
                title: t('nav.community'),
                icon: "pi pi-trophy",
                type: "custom",
                render: async (container) => {
                    const revision = ++renderRevision;
                    const connectedAtStart = container.isConnected;
                    globalSidebarContainer = container;
                    const isCurrent = () => {
                        const sidebar = app.extensionManager?.sidebarTab;
                        const activeId = (sidebar?.value ?? sidebar)?.activeSidebarTabId;
                        return revision === renderRevision && container === globalSidebarContainer
                            && (!connectedAtStart || container.isConnected)
                            && (!activeId || activeId === registeredTab.id);
                    };
                    renderOwnerCurrent = isCurrent;
                    if (!isCurrent()) return;
                    try {
                        if (!globalSidebarDOM) {
                            if (!initialSidebarLoad) {
                                initialSidebarLoad = ensureSidebarDOM(() => renderOwnerCurrent())
                                    .then(root => {
                                        if (root) globalSidebarDOM = root;
                                    })
                                    .finally(() => { initialSidebarLoad = null; });
                            }
                            await initialSidebarLoad;
                        }
                        if (!isCurrent() || !globalSidebarDOM) return;
                        bindLanguageRefresh(globalSidebarDOM);
                        container.innerHTML = '';
                        // 宿主给自定义 Tab 的容器没有高度，root 的 height:100% 会退化为内容高度；
                        // 挂载时直接锁定容器高度，不再依赖侧边栏面板上的 MutationObserver 兜底
                        container.style.height = "100%";
                        container.appendChild(globalSidebarDOM);
                    } catch {
                        if (!isCurrent()) return;
                        console.error('侧边栏功能加载失败');
                        const failure = document.createElement("div");
                        failure.setAttribute("role", "alert");
                        failure.style.cssText = "text-align:center; padding:40px; color:#F44336;";
                        failure.textContent = `⚠️ ${t('common.sidebar_load_failed')}`;
                        container.replaceChildren(failure);
                    }
                }
            };
            app.extensionManager.registerSidebarTab(registeredTab);
        }
    }
});

// ── 侧边栏 Tab 排序规则（各插件入口文件内嵌同一段代码，全局标记保证只执行一次） ──
// 规则：registerSidebarTab 声明 order 数字，小的排前面；未声明的（含官方 Tab）一律不动
// 实现：每秒轮询一次（最长 30 秒），等声明 order 的 Tab 集合连续两轮稳定后重排，兼容插件多时的慢加载
if (!window.__comfySidebarTabSorterInstalled) {
    window.__comfySidebarTabSorterInstalled = true;
    console.debug("[侧边栏排序] 规则已安装，开始轮询等待各插件 Tab 注册…");
    let 上次指纹 = null;
    let 已耗时 = 0;
    const 轮询间隔 = 1000;
    const 定时器 = setInterval(() => {
        已耗时 += 轮询间隔;
        if (已耗时 > 30000) {
            clearInterval(定时器);
            console.debug("[侧边栏排序] 轮询结束（30秒）");
            return;
        }
        const 管理器 = app.extensionManager;
        if (!管理器?.getSidebarTabs || !管理器.unregisterSidebarTab || !管理器.registerSidebarTab) return;
        const 全部 = 管理器.getSidebarTabs();
        if (!Array.isArray(全部)) return;
        const 参与者 = 全部.filter((t) => typeof t?.order === "number");
        // 集合有变化说明还有插件在陆续注册，等下一轮稳定后再排
        const 指纹 = 参与者.map((t) => t.id).sort().join();
        if (指纹 !== 上次指纹) {
            上次指纹 = 指纹;
            return;
        }
        if (参与者.length < 2) return;
        // 若用户已点开某个参与排序的 Tab，本轮跳过，避免注销激活面板
        const 状态 = 管理器.sidebarTab?.value ?? 管理器.sidebarTab;
        if (状态?.activeSidebarTabId && 参与者.some((t) => t.id === 状态.activeSidebarTabId)) return;
        const 排序后 = [...参与者].sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)));
        const 已有序 = 参与者.map((t) => t.id).join() === 排序后.map((t) => t.id).join()
            && 全部.slice(-参与者.length).every((t) => typeof t?.order === "number");
        if (已有序) return;
        for (const t of 排序后) 管理器.unregisterSidebarTab(t.id);
        for (const t of 排序后) 管理器.registerSidebarTab(t);
        console.debug("[侧边栏排序] 已按 order 固定 Tab 顺序:", 排序后.map((t) => `${t.id}(${t.order})`));
    }, 轮询间隔);
}
