// 前端页面/market/资源安装引擎.js
import { app } from "../../../scripts/app.js"; 
import { showToast } from "../components/UI交互提示组件.js";
import { api } from "../core/网络请求API.js"; 

export function setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox) {
    btnUse.onclick = (e) => {
        e.stopPropagation();
        if (!currentUser) return showToast("⚠️ 请先登录您的社区账号后再获取！", "warning");
        inlineStatusBox.style.display = "block";

        // 【核心修改】：匹配子类型并分配到对应的处理逻辑中
        const isTool = itemData.type === 'tool' || itemData.type === 'recommend_tool';
        const isApp = itemData.type === 'app' || itemData.type === 'recommend_app';

        if (isTool) {
            inlineStatusBox.innerHTML = `
                <div style="color: #ccc; margin-bottom: 10px; font-size: 13px;">同意通过 Git 自动将此工具克隆安装到本地 <b>custom_nodes</b> 文件夹？</div>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-confirm-install" style="padding: 6px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">✔️ 同意并安装</button>
                    <button id="btn-cancel-install" style="padding: 6px 15px; background: transparent; color: #aaa; border: 1px solid #555; border-radius: 4px; cursor: pointer;">✖ 取消</button>
                </div>
            `;
            inlineStatusBox.querySelector('#btn-cancel-install').onclick = () => inlineStatusBox.style.display = "none";
            inlineStatusBox.querySelector('#btn-confirm-install').onclick = async () => {
                inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 正在执行安全克隆安装...</span>`;
                try { await api.incrementItemUse(itemData.id); } catch(err) {}
                try {
                    const res = await fetch("/community_hub/install_tool", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: itemData.link })
                    });
                    const data = await res.json();
                    if (data.error) {
                        inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 安装失败: ${data.error}</span>`;
                    } else {
                        inlineStatusBox.innerHTML = `<div style="color: #4CAF50; font-size: 14px; font-weight: bold;">🎉 工具安装成功！</div><div style="color: #aaa; margin-top: 5px;">请重启 ComfyUI 以加载新节点。</div>`;
                    }
                } catch(err) { inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 无法连接到本地服务。</span>`; }
            };
        } else if (isApp) {
            inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 正在热加载入工作区...</span>`;
            api.incrementItemUse(itemData.id).catch(()=>{});
            fetch("/community_hub/download_app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: itemData.link, id: itemData.id }) })
            .then(res => res.json())
            .then(data => {
                if (data.error) { inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 加载失败：${data.error}</span>`; } 
                else {
                    app.loadGraphData(data.data); 
                    inlineStatusBox.innerHTML = `<div style="color: #4CAF50; font-weight: bold;">✅ 工作流已加载到画布！</div><div style="color: #888; margin-top: 4px;">由于本地节点差异可能出现飘红，请使用管理器补全节点。</div>`;
                }
            })
            .catch(() => { inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 无法连接到本地服务。</span>`; });
        } else {
            // 对于 pure 推荐链接 recommend_link
            api.incrementItemUse(itemData.id).catch(()=>{});
            inlineStatusBox.innerHTML = `<span style="color: #FF9800;">该资源需手动访问源地址获取：</span><a href="${itemData.link}" target="_blank" style="color: #2196F3; margin-left: 5px;">前往地址</a>`;
        }
    };
}