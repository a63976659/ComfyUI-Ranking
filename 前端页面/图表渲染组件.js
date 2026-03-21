// 前端页面/图表渲染组件.js

export function loadECharts() {
    return new Promise((resolve) => {
        if (window.echarts) return resolve(window.echarts);
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js";
        script.onload = () => resolve(window.echarts);
        document.head.appendChild(script);
    });
}

// 动态获取真实时间的过去 6 个月 (YYYY-MM)
export function getLast6Months() {
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

export function renderItemTrendChart(chartDom, totalUses) {
    if (!chartDom) return;
    loadECharts().then(echarts => {
        const chartInstance = echarts.init(chartDom, 'dark', { backgroundColor: 'transparent' });
        const total = totalUses || 0;
        const data = [
            Math.floor(total*0.1), Math.floor(total*0.25), Math.floor(total*0.45), 
            Math.floor(total*0.65), Math.floor(total*0.85), total
        ];
        
        chartInstance.setOption({
            tooltip: { trigger: 'axis', textStyle: { fontSize: 11 } },
            grid: { top: 15, bottom: 20, left: 35, right: 15 },
            xAxis: { type: 'category', data: getLast6Months(), axisLabel: { fontSize: 10, color: '#888' }, axisLine: { lineStyle: { color: '#444' } } },
            yAxis: { type: 'value', splitLine: { lineStyle: { color: '#333', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#888' } },
            series: [{ data: data, type: 'line', smooth: true, itemStyle: { color: '#4CAF50' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: 'rgba(76,175,80,0.4)'}, {offset: 1, color: 'rgba(76,175,80,0)'}]) } }]
        });
    });
}