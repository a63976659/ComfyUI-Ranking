import { t } from "./用户体验增强.js";
import { CHART_LIFECYCLE, getSettings } from "../core/全局配置.js";
import { loadECharts } from "./图表脚本加载.js";

const owners = new Map();
let removalObserver = null;
function observeRemoval() {
    if (removalObserver) return;
    removalObserver = new MutationObserver(() => {
        for (const [element, controller] of owners) {
            if (!element.isConnected) controller.cleanup();
        }
    });
    removalObserver.observe(document.body, { childList: true, subtree: true });
}

function getLast6Months() {
    const res = [];
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    for (let i = 5; i >= 0; i--) {
        let m = month - i;
        let y = year;
        while (m <= 0) { m += 12; y -= 1; }
        res.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return res;
}

export function renderItemTrendChart(domElement, itemData) {
    if (!domElement?.isConnected) return null;
    owners.get(domElement)?.cleanup();
    let active = true, disposed = false, generation = 0;
    let chartInstance = null, widthObserver = null, widthTimer = null, resizeTimer = null;
    domElement.classList.add('resource-trend');
    let removeResize = null, removeAppearance = null;
    const clearDescription = () => {
        domElement.removeAttribute('role');
        domElement.removeAttribute('aria-label');
    };
    const showState = (message, failed = false) => {
        clearDescription();
        const state = document.createElement('div');
        state.className = 'resource-trend__state';
        state.setAttribute('role', failed ? 'alert' : 'status');
        state.textContent = message;
        domElement.replaceChildren(state);
    };
    const clearWork = () => {
        widthObserver?.disconnect(); widthObserver = null;
        clearTimeout(widthTimer); widthTimer = null;
        clearTimeout(resizeTimer); resizeTimer = null;
        removeResize?.(); removeResize = null;
        removeAppearance?.(); removeAppearance = null;
        clearDescription();
        if (chartInstance) {
            const old = chartInstance; chartInstance = null;
            try { if (!old.isDisposed?.()) old.dispose(); } catch (_) {}
        }
    };
    const cleanup = () => {
        if (disposed) return;
        disposed = true; active = false; generation++;
        clearWork();
        if (owners.get(domElement) === controller) owners.delete(domElement);
        if (!owners.size) { removalObserver?.disconnect(); removalObserver = null; }
    };
    const current = token => {
        if (disposed || !active || generation !== token || owners.get(domElement) !== controller) return false;
        if (!domElement.isConnected) { cleanup(); return false; }
        return true;
    };
    const showError = (token, key = 'chart.render_failed') => {
        if (!current(token)) return;
        generation++;
        clearWork();
        const message = key === 'chart.load_failed' ? t('chart.load_failed')
            : key === 'chart.size_unavailable' ? t('chart.size_unavailable') : t('chart.render_failed');
        showState(message, true);
    };
    const resize = token => {
        if (!current(token) || !chartInstance) return;
        if (chartInstance.isDisposed?.()) { cleanup(); return; }
        try { chartInstance.resize(); } catch (_) { showError(token); }
    };
    const initialize = token => {
        let libraryReady = false;
        loadECharts().then(echarts => {
            if (!current(token)) return;
            libraryReady = true;
            if (domElement.clientWidth === 0) { waitWidth(token); return; }
            domElement.innerHTML = "";
            const instance = echarts.init(domElement, null, { backgroundColor: 'transparent' });
            if (!current(token)) { instance.dispose(); return; }
            chartInstance = instance;
        const months = getLast6Months();
        // 提取底层的真实时间序列
        const history = itemData.use_history || {};
        const data = months.map(m => history[m] || 0);

        const describe = () => {
            domElement.setAttribute('role', 'img');
            domElement.setAttribute('aria-label', t('chart.data_description', {
                series: t('chart.monthly_downloads'),
                values: months.map((month, index) => t('chart.month_value', { month, value: data[index] })).join('; ')
            }));
        };
        const appearance = () => {
            const style = getComputedStyle(domElement);
            const fontSize = parseFloat(style.fontSize);
            const size = Number.isFinite(fontSize) ? fontSize : 12;
            const color = name => style.getPropertyValue(name).trim();
            const text = color('--resource-trend-text');
            const border = color('--resource-trend-border');
            const line = color('--resource-trend-line');
            return {
                animation: getSettings().enableAnimations !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
                textStyle: { color: text, fontFamily: style.fontFamily, fontSize: size },
                tooltip: { trigger: 'axis', backgroundColor: color('--resource-trend-panel'), borderColor: border, textStyle: { color: text, fontSize: size } },
                grid: { top: size, bottom: size * 1.5, left: size, right: size, containLabel: true },
                xAxis: { type: 'category', data: months, axisLabel: { color: text, fontSize: size, hideOverlap: true, formatter: value => value.replace('-', '\n'), showMinLabel: true, showMaxLabel: true, alignMinLabel: 'left', alignMaxLabel: 'right' }, axisLine: { lineStyle: { color: border } } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: border, type: 'dashed' } }, axisLabel: { color: text, fontSize: size }, minInterval: 1 },
                series: [{
                    name: t('chart.monthly_downloads'), type: 'line', data: data, smooth: true,
                    itemStyle: { color: line }, lineStyle: { color: line, width: 2 },
                    areaStyle: { color: line, opacity: .12 }
                }]
            };
        };
        instance.setOption(appearance());
        describe();
        const onAppearance = () => {
            if (!current(token) || chartInstance !== instance) return;
            try { instance.setOption(appearance()); describe(); instance.resize(); }
            catch (_) { showError(token); }
        };
        const observer = new MutationObserver(onAppearance);
        for (let ancestor = domElement.parentElement; ancestor; ancestor = ancestor.parentElement) {
            observer.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'] });
        }
        const queries = ['(prefers-color-scheme: dark)', '(forced-colors: active)', '(prefers-reduced-motion: reduce)'].map(query => window.matchMedia(query));
        for (const query of queries) query.addEventListener('change', onAppearance);
        window.addEventListener('comfy-settings-changed', onAppearance);
        removeAppearance = () => {
            observer.disconnect();
            for (const query of queries) query.removeEventListener('change', onAppearance);
            window.removeEventListener('comfy-settings-changed', onAppearance);
        };
        
            if (!current(token) || chartInstance !== instance) return;
            const onResize = onAppearance;
            window.addEventListener('resize', onResize);
            removeResize = () => window.removeEventListener('resize', onResize);
            resizeTimer = setTimeout(() => { resizeTimer = null; resize(token); }, CHART_LIFECYCLE.RESIZE_DELAY);
        }).catch(() => showError(token, libraryReady ? 'chart.render_failed' : 'chart.load_failed'));
    };
    const waitWidth = token => {
        if (!current(token)) return;
        if (domElement.clientWidth > 0) { initialize(token); return; }
        const observer = new ResizeObserver(entries => {
            if (widthObserver !== observer || !current(token)) return;
            if (entries.some(entry => entry.contentRect.width > 0)) {
                observer.disconnect(); widthObserver = null;
                clearTimeout(widthTimer); widthTimer = null;
                initialize(token);
            }
        });
        widthObserver = observer;
        observer.observe(domElement);
        const timer = setTimeout(() => {
            if (widthTimer !== timer) return;
            widthTimer = null;
            if (current(token)) showError(token, 'chart.size_unavailable');
        }, CHART_LIFECYCLE.WIDTH_WAIT_TIMEOUT);
        widthTimer = timer;
    };
    const start = () => {
        const token = ++generation;
        clearWork();
        showState(t('chart.loading'));
        waitWidth(token);
    };
    const controller = {
        cleanup,
        setActive(value) {
            if (disposed || active === !!value) return;
            active = !!value; generation++;
            clearWork();
            if (active) start();
        }
    };
    owners.set(domElement, controller);
    observeRemoval();
    start();
    return controller;
}
