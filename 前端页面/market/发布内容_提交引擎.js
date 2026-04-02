// 前端页面/market/发布内容_提交引擎.js
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { removeCache } from "../components/性能优化工具.js";

/**
 * 🟢 根据发布类型清除对应缓存（精确清除，不影响其他页面）
 * @param {string} type - 发布类型: tool/app/recommend/recommend_tool/recommend_app/recommend_link
 */
function clearItemCacheByType(type) {
    // 确定当前类型对应的 tab
    let tab = 'recommends';
    if (type === 'tool' || type === 'recommend_tool') {
        tab = 'tools';
    } else if (type === 'app' || type === 'recommend_app') {
        tab = 'apps';
    }
    
    // 清除 API 缓存
    removeCache('api_/api/items');
    removeCache(`api_/api/items?type=${type.replace('recommend_', '')}`);
    removeCache('api_/api/creators');  // 创作者列表也需要刷新
    
    // 清除侧边栏数据引擎缓存（只清除对应类型）
    const sorts = ['latest', 'popular', 'rating', 'hot'];
    for (const sort of sorts) {
        removeCache(`ListCache_${tab}_${sort}`);
        removeCache(`ListCache_creators_${sort}`);  // 创作者列表
    }
    
    console.log(`🗑️ 已清除 [${tab}] 类型的列表缓存`);
}

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
 * 上传前图片压缩处理
 * - 转为 JPG 格式
 * - 超过 5MB 时进行质量压缩，不改变宽高比例
 * @param {File} file - 原始图片文件
 * @returns {Promise<File>} - 处理后的文件
 */
export async function compressImageForUpload(file) {
    // 如果不是图片文件，直接返回
    if (!file.type || !file.type.startsWith('image/')) {
        return file;
    }
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            URL.revokeObjectURL(url);
            
            const canvas = document.createElement('canvas');
            // 保持原始宽高，不改变比例
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            const ctx = canvas.getContext('2d');
            // 白色背景（JPG不支持透明）
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            const maxSize = 5 * 1024 * 1024; // 5MB
            
            // 如果原文件已经是JPG且小于5MB，直接返回
            if ((file.type === 'image/jpeg' || file.type === 'image/jpg') && file.size <= maxSize) {
                resolve(file);
                return;
            }
            
            // 先尝试高质量JPG
            let quality = 0.92;
            
            const tryCompress = () => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('图片压缩失败'));
                        return;
                    }
                    
                    if (blob.size <= maxSize || quality <= 0.3) {
                        // 压缩到5MB以下或已达最低质量
                        const compressedFile = new File([blob], 
                            file.name.replace(/\.[^.]+$/, '.jpg'), 
                            { type: 'image/jpeg' }
                        );
                        console.log(`📦 图片压缩: ${(file.size/1024/1024).toFixed(2)}MB → ${(compressedFile.size/1024/1024).toFixed(2)}MB (quality: ${quality.toFixed(2)})`);
                        resolve(compressedFile);
                    } else {
                        // 还是太大，降低质量继续压缩
                        quality -= 0.1;
                        tryCompress();
                    }
                }, 'image/jpeg', quality);
            };
            
            tryCompress();
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(url);
            // 加载失败，返回原文件
            resolve(file);
        };
        
        img.src = url;
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
            showToast(`🖼️ ${t('publish.processing_avatar')}`);
            fileToUpload = await processAvatar(file);
        }

        showToast(`🌐 ${t('publish.uploading_file', { size: (fileToUpload.size/1024).toFixed(1) })}`);
        const res = await api.uploadFile(fileToUpload, file_type);
        
        if (res.status === "success") {
            showToast(`✅ ${t('publish.upload_success')}`);
            return res.url; 
        } else {
            showToast(`❌ ${t('publish.upload_failed')}: ${res.error || res.message}`, "error");
            return null;
        }
    } catch (error) {
        console.error("Upload Error:", error);
        showToast(`❌ ${t('publish.upload_error')}: ${error.message}`, "error");
        return null;
    }
}

// ==========================================
// 原有的发布表单提交逻辑 (完美保留，无任何删减)
// ==========================================
export async function handlePublishSubmit(params) {
    const {
        container, currentUser, isEditMode, editItemData,
        imageFiles, jsonFile, onSuccessCallback, submitBtn, submitBtnText  // 🖼️ imageFiles 替换 coverFile
    } = params;

    const typeSelect = container.querySelector("#pub-type");
    const recommendTypeSelect = container.querySelector("#pub-recommend-type");
    const resTypeSelect = container.querySelector("#pub-resource-type");
    const boxPrivateRepo = container.querySelector("#private-repo-settings");
    const isPrivateCheck = container.querySelector("#pub-is-private");
    const inputLink = container.querySelector("#pub-link");
    const inputNetdiskLink = container.querySelector("#pub-netdisk-link");  // ☁️ 网盘链接
    const inputNetdiskPassword = container.querySelector("#pub-netdisk-password");  // 🔐 网盘密码

    const mainType = typeSelect.value;
    let type = mainType;
    if (mainType === "recommend") type = recommendTypeSelect.value;
    
    const title = container.querySelector("#pub-title").value.trim();
    const shortDesc = container.querySelector("#pub-short").value.trim();
    const fullDesc = container.querySelector("#pub-full").value.trim();
    const price = mainType === "recommend" ? 0 : (parseFloat(container.querySelector("#pub-price").value) || 0);
    
    let finalLink = inputLink.value.trim();
    let isJsonUpload = (mainType !== "recommend" && resTypeSelect.value === "json") || (type === "recommend_app");
    let isNetdisk = (mainType !== "recommend" && resTypeSelect.value === "netdisk");  // ☁️ 是否网盘模式
    
    // ☁️ 网盘模式下使用网盘链接
    if (isNetdisk) {
        finalLink = inputNetdiskLink.value.trim();
    }

    if (isEditMode && isJsonUpload && !jsonFile && editItemData.link) finalLink = editItemData.link;

    // ☁️ 网盘密码（加密存储，仅购买后解密显示）
    let netdisk_password = null;
    if (isNetdisk && inputNetdiskPassword.value.trim()) {
        netdisk_password = inputNetdiskPassword.value.trim();
    }

    let github_token = null;
    if (boxPrivateRepo.style.display !== "none" && isPrivateCheck.checked) {
        github_token = container.querySelector("#pub-github-token").value.trim();
        if (!github_token) return showToast(t('publish.pat_required'), "warning");
    }

    if (!title || !shortDesc) return showToast(t('publish.name_desc_required'), "warning");
    if (type === "recommend_link" && !finalLink) return showToast(t('publish.link_required'), "warning");
    if ((type === "tool" || type === "recommend_tool") && !isJsonUpload && !isNetdisk && !finalLink) return showToast(t('publish.git_required'), "warning");
    if (isJsonUpload && !jsonFile && !finalLink) return showToast(t('publish.json_required'), "warning");
    if (isNetdisk && !finalLink) return showToast(t('publish.netdisk_required'), "warning");  // ☁️

    submitBtn.innerHTML = `⏳ ${t('publish.connecting')}`;
    submitBtn.disabled = true; 
    submitBtn.style.background = "#555";

    try {
        if (isJsonUpload && jsonFile) {
            submitBtn.innerHTML = `⏳ ${t('publish.uploading_secure')}`;
            const uploadType = type.includes("app") ? "app" : (type.includes("tool") ? "tool" : "recommend");
            const jsonUploadRes = await api.uploadFile(jsonFile, uploadType);
            finalLink = jsonUploadRes.url; 
        }

        // 🖼️ 上传多张效果展示图
        let coverUrl = isEditMode ? editItemData.coverUrl : null;
        let imageUrls = isEditMode ? (editItemData.imageUrls || []) : [];
        
        if (imageFiles && imageFiles.length > 0) {
            submitBtn.innerHTML = `⏳ ${t('publish.uploading_images', { current: 0, total: imageFiles.length })}`;
            const uploadedUrls = [];
            
            for (let i = 0; i < imageFiles.length; i++) {
                submitBtn.innerHTML = `⏳ ${t('publish.uploading_images', { current: i + 1, total: imageFiles.length })}`;
                // 上传前压缩：转JPG，超5MB压缩
                const processedFile = await compressImageForUpload(imageFiles[i]);
                const uploadRes = await api.uploadFile(processedFile, "cover");
                uploadedUrls.push(uploadRes.url);
            }
            
            coverUrl = uploadedUrls[0];  // 第一张作为封面
            imageUrls = uploadedUrls;     // 全部图片URL
        }

        submitBtn.innerHTML = `⏳ ${t('publish.syncing')}`;
        const submitData = { 
            type, title, shortDesc, fullDesc, price, link: finalLink, coverUrl, imageUrls,  // 🖼️ 添加 imageUrls
            author: currentUser.account, github_token,
            netdisk_password,  // ☁️ 网盘密码（后端加密存储）
            is_netdisk: isNetdisk  // ☁️ 标记为网盘资源
        };

        if (isEditMode) {
            await api.updateItem(editItemData.id, currentUser.account, submitData);
            showToast(`✅ ${t('publish.save_success')}`, "success");
        } else {
            await api.publishItem(submitData);
            showToast(`🎉 ${t('publish.publish_success')}`, "success");
        }
        
        // 🚀 精确清除：只清除当前发布类型的缓存
        clearItemCacheByType(type);
        
        if (onSuccessCallback) onSuccessCallback();
    } catch (err) {
        showToast(`${t('common.operation_failed')}: ` + err.message, "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitBtnText;
        submitBtn.style.background = "#2196F3";
    }
}