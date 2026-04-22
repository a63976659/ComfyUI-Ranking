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

// 🔧 设置项 localStorage Key
const SETTINGS_KEY = "ComfyCommunity_Settings";

// 🔧 默认设置值
const DEFAULT_SETTINGS = {
    showCreatorBanner: true,  // 创作者卡片显示背景图
    enableAnimations: true,   // ✨ 榜单切换动画
    enableSoundEffects: true, // 🔊 动画音效
    language: 'zh-CN',        // 🌐 界面语言
    cacheExpireSeconds: 7200, // ⏱️ 缓存刷新间隔（秒），默认2小时
    // 🚀 后续可扩展更多设置项
    // compactMode: false,    // 紧凑模式
    // darkMode: true,        // 深色模式
};

// 🌐 语言选项（双语显示）
const LANGUAGE_OPTIONS = [
    { value: 'zh-CN', label: '简体中文 / Simplified Chinese' },
    { value: 'en-US', label: 'English / 英语' }
];

/**
 * 📦 获取当前设置
 */
export function getSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
    } catch (e) {}
    return { ...DEFAULT_SETTINGS };
}

/**
 * 💾 保存设置
 */
export function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        // 🔔 广播设置变更事件，让其他组件响应
        window.dispatchEvent(new CustomEvent("comfy-settings-changed", { detail: settings }));
    } catch (e) {}
}

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
    } catch (e) {}
    return { count, totalSize };
}

/**
 * ⚙️ 创建设置页面视图
 */
export function createSettingsView() {
    const settings = getSettings();
    
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        color: "#ccc",
        fontSize: "14px",
        padding: "0",
        overflowY: "auto",
        flex: "1",
        boxSizing: "border-box"
    });
    
    // 添加开关样式
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        .setting-switch {
            position: relative;
            width: 44px;
            height: 24px;
            background: #444;
            border-radius: 12px;
            cursor: pointer;
            transition: 0.3s;
            flex-shrink: 0;
        }
        .setting-switch.active {
            background: #4CAF50;
        }
        .setting-switch::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background: #fff;
            border-radius: 50%;
            transition: 0.3s;
        }
        .setting-switch.active::after {
            left: 22px;
        }
        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            border-bottom: 1px solid #333;
            transition: background 0.2s;
        }
        .setting-item:hover {
            background: rgba(255,255,255,0.03);
        }
        .setting-select {
            background: #2a2a2a;
            border: 1px solid #444;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            min-width: 200px;
            outline: none;
            transition: 0.2s;
        }
        .setting-select:hover {
            border-color: #4CAF50;
        }
        .setting-select:focus {
            border-color: #4CAF50;
            box-shadow: 0 0 0 2px rgba(76,175,80,0.2);
        }
        .setting-select option {
            background: #2a2a2a;
            color: #fff;
            padding: 8px;
        }
        .setting-number-input {
            background: #2a2a2a;
            border: 1px solid #444;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            width: 120px;
            outline: none;
            transition: 0.2s;
        }
        .setting-number-input:hover {
            border-color: #4CAF50;
        }
        .setting-number-input:focus {
            border-color: #4CAF50;
            box-shadow: 0 0 0 2px rgba(76,175,80,0.2);
        }
        .setting-number-input::-webkit-inner-spin-button,
        .setting-number-input::-webkit-outer-spin-button {
            opacity: 1;
            cursor: pointer;
        }
        .cache-clear-btn {
            flex: 1;
            min-width: 120px;
            background: rgba(156, 39, 176, 0.15);
            border: 1px solid #9C27B0;
            color: #ccc;
            padding: 8px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: 0.2s;
        }
        .cache-clear-btn:hover:not(:disabled) {
            background: rgba(156, 39, 176, 0.3);
            color: #fff;
        }
        .cache-clear-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(styleSheet);
    
    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div style="display: flex; align-items: center; gap: 10px; padding: 15px; border-bottom: 1px solid #444; background: #1a1a1a;">
            <!-- 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移 -->
            <button id="btn-back-settings" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                <span style="font-size: 14px;">⬅</span> ${t('common.back')}
            </button>
            <span style="font-size: 16px; font-weight: bold; color: #fff;">⚙️ ${t('settings.title')}</span>
        </div>
        
        <!-- 设置内容区域 -->
        <div style="padding: 0; flex: 1;">
            
            <!-- 分类：通用设置 -->
            <div style="padding: 16px 16px 10px; color: #2196F3; font-size: 13px; font-weight: bold; border-bottom: 1px solid #333; background: rgba(33,150,243,0.05);">
                🌐 ${t('settings.general')}
            </div>
            
            <!-- 设置项：界面语言 -->
            <div class="setting-item">
                <div style="flex: 1;">
                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px; font-weight: 500;">${t('settings.language')} / Language</div>
                    <div style="color: #888; font-size: 12px; line-height: 1.4;">${t('settings.language_desc')} / Select display language</div>
                </div>
                <select id="select-language" class="setting-select">
                    ${LANGUAGE_OPTIONS.map(opt => 
                        `<option value="${opt.value}" ${(settings.language || 'zh-CN') === opt.value ? 'selected' : ''}>${opt.label}</option>`
                    ).join('')}
                </select>
            </div>
            
            <!-- 分类：显示偏好 -->
            <div style="padding: 16px 16px 10px; color: #4CAF50; font-size: 13px; font-weight: bold; border-bottom: 1px solid #333; background: rgba(76,175,80,0.05); margin-top: 20px;">
                📐 ${t('settings.display')}
            </div>
            
            <!-- 设置项：创作者卡片背景图 -->
            <div class="setting-item">
                <div style="flex: 1;">
                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px; font-weight: 500;">${t('settings.creator_banner')}</div>
                    <div style="color: #888; font-size: 12px; line-height: 1.4;">${t('settings.creator_banner_desc')}</div>
                </div>
                <div id="switch-creator-banner" class="setting-switch ${settings.showCreatorBanner ? 'active' : ''}"></div>
            </div>
            
            <!-- 分类：更多功能 -->
            <div style="padding: 16px 16px 10px; color: #FF9800; font-size: 13px; font-weight: bold; border-bottom: 1px solid #333; background: rgba(255,152,0,0.05); margin-top: 20px;">
                ✨ ${t('settings.animation')}
            </div>
            
            <!-- 设置项：榜单切换动画 -->
            <div class="setting-item">
                <div style="flex: 1;">
                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px; font-weight: 500;">${t('settings.animations')}</div>
                    <div style="color: #888; font-size: 12px; line-height: 1.4;">${t('settings.animations_desc')}</div>
                </div>
                <div id="switch-animations" class="setting-switch ${settings.enableAnimations ? 'active' : ''}"></div>
            </div>
            
            <!-- 设置项：动画音效 -->
            <div class="setting-item">
                <div style="flex: 1;">
                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px; font-weight: 500;">${t('settings.sound')}</div>
                    <div style="color: #888; font-size: 12px; line-height: 1.4;">${t('settings.sound_desc')}</div>
                </div>
                <div id="switch-sound-effects" class="setting-switch ${settings.enableSoundEffects ? 'active' : ''}"></div>
            </div>
            
            <!-- 分类：数据与缓存 -->
            <div style="padding: 16px 16px 10px; color: #9C27B0; font-size: 13px; font-weight: bold; border-bottom: 1px solid #333; background: rgba(156,39,176,0.05); margin-top: 20px;">
                ${t('settings.data_cache')}
            </div>
            
            <!-- 设置项：缓存刷新间隔 -->
            <div class="setting-item" style="flex-direction: column; align-items: flex-start; gap: 12px;">
                <div style="flex: 1; width: 100%;">
                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px; font-weight: 500;">${t('settings.cache_expire')}</div>
                    <div style="color: #888; font-size: 12px; line-height: 1.4;">${t('settings.cache_expire_desc')}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                    <input type="number" id="input-cache-expire" class="setting-number-input" 
                        value="${settings.cacheExpireSeconds || 7200}" 
                        min="60" max="86400" step="60">
                    <div style="color: #666; font-size: 11px; line-height: 1.5; padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 2px solid #9C27B0;">
                        💡 ${t('settings.cache_trigger_desc')}
                    </div>
                </div>
            </div>
            
            <!-- 设置项：缓存统计与清理 -->
            <div class="setting-item" style="flex-direction: column; align-items: flex-start; gap: 12px;">
                <div style="flex: 1; width: 100%;">
                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px; font-weight: 500;">${t('settings.cache_stats')}</div>
                </div>
                <div id="cache-stats-panel" style="width: 100%; display: flex; flex-direction: column; gap: 6px;">
                    <div style="padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid #9C27B0; color: #888; font-size: 13px;">
                        ${t('settings.no_cache')}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; width: 100%; flex-wrap: wrap;">
                    <button id="btn-clear-browser-cache" class="cache-clear-btn">${t('settings.clear_browser_cache')}</button>
                    <button id="btn-clear-disk-cache" class="cache-clear-btn">${t('settings.clear_disk_cache')}</button>
                    <button id="btn-clear-all-cache" class="cache-clear-btn">${t('settings.clear_all_cache')}</button>
                </div>
            </div>
            
            <!-- 动画预览提示 -->
            <div style="padding: 16px; background: rgba(33, 150, 243, 0.05); border-radius: 8px; margin: 16px; border: 1px dashed #333;">
                <div style="color: #2196F3; font-size: 12px; font-weight: bold; margin-bottom: 8px;">🎨 ${t('settings.animation_preview')}</div>
                <div style="color: #888; font-size: 11px; line-height: 1.5;">
                    • ${t('settings.anim_cascade')}<br>
                    • ${t('settings.anim_fan')}<br>
                    • ${t('settings.anim_abyss')}<br>
                    • ${t('settings.anim_dataflow')}
                </div>
            </div>
        </div>
        
        <!-- 底部信息 -->
        <div style="padding: 15px; border-top: 1px solid #333; background: #1a1a1a; text-align: center;">
            <div style="color: #666; font-size: 11px;">${t('settings.auto_save')}</div>
        </div>
    `;
    
    // 🔌 绑定事件
    
    // 返回按钮
    container.querySelector("#btn-back-settings").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 🌐 下拉控制：界面语言
    const selectLanguage = container.querySelector("#select-language");
    selectLanguage.onchange = () => {
        const newLang = selectLanguage.value;
        
        const currentSettings = getSettings();
        currentSettings.language = newLang;
        saveSettings(currentSettings);
        
        // 同步到 i18n 模块
        setLanguage(newLang);
        
        const langName = LANGUAGE_OPTIONS.find(opt => opt.value === newLang)?.label || newLang;
        showToast(`🌐 ${t('settings.language_changed') || '语言已切换为'} ${langName.split(' / ')[0]}`, "success");
        
        // 🔄 通过路由系统刷新，保持 activeInlineView 同步
        setTimeout(() => {
            // 先返回主页
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
            // 再重新打开设置页
            setTimeout(() => {
                const newSettingsView = createSettingsView();
                window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: newSettingsView } }));
            }, 50);
        }, 100);
    };
    
    // 🎛️ 开关控制：创作者背景图
    const switchCreatorBanner = container.querySelector("#switch-creator-banner");
    switchCreatorBanner.onclick = () => {
        const newValue = !switchCreatorBanner.classList.contains("active");
        switchCreatorBanner.classList.toggle("active", newValue);
        
        const currentSettings = getSettings();
        currentSettings.showCreatorBanner = newValue;
        saveSettings(currentSettings);
        
        showToast(newValue ? `✅ ${t('settings.creator_banner')} ${t('settings.enabled')}` : `${t('settings.creator_banner')} ${t('settings.disabled')}`, "success");
    };
    
    // 🎬 开关控制：榜单切换动画
    const switchAnimations = container.querySelector("#switch-animations");
    switchAnimations.onclick = () => {
        const newValue = !switchAnimations.classList.contains("active");
        switchAnimations.classList.toggle("active", newValue);
        
        const currentSettings = getSettings();
        currentSettings.enableAnimations = newValue;
        saveSettings(currentSettings);
        
        showToast(newValue ? `✨ ${t('settings.animations')} ${t('settings.enabled')}` : `${t('settings.animations')} ${t('settings.disabled')}`, "success");
    };
    
    // 🔊 开关控制：动画音效
    const switchSoundEffects = container.querySelector("#switch-sound-effects");
    switchSoundEffects.onclick = () => {
        const newValue = !switchSoundEffects.classList.contains("active");
        switchSoundEffects.classList.toggle("active", newValue);
        
        const currentSettings = getSettings();
        currentSettings.enableSoundEffects = newValue;
        saveSettings(currentSettings);
        
        showToast(newValue ? `🔊 ${t('settings.sound')} ${t('settings.enabled')}` : `${t('settings.sound')} ${t('settings.disabled')}`, "success");
    };
    
    // ⏱️ 数字输入：缓存刷新间隔
    const inputCacheExpire = container.querySelector("#input-cache-expire");
    inputCacheExpire.onchange = () => {
        let newValue = parseInt(inputCacheExpire.value);
        
        // 验证范围
        if (isNaN(newValue) || newValue < 60) {
            newValue = 60;
            inputCacheExpire.value = 60;
        } else if (newValue > 86400) {
            newValue = 86400;
            inputCacheExpire.value = 86400;
        }
        
        const currentSettings = getSettings();
        currentSettings.cacheExpireSeconds = newValue;
        saveSettings(currentSettings);
        
        // 转换为小时和分钟显示
        let timeDisplay = '';
        if (newValue >= 3600) {
            const hours = Math.floor(newValue / 3600);
            const mins = Math.floor((newValue % 3600) / 60);
            timeDisplay = mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
        } else if (newValue >= 60) {
            timeDisplay = `${Math.floor(newValue / 60)}分钟`;
        } else {
            timeDisplay = `${newValue}秒`;
        }
        
        showToast(`⏱️ ${t('settings.cache_expire')}: ${timeDisplay}`, "success");
    };
    
    // 📊 缓存统计面板
    const cacheStatsPanel = container.querySelector("#cache-stats-panel");
    
    async function loadCacheStats() {
        try {
            const [diskRes, browserStats] = await Promise.all([
                fetch("/community_hub/cache/stats").then(r => r.ok ? r.json() : null).catch(() => null),
                Promise.resolve(getBrowserCacheStats())
            ]);
            
            const imageCount = diskRes?.image_count || 0;
            const imageSize = diskRes?.image_size || 0;
            const videoCount = diskRes?.video_count || 0;
            const videoSize = diskRes?.video_size || 0;
            const browserCount = browserStats.count;
            const browserSize = browserStats.totalSize;
            
            const hasAnyCache = imageCount > 0 || videoCount > 0 || browserCount > 0;
            
            if (!hasAnyCache) {
                cacheStatsPanel.innerHTML = `
                    <div style="padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid #9C27B0; color: #888; font-size: 13px;">
                        ${t('settings.no_cache')}
                    </div>
                `;
                return;
            }
            
            cacheStatsPanel.innerHTML = `
                <div style="padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid #9C27B0; color: #aaa; font-size: 13px;">
                    <span style="color: #ccc;">${t('settings.cache_disk_images')}：</span>${imageCount} ${t('settings.files')} · ${formatSize(imageSize)}
                </div>
                <div style="padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid #9C27B0; color: #aaa; font-size: 13px;">
                    <span style="color: #ccc;">${t('settings.cache_disk_videos')}：</span>${videoCount} ${t('settings.files')} · ${formatSize(videoSize)}
                </div>
                <div style="padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid #9C27B0; color: #aaa; font-size: 13px;">
                    <span style="color: #ccc;">${t('settings.cache_browser')}：</span>${browserCount} ${t('settings.files')} · ${formatSize(browserSize)}
                </div>
            `;
        } catch (e) {
            cacheStatsPanel.innerHTML = `
                <div style="padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid #9C27B0; color: #888; font-size: 13px;">
                    ${t('settings.no_cache')}
                </div>
            `;
        }
    }
    
    // 🧹 缓存清理按钮
    const btnClearBrowser = container.querySelector("#btn-clear-browser-cache");
    const btnClearDisk = container.querySelector("#btn-clear-disk-cache");
    const btnClearAll = container.querySelector("#btn-clear-all-cache");
    
    async function handleClearCache(btn, action) {
        const originalText = btn.textContent;
        btn.textContent = t('settings.cache_clearing');
        btn.disabled = true;
        
        try {
            if (action === 'browser' || action === 'all') {
                clearAllCache();
            }
            if (action === 'disk' || action === 'all') {
                await fetch("/community_hub/cache/clear", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ target: "all" })
                });
            }
            await loadCacheStats();
            showToast(t('settings.cache_cleared'), "success");
        } catch (e) {
            showToast(t('settings.cache_cleared'), "success");
            await loadCacheStats();
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
    
    btnClearBrowser.onclick = () => handleClearCache(btnClearBrowser, 'browser');
    btnClearDisk.onclick = () => handleClearCache(btnClearDisk, 'disk');
    btnClearAll.onclick = () => handleClearCache(btnClearAll, 'all');
    
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
