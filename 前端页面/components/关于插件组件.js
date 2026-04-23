// 前端页面/components/关于插件组件.js
import { api } from "../core/网络请求API.js";

// 🏷️ 版本配置缓存
let cachedVersionConfig = null;

// 获取版本配置
async function getVersionConfig() {
    if (cachedVersionConfig) return cachedVersionConfig;

    try {
        const res = await api.getSystemConfig('project_version');
        if (res?.data) {
            cachedVersionConfig = res.data;
            return cachedVersionConfig;
        }
    } catch (e) {
        console.warn('获取版本配置失败:', e);
    }

    // 默认值
    return { stage: 'alpha', major: 1, minor: 0, patch: 0 };
}

// 生成版本字符串
export function formatVersionString(config) {
    const stageLabels = {
        'alpha': 'Alpha 内测',
        'beta': 'Beta 公测',
        'rc': 'RC 候选版',
        'stable': '正式版'
    };
    const version = `V${config.major}.${config.minor}.${config.patch}`;
    const stageLabel = stageLabels[config.stage] || config.stage;
    return `${version} ${stageLabel}`;
}

// 获取阶段中文名称
export function getStageLabel(stage) {
    const stageLabels = {
        'alpha': '内测',
        'beta': '公测',
        'rc': '候选版',
        'stable': '正式版'
    };
    return stageLabels[stage] || stage;
}

// ==========================================
// 🎨 创建关于页面独立视图
// ==========================================
export function createAboutView(versionString, stageLabel) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        flex: "1",
        overflowY: "auto",
        color: "#ccc",
        fontSize: "14px",
        padding: "16px",
        boxSizing: "border-box",
        gap: "16px",
        background: "transparent"
    });

    // ===== 1. Hero 品牌区 =====
    const heroSection = document.createElement("div");
    Object.assign(heroSection.style, {
        background: "linear-gradient(180deg, rgba(0, 212, 170, 0.15) 0%, transparent 100%)",
        borderRadius: "10px",
        padding: "28px 20px",
        textAlign: "center",
        border: "1px solid rgba(255,255,255,0.06)"
    });
    heroSection.innerHTML = `
        <div style="font-size: 22px; font-weight: bold; color: #00d4aa; margin-bottom: 6px;">ComfyUI 社区精选</div>
        <div style="font-size: 14px; color: #888; margin-bottom: 12px; letter-spacing: 2px;">Community Hub</div>
        <div style="display: inline-block; background: rgba(0, 212, 170, 0.12); color: #00d4aa; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-bottom: 12px; border: 1px solid rgba(0, 212, 170, 0.2);">${versionString}</div>
        <div style="font-size: 13px; color: #aaa; line-height: 1.6; max-width: 400px; margin: 0 auto;">专为 ComfyUI 打造的现代化 Web3.0 级别生态引擎</div>
    `;

    // ===== 2. 核心优势区 =====
    const advantageSection = createCardSection("✨ 核心优势", `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">🔗</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">原生融合</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">采用 ComfyUI V3 标准机制，零侵入保护工作流运行</div>
            </div>
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">⚡</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">零延时体验</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">引入现代前端缓存策略，告别白屏等待</div>
            </div>
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">💬</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">全局即时通讯</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">内置私信与系统通知，打破信息孤岛</div>
            </div>
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">🛡️</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">沙箱化交互</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">严格的事件防穿透机制，全方位保护底层画布安全</div>
            </div>
        </div>
    `);

    // ===== 3. 主要功能区 =====
    const featureSection = createCardSection("🎯 主要功能", `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">1.</span>作品发布</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">支持发布工具、应用、工作流 及优质资源推荐</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">2.</span>社区互动</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">内置点赞、评论、收藏、关注</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">3.</span>极简安装</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">一键静默安装插件，云端内存解压，无需手动，并支持 GitHub 私有库密钥防盗</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">4.</span>一键加载</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">一键下载应用，云端校验所有权防重复扣费，下载过的文件直接使用</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">5.</span>即时通讯</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">内置私信聊天与全局消息提醒</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">6.</span>账号系统</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">完善的注册、资料修改与基于邮箱的安全验证风控</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">7.</span>消费系统</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">支付宝扫码秒充值，支持安全提现</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">8.</span>内容保护</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">付费内容云端永久记录，一次购买终身有效</div>
            </div>
        </div>
    `);

    // ===== 4. 用户价值区 =====
    const userValueSection = createCardSection("👤 用户受益", `
        <div style="display: flex; flex-direction: column; gap: 10px; padding-left: 4px;">
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">1.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">根据榜单和图表趋势，一键下载优秀的工具提升生产力</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">2.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">通过真实评价和文件检测机制，避坑无效资源</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">3.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">发布自己原创的工具或工作流应用</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">4.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">自由设置下载付费积分（1积分=1元），或设为免费开源</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">5.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">积累粉丝与口碑，获得好心人的积分打赏</span>
            </div>
        </div>
    `);

    // ===== 5. 注意事项区 =====
    const warningSection = document.createElement("div");
    Object.assign(warningSection.style, {
        background: "rgba(240, 160, 48, 0.05)",
        borderRadius: "10px",
        padding: "16px",
        borderTop: "1px solid rgba(240, 160, 48, 0.15)",
        borderRight: "1px solid rgba(240, 160, 48, 0.15)",
        borderBottom: "1px solid rgba(240, 160, 48, 0.15)",
        borderLeft: "3px solid #f0a030"
    });
    warningSection.innerHTML = `
        <div style="font-size: 15px; font-weight: bold; color: #f0a030; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>⚠️</span> 注意
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 13px; color: #ccc; line-height: 1.6;">
                <strong style="color: #f0a030;">账号登录问题：</strong>之前注册的账号无法登录的，请修改密码后再登录。
            </div>
            <div style="font-size: 13px; color: #ccc; line-height: 1.6;">
                <strong style="color: #f0a030;">登录账号错误：</strong>可能是你的浏览器自动帮你填入别的网站账号密码，账号是字符（字母、数字、符号）没有中文。
            </div>
        </div>
    `;

    // ===== 6. 关于作者区 =====
    const authorSection = document.createElement("div");
    Object.assign(authorSection.style, {
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "10px",
        padding: "16px",
        textAlign: "center"
    });
    authorSection.innerHTML = `
        <div style="font-size: 15px; font-weight: bold; color: #00d4aa; margin-bottom: 12px;">关于作者</div>
        <a href="https://space.bilibili.com/2114638644" target="_blank" style="text-decoration: none; display: inline-block;">
            <img src="https://img.shields.io/badge/bilibili-猪的飞行梦-00A1D6?logo=bilibili&logoColor=white" alt="Bilibili" style="border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        </a>
        <div style="margin-top: 12px; font-size: 12px; color: #666;">
            感谢使用 ComfyUI 社区精选，愿 ComfyUI 生态繁荣昌盛 🌱
        </div>
    `;

    // ===== 返回按钮 =====
    const backBtn = document.createElement("button");
    Object.assign(backBtn.style, {
        background: "rgba(51,51,51,0.8)",
        border: "1px solid rgba(85,85,85,0.8)",
        color: "#fff",
        padding: "6px 14px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "bold",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        width: "fit-content",
        transition: "0.2s",
        marginLeft: "14px",
        marginTop: "14px",
        marginBottom: "4px"
    });
    backBtn.innerHTML = `<span style="font-size: 14px;">⬅</span> 返回`;
    backBtn.onmouseover = () => {
        backBtn.style.background = "#4CAF50";
        backBtn.style.borderColor = "#4CAF50";
    };
    backBtn.onmouseout = () => {
        backBtn.style.background = "rgba(51,51,51,0.8)";
        backBtn.style.borderColor = "rgba(85,85,85,0.8)";
    };
    backBtn.onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    // 组装
    container.appendChild(backBtn);
    container.appendChild(heroSection);
    container.appendChild(advantageSection);
    container.appendChild(featureSection);
    container.appendChild(userValueSection);
    container.appendChild(warningSection);
    container.appendChild(authorSection);

    return container;
}

// 辅助函数：创建带标题的卡片分区
function createCardSection(titleHtml, contentHtml) {
    const section = document.createElement("div");
    Object.assign(section.style, {
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "10px",
        padding: "16px"
    });
    section.innerHTML = `
        <div style="font-size: 15px; font-weight: bold; color: #00d4aa; margin-bottom: 12px;">${titleHtml}</div>
        ${contentHtml}
    `;
    return section;
}

// ==========================================
// 🚀 显示关于信息（通过路由系统）
// ==========================================
export async function showAboutInfo(currentUser) {
    // 动态获取版本配置
    const versionConfig = await getVersionConfig();
    const versionString = formatVersionString(versionConfig);
    const stageLabel = getStageLabel(versionConfig.stage);

    const view = createAboutView(versionString, stageLabel);
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
}

// 导出版本获取函数供其他组件使用
export { getVersionConfig };
