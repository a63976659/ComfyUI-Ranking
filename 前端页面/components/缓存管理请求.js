// 本机缓存运维请求：单次提交、有界响应；不参与云端冷却或榜单缓存。
import { API } from '../core/全局配置.js';

async function readSmallJSON(response, controller) {
    const declared = response.headers.get('Content-Length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > API.LOCAL_CACHE_RESPONSE_MAX_BYTES)) {
        throw new Error('cache_response_invalid');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('cache_response_invalid');
    const chunks = [];
    let size = 0, complete = false;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) { complete = true; break; }
            if (!chunk.value.byteLength) continue;
            size += chunk.value.byteLength;
            if (size > API.LOCAL_CACHE_RESPONSE_MAX_BYTES) throw new Error('cache_response_invalid');
            chunks.push(chunk.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } finally {
        if (!complete) {
            controller.abort();
            try { await reader.cancel(); } catch {}
        }
        reader.releaseLock();
    }
}

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
        const data = await readSmallJSON(response, controller);
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
