// 前端页面/components/关于插件组件.js

export function showAboutInfo(currentUser) {
    const aboutData = {
        author: "666666",
        title: "ComfyUI 社区精选 (Community Hub)",
        fullDesc: "ComfyUI 社区精选是一款专为 ComfyUI 打造的现代化、Web3.0 级别生态引擎，致力于聚合全网优质的插件、应用与工作流，让节点的获取与分享变得前所未有地简单。\n\n✨ 核心优势：\n1. 原生与无感融合：采用 ComfyUI V3 标准机制，零侵入保护工作流心流。\n2. 零延时体验：引入现代前端 SWR 缓存策略，告别白屏等待。\n3. 全局即时通讯：内置私信与系统通知，打破信息孤岛。\n4. 沙盒化交互：严格的事件防穿透机制，全方位保护底层画布安全。"
    };
    
    // 派发事件，直接复用你写好的“资源详情页”组件来完美展示关于信息
    window.dispatchEvent(new CustomEvent("comfy-open-detail", { detail: { itemData: aboutData, currentUser } }));
}