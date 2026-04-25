// 前端页面/core/网络请求_图片代理.js
// ==========================================
// 🖼️ 图片代理模块
// ==========================================
// 作用：处理图片URL的本地代理转换，支持入口清洗和出口剥离
// ==========================================

import { API } from './全局配置.js';

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

// 🎬 视频代理字段（走独立的 /community_hub/video 接口，支持流式传输和 Range 请求）
const VIDEO_PROXY_FIELDS = [
    'video_url',
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
                let _unwrap = 0;
                while (originalUrl.startsWith('/community_hub/image?url=') && _unwrap++ < 10) {
                    try { originalUrl = decodeURIComponent(originalUrl.replace('/community_hub/image?url=', '')); }
                    catch(e) { break; }
                }

                // 只有最终剥离出来的确实是外部网络链接（包括云端代理URL），才挂上本地缓存代理
                if (originalUrl.startsWith('http')) {
                    obj[key] = `/community_hub/image?url=${encodeURIComponent(originalUrl)}`;
                } else {
                    obj[key] = originalUrl;
                }
            } else if (VIDEO_PROXY_FIELDS.includes(key) && typeof obj[key] === 'string') {
                // 🎬 视频字段走独立的视频代理接口
                let originalUrl = obj[key];
                // 自动修复：一层一层剥开已经被污染的多重代理前缀（视频）
                let _unwrap = 0;
                while (originalUrl.startsWith('/community_hub/video?url=') && _unwrap++ < 10) {
                    try { originalUrl = decodeURIComponent(originalUrl.replace('/community_hub/video?url=', '')); }
                    catch(e) { break; }
                }
                // 只有外部网络链接才挂上本地视频缓存代理
                if (originalUrl.startsWith('http')) {
                    obj[key] = `/community_hub/video?url=${encodeURIComponent(originalUrl)}`;
                } else if (originalUrl && !originalUrl.startsWith('/') && !originalUrl.startsWith('data:')) {
                    // 🎬 相对路径（如 uploads/post_video/...）
                    // 离线时不构造远程 URL，保持原样让浏览器从当前域尝试加载
                    if (navigator.onLine === false) {
                        obj[key] = originalUrl;
                    } else {
                        const fullUrl = `${API.BASE_URL}/api/image_proxy?path=${encodeURIComponent(originalUrl)}`;
                        obj[key] = `/community_hub/video?url=${encodeURIComponent(fullUrl)}`;
                    }
                } else {
                    obj[key] = originalUrl;
                }
            } else if (IMAGE_PROXY_ARRAY_FIELDS.includes(key) && Array.isArray(obj[key])) {
                // 🚀 新增：处理图片URL数组字段（如帖子的images数组）
                obj[key] = obj[key].map(url => {
                    if (typeof url === 'string') {
                        let originalUrl = url;
                        // 复用相同的URL清洗逻辑
                        let _unwrap = 0;
                        while (originalUrl.startsWith('/community_hub/image?url=') && _unwrap++ < 10) {
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
        let _unwrap = 0;
        while (str.startsWith('/community_hub/image?url=') && _unwrap++ < 10) {
            try { str = decodeURIComponent(str.replace('/community_hub/image?url=', '')); }
            catch(e) { break; }
        }
        // 🎬 同时剥离视频代理前缀
        _unwrap = 0;
        while (str.startsWith('/community_hub/video?url=') && _unwrap++ < 10) {
            try { str = decodeURIComponent(str.replace('/community_hub/video?url=', '')); }
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
