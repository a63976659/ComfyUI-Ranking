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
async function ensureSidebarDOM() {
    const { buildSidebarDOM } = await import('./侧边栏主程序.js');
    return buildSidebarDOM();
}

app.registerExtension({
    name: "Comfy.CommunityLeaderboardSidebar",
    async setup(app) {
        // 语言切换事件 - 标记需要刷新
        document.addEventListener('comfy-language-change', () => {
            pendingLanguageRefresh = true;
        });
        
        // 返回主界面时，如果有语言切换则刷新
        window.addEventListener('comfy-route-back', async () => {
            if (pendingLanguageRefresh && globalSidebarContainer) {
                pendingLanguageRefresh = false;
                setTimeout(async () => {
                    try {
                        globalSidebarDOM = await ensureSidebarDOM();
                        globalSidebarContainer.innerHTML = '';
                        globalSidebarContainer.appendChild(globalSidebarDOM);
                    } catch (e) {
                        console.error('侧边栏刷新失败:', e);
                    }
                }, 50);
            }
        });

        // 注册侧边栏 Tab
        if (app.extensionManager && app.extensionManager.registerSidebarTab) {
            app.extensionManager.registerSidebarTab({
                id: "comfyui-ranking-sidebar",
                title: "社区精选",
                icon: "pi pi-trophy",
                type: "custom",
                render: async (container) => {
                    globalSidebarContainer = container;
                    try {
                        if (!globalSidebarDOM) {
                            globalSidebarDOM = await ensureSidebarDOM();
                        }
                        container.innerHTML = '';
                        container.appendChild(globalSidebarDOM);
                    } catch (e) {
                        console.error('侧边栏功能加载失败:', e);
                        container.innerHTML = '<div style="text-align:center; padding:40px; color:#F44336;">⚠️ 加载失败，请刷新重试</div>';
                    }
                }
            });
        }
    }
});
