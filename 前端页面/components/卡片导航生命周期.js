// 按视图管理导航代次，不清理榜单数据或滚动位置。
export function createCardNavigationScope(target, isCurrent, { captureSession = () => () => true, storageKeys = [] } = {}) {
    let generation = 0;
    let disposed = false;
    let identityRevoked = false;
    const isViewSessionCurrent = captureSession();
    const events = ['comfy-route-view', 'comfy-route-back'];
    const identityEvents = ['comfy-user-login', 'comfy-user-logout', 'comfy-ranking-auth-expired'];
    const invalidate = () => { generation++; };
    const revokeIdentity = () => { identityRevoked = true; invalidate(); };
    const onStorage = event => {
        if (event.key === null || storageKeys.includes(event.key)) revokeIdentity();
    };
    for (const event of events) target.addEventListener(event, invalidate);
    for (const event of identityEvents) target.addEventListener(event, revokeIdentity);
    target.addEventListener('storage', onStorage);
    return {
        capture() {
            const captured = generation;
            const isSessionCurrent = captureSession();
            return () => !disposed && !identityRevoked && captured === generation && isCurrent() && isViewSessionCurrent() && isSessionCurrent();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            generation++;
            for (const event of events) target.removeEventListener(event, invalidate);
            for (const event of identityEvents) target.removeEventListener(event, revokeIdentity);
            target.removeEventListener('storage', onStorage);
        },
    };
}
