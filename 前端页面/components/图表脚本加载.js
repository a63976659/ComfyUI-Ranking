import { API } from "../core/全局配置.js";

let echartsLoading = null, echartsLoadFailures = 0;
export function loadECharts() {
    if (typeof window.echarts?.init === 'function') return Promise.resolve(window.echarts);
    if (echartsLoading) return echartsLoading;
    echartsLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        let settled = false;
        const finish = (error) => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            script.onload = script.onerror = null; script.remove();
            if (error) { echartsLoadFailures++; reject(new Error('ECharts load failed')); }
            else { echartsLoadFailures = 0; resolve(window.echarts); }
        };
        const timer = setTimeout(() => finish(true), API.PROFILE_RESOURCE_TIMEOUT);
        const scriptURL = new URL(API.CREATOR_CHART_SCRIPT_URL);
        // 移除script不保证终止原下载；失败后的读取不能复用未结束的旧URL。
        if (echartsLoadFailures) scriptURL.searchParams.set('_ranking_retry', `${Date.now()}-${echartsLoadFailures}`);
        script.src = scriptURL.href;
        script.onload = () => finish(typeof window.echarts?.init !== 'function');
        script.onerror = () => finish(true);
        document.head.appendChild(script);
    }).finally(() => { echartsLoading = null; });
    return echartsLoading;
}
