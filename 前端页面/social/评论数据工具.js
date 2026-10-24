// 通用评论接口的确认边界；不依赖宿主、存储或网络。
export function isConfirmedCommentResponse(response, account, replyTo = null) {
    const data = response?.data;
    return typeof account === 'string' && account.trim().length > 0
        && response?.status === 'success' && !!data && typeof data === 'object' && !Array.isArray(data)
        && typeof data.id === 'string' && data.id.trim().length > 0
        && data.author === account && typeof data.content === 'string' && data.content.trim().length > 0
        && data.isDeleted === false && Array.isArray(data.replies) && data.replies.length === 0
        && data.replyToUser === replyTo
        && ['authorName', 'avatar'].every(key => data[key] === undefined || typeof data[key] === 'string')
        && (data.replyToUserName == null || typeof data.replyToUserName === 'string');
}

export function isConfirmedCommentDeletion(response) {
    return response?.status === 'success';
}

export function isDefiniteCommentRejection(error) {
    return error?.requestBodyRejected === true || (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.status !== 408);
}

export function isConfirmedDedicatedCommentResponse(response, account, content) {
    const data = response?.data;
    return typeof account === 'string' && !!account.trim()
        && typeof content === 'string' && !!content.trim()
        && response?.status === 'success' && !!data && typeof data === 'object' && !Array.isArray(data)
        && typeof data.id === 'string' && !!data.id.trim()
        && data.author === account && data.content === content;
}
