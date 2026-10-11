// 仅管理榜单内存状态与分页器所有权，不读取存储或访问宿主。
export function createSidebarPaginationStore() {
    const states = new Map();
    return {
        get(tab, sort) {
            const key = `${tab}_${sort}`;
            if (!states.has(key)) {
                states.set(key, {
                    allData: [],
                    displayedCount: 0,
                    loader: null,
                    isFullyLoaded: false,
                    isSearchResult: false,
                    searchKeyword: '',
                });
            }
            return states.get(key);
        },
        findCompleteData(tab) {
            for (const [key, state] of states) {
                if (key.startsWith(`${tab}_`) && state.allData.length > 0 && state.isFullyLoaded) {
                    return state.allData;
                }
            }
            return null;
        },
        stopLoaders() {
            let failure;
            for (const state of states.values()) {
                const loader = state.loader;
                state.loader = null;
                try { loader?.stop(); }
                catch (error) { failure ??= error; }
            }
            // 单个停止失败也必须继续清理其它分页器，随后交回调用方处理。
            if (failure) throw failure;
        },
    };
}
