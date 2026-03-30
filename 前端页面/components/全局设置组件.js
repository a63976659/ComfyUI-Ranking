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

// 🔧 设置项 localStorage Key
const SETTINGS_KEY = "ComfyCommunity_Settings";

// 🔧 默认设置值
const DEFAULT_SETTINGS = {
    showCreatorBanner: true,  // 创作者卡片显示背景图
    // 🚀 后续可扩展更多设置项
    // compactMode: false,    // 紧凑模式
    // darkMode: true,        // 深色模式
};

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
    `;
    document.head.appendChild(styleSheet);
    
    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div style="display: flex; align-items: center; gap: 10px; padding: 15px; border-bottom: 1px solid #444; background: #1a1a1a;">
            <!-- 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移 -->
            <button id="btn-back-settings" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                <span style="font-size: 14px;">⬅</span> 返回
            </button>
            <span style="font-size: 16px; font-weight: bold; color: #fff;">⚙️ 界面设置</span>
        </div>
        
        <!-- 设置内容区域 -->
        <div style="padding: 0; flex: 1;">
            
            <!-- 分类：显示偏好 -->
            <div style="padding: 16px 16px 10px; color: #4CAF50; font-size: 13px; font-weight: bold; border-bottom: 1px solid #333; background: rgba(76,175,80,0.05);">
                📐 显示偏好
            </div>
            
            <!-- 设置项：创作者卡片背景图 -->
            <div class="setting-item">
                <div style="flex: 1;">
                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px; font-weight: 500;">创作者卡片背景图</div>
                    <div style="color: #888; font-size: 12px; line-height: 1.4;">开启后创作者列表卡片显示个人背景图，关闭后显示简洁纯色风格</div>
                </div>
                <div id="switch-creator-banner" class="setting-switch ${settings.showCreatorBanner ? 'active' : ''}"></div>
            </div>
            
            <!-- 分类：更多功能 -->
            <div style="padding: 16px 16px 10px; color: #FF9800; font-size: 13px; font-weight: bold; border-bottom: 1px solid #333; background: rgba(255,152,0,0.05); margin-top: 20px;">
                🚀 更多功能
            </div>
            
            <!-- 占位提示 -->
            <div style="padding: 30px 16px; color: #666; font-size: 13px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 10px; opacity: 0.5;">🔧</div>
                更多设置项即将推出，敬请期待...
            </div>
        </div>
        
        <!-- 底部信息 -->
        <div style="padding: 15px; border-top: 1px solid #333; background: #1a1a1a; text-align: center;">
            <div style="color: #666; font-size: 11px;">设置会自动保存到本地</div>
        </div>
    `;
    
    // 🔌 绑定事件
    
    // 返回按钮
    container.querySelector("#btn-back-settings").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 🎛️ 开关控制：创作者背景图
    const switchCreatorBanner = container.querySelector("#switch-creator-banner");
    switchCreatorBanner.onclick = () => {
        const newValue = !switchCreatorBanner.classList.contains("active");
        switchCreatorBanner.classList.toggle("active", newValue);
        
        const currentSettings = getSettings();
        currentSettings.showCreatorBanner = newValue;
        saveSettings(currentSettings);
        
        showToast(newValue ? "已开启创作者背景图" : "已关闭创作者背景图", "success");
    };
    
    return container;
}

/**
 * ⚙️ 打开设置页面（通过路由）
 */
export function openSettingsPage() {
    const view = createSettingsView();
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
}
