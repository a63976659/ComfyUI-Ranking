// 前端页面/列表卡片组件.js
import { createCommentSection, setupToggleButton } from "./评论与互动组件.js";
import { api } from "./网络请求API.js";
import { openOtherUserProfileModal } from "./个人中心视图.js";

function loadECharts() {
    return new Promise((resolve) => {
        if (window.echarts) return resolve(window.echarts);
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js";
        script.onload = () => resolve(window.echarts);
        document.head.appendChild(script);
    });
}

export function createItemCard(itemData, currentUser = null) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        backgroundColor: "var(--comfy-input-bg, #2b2b2b)", borderRadius: "8px", padding: "10px", 
        marginBottom: "12px", border: "1px solid #444", color: "#fff", fontFamily: "sans-serif"
    });

    const summaryView = document.createElement("div");
    summaryView.style.cursor = "pointer";
    summaryView.innerHTML = `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #4CAF50;">${itemData.title}</div>
        <div style="font-size: 12px; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px;">${itemData.shortDesc}</div>
        <div style="display: flex; gap: 10px; font-size: 11px; color: #888;">
            <span>👍 ${itemData.likes || 0}</span> <span>⭐ ${itemData.favorites || 0}</span> <span>💬 ${itemData.comments || 0}</span>
            <span style="margin-left: auto; background: #444; padding: 2px 6px; border-radius: 4px; color: #fff;">使用: ${itemData.uses || 0}</span>
        </div>
    `;

    const detailView = document.createElement("div");
    Object.assign(detailView.style, { display: "none", marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #555" });

    const authorInfo = document.createElement("div");
    Object.assign(authorInfo.style, { fontSize: "12px", color: "#ccc", marginBottom: "10px" });
    authorInfo.innerHTML = `发布者: <span class="author-name-link" style="color: #2196F3; cursor: pointer; text-decoration: underline;">加载中...</span> <span style="float: right; color: #FF9800;">💰 ${itemData.price > 0 ? itemData.price + ' 积分' : '免费'}</span>`;
    detailView.appendChild(authorInfo);

    const nameDOM = authorInfo.querySelector('.author-name-link');
    const authorCacheKey = `ComfyCommunity_ProfileCache_${itemData.author}`;
    const cachedAuthorStr = localStorage.getItem(authorCacheKey);
    
    if (cachedAuthorStr) { try { nameDOM.innerText = JSON.parse(cachedAuthorStr).name || itemData.author; } catch(e) {} }

    nameDOM.onclick = (e) => {
        e.stopPropagation(); 
        openOtherUserProfileModal(itemData.author, currentUser);
    };

    api.getUserProfile(itemData.author).then(res => {
        const freshName = res.data.name || itemData.author;
        if (nameDOM.innerText !== freshName) { nameDOM.innerText = freshName; }
        localStorage.setItem(authorCacheKey, JSON.stringify(res.data));
    }).catch(() => { if (!cachedAuthorStr) { nameDOM.innerText = itemData.author; } });

    const actionArea = document.createElement("div");
    Object.assign(actionArea.style, { display: "flex", gap: "8px", marginBottom: "12px" });
    const btnLike = document.createElement("button");
    Object.assign(btnLike.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    const btnFav = document.createElement("button");
    Object.assign(btnFav.style, { flex: "1", padding: "6px", background: "transparent", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", color: "#aaa" });
    const btnUse = document.createElement("button");
    Object.assign(btnUse.style, { flex: "1", padding: "6px", background: "#2196F3", border: "none", borderRadius: "4px", cursor: "pointer", color: "white" });
    
    btnUse.innerHTML = `🚀 立即获取 ${itemData.uses ? '(' + itemData.uses + ')' : ''}`;

    actionArea.appendChild(btnLike); actionArea.appendChild(btnFav); actionArea.appendChild(btnUse);
    detailView.appendChild(actionArea);

    const isLiked = currentUser && Array.isArray(itemData.liked_by) && itemData.liked_by.includes(currentUser.account);
    const isFav = currentUser && Array.isArray(itemData.favorited_by) && itemData.favorited_by.includes(currentUser.account);

    const handleInteraction = async (type, isActive) => {
        if (!currentUser) { alert("⚠️ 请先登录您的社区账号！"); throw new Error("User not logged in"); }
        await api.toggleInteraction(itemData.id, currentUser.account, type, isActive);
    };

    setupToggleButton(btnLike, isLiked, itemData.likes || 0, "👍 已赞", "👍 点赞", "#FF5722", (isActive) => handleInteraction("like", isActive));
    setupToggleButton(btnFav, isFav, itemData.favorites || 0, "⭐ 已收藏", "⭐ 收藏", "#FFC107", (isActive) => handleInteraction("favorite", isActive));

    btnUse.onclick = () => {
        if (!currentUser) return alert("⚠️ 请先登录您的社区账号后再获取！");
        itemData.uses = (itemData.uses || 0) + 1;
        btnUse.innerHTML = `🚀 立即获取 (${itemData.uses})`;
        window.open(itemData.link, "_blank");
    };

    const mediaArea = document.createElement("div");
    const chartContainerId = `chart-${Math.random().toString(36).substr(2, 9)}`;
    const chartHtml = `<div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📈 使用量增长曲线</div><div id="${chartContainerId}" style="width: 100%; height: 160px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; margin-bottom: 12px;"></div>`;

    let coverHtml = '';
    if (itemData.coverUrl) {
        coverHtml = `
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">🖼️ 效果展示图</div>
            <div class="img-viewport" style="position: relative; width: 100%; height: 260px; background: #111; border: 2px dashed #666; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; cursor: grab;">
                <img class="target-img" src="${itemData.coverUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; user-select: none; transform-origin: center; transition: transform 0.05s linear;">
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px; opacity: 0.3; transition: 0.3s; z-index: 10;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.3">
                    <button class="btn-zoom-out" style="background: #333; color: #fff; border: 1px solid #555; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-weight: bold;">-</button>
                    <button class="btn-zoom-reset" style="background: #333; color: #fff; border: 1px solid #555; height: 28px; padding: 0 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">重置</button>
                    <button class="btn-zoom-in" style="background: #333; color: #fff; border: 1px solid #555; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-weight: bold;">+</button>
                </div>
                <div class="sliders-wrapper" style="opacity: 0.2; transition: 0.3s; position: absolute; width: 100%; height: 100%; top:0; left:0; pointer-events: none;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=0.2">
                    <input type="range" class="slider-x" min="-400" max="400" value="0" style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); width: 80%; pointer-events: auto; z-index: 10;">
                    <input type="range" class="slider-y" min="-400" max="400" value="0" style="position: absolute; right: -130px; top: 50%; transform: translateY(-50%) rotate(270deg); width: 280px; pointer-events: auto; z-index: 10;">
                </div>
            </div>
        `;
    }

    mediaArea.innerHTML = `
        ${chartHtml}
        ${coverHtml}
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">📝 详细说明</div>
        <div style="background: #1e1e1e; padding: 10px; border-radius: 4px; font-size: 12px; color: #bbb; margin-bottom: 12px; max-height: 200px; overflow-y: auto; line-height: 1.6; border: 1px solid #333; word-wrap: break-word; white-space: pre-wrap;">${itemData.fullDesc}</div>
    `;
    detailView.appendChild(mediaArea);

    let isRendered = false;

    summaryView.onclick = () => {
        const isHidden = detailView.style.display === "none";
        detailView.style.display = isHidden ? "block" : "none";

        if (isHidden && !isRendered) {
            loadECharts().then(echarts => {
                const chartDom = detailView.querySelector(`#${chartContainerId}`);
                if (!chartDom) return;
                const chartInstance = echarts.init(chartDom, 'dark', { backgroundColor: 'transparent' });
                
                const total = itemData.uses || 0;
                const data = [Math.floor(total*0.1), Math.floor(total*0.25), Math.floor(total*0.45), Math.floor(total*0.65), Math.floor(total*0.85), total];
                
                chartInstance.setOption({
                    tooltip: { trigger: 'axis', textStyle: { fontSize: 11 } },
                    grid: { top: 15, bottom: 20, left: 35, right: 15 },
                    xAxis: { type: 'category', data: ['1月前','','','','','当前'], axisLabel: { fontSize: 10, color: '#888' }, axisLine: { lineStyle: { color: '#444' } } },
                    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#333', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#888' } },
                    series: [{ data: data, type: 'line', smooth: true, itemStyle: { color: '#4CAF50' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: 'rgba(76,175,80,0.4)'}, {offset: 1, color: 'rgba(76,175,80,0)'}]) } }]
                });
            });

            if (itemData.coverUrl) {
                const viewport = detailView.querySelector('.img-viewport');
                const targetImg = detailView.querySelector('.target-img');
                const btnIn = detailView.querySelector('.btn-zoom-in');
                const btnOut = detailView.querySelector('.btn-zoom-out');
                const btnReset = detailView.querySelector('.btn-zoom-reset');
                const sliderX = detailView.querySelector('.slider-x');
                const sliderY = detailView.querySelector('.slider-y');

                let scale = 1.0;
                const syncTransform = () => { targetImg.style.transform = `scale(${scale}) translate(${sliderX.value}px, ${sliderY.value}px)`; };
                const zoom = (delta) => { scale = Math.max(0.5, Math.min(3.0, scale + delta)); syncTransform(); };

                btnIn.onclick = () => zoom(0.2); btnOut.onclick = () => zoom(-0.2);
                btnReset.onclick = () => { scale = 1; sliderX.value = 0; sliderY.value = 0; syncTransform(); };
                viewport.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? -0.1 : 0.1); });
                sliderX.addEventListener('input', syncTransform); sliderY.addEventListener('input', syncTransform);

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
            isRendered = true;
        }
    };

    const commentsContainer = document.createElement("div");
    commentsContainer.style.height = "250px"; 
    // 【核心新增】：精准挂载资源的 item_id
    const commentUI = createCommentSection(itemData.id, itemData.commentsData || [], currentUser);
    commentsContainer.appendChild(commentUI);
    detailView.appendChild(commentsContainer);

    card.appendChild(summaryView);
    card.appendChild(detailView);
    return card;
}