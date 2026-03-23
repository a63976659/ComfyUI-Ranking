// 前端页面/market/创作者卡片组件.js
import { openOtherUserProfileModal } from "../profile/个人中心视图.js";
import { createCommentSection } from "../social/评论与互动组件.js";

function loadECharts() {
    return new Promise((resolve, reject) => {
        if (window.echarts) { resolve(window.echarts); return; }
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js";
        script.onload = () => resolve(window.echarts);
        script.onerror = () => reject(new Error("ECharts 加载失败"));
        document.head.appendChild(script);
    });
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

// 【修复与重构】：针对创作者卡片进行布局调整 (适应图像2样式)
export function createCreatorCard(creatorData, currentUser = null) {
    const card = document.createElement("div");
    Object.assign(card.style, {
        backgroundColor: "var(--comfy-input-bg, #2b2b2b)", borderRadius: "8px", padding: "10px",
        marginBottom: "12px", border: "1px solid #444", color: "#fff", fontFamily: "sans-serif"
    });

    const chartContainerId = `creator-chart-${Math.random().toString(36).substr(2, 9)}`;
    const summaryView = document.createElement("div");
    summaryView.style.cursor = "pointer";

    const avatarSrc = creatorData.avatar || "https://via.placeholder.com/150";
    
    // 【核心修改】：重构未展开状态 (Collapsed View) 为图像2样式，直接在这里显示头像、名称(可点击)和使用次数
    summaryView.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px; padding: 5px 0;">
            <img class="creator-avatar-link" src="${avatarSrc}" title="访问 TA 的主页" style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid #555; object-fit: cover; cursor: pointer; transition: 0.2s;" onmouseover="this.style.borderColor='#4CAF50'" onmouseout="this.style.borderColor='#555'">
            <div class="creator-name-link" title="访问 TA 的主页" style="font-weight: bold; font-size: 16px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='#4CAF50'" onmouseout="this.style.color='white'">${creatorData.name}</div>
            <div style="font-size: 12px; color: #888; margin-left: auto;">被使用 ${creatorData.downloads || 0} 次</div>
        </div>
        <div style="font-size: 12px; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 10px;">${creatorData.shortDesc}</div>
        <div style="background: #222; border-radius: 6px; padding: 8px 10px; border: 1px dashed #555;">
            <div style="display: flex; gap: 15px; font-size: 12px; color: #eee; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #FF5722;">👍 获赞: <strong>${creatorData.likes}</strong></span>
                <span style="color: #FFC107;">⭐ 收藏: <strong>${creatorData.favorites}</strong></span>
                <span style="color: #4CAF50;">👥 粉丝: <strong>${creatorData.followers}</strong></span>
            </div>
            <div style="display: flex; gap: 15px; font-size: 12px; color: #ccc; justify-content: center; border-top: 1px solid #333; padding-top: 8px;">
                <span style="color: #2196F3;">🛠️ 产出工具: <strong>${creatorData.toolsCount}</strong> 个</span>
                <span style="color: #9C27B0;">📦 产出应用: <strong>${creatorData.appsCount}</strong> 个</span>
            </div>
        </div>
    `;

    // 绑定点击跳转事件到头像和名字上 (现在在 summaryView 中)
    const jumpToProfile = (e) => { 
        e.stopPropagation(); // 阻止展开/折叠事件
        openOtherUserProfileModal(creatorData.account, currentUser); 
    };
    summaryView.querySelector('.creator-avatar-link').onclick = jumpToProfile;
    summaryView.querySelector('.creator-name-link').onclick = jumpToProfile;

    const detailView = document.createElement("div");
    Object.assign(detailView.style, { display: "none", marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #555" });

    // 【核心修复】：展开区域 (Detail View) 不再显示创作者头像、名称、被使用次数，直接开始详细说明和图表
    detailView.innerHTML = `
        <div style="background: #1e1e1e; padding: 8px; border-radius: 4px; font-size: 12px; color: #ccc; margin-bottom: 15px; line-height: 1.5;">${creatorData.fullDesc}</div>
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #aaa;">📈 下载量增长趋势</div>
        <div id="${chartContainerId}" style="width: 100%; height: 180px; background: #222; border-radius: 4px; margin-bottom: 15px;"></div>
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px; color: #aaa;">💬 创作者留言板</div>
        <div id="board-${chartContainerId}" style="height: 250px; border: 1px solid #444; border-radius: 4px; overflow: hidden;"></div>
    `;

    const boardContainer = detailView.querySelector(`#board-${chartContainerId}`);
    const commentUI = createCommentSection(creatorData.account, creatorData.commentsData || [], currentUser);
    boardContainer.appendChild(commentUI);

    let isChartRendered = false; let chartInstance = null;

    function renderTrendChart() {
        if (isChartRendered) return;
        const chartDom = detailView.querySelector(`#${chartContainerId}`);
        if (!chartDom) return;
        chartDom.innerHTML = `<div style="text-align:center; line-height:180px; color:#888;">正在加载图表...</div>`;
        loadECharts().then(echarts => {
            chartDom.innerHTML = ""; 
            chartInstance = echarts.init(chartDom, 'dark', { backgroundColor: 'transparent' });
            chartInstance.setOption({
                tooltip: { trigger: 'axis', textStyle: { fontSize: 11 } },
                grid: { top: 10, bottom: 20, left: 35, right: 10 },
                xAxis: { type: 'category', data: getLast6Months(), axisLabel: { color: '#888', fontSize: 10 }, axisLine: { lineStyle: { color: '#444' } } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: '#333', type: 'dashed' } }, axisLabel: { color: '#888', fontSize: 10 } },
                series: [
                    { name: '工具下载', type: 'line', data: creatorData.trendData.tools, smooth: true, itemStyle: { color: '#4CAF50' }, lineStyle: { width: 2, type: 'dashed' } },
                    { name: '应用下载', type: 'line', data: creatorData.trendData.apps, smooth: true, itemStyle: { color: '#2196F3' }, lineStyle: { width: 2, type: 'dashed' } }
                ]
            });
            isChartRendered = true;
        }).catch(err => { chartDom.innerHTML = `<div style="text-align:center; line-height:180px; color:#F44336;">图表库加载失败</div>`; });
    }

    summaryView.onclick = () => {
        const isHidden = detailView.style.display === "none";
        detailView.style.display = isHidden ? "block" : "none";
        if (isHidden) renderTrendChart();
    };

    window.addEventListener('resize', () => { if (chartInstance) chartInstance.resize(); });
    card.appendChild(summaryView); card.appendChild(detailView);
    return card;
}