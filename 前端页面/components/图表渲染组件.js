// 前端页面/components/图表渲染组件.js

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

// 【核心修改】：接收入参从单纯的数字改为完整的 itemData 以读取历史记录
export function renderItemTrendChart(domElement, itemData) {
    domElement.innerHTML = `<div style="text-align:center; line-height:160px; color:#888;">正在加载图表...</div>`;
    loadECharts().then(echarts => {
        domElement.innerHTML = "";
        const chartInstance = echarts.init(domElement, 'dark', { backgroundColor: 'transparent' });
        
        const months = getLast6Months();
        // 提取底层的真实时间序列
        const history = itemData.use_history || {};
        const data = months.map(m => history[m] || 0);

        chartInstance.setOption({
            tooltip: { trigger: 'axis', textStyle: { fontSize: 11 } },
            grid: { top: 10, bottom: 20, left: 35, right: 10 },
            xAxis: { type: 'category', data: months, axisLabel: { color: '#888', fontSize: 10 }, axisLine: { lineStyle: { color: '#444' } } },
            yAxis: { type: 'value', splitLine: { lineStyle: { color: '#333', type: 'dashed' } }, axisLabel: { color: '#888', fontSize: 10 }, minInterval: 1 },
            series: [{
                name: '按月获取量', type: 'line', data: data, smooth: true, 
                itemStyle: { color: '#2196F3' }, lineStyle: { width: 2 },
                areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: 'rgba(33,150,243,0.5)'}, {offset: 1, color: 'rgba(33,150,243,0)'}]) }
            }]
        });
        
        window.addEventListener('resize', () => chartInstance.resize());
    }).catch(err => {
        domElement.innerHTML = `<div style="text-align:center; line-height:160px; color:#F44336;">图表库加载失败</div>`;
    });
}