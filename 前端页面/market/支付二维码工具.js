import { QrCode } from '../vendor/qrcodegen.js';

/** 支付链接仅用于本地二维码编码，SVG 中不插入链接或文本。 */
export function createPaymentQRCode(value, maxBytes) {
    if (typeof value !== 'string' || !Number.isSafeInteger(maxBytes) || maxBytes < 1
        || new TextEncoder().encode(value).length > maxBytes) throw new Error('invalid payment data');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
        || !(url.hostname === 'alipay.com' || url.hostname.endsWith('.alipay.com'))) {
        throw new Error('invalid payment address');
    }
    const qr = QrCode.encodeText(value, QrCode.Ecc.MEDIUM);
    const border = 4, size = qr.size + border * 2;
    const paths = [];
    for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
            if (qr.getModule(x, y)) paths.push(`M${x + border},${y + border}h1v1h-1z`);
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
