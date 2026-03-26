// 前端页面/components/关于插件组件.js

export function showAboutInfo(currentUser) {
    const aboutData = {
        author: "感谢支持",
        title: "ComfyUI 社区精选 (Community Hub)",
        fullDesc: `ComfyUI精选社区 内测开启！

目的：
1. 让工具或工作流能够直接卖钱，创作者可以有收益。
2. 让更多优质好用的工具或工作流，更容易被看见并获取。
3. 让无偿分享也有收益，建立健康的赞赏回馈机制。
4. 打造正向循环，有收益才能不断进步，繁荣整个 ComfyUI 生态。

主要功能：
1. 作品发布：支持发布工具、应用、工作流 及优质资源推荐。
2. 社区互动：内置点赞、评论、收藏、关注。
3. 极简安装：一键静默安装插件，云端内存解压，无需手动，并支持 GitHub 私有库密钥防盗。
4. 一键加载：一键下载应用，云端校验所有权防重复扣费，下载过的文件直接使用。
5. 即时通讯：内置私信聊天与全局消息提醒。
6. 账号系统：完善的注册、资料修改与基于邮箱的安全验证风控。
7. 消费系统：支付宝扫码秒充值，支持安全提现。
8. 内容保护：付费内容云端永久记录，一次购买终身有效。

用户：
1. 根据榜单和图表趋势，一键下载优秀的工具提升生产力。
2. 通过真实评价和文件检测机制，避坑无效资源。
3. 发布自己原创的工具或工作流应用。
4. 自由设置下载付费积分（1积分=1元），或设为免费开源。
5. 积累粉丝与口碑，获得好心人的积分打赏。

✨ 核心优势：
1. 原生与无感融合：采用 ComfyUI V3 标准机制，零侵入保护工作流运行。
2. 零延时体验：引入现代前端 缓存策略，告别白屏等待。
3. 全局即时通讯：内置私信与系统通知，打破信息孤岛。
4. 沙盒化交互：严格的事件防穿透机制，全方位保护底层画布安全。

ComfyUI 社区精选是一款专为 ComfyUI 打造的现代化、Web3.0 级别生态引擎，致力于聚合全网优质的插件、应用与工作流，让节点的获取与分享变得前所未有地简单。

<a href="https://space.bilibili.com/2114638644" target="_blank" style="text-decoration: none; display: inline-block; margin-top: 15px;">
    <img src="https://img.shields.io/badge/bilibili-猪的飞行梦-00A1D6?logo=bilibili&logoColor=white" alt="Bilibili" style="border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
</a>`
    };
    
    // 派发事件，直接复用“资源详情页”组件来完美展示关于信息
    window.dispatchEvent(new CustomEvent("comfy-open-detail", { detail: { itemData: aboutData, currentUser } }));
}