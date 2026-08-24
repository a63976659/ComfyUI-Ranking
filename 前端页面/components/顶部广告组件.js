// 前端页面/components/顶部广告组件.js

import { api } from "../core/网络请求API.js";

// ========== 广告配置数据（默认值 / fallback） ==========
const BANNER_CONFIG = {
    // 横幅图片URL（支持GIF）
    bannerImage: "",
    // 广告标题
    title: "创世者计划",
    // 广告描述
    description: "100位优质创作者，瓜分平台未来两年收益",
    // 详情页内容（HTML字符串或纯文本）
    detailContent: "详细广告内容...",
    // 详情页大图
    detailImage: "",
    // 是否启用广告
    enabled: true
};

// 运行时配置（异步加载后更新）
let activeConfig = { ...BANNER_CONFIG };

// 模块级 banner 容器引用，供 refreshBanner() 使用
let bannerContainer = null;

// 本地缓存配置
const BANNER_CACHE_KEY = "ComfyRanking_BannerConfig";
const BANNER_CACHE_TTL = 60 * 60 * 1000; // 1小时缓存

/**
 * 读取本地广告配置缓存（非破坏性，不删除过期数据）
 * @returns {{ data: Object|null, fresh: boolean }} data 为缓存内容（无缓存为 null），fresh 表示是否仍在 TTL 内
 */
function readBannerCache() {
    try {
        const cached = localStorage.getItem(BANNER_CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            return { data: data || null, fresh: Date.now() - timestamp < BANNER_CACHE_TTL };
        }
    } catch (parseErr) {
        // 缓存数据损坏，清除
        localStorage.removeItem(BANNER_CACHE_KEY);
    }
    return { data: null, fresh: false };
}

/**
 * 后台静默同步广告配置：不阻塞首屏渲染
 * 成功后更新缓存并刷新 DOM；失败时保留当前已展示的内容
 */
async function syncBannerInBackground() {
    try {
        const res = await api.getPublicBannerConfig();
        if (res && res.status === "success") {
            if (res.data) {
                // 只缓存有效配置，不缓存 null（禁用后再启用可立即生效）
                localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify({
                    data: res.data,
                    timestamp: Date.now()
                }));
                activeConfig = { ...BANNER_CONFIG, ...res.data };
            } else {
                // 广告已禁用，清除旧缓存避免显示过期内容
                localStorage.removeItem(BANNER_CACHE_KEY);
                activeConfig = { ...BANNER_CONFIG };
            }
            updateBannerDOM();
        }
    } catch (e) {
        // 网络失败：保留当前展示内容（首屏已由缓存或默认值渲染）
        console.warn("后台更新广告配置失败（保留当前内容）:", e);
    }
}

/**
 * 创建顶部广告横幅组件
 * @returns {HTMLElement} 广告容器DOM（同步返回，内容异步填充）
 */
export function createTopBanner() {
    // 创建广告容器（初始隐藏，异步加载后决定是否显示）
    const container = document.createElement("div");
    Object.assign(container.style, {
        flex: "1",
        display: "none",
        justifyContent: "center",
        alignItems: "center",
        margin: "0 15px",
        maxHeight: "42px",
        overflow: "hidden",
        borderRadius: "6px",
        cursor: "pointer",
        transition: "opacity 0.2s"
    });

    // 保存模块级引用
    bannerContainer = container;

    // ⚡ 完全不阻塞首屏：先读本地缓存（过期也立即使用）并立即渲染，
    // 网络请求一律退到后台静默同步，保证断网/云端不通时横幅不受影响
    // （与插件榜/提示词等榜单的缓存优先策略一致）
    const { data: cachedData, fresh } = readBannerCache();
    if (cachedData) {
        activeConfig = { ...BANNER_CONFIG, ...cachedData };
        updateBannerDOM();
    }
    // 缓存新鲜则无需请求；过期或无缓存时后台静默同步
    if (!fresh) {
        syncBannerInBackground();
    }

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
    const img = document.createElement("img");
    img.src = activeConfig.bannerImage;
    img.alt = activeConfig.title || "广告";
    Object.assign(img.style, {
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain"
    });

    bannerContainer.appendChild(img);
    bannerContainer.style.display = "flex";

    // 鼠标悬停效果
    bannerContainer.onmouseover = () => { bannerContainer.style.opacity = "0.85"; };
    bannerContainer.onmouseout = () => { bannerContainer.style.opacity = "1"; };

    // 点击打开广告详情页
    bannerContainer.onclick = () => {
        const view = createBannerDetailView();
        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
    };
}

/**
 * 刷新顶部广告横幅（重新加载配置并更新DOM）
 */
export async function refreshBanner() {
    // 清除自定义缓存
    localStorage.removeItem(BANNER_CACHE_KEY);
    try {
        // 绕过请求级缓存，强制从服务器获取最新配置
        const res = await api.getPublicBannerConfig({ noCache: true });
        if (res && res.status === "success" && res.data) {
            activeConfig = { ...BANNER_CONFIG, ...res.data };
            // 更新本地缓存
            localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify({
                data: res.data,
                timestamp: Date.now()
            }));
        } else {
            activeConfig = { ...BANNER_CONFIG };
        }
    } catch (e) {
        console.warn("刷新广告配置失败", e);
    }
    updateBannerDOM();
}

/**
 * 创建广告详情页视图
 * @returns {HTMLElement} 详情页DOM
 */
function createBannerDetailView() {
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#1a1a1a",
        color: "#fff"
    });

    // 顶部返回栏
    const topBar = document.createElement("div");
    Object.assign(topBar.style, {
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid #333",
        flexShrink: "0"
    });

    const backBtn = document.createElement("button");
    Object.assign(backBtn.style, {
        marginLeft: "15px",
        marginTop: "20px",
        background: "rgba(51,51,51,0.8)",
        border: "1px solid rgba(85,85,85,0.8)",
        color: "#fff",
        cursor: "pointer",
        fontSize: "13px",
        padding: "6px 14px",
        borderRadius: "6px",
        fontWeight: "bold",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        transition: "0.2s"
    });
    backBtn.textContent = "⬅ 返回";
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

    const pageTitle = document.createElement("span");
    pageTitle.textContent = activeConfig.title || "广告详情";
    Object.assign(pageTitle.style, {
        marginLeft: "12px",
        fontSize: "16px",
        fontWeight: "bold"
    });

    topBar.appendChild(backBtn);
    topBar.appendChild(pageTitle);

    // 内容区（可滚动）
    const content = document.createElement("div");
    Object.assign(content.style, {
        flex: "1",
        overflowY: "auto",
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px"
    });

    // 广告标题
    if (activeConfig.title) {
        const titleEl = document.createElement("h2");
        titleEl.textContent = activeConfig.title;
        Object.assign(titleEl.style, {
            margin: "0",
            fontSize: "22px",
            fontWeight: "bold",
            textAlign: "center"
        });
        content.appendChild(titleEl);
    }

    // 广告描述
    if (activeConfig.description) {
        const descEl = document.createElement("p");
        descEl.textContent = activeConfig.description;
        Object.assign(descEl.style, {
            margin: "0",
            fontSize: "15px",
            color: "#aaa",
            textAlign: "center",
            lineHeight: "1.6"
        });
        content.appendChild(descEl);
    }

    // 广告大图
    if (activeConfig.detailImage) {
        const detailImg = document.createElement("img");
        detailImg.src = activeConfig.detailImage;
        detailImg.alt = activeConfig.title || "广告详情图";
        Object.assign(detailImg.style, {
            maxWidth: "100%",
            borderRadius: "8px"
        });
        content.appendChild(detailImg);
    }

    // 详细内容
    if (activeConfig.detailContent) {
        const detailEl = document.createElement("div");
        Object.assign(detailEl.style, {
            width: "100%",
            maxWidth: "600px",
            padding: "20px",
            backgroundColor: "#252525",
            borderRadius: "8px",
            lineHeight: "1.8",
            fontSize: "14px",
            color: "#ddd",
            whiteSpace: "pre-wrap",
            wordWrap: "break-word"
        });
        // 支持HTML内容
        detailEl.innerHTML = activeConfig.detailContent;
        content.appendChild(detailEl);
    }

    wrapper.appendChild(topBar);
    wrapper.appendChild(content);

    return wrapper;
}
