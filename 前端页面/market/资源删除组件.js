// 资源卡片与详情共用删除确认；取消页面不取消或重放已经提交的DELETE。
import { api, captureRequestSession, invalidateRelatedCache } from "../core/网络请求API.js";
import { CACHE } from "../core/全局配置.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { showConfirm, showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

const active = new Set();
export async function showResourceDeleteDialog({ itemData, currentUser, isCurrent = () => true, onDeleted }) {
    const account = currentUser?.account, itemId = itemData?.id;
    const matches = captureRequestSession();
    const sessionMatches = () => matches() && getUser()?.account === account;
    if (!account || !itemId || !sessionMatches() || !isCurrent()
        || (itemData.author !== account && currentUser.is_admin !== true)) return false;
    const key = JSON.stringify([account, itemId]);
    if (active.has(key)) return false;
    active.add(key);
    const controller = new AbortController();
    let observer;
    const scope = createTaskViewScope({
        sessionMatches, connected: isCurrent,
        subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
        cancelReads: () => {}, invalidate: () => {}
    });
    scope.addCleanup(() => { observer?.disconnect(); controller.abort(); active.delete(key); });
    observer = new MutationObserver(() => { scope.isCurrent(); });
    observer.observe(document.body, { childList: true, subtree: true });
    const message = [t('item.content_label') + (itemData.title || t('item.untitled')),
        t('item.type_label') + (itemData.type || t('item.type_unknown')), '', t('item.delete_consequence'),
        t('item.delete_consequence_1'), t('item.delete_consequence_2'), t('item.delete_consequence_3')].join('\n');
    try {
        const succeeded = await showConfirm(message, {
            title: t('item.confirm_delete_title'), type: 'danger', confirmText: t('item.confirm_delete'),
            processingText: t('item.deleting'), signal: controller.signal,
            onConfirm: async () => {
                if (!scope.isCurrent()) return false;
                try {
                    const result = await api.deleteItem(itemId);
                    if (!scope.isCurrent()) return false;
                    if (result?.status !== 'success') {
                        showToast(t('item.delete_failed_retry'), 'error'); return false;
                    }
                    return true;
                } catch (_) {
                    if (scope.isCurrent()) showToast(t('item.delete_request_failed'), 'error');
                    return false;
                }
            }
        });
        if (!succeeded || !scope.isCurrent()) return false;
        try { invalidateRelatedCache(`/api/items/${itemId}`, 'DELETE'); }
        catch (_) { console.warn('删除成功，部分本地缓存无法清理'); }
        showToast(t('item.delete_success'), 'success');
        try { onDeleted?.(); } catch (_) { console.warn('删除成功，视图更新失败'); }
        return true;
    } finally { scope.dispose(); }
}
