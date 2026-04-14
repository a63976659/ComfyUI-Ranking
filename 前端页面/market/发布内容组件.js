// 前端页面/market/发布内容组件.js
import { generatePublishHTML } from "./发布内容_UI模板.js";
import { handlePublishSubmit } from "./发布内容_提交引擎.js";
import { t } from "../components/用户体验增强.js";
import { globalModal } from "../components/全局弹窗管理器.js";

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
    const boxAllowRefund = container.querySelector("#box-allow-refund");  // 💸 退款勾选框容器
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
            // 推荐类型编辑回显
            if (editItemData.is_netdisk && editItemData.link) {
                resTypeSelect.value = "netdisk";
                const inputNetdiskLink = container.querySelector("#pub-netdisk-link");
                if (inputNetdiskLink) inputNetdiskLink.value = editItemData.link;
                const inputNetdiskPassword = container.querySelector("#pub-netdisk-password");
                if (inputNetdiskPassword && editItemData.netdisk_password) {
                    inputNetdiskPassword.value = editItemData.netdisk_password;
                }
            } else {
                resTypeSelect.value = "link";
                inputLink.value = editItemData.link || "";
            }
        }
    }

    // 🔄 推荐形式与资源接入联动函数
    const syncRecommendToResType = () => {
        const recType = recommendTypeSelect.value;
        if (recType === "recommend_tool") {
            resTypeSelect.value = "link";
        } else if (recType === "recommend_app") {
            resTypeSelect.value = "json";
        } else if (recType === "recommend_link") {
            resTypeSelect.value = "netdisk";
        }
        // 触发UI更新以显示对应输入框
        updateFormView();
    };

    // 表单联动引擎 (强制状态机模型)
    const updateFormView = () => {
        const mainType = typeSelect.value;
        if (mainType === "recommend") {
            boxRecommendType.style.display = "block";
            boxCover.style.display = "block";
            boxPrice.style.display = "none";
            boxAllowRefund.style.display = "none";  // 💸 推荐类型不显示退款勾选
            boxResourceSelect.style.display = "block";
            boxPrivateRepo.style.display = "none";

            if (resTypeSelect.value === "link") {
                boxLink.style.display = "block";
                boxJson.style.display = "none";
                boxNetdisk.style.display = "none";
                boxNetdiskPassword.style.display = "none";
            } else if (resTypeSelect.value === "netdisk") {
                boxLink.style.display = "none";
                boxJson.style.display = "none";
                boxNetdisk.style.display = "block";
                boxNetdiskPassword.style.display = "block";
            } else {
                boxLink.style.display = "none";
                boxJson.style.display = "block";
                boxNetdisk.style.display = "none";
                boxNetdiskPassword.style.display = "none";
            }
        } else {
            boxRecommendType.style.display = "none";
            boxCover.style.display = "block";
            boxPrice.style.display = "flex";
            boxAllowRefund.style.display = "block";  // 💸 tool/app 类型显示退款勾选
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
    if (isEditMode) {
        updateFormView();
        // 编辑模式下如果是推荐类型，根据回显的推荐形式触发联动（但保留用户已设置的资源接入值）
        if (typeSelect.value === "recommend") {
            // 只有在没有明确设置资源接入值时才自动联动
            // 编辑模式下 editItemData 已设置 resTypeSelect.value，所以这里不需要强制覆盖
            // 但为了确保UI正确显示，调用一次 updateFormView
            updateFormView();
        }
    }

    typeSelect.onchange = () => {
        updateFormView();
        // 当切换到推荐类型时，触发联动
        if (typeSelect.value === "recommend") {
            syncRecommendToResType();
        }
    };
    recommendTypeSelect.onchange = () => {
        syncRecommendToResType();
    };
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

    // 🎨 原创勾选框逻辑：工具/应用类型强制确认弹窗
    const isOriginalCheckbox = container.querySelector("#is-original-checkbox");
    const originalHintText = container.querySelector("#original-hint-text");
    
    // 根据类型更新原创提示文案
    const updateOriginalHint = () => {
        const mainType = typeSelect.value;
        if (originalHintText) {
            if (mainType === "tool" || mainType === "app") {
                originalHintText.innerHTML = `<span style="color: #FF9800;">⚠️ 工具/应用类型必须为原创内容</span>，非原创请发布到「推荐」分类`;
            } else {
                originalHintText.textContent = "原创内容将获得特殊标识展示，请勿标记非原创内容";
            }
        }
    };
    
    // 显示原创确认弹窗
    const showOriginalConfirmModal = (onConfirm, onCancel) => {
        const contentDiv = document.createElement("div");
        contentDiv.innerHTML = `
            <div style="line-height: 1.6; color: #ccc;">
                <p style="margin-bottom: 15px;">您正在声明该内容为个人原创作品。</p>
                <p style="margin-bottom: 10px; color: #fff; font-weight: bold;">请确认：</p>
                <ul style="margin: 0 0 15px 20px; padding: 0; color: #aaa;">
                    <li style="margin-bottom: 5px;">该内容由您本人独立创作</li>
                    <li style="margin-bottom: 5px;">您对该内容拥有完整的知识产权</li>
                    <li style="margin-bottom: 5px;">您愿意为此声明承担相应法律责任</li>
                </ul>
                <p style="margin-top: 15px; padding: 10px; background: rgba(255,152,0,0.1); border-left: 3px solid #FF9800; border-radius: 3px; font-size: 12px; color: #FF9800;">
                    💡 如果您分享的是他人作品或非原创内容，请发布到「推荐」分类。
                </p>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                <button id="btn-original-cancel" style="padding: 8px 16px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer;">取消</button>
                <button id="btn-original-confirm" style="padding: 8px 16px; background: #4CAF50; color: #fff; border: none; border-radius: 4px; cursor: pointer;">确认</button>
            </div>
        `;
        
        globalModal.openModal("原创内容声明", contentDiv, { width: "450px" });
        
        contentDiv.querySelector("#btn-original-confirm").onclick = () => {
            globalModal.closeTopModal();
            onConfirm();
        };
        contentDiv.querySelector("#btn-original-cancel").onclick = () => {
            globalModal.closeTopModal();
            onCancel();
        };
    };
    
    // 监听原创勾选框变化
    isOriginalCheckbox.onchange = (e) => {
        const mainType = typeSelect.value;
        // 只有工具/应用类型才需要确认弹窗
        if ((mainType === "tool" || mainType === "app") && e.target.checked) {
            // 取消勾选，等待用户确认
            e.target.checked = false;
            showOriginalConfirmModal(
                () => { e.target.checked = true; },  // 确认
                () => { e.target.checked = false; }  // 取消
            );
        }
    };
    
    // 监听类型变化，更新提示文案
    typeSelect.addEventListener("change", updateOriginalHint);
    // 初始化提示文案
    updateOriginalHint();

    // 4. 将提取的参数交接给分离出去的提交引擎
    const submitBtn = container.querySelector("#btn-submit-publish");
    submitBtn.onclick = () => handlePublishSubmit({
        container, currentUser, isEditMode, editItemData, 
        imageFiles, jsonFile, onSuccessCallback, submitBtn, submitBtnText  // 🖼️ imageFiles 替换 coverFile
    });

    return container;
}