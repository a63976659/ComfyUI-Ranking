// 前端页面/core/网络请求_图片代理.js
// ==========================================
// 🖼️ 图片代理模块
// ==========================================
// 作用：处理图片URL的本地代理转换，支持入口清洗和出口剥离
// 说明：此模块无任何外部依赖
// ==========================================

// 🟢 入口清洗：接收云端数据时，转换为本地代理，并带【自愈机制】清理被污染的历史数据
// 🚀 统一缓存：所有头像字段都走同一个缓存代理，无需重复下载
const IMAGE_PROXY_FIELDS = [
    'coverUrl',           // 封面图
    'cover_image',        // 帖子封面图（后端字段名）
    'avatar',             // 通用头像
    'avatarDataUrl',      // 头像数据 URL
    'from_avatar',        // 消息发送者头像
    'bannerUrl',          // 背景图
    'publisher_avatar',   // 任务发布者头像
    'assignee_avatar',    // 任务接单者头像
    'author_avatar',      // 帖子/评论作者头像
    'target_avatar',      // 私信目标用户头像
];

// 🚀 新增：需要对数组元素进行代理的图片字段
const IMAGE_PROXY_ARRAY_FIELDS = ['images', 'imageUrls', 'reference_images', 'deliverables'];

// 🚀 导出图片代理函数，供其他组件在缓存读取后调用
export function proxyImages(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map(proxyImages);
    if (typeof obj === 'object') {
        for (let key in obj) {
            if (IMAGE_PROXY_FIELDS.includes(key) && typeof obj[key] === 'string') {
                
                let originalUrl = obj[key];
                // 自动修复：一层一层剥开已经被污染的多重代理前缀
                while (originalUrl.startsWith('/community_hub/image?url=')) {
                    try { originalUrl = decodeURIComponent(originalUrl.replace('/community_hub/image?url=', '')); }
                    catch(e) { break; }
                }

                // 只有最终剥离出来的确实是外部网络链接（包括云端代理URL），才挂上本地缓存代理
                if (originalUrl.startsWith('http')) {
                    obj[key] = `/community_hub/image?url=${encodeURIComponent(originalUrl)}`;
                } else {
                    obj[key] = originalUrl;
                }
            } else if (IMAGE_PROXY_ARRAY_FIELDS.includes(key) && Array.isArray(obj[key])) {
                // 🚀 新增：处理图片URL数组字段（如帖子的images数组）
                obj[key] = obj[key].map(url => {
                    if (typeof url === 'string') {
                        let originalUrl = url;
                        // 复用相同的URL清洗逻辑
                        while (originalUrl.startsWith('/community_hub/image?url=')) {
                            try { originalUrl = decodeURIComponent(originalUrl.replace('/community_hub/image?url=', '')); }
                            catch(e) { break; }
                        }
                        // 只有外部网络链接（包括云端代理URL）才挂上本地缓存代理
                        if (originalUrl.startsWith('http')) {
                            return `/community_hub/image?url=${encodeURIComponent(originalUrl)}`;
                        }
                        return originalUrl;
                    }
                    return url;
                });
            } else {
                obj[key] = proxyImages(obj[key]);
            }
        }
    }
    return obj;
}

// 🟢 出口剥离：提交给云端前，强制扒掉本地代理外衣，还原为真实云端直链，彻底杜绝数据污染！
export function unproxyImages(obj) {
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
