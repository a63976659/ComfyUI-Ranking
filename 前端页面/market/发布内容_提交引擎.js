// 前端页面/market/发布内容_提交引擎.js
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";

/**
 * 🟢 新增核心逻辑：利用 HTML5 Canvas 纯前端裁剪并压缩头像
 * 功能：强制 1:1 比例中心裁剪，超过 512x512 自动缩放，转换为 JPG 格式。
 */
function processAvatar(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file); // 读取文件为 Base64，用于绘制到 Image 对象
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                // 1. 创建内存 Canvas
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                const targetSize = 512; // 目标尺寸 512x512
                canvas.width = targetSize;
                canvas.height = targetSize;

                // 2. 计算 1:1 中心裁剪区域 (强制正方形)
                const sourceWidth = img.width;
                const sourceHeight = img.height;
                const sourceMin = Math.min(sourceWidth, sourceHeight);

                let sourceX, sourceY;
                if (sourceWidth > sourceHeight) {
                    sourceX = (sourceWidth - sourceHeight) / 2;
                    sourceY = 0;
                } else {
                    sourceX = 0;
                    sourceY = (sourceHeight - sourceWidth) / 2;
                }

                // 3. 将原图中心裁剪区绘制并缩放到 512x512 的 Canvas 上
                ctx.drawImage(
                    img,
                    sourceX, sourceY, sourceMin, sourceMin, // 原图裁剪区 [X, Y, W, H]
                    0, 0, targetSize, targetSize             // 目标 Canvas 区 [X, Y, W, H]
                );

                // 4. 关键：将 Canvas 转换为 Blob (JPG 格式，85% 质量压缩)
                canvas.toBlob((blob) => {
                    if (blob) {
                        // 将 Blob 重新封装为 File 对象，保持原本文件名，修改 mime 为 image/jpeg
                        const newFileName = file.name.replace(/\.[^/.]+$/, "") + "_cropped.jpg";
                        const processedFile = new File([blob], newFileName, { type: "image/jpeg" });
                        console.log(`✅ 头像处理完成：原始 ${(file.size/1024).toFixed(1)}KB -> 压缩后 ${(processedFile.size/1024).toFixed(1)}KB`);
                        resolve(processedFile);
                    } else {
                        reject(new Error("Canvas 转换 Blob 失败"));
                    }
                }, "image/jpeg", 0.85); // 0.85 是 JPG 质量，兼顾清晰度与体积
            };
            img.onerror = () => reject(new Error("图片加载失败"));
        };
        reader.onerror = (e) => reject(new Error("文件读取失败"));
    });
}

/**
 * 🟢 新增：全局统一的文件上传包装器（供个人设置等其它组件调用）
 * 会在上传前自动拦截并处理头像图片
 */
export async function uploadFile(file, file_type) {
    try {
        let fileToUpload = file;
        
        // 拦截点：如果是头像，就在纯内存中先进行裁剪、缩放、压缩
        if (file_type === "avatar" && file.type && file.type.startsWith("image/")) {
            showToast("🖼️ 正在本地处理和压缩头像...");
            fileToUpload = await processAvatar(file);
        }

        showToast(`🌐 正在上传文件 ${(fileToUpload.size/1024).toFixed(1)}KB 至云端...`);
        const res = await api.uploadFile(fileToUpload, file_type);
        
        if (res.status === "success") {
            showToast("✅ 文件上传成功！");
            return res.url; 
        } else {
            showToast(`❌ 文件上传失败: ${res.error || res.message}`, "error");
            return null;
        }
    } catch (error) {
        console.error("Upload Error:", error);
        showToast(`❌ 上传过程出现异常: ${error.message}`, "error");
        return null;
    }
}

// ==========================================
// 原有的发布表单提交逻辑 (完美保留，无任何删减)
// ==========================================
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