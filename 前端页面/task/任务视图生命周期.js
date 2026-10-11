/** 会话与路由范围；取消读取，不重放已经提交的业务操作。 */
export function createTaskViewScope({ sessionMatches, connected, subscribe, cancelReads, invalidate }) {
    let disposed = false;
    let unsubscribe = () => {};
    const cleanups = new Set();
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        // 一项清理失败不能阻止其它弹窗、读取与订阅释放。
        try { unsubscribe(); } catch (_) {}
        try { cancelReads(); } catch (_) {}
        for (const cleanup of cleanups) {
            try { cleanup(); } catch (_) {}
        }
        cleanups.clear();
    };
    const revoke = () => {
        if (disposed) return;
        dispose();
        invalidate();
    };
    try {
        unsubscribe = subscribe(force => {
            if (force || !sessionMatches()) revoke();
        });
        if (typeof unsubscribe !== "function") throw new Error("Invalid view subscription");
        // 注册期间同步撤销时，补收刚返回的取消订阅句柄。
        if (disposed) { try { unsubscribe(); } catch (_) {} }
    } catch (error) {
        dispose();
        throw error;
    }
    return {
        dispose,
        isCurrent() {
            if (disposed) return false;
            if (!sessionMatches()) { revoke(); return false; }
            if (!connected()) { dispose(); return false; }
            return true;
        },
        addCleanup(cleanup) {
            if (disposed) { cleanup(); return () => {}; }
            cleanups.add(cleanup);
            return () => cleanups.delete(cleanup);
        }
    };
}

/** 同域登录事件及跨标签身份记录变化，任务与申诉视图使用相同语义。 */
export function subscribeTaskSessionChanges(notify, { target, eventBus, events, userKey, tokenKey }) {
    let stopped = false;
    const cleanups = [];
    const notifyCurrent = force => { if (!stopped) notify(force); };
    const unsubscribe = () => {
        if (stopped) return;
        stopped = true;
        // 一项平台/总线清理失败不阻止其它监听释放，旧回调也不再通知。
        for (const cleanup of cleanups.splice(0)) {
            try { cleanup(); }
            catch (_) { console.warn('会话监听清理失败，继续释放其它监听。'); }
        }
    };
    const handlers = [
        ["comfy-user-login", () => notifyCurrent(true)],
        ["comfy-user-logout", () => notifyCurrent(true)],
        ["comfy-ranking-auth-expired", () => notifyCurrent(true)],
        ["storage", event => {
            if (event.key === null || event.key === userKey) notifyCurrent(true);
            else if (event.key === tokenKey) notifyCurrent(false);
        }]
    ];
    const subscribeBus = name => {
        const handler = () => notifyCurrent(true);
        let off;
        cleanups.push(() => {
            if (typeof off === "function") {
                try { off(); return; }
                catch (_) { console.warn('会话总线清理失败，尝试释放原监听。'); }
            }
            // on中途失败或返回坏句柄时，仍能精确回收已登记的原回调。
            if (typeof eventBus.off === "function") eventBus.off(name, handler);
        });
        off = eventBus.on(name, handler);
        if (typeof off !== "function") throw new Error("Invalid session subscription");
    };
    try {
        for (const [name, handler] of handlers) {
            cleanups.push(() => target.removeEventListener(name, handler));
            target.addEventListener(name, handler);
        }
        subscribeBus(events.USER_LOGIN);
        subscribeBus(events.USER_LOGOUT);
        return unsubscribe;
    } catch (error) {
        unsubscribe();
        throw error;
    }
}
