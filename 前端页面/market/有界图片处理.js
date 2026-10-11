import { validateImageFile } from "./图片文件检查.js";
import { IMAGE_PROCESS, PUBLISH_MEDIA_LIMITS } from "../core/全局配置.js";

/**
 * 通用图片处理核心函数：加载图片 → Canvas绘制 → 转换为JPG文件
 * @param {File} file - 原始图片文件
 * @param {Object} options - 配置选项
 * @param {boolean} options.cropToSquare - 是否中心裁剪为正方形
 * @param {number|null} options.targetSize - 目标尺寸（正方形边长），null则按输出边长预算等比缩小
 * @param {number} options.quality - 初始JPG质量 (0-1)
 * @param {string|null} options.fillBackground - 背景填充颜色，null则不填充
 * @param {number|null} options.maxFileSize - 最大文件大小（字节），超限则迭代降低质量
 * @param {boolean} options.skipIfSmallJpeg - 是否跳过已是小体积JPEG的文件
 * @param {number} options.maxEdge - 可选输出最长边（不超过全局输出预算）
 * @param {AbortSignal} options.signal - 所属会话的取消信号
 * @param {string} options.suffix - 输出文件名后缀
 * @returns {Promise<File>} 处理后的文件
 */
export function processImageCore(file, options = {}) {
    if (!Number.isFinite(file?.size) || file.size < 0 || file.size > IMAGE_PROCESS.MAX_INPUT_BYTES) {
        return Promise.reject(new Error('Invalid image size'));
    }
    return validateImageFile(file, { signal: options.signal }).then(() => new Promise((resolve, reject) => {
        let img, url, canvas, timer, settled = false;
        const signal = options.signal;
        const abort = () => finish(Object.assign(new Error('Image processing aborted'), { name: 'AbortError' }));
        const finish = (error, result) => {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (img) { img.onload = null; img.onerror = null; img.src = ''; }
            if (url) URL.revokeObjectURL(url);
            if (canvas) { canvas.width = 0; canvas.height = 0; }
            if (error) reject(error); else resolve(result);
        };
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => finish(new Error('Image processing timed out')), IMAGE_PROCESS.TIMEOUT);
        try {
            img = new Image(); url = URL.createObjectURL(file);
            img.onerror = () => finish(new Error('Image decode failed'));
            img.onload = () => {
                if (settled) return;
                try {
                    const width = img.naturalWidth, height = img.naturalHeight;
                    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
                        || Math.max(width, height) > IMAGE_PROCESS.MAX_SOURCE_EDGE || width * height > IMAGE_PROCESS.MAX_PIXELS) {
                        throw new Error('Image dimensions exceed budget');
                    }
                    const cap = options.maxFileSize || IMAGE_PROCESS.MAX_OUTPUT_BYTES;
                    if (options.skipIfSmallJpeg && file.type === 'image/jpeg' && file.size <= cap
                        && Math.max(width, height) <= IMAGE_PROCESS.MAX_OUTPUT_EDGE) { finish(null, file); return; }
                    let sourceX = 0, sourceY = 0, sourceW = width, sourceH = height;
                    if (options.cropToSquare) {
                        sourceW = sourceH = Math.min(width, height);
                        sourceX = (width - sourceW) / 2; sourceY = (height - sourceH) / 2;
                    }
                    const outputEdge = Math.min(options.maxEdge || IMAGE_PROCESS.MAX_OUTPUT_EDGE, IMAGE_PROCESS.MAX_OUTPUT_EDGE);
                    const scale = Math.min(1, outputEdge / Math.max(sourceW, sourceH));
                    const destW = options.targetSize || Math.max(1, Math.round(sourceW * scale));
                    const destH = options.targetSize || Math.max(1, Math.round(sourceH * scale));
                    canvas = document.createElement('canvas'); canvas.width = destW; canvas.height = destH;
                    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
                    if (options.fillBackground) { ctx.fillStyle = options.fillBackground; ctx.fillRect(0, 0, destW, destH); }
                    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, destW, destH);
                    let quality = options.quality || 0.85;
                    const encode = () => {
                        if (settled) return;
                        try {
                            canvas.toBlob(blob => {
                                if (settled) return;
                                try {
                                    if (!blob || !Number.isSafeInteger(blob.size) || blob.size <= 0) throw new Error('Image encoding failed');
                                    if (blob.size > cap) {
                                        if (quality <= IMAGE_PROCESS.MIN_QUALITY) throw new Error('Compressed image exceeds budget');
                                        quality = Math.max(IMAGE_PROCESS.MIN_QUALITY, quality - IMAGE_PROCESS.QUALITY_STEP);
                                        encode(); return;
                                    }
                                    finish(null, new File([blob], file.name.replace(/\.[^/.]+$/, '') + (options.suffix || '.jpg'), { type: 'image/jpeg' }));
                                } catch (error) { finish(error); }
                            }, 'image/jpeg', quality);
                        } catch (error) { finish(error); }
                    };
                    encode();
                } catch (error) { finish(error); }
            };
            img.src = url;
        } catch (error) { finish(error); }
    }));
}

// 只记住本模块成功生成的不可变File；弱引用不会延长表单文件生命周期。
const preparedPublishImages = new WeakSet();

/** 帖子/提示词保持原1920最长边与JPEG转换策略，不保留动画。 */
export function compressPublishImage(file, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('Image processing aborted'), { name: 'AbortError' }));
    if (preparedPublishImages.has(file)) return Promise.resolve(file);
    return processImageCore(file, {
        maxEdge: PUBLISH_MEDIA_LIMITS.IMAGE_MAX_EDGE,
        quality: PUBLISH_MEDIA_LIMITS.IMAGE_QUALITY,
        maxFileSize: IMAGE_PROCESS.MAX_OUTPUT_BYTES,
        suffix: '.jpg', signal
    }).then(result => { preparedPublishImages.add(result); return result; });
}

/** 按发布输出预算截取当前视频帧，终态释放画布。 */
export function capturePublishVideoFrame(video, { signal } = {}) {
    return new Promise((resolve, reject) => {
        let canvas, timer, settled = false;
        const abort = () => finish(Object.assign(new Error('Video frame capture aborted'), { name: 'AbortError' }));
        const finish = (error, result) => {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (canvas) { canvas.width = 0; canvas.height = 0; }
            if (error) reject(error); else resolve(result);
        };
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => finish(new Error('Video frame capture timed out')), IMAGE_PROCESS.TIMEOUT);
        try {
            const width = video.videoWidth, height = video.videoHeight;
            if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
                Math.max(width, height) > IMAGE_PROCESS.MAX_SOURCE_EDGE || width * height > IMAGE_PROCESS.MAX_PIXELS) {
                throw new Error('Video frame dimensions exceed budget');
            }
            const scale = Math.min(1, PUBLISH_MEDIA_LIMITS.IMAGE_MAX_EDGE / Math.max(width, height));
            canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
            const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            let quality = PUBLISH_MEDIA_LIMITS.IMAGE_QUALITY;
            const encode = () => {
                if (settled) return;
                try {
                    canvas.toBlob(blob => {
                        if (settled) return;
                        try {
                            if (!blob || !Number.isSafeInteger(blob.size) || blob.size <= 0) throw new Error('Invalid video frame output');
                            if (blob.size > IMAGE_PROCESS.MAX_OUTPUT_BYTES) {
                                if (quality <= IMAGE_PROCESS.MIN_QUALITY) throw new Error('Video frame output exceeds budget');
                                quality = Math.max(IMAGE_PROCESS.MIN_QUALITY, quality - IMAGE_PROCESS.QUALITY_STEP);
                                encode(); return;
                            }
                            finish(null, new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
                        } catch (error) { finish(error); }
                    }, 'image/jpeg', quality);
                } catch (error) { finish(error); }
            };
            encode();
        } catch (error) { finish(error); }
    });
}
