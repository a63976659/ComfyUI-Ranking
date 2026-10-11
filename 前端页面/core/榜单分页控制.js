// 侧边栏分页控制：滚动加载与无滚动容器时的手动降级。
import { createPaginationLoader } from "../components/性能优化工具.js";
import { filterItemsByKeyword } from "./榜单本地查询.js";
import { t } from "../components/用户体验增强.js";

// ==========================================
// 📜 设置分页加载器
// ==========================================
export function setupSidebarPagination(contentArea, state, pageSize, loadMoreData, keyword, tab, renderToken, getRenderToken) {
    if (renderToken !== getRenderToken()) return;
    // 安全清理旧分页器，防止状态残留和重复事件监听
    if (state.loader) {
        state.loader.stop();
    }
    state.loader = null;

    // 获取滚动容器（侧边栏主容器）
    const scrollContainer = contentArea.closest(".sidebar-scroll-container") || contentArea.parentElement;

    if (!scrollContainer) {
        console.warn("⚠️ 未找到滚动容器，分页加载无法启动");

        // 添加手动加载按钮作为 fallback
        let nextPage = 2;
        let stopped = false;
        const isCurrent = () => !stopped && renderToken === getRenderToken();
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.textContent = t('task.load_more');
        loadMoreBtn.style.cssText = 'width:100%;padding:10px;margin-top:10px;cursor:pointer;border:1px solid #555;border-radius:6px;background:transparent;color:inherit;';
        state.loader = { stop() {
            stopped = true;
            loadMoreBtn.onclick = null;
            loadMoreBtn.disabled = true;
        } };
        loadMoreBtn.onclick = async () => {
            if (!isCurrent()) return;
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = t('common.loading');
            try {
                const result = await loadMoreData(nextPage, pageSize, { isCurrent });
                if (!isCurrent()) return;
                if (result && result.length > 0) {
                    nextPage++;
                    loadMoreBtn.textContent = t('task.load_more');
                } else {
                    loadMoreBtn.textContent = t('common.no_more');
                    loadMoreBtn.style.cursor = 'default';
                    loadMoreBtn.onclick = null;
                }
            } catch (err) {
                if (!isCurrent()) return;
                console.error("手动加载更多失败");
                loadMoreBtn.textContent = t('task.load_failed');
            }
            loadMoreBtn.disabled = false;
        };
        contentArea.appendChild(loadMoreBtn);
        return;
    }

    // 计算数据总量（考虑搜索过滤，创作者Tab有keyword时不进行本地过滤，因为后端已过滤）
    // 📌 口径必须与 loadSidebarContent 内的 _applySearchScope 一致（先过滤再计数）；
    // 本函数是模块级、拿不到那个闭包，故保留等价实现，改动其一务必同步另一处
    const getTotalDataCount = () => {
        if (!keyword) return state.allData.length;
        // 创作者Tab后端搜索已过滤，直接返回全部数据
        if (tab === "creators") return state.allData.length;
        return filterItemsByKeyword(state.allData, keyword).length;
    };

    // 创建分页加载器
    const loader = createPaginationLoader({
        container: scrollContainer,
        pageSize: pageSize,
        threshold: 300,
        t,
        loadMore: async (page, size, { isCurrent: isLoaderCurrent = () => true } = {}) => {
            const isCurrent = () => renderToken === getRenderToken() &&
                state.loader === loader && isLoaderCurrent();
            if (!isCurrent()) return [];
            const totalCount = getTotalDataCount();

            // 如果已显示完所有数据，返回空数组停止加载
            if (state.displayedCount >= totalCount) {
                return [];
            }

            return loadMoreData(page, size, { isCurrent });
        },
    });

    state.loader = loader;
    loader.start();
}

