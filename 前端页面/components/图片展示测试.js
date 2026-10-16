// 前端页面/components/图片展示测试.js
// ==========================================
// 🖼️ 全屏图像播放器组件
// ==========================================
// 功能：沉浸式全屏图片浏览，支持方块聚合载入 + 粒子消散载出动画
// 接口：openImageViewer(imageUrls, startIndex, options)
// ==========================================

import { escapeHtml, API, IS_WEB_MODE, normalizeProfileImageUrl } from "../core/全局配置.js";
import { t } from "./用户体验增强.js";

// ==========================================
// 🎨 CSS样式定义（CSS-in-JS模式）
// ==========================================
const VIEWER_STYLES = `
/* 全屏遮罩层 */
.cyber-image-viewer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #0a0a0a;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}

/* 图片主容器 */
.cyber-image-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 80px 80px 120px 80px;
    /* 移除 overflow: hidden 以允许动画超出容器 */
    overflow: visible;
}

/* 图片包装器 - 用于方块动画 */
.cyber-image-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    /* 移除 overflow: hidden 以允许动画超出容器 */
    overflow: visible;
}

/* 当前显示的图片 - 初始隐藏，动画完成后显示 */
.cyber-main-image {
    max-width: 85vw;
    max-height: 70vh;
    object-fit: contain;
    opacity: 0;
    visibility: hidden;
    /* 移除默认transition，由JS精确控制 */
    transition: none;
    will-change: opacity, visibility;
    user-select: none;
    -webkit-user-drag: none;
    /* 确保图片在方块容器之下，让方块动画可见 */
    position: relative;
    z-index: 1;
}

.cyber-main-image.visible {
    opacity: 1;
    visibility: visible;
}

/* 方块动画容器 */
.cyber-blocks-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: grid;
    pointer-events: none;
    /* z-index必须高于图片，确保方块动画可见 */
    z-index: 20;
    /* 确保方块容器在wrapper中正确居中定位 */
    box-sizing: border-box;
    /* overflow: visible 允许方块从容器外飞入 */
    overflow: visible;
}

/* 单个方块 */
.cyber-block {
    will-change: transform, opacity;
    backface-visibility: hidden;
}

/* 粒子消散容器 */
.cyber-particles-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    /* z-index必须高于图片，确保粒子动画可见 */
    z-index: 20;
}

/* 单个粒子 */
.cyber-particle {
    position: absolute;
    will-change: transform, opacity;
    backface-visibility: hidden;
}

/* 简约加载动画 */
.cyber-loader {
    position: absolute;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.cyber-loader::before {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    border-top-color: #fff;
    animation: loaderSpin 0.8s linear infinite;
}

@keyframes loaderSpin {
    to { transform: rotate(360deg); }
}

/* 关闭按钮 */
.cyber-close-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 44px;
    height: 44px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    z-index: 20;
}

.cyber-close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
}

/* 左右切换区域 */
.cyber-nav-zone {
    position: absolute;
    top: 0;
    width: 15%;
    height: 100%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 15;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
}

.cyber-nav-zone:hover {
    opacity: 1;
}

.cyber-nav-zone:focus-visible,
.cyber-close-btn:focus-visible,
.cyber-autoplay-btn:focus-visible {
    opacity: 1;
    outline: 3px solid #00ff96;
    outline-offset: -4px;
}

.cyber-nav-zone.left {
    left: 0;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, transparent 100%);
}

.cyber-nav-zone.right {
    right: 0;
    background: linear-gradient(-90deg, rgba(255, 255, 255, 0.05) 0%, transparent 100%);
}

/* 导航箭头 */
.cyber-nav-arrow {
    width: 50px;
    height: 50px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 20px;
    transition: all 0.3s ease;
    background: rgba(0, 0, 0, 0.3);
}

.cyber-nav-zone:hover .cyber-nav-arrow {
    transform: scale(1.1);
    background: rgba(255, 255, 255, 0.1);
}

/* 底部信息栏 */
.cyber-info-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 20px 40px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 20;
}

/* 图片计数器 */
.cyber-counter {
    font-size: 14px;
    color: #fff;
    font-family: 'Consolas', monospace;
    letter-spacing: 2px;
}

.cyber-counter .current {
    font-size: 24px;
    font-weight: bold;
}

.cyber-counter .total {
    color: rgba(255, 255, 255, 0.6);
}

/* 缩略图导航条 */
.cyber-thumbnails {
    display: flex;
    gap: 8px;
    align-items: center;
}

.cyber-thumb {
    width: 50px;
    height: 35px;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    border: 0;
    padding: 0;
    background: transparent;
    border: 2px solid transparent;
    transition: all 0.3s ease;
    opacity: 0.5;
}

.cyber-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.cyber-thumb:hover {
    opacity: 0.8;
    transform: scale(1.05);
}

.cyber-thumb.active {
    border-color: #fff;
    opacity: 1;
}

.cyber-thumb:focus-visible {
    outline: 3px solid #00ff96;
    outline-offset: 2px;
}

/* 键盘提示 */
.cyber-keyboard-hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    display: flex;
    gap: 15px;
}

.cyber-keyboard-hint span {
    display: flex;
    align-items: center;
    gap: 4px;
}

.cyber-key {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: monospace;
}

/* 自动播放按钮 */
.cyber-autoplay-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    width: 40px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    color: #fff;
    margin-right: 15px;
}

.cyber-autoplay-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
}

.cyber-autoplay-btn.active {
    background: rgba(0, 255, 150, 0.2);
    color: #00ff96;
}

.cyber-autoplay-btn svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
}

/* 图片加载错误状态 */
.cyber-error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    color: #ff6b6b;
}

.cyber-error-state svg {
    width: 60px;
    height: 60px;
    opacity: 0.5;
}

/* 预加载占位 */
.cyber-preload {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    z-index: -1;
}
`;

// ==========================================
// 🚀 核心功能实现
// ==========================================

/**
 * 计算动画网格布局（方块和粒子动画共用）
 * @param {number} displayWidth  - 显示区域宽度
 * @param {number} displayHeight - 显示区域高度
 * @param {number} maxGridSize   - 较长边最多分格数
 * @returns {{ rows: number, cols: number, cellSize: number }}
 */
function _calcGridLayout(displayWidth, displayHeight, maxGridSize) {
    const initialCellSize = Math.max(displayWidth, displayHeight) / maxGridSize;
    const cols = Math.min(Math.ceil(displayWidth / initialCellSize), maxGridSize);
    const rows = Math.min(Math.ceil(displayHeight / initialCellSize), maxGridSize);
    // 反算实际单元尺寸：取两个方向中较大的值，确保 1:1 并完全覆盖
    const cellSize = Math.max(displayWidth / cols, displayHeight / rows);
    return { rows, cols, cellSize };
}

/**
 * 图片查看器状态管理
 */
class CyberImageViewer {
    constructor(imageUrls, startIndex = 0) {
        // 按运行模式处理图片地址
        const sources = Array.isArray(imageUrls) ? imageUrls.map(url => this._proxyImageUrl(url)) : [];
        const requestedIndex = Number.isInteger(startIndex) ? Math.max(0, Math.min(startIndex, sources.length - 1)) : 0;
        this.imageUrls = sources.filter(Boolean);
        this.currentIndex = Math.max(0, Math.min(sources.slice(0, requestedIndex).filter(Boolean).length, this.imageUrls.length - 1));
        this.preloadCache = new Map();
        this._preloadRequests = new Map();
        this._imageReads = new Set();
        this._loadGeneration = 0;
        this._mainLoadController = null;
        this.isAnimating = false;
        this.container = null;
        this.elements = {};
        // 动画ID计数器，用于快速点击中断动画
        this._animationId = 0;
        // 自动播放状态管理
        this._autoPlayEnabled = false;
        this._autoPlayTimerId = null;
        this._autoWaitTimerId = null;
        this._autoPlayInterval = 1000; // 默认1秒展示时间
        this._autoPlayStateChangeCallbacks = []; // 状态变化回调
        this._returnFocus = document.activeElement;
        this._frames = new Map();
        this._timers = new Map();
        this._eventCleanups = [];
        this._removalObserver = null;
        this._wasMounted = false;
        this._disposed = false;
    }

    _isActive(allowClosing = false) {
        return !this._disposed && (!this._isClosing || allowClosing) && !!this.container?.isConnected;
    }

    _scheduleFrame(callback, allowClosing = false) {
        if (!this._isActive(allowClosing)) return null;
        const record = {};
        const id = requestAnimationFrame(time => {
            if (this._frames.get(id) !== record) return;
            this._frames.delete(id);
            if (!this._isActive(allowClosing)) {
                if (!this.container?.isConnected) this._dispose();
                return;
            }
            callback(time);
        });
        this._frames.set(id, record);
        return id;
    }

    _scheduleTimer(callback, delay, onCancel = null, allowClosing = false) {
        if (!this._isActive(allowClosing)) { onCancel?.(); return null; }
        const record = { onCancel };
        const id = setTimeout(() => {
            if (this._timers.get(id) !== record) return;
            this._timers.delete(id);
            if (!this._isActive(allowClosing)) {
                onCancel?.();
                if (!this.container?.isConnected) this._dispose();
                return;
            }
            callback();
        }, delay);
        this._timers.set(id, record);
        return id;
    }

    _cancelTimer(id) {
        if (id == null) return;
        const record = this._timers.get(id);
        if (!record) return;
        this._timers.delete(id);
        clearTimeout(id);
        record.onCancel?.();
    }

    _listen(target, type, callback, options) {
        const owned = event => {
            if (!this._isActive()) return;
            this._watchRemoval();
            callback(event);
        };
        target.addEventListener(type, owned, options);
        this._eventCleanups.push(() => target.removeEventListener(type, owned, options));
    }

    _watchRemoval() {
        if (this._disposed || this._removalObserver) return;
        const container = this.container;
        const inspect = records => {
            if (this._disposed || this._removalObserver !== observer) return;
            if (container.isConnected) { this._wasMounted = true; return; }
            const appeared = records.some(record => [...record.addedNodes, ...record.removedNodes]
                .some(node => node === container || node.contains?.(container)));
            if (this._wasMounted || appeared) this._dispose();
        };
        const observer = new MutationObserver(inspect);
        this._removalObserver = observer;
        observer.observe(document.body, { childList: true, subtree: true });
        queueMicrotask(() => {
            if (this._disposed || this._removalObserver !== observer) return;
            inspect(observer.takeRecords());
            if (!container.isConnected && !this._wasMounted && !this._disposed) {
                observer.disconnect();
                this._removalObserver = null;
            }
        });
    }

    _cancelAnimationWork() {
        this._animationId++;
        for (const id of this._frames.keys()) cancelAnimationFrame(id);
        this._frames.clear();
        for (const id of [...this._timers.keys()]) this._cancelTimer(id);
        this.container?.querySelectorAll('.cyber-blocks-container, .cyber-particles-container').forEach(node => node.remove());
        this.isAnimating = false;
        this._autoPlayTimerId = null;
        this._autoWaitTimerId = null;
    }

    _stopOwnedWork() {
        this._loadGeneration++;
        this._mainLoadController?.abort();
        this._mainLoadController = null;
        for (const cancel of [...this._imageReads]) cancel();
        for (const controller of this._preloadRequests.values()) controller.abort();
        this._preloadRequests.clear();
        for (const image of this.preloadCache.values()) image.src = '';
        this.preloadCache.clear();
        const wasPlaying = this._autoPlayEnabled;
        this._autoPlayEnabled = false;
        this._cancelTimer(this._autoPlayTimerId);
        this._autoPlayTimerId = null;
        if (wasPlaying && this.container?.isConnected) {
            try { this._updateAutoPlayUI(); } catch (_) { console.warn('Image viewer playback cleanup failed'); }
        }
        this._cancelAnimationWork();
        for (const cleanup of this._eventCleanups) cleanup();
        this._eventCleanups = [];
        this._keydownHandler = null;
    }

    _dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._isClosing = true;
        this._stopOwnedWork();
        this._removalObserver?.disconnect();
        this._removalObserver = null;
        this._returnFocus = null;
        this._autoPlayStateChangeCallbacks = [];
        this.container?.querySelectorAll('img').forEach(image => image.removeAttribute('src'));
        this.imageUrls = [];
    }

    /**
     * 按本地或网页模式处理图片地址
     * 自动识别代理URL、data: URL、blob: URL和普通HTTP(S) URL
     */
    _proxyImageUrl(url) {
        const source = normalizeProfileImageUrl(url, IS_WEB_MODE);
        if (!source) return '';
        return !IS_WEB_MODE && /^https?:\/\//i.test(source)
            ? API.LOCAL_IMAGE_PROXY_PREFIX + encodeURIComponent(source) : source;
    }

    /**
     * 创建查看器DOM结构
     * @param {Object} options - 配置选项
     * @param {string} options.background - 背景色，默认 '#0a0a0a'
     * @param {boolean} options.opaque - 是否不透明背景，默认true
     */
    create(options = {}) {
        if (!this.imageUrls.length) return null;
        const { background = '#0a0a0a', opaque = true } = options;

        // 注入样式
        if (!document.getElementById('cyber-viewer-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'cyber-viewer-styles';
            styleEl.textContent = VIEWER_STYLES;
            document.head.appendChild(styleEl);
        }

        // 创建主容器
        this.container = document.createElement('div');
        this.container.className = 'cyber-image-viewer';
        this.container.setAttribute('role', 'dialog');
        this.container.setAttribute('aria-modal', 'true');
        this.container.setAttribute('aria-label', t('image.viewer.dialog'));
        this.container.tabIndex = -1;
        this.container.style.background = background;

        this.container.innerHTML = `
            <!-- 关闭按钮 -->
            <button type="button" class="cyber-close-btn" title="${escapeHtml(t('image.viewer.close'))}" aria-label="${escapeHtml(t('image.viewer.close'))}">×</button>

            <!-- 图片主容器 -->
            <div class="cyber-image-container">
                <div class="cyber-image-wrapper" id="cyber-image-wrapper">
                    <img class="cyber-main-image" src="" alt="" id="cyber-main-image">
                    <div class="cyber-loader"></div>
                </div>
            </div>

            <!-- 左右导航区域 -->
            <button type="button" class="cyber-nav-zone left" title="${escapeHtml(t('image.viewer.previous'))}" aria-label="${escapeHtml(t('image.viewer.previous'))}">
                <div class="cyber-nav-arrow">❮</div>
            </button>
            <button type="button" class="cyber-nav-zone right" title="${escapeHtml(t('image.viewer.next'))}" aria-label="${escapeHtml(t('image.viewer.next'))}">
                <div class="cyber-nav-arrow">❯</div>
            </button>

            <!-- 底部信息栏 -->
            <div class="cyber-info-bar">
                <div class="cyber-counter" role="status" aria-live="polite" aria-atomic="true">
                    <span class="current">1</span>
                    <span class="separator"> / </span>
                    <span class="total">${this.imageUrls.length}</span>
                </div>
                <div class="cyber-thumbnails"></div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button type="button" class="cyber-autoplay-btn" title="${escapeHtml(t('image.viewer.autoplay'))}" aria-label="${escapeHtml(t('image.viewer.autoplay'))}">
                        <svg viewBox="0 0 24 24" class="autoplay-icon-play">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        <svg viewBox="0 0 24 24" class="autoplay-icon-pause" style="display: none;">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        </svg>
                    </button>
                    <div class="cyber-keyboard-hint">
                        <span><span class="cyber-key">ESC</span> ${escapeHtml(t('image.viewer.close_short'))}</span>
                    </div>
                </div>
            </div>

            <!-- 预加载容器 -->
            <div class="cyber-preload"></div>
        `;

        // 缓存DOM元素引用
        this.elements = {
            mainImage: this.container.querySelector('.cyber-main-image'),
            wrapper: this.container.querySelector('.cyber-image-wrapper'),
            loader: this.container.querySelector('.cyber-loader'),
            counter: this.container.querySelector('.cyber-counter'),
            counterCurrent: this.container.querySelector('.cyber-counter .current'),
            thumbnails: this.container.querySelector('.cyber-thumbnails'),
            preloadContainer: this.container.querySelector('.cyber-preload'),
            navLeft: this.container.querySelector('.cyber-nav-zone.left'),
            navRight: this.container.querySelector('.cyber-nav-zone.right'),
            closeBtn: this.container.querySelector('.cyber-close-btn'),
            autoPlayBtn: this.container.querySelector('.cyber-autoplay-btn'),
            autoPlayIconPlay: this.container.querySelector('.autoplay-icon-play'),
            autoPlayIconPause: this.container.querySelector('.autoplay-icon-pause')
        };

        // 绑定事件
        this._bindEvents();

        // 渲染缩略图
        this._renderThumbnails();

        this._watchRemoval();
        // 加载初始图片
        this._loadImage(this.currentIndex);

        return this.container;
    }

    /**
     * 设置自动播放间隔时间（毫秒）
     * @param {number} interval - 间隔时间（毫秒）
     */
    setAutoPlayInterval(interval) {
        this._autoPlayInterval = Math.max(2000, Math.min(interval, 30000)); // 限制2-30秒
    }

    /**
     * 获取自动播放状态
     * @returns {boolean} 是否正在自动播放
     */
    getAutoPlayEnabled() {
        return this._autoPlayEnabled;
    }

    /**
     * 切换自动播放状态
     */
    toggleAutoPlay() {
        if (this._autoPlayEnabled) {
            this._stopAutoPlay();
        } else {
            this._startAutoPlay();
        }
    }

    /**
     * 开始自动播放
     */
    _startAutoPlay() {
        if (!this._isActive() || this._autoPlayEnabled) return;
        
        console.log('▶️ 自动播放开始');
        this._autoPlayEnabled = true;
        this._updateAutoPlayUI();
        
        // 如果当前没有动画，立即开始第一张图片的计时
        if (!this.isAnimating) {
            this._scheduleNextAutoPlay();
        } else {
            this._waitForBlockAnimationAndSchedule(this._animationId);
        }
    }

    /**
     * 停止自动播放
     */
    _stopAutoPlay() {
        if (!this._autoPlayEnabled) return;
        
        console.log('⏸️ 自动播放停止');
        this._autoPlayEnabled = false;
        this._cancelTimer(this._autoWaitTimerId);
        this._autoWaitTimerId = null;
        
        // 清除定时器
        if (this._autoPlayTimerId) {
            this._cancelTimer(this._autoPlayTimerId);
            this._autoPlayTimerId = null;
        }
        
        this._updateAutoPlayUI();
    }

    /**
     * 更新自动播放按钮UI状态
     */
    _updateAutoPlayUI() {
        const btn = this.elements.autoPlayBtn;
        const playIcon = this.elements.autoPlayIconPlay;
        const pauseIcon = this.elements.autoPlayIconPause;
        
        if (this._autoPlayEnabled) {
            btn.classList.add('active');
            btn.title = t('image.viewer.pause');
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            btn.classList.remove('active');
            btn.title = t('image.viewer.autoplay');
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
        
        btn.setAttribute('aria-label', btn.title);

        // 触发状态变化回调
        this._autoPlayStateChangeCallbacks.forEach(cb => cb(this._autoPlayEnabled));
    }

    /**
     * 注册自动播放状态变化回调
     * @param {Function} callback - 回调函数，参数为新的自动播放状态
     */
    onAutoPlayStateChange(callback) {
        if (this._isClosing || this._disposed) return;
        this._autoPlayStateChangeCallbacks.push(callback);
    }

    /**
     * 调度下一次自动播放
     * 自动播放流程：等待展示时间 → 触发载出动画 → 等待1秒 → 切换到下一张 → 触发载入动画 → 重复
     */
    _scheduleNextAutoPlay() {
        // 清除之前的定时器
        if (this._autoPlayTimerId) {
            this._cancelTimer(this._autoPlayTimerId);
            this._autoPlayTimerId = null;
        }
        
        if (!this._autoPlayEnabled) return;
        
        const currentAnimId = this._animationId;
        
        console.log(`⏱️ 自动播放：等待 ${this._autoPlayInterval}ms 后切换`);
        
        this._autoPlayTimerId = this._scheduleTimer(() => {
            // 检查动画ID守卫
            if (currentAnimId !== this._animationId) {
                console.log('⛔ 自动播放定时器：动画已被中断，跳过本次切换');
                return;
            }
            
            // 检查是否还在自动播放状态
            if (!this._autoPlayEnabled) {
                console.log('⛔ 自动播放定时器：自动播放已停止，跳过本次切换');
                return;
            }
            
            // 检查是否正在动画中
            if (this.isAnimating) {
                console.log('⏳ 自动播放：当前正在动画中，等待下次调度');
                this._scheduleNextAutoPlay();
                return;
            }
            
            console.log('🔄 自动播放：执行切换');
            
            // 执行切换（使用屏幕中心作为波浪起点）
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            
            // 使用 _autoPlayNext 方法进行切换，它会处理循环和动画完成后的调度
            this._autoPlayNext(centerX, centerY);
            
        }, this._autoPlayInterval);
    }

    /**
     * 自动播放下一张（内部方法）
     * 流程：粒子消散（载出）→ 等待1秒 → 新图片方块合并（载入）→ 调度下一次
     */
    async _autoPlayNext(clickX, clickY) {
        if (!this._autoPlayEnabled) return;
        
        // 递增动画ID，用于中断检测
        this._cancelAnimationWork();
        this._loadGeneration++;
        this._mainLoadController?.abort();
        this._mainLoadController = null;
        const currentAnimId = this._animationId;
        
        // 计算下一张索引（循环播放）
        const nextIndex = this.currentIndex < this.imageUrls.length - 1 ? this.currentIndex + 1 : 0;
        
        console.log('🔄 自动播放切换到图片索引:', nextIndex);
        this.isAnimating = true;
        
        // 1. 执行粒子消散动画（载出）
        await this._playParticleDisperseAnimation(clickX, clickY);
        
        // 检查是否被中断
        if (currentAnimId !== this._animationId) return;
        
        // 2. 载出动画完全结束后，立即切换下一张（不等待）
        // await new Promise(resolve => setTimeout(resolve, 0));
        
        // 再次检查
        if (currentAnimId !== this._animationId) return;
        if (!this._autoPlayEnabled) return;
        
        // 3. 更新索引并加载新图片（这会触发方块合并动画）
        this.currentIndex = nextIndex;
        await this._loadImage(this.currentIndex);
        
        // 4. 动画完成后，调度下一次自动播放
        // 使用方块动画完成后的回调来确保时序正确
        this._waitForBlockAnimationAndSchedule(currentAnimId);
    }

    /**
     * 等待方块动画完成后调度下一次自动播放
     * @param {number} expectedAnimId - 期望的动画ID
     */
    _waitForBlockAnimationAndSchedule(expectedAnimId) {
        this._cancelTimer(this._autoWaitTimerId);
        this._autoWaitTimerId = null;
        const checkAndSchedule = () => {
            this._autoWaitTimerId = null;
            // 检查动画ID守卫
            if (expectedAnimId !== this._animationId) {
                console.log('⛔ 自动播放等待：动画已被中断');
                return;
            }
            
            // 检查是否还在自动播放状态
            if (!this._autoPlayEnabled) {
                console.log('⛔ 自动播放等待：自动播放已停止');
                return;
            }
            
            // 如果动画还在进行，继续等待
            if (this.isAnimating) {
                this._autoWaitTimerId = this._scheduleTimer(checkAndSchedule, 100);
                return;
            }
            
            // 动画完成，调度下一次
            console.log('✅ 自动播放：图片展示完成，调度下一次');
            this._scheduleNextAutoPlay();
        };
        
        // 开始检查
        checkAndSchedule();
    }

    /**
     * 绑定事件处理
     */
    _bindEvents() {
        // 键盘导航
        this._keydownHandler = (e) => {
            if (!this._isActive()) return;
            if (e.defaultPrevented || e.isComposing || e.keyCode === 229
                    || e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && e.key !== 'Tab')) return;
            if (e.key === 'Tab') {
                const controls = [...this.container.querySelectorAll('button:not([disabled]), [tabindex="0"]')];
                if (!controls.length) { e.preventDefault(); this.container.focus(); return; }
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (e.shiftKey && (document.activeElement === first || !this.container.contains(document.activeElement))) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && (document.activeElement === last || !this.container.contains(document.activeElement))) {
                    e.preventDefault(); first.focus();
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.close();

            }
        };
        this._listen(this.container, 'keydown', this._keydownHandler);

        // 点击导航区域 - 传递点击位置用于波浪效果
        this._listen(this.elements.navLeft, 'click', (e) => {
            this._stopAutoPlay(); // 手动切换时停止自动播放
            this.prev(e.clientX, e.clientY);
        });
        this._listen(this.elements.navRight, 'click', (e) => {
            this._stopAutoPlay(); // 手动切换时停止自动播放
            this.next(e.clientX, e.clientY);
        });

        // 关闭按钮
        this._listen(this.elements.closeBtn, 'click', () => this.close());

        // 自动播放按钮
        this._listen(this.elements.autoPlayBtn, 'click', () => this.toggleAutoPlay());

        // 阻止右键菜单
        this._listen(this.container, 'contextmenu', (e) => e.preventDefault());

        // 阻止拖拽
        this._listen(this.elements.mainImage, 'dragstart', (e) => e.preventDefault());
    }

    /**
     * 渲染缩略图导航
     */
    _renderThumbnails() {
        // 最多显示7个缩略图
        const maxThumbs = Math.min(this.imageUrls.length, 7);
        
        for (let i = 0; i < maxThumbs; i++) {
            const thumb = document.createElement('button');
            thumb.type = 'button';
            thumb.className = 'cyber-thumb' + (i === this.currentIndex ? ' active' : '');
            thumb.setAttribute('aria-label', t('image.viewer.image_position', { current: i + 1, total: this.imageUrls.length }));
            thumb.setAttribute('aria-current', i === this.currentIndex ? 'true' : 'false');
            // 🔒 XSS防护：图片 URL 来自其他用户发布的内容，写入 innerHTML 前必须转义
            thumb.innerHTML = `<img src="${escapeHtml(this.imageUrls[i])}" alt="">`;
            this._listen(thumb, 'click', (e) => {
                this._stopAutoPlay(); // 手动切换时停止自动播放
                this.goTo(i, e.clientX, e.clientY);
            });
            this.elements.thumbnails.appendChild(thumb);
        }

        // 如果图片太多，显示省略号
        if (this.imageUrls.length > maxThumbs) {
            const more = document.createElement('div');
            more.style.cssText = 'color: rgba(255,255,255,0.4); font-size: 12px; padding: 0 5px;';
            more.textContent = `+${this.imageUrls.length - maxThumbs}`;
            this.elements.thumbnails.appendChild(more);
        }
    }

    /**
     * 更新缩略图状态
     */
    _updateThumbnails() {
        const thumbs = this.elements.thumbnails.querySelectorAll('.cyber-thumb');
        thumbs.forEach((thumb, index) => {
            thumb.classList.toggle('active', index === this.currentIndex);
            thumb.setAttribute('aria-current', index === this.currentIndex ? 'true' : 'false');
        });
    }

    /**
     * 加载指定索引的图片
     */
    async _loadImage(index) {
        if (this._isClosing || index < 0 || index >= this.imageUrls.length) return;
        this._mainLoadController?.abort();
        const controller = new AbortController();
        this._mainLoadController = controller;
        const generation = ++this._loadGeneration;
        const container = this.container;
        const img = this.elements.mainImage;
        const url = this.imageUrls[index];
        const current = () => !this._isClosing && generation === this._loadGeneration &&
            this.container === container && this.elements.mainImage === img;
        img.style.transition = 'none';
        img.style.opacity = '0';
        img.style.visibility = 'hidden';
        img.classList.remove('visible');
        this.elements.loader.style.display = 'flex';
        let loaded = false;
        try {
            if (this.preloadCache.has(url)) {
                if (!container.isConnected) return;
                img.src = this.preloadCache.get(url).src;
                this._onImageLoaded(generation);
            } else {
                await this._loadImageAsync(url, { signal: controller.signal });
                if (!current() || !container.isConnected) return;
                this._watchRemoval();
                img.src = url;
                this._onImageLoaded(generation);
            }
            loaded = true;
        } catch (error) {
            if (!current() || !container.isConnected || controller.signal.aborted) return;
            this._watchRemoval();
            console.error('图片加载失败');
            this._onImageError();
        } finally {
            if (this._mainLoadController === controller) this._mainLoadController = null;
        }
        if (!current()) return;
        this.elements.counterCurrent.textContent = index + 1;
        img.alt = t('image.viewer.image_position', { current: index + 1, total: this.imageUrls.length });
        this._updateThumbnails();
        if (loaded) this._preloadAdjacent(index);
    }

    _loadImageAsync(url, { signal } = {}) {
        return new Promise((resolve, reject) => {
            if (this._isClosing || signal?.aborted) {
                reject(new DOMException('Image read cancelled', 'AbortError'));
                return;
            }
            const img = new Image();
            let settled = false;
            let timer = null;
            const finish = error => {
                if (settled) return;
                settled = true;
                if (timer !== null) clearTimeout(timer);
                img.onload = img.onerror = null;
                signal?.removeEventListener('abort', cancel);
                this._imageReads.delete(cancel);
                if (error) {
                    img.src = '';
                    reject(error);
                } else resolve(img);
            };
            const cancel = () => finish(new DOMException('Image read cancelled', 'AbortError'));
            this._imageReads.add(cancel);
            signal?.addEventListener('abort', cancel, { once: true });
            img.onload = () => finish(null);
            img.onerror = () => finish(new Error('Image read failed'));
            timer = setTimeout(() => finish(new Error('Image read timed out')), API.TIMEOUT);
            try { img.src = url; } catch (error) { finish(error); }
        });
    }

    /**
     * 图片加载完成回调 - 触发方块合并动画
     */
    _onImageLoaded(generation = this._loadGeneration) {
        const container = this.container;
        this._scheduleFrame(() => {
            if (this._isClosing || generation !== this._loadGeneration ||
                    this.container !== container || !container.isConnected) return;
            this.elements.loader.style.display = 'none';
            // 确保图片初始隐藏，不要在这里显示图片（同步立即隐藏，无过渡）
            const img = this.elements.mainImage;
            img.style.transition = 'none';
            img.style.opacity = '0';
            img.style.visibility = 'hidden';
            img.classList.remove('visible');
            // 强制同步布局，确保隐藏立即生效
            img.getBoundingClientRect();
            // 执行方块合并载入动画
            this._playBlockAssemblyAnimation();
            
            // 如果处于自动播放状态，在方块动画完成后调度下一次
            if (this._autoPlayEnabled) {
                this._waitForBlockAnimationAndSchedule(this._animationId);
            }
        });
    }

    /**
     * 方块合并载入动画 - 将图片分割成方块从随机位置飞入拼合（载出动画的倒放）
     * 使用与粒子消散相同的网格参数和背景图裁切方式
     */
    _playBlockAssemblyAnimation() {
        if (!this._isActive()) return;
        this.isAnimating = true;
        const currentAnimId = this._animationId; // 记录当前动画ID
        const img = this.elements.mainImage;
        const wrapper = this.elements.wrapper;
        const imgSrc = img.src;
        const imageBackground = `url(${JSON.stringify(imgSrc)})`;

        // 调试日志
        console.log('🎬 方块聚合动画开始');

        // 获取wrapper的实际尺寸
        const rect = wrapper.getBoundingClientRect();
        console.log('📐 Wrapper尺寸:', rect.width, 'x', rect.height);

        // 获取图片实际显示尺寸
        const imgWidth = img.naturalWidth || rect.width || 800;
        const imgHeight = img.naturalHeight || rect.height || 600;
        console.log('🖼️ 图片原始尺寸:', imgWidth, 'x', imgHeight);
        
        // 安全检查：如果图片尺寸无效，显示错误
        if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
            console.error('❌ 图片尺寸无效，无法播放动画');
            // 直接显示原图，不播放动画
            img.style.visibility = 'visible';
            img.style.opacity = '1';
            img.classList.add('visible');
            this.isAnimating = false;
            return;
        }

        // 计算适应容器的显示尺寸
        const containerWidth = rect.width || imgWidth;
        const containerHeight = rect.height || imgHeight;
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight, 1);
        const displayWidth = imgWidth * scale;
        const displayHeight = imgHeight * scale;
        console.log('📺 显示尺寸:', displayWidth, 'x', displayHeight, '缩放比例:', scale);

        // 网格配置 - 最多 9x9 = 81 个正方形方块
        const maxGridSize = 9;
        const { rows, cols, cellSize: blockSide } = _calcGridLayout(displayWidth, displayHeight, maxGridSize);
        const totalBlocks = cols * rows;
        const blockWidth = blockSide;
        const blockHeight = blockSide; // 1:1 正方形

        // 创建方块容器 - 使用绝对定位而不是grid，确保精确控制每个方块位置
        const blocksContainer = document.createElement('div');
        blocksContainer.className = 'cyber-blocks-container';
        blocksContainer.style.width = `${displayWidth}px`;
        blocksContainer.style.height = `${displayHeight}px`;
        blocksContainer.style.left = `${(containerWidth - displayWidth) / 2}px`;
        blocksContainer.style.top = `${(containerHeight - displayHeight) / 2}px`;
        
        console.log('🔲 方块容器位置:', blocksContainer.style.left, 'x', blocksContainer.style.top);
        console.log('🔲 方块尺寸:', blockWidth, 'x', blockHeight, '数量:', totalBlocks);

        const blocks = [];

        // 创建方块 - 使用与粒子消散相同的背景图裁切方式
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const block = document.createElement('div');
                block.className = 'cyber-block';
                block.style.position = 'absolute';
                block.style.width = `${blockWidth}px`;
                block.style.height = `${blockHeight}px`;
                block.style.left = `${c * blockSide}px`;
                block.style.top = `${r * blockSide}px`;
                
                // 使用与粒子消散相同的背景图设置方式
                block.style.backgroundImage = imageBackground;
                block.style.backgroundSize = `${displayWidth}px ${displayHeight}px`;
                // 背景定位：根据正方形方块的实际位置计算
                const bgPosX = c * blockSide;
                const bgPosY = r * blockSide; // 使用 blockSide（正方形边长）计算Y轴位置
                block.style.backgroundPosition = `-${bgPosX}px -${bgPosY}px`;
                block.style.backgroundRepeat = 'no-repeat';

                // 初始状态：从完全不可见的点开始（scale=0）
                // 使用整个视口作为动画舞台，方块可以从屏幕边缘甚至屏幕外飞入
                const randomX = (Math.random() - 0.5) * window.innerWidth * 1.5;
                const randomY = (Math.random() - 0.5) * window.innerHeight * 1.5;
                const randomRotate = (Math.random() - 0.5) * 360;
                const randomDelay = Math.random() * 300; // 0-300ms随机延迟

                // 设置初始transform（从完全不可见的点开始）
                block.style.transform = `translate(${randomX}px, ${randomY}px) rotate(${randomRotate}deg) scale(0)`;
                block.style.opacity = '0';
                block.style.transition = `all ${0.5 + Math.random() * 0.4}s cubic-bezier(0.15, 0.46, 0.45, 0.94) ${randomDelay}ms`;
                
                // 确保没有任何边框效果
                block.style.border = 'none';
                block.style.outline = 'none';
                block.style.boxShadow = 'none';
                block.style.borderRadius = '0';

                blocksContainer.appendChild(block);
                blocks.push({ element: block, delay: randomDelay, row: r, col: c });
            }
        }

        // 确保原始img隐藏，让方块动画可见（同步操作，在方块创建前完成）
        img.style.transition = 'none';
        img.style.opacity = '0';
        img.style.visibility = 'hidden';
        img.classList.remove('visible');
        // 强制同步布局，确保隐藏立即生效
        img.getBoundingClientRect();
        
        wrapper.appendChild(blocksContainer);
        console.log('✅ 方块容器已添加到wrapper');

        // 强制同步布局，确保初始状态被应用
        blocksContainer.getBoundingClientRect();

        // 触发方块聚合动画 - 使用双重requestAnimationFrame确保浏览器已渲染初始状态
        this._scheduleFrame(() => {
            this._scheduleFrame(() => {
                // 检查动画是否已被中断
                if (currentAnimId !== this._animationId) {
                    console.log('⛔ 方块聚合动画被中断，跳过动画触发');
                    return;
                }
                console.log('🎭 开始方块聚合动画');
                blocks.forEach(({ element }) => {
                    // 目标状态：聚合到正确位置
                    element.style.transform = 'translate(0, 0) rotate(0deg) scale(1)';
                    element.style.opacity = '1';
                });
            });
        });

        // 计算动画完成时间
        const maxDelay = Math.max(...blocks.map(b => b.delay));
        const animationDuration = 900 + maxDelay;
        console.log('⏱️ 动画持续时间:', animationDuration, 'ms');

        // 动画完成后显示完整图片并清理方块
        this._scheduleTimer(() => {
            // 检查动画是否已被中断
            if (currentAnimId !== this._animationId) {
                // 动画已被中断，只做清理
                console.log('⛔ 方块动画被中断，执行清理');
                if (blocksContainer.parentNode) {
                    blocksContainer.parentNode.removeChild(blocksContainer);
                }
                return;
            }
            
            console.log('✨ 方块动画完成，显示原图');
            
            // 先确保图片src正确设置
            if (img.src !== imgSrc) {
                img.src = imgSrc;
            }
            
            // 关键修复：先禁用transition避免闪烁，然后立即显示原图
            img.style.transition = 'none';
            img.style.visibility = 'visible';
            img.style.opacity = '1';
            
            // 强制同步布局，确保原图立即渲染
            img.getBoundingClientRect();
            
            // 然后淡出方块容器
            blocksContainer.style.opacity = '0';
            blocksContainer.style.transition = 'opacity 0.15s ease';

            // 等待方块淡出完成后移除容器，然后恢复transition
            this._scheduleTimer(() => {
                // 内层timeout也要检查
                if (currentAnimId !== this._animationId) {
                    if (blocksContainer.parentNode) {
                        blocksContainer.parentNode.removeChild(blocksContainer);
                    }
                    return;
                }
                
                if (blocksContainer.parentNode) {
                    blocksContainer.parentNode.removeChild(blocksContainer);
                }
                // 恢复transition（如果需要后续使用）
                img.style.transition = '';
                img.classList.add('visible');
                // 方块动画完全结束后，重置 isAnimating
                this.isAnimating = false;
                console.log('🔓 isAnimating 已重置为 false');
            }, 150);
        }, animationDuration);
    }

    /**
     * 粒子消散动画 - 当前图片碎裂成粒子飘散（灰飞烟灭效果）
     * 使用更多更小的粒子，波浪扩散效果
     * 支持多种路径类型：弧线(90%)、S形(5%)、直线(5%)
     */
    async _playParticleDisperseAnimation(clickX, clickY) {
        if (!this._isActive()) return;
        const currentAnimId = this._animationId; // 记录当前动画ID
        const img = this.elements.mainImage;
        const wrapper = this.elements.wrapper;
        const imgSrc = img.src;
        const imageBackground = `url(${JSON.stringify(imgSrc)})`;

        console.log('💨 粒子消散动画开始');

        // 载出动画开始前，立即隐藏原图（同步操作，确保在粒子创建前完成）
        img.style.transition = 'none';
        img.style.opacity = '0';
        img.style.visibility = 'hidden';
        img.classList.remove('visible');
        // 强制同步布局，确保隐藏立即生效
        img.getBoundingClientRect();

        // 获取图片显示尺寸
        const rect = wrapper.getBoundingClientRect();
        const imgWidth = img.naturalWidth || rect.width || 800;
        const imgHeight = img.naturalHeight || rect.height || 600;

        // 安全检查：如果图片尺寸无效，跳过动画
        if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
            console.error('❌ 图片尺寸无效，跳过粒子消散动画');
            return Promise.resolve();
        }

        const containerWidth = rect.width || imgWidth;
        const containerHeight = rect.height || imgHeight;
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight, 1);
        const displayWidth = imgWidth * scale;
        const displayHeight = imgHeight * scale;

        console.log('💨 粒子容器尺寸:', displayWidth, 'x', displayHeight);

        // 粒子网格配置 - 使用与载入动画相同的正方形逻辑
        const maxParticleGrid = 30; // 较长边最多分30份
        const { rows, cols, cellSize: particleSide } = _calcGridLayout(displayWidth, displayHeight, maxParticleGrid);
        const particleWidth = particleSide;
        const particleHeight = particleSide; // 强制1:1
        const COLS = cols;
        const ROWS = rows;

        // 创建粒子容器
        const particlesContainer = document.createElement('div');
        particlesContainer.className = 'cyber-particles-container';
        particlesContainer.style.width = `${displayWidth}px`;
        particlesContainer.style.height = `${displayHeight}px`;
        particlesContainer.style.left = `${(containerWidth - displayWidth) / 2}px`;
        particlesContainer.style.top = `${(containerHeight - displayHeight) / 2}px`;

        const particles = [];

        // 计算波浪扩散的中心点（如果没有提供点击位置，使用中心）
        const centerX = clickX !== undefined ? (clickX - rect.left - (containerWidth - displayWidth) / 2) : displayWidth / 2;
        const centerY = clickY !== undefined ? (clickY - rect.top - (containerHeight - displayHeight) / 2) : displayHeight / 2;

        // 创建粒子
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                // 随机决定路径类型：弧线(90%)、S形(5%)、直线(5%)
                const pathTypeRandom = Math.random();
                const pathType = pathTypeRandom < 0.9 ? 'arc' : (pathTypeRandom < 0.95 ? 's-curve' : 'straight');

                // 计算粒子到中心点的距离（用于波浪效果）
                const particleCenterX = c * particleWidth + particleWidth / 2;
                const particleCenterY = r * particleHeight + particleHeight / 2;
                const distanceToCenter = Math.sqrt(
                    Math.pow(particleCenterX - centerX, 2) +
                    Math.pow(particleCenterY - centerY, 2)
                );
                const maxDistance = Math.sqrt(displayWidth * displayWidth + displayHeight * displayHeight);
                const distanceRatio = distanceToCenter / maxDistance;

                // 波浪延迟：距离中心越远，延迟越大
                const waveDelay = distanceRatio * 200; // 0-200ms波浪延迟
                const randomDelay = Math.random() * 100; // 额外随机延迟
                const totalDelay = waveDelay + randomDelay;

                // 消散方向：从中心向外，加上随机偏移
                const angle = Math.atan2(particleCenterY - centerY, particleCenterX - centerX);
                const randomAngleOffset = (Math.random() - 0.5) * 2 * Math.PI * 0.6; // ±60%角度随机偏移
                const finalAngle = angle + randomAngleOffset;

                // 消散距离：使用整个视口作为动画舞台，粒子向屏幕四面八方飞散
                const baseDistance = Math.min(window.innerWidth, window.innerHeight) * 0.5 + Math.random() * Math.min(window.innerWidth, window.innerHeight) * 0.5;
                const distanceMultiplier = 0.5 + distanceRatio * 1.5;
                const finalDistance = baseDistance * distanceMultiplier * (1 + (Math.random() - 0.5) * 0.6); // ±30%距离随机偏移

                const disperseX = Math.cos(finalAngle) * finalDistance;
                const disperseY = Math.sin(finalAngle) * finalDistance;

                // 旋转 - 更大角度的旋转
                const randomRotate = (Math.random() - 0.5) * 720;

                // 计算动画时长和延迟
                const totalDuration = 0.75 + Math.random() * 0.375; // 0.75-1.125秒
                const delay = Math.random() * 100; // 0-100ms随机延迟
                const shapeDuration = totalDuration * 0.3; // 形变占前30%

                let particle, particleInner;

                if (pathType === 'arc' || pathType === 's-curve') {
                    // 弧线和S形路径：使用两层div嵌套实现
                    // 外层控制X轴位移，内层控制Y轴位移 + 形变效果
                    particle = document.createElement('div');
                    particle.className = 'cyber-particle';
                    particle.style.position = 'absolute';
                    particle.style.width = `${particleWidth}px`;
                    particle.style.height = `${particleHeight}px`;
                    particle.style.left = `${c * particleSide}px`;
                    particle.style.top = `${r * particleSide}px`;
                    particle.style.overflow = 'visible';
                    particle.style.border = 'none';
                    particle.style.outline = 'none';
                    particle.style.boxShadow = 'none';

                    // 内层div：包含背景图，控制Y轴和形变
                    particleInner = document.createElement('div');
                    particleInner.style.width = '100%';
                    particleInner.style.height = '100%';
                    particleInner.style.backgroundImage = imageBackground;
                    particleInner.style.backgroundSize = `${displayWidth}px ${displayHeight}px`;
                    particleInner.style.backgroundPosition = `-${c * particleSide}px -${r * particleSide}px`;
                    particleInner.style.backgroundRepeat = 'no-repeat';
                    particleInner.style.border = 'none';
                    particleInner.style.outline = 'none';
                    particleInner.style.boxShadow = 'none';

                    particle.appendChild(particleInner);

                    // 设置不同的easing组合来产生曲线效果
                    if (pathType === 'arc') {
                        // 弧线路径：X轴和Y轴使用不同的easing
                        // 随机选择弧线方向（向左弧或向右弧）
                        const arcDirection = Math.random() < 0.5 ? 1 : -1;
                        const xEasing = arcDirection > 0 ? 'ease-in' : 'ease-out';
                        const yEasing = arcDirection > 0 ? 'ease-out' : 'ease-in';

                        // 外层：控制X轴位移
                        particle.style.transform = 'translateX(0)';
                        particle.style.transition = `transform ${totalDuration}s ${xEasing} ${delay}ms`;

                        // 内层：控制Y轴位移 + 旋转 + 缩放 + 透明度 + 圆角
                        particleInner.style.transform = 'translateY(0) rotate(0deg) scale(1)';
                        particleInner.style.opacity = '1';
                        particleInner.style.borderRadius = '0';
                        particleInner.style.transition = `
                            transform ${totalDuration}s ${yEasing} ${delay}ms,
                            opacity ${totalDuration}s ease-in ${delay}ms,
                            border-radius ${shapeDuration}s ease-out ${delay}ms
                        `;

                        // 保存动画参数
                        particle.dataset.pathType = 'arc';
                        particle.dataset.disperseX = disperseX;
                        particle.dataset.disperseY = disperseY;
                        particle.dataset.rotate = randomRotate;

                    } else {
                        // S形路径：使用cubic-bezier产生过冲效果
                        // S形：X轴使用标准easing，Y轴使用带过冲的cubic-bezier
                        const sCurveEasing = 'cubic-bezier(0.68, -0.6, 0.32, 1.6)';

                        // 外层：控制X轴位移
                        particle.style.transform = 'translateX(0)';
                        particle.style.transition = `transform ${totalDuration}s ease-in-out ${delay}ms`;

                        // 内层：控制Y轴位移（使用S形曲线easing）+ 其他效果
                        particleInner.style.transform = 'translateY(0) rotate(0deg) scale(1)';
                        particleInner.style.opacity = '1';
                        particleInner.style.borderRadius = '0';
                        particleInner.style.transition = `
                            transform ${totalDuration}s ${sCurveEasing} ${delay}ms,
                            opacity ${totalDuration}s ease-in ${delay}ms,
                            border-radius ${shapeDuration}s ease-out ${delay}ms
                        `;

                        // 保存动画参数
                        particle.dataset.pathType = 's-curve';
                        particle.dataset.disperseX = disperseX;
                        particle.dataset.disperseY = disperseY;
                        particle.dataset.rotate = randomRotate;
                    }

                    particlesContainer.appendChild(particle);
                    particles.push({
                        element: particle,
                        innerElement: particleInner,
                        delay: delay,
                        duration: totalDuration * 1000, // 转换为毫秒
                        disperseX,
                        disperseY,
                        rotate: randomRotate,
                        pathType
                    });

                } else {
                    // 直线路径：保持原有逻辑（单层div）
                    particle = document.createElement('div');
                    particle.className = 'cyber-particle';
                    particle.style.width = `${particleWidth}px`;
                    particle.style.height = `${particleHeight}px`;
                    particle.style.left = `${c * particleSide}px`;
                    particle.style.top = `${r * particleSide}px`;

                    particle.style.backgroundImage = imageBackground;
                    particle.style.backgroundSize = `${displayWidth}px ${displayHeight}px`;
                    particle.style.backgroundPosition = `-${c * particleSide}px -${r * particleSide}px`;
                    particle.style.backgroundRepeat = 'no-repeat';

                    // 保存动画参数供后续使用
                    particle.dataset.disperseX = disperseX;
                    particle.dataset.disperseY = disperseY;
                    particle.dataset.rotate = randomRotate;

                    // 初始状态（正常显示）- 方块形状
                    particle.style.transform = 'translate(0, 0) rotate(0deg) scale(1)';
                    particle.style.opacity = '1';
                    particle.style.borderRadius = '0'; // 初始为方块形状
                    particle.style.transition = `
                        transform ${totalDuration}s ease-in ${delay}ms,
                        opacity ${totalDuration}s ease-in ${delay}ms,
                        border-radius ${shapeDuration}s ease-out ${delay}ms
                    `;

                    // 移除边框效果
                    particle.style.border = 'none';
                    particle.style.outline = 'none';
                    particle.style.boxShadow = 'none';

                    particlesContainer.appendChild(particle);
                    particles.push({
                        element: particle,
                        delay: delay,
                        duration: totalDuration * 1000, // 转换为毫秒
                        disperseX,
                        disperseY,
                        rotate: randomRotate,
                        pathType
                    });
                }
            }
        }

        wrapper.appendChild(particlesContainer);
        console.log('✅ 粒子容器已添加，粒子数量:', particles.length);

        // 强制同步布局
        particlesContainer.getBoundingClientRect();

        // 触发消散动画 - 使用双重requestAnimationFrame
        this._scheduleFrame(() => {
            this._scheduleFrame(() => {
                console.log('🎭 开始粒子消散动画');
                particles.forEach(({ element, innerElement, disperseX, disperseY, rotate, pathType }) => {
                    if (pathType === 'arc' || pathType === 's-curve') {
                        // 两层div结构：外层控制X，内层控制Y + 形变
                        // 外层X轴位移
                        element.style.transform = `translateX(${disperseX}px)`;
                        // 内层Y轴位移 + 旋转 + 缩放 + 形变
                        innerElement.style.borderRadius = '50%';
                        innerElement.style.transform = `translateY(${disperseY}px) rotate(${rotate}deg) scale(0)`;
                        innerElement.style.opacity = '0';
                    } else {
                        // 直线路径：单层div，同时设置所有属性
                        element.style.borderRadius = '50%';
                        element.style.transform = `translate(${disperseX}px, ${disperseY}px) rotate(${rotate}deg) scale(0)`;
                        element.style.opacity = '0';
                    }
                });
            });
        });

        // 计算动画完成时间：取所有粒子中 (transition时长 + delay) 的最大值，然后加20ms缓冲
        const maxEndTime = Math.max(...particles.map(p => p.duration + p.delay));
        const animationDuration = maxEndTime + 20;

        // 等待动画完成
        return new Promise(resolve => {
            this._scheduleTimer(() => {
                console.log('✨ 粒子消散动画完成');
                // 无论是否被中断，都要清理粒子容器
                if (particlesContainer.parentNode) {
                    particlesContainer.parentNode.removeChild(particlesContainer);
                }
                // 只在未被中断时才操作img状态
                if (currentAnimId === this._animationId) {
                    // 动画完成后，确保原图保持隐藏状态
                    img.style.opacity = '0';
                    img.style.visibility = 'hidden';
                    img.classList.remove('visible');
                }
                resolve();
            }, animationDuration, resolve);
        });
    }

    /**
     * 图片加载失败回调
     */
    _onImageError() {
        this.elements.loader.style.display = 'none';
        this.elements.mainImage.src = this._createErrorPlaceholder();
        // 错误图片直接显示，不使用方块动画
        this.elements.mainImage.style.visibility = 'visible';
        this.elements.mainImage.style.opacity = '1';
        this.elements.mainImage.classList.add('visible');
        this.isAnimating = false;
    }

    /**
     * 创建错误占位图
     */
    _createErrorPlaceholder() {
        return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#1a1a1a" width="400" height="300"/><text x="200" y="140" text-anchor="middle" fill="#ff6b6b" font-size="48">⚠️</text><text x="200" y="180" text-anchor="middle" fill="#888" font-size="14">${escapeHtml(t('image.load_failed'))}</text></svg>`);
    }

    /**
     * 预加载相邻图片
     */
    _preloadAdjacent(currentIndex) {
        if (this._isClosing || !this.container?.isConnected) return;
        const wanted = new Set([currentIndex - 1, currentIndex + 1]
            .filter(index => index >= 0 && index < this.imageUrls.length)
            .map(index => this.imageUrls[index]));
        const retained = new Set([...wanted, this.imageUrls[currentIndex]]);
        for (const [url, image] of this.preloadCache) {
            if (!retained.has(url)) {
                image.src = '';
                this.preloadCache.delete(url);
            }
        }
        for (const [url, controller] of this._preloadRequests) {
            if (!wanted.has(url)) {
                controller.abort();
                this._preloadRequests.delete(url);
            }
        }
        for (const url of wanted) {
            if (this.preloadCache.has(url) || this._preloadRequests.has(url)) continue;
            const controller = new AbortController();
            this._preloadRequests.set(url, controller);
            this._loadImageAsync(url, { signal: controller.signal }).then(img => {
                if (!this._isClosing && this.container?.isConnected && !controller.signal.aborted &&
                        this._preloadRequests.get(url) === controller) this.preloadCache.set(url, img);
            }).catch(() => {}).finally(() => {
                if (this._preloadRequests.get(url) === controller) this._preloadRequests.delete(url);
            });
        }
    }

    /**
     * 切换到指定索引（带动画）
     * 流程：粒子消散（载出）→ 等待0.5秒 → 新图片方块合并（载入）
     * @param {number} index - 目标图片索引
     * @param {number} clickX - 点击位置的X坐标（用于波浪效果）
     * @param {number} clickY - 点击位置的Y坐标（用于波浪效果）
     */
    async goTo(index, clickX, clickY) {
        if (this._isClosing || !this.container?.isConnected) return;
        if (index === this.currentIndex) return;
        if (index < 0 || index >= this.imageUrls.length) return;

        // 递增动画ID，用于中断检测
        const interrupted = this.isAnimating;
        this._cancelAnimationWork();
        this._loadGeneration++;
        this._mainLoadController?.abort();
        this._mainLoadController = null;
        const currentAnimId = this._animationId;

        // 如果正在动画中，立即清理并跳过载出动画，直接切换到新图片
        if (interrupted) {
            this.isAnimating = true;
            console.log('⚡ 快速切换：跳过载出动画，直接切换到图片索引:', index);
            
            // 立即隐藏当前图片（同步操作，防止旧图闪现）
            const img = this.elements.mainImage;
            img.style.transition = 'none';
            img.style.opacity = '0';
            img.style.visibility = 'hidden';
            img.classList.remove('visible');
            img.getBoundingClientRect();
            
            // 立即更新索引
            this.currentIndex = index;
            
            // 直接加载并显示新图片（会触发方块载入动画）
            await this._loadImage(this.currentIndex);
            
            console.log('✅ 快速切换完成');
            return;
        }

        console.log('🔄 切换到图片索引:', index);
        this.isAnimating = true;

        // 1. 执行粒子消散动画（载出）- 粒子动画内部会处理原图隐藏
        await this._playParticleDisperseAnimation(clickX, clickY);

        // 检查是否被新的切换中断
        if (currentAnimId !== this._animationId) return;

        // 2. 载出动画完全结束后，等待0.5秒间隔
        await new Promise(resolve => this._scheduleTimer(resolve, 250, resolve));

        // 检查是否被新的切换中断
        if (currentAnimId !== this._animationId) return;

        // 更新索引
        this.currentIndex = index;

        // 3. 加载新图片（这会触发方块合并动画）
        // 注意：_loadImage 会设置 isAnimating = false，但方块动画是异步的
        // 所以需要在方块动画完成后再重置 isAnimating
        await this._loadImage(this.currentIndex);

        // isAnimating 会在 _playBlockAssemblyAnimation 完成后自动重置
        console.log('✅ 切换完成');
    }

    /**
     * 上一张
     * @param {number} clickX - 点击位置的X坐标
     * @param {number} clickY - 点击位置的Y坐标
     */
    prev(clickX, clickY) {
        const newIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.imageUrls.length - 1;
        this.goTo(newIndex, clickX, clickY);
    }

    /**
     * 下一张
     * @param {number} clickX - 点击位置的X坐标
     * @param {number} clickY - 点击位置的Y坐标
     */
    next(clickX, clickY) {
        const newIndex = this.currentIndex < this.imageUrls.length - 1 ? this.currentIndex + 1 : 0;
        this.goTo(newIndex, clickX, clickY);
    }

    /**
     * 关闭查看器
     */
    close() {
        if (this._isClosing || this._disposed) return;
        this._isClosing = true;
        this._stopOwnedWork();
        if (!this.container?.isConnected) { this._dispose(); return; }
        const container = this.container;
        container.style.opacity = '1';
        container.style.transition = 'opacity 0.3s ease';
        this._scheduleFrame(() => {
            container.style.opacity = '0';
            this._scheduleTimer(() => {
                const restore = container.contains(document.activeElement);
                const previousFocus = this._returnFocus;
                container.remove();
                this._dispose();
                if (restore && document.activeElement === document.body && previousFocus?.isConnected &&
                        typeof previousFocus.focus === 'function') previousFocus.focus();
            }, 300, null, true);
        }, true);
    }
}

// ==========================================
// 📦 导出接口
// ==========================================

/**
 * 打开全屏图像播放器
 * @param {string[]} imageUrls - 图片URL数组（支持代理URL和原始URL）
 * @param {number} startIndex - 起始图片索引，默认0
 * @param {Object} options - 可选配置
 * @param {string} options.background - 背景色，默认 '#0a0a0a'
 * @param {boolean} options.opaque - 是否不透明背景，默认true
 * @returns {Function} 关闭播放器的函数
 */
export function openImageViewer(imageUrls, startIndex = 0, options = {}) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        console.warn('图片数组为空，无法打开查看器');
        return () => {};
    }

    console.log('🎬 openImageViewer 被调用:', 'URL数量:', imageUrls.length, '起始索引:', startIndex);

    const viewer = new CyberImageViewer(imageUrls, startIndex);
    const container = viewer.create(options);
    if (!container) return () => {};

    // 添加到body
    document.body.appendChild(container);
    viewer.elements.closeBtn.focus();

    // 添加入场动画
    viewer._scheduleFrame(() => {
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.3s ease';
        viewer._scheduleFrame(() => {
            container.style.opacity = '1';
        });
    });

    // 返回关闭函数
    return () => viewer.close();
}

// 导出默认对象
export default {
    openImageViewer,
    CyberImageViewer
};
