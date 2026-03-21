// 前端页面/图片沙盒组件.js

export function getCoverSandboxHTML(coverUrl) {
    if (!coverUrl) return '';
    return `
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">🖼️ 效果展示图</div>
        <div class="img-viewport" style="position: relative; width: 100%; height: 260px; background: #111; border: 2px dashed #666; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; cursor: grab;">
            <img class="target-img" src="${coverUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; user-select: none; transform-origin: center; transition: transform 0.05s linear;">
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

export function setupImageSandboxEvents(detailView) {
    const viewport = detailView.querySelector('.img-viewport');
    if (!viewport) return; // 如果没有图片，直接返回

    const targetImg = detailView.querySelector('.target-img');
    const btnIn = detailView.querySelector('.btn-zoom-in');
    const btnOut = detailView.querySelector('.btn-zoom-out');
    const btnReset = detailView.querySelector('.btn-zoom-reset');
    const sliderX = detailView.querySelector('.slider-x');
    const sliderY = detailView.querySelector('.slider-y');

    let scale = 1.0;
    const syncTransform = () => { targetImg.style.transform = `scale(${scale}) translate(${sliderX.value}px, ${sliderY.value}px)`; };
    const zoom = (delta) => { scale = Math.max(0.5, Math.min(3.0, scale + delta)); syncTransform(); };

    btnIn.onclick = () => zoom(0.2); 
    btnOut.onclick = () => zoom(-0.2);
    btnReset.onclick = () => { scale = 1; sliderX.value = 0; sliderY.value = 0; syncTransform(); };
    
    viewport.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? -0.1 : 0.1); });
    sliderX.addEventListener('input', syncTransform); 
    sliderY.addEventListener('input', syncTransform);

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
}