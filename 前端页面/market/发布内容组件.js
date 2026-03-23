// 前端页面/market/发布内容组件.js
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";

// 【核心修改】：支持接收 editItemData 以进入编辑模式
export function createPublishView(currentUser, onBackCallback, onSuccessCallback, editItemData = null) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", 
        fontSize: "14px", padding: "15px", overflowY: "auto", flex: "none", height: "1220px", boxSizing: "border-box"
    });

    const isEditMode = !!editItemData;
    const viewTitle = isEditMode ? "✏️ 修改发布内容" : "🚀 发布新内容";
    const submitBtnText = isEditMode ? "💾 保 存 修 改" : "🚀 确 认 发 布";

    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 15px;">
            <button id="btn-back" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#333'; this.style.borderColor='#555'">
                <span style="font-size: 14px;">⬅</span> 返回上一页
            </button>
            <span style="font-size: 16px; font-weight: bold; color: #fff;">${viewTitle}</span>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 5px;">
            <div style="flex: 1;">
                <label style="display: block; margin-bottom: 5px;">类型 <span style="color: #F44336;">*</span></label>
                <select id="pub-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="tool">🧰 插件 / 工具 (Tool)</option>
                    <option value="app">📦 工作流 / 应用 (App)</option>
                    <option value="recommend">🌟 推荐他人作品 (Recommend)</option>
                </select>
            </div>
            <div style="flex: 2;">
                <label style="display: block; margin-bottom: 5px;">名称 <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-title" placeholder="例如：强烈推荐飞行翻译双语增强版！" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
        </div>

        <div style="margin-bottom: 5px;">
            <label style="display: block; margin-bottom: 5px;">简短描述 (一句话介绍) <span style="color: #F44336;">*</span></label>
            <input type="text" id="pub-short" placeholder="最多 50 字，突出核心亮点..." maxlength="50" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555;">
            <div style="flex: 1;" id="box-resource-select">
                <label style="display: block; margin-bottom: 5px;">资源接入 <span style="color: #F44336;">*</span></label>
                <select id="pub-resource-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="link">🔗 外部链接</option>
                    <option value="json">📄 上传 JSON</option>
                </select>
            </div>
            <div style="flex: 2;" id="box-link">
                <label style="display: block; margin-bottom: 5px;">源地址或引用 ID <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-link" placeholder="输入外部地址或本社区作品的链接..." style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div style="flex: 2; display: none;" id="box-json">
                <label style="display: block; margin-bottom: 5px;">选择 JSON 文件 <span style="color: #F44336;">*</span> <span id="json-file-hint" style="color:#4CAF50; font-size:12px; font-weight:normal; display:none;">(已包含云端文件，重新选择将覆盖)</span></label>
                <input type="file" id="pub-json" accept=".json" style="width: 100%; padding: 6px; color: #aaa; font-size: 12px;">
            </div>
        </div>

        <div id="box-cover" style="margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555;">
            <label style="display: block; margin-bottom: 5px;">展示封面图 (限1张，可选) <span id="cover-file-hint" style="color:#4CAF50; font-size:12px; font-weight:normal; display:none;">(重新选择将覆盖原图)</span></label>
            <input type="file" id="pub-cover" accept="image/*" style="width: 100%; padding: 4px; color: #aaa; font-size: 12px;">
            <div style="margin-top: 8px; text-align: center;">
                <img id="pub-cover-preview" style="width: 100%; max-height: 150px; object-fit: contain; border-radius: 4px; display: none; border: 2px dashed #444; background: #111; padding: 2px;">
            </div>
        </div>

        <div id="box-price" style="display: flex; gap: 10px; margin-bottom: 5px;">
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                <label style="display: block; margin-bottom: 5px;">标价 (积分) <span style="color: #F44336;">*</span></label>
                <input type="number" id="pub-price" value="0" min="0" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #FF9800; font-weight: bold; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div style="flex: 2;">
                <div style="font-size: 11px; color: #888; margin-top: 25px; line-height: 1.4;">填写 0 代表免费开源。</div>
            </div>
        </div>

        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px;">详细说明</label>
            <textarea id="pub-full" rows="6" placeholder="介绍具体功能、使用方法、前置环境要求等..." style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; resize: vertical; box-sizing: border-box;"></textarea>
        </div>

        <button id="btn-submit-publish" style="width: 100%; padding: 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 15px; transition: 0.3s; margin-bottom: 20px;">${submitBtnText}</button>
    `;

    container.querySelector("#btn-back").onclick = () => { if (onBackCallback) onBackCallback(); };

    const typeSelect = container.querySelector("#pub-type");
    const resTypeSelect = container.querySelector("#pub-resource-type");
    const boxResourceSelect = container.querySelector("#box-resource-select");
    const boxLink = container.querySelector("#box-link");
    const boxJson = container.querySelector("#box-json");
    const boxCover = container.querySelector("#box-cover");
    const boxPrice = container.querySelector("#box-price");
    const inputLink = container.querySelector("#pub-link");
    const inputJson = container.querySelector("#pub-json");
    const coverInput = container.querySelector("#pub-cover");
    const coverPreview = container.querySelector("#pub-cover-preview");
    
    let coverFile = null;
    let jsonFile = null;

    // 【核心新增】：回显已有数据
    if (isEditMode) {
        typeSelect.value = editItemData.type;
        typeSelect.disabled = true; // 修改时不允许变更核心大类
        container.querySelector("#pub-title").value = editItemData.title || "";
        container.querySelector("#pub-short").value = editItemData.shortDesc || "";
        container.querySelector("#pub-full").value = editItemData.fullDesc || "";
        container.querySelector("#pub-price").value = editItemData.price || 0;

        if (editItemData.type !== "recommend") {
            if (editItemData.link && editItemData.link.includes("huggingface.co")) {
                resTypeSelect.value = "json";
                container.querySelector("#json-file-hint").style.display = "inline";
            } else if (editItemData.link) {
                resTypeSelect.value = "link";
                inputLink.value = editItemData.link;
            }
            if (editItemData.coverUrl) {
                coverPreview.src = editItemData.coverUrl;
                coverPreview.style.display = "block";
                container.querySelector("#cover-file-hint").style.display = "inline";
            }
        } else {
            inputLink.value = editItemData.link || "";
        }
    }

    const updateFormView = () => {
        const mainType = typeSelect.value;
        if (mainType === "recommend") {
            boxCover.style.display = "none"; boxPrice.style.display = "none";
            boxResourceSelect.style.display = "none"; boxLink.style.display = "block";
            boxJson.style.display = "none"; resTypeSelect.value = "link";
        } else {
            boxCover.style.display = "block"; boxPrice.style.display = "flex";
            boxResourceSelect.style.display = "block";
            if (resTypeSelect.value === "link") { boxLink.style.display = "block"; boxJson.style.display = "none"; } 
            else { boxLink.style.display = "none"; boxJson.style.display = "block"; }
        }
    };

    typeSelect.onchange = updateFormView;
    resTypeSelect.onchange = updateFormView;
    updateFormView(); // 初始化触发一次

    coverInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        coverFile = file;
        const reader = new FileReader();
        reader.onload = (event) => { coverPreview.src = event.target.result; coverPreview.style.display = "block"; };
        reader.readAsDataURL(file);
    };

    inputJson.onchange = (e) => { jsonFile = e.target.files[0]; };

    const submitBtn = container.querySelector("#btn-submit-publish");

    submitBtn.onclick = async () => {
        const type = typeSelect.value;
        const title = container.querySelector("#pub-title").value.trim();
        const shortDesc = container.querySelector("#pub-short").value.trim();
        const fullDesc = container.querySelector("#pub-full").value.trim();
        const price = type === "recommend" ? 0 : (parseFloat(container.querySelector("#pub-price").value) || 0);
        const resType = resTypeSelect.value;
        
        let finalLink = inputLink.value.trim();
        // 如果是修改模式，且没有传新文件，则继承老的外部链接/云端链接
        if (isEditMode && resType === "json" && !jsonFile && editItemData.link) {
            finalLink = editItemData.link;
        }

        if (!title || !shortDesc) return showToast("请填写名称和简短描述！", "warning");
        if (type === "recommend" && !finalLink) return showToast("推荐榜必须提供要推荐的源地址！", "warning");
        if (type !== "recommend" && resType === "link" && !finalLink) return showToast("请填写资源外部链接！", "warning");
        if (type !== "recommend" && resType === "json" && !jsonFile && !finalLink) return showToast("请选择要上传的 JSON 文件！", "warning");

        submitBtn.innerHTML = "⏳ 正在连接云端...";
        submitBtn.disabled = true; submitBtn.style.background = "#555";

        try {
            if (type !== "recommend" && resType === "json" && jsonFile) {
                submitBtn.innerHTML = "⏳ 正在安全上传文件...";
                const jsonUploadRes = await api.uploadFile(jsonFile, type);
                finalLink = jsonUploadRes.url; 
            }

            let coverUrl = isEditMode ? editItemData.coverUrl : null; // 默认继承
            if (type !== "recommend" && coverFile) {
                submitBtn.innerHTML = "⏳ 正在上传新封面...";
                const coverUploadRes = await api.uploadFile(coverFile, "cover");
                coverUrl = coverUploadRes.url;
            }

            submitBtn.innerHTML = "⏳ 正在同步全网数据库...";
            const submitData = { type, title, shortDesc, fullDesc, price, link: finalLink, coverUrl, author: currentUser.account };

            // 【核心分支】：判断是执行发布还是修改
            if (isEditMode) {
                await api.updateItem(editItemData.id, currentUser.account, submitData);
                showToast("✅ 修改已保存并同步全网！", "success");
            } else {
                await api.publishItem(submitData);
                showToast("🎉 发布成功！您的作品已全网同步。", "success");
            }
            
            if (onSuccessCallback) onSuccessCallback();

        } catch (err) {
            showToast("操作失败: " + err.message, "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtnText;
            submitBtn.style.background = "#2196F3";
        }
    };

    return container;
}