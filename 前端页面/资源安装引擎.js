// 前端页面/资源安装引擎.js
import { app } from "../../scripts/app.js"; 

export function setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox) {
    btnUse.onclick = (e) => {
        e.stopPropagation();
        if (!currentUser) return alert("⚠️ 请先登录您的社区账号后再获取！");
        inlineStatusBox.style.display = "block";

        if (itemData.type === 'tool') {
            inlineStatusBox.innerHTML = `
                <div style="color: #ccc; margin-bottom: 10px; font-size: 13px;">同意通过 Git 自动将此工具克隆安装到本地 <b>custom_nodes</b> 文件夹？</div>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-confirm-install" style="padding: 6px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">✔️ 同意并安装</button>
                    <button id="btn-cancel-install" style="padding: 6px 15px; background: transparent; color: #aaa; border: 1px solid #555; border-radius: 4px; cursor: pointer;">✖ 取消</button>
                </div>
            `;
            inlineStatusBox.querySelector('#btn-cancel-install').onclick = () => inlineStatusBox.style.display = "none";
            inlineStatusBox.querySelector('#btn-confirm-install').onclick = async () => {
                inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 正在调取底层 Git 环境克隆仓库，请稍候...</span>`;
                try {
                    const res = await fetch("/community_hub/install_tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: itemData.link }) });
                    const data = await res.json();
                    if (data.error === 'git_missing') {
                        inlineStatusBox.innerHTML = `
                            <div style="color: #F44336; margin-bottom: 8px; font-weight: bold;">⚠️ 拦截警告：未检测到 Git 环境！</div>
                            <div style="display: flex; gap: 10px;">
                                <a href="https://git-scm.com/download/win" target="_blank" style="padding: 4px; background: #333; color: #2196F3; text-decoration: none; border-radius: 4px;">💻 Windows</a>
                                <a href="https://git-scm.com/download/mac" target="_blank" style="padding: 4px; background: #333; color: #2196F3; text-decoration: none; border-radius: 4px;">🍏 Mac</a>
                            </div>
                        `;
                    } else if (data.error) {
                        inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 安装失败: ${data.error}</span>`;
                    } else {
                        inlineStatusBox.innerHTML = `<div style="color: #4CAF50; font-size: 14px; font-weight: bold;">🎉 工具安装成功！</div><div style="color: #aaa; margin-top: 5px;">请重启 ComfyUI 以加载新节点。</div>`;
                    }
                } catch(err) { inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 无法连接到本地服务。</span>`; }
            };
        } else if (itemData.type === 'app') {
            inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 正在热加载入工作区...</span>`;
            fetch("/community_hub/download_app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: itemData.link, id: itemData.id }) })
            .then(res => res.json())
            .then(data => {
                if (data.error) { inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 加载失败：${data.error}</span>`; } 
                else {
                    app.loadGraphData(data.data); 
                    inlineStatusBox.innerHTML = `<div style="color: #4CAF50; font-weight: bold;">✅ 工作流已加载到画布！</div><div style="color: #888; margin-top: 4px; font-size: 11px;">(已自动保存至 models/app)</div>`;
                }
            }).catch(e => { inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 无法连接到本地服务。</span>`; });
        } else {
            window.open(itemData.link, "_blank");
            inlineStatusBox.style.display = "none";
        }
    };
}