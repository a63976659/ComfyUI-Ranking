// 前端页面/components/全局设置组件.js
// ==========================================
// ⚙️ 全局设置组件（界面偏好设置）
// ==========================================
// 作用：提供全局界面设置入口，控制显示偏好
// 关联文件：
//   - 顶部导航组件.js (设置按钮入口)
//   - 创作者卡片组件.js (背景图显示控制)
// ==========================================

import { showToast } from "./UI交互提示组件.js";
import { setLanguage, getLanguage, t } from "./用户体验增强.js";
import { clearAllCache } from "./性能优化工具.js";
import { IS_WEB_MODE, getSettings, saveSettings } from "../core/全局配置.js";
export { getSettings, saveSettings };
import { getDiskCacheStats, clearDiskCache } from './缓存管理请求.js';

// 🌐 语言选项（双语显示）
const LANGUAGE_OPTIONS = [
    { value: 'zh-CN', label: '简体中文 / Simplified Chinese' },
    { value: 'en-US', label: 'English / 英语' }
];

/**
 * 📊 格式化文件大小
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log2(bytes) / 10);
    const unitIndex = Math.min(i, units.length - 1);
    const size = bytes / Math.pow(1024, unitIndex);
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 📊 获取浏览器缓存统计
 */
function getBrowserCacheStats() {
    let totalSize = 0;
    let count = 0;
    let available = true;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ComfyRanking_')) {
                const value = localStorage.getItem(key);
                if (value) {
                    totalSize += new Blob([value]).size;
                    count++;
                }
            }
        }
    } catch (e) { available = false; }
    return { count, totalSize, available };
}

/**
 * ⚙️ 创建设置页面视图
 */
export function createSettingsView() {
    const settings = getSettings();

    const container = document.createElement("div");
    container.className = "ranking-settings";

    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <header class="ranking-settings__header">
            <button type="button" class="ranking-settings__back" id="btn-back-settings" >
                ⬅ ${t('common.back')}
            </button>
            <h1 class="ranking-settings__title">⚙️ ${t('settings.title')}</h1>
        </header>

        <!-- 设置内容区域 -->
        <div class="ranking-settings__body" >

            <!-- 分类：通用设置 -->
            <h2 class="ranking-settings__heading-general">
                🌐 ${t('settings.general')}
            </h2>

            <!-- 设置项：界面语言 -->
            <div class="setting-item">
                <div class="ranking-settings__copy" >
                    <div class="ranking-settings__label" id="label-language" >${t('settings.language')} / Language</div>
                    <div class="ranking-settings__description" >${t('settings.language_desc')} / Select display language</div>
                </div>
                <select aria-labelledby="label-language" id="select-language" class="setting-select">
                    ${LANGUAGE_OPTIONS.map(opt =>
                        `<option value="${opt.value}" ${(settings.language || 'zh-CN') === opt.value ? 'selected' : ''}>${opt.label}</option>`
                    ).join('')}
                </select>
            </div>

            <section class="setting-shortcuts" aria-labelledby="heading-shortcuts">
                <h2 id="heading-shortcuts" class="setting-shortcuts__heading">⌨️ ${t('settings.shortcuts')}</h2>
                <div class="setting-item">
                    <div class="setting-shortcuts__copy">
                        <div id="label-keyboard-shortcuts" class="setting-shortcuts__label">${t('settings.keyboard_combinations')}</div>
                        <p id="desc-keyboard-shortcuts" class="setting-shortcuts__desc">${t('settings.keyboard_combinations_desc')}</p>
                    </div>
                    <button type="button" role="switch" id="switch-keyboard-shortcuts" aria-labelledby="label-keyboard-shortcuts" aria-describedby="desc-keyboard-shortcuts" class="setting-switch ${settings.enableKeyboardShortcuts === true ? 'active' : ''}"></button>
                </div>
                <dl class="setting-shortcuts__list">
                    ${[[t('settings.shortcuts_tab_keys'), t('settings.shortcuts_controls')], [t('settings.shortcuts_activate_keys'), t('settings.shortcuts_activate')], [t('settings.shortcuts_arrows'), t('settings.shortcuts_tabs')], [t('settings.shortcuts_image_keys'), t('settings.shortcuts_images')], [t('settings.shortcuts_escape_key'), t('settings.shortcuts_escape')]].map(([keys, description]) => `<div class="setting-shortcuts__entry"><dt><kbd>${keys}</kbd></dt><dd>${description}</dd></div>`).join('')}
                </dl>
                <p class="setting-shortcuts__note">${t('settings.shortcuts_scope')}</p>
            </section>

            <!-- 分类：显示偏好 -->
            <h2 class="ranking-settings__heading-display">
                📐 ${t('settings.display')}
            </h2>

            <!-- 设置项：创作者卡片背景图 -->
            <div class="setting-item">
                <div class="ranking-settings__copy" >
                    <div class="ranking-settings__label" id="label-creator-banner" >${t('settings.creator_banner')}</div>
                    <div class="ranking-settings__description" id="desc-creator-banner" >${t('settings.creator_banner_desc')}</div>
                </div>
                <button type="button" role="switch" id="switch-creator-banner" aria-labelledby="label-creator-banner" aria-describedby="desc-creator-banner" class="setting-switch ${settings.showCreatorBanner ? 'active' : ''}"></button>
            </div>

            <!-- 分类：更多功能 -->
            <h2 class="ranking-settings__heading-animation">
                ✨ ${t('settings.animation')}
            </h2>

            <!-- 设置项：榜单切换动画 -->
            <div class="setting-item">
                <div class="ranking-settings__copy" >
                    <div class="ranking-settings__label" id="label-animations" >${t('settings.animations')}</div>
                    <div class="ranking-settings__description" id="desc-animations" >${t('settings.animations_desc')}</div>
                </div>
                <button type="button" role="switch" id="switch-animations" aria-labelledby="label-animations" aria-describedby="desc-animations" class="setting-switch ${settings.enableAnimations ? 'active' : ''}"></button>
            </div>

            <!-- 设置项：动画音效 -->
            <div class="setting-item">
                <div class="ranking-settings__copy" >
                    <div class="ranking-settings__label" id="label-sound-effects" >${t('settings.sound')}</div>
                    <div class="ranking-settings__description" id="desc-sound-effects" >${t('settings.sound_desc')}</div>
                </div>
                <button type="button" role="switch" id="switch-sound-effects" aria-labelledby="label-sound-effects" aria-describedby="desc-sound-effects" class="setting-switch ${settings.enableSoundEffects ? 'active' : ''}"></button>
            </div>

            <!-- 分类：数据与缓存 -->
            <h2 class="ranking-settings__heading-cache">
                ${t('settings.data_cache')}
            </h2>

            <!-- 设置项：缓存刷新间隔（滑条） -->
            <div class="ranking-settings__stack setting-item" >
                <div class="ranking-settings__copy-wide" >
                    <div class="ranking-settings__label" id="label-cache-expire" >${t('settings.cache_expire')}</div>
                    <div class="ranking-settings__description" >${t('settings.cache_expire_desc')}</div>
                </div>
                <div class="ranking-settings__controls" >
                    <div class="ranking-settings__range-row" >
                        <input aria-labelledby="label-cache-expire" type="range" id="slider-cache-expire" class="ranking-settings__copy setting-range-slider"
                            value="${settings.cacheExpireSeconds || 7200}"
                            min="60" max="86400" step="60"
                            >
                        <input aria-labelledby="label-cache-expire" type="number" id="input-cache-expire" class="setting-number-input"
                            value="${settings.cacheExpireSeconds || 7200}"
                            min="60" max="86400" step="60">
                        <span class="ranking-settings__time" id="cache-expire-label" ></span>
                    </div>
                    <div class="ranking-settings__hint" >
                        💡 ${t('settings.cache_trigger_desc')}
                    </div>
                </div>
            </div>

            <!-- 设置项：缓存统计与清理 -->
            <div class="ranking-settings__stack setting-item" >
                <div class="ranking-settings__copy-wide" >
                    <div class="ranking-settings__stats-label" >${t('settings.cache_stats')}</div>
                    <div class="ranking-settings__stats-hint" >${t('settings.cache_stats_hint')}</div>
                </div>
                <div class="ranking-settings__stats" id="cache-stats-panel" >
                    <div class="ranking-settings__stat-muted" >
                        ${t('settings.no_cache')}
                    </div>
                </div>
                <div class="ranking-settings__actions" >
                    <button type="button" id="btn-clear-browser-cache" class="cache-clear-btn">${t('settings.clear_browser_cache')}</button>
                    ${IS_WEB_MODE ? '' : `<button type="button" id="btn-clear-disk-cache" class="cache-clear-btn">${t('settings.clear_disk_cache')}</button>
                    <button type="button" id="btn-clear-all-cache" class="cache-clear-btn">${t('settings.clear_all_cache')}</button>`}
                </div>
            </div>

            <!-- 动画预览提示 -->
            <div class="ranking-settings__preview" >
                <div class="ranking-settings__preview-title" >🎨 ${t('settings.animation_preview')}</div>
                <div class="ranking-settings__preview-copy" >
                    • ${t('settings.anim_cascade')}<br>
                    • ${t('settings.anim_fan')}<br>
                    • ${t('settings.anim_abyss')}<br>
                    • ${t('settings.anim_dataflow')}
                </div>
            </div>
        </div>

        <!-- 底部信息 -->
        <div class="ranking-settings__footer" >
            <div class="ranking-settings__footer-copy" >${t('settings.auto_save')}</div>
        </div>
    `;

    // 🔌 绑定事件

    // 返回按钮
    container.querySelector("#btn-back-settings").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    /**
     * 通用开关绑定辅助函数
     * @param {string} selector - querySelector 选择器
     * @param {string} settingKey - settings 对象的字段名
     * @param {string} labelKey - i18n label key
     * @param {string} [iconOn] - 开启时的图标前缀，默认 '✅'
     */
    function _bindSwitchHandler(selector, settingKey, labelKey, iconOn = '✅') {
        const switchEl = container.querySelector(selector);
        switchEl.setAttribute("aria-checked", String(switchEl.classList.contains("active")));
        switchEl.onclick = () => {
            if (settingKey === 'enableKeyboardShortcuts' && (cacheViewDisposed || !container.isConnected)) return;
            let currentSettings;
            try { currentSettings = getSettings(settingKey === 'enableKeyboardShortcuts' ? { strict: true } : undefined); }
            catch { showToast(t('common.error'), 'error'); return; }
            const previousValue = switchEl.classList.contains("active");
            const newValue = !previousValue;
            switchEl.classList.toggle("active", newValue);
            switchEl.setAttribute("aria-checked", String(newValue));
            currentSettings[settingKey] = newValue;
            const saved = saveSettings(currentSettings);
            let confirmed = saved === true;
            if (settingKey === 'enableKeyboardShortcuts') {
                try { confirmed = confirmed && getSettings({ strict: true }).enableKeyboardShortcuts === newValue; }
                catch { confirmed = false; }
            }
            if (settingKey === 'enableKeyboardShortcuts' && !confirmed) {
                switchEl.classList.toggle('active', previousValue);
                switchEl.setAttribute('aria-checked', String(previousValue));
                showToast(t('common.error'), 'error');
                return;
            }
            showToast(
                newValue
                    ? `${iconOn} ${t(labelKey)} ${t('settings.enabled')}`
                    : `${t(labelKey)} ${t('settings.disabled')}`,
                "success"
            );
        };
    }

    // 🌐 下拉控制：界面语言
    const selectLanguage = container.querySelector("#select-language");
    let languageTimer = null;
    let languageGeneration = 0;
    selectLanguage.onchange = () => {
        if (cacheViewDisposed || !container.isConnected) return;
        const newLang = selectLanguage.value;
        if (!LANGUAGE_OPTIONS.some(option => option.value === newLang)) return;
        const generation = ++languageGeneration;
        clearTimeout(languageTimer);
        languageTimer = null;

        const currentSettings = getSettings();
        currentSettings.language = newLang;
        saveSettings(currentSettings);

        // 同步到 i18n 模块
        setLanguage(newLang);
        if (cacheViewDisposed || generation !== languageGeneration || !container.isConnected) return;

        const langName = LANGUAGE_OPTIONS.find(opt => opt.value === newLang)?.label || newLang;
        showToast(`🌐 ${t('settings.language_changed')} ${langName.split(' / ')[0]}`, "success");

        languageTimer = setTimeout(() => {
            languageTimer = null;
            if (cacheViewDisposed || generation !== languageGeneration || !container.isConnected) return;
            const restoreFocus = document.activeElement === selectLanguage;
            const newSettingsView = createSettingsView();
            if (cacheViewDisposed || generation !== languageGeneration || !container.isConnected) {
                newSettingsView._cleanup?.();
                return;
            }
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: newSettingsView } }));
            if (!newSettingsView.isConnected) {
                newSettingsView._cleanup?.();
                return;
            }
            if (restoreFocus && (document.activeElement === document.body || document.activeElement === selectLanguage)) {
                newSettingsView.querySelector("#select-language")?.focus({ preventScroll: true });
            }
        }, 100);
    };

    // 🎛️ 开关控制：创作者背景图 / 榜单切换动画 / 动画音效
    _bindSwitchHandler("#switch-keyboard-shortcuts", "enableKeyboardShortcuts", "settings.keyboard_combinations");
    _bindSwitchHandler("#switch-creator-banner", "showCreatorBanner", "settings.creator_banner", "✅");
    _bindSwitchHandler("#switch-animations",     "enableAnimations",  "settings.animations",     "✨");
    _bindSwitchHandler("#switch-sound-effects",  "enableSoundEffects", "settings.sound",         "🔊");

    // ⏱️ 滑条+输入框联动：缓存刷新间隔
    const inputCacheExpire = container.querySelector("#input-cache-expire");
    const sliderCacheExpire = container.querySelector("#slider-cache-expire");
    const cacheExpireLabel = container.querySelector("#cache-expire-label");

    // 格式化时间显示
    function formatCacheTime(seconds) {
        if (seconds >= 3600) {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
        }
        return `${Math.floor(seconds / 60)}min`;
    }

    // 更新滑条渐变背景
    function updateSliderTrack() {
        const val = sliderCacheExpire.value;
        const pct = ((val - 60) / (86400 - 60)) * 100;
        sliderCacheExpire.style.setProperty("--settings-range-progress", `${pct}%`);
    }

    // 保存设置
    function saveCacheExpire(newValue) {
        const currentSettings = getSettings();
        currentSettings.cacheExpireSeconds = newValue;
        saveSettings(currentSettings);
        cacheExpireLabel.textContent = formatCacheTime(newValue);
        updateSliderTrack();
    }

    // 初始化显示
    cacheExpireLabel.textContent = formatCacheTime(parseInt(inputCacheExpire.value));
    updateSliderTrack();

    // 滑条拖动 → 同步输入框 + 保存
    sliderCacheExpire.oninput = () => {
        const val = parseInt(sliderCacheExpire.value);
        inputCacheExpire.value = val;
        cacheExpireLabel.textContent = formatCacheTime(val);
        updateSliderTrack();
    };
    sliderCacheExpire.onchange = () => {
        saveCacheExpire(parseInt(sliderCacheExpire.value));
        showToast(`⏱️ ${t('settings.cache_expire')}: ${formatCacheTime(parseInt(sliderCacheExpire.value))}`, "success");
    };

    // 输入框修改 → 同步滑条 + 保存
    inputCacheExpire.onchange = () => {
        let newValue = parseInt(inputCacheExpire.value);
        if (isNaN(newValue) || newValue < 60) { newValue = 60; }
        else if (newValue > 86400) { newValue = 86400; }
        inputCacheExpire.value = newValue;
        sliderCacheExpire.value = newValue;
        saveCacheExpire(newValue);
        showToast(`⏱️ ${t('settings.cache_expire')}: ${formatCacheTime(newValue)}`, "success");
    };

    // 📊 缓存统计面板
    const cacheStatsPanel = container.querySelector("#cache-stats-panel");
    cacheStatsPanel.setAttribute('role', 'status');
    cacheStatsPanel.setAttribute('aria-live', 'polite');
    let statsGeneration = 0;
    let statsController = null;
    let lastStatsHTML = null;
    let cacheViewDisposed = false;
    container._cleanup = () => {
        if (cacheViewDisposed) return;
        cacheViewDisposed = true;
        container.querySelector("#switch-keyboard-shortcuts").onclick = null;
        languageGeneration++;
        clearTimeout(languageTimer);
        languageTimer = null;
        statsGeneration++;
        statsController?.abort();
        statsController = null;
    };

    async function loadCacheStats() {
        const generation = ++statsGeneration;
        statsController?.abort();
        const controller = new AbortController();
        statsController = controller;
        // 📱 Web 模式：无本地磁盘缓存，仅统计浏览器缓存
        if (IS_WEB_MODE) {
            statsController = null;
            const browserStats = getBrowserCacheStats();
            if (!browserStats.available) {
                const status = lastStatsHTML === null ? t('settings.cache_stats_unavailable') : t('settings.cache_stats_stale');
                cacheStatsPanel.innerHTML = `<div>${status}</div>` + (lastStatsHTML || '');
                return;
            }
            cacheStatsPanel.innerHTML = `
                <div class="ranking-settings__stat" >
                    <span class="ranking-settings__stat-title" >${t('settings.cache_browser')}：</span>${browserStats.count} ${t('settings.files')} · ${formatSize(browserStats.totalSize)}
                </div>
            `;
            lastStatsHTML = cacheStatsPanel.innerHTML;
            return;
        }
        try {
            const [diskRes, browserStats] = await Promise.all([
                getDiskCacheStats({ signal: controller.signal }),
                Promise.resolve(getBrowserCacheStats())
            ]);
            if (generation !== statsGeneration || cacheViewDisposed || !container.isConnected) return;
            if (!browserStats.available) throw new Error('cache_stats_unavailable');

            const imageCount = diskRes.image_count;
            const imageSize = diskRes.image_size;
            const videoCount = diskRes.video_count;
            const videoSize = diskRes.video_size;
            const browserCount = browserStats.count;
            const browserSize = browserStats.totalSize;

            const hasAnyCache = imageCount > 0 || videoCount > 0 || browserCount > 0;

            if (!hasAnyCache) {
                cacheStatsPanel.innerHTML = `
                    <div class="ranking-settings__stat-muted" >
                        ${t('settings.no_cache')}
                    </div>
                `;
                lastStatsHTML = cacheStatsPanel.innerHTML;
                return;
            }

            cacheStatsPanel.innerHTML = `
                <div class="ranking-settings__stat" >
                    <span class="ranking-settings__stat-title" >${t('settings.cache_disk_images')}：</span>${imageCount} ${t('settings.files')} · ${formatSize(imageSize)}
                </div>
                <div class="ranking-settings__stat" >
                    <span class="ranking-settings__stat-title" >${t('settings.cache_disk_videos')}：</span>${videoCount} ${t('settings.files')} · ${formatSize(videoSize)}
                </div>
                <div class="ranking-settings__stat" >
                    <span class="ranking-settings__stat-title" >${t('settings.cache_browser')}：</span>${browserCount} ${t('settings.files')} · ${formatSize(browserSize)}
                </div>
            `;
            lastStatsHTML = cacheStatsPanel.innerHTML;
        } catch (e) {
            if (generation !== statsGeneration || cacheViewDisposed || !container.isConnected) return;
            cacheStatsPanel.innerHTML = `
                <div class="ranking-settings__stat-muted" >
                    ${lastStatsHTML === null ? t('settings.cache_stats_unavailable') : t('settings.cache_stats_stale')}
                </div>
            ` + (lastStatsHTML || '');
        } finally {
            if (statsController === controller) statsController = null;
        }
    }

    // 🧹 缓存清理按钮
    const btnClearBrowser = container.querySelector("#btn-clear-browser-cache");
    const btnClearDisk = container.querySelector("#btn-clear-disk-cache");
    const btnClearAll = container.querySelector("#btn-clear-all-cache");
    const clearButtons = [btnClearBrowser, btnClearDisk, btnClearAll].filter(Boolean);
    let clearingCache = false;

    async function handleClearCache(btn, action) {
        if (clearingCache || cacheViewDisposed || !container.isConnected) return;
        clearingCache = true;
        const originalText = btn.textContent;
        btn.textContent = t('settings.cache_clearing');
        clearButtons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });

        try {
            if (action === 'browser' || action === 'all') {
                if (!clearAllCache()) throw new Error('cache_operation_unconfirmed');
            }
            if (action === 'disk' || action === 'all') {
                await clearDiskCache();
            }
            if (cacheViewDisposed || !container.isConnected) return;
            await loadCacheStats();
            if (!cacheViewDisposed && container.isConnected) showToast(t('settings.cache_cleared'), "success");
        } catch (e) {
            if (cacheViewDisposed || !container.isConnected) return;
            showToast(t('settings.cache_clear_unconfirmed'), "error");
            await loadCacheStats();
        } finally {
            btn.textContent = originalText;
            clearingCache = false;
            clearButtons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); });
        }
    }

    btnClearBrowser.onclick = () => handleClearCache(btnClearBrowser, 'browser');
    if (btnClearDisk) btnClearDisk.onclick = () => handleClearCache(btnClearDisk, 'disk');
    if (btnClearAll) btnClearAll.onclick = () => handleClearCache(btnClearAll, 'all');

    // 进入设置页时自动加载缓存统计
    loadCacheStats();

    return container;
}

/**
 * ⚙️ 打开设置页面（通过路由）
 */
export function openSettingsPage() {
    const view = createSettingsView();
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
}
