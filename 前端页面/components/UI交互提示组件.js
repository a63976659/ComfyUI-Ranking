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
//   - 按钮加载状态
//   - 全局加载遮罩
// 🌐 网络状态检测与离线横幅已收敛至 core/状态管理.js（见下方说明），本模块不再负责
// ===========================================

import { t } from "./用户体验增强.js";
import { escapeHtml, UI } from "../core/全局配置.js";

// ==========================================
// 📢 Toast 消息提示
// ==========================================
// 轻量级全局消息提示框，自动消失

// Toast 队列管理（避免重叠）
let toastQueue = [];
let toastObserver = null;
let toastSizeObserver = null;
let toastPointer = null;
let toastPointerListening = false;

function isToastHovered(toast) {
    if (!toastPointer) return false;
    const bounds = toast.getBoundingClientRect();
    return toastPointer.x >= bounds.left && toastPointer.x < bounds.right &&
        toastPointer.y >= bounds.top && toastPointer.y < bounds.bottom;
}

function updateToastHover() {
    const states = toastQueue.map(isToastHovered);
    toastQueue.forEach((toast, index) => toast._setToastHovered?.(states[index]));
}

function handleToastPointer(event) {
    if (event.pointerType === "touch") return;
    toastPointer = { x: event.clientX, y: event.clientY };
    updateToastHover();
}

function clearToastPointer() {
    toastPointer = null;
    updateToastHover();
}

function observeToastPointer() {
    if (toastPointerListening) return;
    toastPointerListening = true;
    document.addEventListener("pointermove", handleToastPointer, { passive: true });
    document.addEventListener("pointerleave", clearToastPointer);
    window.addEventListener("blur", clearToastPointer);
}
let dialogInstanceId = 0;
const dialogStack = [];

function repositionToasts() {
    const heights = toastQueue.map(toast => toast.offsetHeight);
    let top = UI.TOAST.OFFSET;
    toastQueue.forEach((toast, index) => {
        toast.style.top = `${top}px`;
        top += heights[index] + UI.TOAST.GAP;
    });
    updateToastHover();
}

function observeToastSize(toast) {
    if (typeof ResizeObserver !== "function") return;
    if (!toastSizeObserver) toastSizeObserver = new ResizeObserver(repositionToasts);
    toastSizeObserver.observe(toast);
}


function releaseToast(toast) {
    toast._toastReleased = true;
    toastSizeObserver?.unobserve(toast);
    if (toast._autoCloseTimer != null) clearTimeout(toast._autoCloseTimer);
    if (toast._closeTimer != null) clearTimeout(toast._closeTimer);
    if (toast._entryFrame != null) cancelAnimationFrame(toast._entryFrame);
    toast._autoCloseTimer = null;
    toast._closeTimer = null;
    toast._entryFrame = null;
    toast._previousFocus = null;
    toast._cleanupToastEvents?.();
    toast._cleanupToastEvents = null;
    toast._setToastHovered = null;
    const index = toastQueue.indexOf(toast);
    if (index > -1) toastQueue.splice(index, 1);
    repositionToasts();
    if (!toastQueue.length) {
        toastObserver?.disconnect();
        toastObserver = null;
        toastSizeObserver?.disconnect();
        toastSizeObserver = null;
        document.removeEventListener("pointermove", handleToastPointer);
        document.removeEventListener("pointerleave", clearToastPointer);
        window.removeEventListener("blur", clearToastPointer);
        toastPointerListening = false;
        toastPointer = null;
    }
}

function observeToastRemoval() {
    if (toastObserver) return;
    toastObserver = new MutationObserver(() => {
        for (const toast of [...toastQueue]) if (!toast.isConnected) releaseToast(toast);
    });
    toastObserver.observe(document.body, { childList: true });
}

function reserveToastSlot() {
    while (toastQueue.length >= UI.TOAST.MAX_VISIBLE) {
        const candidate = toastQueue.find(toast => !toast.contains(document.activeElement) && !isToastHovered(toast))
            || toastQueue.find(toast => !toast.contains(document.activeElement));
        if (!candidate) return false;
        candidate.remove();
        releaseToast(candidate);
    }
    return true;
}

/**
 * 显示 Toast 消息提示
 * @param {string} message - 提示内容
 * @param {string} type - 类型: 'info', 'success', 'error', 'warning'
 * @param {number} duration - 显示时长（毫秒），默认3000
 */
export function showToast(message, type = "info", duration = 3000) {
    if (!reserveToastSlot()) return;
    const previousFocus = document.activeElement;
    const toast = document.createElement("div");
    const safeType = ["success", "error", "warning", "info"].includes(type) ? type : "info";
    toast.className = `comfy-ranking-toast comfy-ranking-toast--${safeType}`;
    toast.setAttribute("role", safeType === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", safeType === "error" ? "assertive" : "polite");
    toast.setAttribute("aria-atomic", "true");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) toast.classList.add("comfy-ranking-toast--reduced-motion");
    // 新提示从目标位置上方滑入；关闭后再按当前队列位置重排。
    toast.style.top = `${UI.TOAST.OFFSET + toastQueue.reduce((height, item) => height + item.offsetHeight + UI.TOAST.GAP, 0) - 30}px`;

    // 提示文本统一转义：message 常携带昵称/标题/后端报错等用户可控内容，
    // 全库无任何调用方故意向 showToast 传 HTML 标签，故无条件转义不会改变现有显示效果。
    const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
    toast.innerHTML = `
        <span class="comfy-ranking-toast__icon" aria-hidden="true">${icons[safeType]}</span>
        <span class="comfy-ranking-toast__message">${escapeHtml(message)}</span>
        <button type="button" class="toast-close comfy-ranking-toast__close" aria-label="${escapeHtml(t('common.close'))}">×</button>
    `;
    
    toast._previousFocus = previousFocus;
    document.body.appendChild(toast);
    toastQueue.push(toast);
    observeToastRemoval();
    observeToastSize(toast);
    
    // 点击关闭
    const closeButton = toast.querySelector(".toast-close");
    const handleClose = () => closeToast(toast);
    closeButton.addEventListener("click", handleClose);
    
    // 入场动画
    toast._entryFrame = requestAnimationFrame(() => {
        toast._entryFrame = null;
        if (toast._toastReleased || !toast.isConnected || toast.classList.contains("comfy-ranking-toast--closing")) return;
        toast.style.opacity = "1";
        repositionToasts();
    });

    let remaining = Number(duration);
    let deadline = 0;
    let hovered = false;
    const pauseTimer = () => {
        if (toast._autoCloseTimer == null) return;
        clearTimeout(toast._autoCloseTimer);
        toast._autoCloseTimer = null;
        remaining = Math.max(0, deadline - performance.now());
    };
    const resumeTimer = () => {
        if (toast._toastReleased || hovered || toast.contains(document.activeElement) || !toast.isConnected ||
                toast.classList.contains("comfy-ranking-toast--closing") || toast._autoCloseTimer != null) return;
        deadline = performance.now() + remaining;
        toast._autoCloseTimer = setTimeout(() => closeToast(toast), remaining);
    };
    toast._setToastHovered = value => {
        if (hovered === value) return;
        hovered = value;
        if (hovered) pauseTimer();
        else resumeTimer();
    };
    const handleFocusOut = event => {
        if (!toast.contains(event.relatedTarget)) queueMicrotask(resumeTimer);
    };
    toast.addEventListener("focusin", pauseTimer);
    toast.addEventListener("focusout", handleFocusOut);
    toast._cleanupToastEvents = () => {
        closeButton.removeEventListener("click", handleClose);
        toast.removeEventListener("focusin", pauseTimer);
        toast.removeEventListener("focusout", handleFocusOut);
    };
    observeToastPointer();
    updateToastHover();
    resumeTimer();
}

function closeToast(toast) {
    if (!toast || toast._toastReleased) return;
    if (!toast.isConnected) { releaseToast(toast); return; }
    if (toast.classList.contains("comfy-ranking-toast--closing")) return;
    if (toast._autoCloseTimer != null) clearTimeout(toast._autoCloseTimer);
    toast._autoCloseTimer = null;
    
    toast.classList.add("comfy-ranking-toast--closing");
    
    toast._closeTimer = setTimeout(() => {
        const restore = toast.contains(document.activeElement);
        const previousFocus = toast._previousFocus;
        toast.remove();
        releaseToast(toast);
        if (restore && previousFocus?.isConnected) previousFocus.focus();
    }, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 300);
}


// ==========================================
// ⚠️ 对话框辅助函数（内部复用）
// ==========================================

/**
 * 创建对话框遮罩层
 * @param {number} bgOpacity - 背景透明度
 * @param {number} blurPx - 模糊值（px）
 * @returns {HTMLElement}
 */
function _createDialogOverlay(bgOpacity = 0.6, blurPx = 3) {
    const overlay = document.createElement("div");
    overlay.className = "comfy-ranking-dialog-overlay";
    overlay.style.setProperty("--dialog-overlay-opacity", String(bgOpacity));
    overlay.style.setProperty("--dialog-blur", `${blurPx}px`);
    return overlay;
}

/**
 * 创建对话框主体容器
 * @param {string} width - 宽度，如 "360px"
 * @param {string} [background] - 背景色
 * @param {string} [borderRadius] - 圆角
 * @param {string} [padding] - 内边距
 * @param {string} [boxShadow] - 阴影
 * @param {string} [gap] - flex gap
 * @param {string} [transformOrigin] - 变换基点（影响初始 transform）
 * @returns {HTMLElement}
 */
function _createDialogBox({ width = "360px", background = "var(--comfy-menu-bg, #222)", borderRadius = "12px", padding = "24px", boxShadow = "0 10px 40px rgba(0,0,0,0.5)", gap = "16px", hasYTranslate = true } = {}) {
    const box = document.createElement("div");
    box.className = "comfy-ranking-dialog";
    box.dataset.motion = hasYTranslate ? "translate" : "scale";
    box.style.setProperty("--dialog-width", width);
    box.style.setProperty("--dialog-background", background);
    box.style.setProperty("--dialog-radius", borderRadius);
    box.style.setProperty("--dialog-padding", padding);
    box.style.setProperty("--dialog-shadow", boxShadow);
    box.style.setProperty("--dialog-gap", gap);
    return box;
}

/**
 * 播放对话框入场动画
 * @param {HTMLElement} overlay
 * @param {HTMLElement} box
 * @param {boolean} hasYTranslate - 是否包含 Y 轴位移
 */
function _showDialogAnimation(overlay, box, hasYTranslate = true) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        overlay.style.opacity = "1";
        box.style.transform = hasYTranslate ? "scale(1) translateY(0)" : "scale(1)";
        return;
    }
    requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        box.style.transform = hasYTranslate ? "scale(1) translateY(0)" : "scale(1)";
    });
}

/**
 * 关闭对话框并移除 DOM
 * @param {HTMLElement} overlay
 * @param {HTMLElement} box
 * @param {boolean} hasYTranslate
 * @param {Function} [callback] - 关闭完成后的回调
 */
function _closeDialog(overlay, box, hasYTranslate = true, callback) {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) {
        overlay.style.transition = "none";
        box.style.transition = "none";
    }
    overlay.style.opacity = "0";
    box.style.transform = hasYTranslate ? "scale(0.9) translateY(-20px)" : "scale(0.9)";
    setTimeout(() => { overlay.remove(); if (callback) callback(); }, reduceMotion ? 0 : 200);
}

/** 为共用弹窗提供模态语义、焦点约束与关闭后的焦点恢复。 */
function _setupDialogAccessibility(box, titleId, descriptionId, initialFocusSelector, onEscape) {
    const previousFocus = document.activeElement;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", titleId);
    if (descriptionId) box.setAttribute("aria-describedby", descriptionId);
    else box.removeAttribute("aria-describedby");
    box.setAttribute("tabindex", "-1");

    const getFocusable = () => Array.from(box.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.tabIndex >= 0 && !element.closest('[inert], [hidden], [aria-hidden="true"]')
        && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");

    const handleKeydown = event => {
        if (dialogStack[dialogStack.length - 1] !== box) return;
        if (event.key === "Escape") {
            event.preventDefault();
            onEscape();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = getFocusable();
        if (!focusable.length) {
            event.preventDefault();
            box.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    };
    dialogStack.push(box);
    document.addEventListener("keydown", handleKeydown);
    const focusable = getFocusable();
    const requestedFocus = box.querySelector(initialFocusSelector);
    const initialFocus = focusable.includes(requestedFocus) ? requestedFocus : focusable[0] || box;
    initialFocus.focus();

    return {
        cleanup() {
            document.removeEventListener("keydown", handleKeydown);
            const stackIndex = dialogStack.lastIndexOf(box);
            if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
        },
        restoreFocus() {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        }
    };
}

// 业务弹窗复用相同的模态栈、焦点循环与恢复行为；调用方负责在关闭时 cleanup。
export { _setupDialogAccessibility as setupDialogAccessibility };

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
 * @param {boolean} options.html - 是否把 message 当作可信 HTML 渲染（默认 false，即按纯文本转义）
 * @param {Function} options.onConfirm - 可选异步操作，返回 false 时按未成功关闭；调用方负责业务错误提示
 * @param {string} options.processingText - 异步操作期间的本地化状态文案
 * @param {AbortSignal} [options.signal] - 强制释放原范围弹窗，不取消已提交业务操作
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, options = {}) {
    const {
        title = t('common.confirm_action'),
        confirmText = t('common.confirm_execute'),
        cancelText = t('common.cancel'),
        type = "warning",
        html = false,
        onConfirm,
        processingText = t('common.processing'),
        signal
    } = options;
    
    const typeConfig = {
        warning: { icon: "⚠️" },
        danger: { icon: "🚨" },
        info: { icon: "ℹ️" }
    };
    const safeType = Object.hasOwn(typeConfig, type) ? type : "warning";
    const config = typeConfig[safeType];
    
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
        const overlay = _createDialogOverlay(0.6, 3);
        const box = _createDialogBox({ width: "360px", hasYTranslate: true });
        box.dataset.type = safeType;
        const dialogId = ++dialogInstanceId;
        const titleId = `ui-dialog-title-${dialogId}`;
        const descriptionId = `ui-dialog-description-${dialogId}`;

        box.innerHTML = `
            <div id="${titleId}" class="comfy-ranking-dialog__title" role="heading" aria-level="2">
                <span class="comfy-ranking-dialog__icon" aria-hidden="true">${config.icon}</span>
                <span>${escapeHtml(title)}</span>
            </div>
            <div id="${descriptionId}" class="comfy-ranking-dialog__message${html ? '' : ' comfy-ranking-dialog__message--plain'}">${html ? message : escapeHtml(message)}</div>
            <div class="comfy-ranking-dialog__actions">
                <button id="ui-btn-cancel" class="comfy-ranking-dialog__button comfy-ranking-dialog__button--cancel" type="button">${escapeHtml(cancelText)}</button>
                <button id="ui-btn-confirm" class="comfy-ranking-dialog__button comfy-ranking-dialog__button--confirm" type="button">${escapeHtml(confirmText)}</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // 入场动画
        _showDialogAnimation(overlay, box, true);

        let settled = false, aborted = false;
        let pending = false;
        let dialogAccessibility, observer;
        const abort = () => {
            if (aborted) return;
            aborted = true; settled = true; pending = false;
            observer?.disconnect(); dialogAccessibility?.cleanup(); overlay.remove();
            signal?.removeEventListener("abort", abort);
            resolve(false);
        };
        const close = result => {
            if (settled || pending) return;
            settled = true;
            observer?.disconnect();
            dialogAccessibility?.cleanup();
            _closeDialog(overlay, box, true, () => {
                signal?.removeEventListener("abort", abort);
                if (!aborted) dialogAccessibility?.restoreFocus();
                resolve(aborted ? false : result);
            });
        };

        dialogAccessibility = _setupDialogAccessibility(
            box, titleId, descriptionId, "#ui-btn-cancel", () => close(false)
        );

        observer = new MutationObserver(() => { if (!overlay.isConnected) abort(); });
        observer.observe(document.body, { childList: true, subtree: true });
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) { abort(); return; }

        box.querySelector("#ui-btn-cancel").onclick = () => {
            close(false);
        };
        box.querySelector("#ui-btn-confirm").onclick = async () => {
            if (settled || pending) return;
            if (typeof onConfirm !== "function") { close(true); return; }
            pending = true;
            box.setAttribute("aria-busy", "true");
            box.querySelector("#ui-btn-cancel").disabled = true;
            const confirmButton = box.querySelector("#ui-btn-confirm");
            confirmButton.disabled = true;
            confirmButton.textContent = processingText;
            const progress = document.createElement("p");
            progress.textContent = processingText;
            progress.setAttribute("role", "status");
            progress.setAttribute("aria-live", "polite");
            box.querySelector(".comfy-ranking-dialog__message").appendChild(progress);
            box.focus();
            let succeeded = false;
            try { succeeded = (await onConfirm()) !== false; }
            catch {
                if (!settled) showToast(t('common.operation_failed'), "error");
            } finally {
                if (settled) return;
                pending = false;
                box.removeAttribute("aria-busy");
                close(succeeded);
            }
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
 * @param {boolean} options.html - 是否把 message 当作可信 HTML 渲染（默认 false，即按纯文本转义）
 * @returns {Promise<boolean>} - 用户选择重试返回true
 */
export function showRetryDialog(message, retryFn, options = {}) {
    const {
        title = t('common.error'),
        retryText = `🔄 ${t('common.retry')}`,
        cancelText = t('common.close'),
        html = false
    } = options;
    
    return new Promise((resolve) => {
        const overlay = _createDialogOverlay(0.7, 4);
        const dialogId = ++dialogInstanceId;
        const titleId = `ui-dialog-title-${dialogId}`;
        const descriptionId = `ui-dialog-description-${dialogId}`;
        const box = _createDialogBox({
            width: "400px",
            background: "linear-gradient(145deg, #2a2a2a, #1f1f1f)",
            borderRadius: "16px",
            padding: "28px",
            boxShadow: "0 15px 50px rgba(0,0,0,0.5)",
            gap: "20px",
            hasYTranslate: false
        });
        box.dataset.type = "retry";

        box.innerHTML = `
            <div class="comfy-ranking-dialog__header comfy-ranking-dialog__header--center">
                <div class="comfy-ranking-dialog__illustration" aria-hidden="true">😕</div>
                <div id="${titleId}" class="comfy-ranking-dialog__title comfy-ranking-dialog__title--center" role="heading" aria-level="2">${escapeHtml(title)}</div>
            </div>
            <div id="${descriptionId}" class="comfy-ranking-dialog__message comfy-ranking-dialog__message--center">
                ${html ? message : escapeHtml(message)}
            </div>
            <div class="comfy-ranking-dialog__actions comfy-ranking-dialog__actions--center">
                <button id="ui-btn-cancel" class="comfy-ranking-dialog__button comfy-ranking-dialog__button--cancel" type="button">${escapeHtml(cancelText)}</button>
                <button id="ui-btn-retry" class="comfy-ranking-dialog__button comfy-ranking-dialog__button--retry" type="button">${escapeHtml(retryText)}</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // 入场动画
        _showDialogAnimation(overlay, box, false);

        let settled = false;
        let retryInProgress = false;
        let dialogAccessibility, observer;
        const settle = result => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            dialogAccessibility?.cleanup();
            _closeDialog(overlay, box, false, () => {
                dialogAccessibility?.restoreFocus();
                resolve(result);
            });
        };
        dialogAccessibility = _setupDialogAccessibility(
            box, titleId, descriptionId, "#ui-btn-cancel", () => {
                if (!retryInProgress) settle(false);
            }
        );
        observer = new MutationObserver(() => {
            if (settled || overlay.isConnected) return;
            settled = true;
            observer.disconnect();
            dialogAccessibility.cleanup();
            resolve(false);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        box.querySelector("#ui-btn-cancel").onclick = () => {
            settle(false);
        };
        
        box.querySelector("#ui-btn-retry").onclick = async () => {
            if (settled || retryInProgress || !overlay.isConnected) return;
            const retryBtn = box.querySelector("#ui-btn-retry");
            retryBtn.innerHTML = `<span class="btn-spinner"></span> ${t('common.retrying')}`;
            retryBtn.disabled = true;
            retryInProgress = true;
            box.setAttribute("aria-busy", "true");
            
            try {
                await retryFn();
                if (settled || !overlay.isConnected) return;
                settle(true);
            } catch {
                if (settled || !overlay.isConnected) return;
                const errBox = box.querySelector(".comfy-ranking-dialog__message");
                errBox.textContent = t('common.retry_failed');
                errBox.setAttribute("role", "alert");
            } finally {
                if (settled || !overlay.isConnected) return;
                retryBtn.innerHTML = escapeHtml(retryText);
                retryBtn.disabled = false;
                retryInProgress = false;
                box.removeAttribute("aria-busy");
            }
        };
    });
}


// ==========================================
// 🌐 网络状态检测（已移除）
// ==========================================
// 本模块曾自行维护一份 isOffline 状态并常驻显示底部「网络连接已断开」横幅，
// 与 状态管理.js 的网络状态重复，且一条 online/offline 事件需喂多份状态。
// 现统一收敛：
//   - 网络状态唯一数据源：core/状态管理.js 的 isOnline()
//   - 离线反馈改由列表层承担：缓存命中渲染后弹 xxx.network_cache toast
//     （「网络异常，已加载本地缓存」），比常驻横幅更贴合实际可用状态
// 原导出的 initNetworkStatusListener / checkOnline 全库无调用方，一并移除。


// ==========================================
// ⏳ 全局加载遮罩
// ==========================================

let loadingOverlay = null;
let loadingCount = 0;
let loadingHideTask = null;

/**
 * 显示全局加载遮罩
 * @param {string} message - 加载提示文字
 */
export function showLoading(message = t('feedback.processing')) {
    loadingCount++;
    if (loadingHideTask) {
        clearTimeout(loadingHideTask.timer);
        loadingHideTask = null;
    }
    if (loadingOverlay && !loadingOverlay.isConnected) loadingOverlay = null;
    
    if (loadingOverlay) {
        // 更新文字
        const textEl = loadingOverlay.querySelector(".loading-text");
        if (textEl) textEl.textContent = message;
        loadingOverlay.style.opacity = "1";
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
        <div class="loading-spinner" style="width: 48px; height: 48px; border: 4px solid var(--border-color, #333); border-top-color: #2196F3; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div class="loading-text" style="color: #fff; font-size: 14px; font-weight: 500;">${escapeHtml(message)}</div>
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
    
    const overlay = loadingOverlay;
    requestAnimationFrame(() => {
        if (loadingOverlay === overlay && loadingCount > 0 && overlay.isConnected) overlay.style.opacity = "1";
    });
}

/**
 * 隐藏全局加载遮罩
 */
export function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    
    if (loadingCount > 0 || !loadingOverlay) return;
    
    const overlay = loadingOverlay;
    overlay.style.opacity = "0";
    if (loadingHideTask) return;
    const task = { timer: null };
    loadingHideTask = task;
    task.timer = setTimeout(() => {
        if (loadingHideTask !== task) return;
        loadingHideTask = null;
        if (loadingOverlay !== overlay || loadingCount > 0) return;
        overlay.remove();
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
export function setButtonLoading(button, loading, loadingText = t('feedback.processing')) {
    if (!button) return;
    
    if (loading) {
        // 保存原始状态
        button._originalHTML = button.innerHTML;
        button._originalDisabled = button.disabled;
        
        button.disabled = true;
        button.style.opacity = "0.7";
        button.style.cursor = "not-allowed";
        button.innerHTML = `<span class="btn-spinner"></span>${escapeHtml(loadingText)}`;
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
export async function copyToClipboard(text, successMsg = t('feedback.copied')) {
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
        showToast(t('feedback.copy_failed'), "error");
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
        loadingMsg = t('feedback.processing'),
        successMsg = t('feedback.operation_success'),
        errorMsg = t('feedback.operation_failed'),
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
        showToast(errorMsg, "error");
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
// 📦 安装进度条
// ==========================================

/**
 * 创建安装进度条
 * @param {HTMLElement} container - 进度条容器元素
 * @returns {{update: Function, complete: Function, error: Function, showDiagnostics: Function, destroy: Function}}
 */
export function createInstallProgress(container) {
    // 创建进度条DOM
    const preparingLabel = t('install.preparing');
    const wrapper = document.createElement("div");
    wrapper.className = "install-progress-wrapper";
    wrapper.innerHTML = `
        <div class="install-progress">
            <div class="install-progress__header">
                <span class="install-progress__stage" role="status" aria-live="polite">${escapeHtml(preparingLabel)}</span>
                <span class="install-progress__elapsed" role="timer" aria-live="off"></span>
                <span class="install-progress__percent">0%</span>
            </div>
            <div class="install-progress__track" role="progressbar" aria-label="${escapeHtml(t('install.progress_label'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="${escapeHtml(preparingLabel)}">
                <div class="install-progress__fill"></div>
            </div>
        </div>
    `;
    container.innerHTML = "";
    container.appendChild(wrapper);

    const fill = wrapper.querySelector(".install-progress__fill");
    const stage = wrapper.querySelector(".install-progress__stage");
    const elapsed = wrapper.querySelector(".install-progress__elapsed");
    const percent = wrapper.querySelector(".install-progress__percent");
    const progressTrack = wrapper.querySelector(".install-progress__track");
    const startedAt = Date.now();
    let cancelButton = null;
    let destroyed = false;
    let diagnosticGeneration = 0;
    const updateElapsed = () => {
        const totalSeconds = Math.floor((Date.now() - startedAt) / 1000);
        const time = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
        const elapsedLabel = t('install.elapsed', { time });
        elapsed.textContent = elapsedLabel;
        elapsed.setAttribute("aria-label", elapsedLabel);
    };
    const elapsedTimer = setInterval(updateElapsed, 1000);
    const stopElapsedTimer = () => clearInterval(elapsedTimer);
    updateElapsed();

    return {
        update(progress, message) {
            const p = Math.max(0, Math.min(100, progress));
            fill.style.width = `${p}%`;
            percent.textContent = `${p}%`;
            progressTrack.setAttribute("aria-valuenow", String(p));
            if (message) {
                stage.textContent = message;
                progressTrack.setAttribute("aria-valuetext", message);
            }
        },
        complete(message) {
            stopElapsedTimer();
            cancelButton?.remove();
            fill.style.width = "100%";
            percent.textContent = "100%";
            progressTrack.setAttribute("aria-valuenow", "100");
            wrapper.classList.add("is-complete");
            stage.textContent = message || `✅ ${t('install.complete')}`;
            progressTrack.setAttribute("aria-valuetext", stage.textContent);
        },
        error(message) {
            stopElapsedTimer();
            cancelButton?.remove();
            wrapper.classList.add("is-error");
            stage.textContent = message || `❌ ${t('install.failed')}`;
            progressTrack.setAttribute("aria-valuetext", stage.textContent);
        },
        showDiagnostics(entries, error = null) {
            if (destroyed) return;
            const generation = ++diagnosticGeneration;
            wrapper.querySelectorAll('.install-progress__diagnostics, .comfy-ranking-request-diagnostic').forEach(node => node.remove());
            if (Array.isArray(entries) && entries.length) {
                const details = document.createElement("details");
                details.className = "install-progress__diagnostics";
                const summary = document.createElement("summary");
                summary.textContent = t('install.diagnostics');
                details.appendChild(summary);

                const list = document.createElement("ol");
                for (const entry of entries.slice(-50)) {
                    const item = document.createElement("li");
                    const stageKey = entry.stageKey;
                    const stageLabel = stageKey ? t(stageKey) : (entry.stage || t('install.stage_unknown'));
                    item.textContent = t('install.diagnostic_entry', {
                        time: entry.time,
                        stage: stageLabel,
                        progress: Number.isFinite(entry.progress) ? `${entry.progress}%` : "—"
                    });
                    list.appendChild(item);
                }
                details.appendChild(list);
                wrapper.appendChild(details);
            }
            if (typeof error?.requestId !== 'string') return;
            import('./性能优化工具.js').then(({ appendRequestDiagnostic }) => {
                const isCurrent = () => !destroyed && generation === diagnosticGeneration && wrapper.isConnected;
                if (isCurrent()) appendRequestDiagnostic(wrapper, error, t, isCurrent);
            }).catch(() => { console.warn('请求诊断界面加载失败'); });
        },
        addCancelButton(label, onCancel) {
            if (cancelButton || typeof onCancel !== "function") return;
            cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "install-progress__cancel";
            cancelButton.textContent = label;
            cancelButton.addEventListener("click", () => {
                if (cancelButton.disabled) return;
                cancelButton.disabled = true;
                cancelButton.textContent = t('install.cancelling');
                onCancel();
            });
            wrapper.appendChild(cancelButton);
        },
        destroy() {
            destroyed = true;
            diagnosticGeneration++;
            stopElapsedTimer();
            wrapper.remove();
        }
    };
}
