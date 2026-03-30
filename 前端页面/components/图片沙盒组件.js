// 前端页面/components/图片沙箱组件.js
// ==========================================
// 🖼️ 图片沙箱组件（轮播、缩放、拖动、不可复制）
// ==========================================
// 作用：提供可交互的图片查看器，支持多图轮播、缩放和拖动
// 关联文件：
//   - 列表卡片组件.js (资源封面显示)
//   - 资源详情页面组件.js (资源图片展示)
// ==========================================
// ⚡ 功能：多图轮播、左右切换、图片保护（禁止复制/下载）
// ==========================================

// 默认占位图（灰色加载动画）
const PLACEHOLDER_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect fill='%231a1a1a' width='400' height='260'/%3E%3Crect x='180' y='110' width='40' height='40' rx='4' fill='%23333'%3E%3Canimate attributeName='opacity' values='0.3;1;0.3' dur='1.5s' repeatCount='indefinite'/%3E%3C/rect%3E%3Ctext x='200' y='180' text-anchor='middle' fill='%23666' font-size='12'%3E加载中...%3C/text%3E%3C/svg%3E`;

// 错误占位图
const ERROR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect fill='%231a1a1a' width='400' height='260'/%3E%3Ctext x='200' y='125' text-anchor='middle' fill='%23666' font-size='24'%3E⚠️%3C/text%3E%3Ctext x='200' y='150' text-anchor='middle' fill='%23666' font-size='12'%3E图片加载失败%3C/text%3E%3C/svg%3E`;

/**
 * 🖼️ 生成效果展示图 HTML（支持多图轮播）
 * @param {string|string[]} imageSource - 单个图片URL或多个图片URL数组
 * @param {boolean} lazyLoad - 是否懒加载
 */
export function getCoverSandboxHTML(imageSource, lazyLoad = true) {
    // 兼容：接受单个URL或数组
    let imageUrls = [];
    if (Array.isArray(imageSource)) {
        imageUrls = imageSource.filter(url => url && url.trim());
    } else if (imageSource && imageSource.trim()) {
        imageUrls = [imageSource];
    }
    
    if (imageUrls.length === 0) return '';
    
    const firstUrl = imageUrls[0];
    const imgSrc = lazyLoad ? PLACEHOLDER_SVG : firstUrl;
    const dataAttr = lazyLoad ? `data-src="${firstUrl}"` : '';
    const lazyClass = lazyLoad ? 'lazy-image lazy-loading' : '';
    
    // 🖼️ 多图模式：显示左右切换按钮和计数器
    const hasMultiple = imageUrls.length > 1;
    const navButtons = hasMultiple ? `
        <button class="btn-prev" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; border: none; cursor: pointer; font-size: 18px; z-index: 20; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(76,175,80,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'">❮</button>
        <button class="btn-next" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; border: none; cursor: pointer; font-size: 18px; z-index: 20; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(76,175,80,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'">❯</button>
        <div class="img-counter" style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: #fff; padding: 4px 12px; border-radius: 12px; font-size: 12px; z-index: 20;">1 / ${imageUrls.length}</div>
    ` : '';
    
    // 🔒 图片保护：禁用右键菜单、拖拽
    const protectionStyles = `
        -webkit-user-select: none; 
        -moz-user-select: none; 
        -ms-user-select: none; 
        user-select: none; 
        pointer-events: none;
        -webkit-user-drag: none;
    `;
    
    return `
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">🖼️ 效果展示图${hasMultiple ? ` (${imageUrls.length}张)` : ''}</div>
        <div class="img-viewport" data-images='${JSON.stringify(imageUrls)}' data-current="0" style="position: relative; width: 100%; height: 260px; background: #111; border: 2px dashed #666; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; cursor: grab;" oncontextmenu="return false;">
            <img class="target-img ${lazyClass}" src="${imgSrc}" ${dataAttr} draggable="false" style="max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center; transition: transform 0.05s linear, opacity 0.3s ease; ${protectionStyles}">
            ${navButtons}
            <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px; opacity: 0.3; transition: 0.3s; z-index: 10;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.3">
                <button class="btn-zoom-out" style="background: #333; color: #fff; border: 1px solid #555; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-weight: bold;">-</button>
                <button class="btn-zoom-reset" style="background: #333; color: #fff; border: 1px solid #555; height: 28px; padding: 0 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">重置</button>
                <button class="btn-zoom-in" style="background: #333; color: #fff; border: 1px solid #555; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-weight: bold;">+</button>
            </div>
            <div class="sliders-wrapper" style="opacity: 0.2; transition: 0.3s; position: absolute; width: 100%; height: 100%; top:0; left:0; pointer-events: none;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=0.2">
                <input type="range" class="slider-x" min="-400" max="400" value="0" style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); width: 80%; pointer-events: auto; z-index: 10;">
                <input type="range" class="slider-y" min="-400" max="400" value="0" style="position: absolute; left: -110px; top: 50%; transform: translateY(-50%) rotate(270deg); width: 280px; pointer-events: auto; z-index: 10;">
            </div>
        </div>
    `;
}

/**
 * 🖼️ 设置图片沙盒事件（轮播、缩放、拖动）
 */
export function setupImageSandboxEvents(detailView) {
    const viewport = detailView.querySelector('.img-viewport');
    if (!viewport) return;

    const targetImg = detailView.querySelector('.target-img');
    const btnIn = detailView.querySelector('.btn-zoom-in');
    const btnOut = detailView.querySelector('.btn-zoom-out');
    const btnReset = detailView.querySelector('.btn-zoom-reset');
    const sliderX = detailView.querySelector('.slider-x');
    const sliderY = detailView.querySelector('.slider-y');
    const btnPrev = detailView.querySelector('.btn-prev');
    const btnNext = detailView.querySelector('.btn-next');
    const imgCounter = detailView.querySelector('.img-counter');
    
    // 🔒 图片保护：禁用右键菜单
    viewport.addEventListener('contextmenu', (e) => e.preventDefault());
    targetImg.addEventListener('dragstart', (e) => e.preventDefault());

    // 📦 解析图片数组
    let imageUrls = [];
    let currentIndex = 0;
    try {
        imageUrls = JSON.parse(viewport.dataset.images || '[]');
    } catch (e) {
        imageUrls = [];
    }
    
    // 🖼️ 加载指定索引的图片
    const loadImage = (index) => {
        if (index < 0 || index >= imageUrls.length) return;
        currentIndex = index;
        viewport.dataset.current = index;
        
        const url = imageUrls[index];
        targetImg.classList.add('lazy-loading');
        targetImg.src = PLACEHOLDER_SVG;
        
        const tempImg = new Image();
        tempImg.onload = () => {
            targetImg.src = url;
            targetImg.classList.remove('lazy-loading');
            targetImg.classList.add('lazy-loaded');
            targetImg.style.opacity = '1';
        };
        tempImg.onerror = () => {
            targetImg.src = ERROR_SVG;
            targetImg.classList.remove('lazy-loading');
            targetImg.classList.add('lazy-error');
        };
        tempImg.src = url;
        
        // 更新计数器
        if (imgCounter) {
            imgCounter.textContent = `${index + 1} / ${imageUrls.length}`;
        }
        
        // 重置缩放和位置
        scale = 1;
        sliderX.value = 0;
        sliderY.value = 0;
        syncTransform();
    };

    // ⚡ 初始加载第一张图片
    if (targetImg.classList.contains('lazy-loading') && targetImg.dataset.src) {
        const realSrc = targetImg.dataset.src;
        const tempImg = new Image();
        
        tempImg.onload = () => {
            targetImg.src = realSrc;
            targetImg.classList.remove('lazy-loading');
            targetImg.classList.add('lazy-loaded');
            targetImg.style.opacity = '1';
            delete targetImg.dataset.src;
        };
        
        tempImg.onerror = () => {
            targetImg.src = ERROR_SVG;
            targetImg.classList.remove('lazy-loading');
            targetImg.classList.add('lazy-error');
        };
        
        tempImg.src = realSrc;
    }

    // 🖼️ 轮播切换按钮事件
    if (btnPrev && btnNext) {
        btnPrev.onclick = (e) => {
            e.stopPropagation();
            loadImage(currentIndex > 0 ? currentIndex - 1 : imageUrls.length - 1);
        };
        btnNext.onclick = (e) => {
            e.stopPropagation();
            loadImage(currentIndex < imageUrls.length - 1 ? currentIndex + 1 : 0);
        };
    }

    // 🔍 缩放功能
    let scale = 1.0;
    const syncTransform = () => { 
        targetImg.style.transform = `scale(${scale}) translate(${sliderX.value}px, ${sliderY.value}px)`; 
    };
    
    const zoom = (delta) => { 
        scale = Math.max(0.5, Math.min(5.0, scale + delta)); 
        syncTransform(); 
    };

    btnIn.onclick = () => zoom(0.2); 
    btnOut.onclick = () => zoom(-0.2);
    btnReset.onclick = () => { scale = 1; sliderX.value = 0; sliderY.value = 0; syncTransform(); };
    
    viewport.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? -0.1 : 0.1); });
    sliderX.addEventListener('input', syncTransform); 
    sliderY.addEventListener('input', syncTransform);

    // ✋ 拖动功能
    let isDragging = false; let startX, startY, initValX, initValY;
    viewport.addEventListener('mousedown', (e) => {
        if(e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'button') return;
        isDragging = true; viewport.style.cursor = 'grabbing';
        startX = e.clientX; startY = e.clientY; initValX = parseInt(sliderX.value); initValY = parseInt(sliderY.value);
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = (e.clientX - startX) / scale; const dy = (e.clientY - startY) / scale;
        sliderX.value = initValX + dx; sliderY.value = initValY + dy; syncTransform();
    });
    window.addEventListener('mouseup', () => { isDragging = false; viewport.style.cursor = 'grab'; });
    viewport.addEventListener('mouseleave', () => { isDragging = false; viewport.style.cursor = 'grab'; });
    
    // ⌨️ 键盘左右切换
    const handleKeydown = (e) => {
        if (e.key === 'ArrowLeft' && imageUrls.length > 1) {
            loadImage(currentIndex > 0 ? currentIndex - 1 : imageUrls.length - 1);
        } else if (e.key === 'ArrowRight' && imageUrls.length > 1) {
            loadImage(currentIndex < imageUrls.length - 1 ? currentIndex + 1 : 0);
        }
    };
    
    // 当鼠标在视口内时启用键盘切换
    viewport.addEventListener('mouseenter', () => {
        document.addEventListener('keydown', handleKeydown);
    });
    viewport.addEventListener('mouseleave', () => {
        document.removeEventListener('keydown', handleKeydown);
    });
}
