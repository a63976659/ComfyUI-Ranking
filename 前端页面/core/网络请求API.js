// 前端页面/core/网络请求API.js

const BASE_URL = "https://zhiwei666-comfyui-ranking-api.hf.space"; 

async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = { ...options.headers };

    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const token = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const fetchOptions = {
        method: options.method || "GET",
        headers,
        ...options
    };

    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
        fetchOptions.body = JSON.stringify(options.body);
    } else if (options.body instanceof FormData) {
        fetchOptions.body = options.body;
    }

    try {
        const response = await fetch(url, fetchOptions);
        const responseData = await response.json().catch(() => ({}));

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
    async sendVerifyCode(contact, contactType, actionType, account = null) { 
        return request("/api/users/send-code", { 
            method: "POST", 
            body: { contact, contact_type: contactType, action_type: actionType, account: account } 
        }); 
    },

    async uploadFile(file, fileType) {
        const formData = new FormData(); 
        formData.append("file", file); 
        formData.append("file_type", fileType); 
        return request("/api/upload", { method: "POST", body: formData });
    },
    async publishItem(itemData) { 
        return request("/api/items", { method: "POST", body: itemData }); 
    },
    async updateItem(itemId, authorAccount, updateData) { 
        return request(`/api/items/${itemId}?author=${authorAccount}`, { method: "PUT", body: updateData }); 
    },
    async deleteItem(itemId, authorAccount) { 
        return request(`/api/items/${itemId}?author=${authorAccount}`, { method: "DELETE" }); 
    },
    async incrementItemUse(itemId) { 
        return request(`/api/items/${itemId}/use`, { method: "POST" }); 
    },
    async register(userData) { 
        return request("/api/users/register", { method: "POST", body: userData }); 
    },
    async login(account, password) { 
        return request("/api/users/login", { method: "POST", body: { account, password } }); 
    },
    async getUserProfile(account) { 
        return request(`/api/users/${account}`); 
    },
    async resetPassword(account, oldPassword, newPassword, verifyContact, verifyType, code) { 
        return request(`/api/users/${account}/reset-password`, { 
            method: "POST", 
            body: { 
                old_password: oldPassword || "", // 允许原密码为空（找回密码时）
                new_password: newPassword,
                verify_contact: verifyContact,
                verify_type: verifyType,
                code: code // 【核心修复】：带上验证码传给云端
            } 
        }); 
    },
    async updateUserProfile(account, profileData) { 
        return request(`/api/users/${account}`, { method: "PUT", body: profileData }); 
    },
    async updatePrivacy(username, privacySettings) { 
        return request(`/api/users/${username}/privacy`, { method: "PUT", body: privacySettings }); 
    },
    async getItems(type = "tool", sort = "time", limit = 20) { 
        return request(`/api/items?type=${type}&sort=${sort}&limit=${limit}`); 
    },
    async getCreators(sort = "downloads", limit = 20) { 
        return request(`/api/creators?sort=${sort}&limit=${limit}`); 
    },
    async followUser(userId, targetAccount, isActive) { 
        return request("/api/users/follow", { method: "POST", body: { user_id: userId, target_account: targetAccount, is_active: isActive } }); 
    },
    async toggleInteraction(itemId, userId, actionType, isActive) { 
        return request("/api/interactions/toggle", { method: "POST", body: { item_id: itemId, user_id: userId, action_type: actionType, is_active: isActive } }); 
    },
    async postComment(itemId, author, content, replyToUser = null, parentId = null) { 
        return request("/api/comments", { method: "POST", body: { item_id: itemId, author, content, reply_to_user: replyToUser, parent_id: parentId } }); 
    },
    async deleteComment(itemId, commentId, authorAccount) { 
        return request(`/api/comments/${itemId}/${commentId}?author=${authorAccount}`, { method: "DELETE" }); 
    },
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