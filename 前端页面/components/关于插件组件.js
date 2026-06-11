// 前端页面/components/关于插件组件.js
import { api, request } from "../core/网络请求API.js";
import { t } from "./用户体验增强.js";

// 🏷️ 版本配置缓存
let cachedVersionConfig = null;

// 清除版本配置缓存（管理员修改版本后调用）
export function clearVersionCache() {
    cachedVersionConfig = null;
}

// 🎨 卡片基础样式常量（authorSection 与 createCardSection 共享）
const CARD_BASE_STYLE = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px",
    padding: "16px"
};

// 获取版本配置
async function getVersionConfig() {
    if (cachedVersionConfig) return cachedVersionConfig;

    try {
        const res = await request('/api/public/project-version');
        if (res?.data) {
            cachedVersionConfig = res.data;
            return cachedVersionConfig;
        }
    } catch (e) {
        console.warn('获取版本配置失败:', e);
    }

    // 默认值
    return { stage: 'beta', major: 2, minor: 0, patch: 0 };
}

// 生成版本字符串
export function formatVersionString(config) {
    const stageLabels = {
        'alpha': t('about.stage_alpha'),
        'beta': t('about.stage_beta'),
        'rc': t('about.stage_rc'),
        'stable': t('about.stage_stable')
    };
    const version = `V${config.major}.${config.minor}.${config.patch}`;
    const stageLabel = stageLabels[config.stage] || config.stage;
    return `${version} ${stageLabel}`;
}

// 获取阶段本地化名称
export function getStageLabel(stage) {
    const stageLabels = {
        'alpha': t('about.stage_alpha'),
        'beta': t('about.stage_beta'),
        'rc': t('about.stage_rc'),
        'stable': t('about.stage_stable')
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
        <div style="font-size: 22px; font-weight: bold; color: #00d4aa; margin-bottom: 6px;">${t('about.title')}</div>
        <div style="font-size: 14px; color: #888; margin-bottom: 12px; letter-spacing: 2px;">Community Hub</div>
        <div style="display: inline-block; background: rgba(0, 212, 170, 0.12); color: #00d4aa; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-bottom: 12px; border: 1px solid rgba(0, 212, 170, 0.2);">${versionString}</div>
        <div style="font-size: 13px; color: #aaa; line-height: 1.6; max-width: 400px; margin: 0 auto;">${t('about.subtitle')}</div>
    `;

    // ===== 2. 核心优势区 =====
    const advantageSection = createCardSection("✨ " + t('about.advantages_title'), `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">🔗</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">${t('about.adv_native_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.adv_native_desc')}</div>
            </div>
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">⚡</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">${t('about.adv_speed_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.adv_speed_desc')}</div>
            </div>
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">💬</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">${t('about.adv_im_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.adv_im_desc')}</div>
            </div>
            <div class="about-adv-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px;">
                <div style="font-size: 20px; margin-bottom: 6px;">🛡️</div>
                <div style="font-weight: bold; color: #00d4aa; font-size: 13px; margin-bottom: 4px;">${t('about.adv_sandbox_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.adv_sandbox_desc')}</div>
            </div>
        </div>
    `);

    // ===== 3. 主要功能区 =====
    const featureSection = createCardSection("🎯 " + t('about.features_title'), `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">1.</span>${t('about.feat_publish_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_publish_desc')}</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">2.</span>${t('about.feat_social_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_social_desc')}</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">3.</span>${t('about.feat_install_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_install_desc')}</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">4.</span>${t('about.feat_download_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_download_desc')}</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">5.</span>${t('about.feat_chat_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_chat_desc')}</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">6.</span>${t('about.feat_account_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_account_desc')}</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">7.</span>${t('about.feat_payment_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_payment_desc')}</div>
            </div>
            <div class="about-feat-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
                <div style="font-weight: bold; color: #ccc; font-size: 13px; margin-bottom: 4px;"><span style="color: #00d4aa; margin-right: 4px;">8.</span>${t('about.feat_protection_title')}</div>
                <div style="font-size: 12px; color: #888; line-height: 1.5;">${t('about.feat_protection_desc')}</div>
            </div>
        </div>
    `);

    // ===== 4. 用户价值区 =====
    const userValueSection = createCardSection("👤 " + t('about.benefits_title'), `
        <div style="display: flex; flex-direction: column; gap: 10px; padding-left: 4px;">
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">1.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">${t('about.benefit_1')}</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">2.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">${t('about.benefit_2')}</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">3.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">${t('about.benefit_3')}</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">4.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">${t('about.benefit_4')}</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="color: #00d4aa; font-weight: bold; font-size: 13px; flex-shrink: 0;">5.</span>
                <span style="font-size: 13px; color: #ccc; line-height: 1.6;">${t('about.benefit_5')}</span>
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
            <span>⚠️</span> ${t('about.warning_title')}
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 13px; color: #ccc; line-height: 1.6;">
                <strong style="color: #f0a030;">${t('about.warning_login_title')}</strong>${t('about.warning_login_desc')}
            </div>
            <div style="font-size: 13px; color: #ccc; line-height: 1.6;">
                <strong style="color: #f0a030;">${t('about.warning_account_title')}</strong>${t('about.warning_account_desc')}
            </div>
        </div>
    `;

    // ===== 6. 关于作者区 =====
    const authorSection = document.createElement("div");
    Object.assign(authorSection.style, { ...CARD_BASE_STYLE, textAlign: "center" });
    authorSection.innerHTML = `
        <div style="font-size: 15px; font-weight: bold; color: #00d4aa; margin-bottom: 12px;">${t('about.author_title')}</div>
        <a href="https://space.bilibili.com/2114638644" target="_blank" style="text-decoration: none; display: inline-block;">
            <img src="https://img.shields.io/badge/bilibili-猪的飞行梦-00A1D6?logo=bilibili&logoColor=white" alt="Bilibili" style="border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        </a>
        <div style="margin-top: 12px; font-size: 12px; color: #666;">
            ${t('about.author_thanks')}
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
    backBtn.innerHTML = "⬅ " + t('common.back');
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

// 辅助函数：创建带标题的卡片分区（titleHtml 支持纯文本或 HTML）
function createCardSection(titleHtml, contentHtml) {
    const section = document.createElement("div");
    Object.assign(section.style, CARD_BASE_STYLE);
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
