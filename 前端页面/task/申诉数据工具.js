import { API, UI } from "../core/全局配置.js";

export function disputeImageURL(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    const input = value.trim();
    if (/^uploads\/[a-zA-Z0-9_./-]+$/.test(input) && !input.split('/').includes('..')) {
        return `${API.BASE_URL}${API.IMAGE_PROXY_PATH}?path=${encodeURIComponent(input)}`;
    }
    // 只接受既有本地图片代理相对路径，不把任意同源 GET 当作图片执行。
    if (input.startsWith('/community_hub/image?')) return input;
    try {
        const url = new URL(input);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
        return url.href;
    } catch (_) { return ""; }
}

export function normalizeDispute(value, expectedId) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== expectedId
        || !["pending", "responded", "resolved"].includes(value.status)
        || !["publisher", "assignee"].includes(value.initiator_role)
        || !["publisher", "assignee", "initiator"].every(key => typeof value[key] === "string" && value[key].trim())
        || value.initiator !== value[value.initiator_role]) return null;
    const result = { ...value };
    for (const key of ["task_id", "task_title", "publisher_name", "assignee_name", "reason", "response", "resolution_note"]) {
        result[key] = typeof value[key] === "string" ? value[key] : "";
    }
    for (const key of ["evidence", "response_evidence"]) {
        result[key] = Array.isArray(value[key])
            ? value[key].map(disputeImageURL).filter(Boolean).slice(0, UI.MAX_DISPUTE_EVIDENCE) : [];
    }
    for (const key of ["publisher_avatar", "assignee_avatar"]) result[key] = disputeImageURL(value[key]);
    for (const key of ["created_at", "responded_at", "resolved_at"]) {
        result[key] = typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 ? value[key] : null;
    }
    result.resolution_ratio = typeof value.resolution_ratio === "number" && Number.isFinite(value.resolution_ratio)
        && value.resolution_ratio >= 0 && value.resolution_ratio <= 100 ? value.resolution_ratio : null;
    return result;
}
