// 前端页面/components/图片裁剪组件.js
// ==========================================
// ✂️ 图片裁剪组件
// ==========================================
// 作用：提供可视化图片裁剪功能，支持比例约束、缩放、拖动
// 关联文件：
//   - 个人设置表单组件.js (调用此组件进行背景裁剪)
// ==========================================
// 🔧 P3优化：事件监听器生命周期管理，防止内存泄漏
// ==========================================

import { validateImageFile } from "../market/图片文件检查.js";
import { IMAGE_PROCESS, escapeHtml } from "../core/全局配置.js";
// 🔧 i18n：头部操作提示走词典（用户体验_国际化.js 是零依赖叶子模块，引入不成环）
import { t } from "./用户体验_国际化.js";

// 辅助函数：将 value 限制在 [min, max] 范围内
function _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// 📱 触控设备检测（用于提示文案区分；优先 matchMedia 能力媒体查询，兼容实时仿真切换与无 ontouchstart 的浏览器）
function _isTouchDevice() {
    try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) return true;
    } catch (e) { /* 降级到下方检测 */ }
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 创建图片裁剪弹窗
 * @param {File} file - 要裁剪的图片文件
 * @param {number} aspectRatio - 宽高比（如 16/9 或 9/16）
 * @param {string} title - 弹窗标题
 * @param {number} maxSizeMB - 最大输出大小（MB）
 * @returns {Promise<File|null>} - 裁剪后的文件或 null（取消）
 */
export async function openImageCropper(file, aspectRatio = 16/9, title = t('crop.title'), maxSizeMB = 3, { signal } = {}) {
    if (signal?.aborted) return null;
    try { await validateImageFile(file, { signal }); }
    catch (error) { if (signal?.aborted || error?.name === 'AbortError') return null; throw error; }
    if (signal?.aborted) return null;
    return new Promise((resolve, reject) => {
        let isCleanedUp = false, bindTimer = null, activeCanvas = null;
        let removalObserver = null, decodeTimer = null, encodeTimer = null;
        const fail = () => {
            if (isCleanedUp) return;
            cleanup(false); reject(new Error('Crop processing unavailable'));
        };
        const onAbort = () => { cleanup(false); resolve(null); };
        const previousFocus = document.activeElement;
        const dialogId = `image-crop-dialog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        // 创建遮罩层
        const overlay = document.createElement("div");
        overlay.className = "image-crop-overlay";

        // 创建弹窗容器
        const modal = document.createElement("div");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", `${dialogId}-title`);
        modal.setAttribute("aria-describedby", `${dialogId}-hint`);
        modal.setAttribute("tabindex", "-1");
        modal.className = "image-crop-dialog";

        // 标题栏
        const header = document.createElement("div");
        header.className = "image-crop-header";
        // 比例显示文字
        let ratioText = '16:9';
        if (aspectRatio === 1) ratioText = '1:1';
        else if (aspectRatio < 1) ratioText = '9:16';
        // 📱 触控设备与鼠标设备的操作提示区分（移动端无滚轮/拖动概念）；文案走词典，随界面语言切换
        const gestureHint = _isTouchDevice() ? t('crop.gesture_hint_touch') : t('crop.gesture_hint_mouse');
        header.innerHTML = `
            <span id="${dialogId}-title" role="heading" aria-level="2" class="image-crop-title">✂️ ${escapeHtml(title)}</span>
            <span id="${dialogId}-hint" class="image-crop-hint">${escapeHtml(t('crop.ratio_label'))} ${ratioText} | ${escapeHtml(gestureHint)}</span>
        `;

        // 裁剪区域容器
        const cropContainer = document.createElement("div");
        let containerWidth, containerHeight;
        const preferredWidth = aspectRatio === 1
            ? Math.min(400, window.innerWidth * 0.7)
            : aspectRatio > 1 ? Math.min(600, window.innerWidth * 0.8)
                : Math.min(300, window.innerWidth * 0.5, Math.min(450, window.innerHeight * 0.5) * aspectRatio);
        cropContainer.className = "image-crop-viewport";


        // 图片元素
        const img = document.createElement("img");
        img.className = "image-crop-image";

        // 裁剪状态
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        let imgNaturalWidth = 0;
        let imgNaturalHeight = 0;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        // 加载图片
        const reader = new FileReader();
        reader.onload = (e) => {
            if (isCleanedUp) return;
            img.onload = () => {
                if (isCleanedUp) return;
                imgNaturalWidth = img.naturalWidth;
                imgNaturalHeight = img.naturalHeight;
                if (!Number.isSafeInteger(imgNaturalWidth) || !Number.isSafeInteger(imgNaturalHeight)
                    || imgNaturalWidth <= 0 || imgNaturalHeight <= 0
                    || Math.max(imgNaturalWidth, imgNaturalHeight) > IMAGE_PROCESS.MAX_SOURCE_EDGE
                    || imgNaturalWidth * imgNaturalHeight > IMAGE_PROCESS.MAX_PIXELS) { fail(); return; }
                clearTimeout(decodeTimer); decodeTimer = null;
                modal.querySelector('#btn-crop-confirm').disabled = false;

                // 计算初始缩放（确保图片填满裁剪区域）
                const scaleX = containerWidth / imgNaturalWidth;
                const scaleY = containerHeight / imgNaturalHeight;
                scale = Math.max(scaleX, scaleY);

                // 居中显示
                updateImagePosition();
            };
            img.src = e.target.result;
        };
        reader.onerror = fail; img.onerror = fail;

        // 更新图片位置
        function updateImagePosition() {
            const scaledWidth = imgNaturalWidth * scale;
            const scaledHeight = imgNaturalHeight * scale;

            // 限制偏移范围（确保图片始终覆盖裁剪区域）
            const maxOffsetX = Math.max(0, (scaledWidth - containerWidth) / 2);
            const maxOffsetY = Math.max(0, (scaledHeight - containerHeight) / 2);
            
            offsetX = _clamp(offsetX, -maxOffsetX, maxOffsetX);
            offsetY = _clamp(offsetY, -maxOffsetY, maxOffsetY);

            // 居中 + 偏移
            const left = (containerWidth - scaledWidth) / 2 + offsetX;
            const top = (containerHeight - scaledHeight) / 2 + offsetY;

            img.style.width = `${scaledWidth}px`;
            img.style.height = `${scaledHeight}px`;
            img.style.left = `${left}px`;
            img.style.top = `${top}px`;
            const slider = modal.querySelector('#crop-scale-slider');
            if (slider && imgNaturalWidth) {
                const percent = Math.round(scale / _getScaleLimits().minScale * 100);
                slider.value = String(percent);
                slider.setAttribute('aria-valuetext', `${percent}%`);
                modal.querySelector('#crop-scale-value').textContent = `${percent}%`;
            }
        }

        function localPoint(clientX, clientY) {
            const rect = cropContainer.getBoundingClientRect();
            return {
                x: (clientX - rect.left) * (containerWidth + cropContainer.clientLeft * 2) / rect.width - cropContainer.clientLeft,
                y: (clientY - rect.top) * (containerHeight + cropContainer.clientTop * 2) / rect.height - cropContainer.clientTop
            };
        }

        // 鼠标拖动
        cropContainer.onmousedown = (e) => {
            if (!imgNaturalWidth || e.button !== 0) return;
            isDragging = true;
            const point = localPoint(e.clientX, e.clientY);
            dragStartX = point.x - offsetX;
            dragStartY = point.y - offsetY;
            cropContainer.style.cursor = "grabbing";
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        // 🔧 P3优化：ESC 键关闭
        function handleKeyDown(e) {
            if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
                resolve(null);
                return;
            }
            if (e.key !== 'Tab') return;
            const focusable = Array.from(modal.querySelectorAll(
                'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
            ));
            if (!focusable.length) {
                e.preventDefault();
                modal.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
                e.preventDefault();
                first.focus();
            }
        }
        document.addEventListener("keydown", handleKeyDown);

        function handleMouseMove(e) {
            if (!isDragging) return;
            const point = localPoint(e.clientX, e.clientY);
            offsetX = point.x - dragStartX;
            offsetY = point.y - dragStartY;
            updateImagePosition();
        }

        function handleMouseUp() {
            isDragging = false;
            cropContainer.style.cursor = "move";
        }

        // 滚轮缩放
        cropContainer.onwheel = (e) => {
            e.preventDefault();
            if (!imgNaturalWidth) return;
            const delta = e.deltaY > 0 ? 0.95 : 1.05;
            const newScale = scale * delta;

            // 限制缩放范围（最小要覆盖裁剪区域）
            const minScaleX = containerWidth / imgNaturalWidth;
            const minScaleY = containerHeight / imgNaturalHeight;
            const minScale = Math.max(minScaleX, minScaleY);
            const maxScale = minScale * 5;

            scale = _clamp(newScale, minScale, maxScale);
            updateImagePosition();
        };

        // 📱 触控支持：单指拖动 + 双指捏合缩放（移动端无鼠标事件与滚轮）
        let pinchStartDist = 0;
        let pinchStartScale = 1;
        let pinchCenterX = 0;
        let pinchCenterY = 0;
        let pinchStartOffsetX = 0;
        let pinchStartOffsetY = 0;

        // 获取缩放边界（与滚轮缩放共用同一规则）
        function _getScaleLimits() {
            const minScaleX = containerWidth / imgNaturalWidth;
            const minScaleY = containerHeight / imgNaturalHeight;
            const minScale = Math.max(minScaleX, minScaleY);
            return { minScale, maxScale: minScale * 5 };
        }

        function _getTouchMidPoint(touches) {
            return localPoint((touches[0].clientX + touches[1].clientX) / 2,
                (touches[0].clientY + touches[1].clientY) / 2);
        }

        function _getTouchDistance(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function handleTouchStart(e) {
            if (!imgNaturalWidth) return;
            if (e.touches.length === 1) {
                isDragging = true;
                const point = localPoint(e.touches[0].clientX, e.touches[0].clientY);
                dragStartX = point.x - offsetX;
                dragStartY = point.y - offsetY;
            } else if (e.touches.length === 2) {
                isDragging = false;
                pinchStartDist = _getTouchDistance(e.touches);
                pinchStartScale = scale;
                const mid = _getTouchMidPoint(e.touches);
                pinchCenterX = mid.x;
                pinchCenterY = mid.y;
                pinchStartOffsetX = offsetX;
                pinchStartOffsetY = offsetY;
            }
            e.preventDefault();
        }

        function handleTouchMove(e) {
            if (e.touches.length === 1 && isDragging) {
                // 单指拖动
                const point = localPoint(e.touches[0].clientX, e.touches[0].clientY);
                offsetX = point.x - dragStartX;
                offsetY = point.y - dragStartY;
                updateImagePosition();
            } else if (e.touches.length === 2 && pinchStartDist > 0) {
                // 双指捏合缩放（以两指中点为锚点，图片跟随手指中心移动）
                const { minScale, maxScale } = _getScaleLimits();
                const newScale = _clamp(pinchStartScale * (_getTouchDistance(e.touches) / pinchStartDist), minScale, maxScale);
                const ratio = newScale / pinchStartScale;
                const mid = _getTouchMidPoint(e.touches);
                const relX = mid.x;
                const relY = mid.y;
                // 图片 left = (W - s·imgW)/2 + o，故锚点不动的条件解出：
                //   o1 = (p1 - p0) + ratio·(o0 - d) + d，其中 d = p0 - W/2 为起始手指相对容器中心的偏移
                const centerX = containerWidth / 2;
                const centerY = containerHeight / 2;
                const anchorX = pinchCenterX - centerX;
                const anchorY = pinchCenterY - centerY;
                offsetX = (relX - pinchCenterX) + (pinchStartOffsetX - anchorX) * ratio + anchorX;
                offsetY = (relY - pinchCenterY) + (pinchStartOffsetY - anchorY) * ratio + anchorY;
                scale = newScale;
                updateImagePosition();
            }
            e.preventDefault();
        }

        function handleTouchEnd(e) {
            if (e.touches.length === 0) {
                isDragging = false;
                pinchStartDist = 0;
            } else if (e.touches.length === 1) {
                // 双指抬起剩单指：切换为拖动模式，避免图片跳变
                pinchStartDist = 0;
                isDragging = true;
                const point = localPoint(e.touches[0].clientX, e.touches[0].clientY);
                dragStartX = point.x - offsetX;
                dragStartY = point.y - offsetY;
            }
        }

        cropContainer.addEventListener("touchstart", handleTouchStart, { passive: false });
        cropContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
        cropContainer.addEventListener("touchend", handleTouchEnd);
        cropContainer.addEventListener("touchcancel", handleTouchEnd);

        // 缩放滑块
        const sliderContainer = document.createElement("div");
        sliderContainer.className = "image-crop-zoom";
        sliderContainer.innerHTML = `
            <label for="crop-scale-slider" class="image-crop-zoom-label">🔍 ${escapeHtml(t('crop.zoom_label'))}</label>
            <input type="range" id="crop-scale-slider" min="100" max="500" value="100" aria-label="${escapeHtml(t('crop.zoom_label'))}" aria-valuetext="100%"
                   class="image-crop-range">
            <span id="crop-scale-value" class="image-crop-zoom-value">100%</span>
        `;

        // 按钮区域
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "image-crop-actions";
        buttonContainer.innerHTML = `
            <button id="btn-crop-cancel" type="button" class="image-crop-button image-crop-cancel">${escapeHtml(t('common.cancel'))}</button>
            <button id="btn-crop-confirm" type="button" disabled class="image-crop-button image-crop-confirm">✂️ ${escapeHtml(t('crop.confirm'))}</button>
        `;

        // 组装DOM
        cropContainer.appendChild(img);
        modal.appendChild(header);
        modal.appendChild(cropContainer);
        modal.appendChild(sliderContainer);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        const modalStyle = getComputedStyle(modal);
        const availableWidth = modal.clientWidth - parseFloat(modalStyle.paddingLeft) - parseFloat(modalStyle.paddingRight);
        const viewportStyle = getComputedStyle(cropContainer);
        containerWidth = Math.min(preferredWidth, Math.max(1, availableWidth - parseFloat(viewportStyle.borderLeftWidth) - parseFloat(viewportStyle.borderRightWidth)));
        containerHeight = containerWidth / aspectRatio;
        cropContainer.style.width = `${containerWidth}px`;
        cropContainer.style.height = `${containerHeight}px`;
        modal.querySelector("#btn-crop-cancel").focus();

        // 绑定缩放滑块事件
        bindTimer = setTimeout(() => {
            bindTimer = null;
            if (isCleanedUp) return;
            const slider = modal.querySelector("#crop-scale-slider");
            const scaleValue = modal.querySelector("#crop-scale-value");
            
            slider.oninput = () => {
                if (!imgNaturalWidth) return;
                const minScaleX = containerWidth / imgNaturalWidth;
                const minScaleY = containerHeight / imgNaturalHeight;
                const minScale = Math.max(minScaleX, minScaleY);
                
                scale = minScale * (parseInt(slider.value) / 100);
                scaleValue.textContent = `${slider.value}%`;
                slider.setAttribute("aria-valuetext", `${slider.value}%`);
                updateImagePosition();
            };

            // 取消按钮
            modal.querySelector("#btn-crop-cancel").onclick = () => {
                cleanup();
                resolve(null);
            };

            // 确认裁剪按钮
            modal.querySelector("#btn-crop-confirm").onclick = async () => {
                if (isCleanedUp) return;
                const btn = modal.querySelector("#btn-crop-confirm");
                if (btn.disabled) return;
                btn.textContent = `⏳ ${t('crop.processing')}`;
                if (modal.contains(document.activeElement)) modal.focus({ preventScroll: true });
                btn.disabled = true;

                encodeTimer = setTimeout(fail, IMAGE_PROCESS.TIMEOUT);
                try {
                    const croppedFile = await cropAndCompress();
                    if (isCleanedUp) return;
                    cleanup();
                    resolve(croppedFile);
                } catch (err) {
                    if (isCleanedUp) return;
                    clearTimeout(encodeTimer); encodeTimer = null;
                    btn.textContent = t('crop.process_failed');
                    btn.disabled = false;
                    console.error("[RanKing] Crop processing failed");
                }
            };
        }, 0);

        // 🔧 P3优化：统一清理函数，确保所有事件监听器被移除
        function cleanup(restoreFocus = true) {
            if (isCleanedUp) return;  // 防止重复清理
            isCleanedUp = true;
            const ownedFocus = modal.contains(document.activeElement);
            clearTimeout(bindTimer); bindTimer = null;
            clearTimeout(decodeTimer); clearTimeout(encodeTimer); decodeTimer = encodeTimer = null;
            removalObserver?.disconnect(); removalObserver = null;
            signal?.removeEventListener('abort', onAbort);
            reader.onload = reader.onerror = null;
            if (reader.readyState === FileReader.LOADING) { try { reader.abort(); } catch (_) { /* 继续释放其余所属资源 */ } }
            img.onload = img.onerror = null; img.removeAttribute('src');
            if (activeCanvas) { activeCanvas.width = activeCanvas.height = 0; activeCanvas = null; }
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("keydown", handleKeyDown);
            cropContainer.removeEventListener("touchstart", handleTouchStart);
            cropContainer.removeEventListener("touchmove", handleTouchMove);
            cropContainer.removeEventListener("touchend", handleTouchEnd);
            cropContainer.removeEventListener("touchcancel", handleTouchEnd);
            overlay.remove();
            if (restoreFocus && ownedFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        }

        // 点击遮罩关闭
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        };

        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
        if (!isCleanedUp) {
            removalObserver = new MutationObserver(() => { if (!overlay.isConnected || !modal.isConnected) onAbort(); });
            removalObserver.observe(document.body, { childList: true, subtree: true });
            if (!overlay.isConnected || !modal.isConnected) onAbort();
        }
        if (!isCleanedUp) {
            decodeTimer = setTimeout(fail, IMAGE_PROCESS.TIMEOUT);
            try { reader.readAsDataURL(file); } catch (_) { fail(); }
        }

        // 裁剪并压缩
        async function cropAndCompress() {
            if (isCleanedUp) throw new Error('Crop closed');
            const canvas = document.createElement("canvas"); activeCanvas = canvas;
            try {
                const ctx = canvas.getContext("2d");

                // 输出尺寸（根据比例）
                let outputWidth, outputHeight;
                if (aspectRatio === 1) {
                    // 1:1 正方形（头像，512x512）
                    outputWidth = outputHeight = 512;
                } else if (aspectRatio > 1) {
                    // 16:9 横向
                    outputWidth = Math.min(1920, containerWidth * 2);
                    outputHeight = outputWidth / aspectRatio;
                } else {
                    // 9:16 纵向
                    outputHeight = Math.min(1920, containerHeight * 2);
                    outputWidth = outputHeight * aspectRatio;
                }

                canvas.width = outputWidth;
                canvas.height = outputHeight;

                // 计算裁剪区域在原图上的位置
                const scaledWidth = imgNaturalWidth * scale;
                const scaledHeight = imgNaturalHeight * scale;
                const imgLeft = (containerWidth - scaledWidth) / 2 + offsetX;
                const imgTop = (containerHeight - scaledHeight) / 2 + offsetY;

                // 裁剪区域相对于缩放后图片的位置
                const cropX = -imgLeft / scale;
                const cropY = -imgTop / scale;
                const cropW = containerWidth / scale;
                const cropH = containerHeight / scale;

                // 绘制到 canvas
                ctx.drawImage(
                    img,
                    cropX, cropY, cropW, cropH,  // 源图裁剪区域
                    0, 0, outputWidth, outputHeight  // 目标canvas
                );

                // 压缩并转换为 Blob
                let quality = 0.92;
                let blob = await canvasToBlob(canvas, quality);
                if (isCleanedUp || !blob) throw new Error('Crop output unavailable');

                // 如果超过限制大小，逐步降低质量
                while (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.3) {
                    quality -= 0.1;
                    blob = await canvasToBlob(canvas, quality);
                    if (isCleanedUp || !blob) throw new Error('Crop output unavailable');
                }

                // 如果仍然超过限制，缩小尺寸
                if (blob.size > maxSizeMB * 1024 * 1024) {
                    const scaleFactor = Math.sqrt((maxSizeMB * 1024 * 1024) / blob.size) * 0.9;
                    canvas.width = outputWidth * scaleFactor;
                    canvas.height = outputHeight * scaleFactor;
                    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
                    blob = await canvasToBlob(canvas, 0.85);
                    if (isCleanedUp || !blob) throw new Error('Crop output unavailable');
                }

                if (!Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > maxSizeMB * 1024 * 1024) {
                    throw new Error('Crop output exceeds budget');
                }
                // 生成文件名
                const baseName = file.name.replace(/\.[^/.]+$/, "");
                const fileName = `${baseName}_cropped.jpg`;

                return new File([blob], fileName, { type: "image/jpeg" });
            } finally {
                canvas.width = canvas.height = 0;
                if (activeCanvas === canvas) activeCanvas = null;
            }
        }

        // Canvas 转 Blob 辅助函数
        function canvasToBlob(canvas, quality) {
            return new Promise((resolve) => {
                if (isCleanedUp) throw new Error('Crop closed');
                canvas.toBlob((blob) => resolve(isCleanedUp ? null : blob), "image/jpeg", quality);
            });
        }
    });
}
