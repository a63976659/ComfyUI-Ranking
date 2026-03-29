// 前端页面/core/类型定义.js
// ==========================================
// 📋 类型定义文件 (JSDoc)
// ==========================================
// 作用：为 JavaScript 代码提供类型注释，增强 IDE 智能提示
// 使用方式：在其他文件中引用 @typedef 或 @type
// ==========================================
// 🏗️ P2质量优化：类型安全
// ==========================================


// ==========================================
// 👤 用户相关类型
// ==========================================

/**
 * @typedef {Object} UserData
 * @property {string} account - 用户账号（唯一标识）
 * @property {string} name - 用户昵称
 * @property {string} [email] - 邮箱地址
 * @property {string} [phone] - 手机号
 * @property {string} [gender] - 性别
 * @property {number} [age] - 年龄
 * @property {string} [country] - 国家
 * @property {string} [region] - 地区
 * @property {string} [intro] - 个人介绍
 * @property {string} [avatar] - 头像URL
 * @property {string} [avatarDataUrl] - 头像Base64数据
 * @property {number} [created_at] - 注册时间戳
 * @property {string[]} [followers] - 粉丝列表
 * @property {string[]} [following] - 关注列表
 * @property {PrivacySettings} [privacy] - 隐私设置
 */

/**
 * @typedef {Object} PrivacySettings
 * @property {boolean} follows - 是否公开关注列表
 * @property {boolean} likes - 是否公开点赞记录
 * @property {boolean} favorites - 是否公开收藏记录
 * @property {boolean} downloads - 是否公开下载记录
 */

/**
 * @typedef {Object} UserSession
 * @property {boolean} isLoggedIn - 是否已登录
 * @property {string|null} account - 用户账号
 * @property {string|null} name - 用户昵称
 * @property {string|null} avatar - 头像URL
 * @property {string|null} token - 认证令牌
 * @property {WalletData|null} wallet - 钱包数据
 */

/**
 * @typedef {Object} LoginResponse
 * @property {string} status - 状态：success
 * @property {string} token - JWT 令牌
 * @property {string} account - 用户账号
 * @property {string} name - 用户昵称
 * @property {string} avatar - 头像URL
 */

/**
 * @typedef {Object} RegisterData
 * @property {string} account - 账号
 * @property {string} password - 密码
 * @property {string} name - 昵称
 * @property {string} [email] - 邮箱
 * @property {string} [phone] - 手机号
 * @property {string} gender - 性别
 * @property {string} code - 验证码
 * @property {string} [intro] - 个人介绍
 * @property {string} [avatarDataUrl] - 头像
 */


// ==========================================
// 📦 内容相关类型
// ==========================================

/**
 * @typedef {Object} ItemData
 * @property {string} id - 内容ID
 * @property {string} type - 类型：tool/app/recommend
 * @property {string} title - 标题
 * @property {string} shortDesc - 简短描述
 * @property {string} fullDesc - 详细描述
 * @property {string} link - 资源链接
 * @property {string} [coverUrl] - 封面图URL
 * @property {string[]} [imageUrls] - 图片列表
 * @property {string} author - 作者账号
 * @property {number} price - 价格（积分）
 * @property {number} [likes] - 点赞数
 * @property {number} [favorites] - 收藏数
 * @property {number} [comments] - 评论数
 * @property {number} [uses] - 使用次数
 * @property {string[]} [liked_by] - 点赞用户列表
 * @property {string[]} [favorited_by] - 收藏用户列表
 * @property {number} [created_at] - 创建时间戳
 * @property {TipRecord[]} [tip_board] - 打赏榜单
 * @property {CommentData[]} [commentsData] - 评论数据
 * @property {Object} [usageHistory] - 使用历史
 * @property {string} [github_token] - GitHub Token
 */

/**
 * @typedef {Object} ItemCreateData
 * @property {string} type - 类型
 * @property {string} title - 标题
 * @property {string} shortDesc - 简短描述
 * @property {string} fullDesc - 详细描述
 * @property {string} link - 资源链接
 * @property {string} [coverUrl] - 封面图
 * @property {string[]} [imageUrls] - 图片列表
 * @property {string} author - 作者账号
 * @property {number} [price] - 价格
 * @property {string} [github_token] - GitHub Token
 */

/**
 * @typedef {Object} ItemUpdateData
 * @property {string} [title] - 标题
 * @property {string} [shortDesc] - 简短描述
 * @property {string} [fullDesc] - 详细描述
 * @property {string} [link] - 资源链接
 * @property {string} [coverUrl] - 封面图
 * @property {string[]} [imageUrls] - 图片列表
 * @property {number} [price] - 价格
 * @property {string} [github_token] - GitHub Token
 */


// ==========================================
// 💬 评论相关类型
// ==========================================

/**
 * @typedef {Object} CommentData
 * @property {string} id - 评论ID
 * @property {string} item_id - 所属内容ID
 * @property {string} author - 作者账号
 * @property {string} content - 评论内容
 * @property {number} created_at - 创建时间戳
 * @property {boolean} [isDeleted] - 是否已删除
 * @property {string} [reply_to_user] - 回复的用户账号
 * @property {string} [parent_id] - 父评论ID
 * @property {CommentData[]} [replies] - 回复列表
 */

/**
 * @typedef {Object} CommentCreateData
 * @property {string} item_id - 内容ID
 * @property {string} author - 作者账号
 * @property {string} content - 评论内容
 * @property {string} [reply_to_user] - 回复的用户
 * @property {string} [parent_id] - 父评论ID
 */


// ==========================================
// 💰 钱包相关类型
// ==========================================

/**
 * @typedef {Object} WalletData
 * @property {string} account - 用户账号
 * @property {number} balance - 余额
 * @property {number} total_income - 总收入
 * @property {number} total_spent - 总支出
 * @property {TransactionRecord[]} [transactions] - 交易记录
 */

/**
 * @typedef {Object} TransactionRecord
 * @property {string} id - 交易ID
 * @property {string} account - 用户账号
 * @property {string} tx_type - 交易类型：recharge/withdraw/purchase/tip_in/tip_out
 * @property {number} amount - 金额
 * @property {string} [related_account] - 关联账号
 * @property {string} [item_id] - 关联内容ID
 * @property {number} created_at - 创建时间
 * @property {string} [status] - 状态
 * @property {string} [tx_hash] - 交易哈希
 */

/**
 * @typedef {Object} TipRecord
 * @property {string} from_account - 打赏者账号
 * @property {string} from_name - 打赏者昵称
 * @property {string} [from_avatar] - 打赏者头像
 * @property {number} amount - 打赏金额
 * @property {number} [timestamp] - 打赏时间
 * @property {boolean} [is_anonymous] - 是否匿名
 */

/**
 * @typedef {Object} TipRequest
 * @property {string} sender_account - 发送者账号
 * @property {string} target_account - 接收者账号
 * @property {number} amount - 打赏金额
 * @property {boolean} is_anonymous - 是否匿名
 * @property {string} [item_id] - 关联内容ID
 */

/**
 * @typedef {Object} WithdrawRequest
 * @property {string} account - 用户账号
 * @property {number} amount - 提现金额
 * @property {string} alipayAccount - 支付宝账号
 * @property {string} real_name - 真实姓名
 * @property {string} code - 验证码
 */


// ==========================================
// 💖 打赏等级类型
// ==========================================

/**
 * @typedef {Object} TipLevel
 * @property {number} suns - 太阳数量
 * @property {number} moons - 月亮数量
 * @property {number} stars - 星星数量
 * @property {boolean} isMaxLevel - 是否满级
 */


// ==========================================
// 📨 消息相关类型
// ==========================================

/**
 * @typedef {Object} PrivateMessage
 * @property {string} id - 消息ID
 * @property {string} sender - 发送者账号
 * @property {string} receiver - 接收者账号
 * @property {string} content - 消息内容
 * @property {number} timestamp - 发送时间
 * @property {boolean} [is_read] - 是否已读
 */

/**
 * @typedef {Object} ChatSession
 * @property {string} target_account - 对话对象账号
 * @property {string} target_name - 对话对象昵称
 * @property {string} [target_avatar] - 对话对象头像
 * @property {string} last_message - 最后一条消息
 * @property {number} last_time - 最后消息时间
 * @property {number} unread_count - 未读消息数
 */

/**
 * @typedef {Object} Notification
 * @property {string} id - 通知ID
 * @property {string} type - 通知类型：comment/follow/tip/system
 * @property {string} from_account - 来源账号
 * @property {string} [item_id] - 关联内容ID
 * @property {string} content - 通知内容
 * @property {number} timestamp - 通知时间
 * @property {boolean} is_read - 是否已读
 */


// ==========================================
// 🌐 API 响应类型
// ==========================================

/**
 * @typedef {Object} ApiResponse
 * @property {string} status - 状态：success/error
 * @property {string} [message] - 消息
 * @property {*} [data] - 数据
 * @property {string} [detail] - 错误详情
 */

/**
 * @typedef {Object} ListResponse
 * @property {string} status - 状态
 * @property {Array} data - 数据列表
 * @property {number} [total] - 总数
 * @property {number} [page] - 当前页
 * @property {number} [page_size] - 每页数量
 */


// ==========================================
// 🎯 事件类型
// ==========================================

/**
 * @typedef {Object} TabChangeEvent
 * @property {string} oldTab - 原标签页
 * @property {string} newTab - 新标签页
 */

/**
 * @typedef {Object} SortChangeEvent
 * @property {string} oldSort - 原排序方式
 * @property {string} newSort - 新排序方式
 */

/**
 * @typedef {Object} SearchEvent
 * @property {string} keyword - 搜索关键词
 */

/**
 * @typedef {Object} NetworkChangeEvent
 * @property {boolean} online - 是否在线
 */


// ==========================================
// 🔧 工具类型
// ==========================================

/**
 * @typedef {Object} CacheItem
 * @property {*} value - 缓存值
 * @property {number} expireAt - 过期时间戳
 */

/**
 * @typedef {Object} PaginationState
 * @property {number} currentPage - 当前页
 * @property {number} pageSize - 每页数量
 * @property {boolean} hasMore - 是否有更多
 * @property {boolean} isLoading - 是否加载中
 */

/**
 * @typedef {Object} ToastOptions
 * @property {string} [type] - 类型：info/success/warning/error
 * @property {number} [duration] - 显示时长（毫秒）
 */

/**
 * @typedef {Object} ConfirmOptions
 * @property {string} [title] - 标题
 * @property {string} [confirmText] - 确认按钮文字
 * @property {string} [cancelText] - 取消按钮文字
 * @property {string} [type] - 类型：warning/danger/info
 */


// ==========================================
// 📤 导出（用于 IDE 智能提示）
// ==========================================

// 此文件仅用于类型定义，无需导出实际值
// 在其他文件中使用：
// @type {import('./类型定义.js').UserData}
// 或直接在函数上方使用 @param/@returns

export default {};
