/** 有界文件头检查；仅确认格式/尺寸，不代替浏览器解码和服务端审核。 */
import { IMAGE_PROCESS } from "../core/全局配置.js";

export function readImageDimensions(buffer) {
    const b = new Uint8Array(buffer), v = new DataView(buffer);
    const text = (offset, count) => String.fromCharCode(...b.subarray(offset, offset + count));
    const requireBytes = end => { if (end > b.length) throw new Error('Truncated image header'); };
    let width, height, type;
    if (b.length >= 8 && b[0] === 137 && text(1, 3) === 'PNG' && text(4, 4) === '\r\n\x1a\n') {
        requireBytes(33);
        if (v.getUint32(8) !== 13 || text(12, 4) !== 'IHDR') throw new Error('Invalid PNG header');
        width = v.getUint32(16); height = v.getUint32(20); type = 'image/png';
    } else if (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a') {
        requireBytes(13); width = v.getUint16(6, true); height = v.getUint16(8, true); type = 'image/gif';
    } else if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
        requireBytes(20); const chunk = text(12, 4), size = v.getUint32(16, true);
        if (v.getUint32(4, true) < size + 12) throw new Error('Invalid WebP container');
        if (chunk === 'VP8X' && size === 10) {
            requireBytes(30); width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
            height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
        } else if (chunk === 'VP8L' && size >= 5) {
            requireBytes(25); if (b[20] !== 47 || (b[24] >> 5) !== 0) throw new Error('Invalid lossless header');
            const bits = v.getUint32(21, true); width = 1 + (bits & 16383); height = 1 + ((bits >>> 14) & 16383);
        } else if (chunk === 'VP8 ' && size >= 10) {
            requireBytes(30);
            if ((b[20] & 1) || b[23] !== 157 || b[24] !== 1 || b[25] !== 42) throw new Error('Invalid VP8 frame');
            width = v.getUint16(26, true) & 16383; height = v.getUint16(28, true) & 16383;
        } else throw new Error('Unsupported WebP header');
        type = 'image/webp';
    } else if (b[0] === 255 && b[1] === 216) {
        let offset = 2;
        while (offset < b.length) {
            if (b[offset++] !== 255) throw new Error('Invalid JPEG marker');
            while (b[offset] === 255) offset++;
            requireBytes(offset + 1); const marker = b[offset++];
            if (marker === 1) continue;
            if (marker === 0 || marker === 216 || marker === 217 || marker === 218 || (marker >= 208 && marker <= 215)) break;
            requireBytes(offset + 2); const length = v.getUint16(offset);
            if (length < 2) throw new Error('Invalid JPEG segment');
            requireBytes(offset + length);
            if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
                if (length < 8 || b[offset + 7] === 0 || length !== 8 + 3 * b[offset + 7]) throw new Error('Invalid JPEG frame');
                height = v.getUint16(offset + 3); width = v.getUint16(offset + 5); type = 'image/jpeg'; break;
            }
            offset += length;
        }
    }
    if (!type || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
        || Math.max(width, height) > IMAGE_PROCESS.MAX_SOURCE_EDGE || width * height > IMAGE_PROCESS.MAX_PIXELS) {
        throw new Error('Unsupported image or dimensions exceed budget');
    }
    return { width, height, type };
}

export async function validateImageFile(file, { signal } = {}) {
    if (!Number.isSafeInteger(file?.size) || file.size <= 0 || file.size > IMAGE_PROCESS.MAX_INPUT_BYTES
        || typeof file.slice !== 'function') throw new Error('Invalid image file');
    let timer, abort;
    const aborted = () => Object.assign(new Error('Image header read aborted'), { name: 'AbortError' });
    if (signal?.aborted) throw aborted();
    try {
        const cancellation = new Promise((_, reject) => {
            abort = () => reject(aborted());
            signal?.addEventListener('abort', abort, { once: true });
        });
        const buffer = await Promise.race([
            cancellation,
            file.slice(0, IMAGE_PROCESS.HEADER_BYTES).arrayBuffer(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Image header read timed out')), IMAGE_PROCESS.TIMEOUT); })
        ]);
        const dimensions = readImageDimensions(buffer);
        if (file.type && file.type !== dimensions.type && !(file.type === 'image/jpg' && dimensions.type === 'image/jpeg')) {
            throw new Error('Image MIME does not match header');
        }
        return dimensions;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
