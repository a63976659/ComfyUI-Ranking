import { LOCAL_PERFORMANCE, getSettings } from './全局配置.js';

let enabled = false;
let generation = 0;
const totals = new Map();

function syncPreference() {
    let next = false;
    try { next = getSettings({ strict: true }).enableLocalPerformanceStats === true; } catch {}
    if (next !== enabled) {
        enabled = next;
        generation++;
        totals.clear();
    }
}

function now() {
    try {
        const value = performance.now();
        return Number.isFinite(value) && value >= 0 ? value : null;
    } catch { return null; }
}

function createSample(category) {
    const started = now();
    if (started === null) return null;
    const ownGeneration = generation;
    let finished = false;
    let cached = false;
    return Object.freeze({
        cacheHit() { cached = true; },
        discard() { finished = true; },
        finish() {
            if (finished) return;
            finished = true;
            syncPreference();
            if (!enabled || ownGeneration !== generation) return;
            const ended = now();
            if (ended === null || ended < started) return;
            const previous = totals.get(category) || { count: 0, cacheHits: 0, totalMs: 0 };
            if (previous.count >= LOCAL_PERFORMANCE.MAX_COUNT) return;
            totals.set(category, {
                count: previous.count + 1,
                cacheHits: previous.cacheHits + (cached ? 1 : 0),
                totalMs: previous.totalMs + Math.min(ended - started, LOCAL_PERFORMANCE.MAX_DURATION_MS)
            });
        }
    });
}

export function beginLocalPerformanceSample(endpoint, method = 'GET') {
    syncPreference();
    if (!enabled || typeof method !== 'string' || method.toUpperCase() !== 'GET'
        || typeof endpoint !== 'string' || endpoint.length > LOCAL_PERFORMANCE.MAX_ENDPOINT_CHARS || endpoint.includes('#')) return null;
    const separator = endpoint.indexOf('?');
    const path = separator < 0 ? endpoint : endpoint.slice(0, separator);
    let category;
    if (path === '/api/items') {
        const types = new URLSearchParams(separator < 0 ? '' : endpoint.slice(separator + 1)).getAll('type');
        if (types.length === 1 && Object.hasOwn(LOCAL_PERFORMANCE.ITEM_CATEGORIES, types[0])) category = LOCAL_PERFORMANCE.ITEM_CATEGORIES[types[0]];
    } else if (Object.hasOwn(LOCAL_PERFORMANCE.LIST_CATEGORIES, path)) category = LOCAL_PERFORMANCE.LIST_CATEGORIES[path];
    return category ? createSample(category) : null;
}

export function getLocalPerformanceStats() {
    syncPreference();
    return {
        enabled,
        rows: Object.keys(LOCAL_PERFORMANCE.LABELS).filter(category => totals.has(category))
            .map(category => ({ category, ...totals.get(category) }))
    };
}

export function clearLocalPerformanceStats() {
    generation++;
    totals.clear();
}

syncPreference();
window.addEventListener('comfy-settings-changed', syncPreference);
window.addEventListener('storage', syncPreference);
