// 前端页面/core/网络请求_业务API.js
// ==========================================
// 🌐 网络请求业务 API 模块
// ==========================================
// 作用：封装所有业务相关的 API 调用方法
// 关联文件：
//   - 网络请求_基础设施.js (底层请求能力)
// ==========================================

import { request } from "./网络请求_基础设施.js";
import { API, CACHE, invalidateCachedProfiles } from "./全局配置.js";
import { t } from "../components/用户体验_国际化.js";
import { removeCache, invalidateFollowCaches, captureCacheWrite } from "./网络请求_缓存管理.js";
import { requireListResponseData } from "../components/性能优化工具.js";

function requestPublicList(endpoint, options = {}) {
    return request(endpoint, { ...options, validateResponse: requireListResponseData });
}

function publicationHeaders(options) {
    if (options?.publicationId === undefined) return undefined;
    if (typeof options.publicationId !== 'string' || !/^[0-9a-f]{32}$/.test(options.publicationId)) throw new Error('Invalid publication identity');
    return { 'Idempotency-Key': options.publicationId };
}

// ============== 业务 API 导出 ==============
const api = {
    async sendVerifyCode(contact, type, actionType, account = null) { return request("/api/users/send_code", { method: "POST", body: { contact, contact_type: type, action_type: actionType, account } }); },
    async register(data) { return request("/api/users/register", { method: "POST", body: data }); },
    async login(account, password, remember = true) { return request("/api/users/login", { method: "POST", body: { account, password, remember } }); },
    async recoverAccount(email, code) { return request("/api/users/recover_account", { method: "POST", body: { email, code } }); },
    
    // 🚀 核心修复：究极数据打捞装甲与弹窗报警
    async resetPassword(...args) { 
        let payload = { verifyType: "email" };

        // 1. 深度搜刮：提取传入的对象数据
        args.forEach(arg => {
            if (typeof arg === 'object' && arg !== null) Object.assign(payload, arg);
        });

        // 2. 智能探测：从散装字符串中强行识别关键数据
        let strings = args.filter(a => typeof a === 'string' || typeof a === 'number').map(String);
        strings.forEach(str => {
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) payload.email = str; // 抓取邮箱
            else if (/^\d{6}$/.test(str)) payload.code = str; // 抓取6位验证码
            else if (str.length >= 6 && !payload.new_password && !/^\d+$/.test(str)) payload.new_password = str; // 抓取密码
            else if (!payload.account) payload.account = str; // 剩下的当账号
        });

        // 3. 字段合并与对齐
        payload.account = payload.account || payload.username;
        payload.new_password = payload.new_password || payload.password || payload.newPassword;
        payload.verifyContact = payload.verifyContact || payload.email || payload.phone || payload.verify_contact;

        // 4. 🚨 终极拦截门：如果到了这一步数据还是没找齐，直接弹窗指认"内鬼"！
        if (!payload.account || !payload.new_password || !payload.verifyContact || !payload.code) {
            console.warn("密码重置请求缺少必要字段");
            throw new Error(t('auth.form_data_incomplete'));
        }

        return request("/api/users/reset_password", { method: "POST", body: payload }); 
    },

    async getUserProfile(account, options = {}) { return request(`/api/users/${account}`, options); },
    async updateUserProfile(account, data) {
        const response = await request(`/api/users/${account}`, { method: "PUT", body: data });
        if (response?.status === 'success') invalidateCachedProfiles([account]);
        return response;
    },
    async updateUserSettings(account, data) {
        const response = await request(`/api/users/${account}/settings`, { method: "PUT", body: data });
        if (response?.status === 'success') invalidateCachedProfiles([account]);
        return response;
    },
    async updatePrivacy(account, privacy) {
        const response = await request(`/api/users/${account}/privacy`, { method: "PUT", body: privacy });
        if (response?.status === 'success') invalidateCachedProfiles([account]);
        return response;
    },
    async toggleFollow(userId, targetAccount, isActive) {
        const response = await request("/api/users/follow", { method: "POST", body: { user_id: userId, target_account: targetAccount, is_active: isActive } });
        if (response?.status === 'success') invalidateFollowCaches(userId, targetAccount);
        return response;
    },
    async getCreators(sort, limit, options = {}) { return requestPublicList(`/api/creators?sort=${sort}&limit=${limit}`, options); },
    // 🔍 带上取消分组 ID：用户继续输入时，上一次仍在途的搜索请求可被 requestCancelManager 撤销，
    // 不再占用并发额度与超时预算（调用时机见 侧边栏数据引擎.js 的创作者搜索分支）
    async searchCreators(keyword, sort, limit = 50, options = {}) { return requestPublicList(`/api/creators/search?keyword=${encodeURIComponent(keyword)}&sort=${sort}&limit=${limit}`, { componentId: API.SEARCH_COMPONENT_ID, ...options }); },
    async getCreatorDetails(account, options = {}) {
        const current = captureCacheWrite(`${CACHE.CREATOR_DETAILS_CACHE_PREFIX}${account}/details`);
        const response = await request(`/api/creators/${account}/details`, options);
        if (!current()) throw new Error(t('feedback.list_changed_retry'));
        return response;
    },
    async uploadFile(file, fileType, timeout = 120000) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("file_type", fileType);
        return request("/api/upload", { method: "POST", body: formData, timeout, retries: 0 });
    },
    async publishItem(data) { return request("/api/items", { method: "POST", body: data }); },
    // NOTE: author 未 encodeURIComponent，与 assignee/account 等编码不一致；
    // 但 account 通常为纯字母数字，不影响功能，暂不改动以避免破坏线上缓存匹配
    async updateItem(itemId, author, data) { return request(`/api/items/${itemId}?author=${author}`, { method: "PUT", body: data }); },
    async getItems(type, sort, limit, options = {}) { return requestPublicList(`/api/items?type=${type}&sort=${sort}&limit=${limit}`, options); },
    async getItemById(itemId, options = {}) { return request(`/api/items/${itemId}`, options); },
    async deleteItem(itemId) { return request(`/api/items/${itemId}`, { method: "DELETE" }); },
    async recordItemUse(itemId) { return request(`/api/items/${itemId}/use`, { method: "POST" }); },
    async recordItemView(itemId) { return request(`/api/items/${itemId}/view`, { method: "POST" }); },
    async toggleItemLike(itemId) { return request(`/api/items/${itemId}/like`, { method: "POST" }); },
    async toggleItemFavorite(itemId) { return request(`/api/items/${itemId}/favorite`, { method: "POST" }); },
    async rateItem(itemId, score) {
        return request(`/api/items/${itemId}/rating`, {
            method: "POST",
            body: { score }
        });
    },
    async ratePost(postId, score) {
        return request(`/api/posts/${postId}/rating`, {
            method: "POST",
            body: { score }
        });
    },
    async recordTaskView(taskId) { return request(`/api/tasks/${taskId}/view`, { method: "POST" }); },
    async recordPostView(postId) { return request(`/api/posts/${postId}/view`, { method: "POST" }); },
    async toggleInteraction(itemId, userId, actionType, isActive) { return request("/api/interactions/toggle", { method: "POST", body: { item_id: itemId, user_id: userId, action_type: actionType, is_active: isActive } }); },
    async postComment(itemId, author, content, replyTo = null, parentId = null) { return request("/api/comments", { method: "POST", body: { item_id: itemId, author, content, reply_to_user: replyTo, parent_id: parentId } }); },
    async deleteComment(itemId, commentId) { return request(`/api/comments/${itemId}/${commentId}`, { method: "DELETE" }); },
    async getMessages(account, options = {}) { return request(`/api/messages/${account}`, options); },
    // 🔥 新增：轻量级获取未读消息数量（不标记已读，用于轮询红点）
    async getUnreadCount(account) { return request(`/api/messages/${account}?count_only=true`); },
    async markMessagesRead(account) { return request(`/api/messages/${account}/read`, { method: "POST" }); },
    async sendPrivateMessage(sender, receiver, content, clientRequestId) {
        const path = clientRequestId === undefined ? "/api/messages/private" : "/api/messages/private/idempotent";
        const body = { sender, receiver, content };
        if (clientRequestId !== undefined) body.client_request_id = clientRequestId;
        return request(path, { method: "POST", body, retries: 0 });
    },
    async getChatList(account, options = {}) { return request(`/api/chats/${account}`, options); },
    async getChatHistory(account, targetAccount, options = {}) { return request(`/api/chats/${account}/${targetAccount}`, options); },
    async getWallet(account, options = {}) { return request(`/api/wallet/${account}`, options); },

    // 🛒 获取用户购买记录（从云端 ownerships 表）
    async getUserPurchases(account) {
        return request(`/api/wallet/${account}/purchases`);
    },

    // 💳 P6支付增强：交易明细查询
    async getTransactions(account, page = 1, limit = 20, txType = null) {
        let url = `/api/wallet/${account}/transactions?page=${page}&limit=${limit}`;
        if (txType) url += `&tx_type=${txType}`;
        return request(url);
    },
    
    // 💳 P6支付增强：任务收益统计
    async getTaskStats(account) {
        return request(`/api/wallet/${account}/task-stats`);
    },
    
    // 💳 P6支付增强：打赏统计
    async getTipStats(account) {
        return request(`/api/wallet/${account}/tip-stats`);
    },
    
    // 💳 P6支付增强：销售统计
    async getSalesStats(account) {
        return request(`/api/wallet/${account}/sales-stats`);
    },
    
    async tipUser(senderAccount, targetAccount, amount, isAnonymous, itemId = null) {
        // 🐛 Bug修复：itemId 可选，但记录日志便于排查
        if (itemId === undefined) {
            console.warn('⚠️ tipUser: itemId 为 undefined，将按无关联项目处理');
        }
        return request("/api/wallet/tip", { 
            method: "POST", 
            body: { sender_account: senderAccount, target_account: targetAccount, amount: amount, is_anonymous: isAnonymous, item_id: itemId } 
        }); 
    }, 
    async purchaseItem(account, itemId, expectedPrice) {
        // 🐛 Bug修复：防御性校验，防止 itemId 为空导致请求 /purchase/undefined
        if (!itemId) {
            console.warn('⚠️ purchaseItem: itemId 为空，已拦截无效请求');
            return { success: false, error: 'itemId 不能为空' };
        }
        const body = { account, item_id: itemId };
        if (expectedPrice !== undefined) body.expected_price = expectedPrice;
        return request("/api/wallet/purchase", { method: "POST", body });
    },
    async submitWithdraw(data) { return request("/api/wallet/withdraw", { method: "POST", body: data }); },

    // ==========================================
    // 💬 讨论区 API
    // ==========================================
    async getPosts(page = 1, limit = 20, sort = "latest", options = {}) {
        return requestPublicList(`/api/posts?page=${page}&limit=${limit}&sort=${sort}`, options);
    },
    async getPostDetail(postId, options = {}) {
        return request(`/api/posts/${postId}`, options);
    },
    async createPost(data, options = {}) {
        return request("/api/posts", { method: "POST", body: data, headers: publicationHeaders(options) });
    },
    async updatePost(postId, data) { 
        return request(`/api/posts/${postId}`, { method: "PUT", body: data });
    },
    async deletePost(postId) { 
        return request(`/api/posts/${postId}`, { method: "DELETE" });
    },
    async togglePostLike(postId) { 
        return request(`/api/posts/${postId}/like`, { method: "POST" }); 
    },
    async togglePostFavorite(postId) { 
        return request(`/api/posts/${postId}/favorite`, { method: "POST" }); 
    },
    async tipPost(postId, amount, isAnon = false) { 
        return request(`/api/posts/${postId}/tip?amount=${amount}&is_anon=${isAnon}`, { method: "POST" }); 
    },
    async getPostComments(postId, options = {}) {
        return request(`/api/posts/${postId}/comments`, options);
    },
    async addPostComment(postId, content, parentId = null, replyToUser = null) { 
        let url = `/api/posts/${postId}/comments?content=${encodeURIComponent(content)}`;
        if (parentId) url += `&parent_id=${encodeURIComponent(parentId)}`;
        if (replyToUser) url += `&reply_to_user=${encodeURIComponent(replyToUser)}`;
        return request(url, { method: "POST" }); 
    },
    async getMyPosts() {
        return request("/api/my-posts");
    },

    // ==========================================
    // ✨ 提示词市场 API
    // ==========================================
    async getPrompts(promptType = null, category = null, page = 1, limit = 20, sort = "latest", options = {}) {
        let url = `/api/prompts?page=${page}&limit=${limit}&sort=${sort}`;
        if (promptType) url += `&prompt_type=${promptType}`;
        if (category) url += `&category=${encodeURIComponent(category)}`;
        return requestPublicList(url, options);
    },
    async getPromptDetail(promptId, options = {}) {
        return request(`/api/prompts/${promptId}`, options);
    },
    async createPrompt(data, options = {}) {
        return request("/api/prompts", { method: "POST", body: data, headers: publicationHeaders(options) });
    },
    async updatePrompt(promptId, data) {
        return request(`/api/prompts/${promptId}`, { method: "PUT", body: data });
    },
    async deletePrompt(promptId) {
        return request(`/api/prompts/${promptId}`, { method: "DELETE" });
    },
    async togglePromptLike(promptId) {
        return request(`/api/prompts/${promptId}/like`, { method: "POST" });
    },
    async togglePromptFavorite(promptId) {
        return request(`/api/prompts/${promptId}/favorite`, { method: "POST" });
    },
    async tipPrompt(promptId, amount, isAnon = false) {
        return request(`/api/prompts/${promptId}/tip?amount=${amount}&is_anon=${isAnon}`, { method: "POST" });
    },
    async getPromptComments(promptId, options = {}) {
        return request(`/api/prompts/${promptId}/comments`, options);
    },
    async addPromptComment(promptId, content) {
        return request(`/api/prompts/${promptId}/comments?content=${encodeURIComponent(content)}`, { method: "POST" });
    },
    async recordPromptView(promptId) {
        return request(`/api/prompts/${promptId}/view`, { method: "POST" });
    },
    async purchasePrompt(promptId, expectedPrice) {
        // 🐛 防御性校验，防止 promptId 为空导致请求 /purchase/undefined
        if (!promptId) {
            console.warn('⚠️ purchasePrompt: promptId 为空，已拦截无效请求');
            return { success: false, error: 'promptId 不能为空' };
        }
        const options = { method: "POST" };
        if (expectedPrice !== undefined) options.body = { expected_price: expectedPrice };
        return request(`/api/prompts/${promptId}/purchase`, options);
    },
    async getMyPrompts() {
        return request("/api/my-prompts");
    },
    async getPromptCategories(promptType = null) {
        let url = "/api/prompt-categories";
        if (promptType) url += `?prompt_type=${promptType}`;
        return request(url);
    },
    async getPromptTags() {
        return request("/api/prompt-tags");
    },

    // ==========================================
    // 📝 任务榜 API
    // ==========================================
    async getTasks(page = 1, limit = 20, status = null, sort = "latest", options = {}) {
        let url = `/api/tasks?page=${page}&limit=${limit}&sort=${sort}`;
        if (status) url += `&status=${status}`;
        return requestPublicList(url, options);
    },
    async getTaskDetail(taskId, options = {}) {
        removeCache(`api_/api/tasks/${taskId}`);
        return request(`/api/tasks/${taskId}`, { ...options, noStore: true });
    },
    async createTask(data) {
        return request("/api/tasks", { method: "POST", body: data });
    },
    async updateTask(taskId, data) {
        return request(`/api/tasks/${taskId}`, { method: "PUT", body: data });
    },
    async cancelTask(taskId) {
        return request(`/api/tasks/${taskId}`, { method: "DELETE" });
    },
    async applyTask(taskId, message = null) {
        let url = `/api/tasks/${taskId}/apply`;
        if (message) url += `?message=${encodeURIComponent(message)}`;
        return request(url, { method: "POST" });
    },
    async cancelApplyTask(taskId) {
        return request(`/api/tasks/${taskId}/apply`, { method: "DELETE" });
    },
    async assignTask(taskId, assignee) {
        return request(`/api/tasks/${taskId}/assign?assignee=${encodeURIComponent(assignee)}`, { method: "POST" });
    },
    async submitTask(taskId, deliverables, note = null) {
        let url = `/api/tasks/${taskId}/submit`;
        return request(url, { method: "POST", body: { deliverables, note } });
    },
    async acceptTask(taskId, isAccepted, feedback = null) {
        let url = `/api/tasks/${taskId}/accept?is_accepted=${isAccepted}`;
        if (feedback) url += `&feedback=${encodeURIComponent(feedback)}`;
        return request(url, { method: "POST" });
    },
    async disputeTask(taskId, reason, evidence = null) {
        return request(`/api/tasks/${taskId}/dispute`, { 
            method: "POST", 
            body: { reason, evidence: evidence || [] } 
        });
    },
    async getMyTasks(role = "publisher") {
        return request(`/api/my-tasks?role=${role}`);
    },

    // ==========================================
    // 👍 任务互动 API（点赞/收藏/打赏/评论）
    // ==========================================
    async toggleTaskLike(taskId) {
        return request(`/api/tasks/${taskId}/like`, { method: "POST" });
    },
    async toggleTaskFavorite(taskId) {
        return request(`/api/tasks/${taskId}/favorite`, { method: "POST" });
    },
    async tipTask(taskId, amount, isAnon = false) {
        return request(`/api/tasks/${taskId}/tip?amount=${amount}&is_anon=${isAnon}`, { method: "POST" });
    },
    async getTaskComments(taskId, options = {}) {
        return request(`/api/tasks/${taskId}/comments`, options);
    },
    async addTaskComment(taskId, content) {
        return request(`/api/tasks/${taskId}/comments?content=${encodeURIComponent(content)}`, { method: "POST" });
    },

    // ==========================================
    // ⚖️ 申诉仲裁 API
    // ==========================================
    async getDisputeDetail(disputeId, options = {}) {
        return request(`/api/disputes/${disputeId}`, options);
    },
    async respondDispute(disputeId, response, evidence = null) {
        return request(`/api/disputes/${disputeId}/respond`, {
            method: "POST",
            body: { response, evidence: evidence || [] }
        });
    },

    // ==========================================
    // 🔄 P7后悔模式：退款API
    // ==========================================
    async getPurchaseStatus(account, itemId, options = {}) {
        return request(`/api/wallet/${account}/purchase/${itemId}`, options);
    },
    async requestRefund(account, itemId) {
        return request(`/api/wallet/refund?account=${encodeURIComponent(account)}&item_id=${encodeURIComponent(itemId)}`, {
            method: "POST"
        });
    },

    // ==========================================
    // 🔒 系统配置 API（图片审核开关等；版本/广告管理已迁至云端控制台）
    // ==========================================
    async getSystemConfig(configKey) {
        return request(`/api/admin/config/${configKey}`);
    },
    async setSystemConfig(configKey, value) {
        return request(`/api/admin/config/${configKey}`, {
            method: "PUT",
            body: value
        });
    },

    // ==========================================
    // 📢 广告展示 API（公开接口，供顶部广告组件读取）
    // ==========================================
    async getPublicBannerConfig(options = {}) {
        return request("/api/public/banner_config", options);
    }
};

export { api };
export default api;
