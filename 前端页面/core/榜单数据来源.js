import { api, requestCancelManager } from './网络请求API.js';
import { API, CACHE, PAGINATION } from './全局配置.js';
import { requireListResponseData, getCacheWithMeta, removeCache } from '../components/性能优化工具.js';

const itemTypes = Object.freeze({ tools: 'tool', skills: 'skill', apps: 'app', recommends: 'recommend' });

// 只读取与校验，不提交视图状态或缓存；提交时由调用方核查界面代次。
export async function fetchSidebarList({ tab, sort, keyword = '', force = false, background = false }) {
    const options = background
        ? { noCache: true, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES }
        : (force ? { noCache: true } : {});
    let response;
    if (Object.hasOwn(itemTypes, tab)) {
        response = await api.getItems(itemTypes[tab], sort, PAGINATION.SIDEBAR_ITEM_FETCH_LIMIT, options);
    } else if (tab === 'creators') {
        if (keyword) {
            requestCancelManager.cancelAll(API.SEARCH_COMPONENT_ID);
            response = await api.searchCreators(keyword, sort, PAGINATION.SIDEBAR_CREATOR_SEARCH_LIMIT, options);
        } else {
            response = await api.getCreators(sort, PAGINATION.SIDEBAR_CREATOR_FETCH_LIMIT, options);
        }
    } else {
        throw new TypeError('Unsupported sidebar list');
    }
    return requireListResponseData(response);
}

function validCreatorList(data) {
    try { requireListResponseData({ status: 'success', data }); }
    catch { return false; }
    return data.every(item => ['name', 'account', 'shortDesc'].every(key =>
        item[key] == null || typeof item[key] === 'string'));
}

export function readSidebarListCache(key, { creators = false } = {}) {
    const miss = { found: false, expired: true, value: null };
    let metadata;
    try {
        metadata = getCacheWithMeta(key, true); // 过期副本仍可显示。
        if (!metadata.found) return metadata;
    } catch { return miss; } // 读取失败不代表数据损坏，不删除未知副本。
    try {
        requireListResponseData({ status: 'success', data: metadata.value });
        if (!creators || validCreatorList(metadata.value)) return metadata;
    } catch { /* 确定无效的列表不进入代理、排序或视图状态。 */ }
    try { removeCache(key); }
    catch { /* 删除失败仍按未命中处理，避免损坏内容阻断界面。 */ }
    return miss;
}

export function readCreatorsSessionCache() {
    let raw;
    try { raw = sessionStorage.getItem(CACHE.LOCAL_KEYS.CREATORS_SESSION); }
    catch { return null; } // 无法读取不等于损坏，保留未知内容。
    if (raw === null) return null;
    try {
        const data = JSON.parse(raw);
        if (validCreatorList(data)) return data;
    } catch { /* 仅已读到的损坏记录可尝试删除。 */ }
    try { sessionStorage.removeItem(CACHE.LOCAL_KEYS.CREATORS_SESSION); }
    catch { /* 无法删除不阻断界面。 */ }
    return null;
}

export function writeCreatorsSessionCache(data) {
    if (!validCreatorList(data)) return false;
    try {
        sessionStorage.setItem(CACHE.LOCAL_KEYS.CREATORS_SESSION, JSON.stringify(data));
        return true;
    } catch { return false; }
}
