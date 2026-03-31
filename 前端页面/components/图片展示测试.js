// 前端页面/components/图片展示测试.js
// ==========================================
// 🖼️ 全屏图像播放器组件
// ==========================================
// 功能：沉浸式全屏图片浏览，支持方块聚合载入 + 粒子消散载出动画
// 接口：openImageViewer(imageUrls, startIndex, options)
// ==========================================

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

.cyber-main-image.visible {
    opacity: 1;
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
    /* 添加 overflow: hidden 裁切超出边界的方块 */
    overflow: hidden;
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
}

.cyber-nav-zone:hover {
    opacity: 1;
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
 * 图片查看器状态管理
 */
class CyberImageViewer {
    constructor(imageUrls, startIndex = 0) {
        // 处理URL，确保使用本地缓存代理
        this.imageUrls = imageUrls.map(url => this._proxyImageUrl(url));
        this.currentIndex = Math.max(0, Math.min(startIndex, this.imageUrls.length - 1));
        this.preloadCache = new Map();
        this.isAnimating = false;
        this.container = null;
        this.elements = {};
        // 动画ID计数器，用于快速点击中断动画
        this._animationId = 0;
    }

    /**
     * 将URL转换为本地缓存代理格式
     * 自动识别代理URL、data: URL、blob: URL和普通HTTP(S) URL
     */
    _proxyImageUrl(url) {
        if (!url) return '';
        // data: URL 和 blob: URL 直接使用不转换
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            return url;
        }
        // 如果已经是代理格式，直接返回
        if (url.startsWith('/community_hub/image?url=')) {
            return url;
        }
        // 如果是HTTP/HTTPS链接，添加代理前缀
        if (url.startsWith('http')) {
            return `/community_hub/image?url=${encodeURIComponent(url)}`;
        }
        return url;
    }

    /**
     * 创建查看器DOM结构
     * @param {Object} options - 配置选项
     * @param {string} options.background - 背景色，默认 '#0a0a0a'
     * @param {boolean} options.opaque - 是否不透明背景，默认true
     */
    create(options = {}) {
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
        this.container.style.background = background;

        this.container.innerHTML = `
            <!-- 关闭按钮 -->
            <button class="cyber-close-btn" title="关闭 (ESC)">×</button>

            <!-- 图片主容器 -->
            <div class="cyber-image-container">
                <div class="cyber-image-wrapper" id="cyber-image-wrapper">
                    <img class="cyber-main-image" src="" alt="" id="cyber-main-image">
                    <div class="cyber-loader"></div>
                </div>
            </div>

            <!-- 左右导航区域 -->
            <div class="cyber-nav-zone left" title="上一张 (←)">
                <div class="cyber-nav-arrow">❮</div>
            </div>
            <div class="cyber-nav-zone right" title="下一张 (→)">
                <div class="cyber-nav-arrow">❯</div>
            </div>

            <!-- 底部信息栏 -->
            <div class="cyber-info-bar">
                <div class="cyber-counter">
                    <span class="current">1</span>
                    <span class="separator"> / </span>
                    <span class="total">${this.imageUrls.length}</span>
                </div>
                <div class="cyber-thumbnails"></div>
                <div class="cyber-keyboard-hint">
                    <span><span class="cyber-key">←</span> 上一张</span>
                    <span><span class="cyber-key">→</span> 下一张</span>
                    <span><span class="cyber-key">ESC</span> 关闭</span>
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
            closeBtn: this.container.querySelector('.cyber-close-btn')
        };

        // 绑定事件
        this._bindEvents();

        // 渲染缩略图
        this._renderThumbnails();

        // 加载初始图片
        this._loadImage(this.currentIndex);

        return this.container;
    }

    /**
     * 绑定事件处理
     */
    _bindEvents() {
        // 键盘导航
        this._keydownHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'ArrowLeft') {
                // 键盘导航使用屏幕中心作为波浪起点
                this.prev(window.innerWidth / 2, window.innerHeight / 2);
            } else if (e.key === 'ArrowRight') {
                // 键盘导航使用屏幕中心作为波浪起点
                this.next(window.innerWidth / 2, window.innerHeight / 2);
            }
        };
        document.addEventListener('keydown', this._keydownHandler);

        // 点击导航区域 - 传递点击位置用于波浪效果
        this.elements.navLeft.addEventListener('click', (e) => this.prev(e.clientX, e.clientY));
        this.elements.navRight.addEventListener('click', (e) => this.next(e.clientX, e.clientY));

        // 关闭按钮
        this.elements.closeBtn.addEventListener('click', () => this.close());

        // 阻止右键菜单
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());

        // 阻止拖拽
        this.elements.mainImage.addEventListener('dragstart', (e) => e.preventDefault());
    }

    /**
     * 渲染缩略图导航
     */
    _renderThumbnails() {
        // 最多显示7个缩略图
        const maxThumbs = Math.min(this.imageUrls.length, 7);
        
        for (let i = 0; i < maxThumbs; i++) {
            const thumb = document.createElement('div');
            thumb.className = 'cyber-thumb' + (i === this.currentIndex ? ' active' : '');
            thumb.innerHTML = `<img src="${this.imageUrls[i]}" alt="">`;
            thumb.addEventListener('click', (e) => this.goTo(i, e.clientX, e.clientY));
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
        });
    }

    /**
     * 加载指定索引的图片
     */
    async _loadImage(index) {
        if (index < 0 || index >= this.imageUrls.length) return;

        const url = this.imageUrls[index];
        const img = this.elements.mainImage;
        const loader = this.elements.loader;

        // 隐藏当前图片，准备加载新图片（同步立即隐藏，无过渡）
        img.style.transition = 'none';
        img.style.opacity = '0';
        img.style.visibility = 'hidden';
        img.classList.remove('visible');
        loader.style.display = 'flex';

        // 检查缓存
        if (this.preloadCache.has(url)) {
            const cachedImg = this.preloadCache.get(url);
            img.src = cachedImg.src;
            this._onImageLoaded();
        } else {
            // 加载图片
            try {
                await this._loadImageAsync(url);
                img.src = url;
                this._onImageLoaded();
            } catch (err) {
                console.error('图片加载失败:', err);
                this._onImageError();
            }
        }

        // 更新计数器
        this.elements.counterCurrent.textContent = index + 1;
        this._updateThumbnails();

        // 预加载相邻图片
        this._preloadAdjacent(index);
    }

    /**
     * 异步加载图片
     */
    _loadImageAsync(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            console.log('📥 开始加载图片:', url?.substring(0, 100) + '...');
            img.onload = () => {
                console.log('✅ 图片加载成功:', url?.substring(0, 100) + '...');
                resolve(img);
            };
            img.onerror = (err) => {
                console.error('❌ 图片加载失败:', url?.substring(0, 100) + '...', err);
                reject(new Error('图片加载失败'));
            };
            img.src = url;
        });
    }

    /**
     * 图片加载完成回调 - 触发方块合并动画
     */
    _onImageLoaded() {
        requestAnimationFrame(() => {
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
        });
    }

    /**
     * 方块合并载入动画 - 将图片分割成方块从随机位置飞入拼合（载出动画的倒放）
     * 使用与粒子消散相同的网格参数和背景图裁切方式
     */
    _playBlockAssemblyAnimation() {
        const img = this.elements.mainImage;
        const wrapper = this.elements.wrapper;
        const imgSrc = img.src;

        // 调试日志
        console.log('🎬 方块聚合动画开始 - 图片URL:', imgSrc?.substring(0, 100) + '...');

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
        // 先用较长边计算初始方块大小
        const initialBlockSize = Math.max(displayWidth, displayHeight) / maxGridSize;
        // 计算行列数
        const cols = Math.min(Math.ceil(displayWidth / initialBlockSize), maxGridSize);
        const rows = Math.min(Math.ceil(displayHeight / initialBlockSize), maxGridSize);
        const totalBlocks = cols * rows;
        // 关键：反算实际需要的方块大小，取两个方向中较大的值，确保1:1且完全覆盖
        // 这样 cols * blockSide >= displayWidth 且 rows * blockSide >= displayHeight
        const blockSide = Math.max(displayWidth / cols, displayHeight / rows);
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
                // 注意：URL已经由_proxyImageUrl处理过，直接使用，不要再次编码
                block.style.backgroundImage = `url("${imgSrc}")`;
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
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
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
        setTimeout(() => {
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
            setTimeout(() => {
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
     */
    async _playParticleDisperseAnimation(clickX, clickY) {
        const img = this.elements.mainImage;
        const wrapper = this.elements.wrapper;
        const imgSrc = img.src;

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
        // 先用较长边计算初始粒子大小
        const initialParticleSize = Math.max(displayWidth, displayHeight) / maxParticleGrid;
        // 计算行列数
        const cols = Math.min(Math.ceil(displayWidth / initialParticleSize), maxParticleGrid);
        const rows = Math.min(Math.ceil(displayHeight / initialParticleSize), maxParticleGrid);
        // 关键：反算实际需要的粒子大小，取两个方向中较大的值，确保1:1且完全覆盖
        const particleSide = Math.max(displayWidth / cols, displayHeight / rows);
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
                const particle = document.createElement('div');
                particle.className = 'cyber-particle';
                particle.style.width = `${particleWidth}px`;
                particle.style.height = `${particleHeight}px`;
                particle.style.left = `${c * particleSide}px`;
                particle.style.top = `${r * particleSide}px`;
                
                // 注意：URL已经由_proxyImageUrl处理过，直接使用，不要再次编码
                particle.style.backgroundImage = `url("${imgSrc}")`;
                particle.style.backgroundSize = `${displayWidth}px ${displayHeight}px`;
                particle.style.backgroundPosition = `-${c * particleSide}px -${r * particleSide}px`;
                particle.style.backgroundRepeat = 'no-repeat';

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
                const randomAngleOffset = (Math.random() - 0.5) * 2 * Math.PI * 0.3; // ±30%角度随机偏移
                const finalAngle = angle + randomAngleOffset;
                
                // 消散距离：使用整个视口作为动画舞台，粒子向屏幕四面八方飞散
                const baseDistance = Math.min(window.innerWidth, window.innerHeight) * 0.5 + Math.random() * Math.min(window.innerWidth, window.innerHeight) * 0.5;
                const distanceMultiplier = 0.5 + distanceRatio * 1.5;
                const finalDistance = baseDistance * distanceMultiplier * (1 + (Math.random() - 0.5) * 0.6); // ±30%距离随机偏移
                
                const disperseX = Math.cos(finalAngle) * finalDistance;
                const disperseY = Math.sin(finalAngle) * finalDistance;
                
                // 旋转 - 更大角度的旋转
                const randomRotate = (Math.random() - 0.5) * 720;

                // 保存动画参数供后续使用
                particle.dataset.disperseX = disperseX;
                particle.dataset.disperseY = disperseY;
                particle.dataset.rotate = randomRotate;

                // 计算动画时长和延迟
                const totalDuration = 0.25 + Math.random() * 0.25; // 0.25-0.5秒
                const delay = Math.random() * 100; // 0-100ms随机延迟
                const shapeDuration = totalDuration * 0.3; // 形变占前30%

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
                    rotate: randomRotate
                });
            }
        }

        wrapper.appendChild(particlesContainer);
        console.log('✅ 粒子容器已添加，粒子数量:', particles.length);

        // 强制同步布局
        particlesContainer.getBoundingClientRect();

        // 触发消散动画 - 使用双重requestAnimationFrame
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                console.log('🎭 开始粒子消散动画');
                particles.forEach(({ element, disperseX, disperseY, rotate }) => {
                    // 消散为粒子点（scale=0），像灰烬一样消失
                    // 形变为圆形，同时位移、旋转、缩放
                    element.style.borderRadius = '50%';
                    element.style.transform = `translate(${disperseX}px, ${disperseY}px) rotate(${rotate}deg) scale(0)`;
                    element.style.opacity = '0';
                });
            });
        });

        // 计算动画完成时间：取所有粒子中 (transition时长 + delay) 的最大值，然后加20ms缓冲
        const maxEndTime = Math.max(...particles.map(p => p.duration + p.delay));
        const animationDuration = maxEndTime + 20;

        // 等待动画完成
        return new Promise(resolve => {
            setTimeout(() => {
                console.log('✨ 粒子消散动画完成');
                if (particlesContainer.parentNode) {
                    particlesContainer.parentNode.removeChild(particlesContainer);
                }
                // 动画完成后，确保原图保持隐藏状态
                img.style.opacity = '0';
                img.style.visibility = 'hidden';
                img.classList.remove('visible');
                resolve();
            }, animationDuration);
        });
    }

    /**
     * 图片加载失败回调
     */
    _onImageError() {
        this.elements.loader.style.display = 'none';
        this.elements.mainImage.src = this._createErrorPlaceholder();
        // 错误图片直接显示，不使用方块动画
        this.elements.mainImage.classList.add('visible');
    }

    /**
     * 创建错误占位图
     */
    _createErrorPlaceholder() {
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect fill='%231a1a1a' width='400' height='300'/%3E%3Ctext x='200' y='140' text-anchor='middle' fill='%23ff6b6b' font-size='48'%3E⚠️%3C/text%3E%3Ctext x='200' y='180' text-anchor='middle' fill='%23888' font-size='14'%3E图片加载失败%3C/text%3E%3C/svg%3E`;
    }

    /**
     * 预加载相邻图片
     */
    _preloadAdjacent(currentIndex) {
        const indices = [
            currentIndex - 1,
            currentIndex + 1
        ].filter(i => i >= 0 && i < this.imageUrls.length);

        indices.forEach(index => {
            const url = this.imageUrls[index];
            if (!this.preloadCache.has(url)) {
                const img = new Image();
                img.onload = () => {
                    this.preloadCache.set(url, img);
                };
                img.src = url;
            }
        });
    }

    /**
     * 切换到指定索引（带动画）
     * 流程：粒子消散（载出）→ 等待0.5秒 → 新图片方块合并（载入）
     * @param {number} index - 目标图片索引
     * @param {number} clickX - 点击位置的X坐标（用于波浪效果）
     * @param {number} clickY - 点击位置的Y坐标（用于波浪效果）
     */
    async goTo(index, clickX, clickY) {
        if (index === this.currentIndex) return;
        if (index < 0 || index >= this.imageUrls.length) return;

        // 递增动画ID，用于中断检测
        this._animationId++;
        const currentAnimId = this._animationId;

        // 如果正在动画中，立即清理并跳过载出动画，直接切换到新图片
        if (this.isAnimating) {
            console.log('⚡ 快速切换：跳过载出动画，直接切换到图片索引:', index);
            
            // 清理所有动画容器
            const blocks = this.container.querySelector('.cyber-blocks-container');
            if (blocks) blocks.remove();
            const particles = this.container.querySelector('.cyber-particles-container');
            if (particles) particles.remove();
            
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
        await new Promise(resolve => setTimeout(resolve, 250));

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
        // 清理事件监听
        document.removeEventListener('keydown', this._keydownHandler);

        // 添加关闭动画
        this.container.style.opacity = '1';
        this.container.style.transition = 'opacity 0.3s ease';
        
        requestAnimationFrame(() => {
            this.container.style.opacity = '0';
            setTimeout(() => {
                if (this.container.parentNode) {
                    this.container.parentNode.removeChild(this.container);
                }
            }, 300);
        });
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
    if (!imageUrls || imageUrls.length === 0) {
        console.warn('图片数组为空，无法打开查看器');
        return () => {};
    }

    console.log('🎬 openImageViewer 被调用:', 'URL数量:', imageUrls.length, '起始索引:', startIndex);
    console.log('🖼️ 图片URLs:', imageUrls.map(u => u?.substring(0, 80) + '...'));

    const viewer = new CyberImageViewer(imageUrls, startIndex);
    const container = viewer.create(options);

    // 添加到body
    document.body.appendChild(container);

    // 添加入场动画
    requestAnimationFrame(() => {
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.3s ease';
        requestAnimationFrame(() => {
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
