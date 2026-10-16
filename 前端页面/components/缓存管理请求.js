// 本机缓存运维请求：单次提交、有界响应；不参与云端冷却或榜单缓存。
import { API } from '../core/全局配置.js';

import { readLocalJSON } from '../core/本机请求读取.js';

async function requestCache(action, { signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, action === 'stats' ? API.LOCAL_CACHE_STATS_TIMEOUT : API.LOCAL_CACHE_CLEAR_TIMEOUT);
    try {
        if (controller.signal.aborted) throw new Error('cache_operation_unconfirmed');
        const response = await fetch('/community_hub/cache/'+action, {
            method: action === 'stats' ? 'GET' : 'POST',
            headers: action === 'stats' ? {} : { 'Content-Type': 'application/json' },
            body: action === 'stats' ? undefined : JSON.stringify({ target: 'all' }),
            cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('cache_operation_unconfirmed');
        const data = await readLocalJSON(response, controller, API.LOCAL_CACHE_RESPONSE_MAX_BYTES);
        const fields = action === 'stats' ? ['image_count', 'image_size', 'video_count', 'video_size'] : ['cleared_count', 'freed_size'];
        if (!data || typeof data !== 'object' || Array.isArray(data)
                || fields.some(key => !Number.isSafeInteger(data[key]) || data[key] < 0)) {
            throw new Error('cache_response_invalid');
        }
        return Object.fromEntries(fields.map(key => [key, data[key]]));
    } catch {
        throw new Error('cache_operation_unconfirmed');
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        controller.abort();
    }
}

export const getDiskCacheStats = options => requestCache('stats', options);
export const clearDiskCache = options => requestCache('clear', options);
