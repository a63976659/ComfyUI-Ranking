// 前端页面/components/UI交互提示组件.js
// ==========================================
// 🎨 UI 交互提示组件
// ==========================================
// 作用：提供统一的用户交互反馈组件
// 关联文件：
//   - 所有业务组件（调用提示函数）
//   - 网络请求API.js（错误处理）
// ==========================================
// 🎯 P1体验优化：
//   - 统一错误处理与重试机制
//   - 网络状态检测与离线提示
//   - 按钮加载状态
//   - 全局加载遮罩
// ==========================================


// ==========================================
// 📢 Toast 消息提示
// ==========================================
// 轻量级全局消息提示框，自动消失

// Toast 队列管理（避免重叠）
let toastQueue = [];
let toastOffset = 50;

/**
 * 显示 Toast 消息提示
 * @param {string} message - 提示内容
 * @param {string} type - 类型: 'info', 'success', 'error', 'warning'
 * @param {number} duration - 显示时长（毫秒），默认3000
 */
export function showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    const colors = { 
        success: "#4CAF50", 
        error: "#F44336", 
        info: "#2196F3", 
        warning: "#FF9800" 
    };
    const icons = { 
        success: "✅", 
        error: "❌", 
        info: "ℹ️", 
        warning: "⚠️" 
    };
    
    // 计算位置（避免重叠）
    const topPosition = toastOffset + toastQueue.length * 60;
    
    Object.assign(toast.style, {
        position: "fixed", 
        top: `${topPosition - 30}px`, 
        left: "50%", 
        transform: "translateX(-50%)",
        background: colors[type] || colors.info, 
        color: "#fff", 
        padding: "12px 24px",
        borderRadius: "8px", 
        fontSize: "14px", 
        fontWeight: "500", 
        zIndex: "10000",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)", 
        opacity: "0", 
        transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
        pointerEvents: "auto", 
        display: "flex", 
        alignItems: "center", 
        gap: "10px",
        maxWidth: "400px",
        wordBreak: "break-word"
    });

    toast.innerHTML = `
        <span style="font-size: 16px;">${icons[type] || icons.info}</span>
        <span style="flex: 1;">${message}</span>
        <span class="toast-close" style="cursor: pointer; opacity: 0.7; font-size: 18px; margin-left: 8px;">×</span>
    `;
    
    document.body.appendChild(toast);
    toastQueue.push(toast);
    
    // 点击关闭
    toast.querySelector(".toast-close").onclick = () => closeToast(toast);
    
    // 入场动画
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.top = `${topPosition}px`;
    });

    // 自动关闭
    const autoCloseTimer = setTimeout(() => closeToast(toast), duration);
    toast._autoCloseTimer = autoCloseTimer;
}

function closeToast(toast) {
    if (toast._autoCloseTimer) clearTimeout(toast._autoCloseTimer);
    
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-20px)";
    
    setTimeout(() => {
        toast.remove();
        const idx = toastQueue.indexOf(toast);
        if (idx > -1) toastQueue.splice(idx, 1);
    }, 300);
}


// ==========================================
// ⚠️ 确认对话框
// ==========================================

/**
 * 显示确认对话框
 * @param {string} message - 确认信息内容
 * @param {Object} options - 配置选项
 * @param {string} options.title - 标题，默认"操作确认"
 * @param {string} options.confirmText - 确认按钮文字
 * @param {string} options.cancelText - 取消按钮文字
 * @param {string} options.type - 类型: 'warning', 'danger', 'info'
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, options = {}) {
    const {
        title = "操作确认",
        confirmText = "确认执行",
        cancelText = "取消",
        type = "warning"
    } = options;
    
    const typeConfig = {
        warning: { icon: "⚠️", color: "#FF9800", btnColor: "#FF9800" },
        danger: { icon: "🚨", color: "#F44336", btnColor: "#F44336" },
        info: { icon: "ℹ️", color: "#2196F3", btnColor: "#2196F3" }
    };
    const config = typeConfig[type] || typeConfig.warning;
    
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.6)", zIndex: "10001", display: "flex",
            alignItems: "center", justifyContent: "center", backdropFilter: "blur(3px)",
            opacity: "0", transition: "opacity 0.2s"
        });

        const box = document.createElement("div");
        Object.assign(box.style, {
            background: "#222", border: "1px solid #444", borderRadius: "12px",
            padding: "24px", width: "360px", maxWidth: "90vw", color: "#fff", 
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "16px", 
            transform: "scale(0.9) translateY(-20px)", transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)"
        });

        box.innerHTML = `
            <div style="font-size: 18px; font-weight: bold; color: ${config.color}; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">${config.icon}</span>
                <span>${title}</span>
            </div>
            <div style="font-size: 14px; color: #ccc; line-height: 1.7; padding: 8px 0;">${message}</div>
            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
                <button id="ui-btn-cancel" style="padding: 10px 20px; background: transparent; border: 1px solid #555; color: #aaa; border-radius: 6px; cursor: pointer; transition: 0.2s; font-size: 14px;">${cancelText}</button>
                <button id="ui-btn-confirm" style="padding: 10px 20px; background: ${config.btnColor}; border: none; color: #fff; border-radius: 6px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 8px ${config.btnColor}44; transition: 0.2s; font-size: 14px;">${confirmText}</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // 入场动画
        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            box.style.transform = "scale(1) translateY(0)";
        });

        const close = (result) => {
            overlay.style.opacity = "0";
            box.style.transform = "scale(0.9) translateY(-20px)";
            setTimeout(() => { overlay.remove(); resolve(result); }, 200);
        };

        // ESC 键关闭
        const handleKeydown = (e) => {
            if (e.key === "Escape") {
                document.removeEventListener("keydown", handleKeydown);
                close(false);
            }
        };
        document.addEventListener("keydown", handleKeydown);

        box.querySelector("#ui-btn-cancel").onclick = () => {
            document.removeEventListener("keydown", handleKeydown);
            close(false);
        };
        box.querySelector("#ui-btn-confirm").onclick = () => {
            document.removeEventListener("keydown", handleKeydown);
            close(true);
        };
    });
}


// ==========================================
// 🔄 错误重试对话框
// ==========================================

/**
 * 显示错误重试对话框
 * @param {string} message - 错误信息
 * @param {Function} retryFn - 重试函数
 * @param {Object} options - 配置选项
 * @returns {Promise<boolean>} - 用户选择重试返回true
 */
export function showRetryDialog(message, retryFn, options = {}) {
    const {
        title = "操作失败",
        retryText = "🔄 重试",
        cancelText = "关闭"
    } = options;
    
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.7)", zIndex: "10001", display: "flex",
            alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
            opacity: "0", transition: "opacity 0.2s"
        });

        const box = document.createElement("div");
        Object.assign(box.style, {
            background: "linear-gradient(145deg, #2a2a2a, #1f1f1f)", 
            border: "1px solid #444", 
            borderRadius: "16px",
            padding: "28px", 
            width: "400px", 
            maxWidth: "90vw", 
            color: "#fff",
            boxShadow: "0 15px 50px rgba(0,0,0,0.5)",
            display: "flex", 
            flexDirection: "column", 
            gap: "20px",
            transform: "scale(0.9)", 
            transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
        });

        box.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">😕</div>
                <div style="font-size: 20px; font-weight: bold; color: #F44336;">${title}</div>
            </div>
            <div style="font-size: 14px; color: #bbb; line-height: 1.7; text-align: center; padding: 0 10px; background: #1a1a1a; border-radius: 8px; padding: 16px;">
                ${message}
            </div>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="ui-btn-cancel" style="flex: 1; padding: 12px 20px; background: #333; border: 1px solid #555; color: #aaa; border-radius: 8px; cursor: pointer; transition: 0.2s; font-size: 14px;">${cancelText}</button>
                <button id="ui-btn-retry" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #2196F3, #1976D2); border: none; color: #fff; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; font-size: 14px;">${retryText}</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            box.style.transform = "scale(1)";
        });

        const close = () => {
            overlay.style.opacity = "0";
            box.style.transform = "scale(0.9)";
            setTimeout(() => overlay.remove(), 200);
        };

        box.querySelector("#ui-btn-cancel").onclick = () => {
            close();
            resolve(false);
        };
        
        box.querySelector("#ui-btn-retry").onclick = async () => {
            const retryBtn = box.querySelector("#ui-btn-retry");
            retryBtn.innerHTML = `<span class="btn-spinner"></span> 重试中...`;
            retryBtn.disabled = true;
            
            try {
                await retryFn();
                close();
                resolve(true);
            } catch (error) {
                // 重试失败，更新错误信息
                box.querySelector("div[style*='background: #1a1a1a']").innerHTML = error.message || "重试失败，请稍后再试";
                retryBtn.innerHTML = retryText;
                retryBtn.disabled = false;
            }
        };
    });
}


// ==========================================
// 🌐 网络状态检测
// ==========================================

let isOffline = !navigator.onLine;
let offlineBanner = null;

/**
 * 初始化网络状态监听
 */
export function initNetworkStatusListener() {
    window.addEventListener("online", () => {
        isOffline = false;
        hideOfflineBanner();
        showToast("网络已恢复", "success");
    });
    
    window.addEventListener("offline", () => {
        isOffline = true;
        showOfflineBanner();
    });
    
    // 初始状态检测
    if (!navigator.onLine) {
        showOfflineBanner();
    }
}

function showOfflineBanner() {
    if (offlineBanner) return;
    
    offlineBanner = document.createElement("div");
    Object.assign(offlineBanner.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        right: "0",
        background: "linear-gradient(135deg, #FF5722, #E64A19)",
        color: "#fff",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        fontSize: "14px",
        fontWeight: "500",
        zIndex: "9999",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
        transform: "translateY(100%)",
        transition: "transform 0.3s ease"
    });
    
    offlineBanner.innerHTML = `
        <span style="font-size: 18px;">📡</span>
        <span>网络连接已断开，部分功能可能不可用</span>
        <button onclick="location.reload()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 12px;">刷新重试</button>
    `;
    
    document.body.appendChild(offlineBanner);
    
    requestAnimationFrame(() => {
        offlineBanner.style.transform = "translateY(0)";
    });
}

function hideOfflineBanner() {
    if (!offlineBanner) return;
    
    offlineBanner.style.transform = "translateY(100%)";
    setTimeout(() => {
        offlineBanner?.remove();
        offlineBanner = null;
    }, 300);
}

/**
 * 检查网络状态
 * @returns {boolean} - 是否在线
 */
export function checkOnline() {
    return navigator.onLine;
}


// ==========================================
// ⏳ 全局加载遮罩
// ==========================================

let loadingOverlay = null;
let loadingCount = 0;

/**
 * 显示全局加载遮罩
 * @param {string} message - 加载提示文字
 */
export function showLoading(message = "加载中...") {
    loadingCount++;
    
    if (loadingOverlay) {
        // 更新文字
        const textEl = loadingOverlay.querySelector(".loading-text");
        if (textEl) textEl.textContent = message;
        return;
    }
    
    loadingOverlay = document.createElement("div");
    Object.assign(loadingOverlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        zIndex: "10002",
        opacity: "0",
        transition: "opacity 0.2s"
    });
    
    loadingOverlay.innerHTML = `
        <div class="loading-spinner" style="width: 48px; height: 48px; border: 4px solid #333; border-top-color: #2196F3; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div class="loading-text" style="color: #fff; font-size: 14px; font-weight: 500;">${message}</div>
    `;
    
    // 添加旋转动画样式
    if (!document.getElementById("loading-spinner-style")) {
        const style = document.createElement("style");
        style.id = "loading-spinner-style";
        style.textContent = `
            @keyframes spin { to { transform: rotate(360deg); } }
            .btn-spinner {
                display: inline-block;
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255,255,255,0.3);
                border-top-color: #fff;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin-right: 6px;
                vertical-align: middle;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(loadingOverlay);
    
    requestAnimationFrame(() => {
        loadingOverlay.style.opacity = "1";
    });
}

/**
 * 隐藏全局加载遮罩
 */
export function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    
    if (loadingCount > 0 || !loadingOverlay) return;
    
    loadingOverlay.style.opacity = "0";
    setTimeout(() => {
        loadingOverlay?.remove();
        loadingOverlay = null;
    }, 200);
}


// ==========================================
// 🔘 按钮加载状态
// ==========================================

/**
 * 设置按钮为加载状态
 * @param {HTMLButtonElement} button - 按钮元素
 * @param {boolean} loading - 是否加载中
 * @param {string} loadingText - 加载时显示的文字
 */
export function setButtonLoading(button, loading, loadingText = "处理中...") {
    if (!button) return;
    
    if (loading) {
        // 保存原始状态
        button._originalHTML = button.innerHTML;
        button._originalDisabled = button.disabled;
        
        button.disabled = true;
        button.style.opacity = "0.7";
        button.style.cursor = "not-allowed";
        button.innerHTML = `<span class="btn-spinner"></span>${loadingText}`;
    } else {
        // 恢复原始状态
        button.disabled = button._originalDisabled || false;
        button.style.opacity = "";
        button.style.cursor = "";
        if (button._originalHTML) {
            button.innerHTML = button._originalHTML;
        }
    }
}


// ==========================================
// 📋 复制到剪贴板
// ==========================================

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @param {string} successMsg - 成功提示
 */
export async function copyToClipboard(text, successMsg = "已复制到剪贴板") {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            // 降级方案
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.cssText = "position: fixed; opacity: 0;";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }
        showToast(successMsg, "success");
    } catch (error) {
        showToast("复制失败", "error");
    }
}


// ==========================================
// 🎯 快捷操作包装器
// ==========================================

/**
 * 包装异步操作，自动处理加载状态和错误
 * @param {Function} asyncFn - 异步函数
 * @param {Object} options - 配置选项
 * @returns {Promise<any>}
 */
export async function withFeedback(asyncFn, options = {}) {
    const {
        loadingMsg = "处理中...",
        successMsg = "操作成功",
        errorMsg = "操作失败",
        showLoadingOverlay = false,
        button = null
    } = options;
    
    // 显示加载状态
    if (showLoadingOverlay) {
        showLoading(loadingMsg);
    }
    if (button) {
        setButtonLoading(button, true, loadingMsg);
    }
    
    try {
        const result = await asyncFn();
        
        if (successMsg) {
            showToast(successMsg, "success");
        }
        
        return result;
    } catch (error) {
        const msg = error.message || errorMsg;
        showToast(msg, "error");
        throw error;
    } finally {
        if (showLoadingOverlay) {
            hideLoading();
        }
        if (button) {
            setButtonLoading(button, false);
        }
    }
}


// ==========================================
// 🚀 自动初始化
// ==========================================

// 页面加载时初始化网络状态监听
if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initNetworkStatusListener);
    } else {
        initNetworkStatusListener();
    }
}
