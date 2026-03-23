// 前端页面/components/UI交互提示组件.js

/**
 * 轻量级全局消息提示框 (Toast)
 * @param {string} message 提示内容
 * @param {string} type 类型: 'info', 'success', 'error', 'warning'
 */
export function showToast(message, type = "info") {
    const toast = document.createElement("div");
    const colors = { success: "#4CAF50", error: "#F44336", info: "#2196F3", warning: "#FF9800" };
    
    Object.assign(toast.style, {
        position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
        background: colors[type] || colors.info, color: "#fff", padding: "10px 25px",
        borderRadius: "6px", fontSize: "14px", fontWeight: "bold", zIndex: "10000",
        boxShadow: "0 4px 15px rgba(0,0,0,0.4)", opacity: "0", transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
        pointerEvents: "none", display: "flex", alignItems: "center", gap: "8px"
    });

    const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
    toast.innerHTML = `<span>${icons[type] || ""}</span> <span>${message}</span>`;
    
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.top = "50px";
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.top = "20px";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * 界面化的危险操作确认框 (Confirm)
 * @param {string} message 确认信息内容
 * @returns {Promise<boolean>} 用户点击确认返回 true，取消返回 false
 */
export function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.6)", zIndex: "10001", display: "flex",
            alignItems: "center", justifyContent: "center", backdropFilter: "blur(3px)",
            opacity: "0", transition: "opacity 0.2s"
        });

        const box = document.createElement("div");
        Object.assign(box.style, {
            background: "#222", border: "1px solid #444", borderRadius: "8px",
            padding: "20px 25px", width: "320px", color: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column", gap: "15px", transform: "scale(0.9)", transition: "transform 0.2s"
        });

        box.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; color: #FF9800; display: flex; alignItems: center; gap: 8px;">⚠️ 操作确认</div>
            <div style="font-size: 14px; color: #ddd; line-height: 1.6;">${message}</div>
            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
                <button id="ui-btn-cancel" style="padding: 6px 16px; background: transparent; border: 1px solid #555; color: #aaa; border-radius: 4px; cursor: pointer; transition: 0.2s;">取消</button>
                <button id="ui-btn-confirm" style="padding: 6px 16px; background: #F44336; border: none; color: #fff; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(244,67,54,0.3); transition: 0.2s;">确认执行</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            box.style.transform = "scale(1)";
        });

        const close = (result) => {
            overlay.style.opacity = "0";
            box.style.transform = "scale(0.9)";
            setTimeout(() => { overlay.remove(); resolve(result); }, 200);
        };

        box.querySelector("#ui-btn-cancel").onclick = () => close(false);
        box.querySelector("#ui-btn-confirm").onclick = () => close(true);
    });
}