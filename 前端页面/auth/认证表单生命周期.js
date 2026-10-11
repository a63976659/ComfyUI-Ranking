/** 表单的所属DOM与清理范围；只丢弃迟到结果，不重放验证码等写请求。 */
export function createAuthFormScope(container) {
    const anchor = container.firstElementChild;
    let disposed = false;
    const cleanups = new Set();
    const alive = () => !disposed && container.isConnected;
    container._onCleanup = () => {
        if (disposed) return;
        disposed = true;
        for (const cleanup of cleanups) { try { cleanup(); } catch (_) {} }
        cleanups.clear();
    };
    return {
        alive,
        current: () => alive() && anchor?.parentElement === container,
        addCleanup(cleanup) {
            if (disposed) { try { cleanup(); } catch (_) {} return; }
            cleanups.add(cleanup);
        }
    };
}
