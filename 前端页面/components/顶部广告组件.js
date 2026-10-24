// 前端页面/components/顶部广告组件.js

import { api } from "../core/网络请求API.js";
import { API, CACHE } from "../core/全局配置.js";
import { getCompleteImageUrl } from "../core/网络请求_图片代理.js";
import { t } from "./用户体验_国际化.js";

// ========== 广告配置数据（默认值 / fallback） ==========
const BANNER_CONFIG = {
    // 横幅图片URL（支持GIF）
    bannerImage: "",
    // 广告标题
    title: "",
    // 广告描述
    description: "",
    // 详情页内容（HTML字符串或纯文本）
    detailContent: "",
    // 详情页大图
    detailImage: "",
    // 是否启用广告
    enabled: false
};

// 运行时配置（异步加载后更新）
let activeConfig = { ...BANNER_CONFIG };

// 模块级 banner 容器引用，供 refreshBanner() 使用
let bannerContainer = null;

// 本地缓存配置
const BANNER_CACHE_KEY = CACHE.LOCAL_KEYS.BANNER_CONFIG;
let bannerSyncGeneration = 0;
let bannerSyncController = null;
let hasActiveConfig = false;
// 保留已下载的横幅节点，提交时直接显示，避免重新赋值 src 再次联网。
let activeBannerImage = null;

/** 缓存与云端共用配置结构检查，异常结果不能覆盖已有横幅。 */
function validateBannerConfig(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid banner configuration");
    }
    if (typeof data.enabled !== "boolean") throw new Error("Invalid banner enabled state");
    for (const field of ["bannerImage", "title", "description", "detailContent", "detailImage"]) {
        if (data[field] !== undefined && typeof data[field] !== "string") {
            throw new Error("Invalid banner field type");
        }
    }
    const config = { ...BANNER_CONFIG, ...data };
    if (config.enabled && !config.bannerImage.trim()) throw new Error("Missing banner image");
    return config;
}

/**
 * 读取本地广告配置缓存（非破坏性，不删除过期数据）
 * @returns {Object|null} data 为缓存内容，无缓存时为 null
 */
function readBannerCache() {
    let cached;
    try {
        cached = localStorage.getItem(BANNER_CACHE_KEY);
    } catch (storageError) {
        // 无法读取不代表缓存损坏；保留未确认的数据，等待存储恢复。
        return null;
    }
    if (!cached) return null;
    try {
        const { data } = JSON.parse(cached);
        return validateBannerConfig(data);
    } catch (parseError) {
        // 只有已经读到且确认无效的配置才清除。
        try {
            localStorage.removeItem(BANNER_CACHE_KEY);
        } catch (storageError) {
            console.warn("广告缓存不可清理，继续使用默认显示流程");
        }
    }
    return null;
}

/** 确认新配置引用的图片均可下载后，再允许替换当前横幅。 */
function preloadImage(url, signal) {
    if (!url) return Promise.resolve();
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const image = new Image();
        let settled = false;
        let timer = null;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            image.onload = null;
            image.onerror = null;
            if (error) {
                image.removeAttribute("src");
                reject(error);
            } else resolve(image);
        };
        const onAbort = () => finish(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => finish(new Error("Banner image loading timed out")), API.BANNER_IMAGE_TIMEOUT);
        image.onload = () => finish();
        image.onerror = () => finish(new Error("Banner image download failed"));
        try {
            image.src = url;
        } catch (error) {
            finish(error);
        }
    });
}

async function prepareBannerConfig(data, signal) {
    // 只有明确的 null 表示服务端关闭广告；缺失或异常数据视为更新失败。
    if (data === null) return { config: { ...BANNER_CONFIG }, image: null };
    const config = validateBannerConfig(data);
    if (!config.enabled) return { config, image: null };
    // 新配置在本地缓存中保留已下载的代理地址；旧缓存直链仍按原流程立即显示。
    config.bannerImage = getCompleteImageUrl(config.bannerImage);
    config.detailImage = getCompleteImageUrl(config.detailImage);
    const [image] = await Promise.all([
        preloadImage(config.bannerImage, signal),
        preloadImage(config.detailImage, signal)
    ]);
    return { config, image };
}

/**
 * 后台静默同步广告配置：不阻塞首屏渲染
 * 成功后更新缓存并刷新 DOM；失败时保留当前已展示的内容
 */
async function syncBannerInBackground() {
    const generation = ++bannerSyncGeneration;
    bannerSyncController?.abort();
    const controller = new AbortController();
    bannerSyncController = controller;
    try {
        // 绕过请求层缓存，确保拿到的确实是后台新配置。
        const res = await api.getPublicBannerConfig({
            noCache: true, timeout: API.BACKGROUND_TIMEOUT, retries: API.BACKGROUND_RETRIES
        });
        if (res && res.status === "success") {
            if (generation !== bannerSyncGeneration) return;
            const prepared = await prepareBannerConfig(res.data, controller.signal);
            const nextConfig = prepared.config;
            // 图片加载期间可能又发起了一次刷新，只让最新请求提交结果。
            if (generation !== bannerSyncGeneration) return;
            if (res.data) {
                try {
                    localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify({
                        data: nextConfig,
                        timestamp: Date.now()
                    }));
                } catch (storageError) {
                    console.warn("新广告配置无法写入本地缓存，仍显示已下载的新内容");
                }
            } else {
                // 服务端明确返回无配置，作为成功的新结果清除旧配置。
                try {
                    localStorage.removeItem(BANNER_CACHE_KEY);
                } catch (storageError) {
                    console.warn("无法清除本地广告缓存，仍应用服务端的无广告状态");
                }
            }
            activeConfig = nextConfig;
            activeBannerImage = prepared.image;
            hasActiveConfig = true;
            updateBannerDOM();
        }
    } catch (e) {
        // 网络失败或图片下载失败：不写缓存、不替换当前已显示的缓存横幅。
        if (!controller.signal.aborted) console.warn("后台更新广告配置失败（保留当前内容）");
    } finally {
        controller.abort();
        if (bannerSyncController === controller) bannerSyncController = null;
    }
}

/**
 * 创建顶部广告横幅组件
 * @returns {HTMLElement} 广告容器DOM（同步返回，内容异步填充）
 */
export function createTopBanner() {
    // 创建广告容器（初始隐藏，异步加载后决定是否显示）
    const container = document.createElement("button");
    container.type = "button";
    container.className = "top-banner";
    container.style.display = "none";

    // 保存模块级引用
    bannerContainer = container;

    // ⚡ 完全不阻塞首屏：先读本地缓存（过期也立即使用）并立即渲染，
    // 网络请求一律退到后台静默同步，保证断网/云端不通时横幅不受影响
    // （与插件榜/提示词等榜单的缓存优先策略一致）
    if (!hasActiveConfig) {
        const cachedData = readBannerCache();
        if (cachedData) {
            activeConfig = cachedData;
            hasActiveConfig = true;
        }
    }
    updateBannerDOM();
    // 始终在后台尝试获取新配置；当前缓存先显示，成功且图片下载完成后再整体替换。
    syncBannerInBackground();

    return container;
}

/**
 * 根据 activeConfig 更新 banner 容器 DOM 内容
 */
function updateBannerDOM() {
    if (!bannerContainer) return;

    // 清空现有内容
    bannerContainer.innerHTML = "";

    // 未启用或无横幅图片时不显示
    if (!activeConfig.enabled || !activeConfig.bannerImage) {
        bannerContainer.style.display = "none";
        return;
    }

    // 创建横幅图片
    const img = activeBannerImage || document.createElement("img");
    if (!activeBannerImage) img.src = activeConfig.bannerImage;
    img.alt = activeConfig.title || t("common.advertisement");
    bannerContainer.setAttribute("aria-label", activeConfig.title || t("common.advertisement"));
    img.className = "top-banner__image";

    bannerContainer.appendChild(img);
    bannerContainer.style.display = "flex";

    // 点击打开广告详情页
    const openBannerDetail = () => {
        const view = createBannerDetailView();
        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
    };
    bannerContainer.onclick = openBannerDetail;
}

const BANNER_ALLOWED_TAGS = new Set([
    "a", "b", "blockquote", "br", "code", "em", "h2", "h3", "h4",
    "hr", "i", "li", "ol", "p", "pre", "s", "strong", "u", "ul"
]);
const BANNER_BLOCKED_TAGS = new Set([
    "audio", "button", "embed", "form", "iframe", "img", "input", "math",
    "object", "script", "style", "svg", "textarea", "video"
]);

/** Copy only simple formatting and safe HTTP(S) links from administrator-provided content. */
function sanitizeBannerDetailContent(value) {
    const source = new DOMParser().parseFromString(String(value ?? ""), "text/html");
    const fragment = document.createDocumentFragment();

    const copyNodes = (sourceNode, targetNode) => {
        for (const node of sourceNode.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                targetNode.appendChild(document.createTextNode(node.nodeValue || ""));
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const tag = node.tagName.toLowerCase();
            if (BANNER_BLOCKED_TAGS.has(tag)) continue;
            if (!BANNER_ALLOWED_TAGS.has(tag)) {
                copyNodes(node, targetNode);
                continue;
            }

            const cleanElement = document.createElement(tag);
            if (tag === "a") {
                const rawHref = node.getAttribute("href");
                try {
                    if (!rawHref?.trim()) throw new Error("Missing link target");
                    const url = new URL(rawHref.trim(), document.baseURI);
                    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
                        cleanElement.href = url.href;
                        cleanElement.target = "_blank";
                        cleanElement.rel = "noopener noreferrer";
                    }
                } catch (_) {
                    // Invalid links keep their label but receive no navigable href.
                }
            }
            targetNode.appendChild(cleanElement);
            copyNodes(node, cleanElement);
        }
    };

    copyNodes(source.body, fragment);
    return fragment;
}

/**
 * 刷新顶部广告横幅（重新加载配置并更新DOM）
 */
export async function refreshBanner() {
    // 手动刷新也保留当前缓存横幅，直到新配置和图片都准备好。
    await syncBannerInBackground();
}

/**
 * 创建广告详情页视图
 * @returns {HTMLElement} 详情页DOM
 */
function createBannerDetailView() {
    const wrapper = document.createElement("div");
    wrapper.className = "banner-detail";

    const topBar = document.createElement("div");
    topBar.className = "banner-detail__header";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "about-back banner-detail__back";
    backBtn.textContent = `⬅ ${t("common.back")}`;
    backBtn.onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    const pageTitle = document.createElement("h2");
    pageTitle.className = "banner-detail__heading";
    pageTitle.textContent = activeConfig.title || t("common.advertisement_details");
    topBar.appendChild(backBtn);
    topBar.appendChild(pageTitle);

    const content = document.createElement("div");
    content.className = "banner-detail__content";

    if (activeConfig.title) {
        const titleEl = document.createElement("h2");
        titleEl.className = "banner-detail__title";
        titleEl.textContent = activeConfig.title;
        content.appendChild(titleEl);
    }

    if (activeConfig.description) {
        const descEl = document.createElement("p");
        descEl.className = "banner-detail__description";
        descEl.textContent = activeConfig.description;
        content.appendChild(descEl);
    }

    if (activeConfig.detailImage) {
        const detailImg = document.createElement("img");
        detailImg.className = "banner-detail__image";
        detailImg.src = activeConfig.detailImage;
        detailImg.alt = activeConfig.title || t("common.advertisement_details_image");
        content.appendChild(detailImg);
    }

    if (activeConfig.detailContent) {
        const detailEl = document.createElement("div");
        detailEl.className = "banner-detail__rich-content";
        detailEl.replaceChildren(sanitizeBannerDetailContent(activeConfig.detailContent));
        content.appendChild(detailEl);
    }

    wrapper.appendChild(topBar);
    wrapper.appendChild(content);
    return wrapper;
}
