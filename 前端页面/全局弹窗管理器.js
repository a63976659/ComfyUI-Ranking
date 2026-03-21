// 前端页面/全局弹窗管理器.js

export class ModalManager {
    constructor() {
        this.activeModals = []; // 用于存储当前打开的所有弹窗，实现层级管理
        this.overlay = null;
        this.initOverlay();
    }

    // 初始化全局半透明遮罩层
    initOverlay() {
        if (document.getElementById("community-hub-overlay")) return;

        this.overlay = document.createElement("div");
        this.overlay.id = "community-hub-overlay";
        Object.assign(this.overlay.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            zIndex: "9998", // 位于 ComfyUI 画布之上，但低于侧边栏和弹窗
            display: "none",
            backdropFilter: "blur(3px)" // 添加背景模糊效果
        });

        // 点击遮罩层时，关闭最顶层的一个弹窗
        this.overlay.onclick = () => {
            this.closeTopModal();
        };

        document.body.appendChild(this.overlay);
    }

    /**
     * 打开一个新的弹窗
     * @param {string} title 弹窗标题
     * @param {HTMLElement} contentElement 包含实际内容的 DOM 元素
     * @param {object} options 配置项 (如宽度)
     */
    openModal(title, contentElement, options = { width: "500px" }) {
        const modalContainer = document.createElement("div");
        Object.assign(modalContainer.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: options.width,
            backgroundColor: "var(--bg-color, #202020)",
            border: "1px solid #555",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
            zIndex: (9999 + this.activeModals.length).toString(), // 动态计算 z-index，实现层级覆盖
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
        });

        // 弹窗头部 (包含标题和关闭按钮)
        const header = document.createElement("div");
        Object.assign(header.style, {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "15px 20px",
            borderBottom: "1px solid #444",
            backgroundColor: "#2a2a2a"
        });

        const titleSpan = document.createElement("span");
        titleSpan.innerText = title;
        Object.assign(titleSpan.style, {
            fontWeight: "bold",
            fontSize: "16px",
            color: "#fff"
        });

        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✖";
        Object.assign(closeBtn.style, {
            background: "transparent",
            border: "none",
            color: "#aaa",
            cursor: "pointer",
            fontSize: "14px"
        });
        // 绑定关闭当前弹窗事件，防止事件冒泡触发底层点击
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.closeModal(modalContainer);
        };

        header.appendChild(titleSpan);
        header.appendChild(closeBtn);

        // 弹窗内容区
        const contentWrapper = document.createElement("div");
        Object.assign(contentWrapper.style, {
            padding: "20px",
            maxHeight: "70vh", // 防止弹窗过高，限制最大高度
            overflowY: "auto",
            color: "#eee"
        });
        contentWrapper.appendChild(contentElement);

        modalContainer.appendChild(header);
        modalContainer.appendChild(contentWrapper);
        document.body.appendChild(modalContainer);

        // 记录状态并显示遮罩
        this.activeModals.push(modalContainer);
        this.overlay.style.display = "block";
    }

    // 关闭指定的弹窗
    closeModal(modalElement) {
        if (!modalElement) return;
        modalElement.remove();
        this.activeModals = this.activeModals.filter(m => m !== modalElement);
        
        // 如果没有打开的弹窗了，隐藏遮罩层
        if (this.activeModals.length === 0) {
            this.overlay.style.display = "none";
        }
    }

    // 关闭位于最顶层的弹窗 (通常用于点击遮罩层或按 ESC 键时触发)
    closeTopModal() {
        if (this.activeModals.length > 0) {
            const topModal = this.activeModals[this.activeModals.length - 1];
            this.closeModal(topModal);
        }
    }
}

// 导出一个全局单例，确保整个应用只实例化一次
export const globalModal = new ModalManager();