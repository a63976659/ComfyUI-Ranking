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

import { escapeHtml } from "../core/全局配置.js";
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
export function openImageCropper(file, aspectRatio = 16/9, title = "裁剪图片", maxSizeMB = 3) {
    return new Promise((resolve) => {
        // 创建遮罩层
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
            background: "rgba(0,0,0,0.85)", zIndex: "99999",
            display: "flex", justifyContent: "center", alignItems: "center"
        });

        // 创建弹窗容器
        const modal = document.createElement("div");
        Object.assign(modal.style, {
            background: "var(--comfy-input-bg)", borderRadius: "12px", padding: "20px",
            maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
        });

        // 标题栏
        const header = document.createElement("div");
        Object.assign(header.style, {
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "15px", paddingBottom: "10px", borderBottom: "1px solid #444"
        });
        // 比例显示文字
        let ratioText = '16:9';
        if (aspectRatio === 1) ratioText = '1:1';
        else if (aspectRatio < 1) ratioText = '9:16';
        // 📱 触控设备与鼠标设备的操作提示区分（移动端无滚轮/拖动概念）；文案走词典，随界面语言切换
        const gestureHint = _isTouchDevice() ? t('crop.gesture_hint_touch') : t('crop.gesture_hint_mouse');
        header.innerHTML = `
            <span style="font-size: 16px; font-weight: bold; color: #fff;">✂️ ${escapeHtml(title)}</span>
            <span style="font-size: 12px; color: #888;">${escapeHtml(t('crop.ratio_label'))} ${ratioText} | ${escapeHtml(gestureHint)}</span>
        `;

        // 裁剪区域容器
        const cropContainer = document.createElement("div");
        let containerWidth, containerHeight;
        if (aspectRatio === 1) {
            // 1:1 正方形
            containerWidth = containerHeight = Math.min(400, window.innerWidth * 0.7);
        } else if (aspectRatio > 1) {
            // 16:9 横向
            containerWidth = Math.min(600, window.innerWidth * 0.8);
            containerHeight = containerWidth / aspectRatio;
        } else {
            // 9:16 纵向
            containerWidth = Math.min(300, window.innerWidth * 0.5);
            containerHeight = Math.min(450, window.innerHeight * 0.5);
        }
        
        Object.assign(cropContainer.style, {
            width: `${containerWidth}px`, height: `${containerHeight}px`,
            position: "relative", overflow: "hidden", borderRadius: "8px",
            background: "#1a1a1a", border: "2px solid #4CAF50", cursor: "move",
            // 📱 禁止浏览器接管触摸手势（页面滚动/双指缩放页面），交由裁剪组件自行处理
            touchAction: "none"
        });

        // 图片元素
        const img = document.createElement("img");
        Object.assign(img.style, {
            position: "absolute", maxWidth: "none", maxHeight: "none",
            userSelect: "none", pointerEvents: "none"
        });

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
            img.src = e.target.result;
            img.onload = () => {
                imgNaturalWidth = img.naturalWidth;
                imgNaturalHeight = img.naturalHeight;

                // 计算初始缩放（确保图片填满裁剪区域）
                const scaleX = containerWidth / imgNaturalWidth;
                const scaleY = containerHeight / imgNaturalHeight;
                scale = Math.max(scaleX, scaleY);

                // 居中显示
                updateImagePosition();
            };
        };
        reader.readAsDataURL(file);

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
        }

        // 鼠标拖动
        cropContainer.onmousedown = (e) => {
            isDragging = true;
            dragStartX = e.clientX - offsetX;
            dragStartY = e.clientY - offsetY;
            cropContainer.style.cursor = "grabbing";
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        // 🔧 P3优化：ESC 键关闭
        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            }
        }
        document.addEventListener("keydown", handleKeyDown);

        function handleMouseMove(e) {
            if (!isDragging) return;
            offsetX = e.clientX - dragStartX;
            offsetY = e.clientY - dragStartY;
            updateImagePosition();
        }

        function handleMouseUp() {
            isDragging = false;
            cropContainer.style.cursor = "move";
        }

        // 滚轮缩放
        cropContainer.onwheel = (e) => {
            e.preventDefault();
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
        // 🔧 手势起始时容器的视口原点（含 border），用于把 clientX/Y 换算成与 img.style.left 同源的容器内坐标
        let pinchOriginX = 0;
        let pinchOriginY = 0;

        // 获取缩放边界（与滚轮缩放共用同一规则）
        function _getScaleLimits() {
            const minScaleX = containerWidth / imgNaturalWidth;
            const minScaleY = containerHeight / imgNaturalHeight;
            const minScale = Math.max(minScaleX, minScaleY);
            return { minScale, maxScale: minScale * 5 };
        }

        function _getTouchMidPoint(touches) {
            return {
                x: (touches[0].clientX + touches[1].clientX) / 2,
                y: (touches[0].clientY + touches[1].clientY) / 2
            };
        }

        function _getTouchDistance(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function handleTouchStart(e) {
            if (e.touches.length === 1) {
                isDragging = true;
                dragStartX = e.touches[0].clientX - offsetX;
                dragStartY = e.touches[0].clientY - offsetY;
            } else if (e.touches.length === 2) {
                isDragging = false;
                pinchStartDist = _getTouchDistance(e.touches);
                pinchStartScale = scale;
                // 🔧 clientX 是视口坐标，offsetX/containerWidth 是容器内坐标，两者必须同原点才能参与锚点计算；
                // clientLeft/clientTop 为 2px 边框宽度（img 的 absolute 定位原点在 padding box 左上角）
                const rect = cropContainer.getBoundingClientRect();
                pinchOriginX = rect.left + cropContainer.clientLeft;
                pinchOriginY = rect.top + cropContainer.clientTop;
                const mid = _getTouchMidPoint(e.touches);
                pinchCenterX = mid.x - pinchOriginX;
                pinchCenterY = mid.y - pinchOriginY;
                pinchStartOffsetX = offsetX;
                pinchStartOffsetY = offsetY;
            }
            e.preventDefault();
        }

        function handleTouchMove(e) {
            if (e.touches.length === 1 && isDragging) {
                // 单指拖动
                offsetX = e.touches[0].clientX - dragStartX;
                offsetY = e.touches[0].clientY - dragStartY;
                updateImagePosition();
            } else if (e.touches.length === 2 && pinchStartDist > 0) {
                // 双指捏合缩放（以两指中点为锚点，图片跟随手指中心移动）
                const { minScale, maxScale } = _getScaleLimits();
                const newScale = _clamp(pinchStartScale * (_getTouchDistance(e.touches) / pinchStartDist), minScale, maxScale);
                const ratio = newScale / pinchStartScale;
                const mid = _getTouchMidPoint(e.touches);
                // 换算到容器内坐标（与 handleTouchStart 同原点，一次捏合手势期间弹窗不移动）
                const relX = mid.x - pinchOriginX;
                const relY = mid.y - pinchOriginY;
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
                dragStartX = e.touches[0].clientX - offsetX;
                dragStartY = e.touches[0].clientY - offsetY;
            }
        }

        cropContainer.addEventListener("touchstart", handleTouchStart, { passive: false });
        cropContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
        cropContainer.addEventListener("touchend", handleTouchEnd);
        cropContainer.addEventListener("touchcancel", handleTouchEnd);

        // 缩放滑块
        const sliderContainer = document.createElement("div");
        Object.assign(sliderContainer.style, {
            display: "flex", alignItems: "center", gap: "10px", marginTop: "15px", padding: "0 10px"
        });
        sliderContainer.innerHTML = `
            <span style="color: #888; font-size: 12px;">🔍 缩放</span>
            <input type="range" id="crop-scale-slider" min="100" max="500" value="100" 
                   style="flex: 1; accent-color: #4CAF50;">
            <span id="crop-scale-value" style="color: #4CAF50; font-size: 12px; min-width: 40px;">100%</span>
        `;

        // 按钮区域
        const buttonContainer = document.createElement("div");
        Object.assign(buttonContainer.style, {
            display: "flex", gap: "10px", marginTop: "15px", justifyContent: "flex-end"
        });
        buttonContainer.innerHTML = `
            <button id="btn-crop-cancel" style="padding: 10px 20px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
            <button id="btn-crop-confirm" style="padding: 10px 30px; background: #4CAF50; border: none; color: white; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">✂️ 确认裁剪并上传</button>
        `;

        // 组装DOM
        cropContainer.appendChild(img);
        modal.appendChild(header);
        modal.appendChild(cropContainer);
        modal.appendChild(sliderContainer);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 绑定缩放滑块事件
        setTimeout(() => {
            const slider = modal.querySelector("#crop-scale-slider");
            const scaleValue = modal.querySelector("#crop-scale-value");
            
            slider.oninput = () => {
                const minScaleX = containerWidth / imgNaturalWidth;
                const minScaleY = containerHeight / imgNaturalHeight;
                const minScale = Math.max(minScaleX, minScaleY);
                
                scale = minScale * (parseInt(slider.value) / 100);
                scaleValue.textContent = `${slider.value}%`;
                updateImagePosition();
            };

            // 取消按钮
            modal.querySelector("#btn-crop-cancel").onclick = () => {
                cleanup();
                resolve(null);
            };

            // 确认裁剪按钮
            modal.querySelector("#btn-crop-confirm").onclick = async () => {
                const btn = modal.querySelector("#btn-crop-confirm");
                btn.textContent = "⏳ 处理中...";
                btn.disabled = true;

                try {
                    const croppedFile = await cropAndCompress();
                    cleanup();
                    resolve(croppedFile);
                } catch (err) {
                    btn.textContent = "❌ 处理失败，重试";
                    btn.disabled = false;
                    console.error("裁剪失败:", err);
                }
            };
        }, 0);

        // 🔧 P3优化：统一清理函数，确保所有事件监听器被移除
        let isCleanedUp = false;
        function cleanup() {
            if (isCleanedUp) return;  // 防止重复清理
            isCleanedUp = true;
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("keydown", handleKeyDown);
            cropContainer.removeEventListener("touchstart", handleTouchStart);
            cropContainer.removeEventListener("touchmove", handleTouchMove);
            cropContainer.removeEventListener("touchend", handleTouchEnd);
            cropContainer.removeEventListener("touchcancel", handleTouchEnd);
            overlay.remove();
        }

        // 点击遮罩关闭
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        };

        // 裁剪并压缩
        async function cropAndCompress() {
            const canvas = document.createElement("canvas");
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

            // 如果超过限制大小，逐步降低质量
            while (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.3) {
                quality -= 0.1;
                blob = await canvasToBlob(canvas, quality);
            }

            // 如果仍然超过限制，缩小尺寸
            if (blob.size > maxSizeMB * 1024 * 1024) {
                const scaleFactor = Math.sqrt((maxSizeMB * 1024 * 1024) / blob.size) * 0.9;
                canvas.width = outputWidth * scaleFactor;
                canvas.height = outputHeight * scaleFactor;
                ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
                blob = await canvasToBlob(canvas, 0.85);
            }

            // 生成文件名
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const fileName = `${baseName}_cropped.jpg`;

            return new File([blob], fileName, { type: "image/jpeg" });
        }

        // Canvas 转 Blob 辅助函数
        function canvasToBlob(canvas, quality) {
            return new Promise((resolve) => {
                canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
            });
        }
    });
}
