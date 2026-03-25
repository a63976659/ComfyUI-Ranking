// 前端页面/market/发布内容_提交引擎.js
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";

export async function handlePublishSubmit(params) {
    const {
        container, currentUser, isEditMode, editItemData,
        coverFile, jsonFile, onSuccessCallback, submitBtn, submitBtnText
    } = params;

    const typeSelect = container.querySelector("#pub-type");
    const recommendTypeSelect = container.querySelector("#pub-recommend-type");
    const resTypeSelect = container.querySelector("#pub-resource-type");
    const boxPrivateRepo = container.querySelector("#private-repo-settings");
    const isPrivateCheck = container.querySelector("#pub-is-private");
    const inputLink = container.querySelector("#pub-link");

    const mainType = typeSelect.value;
    let type = mainType;
    if (mainType === "recommend") type = recommendTypeSelect.value;
    
    const title = container.querySelector("#pub-title").value.trim();
    const shortDesc = container.querySelector("#pub-short").value.trim();
    const fullDesc = container.querySelector("#pub-full").value.trim();
    const price = mainType === "recommend" ? 0 : (parseFloat(container.querySelector("#pub-price").value) || 0);
    
    let finalLink = inputLink.value.trim();
    let isJsonUpload = (mainType !== "recommend" && resTypeSelect.value === "json") || (type === "recommend_app");

    if (isEditMode && isJsonUpload && !jsonFile && editItemData.link) finalLink = editItemData.link;

    let github_token = null;
    if (boxPrivateRepo.style.display !== "none" && isPrivateCheck.checked) {
        github_token = container.querySelector("#pub-github-token").value.trim();
        if (!github_token) return showToast("勾选了私有仓库，请务必填写 PAT 访问密钥！", "warning");
    }

    if (!title || !shortDesc) return showToast("请填写名称和简短描述！", "warning");
    if (type === "recommend_link" && !finalLink) return showToast("第三方链接必须提供源地址！", "warning");
    if ((type === "tool" || type === "recommend_tool") && !isJsonUpload && !finalLink) return showToast("必须提供 Git 安装地址！", "warning");
    if (isJsonUpload && !jsonFile && !finalLink) return showToast("必须上传工作流 JSON 文件！", "warning");

    submitBtn.innerHTML = "⏳ 正在连接云端...";
    submitBtn.disabled = true; 
    submitBtn.style.background = "#555";

    try {
        if (isJsonUpload && jsonFile) {
            submitBtn.innerHTML = "⏳ 正在安全上传文件...";
            const uploadType = type.includes("app") ? "app" : (type.includes("tool") ? "tool" : "recommend");
            const jsonUploadRes = await api.uploadFile(jsonFile, uploadType);
            finalLink = jsonUploadRes.url; 
        }

        let coverUrl = isEditMode ? editItemData.coverUrl : null;
        if (coverFile) {
            submitBtn.innerHTML = "⏳ 正在上传封面...";
            const coverUploadRes = await api.uploadFile(coverFile, "cover");
            coverUrl = coverUploadRes.url;
        }

        submitBtn.innerHTML = "⏳ 正在同步全网数据库...";
        const submitData = { type, title, shortDesc, fullDesc, price, link: finalLink, coverUrl, author: currentUser.account, github_token };

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
}