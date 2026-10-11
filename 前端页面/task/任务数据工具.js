export function getTaskApplicantCount(task) {
    const count = task?.applicant_count;
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) return count;
    return Array.isArray(task?.applicants) ? task.applicants.length : 0;
}

export function hasAppliedToTask(task, account) {
    if (!account) return false;
    if (typeof task?.has_applied === "boolean") return task.has_applied;
    return Array.isArray(task?.applicants) && task.applicants.some(entry => entry?.account === account);
}

/** 离线回退只允许公开字段，不把历史列表中的申请资料作为身份凭据。 */
export function publicTaskSnapshot(task) {
    return { ...task, applicant_count: getTaskApplicantCount(task), applicants: [], has_applied: false };
}
