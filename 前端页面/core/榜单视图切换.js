import { t } from '../components/用户体验增强.js';

function cleanupView(view) {
    try { view._cleanup?.(); }
    catch { console.warn('Sidebar view cleanup failed'); }
}

// 业务视图仍负责自己的请求/事件；此边界负责原容器的挂载与代次。
export async function mountSidebarDomainView({
    contentArea, currentUser, keyword, renderToken, getRenderToken,
    loadModule, factory, errorKey, afterMount,
}) {
    const isCurrent = () => renderToken === getRenderToken();
    if (!isCurrent()) return;
    let cleaned = false;
    let view;
    const cleanupOld = () => {
        if (cleaned) return;
        cleaned = true;
        Array.from(contentArea.children).forEach(cleanupView);
    };
    try {
        const module = await loadModule();
        if (!isCurrent()) return;
        cleanupOld();
        if (!isCurrent()) return;
        view = module[factory](currentUser, keyword);
        if (!isCurrent()) {
            cleanupView(view);
            return;
        }
        contentArea.innerHTML = '';
        contentArea.appendChild(view);
        afterMount?.(module);
    } catch {
        if (!isCurrent()) return;
        cleanupOld();
        if (view) cleanupView(view);
        if (!isCurrent()) return;
        // 不输出异常原文，可能包含远端正文、路径或凭据。
        console.error('Sidebar view load failed');
        contentArea.innerHTML = '';
        const error = document.createElement('div');
        error.setAttribute('role', 'alert');
        error.style.cssText = 'text-align:center; padding: 40px 20px; color:#F44336;';
        error.textContent = `❌ ${t(errorKey)}`;
        contentArea.appendChild(error);
    }
}
