// 前端页面/components/图片沙箱组件.js
// ==========================================
// 🖼️ 图片沙箱组件（轮播、缩放、拖动、不可复制）
// ==========================================
// 作用：提供可交互的图片查看器，支持多图轮播、缩放和拖动
// 关联文件：
//   - 列表卡片组件.js (资源封面显示)
//   - 资源详情页面组件.js (资源图片展示)
// ==========================================
// ⚡ 功能：多图轮播、左右切换、图片保护（禁止复制/下载）
// 🔧 P3优化：事件监听器生命周期管理，防止内存泄漏
// ==========================================

import { t } from "./用户体验增强.js";
import { escapeHtml, API, UI } from "../core/全局配置.js";
import { openImageViewer } from "./图片展示测试.js";

// 🔧 通用SVG占位图生成函数
function _createSVG(icon, text) {
    const iconPart = icon
        ? `%3Ctext x='200' y='125' text-anchor='middle' fill='%23666' font-size='24'%3E${encodeURIComponent(icon)}%3C/text%3E%3C`
        : `%3Crect x='180' y='110' width='40' height='40' rx='4' fill='%23333'%3E%3Canimate attributeName='opacity' values='0.3;1;0.3' dur='1.5s' repeatCount='indefinite'/%3E%3C/rect%3E%3C`;
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect fill='%231a1a1a' width='400' height='260'/%3E${iconPart}text x='200' y='${icon ? 150 : 180}' text-anchor='middle' fill='%23666' font-size='12'%3E${encodeURIComponent(text)}%3C/text%3E%3C/svg%3E`;
}

// 🔧 动态生成SVG占位图（支持多语言）
function createPlaceholderSVG(text) { return _createSVG(null, text); }
function createErrorSVG(text) { return _createSVG('⚠️', text); }
function createTimeoutSVG(text) { return _createSVG('⏱️', text); }

// 获取占位图
function getPlaceholderSVG() { return createPlaceholderSVG(t('image.loading')); }
function getErrorSVG() { return createErrorSVG(t('image.load_failed')); }
function getTimeoutSVG() { return createTimeoutSVG(t('image.load_timeout')); }

// 🔧 P3优化：带超时机制的图片加载器
function loadImageWithTimeout(url, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException('Image read cancelled', 'AbortError')); return; }
        const image = new Image();
        let settled = false;
        let timer = null;
        const finish = error => {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            image.onload = image.onerror = null;
            signal.removeEventListener('abort', cancel);
            if (error) { image.src = ''; reject(error); }
            else resolve(image);
        };
        const cancel = () => finish(new DOMException('Image read cancelled', 'AbortError'));
        signal.addEventListener('abort', cancel, { once: true });
        image.onload = () => finish(null);
        image.onerror = () => finish(new Error('Image read failed'));
        timer = setTimeout(() => {
            const error = new Error('Image read timed out');
            error.name = 'TimeoutError';
            finish(error);
        }, API.TIMEOUT);
        try { image.src = url; } catch (error) { finish(error); }
    });
}

/**
 * 🖼️ 生成效果展示图 HTML（支持多图轮播）
 * @param {string|string[]} imageSource - 单个图片URL或多个图片URL数组
 * @param {boolean} lazyLoad - 是否懒加载
 */
export function getCoverSandboxHTML(imageSource, lazyLoad = true) {
    // 兼容：接受单个URL或数组
    let imageUrls = [];
    if (Array.isArray(imageSource)) {
        imageUrls = imageSource.filter(url => typeof url === 'string' && url.trim());
    } else if (typeof imageSource === 'string' && imageSource.trim()) {
        imageUrls = [imageSource];
    }
    
    if (imageUrls.length === 0) return '';
    
    const firstUrl = imageUrls[0];
    
    // 🚀 本地代理URL已缓存，无需懒加载（从磁盘读取几乎瞬时）
    const isLocalProxy = firstUrl && firstUrl.startsWith(API.LOCAL_IMAGE_PROXY_PREFIX);
    const shouldLazy = lazyLoad && !isLocalProxy;
    
    // 🔒 XSS防护：图片 URL 来自其他用户发布的内容，写入 HTML 属性前必须转义
    // （上方 startsWith 代理判定用的是原始值，不受影响；浏览器解码后 dataset 仍为原 URL）
    const imgSrc = shouldLazy ? getPlaceholderSVG() : firstUrl;
    const dataAttr = shouldLazy ? `data-src="${escapeHtml(firstUrl)}"` : '';
    const lazyClass = shouldLazy ? 'lazy-image lazy-loading' : '';
    
    // 🖼️ 多图模式：显示左右切换按钮和计数器
    const hasMultiple = imageUrls.length > 1;
    const positionLabel = escapeHtml(t('image.viewer.image_position', { current: 1, total: imageUrls.length }));
    const navButtons = hasMultiple ? `
        <button type="button" class="sandbox-control btn-prev" aria-label="${escapeHtml(t('image.viewer.previous_short'))}" title="${escapeHtml(t('image.viewer.previous_short'))}">❮</button>
        <button type="button" class="sandbox-control btn-next" aria-label="${escapeHtml(t('image.viewer.next_short'))}" title="${escapeHtml(t('image.viewer.next_short'))}">❯</button>
        <div class="img-counter" role="status" aria-label="${positionLabel}">1 / ${imageUrls.length}</div>
    ` : '';
    return `
        <div class="sandbox-heading">🖼️ ${t('image.gallery')}${hasMultiple ? ` (${imageUrls.length})` : ''}</div>
        <div class="img-viewport image-sandbox" role="group" aria-label="${escapeHtml(t('image.gallery'))}" data-images='${escapeHtml(JSON.stringify(imageUrls))}' data-current="0">
            <img class="target-img ${lazyClass}" src="${escapeHtml(imgSrc)}" ${dataAttr} draggable="false" alt="${positionLabel}">
            ${navButtons}
            <div class="sandbox-tools">
                <button type="button" class="sandbox-control btn-zoom-out" aria-label="${escapeHtml(t('image.zoom_out'))}" title="${escapeHtml(t('image.zoom_out'))}">−</button>
                <button type="button" class="sandbox-control btn-zoom-reset" title="${escapeHtml(t('common.reset'))}">${t('common.reset')}</button>
                <button type="button" class="sandbox-control btn-zoom-in" aria-label="${escapeHtml(t('image.zoom_in'))}" title="${escapeHtml(t('image.zoom_in'))}">+</button>
                <button type="button" class="sandbox-control btn-fullscreen" aria-label="${escapeHtml(t('image.viewer.fullscreen'))}" title="${escapeHtml(t('image.viewer.fullscreen'))}">⛶</button>
            </div>
            <div class="sliders-wrapper">
                <input type="range" class="slider-x" min="-400" max="400" value="0" aria-label="${escapeHtml(t('image.pan_horizontal'))}">
                <input type="range" class="slider-y" min="-400" max="400" value="0" aria-label="${escapeHtml(t('image.pan_vertical'))}">
            </div>
        </div>
    `;
}

/**
 * 🖼️ 设置图片沙盒事件（轮播、缩放、拖动）
 */
export function setupImageSandboxEvents(detailView) {
    const viewport = detailView?.matches?.('.img-viewport') ? detailView : detailView?.querySelector('.img-viewport');
    if (!viewport) return;
    viewport._sandboxCleanup?.();
    const targetImg = viewport.querySelector('.target-img');
    const btnIn = viewport.querySelector('.btn-zoom-in');
    const btnOut = viewport.querySelector('.btn-zoom-out');
    const btnReset = viewport.querySelector('.btn-zoom-reset');
    const sliderX = viewport.querySelector('.slider-x');
    const sliderY = viewport.querySelector('.slider-y');
    if (![targetImg, btnIn, btnOut, btnReset, sliderX, sliderY].every(Boolean)) return;
    let imageUrls;
    try { imageUrls = JSON.parse(viewport.dataset.images || '[]'); } catch (_) { imageUrls = []; }
    if (!Array.isArray(imageUrls)) imageUrls = [];
    imageUrls = imageUrls.filter(url => typeof url === 'string' && url.trim());
    if (!imageUrls.length) return;
    let currentIndex = Number.parseInt(viewport.dataset.current || '0', 10);
    if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= imageUrls.length) currentIndex = 0;
    let disposed = false, generation = 0, readController = null, closeViewer = null;
    let observer = null, wasMounted = false, fallbackNode = null, fallbackTimer = null;
    const stops = [];
    const owns = () => !disposed && viewport._sandboxCleanup === cleanup;
    const connected = () => viewport.isConnected && (detailView === viewport || detailView.contains(viewport));
    const current = () => owns() && connected();
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        generation++;
        readController?.abort();
        readController = null;
        for (const stop of stops) stop();
        stops.length = 0;
        observer?.disconnect();
        observer = null;
        if (fallbackTimer !== null) clearTimeout(fallbackTimer);
        fallbackTimer = null;
        fallbackNode?.remove();
        fallbackNode = null;
        const close = closeViewer;
        closeViewer = null;
        try { close?.(); } catch (_) { console.warn('Image sandbox viewer cleanup failed'); }
        if (viewport._sandboxCleanup === cleanup) viewport._sandboxCleanup = null;
    };
    viewport._sandboxCleanup = cleanup;
    const watchRemoval = () => {
        if (!owns() || observer) return;
        const inspect = records => {
            if (!owns() || observer !== ownedObserver) return;
            if (connected()) { wasMounted = true; return; }
            const appeared = records.some(record => [...record.addedNodes, ...record.removedNodes]
                .some(node => node === viewport || node.contains?.(viewport)));
            if (wasMounted || appeared) cleanup();
        };
        const ownedObserver = new MutationObserver(inspect);
        observer = ownedObserver;
        observer.observe(document.body, { childList: true, subtree: true });
        queueMicrotask(() => {
            if (!owns() || observer !== ownedObserver) return;
            inspect(ownedObserver.takeRecords());
            if (!connected() && !wasMounted && owns()) { ownedObserver.disconnect(); observer = null; }
        });
    };
    const guard = callback => event => {
        if (!current()) return;
        watchRemoval();
        callback(event);
    };
    const listen = (target, type, callback, options) => {
        const owned = guard(callback);
        target.addEventListener(type, owned, options);
        stops.push(() => target.removeEventListener(type, owned, options));
    };
    const click = (target, callback) => {
        if (!target) return;
        const owned = guard(callback);
        target.onclick = owned;
        stops.push(() => { if (target.onclick === owned) target.onclick = null; });
    };
    let scale = Number(viewport.dataset.sandboxScale);
    if (!Number.isFinite(scale) || scale < 0.5 || scale > 5) scale = 1;
    const syncTransform = () => {
        viewport.dataset.sandboxScale = String(scale);
        targetImg.style.transform = `scale(${scale}) translate(${sliderX.value}px, ${sliderY.value}px)`;
    };
    const counter = viewport.querySelector('.img-counter');
    const updateCounter = () => {
        viewport.dataset.current = String(currentIndex);
        const label = t('image.viewer.image_position', { current: currentIndex + 1, total: imageUrls.length });
        targetImg.alt = label;
        if (counter) {
            counter.textContent = `${currentIndex + 1} / ${imageUrls.length}`;
            counter.setAttribute('aria-label', label);
        }
    };
    const loadImage = async index => {
        if (!owns() || index < 0 || index >= imageUrls.length) return;
        readController?.abort();
        const controller = new AbortController();
        readController = controller;
        const expected = ++generation;
        currentIndex = index;
        updateCounter();
        scale = 1; sliderX.value = 0; sliderY.value = 0; syncTransform();
        targetImg.classList.remove('lazy-loaded', 'lazy-error');
        targetImg.classList.add('lazy-loading');
        targetImg.src = getPlaceholderSVG();
        const url = imageUrls[index];
        try {
            await loadImageWithTimeout(url, controller.signal);
            if (!current() || expected !== generation) return;
            watchRemoval();
            targetImg.src = url;
            targetImg.classList.remove('lazy-loading', 'lazy-error');
            targetImg.classList.add('lazy-loaded');
            targetImg.style.opacity = '1';
        } catch (error) {
            if (!current() || expected !== generation || controller.signal.aborted) return;
            watchRemoval();
            targetImg.src = error.name === 'TimeoutError' ? getTimeoutSVG() : getErrorSVG();
            targetImg.classList.remove('lazy-loading', 'lazy-loaded');
            targetImg.classList.add('lazy-error');
        } finally {
            if (readController === controller) readController = null;
        }
    };
    delete targetImg.dataset.src;
    watchRemoval();
    updateCounter();
    syncTransform();
    const ready = targetImg.getAttribute('src') === imageUrls[currentIndex] &&
        (targetImg.classList.contains('lazy-loaded') || (targetImg.complete && targetImg.naturalWidth > 0));
    if (!ready) loadImage(currentIndex);
    else { targetImg.classList.remove('lazy-loading', 'lazy-error'); targetImg.classList.add('lazy-loaded'); }
    listen(viewport, 'contextmenu', event => event.preventDefault());
    listen(targetImg, 'dragstart', event => event.preventDefault());
    click(viewport.querySelector('.btn-prev'), event => { event.stopPropagation(); loadImage(currentIndex > 0 ? currentIndex - 1 : imageUrls.length - 1); });
    click(viewport.querySelector('.btn-next'), event => { event.stopPropagation(); loadImage(currentIndex < imageUrls.length - 1 ? currentIndex + 1 : 0); });
    const zoom = delta => { scale = Math.max(0.5, Math.min(5, scale + delta)); syncTransform(); };
    click(btnIn, () => zoom(0.2));
    click(btnOut, () => zoom(-0.2));
    click(btnReset, () => { scale = 1; sliderX.value = 0; sliderY.value = 0; syncTransform(); });
    const notifyFailure = async () => {
        try {
            const module = await import('./UI交互提示组件.js');
            if (current()) module.showToast(t('image.viewer.load_failed'), 'error');
        } catch (_) {
            if (!current()) return;
            fallbackNode?.remove();
            if (fallbackTimer !== null) clearTimeout(fallbackTimer);
            const node = document.createElement('div');
            node.textContent = t('image.viewer.load_failed');
            Object.assign(node.style, { position: 'fixed', top: '50px', left: '50%', transform: 'translateX(-50%)', background: '#F44336', color: '#fff', padding: '10px 20px', borderRadius: '8px', zIndex: '10000', fontSize: '14px' });
            fallbackNode = node;
            document.body.appendChild(node);
            fallbackTimer = setTimeout(() => { node.remove(); if (fallbackNode === node) { fallbackNode = null; fallbackTimer = null; } }, UI.TOAST.DURATION);
        }
    };
    click(viewport.querySelector('.btn-fullscreen'), event => {
        event.stopPropagation();
        try { closeViewer?.(); closeViewer = openImageViewer(imageUrls, currentIndex, { opaque: true }); }
        catch (_) { console.error('无法打开图像播放器'); notifyFailure(); }
    });
    listen(viewport, 'wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? -0.1 : 0.1); }, { passive: false });
    const rangeKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
    const keepNativeRangeKey = event => {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
            event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        if (rangeKeys.has(event.key)) event.stopPropagation();
    };
    listen(sliderX, 'keydown', keepNativeRangeKey);
    listen(sliderY, 'keydown', keepNativeRangeKey);
    listen(sliderX, 'input', syncTransform);
    listen(sliderY, 'input', syncTransform);
    let dragging = false, startX, startY, initialX, initialY;
    listen(viewport, 'mousedown', event => {
        if (event.target.closest('input, button')) return;
        event.preventDefault(); dragging = true; viewport.style.cursor = 'grabbing';
        startX = event.clientX; startY = event.clientY; initialX = Number(sliderX.value); initialY = Number(sliderY.value);
    });
    listen(window, 'mousemove', event => {
        if (!dragging) return;
        sliderX.value = initialX + (event.clientX - startX) / scale;
        sliderY.value = initialY + (event.clientY - startY) / scale;
        syncTransform();
    });
    listen(window, 'mouseup', () => { dragging = false; viewport.style.cursor = 'grab'; });
    listen(viewport, 'mouseleave', () => { dragging = false; viewport.style.cursor = 'grab'; });
}

/**
 * 🔧 清理图片沙盒事件监听器（防止内存泄漏）
 * @param {HTMLElement} detailView - 详情视图容器
 */
export function cleanupImageSandbox(detailView) {
    const viewports = [...(detailView?.querySelectorAll?.('.img-viewport') || [])];
    if (detailView?.matches?.('.img-viewport')) viewports.unshift(detailView);
    for (const viewport of viewports) viewport._sandboxCleanup?.();
}
