import { CACHE } from '../core/全局配置.js';
import { getCacheWithMeta, setCache, removeCache } from '../core/网络请求_缓存管理.js';

const viewRequests = new WeakMap();

export function beginProfileListView(element, sessionCurrent = () => true) {
    const token = {};
    viewRequests.set(element, token);
    return () => viewRequests.get(element) === token && sessionCurrent();
}

export function endProfileListView(element) { viewRequests.delete(element); }

export function normalizeProfileItems(data) {
    if (!Array.isArray(data)) throw new Error('Invalid profile list');
    const items = data.filter(item => item && typeof item === 'object' && !Array.isArray(item)
        && ((typeof item.id === 'string' && item.id.length > 0) || (typeof item.id === 'number' && Number.isFinite(item.id))));
    if (data.length && !items.length) throw new Error('Invalid profile list entries');
    return items;
}

export function normalizeCollectedProfile(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || !['items', 'posts', 'prompts'].some(key => Object.hasOwn(data, key))) throw new Error('Invalid collected list');
    return Object.fromEntries(['items', 'posts', 'prompts'].map(key => [key, normalizeProfileItems(Object.hasOwn(data, key) ? data[key] : [])]));
}

export function profileItemsFromResponse(response) {
    if (response?.status !== 'success') throw new Error('Profile list request failed');
    return normalizeProfileItems(response.data);
}

export function readProfileListCache(key, normalize = normalizeProfileItems) {
    const managed = getCacheWithMeta(key, true);
    if (managed.found) {
        try { return normalize(managed.value); } catch { removeCache(key); }
    }
    // 兼容旧版未带管理器前缀、未封装 schema 的裸 JSON 缓存。
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const data = normalize(JSON.parse(raw));
        writeProfileListCache(key, data);
        try { if (localStorage.getItem(CACHE.PREFIX + key)) localStorage.removeItem(key); } catch {}
        return data;
    } catch {
        try { localStorage.removeItem(key); } catch {}
        return null;
    }
}

export function writeProfileListCache(key, data) {
    try { setCache(key, data, CACHE.TTL.LIST_DATA); } catch {}
}
