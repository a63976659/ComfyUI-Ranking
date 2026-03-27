// 前端页面/core/网络请求API.js

const BASE_URL = "https://zhiwei666-comfyui-ranking-api.hf.space"; 

// 🟢 入口清洗：接收云端数据时，转换为本地代理，并带【自愈机制】清理被污染的历史数据
function proxyImages(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map(proxyImages);
    if (typeof obj === 'object') {
        for (let key in obj) {
            if ((key === 'coverUrl' || key === 'avatar' || key === 'avatarDataUrl' || key === 'from_avatar') 
                && typeof obj[key] === 'string') {
                
                let originalUrl = obj[key];
                // 自动修复：一层一层剥开已经被污染的多重代理前缀
                while (originalUrl.startsWith('/community_hub/image?url=')) {
                    try { originalUrl = decodeURIComponent(originalUrl.replace('/community_hub/image?url=', '')); }
                    catch(e) { break; }
                }

                // 只有最终剥离出来的确实是外部网络链接，才挂上代理
                if (originalUrl.startsWith('http')) {
                    obj[key] = `/community_hub/image?url=${encodeURIComponent(originalUrl)}`;
                } else {
                    obj[key] = originalUrl;
                }
            } else {
                obj[key] = proxyImages(obj[key]);
            }
        }
    }
    return obj;
}

// 🟢 出口剥离：提交给云端前，强制扒掉本地代理外衣，还原为真实云端直链，彻底杜绝数据污染！
function unproxyImages(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
        let str = obj;
        while (str.startsWith('/community_hub/image?url=')) {
            try { str = decodeURIComponent(str.replace('/community_hub/image?url=', '')); }
            catch(e) { break; }
        }
        return str;
    }
    if (Array.isArray(obj)) return obj.map(unproxyImages);
    if (typeof obj === 'object') {
        const newObj = {};
        for (let key in obj) {
            newObj[key] = unproxyImages(obj[key]);
        }
        return newObj;
    }
    return obj;
}

async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) { headers["Content-Type"] = "application/json"; }
    const token = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const fetchOptions = { method: options.method || "GET", headers, ...options };
    
    // 🚀 核心修改：在将 body 转为 JSON 字符串发送前，执行无情剥离！
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
        fetchOptions.body = JSON.stringify(unproxyImages(options.body));
    } else if (options.body instanceof FormData) {
        fetchOptions.body = options.body;
    }

    try {
        const response = await fetch(url, fetchOptions);
        let responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
            let errorMsg = `请求失败 (${response.status})`;
            if (typeof responseData.detail === "string") errorMsg = responseData.detail;
            else if (responseData.message) errorMsg = responseData.message;
            else if (responseData.error) errorMsg = responseData.error;
            throw new Error(errorMsg);
        }

        // 入口数据挂载代理
        responseData = proxyImages(responseData);
        return responseData;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

// ============== 业务 API 导出 (保持原样) ==============
export const api = {
    async sendVerifyCode(contact, type, actionType, account = null) { return request("/api/users/send_code", { method: "POST", body: { contact, contact_type: type, action_type: actionType, account } }); },
    async register(data) { return request("/api/users/register", { method: "POST", body: data }); },
    async login(account, password) { return request("/api/users/login", { method: "POST", body: { account, password } }); },
    async resetPassword(data) { return request("/api/users/reset_password", { method: "POST", body: data }); },
    async getUserProfile(account) { return request(`/api/users/${account}`); },
    async updateUserProfile(account, data) { return request(`/api/users/${account}`, { method: "PUT", body: data }); },
    async updatePrivacy(account, privacy) { return request(`/api/users/${account}/privacy`, { method: "PUT", body: privacy }); },
    async toggleFollow(userId, targetAccount, isActive) { return request("/api/users/follow", { method: "POST", body: { user_id: userId, target_account: targetAccount, is_active: isActive } }); },
    async getCreators(sort, limit) { return request(`/api/creators?sort=${sort}&limit=${limit}`); },
    async uploadFile(file, fileType) {
        const formData = new FormData();
        formData.append("file", file); formData.append("file_type", fileType);
        return request("/api/upload", { method: "POST", body: formData });
    },
    async publishItem(data) { return request("/api/items", { method: "POST", body: data }); },
    async updateItem(itemId, author, data) { return request(`/api/items/${itemId}?author=${author}`, { method: "PUT", body: data }); },
    async getItems(type, sort, limit) { return request(`/api/items?type=${type}&sort=${sort}&limit=${limit}`); },
    async deleteItem(itemId, author) { return request(`/api/items/${itemId}?author=${author}`, { method: "DELETE" }); },
    async recordItemUse(itemId) { return request(`/api/items/${itemId}/use`, { method: "POST" }); },
    async toggleInteraction(itemId, userId, actionType, isActive) { return request("/api/interactions/toggle", { method: "POST", body: { item_id: itemId, user_id: userId, action_type: actionType, is_active: isActive } }); },
    async postComment(itemId, author, content, replyTo = null, parentId = null) { return request("/api/comments", { method: "POST", body: { item_id: itemId, author, content, reply_to_user: replyTo, parent_id: parentId } }); },
    async deleteComment(itemId, commentId, author) { return request(`/api/comments/${itemId}/${commentId}?author=${author}`, { method: "DELETE" }); },
    async getMessages(account) { return request(`/api/messages/${account}`); },
    async markMessagesRead(account) { return request(`/api/messages/${account}/read`, { method: "POST" }); },
    async sendPrivateMessage(sender, receiver, content) { return request("/api/messages/private", { method: "POST", body: { sender, receiver, content } }); },
    async getChatList(account) { return request(`/api/chats/${account}`); },
    async getChatHistory(account, targetAccount) { return request(`/api/chats/${account}/${targetAccount}`); },
    async getWallet(account) { return request(`/api/wallet/${account}`); },
    async tipUser(senderAccount, targetAccount, amount, isAnonymous) { return request("/api/wallet/tip", { method: "POST", body: { sender_account: senderAccount, target_account: targetAccount, amount: amount, is_anonymous: isAnonymous } }); }, 
    async purchaseItem(account, itemId) { return request("/api/wallet/purchase", { method: "POST", body: { account: account, item_id: itemId } }); },
    async submitWithdraw(data) { return request("/api/wallet/withdraw", { method: "POST", body: data }); },
    async postSystemAnnouncement(adminAccount, contentText) {
        if (!contentText || !contentText.trim()) throw new Error("公告内容不能为空！");
        return request("/api/system/announcement", { method: "POST", body: { admin_account: adminAccount, content: contentText } });
    }
};