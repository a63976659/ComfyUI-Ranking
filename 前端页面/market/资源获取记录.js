// 本地交付记录仅用于离线展示，不作为购买权限或安装结果的依据。
import { CACHE } from "../core/全局配置.js";

function validId(id) {
    return (typeof id === "string" && id.trim().length > 0) ||
        (typeof id === "number" && Number.isFinite(id));
}

function readRecords() {
    let raw;
    try { raw = localStorage.getItem(CACHE.LOCAL_KEYS.ACQUIRED_ITEMS); }
    catch { return { available: false, records: [] }; }
    let entries;
    try { entries = JSON.parse(raw || "[]"); }
    catch { entries = []; }
    if (!Array.isArray(entries)) entries = [];
    return { available: true, records: entries.filter(entry =>
        entry && typeof entry === "object" && !Array.isArray(entry) && validId(entry.id)) };
}

function writeRecords(records) {
    try {
        localStorage.setItem(CACHE.LOCAL_KEYS.ACQUIRED_ITEMS, JSON.stringify(records));
        return true;
    } catch {
        console.warn("本地资源记录无法持久化");
        return false;
    }
}

export function getAcquiredItems() {
    return readRecords().records;
}

export function saveAcquiredItem(itemData) {
    if (!itemData || typeof itemData !== "object" || Array.isArray(itemData) || !validId(itemData.id)) return false;
    const snapshot = readRecords();
    // 无法读取时不能用空数组覆盖可能仍存在的历史记录。
    if (!snapshot.available) return false;
    const record = {
        id: itemData.id,
        title: itemData.title,
        type: itemData.type,
        author: itemData.author,
        shortDesc: itemData.shortDesc || itemData.short_desc || '',
        coverUrl: itemData.coverUrl || itemData.cover_url || '',
        coverBase64: itemData.coverBase64,
        imageUrls: itemData.imageUrls || itemData.image_urls || [],
        link: itemData.link || itemData.github_url || '',
        price: itemData.price || 0,
        likes: itemData.likes || 0,
        uses: itemData.uses || 0,
        local_version: itemData.latest_version || itemData.local_version || itemData.version || '',
        acquired_at: Date.now()
    };
    const index = snapshot.records.findIndex(entry => String(entry.id) === String(itemData.id));
    if (index >= 0) snapshot.records[index] = record;
    else snapshot.records.unshift(record);
    return writeRecords(snapshot.records);
}

export function removeAcquiredItem(itemId) {
    if (!validId(itemId)) return false;
    const snapshot = readRecords();
    if (!snapshot.available) return false;
    return writeRecords(snapshot.records.filter(entry => String(entry.id) !== String(itemId)));
}
