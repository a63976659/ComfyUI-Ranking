// 前端页面/market/发布内容组件.js
import { generatePublishHTML } from "./发布内容_UI模板.js";
import { handlePublishSubmit } from "./发布内容_提交引擎.js";
import { t } from "../components/用户体验增强.js";

// 🖼️ 编辑模式下回显已有图片的辅助函数
function renderImagePreviews(imageUrls, container, onRemove) {
    container.innerHTML = '';
    imageUrls.forEach((url, idx) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; width: 80px; height: 80px;';
        wrapper.innerHTML = `
            <img src="${url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 2px solid ${idx === 0 ? '#4CAF50' : '#444'};">
            ${idx === 0 ? `<span style="position: absolute; top: 2px; left: 2px; background: #4CAF50; color: #fff; font-size: 10px; padding: 1px 4px; border-radius: 2px;">${t('post.cover')}</span>` : ''}
        `;
        container.appendChild(wrapper);
    });
}

export function createPublishView(currentUser, onBackCallback, onSuccessCallback, editItemData = null, initialType = null) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", 
        fontSize: "14px", padding: "15px", overflowY: "auto", flex: "none", height: "1220px", boxSizing: "border-box"
    });

    const isEditMode = !!editItemData;
    const viewTitle = isEditMode ? `✏️ ${t('publish.edit_content')}` : `🚀 ${t('publish.new_content')}`;
    const submitBtnText = isEditMode ? `💾 ${t('publish.save_changes')}` : `🚀 ${t('publish.confirm_publish')}`;
    const hasExistingToken = isEditMode && !!editItemData.github_token;

    // 1. 渲染分离出去的视图模板
    container.innerHTML = generatePublishHTML(isEditMode, viewTitle, submitBtnText, hasExistingToken, editItemData, t);

    container.querySelector("#btn-back").onclick = () => { if (onBackCallback) onBackCallback(); };

    // 2. DOM 节点引用
    const typeSelect = container.querySelector("#pub-type");
    const recommendTypeSelect = container.querySelector("#pub-recommend-type");
    const boxRecommendType = container.querySelector("#box-recommend-type");
    const resTypeSelect = container.querySelector("#pub-resource-type");
    const boxResourceSelect = container.querySelector("#box-resource-select");
    const boxLink = container.querySelector("#box-link");
    const boxJson = container.querySelector("#box-json");
    const boxNetdisk = container.querySelector("#box-netdisk");  // ☁️ 网盘链接输入框
    const boxNetdiskPassword = container.querySelector("#netdisk-password-settings");  // 🔐 网盘密码设置
    const boxCover = container.querySelector("#box-cover");
    const boxPrice = container.querySelector("#box-price");
    const inputLink = container.querySelector("#pub-link");
    const inputJson = container.querySelector("#pub-json");
    const imagesInput = container.querySelector("#pub-images");  // 🖼️ 多图上传
    const imagesPreview = container.querySelector("#pub-images-preview");  // 🖼️ 多图预览
    
    const boxPrivateRepo = container.querySelector("#private-repo-settings");
    const isPrivateCheck = container.querySelector("#pub-is-private");
    const tokenContainer = container.querySelector("#github-token-container");
    
    // 3. 独立管控的文件流本地沙盒状态
    let imageFiles = [];  // 🖼️ 多图文件列表
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
        
        // 🔄 P7后悔模式：显示待生效价格提示
        const pendingHint = container.querySelector("#price-pending-hint");
        if (pendingHint && editItemData.pending_price !== null && editItemData.pending_price !== undefined && editItemData.pending_price_effective_at) {
            const effectiveTime = new Date(editItemData.pending_price_effective_at);
            const now = new Date();
            if (effectiveTime > now) {
                const hoursLeft = Math.ceil((effectiveTime - now) / (1000 * 60 * 60));
                pendingHint.style.display = "block";
                pendingHint.innerHTML = `⏳ ${t('publish.current_price')} <strong>${editItemData.price}</strong> ${t('common.credits')} → ${t('publish.will_change_in')} <strong>${hoursLeft}</strong> ${t('publish.hours_later')} <strong style="color:#4CAF50;">${editItemData.pending_price}</strong> ${t('common.credits')}`;
            }
        }

        // 🖼️ 编辑模式回显已有图片
        const existingImages = editItemData.imageUrls || [];
        if (editItemData.coverUrl && !existingImages.includes(editItemData.coverUrl)) {
            existingImages.unshift(editItemData.coverUrl);
        }
        if (existingImages.length > 0) {
            container.querySelector("#cover-file-hint").style.display = "inline";
            renderImagePreviews(existingImages, imagesPreview, () => {});
        }

        if (!editItemData.type.startsWith("recommend")) {
            if (editItemData.is_netdisk && editItemData.link) {
                // ☁️ 网盘资源：优先检查网盘标志
                resTypeSelect.value = "netdisk";
                const inputNetdiskLink = container.querySelector("#pub-netdisk-link");
                if (inputNetdiskLink) inputNetdiskLink.value = editItemData.link;
                const inputNetdiskPassword = container.querySelector("#pub-netdisk-password");
                if (inputNetdiskPassword && editItemData.netdisk_password) {
                    inputNetdiskPassword.value = editItemData.netdisk_password;
                }
            } else if (editItemData.link && editItemData.link.includes("huggingface.co")) {
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
            
            // ☁️ 修改：原创工具可选择 "外部链接/Git" 或 "网盘链接"
            const jsonOption = resTypeSelect.querySelector('option[value="json"]');
            if (mainType === "tool") {
                // 工具类型：允许选择 link 或 netdisk，禁用 json 选项
                if (jsonOption) jsonOption.disabled = true;
                if (resTypeSelect.value === "json") {
                    resTypeSelect.value = "link";  // 默认回退到 link
                }
                resTypeSelect.disabled = false;
            } else if (mainType === "app") {
                if (jsonOption) jsonOption.disabled = false;
                resTypeSelect.value = "json";
                resTypeSelect.disabled = true;
            } else {
                if (jsonOption) jsonOption.disabled = false;
                resTypeSelect.disabled = false;
            }

            if (resTypeSelect.value === "link") { 
                boxLink.style.display = "block"; 
                boxJson.style.display = "none"; 
                boxNetdisk.style.display = "none";  // ☁️
                boxNetdiskPassword.style.display = "none";  // 🔐
                boxPrivateRepo.style.display = "block"; 
            } else if (resTypeSelect.value === "netdisk") {
                // ☁️ 网盘链接模式
                boxLink.style.display = "none"; 
                boxJson.style.display = "none"; 
                boxNetdisk.style.display = "block";
                boxNetdiskPassword.style.display = "block";
                boxPrivateRepo.style.display = "none"; 
            } else { 
                boxLink.style.display = "none"; 
                boxJson.style.display = "block"; 
                boxNetdisk.style.display = "none";  // ☁️
                boxNetdiskPassword.style.display = "none";  // 🔐
                boxPrivateRepo.style.display = "none"; 
            }
        }
    };

    // ☁️ 编辑模式下：定义完 updateFormView 后，立即刷新表单UI状态
    if (isEditMode) updateFormView();

    typeSelect.onchange = updateFormView;
    recommendTypeSelect.onchange = updateFormView;
    resTypeSelect.onchange = updateFormView;
    
    isPrivateCheck.onchange = (e) => {
        tokenContainer.style.display = e.target.checked ? "block" : "none";
    };
    
    // 🎯 根据初始类型自动设置并锁定主类别（非编辑模式下）
    if (!isEditMode && initialType) {
        if (initialType === "tool" || initialType === "tools") {
            typeSelect.value = "tool";
        } else if (initialType === "app" || initialType === "apps") {
            typeSelect.value = "app";
        } else if (initialType === "recommend" || initialType === "recommends") {
            typeSelect.value = "recommend";
        }
        // 🔒 锁定主类别，禁止修改
        typeSelect.disabled = true;
    }
    
    updateFormView();

    // 🖼️ 多图上传处理
    imagesInput.onchange = (e) => {
        const files = Array.from(e.target.files).slice(0, 6);  // 最多6张
        if (files.length === 0) return;
        
        imageFiles = files;
        imagesPreview.innerHTML = '';
        
        files.forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'position: relative; width: 80px; height: 80px;';
                wrapper.innerHTML = `
                    <img src="${ev.target.result}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 2px solid ${idx === 0 ? '#4CAF50' : '#444'};">
                    ${idx === 0 ? `<span style="position: absolute; top: 2px; left: 2px; background: #4CAF50; color: #fff; font-size: 10px; padding: 1px 4px; border-radius: 2px;">${t('post.cover')}</span>` : ''}
                    <button data-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                `;
                wrapper.querySelector('button').onclick = () => {
                    imageFiles = imageFiles.filter((_, i) => i !== idx);
                    wrapper.remove();
                    // 更新封面标记
                    const firstImg = imagesPreview.querySelector('img');
                    if (firstImg) firstImg.style.borderColor = '#4CAF50';
                };
                imagesPreview.appendChild(wrapper);
            };
            reader.readAsDataURL(file);
        });
    };
    
    inputJson.onchange = (e) => { jsonFile = e.target.files[0]; };

    // 4. 将提取的参数交接给分离出去的提交引擎
    const submitBtn = container.querySelector("#btn-submit-publish");
    submitBtn.onclick = () => handlePublishSubmit({
        container, currentUser, isEditMode, editItemData, 
        imageFiles, jsonFile, onSuccessCallback, submitBtn, submitBtnText  // 🖼️ imageFiles 替换 coverFile
    });

    return container;
}