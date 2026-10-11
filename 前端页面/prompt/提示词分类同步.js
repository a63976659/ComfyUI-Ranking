// 每个视图独立串行同步；统一网络层负责共享离线冷却。
export function isPromptCategoryList(value) {
    return Array.isArray(value) && value.every(name => typeof name === 'string' && name.trim().length > 0);
}

export function createPromptCategorySync({ isCurrent, getType, fetchCategories, save, render, onError }) {
    let running = false;
    return async function sync() {
        if (running || !isCurrent()) return;
        running = true;
        try {
            while (isCurrent()) {
                const type = getType();
                try {
                    const response = await fetchCategories(type);
                    if (!isCurrent()) return;
                    const list = Array.isArray(response) ? response : response?.data;
                    if (response?.success === false || (response?.status && response.status !== 'success') || !isPromptCategoryList(list)) {
                        throw new TypeError('Invalid prompt categories');
                    }
                    save(type, list);
                    if (type === getType()) render(list);
                } catch {
                    if (!isCurrent()) return;
                    onError();
                }
                if (type === getType()) return;
            }
        } finally {
            running = false;
        }
    };
}
