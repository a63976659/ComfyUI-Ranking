import { publicTaskSnapshot } from "./任务数据工具.js";

/** 同步公开预览、后台私有详情；调用方负责节点与会话代次检查。 */
export async function loadTaskSnapshot({ taskId, readCached, fetchDetail, renderCached, renderFresh, onError, isCurrent }) {
    const isTask = value => Boolean(value) && typeof value === "object" && !Array.isArray(value)
        && String(value.id) === String(taskId);
    const candidate = readCached(taskId);
    const cached = isTask(candidate) ? publicTaskSnapshot(candidate) : null;
    if (cached) renderCached(cached);
    try {
        const response = await fetchDetail(Boolean(cached));
        if (!isCurrent()) return "discarded";
        if (response?.status !== "success" || !isTask(response.data)) {
            throw new Error("Invalid task detail response");
        }
        renderFresh(response.data);
        return "fresh";
    } catch (_) {
        if (!isCurrent()) return "discarded";
        onError(Boolean(cached));
        return cached ? "cached" : "failed";
    }
}
