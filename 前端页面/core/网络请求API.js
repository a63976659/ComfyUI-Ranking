// 前端页面/core/网络请求API.js
// ==========================================
// 🌐 网络请求API - 统一导出入口
// ==========================================
// 本文件为统一入口，实际实现已拆分至以下模块：
//   - 网络请求_基础设施.js (请求核心：fetch封装、重试、超时、队列、取消管理器)
//   - 网络请求_图片代理.js (图片代理/反代理：proxyImages、unproxyImages)
//   - 网络请求_缓存管理.js (缓存配置、TTL、精确失效映射)
//   - 网络请求_业务API.js (api对象：40+个业务方法)
// ==========================================

export { request, requestCancelManager, invalidateRelatedCache } from './网络请求_基础设施.js';
export { proxyImages, unproxyImages } from './网络请求_图片代理.js';
export { api } from './网络请求_业务API.js';
