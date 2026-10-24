import { UI } from '../core/全局配置.js';

export function describeInstallSource(value) {
    const spec = UI.INSTALL_SOURCE;
    if (typeof value !== 'string' || value.length > spec.MAX_URL_BYTES) return null;
    const text = value.trim();
    if (!text || /[\u0000-\u0020\u007f\\]/u.test(text)
        || new TextEncoder().encode(text).length > spec.MAX_URL_BYTES) return null;
    try {
        const url = new URL(text);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
        let path = url.pathname.replace(/\/+$/u, '');
        if (path.endsWith('.git')) path = path.slice(0, -4);
        if (!path || path === '/') return null;
        const identityPath = spec.CASE_INSENSITIVE_HOSTS.includes(url.hostname) ? path.toLowerCase() : path;
        return { identity: url.origin + identityPath, label: url.host + path };
    } catch { return null; }
}
