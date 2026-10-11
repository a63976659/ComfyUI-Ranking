// 关于页面：纯文本内容、共享主题与受控的公开版本刷新。
import { request } from "../core/网络请求API.js";
import { UI } from "../core/全局配置.js";
import { removeCacheByPrefix } from "../core/网络请求_缓存管理.js";
import { t } from "./用户体验增强.js";

let cachedVersionConfig = null;
let pendingVersionRequest = null;
let versionGeneration = 0;
let nextViewId = 0;

function normalizeVersion(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) return null;
    if (!["alpha", "beta", "rc", "stable"].includes(config.stage)) return null;
    if (![config.major, config.minor, config.patch].every(value => Number.isSafeInteger(value) && value >= 0)) return null;
    return { stage: config.stage, major: config.major, minor: config.minor, patch: config.patch };
}

export function clearVersionCache() {
    versionGeneration++;
    cachedVersionConfig = null;
    pendingVersionRequest = null;
    removeCacheByPrefix('api_/api/public/project-version');
}

export async function getVersionConfig() {
    if (cachedVersionConfig) return { ...cachedVersionConfig };
    if (!pendingVersionRequest) {
        const generation = versionGeneration;
        const pending = Promise.resolve().then(() => request('/api/public/project-version',
            generation > 0 ? { noCache: true } : undefined)).then(res => {
            const config = res?.status === "success" ? normalizeVersion(res.data) : null;
            if (!config) throw new Error("Invalid project version");
            if (generation !== versionGeneration) return cachedVersionConfig || UI.DEFAULT_PROJECT_VERSION;
            cachedVersionConfig = Object.freeze(config);
            return config;
        }).catch(() => {
            console.warn('公开版本信息无法刷新');
            return { ...UI.DEFAULT_PROJECT_VERSION };
        }).finally(() => {
            if (pendingVersionRequest === pending) pendingVersionRequest = null;
        });
        pendingVersionRequest = pending;
    }
    return { ...await pendingVersionRequest };
}

export function getStageLabel(stage) {
    switch (stage) {
        case "alpha": return t('about.stage_alpha');
        case "beta": return t('about.stage_beta');
        case "rc": return t('about.stage_rc');
        case "stable": return t('about.stage_stable');
        default: return t('about.stage_unknown');
    }
}

export function formatVersionString(config) {
    const version = normalizeVersion(config);
    if (!version) return t('about.version_unknown');
    return `V${version.major}.${version.minor}.${version.patch} ${getStageLabel(version.stage)}`;
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function section(title, children) {
    const node = element('section', 'about-section');
    const heading = element('h2', 'about-section__title', title);
    heading.id = `ranking-about-heading-${++nextViewId}`;
    node.setAttribute('aria-labelledby', heading.id);
    node.append(heading, ...children);
    return node;
}

function grid(entries, ordered = false) {
    const node = element(ordered ? 'ol' : 'ul', 'about-grid');
    for (const [title, description, icon] of entries) {
        const item = element('li', 'about-grid__item');
        if (icon) {
            const decoration = element('span', 'about-grid__icon', icon);
            decoration.setAttribute('aria-hidden', 'true');
            item.appendChild(decoration);
        }
        item.append(element('h3', 'about-item__title', title), element('p', 'about-description', description));
        node.appendChild(item);
    }
    return node;
}

export function createAboutView(versionString, stageLabel) {
    const container = element('div', 'about-view');
    const back = element('button', 'about-back', '⬅ ' + t('common.back'));
    back.type = 'button';
    back.addEventListener('click', () => window.dispatchEvent(new CustomEvent('comfy-route-back')));
    const hero = element('header', 'about-hero');
    const title = element('h1', 'about-hero__title', t('about.title'));
    title.id = `ranking-about-title-${++nextViewId}`;
    container.setAttribute('aria-labelledby', title.id);
    hero.append(title, element('p', 'about-hero__brand', t('about.brand')),
        element('p', 'about-version', typeof versionString === 'string' ? versionString : t('about.version_unknown')),
        element('p', 'about-description', t('about.subtitle')));
    const advantages = section(t('about.advantages_title'), [grid([
        [t('about.adv_native_title'), t('about.adv_native_desc'), '🔗'],
        [t('about.adv_speed_title'), t('about.adv_speed_desc'), '⚡'],
        [t('about.adv_im_title'), t('about.adv_im_desc'), '💬'],
        [t('about.adv_sandbox_title'), t('about.adv_sandbox_desc'), '🛡️']
    ])]);
    const features = section(t('about.features_title'), [grid([
        [t('about.feat_publish_title'), t('about.feat_publish_desc')],
        [t('about.feat_social_title'), t('about.feat_social_desc')],
        [t('about.feat_install_title'), t('about.feat_install_desc')],
        [t('about.feat_download_title'), t('about.feat_download_desc')],
        [t('about.feat_chat_title'), t('about.feat_chat_desc')],
        [t('about.feat_account_title'), t('about.feat_account_desc')],
        [t('about.feat_payment_title'), t('about.feat_payment_desc')],
        [t('about.feat_protection_title'), t('about.feat_protection_desc')]
    ], true)]);
    const guideList = element('ol', 'about-list');
    for (const [heading, description] of [
        [t('about.guide_install_title'), t('about.guide_install_desc')],
        [t('about.guide_path_title'), t('about.guide_path_desc')],
        [t('about.guide_update_title'), t('about.guide_update_desc')],
        [t('about.guide_publish_title'), t('about.guide_publish_desc')],
        [t('about.guide_buy_title'), t('about.guide_buy_desc')],
        [t('about.guide_refund_title'), t('about.guide_refund_desc')],
        [t('about.guide_withdraw_title'), t('about.guide_withdraw_desc')]
    ]) {
        const item = element('li');
        item.append(element('h3', 'about-item__title', heading), element('p', 'about-description', description));
        guideList.appendChild(item);
    }
    const benefits = element('ol', 'about-list');
    for (const text of [t('about.benefit_1'), t('about.benefit_2'), t('about.benefit_3'), t('about.benefit_4'), t('about.benefit_5')]) {
        benefits.appendChild(element('li', 'about-benefit', text));
    }
    const warningCopy = [];
    for (const [heading, description] of [
        [t('about.warning_login_title'), t('about.warning_login_desc')],
        [t('about.warning_account_title'), t('about.warning_account_desc')]
    ]) {
        const paragraph = element('p', 'about-warning__copy');
        paragraph.append(element('strong', '', heading), document.createTextNode(description));
        warningCopy.push(paragraph);
    }
    const warning = section(t('about.warning_title'), warningCopy);
    warning.classList.add('about-section--warning');
    const authorLink = element('a', 'about-author__link');
    authorLink.href = UI.ABOUT.AUTHOR_URL;
    authorLink.target = '_blank';
    authorLink.rel = 'noopener noreferrer';
    const badge = element('img', 'about-author__badge');
    badge.src = UI.ABOUT.AUTHOR_BADGE_URL;
    badge.alt = '';
    badge.loading = 'lazy';
    authorLink.appendChild(badge);
    // 保留文字入口，即使远端徽章图片无法加载也可操作。
    authorLink.appendChild(element('span', '', t('about.author_link')));
    const author = section(t('about.author_title'), [authorLink, element('p', 'about-description', t('about.author_thanks'))]);
    author.classList.add('about-section--author');
    container.append(back, hero, advantages, features, section(t('about.guide_title'), [guideList]),
        section(t('about.benefits_title'), [benefits]), warning, author);
    return container;
}

export async function showAboutInfo(currentUser) {
    const generation = versionGeneration;
    const view = createAboutView(formatVersionString(cachedVersionConfig || UI.DEFAULT_PROJECT_VERSION));
    window.dispatchEvent(new CustomEvent('comfy-route-view', { detail: { view } }));
    // 先显示完整页面，网络只补新原节点；不在请求完成后重新导航。
    getVersionConfig().then(config => {
        if (view.isConnected && generation === versionGeneration) {
            view.querySelector('.about-version').textContent = formatVersionString(config);
        }
    });
}
