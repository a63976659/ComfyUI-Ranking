// 前端页面/components/图片裁剪组件.js
// ==========================================
// ✂️ 图片裁剪组件
// ==========================================
// 作用：提供可视化图片裁剪功能，支持比例约束、缩放、拖动
// 关联文件：
//   - 个人设置表单组件.js (调用此组件进行背景裁剪)
// ==========================================

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
            background: "#2a2a2a", borderRadius: "12px", padding: "20px",
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
        header.innerHTML = `
            <span style="font-size: 16px; font-weight: bold; color: #fff;">✂️ ${title}</span>
            <span style="font-size: 12px; color: #888;">比例 ${ratioText} | 拖动调整位置 | 滚轮缩放</span>
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
            background: "#1a1a1a", border: "2px solid #4CAF50", cursor: "move"
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
            
            offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
            offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

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

            scale = Math.max(minScale, Math.min(maxScale, newScale));
            updateImagePosition();
        };

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

        // 清理函数
        function cleanup() {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
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
