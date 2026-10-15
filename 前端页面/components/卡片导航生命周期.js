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
    const capture = () => {
        const captured = generation;
        const isSessionCurrent = captureSession();
        return () => !disposed && !identityRevoked && captured === generation && isCurrent() && isViewSessionCurrent() && isSessionCurrent();
    };
    return {
        capture,
        captureListFocus(container) {
            let doc = container?.ownerDocument;
            let active = doc?.activeElement;
            if (!active || !container.contains(active)) return () => {};
            let oldCards = Array.from(container.children).filter(card => card._rankingListId != null);
            let oldCard = oldCards.find(card => card === active || card.contains(active));
            if (!oldCard) return () => {};
            const id = oldCard._rankingListId;
            const index = oldCards.indexOf(oldCard);
            const rootFocused = oldCard === active;
            const tag = active.tagName;
            const className = typeof active.className === 'string' ? active.className : '';
            const current = capture();
            oldCard = oldCards = null;
            let consumed = false;
            return () => {
                if (consumed) return;
                consumed = true;
                try {
                    if (!current() || !container.isConnected || (active.isConnected && container.contains(active))) return;
                    const focused = doc.activeElement;
                    if (focused !== doc.body && focused !== doc.documentElement && focused !== active) return;
                    const cards = Array.from(container.children).filter(card => card._rankingListId != null);
                    const card = cards.find(item => item._rankingListId === id) || cards[Math.min(index, cards.length - 1)];
                    if (!card) {
                        container.setAttribute('tabindex', '-1');
                        container.focus({ preventScroll: true });
                        return;
                    }
                    const sameAction = rootFocused ? card : [...card.querySelectorAll('button, a[href], [tabindex]')]
                        .find(item => item.tagName === tag && item.className === className);
                    const replacement = sameAction || card.querySelector('.business-list-card__title') || card;
                    replacement.focus({ preventScroll: true });
                } finally {
                    container = doc = active = null;
                }
            };
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
