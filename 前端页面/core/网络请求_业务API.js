// 前端页面/core/网络请求_业务API.js
// ==========================================
// 🌐 网络请求业务 API 模块
// ==========================================
// 作用：封装所有业务相关的 API 调用方法
// 关联文件：
//   - 网络请求_基础设施.js (底层请求能力)
// ==========================================

import { request } from "./网络请求_基础设施.js";

// ============== 业务 API 导出 ==============
const api = {
    async sendVerifyCode(contact, type, actionType, account = null) { return request("/api/users/send_code", { method: "POST", body: { contact, contact_type: type, action_type: actionType, account } }); },
    async register(data) { return request("/api/users/register", { method: "POST", body: data }); },
    async login(account, password, remember = true) { return request("/api/users/login", { method: "POST", body: { account, password, remember } }); },
    
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
            const errorStr = JSON.stringify(payload, null, 2);
            alert(`🚨 发现前端传参严重丢失！\n\n系统拼命搜刮后只拿到了这些数据:\n${errorStr}\n\n👉 请立即检查【顶部导航组件.js】的第 82 行！\n\n必须把完整的表单数据传给 API，例如: api.resetPassword({account, password, email, code})`);
            throw new Error("被前端参数拦截装甲阻断：数据不完整");
        }

        return request("/api/users/reset_password", { method: "POST", body: payload }); 
    },

    async getUserProfile(account) { return request(`/api/users/${account}`); },
    async updateUserProfile(account, data) { return request(`/api/users/${account}`, { method: "PUT", body: data }); },
    async updatePrivacy(account, privacy) { return request(`/api/users/${account}/privacy`, { method: "PUT", body: privacy }); },
    async toggleFollow(userId, targetAccount, isActive) { return request("/api/users/follow", { method: "POST", body: { user_id: userId, target_account: targetAccount, is_active: isActive } }); },
    async getCreators(sort, limit) { return request(`/api/creators?sort=${sort}&limit=${limit}`); },
    async searchCreators(keyword, sort, limit = 50) { return request(`/api/creators/search?keyword=${encodeURIComponent(keyword)}&sort=${sort}&limit=${limit}`); },
    async getCreatorDetails(account) { return request(`/api/creators/${account}/details`); },
    async uploadFile(file, fileType) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("file_type", fileType);
        return request("/api/upload", { method: "POST", body: formData, timeout: 120000, retries: 2 });
    },
    async publishItem(data) { return request("/api/items", { method: "POST", body: data }); },
    async updateItem(itemId, author, data) { return request(`/api/items/${itemId}?author=${author}`, { method: "PUT", body: data }); },
    async getItems(type, sort, limit) { return request(`/api/items?type=${type}&sort=${sort}&limit=${limit}`); },
    async getItemById(itemId) { return request(`/api/items/${itemId}`); },
    async deleteItem(itemId) { return request(`/api/items/${itemId}`, { method: "DELETE" }); },
    async recordItemUse(itemId) { return request(`/api/items/${itemId}/use`, { method: "POST" }); },
    async recordItemView(itemId) { return request(`/api/items/${itemId}/view`, { method: "POST" }); },
    async toggleItemLike(itemId) { return request(`/api/items/${itemId}/like`, { method: "POST" }); },
    async toggleItemFavorite(itemId) { return request(`/api/items/${itemId}/favorite`, { method: "POST" }); },
    async rateItem(itemId, score) {
        return request(`/api/items/${itemId}/rating`, {
            method: "POST",
            body: JSON.stringify({ score })
        });
    },
    async ratePost(postId, score) {
        return request(`/api/posts/${postId}/rating`, {
            method: "POST",
            body: JSON.stringify({ score })
        });
    },
    async recordTaskView(taskId) { return request(`/api/tasks/${taskId}/view`, { method: "POST" }); },
    async recordPostView(postId) { return request(`/api/posts/${postId}/view`, { method: "POST" }); },
    async toggleInteraction(itemId, userId, actionType, isActive) { return request("/api/interactions/toggle", { method: "POST", body: { item_id: itemId, user_id: userId, action_type: actionType, is_active: isActive } }); },
    async postComment(itemId, author, content, replyTo = null, parentId = null) { return request("/api/comments", { method: "POST", body: { item_id: itemId, author, content, reply_to_user: replyTo, parent_id: parentId } }); },
    async deleteComment(itemId, commentId) { return request(`/api/comments/${itemId}/${commentId}`, { method: "DELETE" }); },
    async getMessages(account) { return request(`/api/messages/${account}`); },
    // 🔥 新增：轻量级获取未读消息数量（不标记已读，用于轮询红点）
    async getUnreadCount(account) { return request(`/api/messages/${account}?count_only=true`); },
    async markMessagesRead(account) { return request(`/api/messages/${account}/read`, { method: "POST" }); },
    async sendPrivateMessage(sender, receiver, content) { return request("/api/messages/private", { method: "POST", body: { sender, receiver, content } }); },
    async getChatList(account) { return request(`/api/chats/${account}`); },
    async getChatHistory(account, targetAccount) { return request(`/api/chats/${account}/${targetAccount}`); },
    async getWallet(account) { return request(`/api/wallet/${account}`); },
    
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
    async purchaseItem(account, itemId) {
        // 🐛 Bug修复：防御性校验，防止 itemId 为空导致请求 /purchase/undefined
        if (!itemId) {
            console.warn('⚠️ purchaseItem: itemId 为空，已拦截无效请求');
            return { success: false, error: 'itemId 不能为空' };
        }
        return request("/api/wallet/purchase", { method: "POST", body: { account: account, item_id: itemId } });
    },
    async submitWithdraw(data) { return request("/api/wallet/withdraw", { method: "POST", body: data }); },
    async postSystemAnnouncement(adminAccount, contentText) {
        if (!contentText || !contentText.trim()) throw new Error("公告内容不能为空！");
        return request("/api/system/announcement", { method: "POST", body: { admin_account: adminAccount, content: contentText } });
    },

    // ==========================================
    // 🔧 管理员调试：执行 Python 脚本
    // ==========================================
    async runAdminScript(adminAccount, scriptName) {
        if (!scriptName || !scriptName.trim()) throw new Error("脚本名称不能为空！");
        return request("/api/admin/run-script", { method: "POST", body: { admin_account: adminAccount, script_name: scriptName } });
    },

    // ==========================================
    // 💬 讨论区 API
    // ==========================================
    async getPosts(page = 1, limit = 20, sort = "latest") {
        return request(`/api/posts?page=${page}&limit=${limit}&sort=${sort}`);
    },
    async getPostDetail(postId) { 
        return request(`/api/posts/${postId}`); 
    },
    async createPost(data) { 
        return request("/api/posts", { method: "POST", body: data }); 
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
    async getPostComments(postId) { 
        return request(`/api/posts/${postId}/comments`); 
    },
    async addPostComment(postId, content) { 
        return request(`/api/posts/${postId}/comments?content=${encodeURIComponent(content)}`, { method: "POST" }); 
    },
    async getMyPosts() {
        return request("/api/my-posts");
    },

    // ==========================================
    // 📝 任务榜 API
    // ==========================================
    async getTasks(page = 1, limit = 20, status = null, sort = "latest") {
        let url = `/api/tasks?page=${page}&limit=${limit}&sort=${sort}`;
        if (status) url += `&status=${status}`;
        return request(url);
    },
    async getTaskDetail(taskId) {
        return request(`/api/tasks/${taskId}`);
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
    async getTaskComments(taskId) {
        return request(`/api/tasks/${taskId}/comments`);
    },
    async addTaskComment(taskId, content) {
        return request(`/api/tasks/${taskId}/comments?content=${encodeURIComponent(content)}`, { method: "POST" });
    },

    // ==========================================
    // ⚖️ 申诉仲裁 API
    // ==========================================
    async getDisputeDetail(disputeId) {
        return request(`/api/disputes/${disputeId}`);
    },
    async respondDispute(disputeId, response, evidence = null) {
        return request(`/api/disputes/${disputeId}/respond`, {
            method: "POST",
            body: { response, evidence: evidence || [] }
        });
    },
    async getAdminDisputes(status = null) {
        let url = "/api/admin/disputes";
        if (status) url += `?status=${status}`;
        return request(url);
    },
    async resolveDispute(disputeId, resolution, ratio = null, note = null) {
        return request(`/api/admin/disputes/${disputeId}/resolve`, {
            method: "POST",
            body: { resolution, ratio, note }
        });
    },

    // ==========================================
    // 🔄 P7后悔模式：退款API
    // ==========================================
    async getPurchaseStatus(account, itemId) {
        return request(`/api/wallet/${account}/purchase/${itemId}`);
    },
    async requestRefund(account, itemId) {
        return request(`/api/wallet/refund?account=${encodeURIComponent(account)}&item_id=${encodeURIComponent(itemId)}`, {
            method: "POST"
        });
    },

    // ==========================================
    // 🔒 管理员：系统配置 API
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
    // 💰 管理员：提现管理 API
    // ==========================================
    async getAdminWithdrawals(status = null) {
        let url = "/api/admin/withdrawals";
        if (status) url += `?status=${status}`;
        return request(url);
    },
    async completeWithdrawal(txId, paymentOrderId) {
        return request(`/api/admin/withdrawals/${txId}/complete`, {
            method: "POST",
            body: { payment_order_id: paymentOrderId }
        });
    }
};

export { api };
export default api;
