// 前端页面/网络请求API.js

const BASE_URL = "https://zhiwei666-comfyui-ranking-api.hf.space"; 

async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = { ...options.headers };

    // 默认情况除了 FormData 外，都使用 JSON 传参
    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    // 自动从本地缓存获取 Token 并在 Header 中注入鉴权
    const token = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const fetchOptions = {
        method: options.method || "GET",
        headers,
        ...options
    };

    // 参数序列化处理
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
        fetchOptions.body = JSON.stringify(options.body);
    } else if (options.body instanceof FormData) {
        fetchOptions.body = options.body;
    }

    try {
        const response = await fetch(url, fetchOptions);
        const responseData = await response.json().catch(() => ({}));

        // 统一拦截报错
        if (!response.ok) {
            let errorMsg = `请求失败 (${response.status})`;
            if (typeof responseData.detail === "string") errorMsg = responseData.detail;
            else if (responseData.message) errorMsg = responseData.message;
            throw new Error(errorMsg);
        }
        return responseData;

    } catch (error) {
        throw error;
    }
}

export const api = {
    // 基础文件与发布
    async uploadFile(file, fileType) {
        const formData = new FormData(); 
        formData.append("file", file); 
        formData.append("file_type", fileType); 
        return request("/api/upload", { method: "POST", body: formData });
    },
    async publishItem(itemData) { 
        return request("/api/items", { method: "POST", body: itemData }); 
    },
    
    // 账号体系
    async register(userData) { 
        return request("/api/users/register", { method: "POST", body: userData }); 
    },
    async login(account, password) { 
        return request("/api/users/login", { method: "POST", body: { account, password } }); 
    },
    async getUserProfile(account) { 
        return request(`/api/users/${account}`); 
    },
    async resetPassword(account, oldPassword, newPassword) { 
        return request(`/api/users/${account}/reset-password`, { method: "POST", body: { old_password: oldPassword, new_password: newPassword } }); 
    },
    async updateUserProfile(account, profileData) { 
        return request(`/api/users/${account}`, { method: "PUT", body: profileData }); 
    },
    async updatePrivacy(username, privacySettings) { 
        return request(`/api/users/${username}/privacy`, { method: "PUT", body: privacySettings }); 
    },
    
    // 排行榜拉取
    async getItems(type = "tool", sort = "time", limit = 20) { 
        return request(`/api/items?type=${type}&sort=${sort}&limit=${limit}`); 
    },
    async getCreators(sort = "downloads", limit = 20) { 
        return request(`/api/creators?sort=${sort}&limit=${limit}`); 
    },

    // 社交与互动 (点赞/收藏/关注)
    async followUser(userId, targetAccount, isActive) { 
        return request("/api/users/follow", { method: "POST", body: { user_id: userId, target_account: targetAccount, is_active: isActive } }); 
    },
    async toggleInteraction(itemId, userId, actionType, isActive) { 
        return request("/api/interactions/toggle", { method: "POST", body: { item_id: itemId, user_id: userId, action_type: actionType, is_active: isActive } }); 
    },
    
    // 评论留言板系统
    async postComment(itemId, author, content, replyToUser = null, parentId = null) { 
        return request("/api/comments", { method: "POST", body: { item_id: itemId, author, content, reply_to_user: replyToUser, parent_id: parentId } }); 
    },
    async deleteComment(itemId, commentId, authorAccount) { 
        return request(`/api/comments/${itemId}/${commentId}?author=${authorAccount}`, { method: "DELETE" }); 
    },
    
    // 【阶段三新增】：全局消息与独立双向私信聊天系统
    async getMessages(account) { 
        return request(`/api/messages/${account}`); 
    },
    async markMessagesRead(account) { 
        return request(`/api/messages/${account}/read`, { method: "POST" }); 
    },
    async sendPrivateMessage(sender, receiver, content) { 
        return request(`/api/messages/private`, { method: "POST", body: { sender, receiver, content } }); 
    },
    async getChatList(account) { 
        return request(`/api/chats/${account}`); 
    },
    async getChatHistory(account, targetAccount) { 
        return request(`/api/chats/${account}/${targetAccount}`); 
    }
};