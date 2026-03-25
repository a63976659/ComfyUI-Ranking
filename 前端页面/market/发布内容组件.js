// 前端页面/market/发布内容组件.js
import { generatePublishHTML } from "./发布内容_UI模板.js";
import { handlePublishSubmit } from "./发布内容_提交引擎.js";

export function createPublishView(currentUser, onBackCallback, onSuccessCallback, editItemData = null) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", 
        fontSize: "14px", padding: "15px", overflowY: "auto", flex: "none", height: "1220px", boxSizing: "border-box"
    });

    const isEditMode = !!editItemData;
    const viewTitle = isEditMode ? "✏️ 修改发布内容" : "🚀 发布新内容";
    const submitBtnText = isEditMode ? "💾 保 存 修 改" : "🚀 确 认 发 布";
    const hasExistingToken = isEditMode && !!editItemData.github_token;

    // 1. 渲染分离出去的视图模板
    container.innerHTML = generatePublishHTML(isEditMode, viewTitle, submitBtnText, hasExistingToken, editItemData);

    container.querySelector("#btn-back").onclick = () => { if (onBackCallback) onBackCallback(); };

    // 2. DOM 节点引用
    const typeSelect = container.querySelector("#pub-type");
    const recommendTypeSelect = container.querySelector("#pub-recommend-type");
    const boxRecommendType = container.querySelector("#box-recommend-type");
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
    
    const boxPrivateRepo = container.querySelector("#private-repo-settings");
    const isPrivateCheck = container.querySelector("#pub-is-private");
    const tokenContainer = container.querySelector("#github-token-container");
    
    // 3. 独立管控的文件流本地沙盒状态
    let coverFile = null;
    let jsonFile = null;

    // 编辑模式下的数据回显防抖填充
    if (isEditMode) {
        if (editItemData.type.startsWith("recommend")) {
            typeSelect.value = "recommend";
            recommendTypeSelect.value = editItemData.type === "recommend" ? "recommend_link" : editItemData.type;
        } else {
            typeSelect.value = editItemData.type;
        }
        typeSelect.disabled = true; 
        recommendTypeSelect.disabled = true;

        container.querySelector("#pub-title").value = editItemData.title || "";
        container.querySelector("#pub-short").value = editItemData.shortDesc || "";
        container.querySelector("#pub-full").value = editItemData.fullDesc || "";
        container.querySelector("#pub-price").value = editItemData.price || 0;

        if (editItemData.coverUrl) {
            coverPreview.src = editItemData.coverUrl;
            coverPreview.style.display = "block";
            container.querySelector("#cover-file-hint").style.display = "inline";
        }

        if (!editItemData.type.startsWith("recommend")) {
            if (editItemData.link && editItemData.link.includes("huggingface.co")) {
                resTypeSelect.value = "json";
                container.querySelector("#json-file-hint").style.display = "inline";
            } else if (editItemData.link) {
                resTypeSelect.value = "link";
                inputLink.value = editItemData.link;
            }
        } else {
            inputLink.value = editItemData.link || "";
        }
    }

    // 表单联动引擎 (强制状态机模型)
    const updateFormView = () => {
        const mainType = typeSelect.value;
        if (mainType === "recommend") {
            boxRecommendType.style.display = "block";
            boxCover.style.display = "block"; 
            boxPrice.style.display = "none";
            boxResourceSelect.style.display = "none";
            boxPrivateRepo.style.display = "none"; 

            const recType = recommendTypeSelect.value;
            if (recType === "recommend_app") {
                boxLink.style.display = "none"; boxJson.style.display = "block";
            } else {
                boxLink.style.display = "block"; boxJson.style.display = "none";
            }
        } else {
            boxRecommendType.style.display = "none";
            boxCover.style.display = "block"; 
            boxPrice.style.display = "flex";
            boxResourceSelect.style.display = "block";
            
            if (mainType === "tool") {
                resTypeSelect.value = "link";
                resTypeSelect.disabled = true;
            } else if (mainType === "app") {
                resTypeSelect.value = "json";
                resTypeSelect.disabled = true;
            } else {
                resTypeSelect.disabled = false;
            }

            if (resTypeSelect.value === "link") { 
                boxLink.style.display = "block"; 
                boxJson.style.display = "none"; 
                boxPrivateRepo.style.display = "block"; 
            } else { 
                boxLink.style.display = "none"; 
                boxJson.style.display = "block"; 
                boxPrivateRepo.style.display = "none"; 
            }
        }
    };

    typeSelect.onchange = updateFormView;
    recommendTypeSelect.onchange = updateFormView;
    resTypeSelect.onchange = updateFormView;
    
    isPrivateCheck.onchange = (e) => {
        tokenContainer.style.display = e.target.checked ? "block" : "none";
    };
    
    updateFormView();

    coverInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        coverFile = file;
        const reader = new FileReader();
        reader.onload = (event) => { coverPreview.src = event.target.result; coverPreview.style.display = "block"; };
        reader.readAsDataURL(file);
    };
    inputJson.onchange = (e) => { jsonFile = e.target.files[0]; };

    // 4. 将提取的参数交接给分离出去的提交引擎
    const submitBtn = container.querySelector("#btn-submit-publish");
    submitBtn.onclick = () => handlePublishSubmit({
        container, currentUser, isEditMode, editItemData, 
        coverFile, jsonFile, onSuccessCallback, submitBtn, submitBtnText
    });

    return container;
}