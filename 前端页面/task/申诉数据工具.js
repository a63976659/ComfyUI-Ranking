import { API, UI, normalizeProfileImageUrl } from "../core/全局配置.js";

export function disputeImageURL(value, serviceBaseUrl = API.BASE_URL) {
    if (typeof value !== "string" || !value || value.trim() !== value) return "";
    let input = value;
    if (/^uploads\/[a-zA-Z0-9_./-]+$/.test(input) && !input.split('/').includes('..')) {
        input = `${serviceBaseUrl.replace(/\/$/, "")}${API.IMAGE_PROXY_PATH}?path=${encodeURIComponent(input)}`;
    }
    if (/^(?:data:|blob:)/i.test(input)) return "";
    return normalizeProfileImageUrl(input, false, serviceBaseUrl);
}

export function normalizeDisputeEvidence(value, serviceBaseUrl = API.BASE_URL) {
    return Array.isArray(value)
        ? value.map(image => disputeImageURL(image, serviceBaseUrl)).filter(Boolean).slice(0, UI.MAX_DISPUTE_EVIDENCE) : [];
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
        result[key] = normalizeDisputeEvidence(value[key]);
    }
    for (const key of ["publisher_avatar", "assignee_avatar"]) result[key] = normalizeProfileImageUrl(value[key]);
    for (const key of ["created_at", "responded_at", "resolved_at"]) {
        result[key] = typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 ? value[key] : null;
    }
    result.resolution_ratio = typeof value.resolution_ratio === "number" && Number.isFinite(value.resolution_ratio)
        && value.resolution_ratio >= 0 && value.resolution_ratio <= 100 ? value.resolution_ratio : null;
    return result;
}
