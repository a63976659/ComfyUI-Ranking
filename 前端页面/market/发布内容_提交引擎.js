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
    const sorts = ['time', 'downloads', 'likes', 'favorites', 'tips', 'views', 'daily_views', 'rating'];
    for (const sort of sorts) {
        removeCache(`ListCache_${tab}_${sort}`);
        removeCache(`ListCache_creators_${sort}`);  // 创作者列表
    }
    
    console.log(`🗑️ 已清除 [${tab}] 类型的列表缓存`);
}

/**
 * 通用图片处理核心函数：加载图片 → Canvas绘制 → 转换为JPG文件
 * @param {File} file - 原始图片文件
 * @param {Object} options - 配置选项
 * @param {boolean} options.cropToSquare - 是否中心裁剪为正方形
 * @param {number|null} options.targetSize - 目标尺寸（正方形边长），null则保持原始尺寸
 * @param {number} options.quality - 初始JPG质量 (0-1)
 * @param {string|null} options.fillBackground - 背景填充颜色，null则不填充
 * @param {number|null} options.maxFileSize - 最大文件大小（字节），超限则迭代降低质量
 * @param {boolean} options.skipIfSmallJpeg - 是否跳过已是小体积JPEG的文件
 * @param {string} options.suffix - 输出文件名后缀
 * @returns {Promise<File>} 处理后的文件
 */
function _processImageCore(file, options = {}) {
    const {
        cropToSquare = false,
        targetSize = null,
        quality = 0.85,
        fillBackground = null,
        maxFileSize = null,
        skipIfSmallJpeg = false,
        suffix = '.jpg'
    } = options;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            let sourceX = 0, sourceY = 0;
            let sourceW = img.naturalWidth, sourceH = img.naturalHeight;
            let destW = img.naturalWidth, destH = img.naturalHeight;

            // 中心裁剪为正方形
            if (cropToSquare) {
                const sourceMin = Math.min(sourceW, sourceH);
                sourceX = (sourceW - sourceMin) / 2;
                sourceY = (sourceH - sourceMin) / 2;
                sourceW = sourceMin;
                sourceH = sourceMin;
                destW = sourceMin;
                destH = sourceMin;
            }

            // 指定目标尺寸时缩放
            if (targetSize) {
                destW = targetSize;
                destH = targetSize;
            }

            canvas.width = destW;
            canvas.height = destH;

            // 填充背景色
            if (fillBackground) {
                ctx.fillStyle = fillBackground;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, destW, destH);

            // 跳过已是小体积JPEG的文件
            if (skipIfSmallJpeg && maxFileSize &&
                (file.type === 'image/jpeg' || file.type === 'image/jpg') &&
                file.size <= maxFileSize) {
                resolve(file);
                return;
            }

            // 转换为JPG Blob，超限时迭代降低质量
            let currentQuality = quality;
            const tryCompress = () => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas 转换 Blob 失败'));
                        return;
                    }

                    if (maxFileSize && blob.size > maxFileSize && currentQuality > 0.3) {
                        currentQuality -= 0.1;
                        tryCompress();
                        return;
                    }

                    const newFileName = file.name.replace(/\.[^/.]+$/, '') + suffix;
                    resolve(new File([blob], newFileName, { type: 'image/jpeg' }));
                }, 'image/jpeg', currentQuality);
            };

            tryCompress();
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('图片加载失败'));
        };

        img.src = url;
    });
}

/**
 * 🟢 利用 HTML5 Canvas 纯前端裁剪并压缩头像
 * 功能：强制 1:1 比例中心裁剪，缩放到 512x512，转换为 JPG 格式。
 */
function processAvatar(file) {
    return _processImageCore(file, {
        cropToSquare: true,
        targetSize: 512,
        quality: 0.85,
        suffix: '_cropped.jpg'
    }).then(processedFile => {
        console.log(`✅ 头像处理完成：原始 ${(file.size/1024).toFixed(1)}KB -> 压缩后 ${(processedFile.size/1024).toFixed(1)}KB`);
        return processedFile;
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

    // GIF 动图保留原始格式，不转换为 JPG
    if (file.type === 'image/gif') {
        const GIF_MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > GIF_MAX_SIZE) {
            throw new Error(`GIF文件过大（${(file.size/1024/1024).toFixed(1)}MB），最大允许50MB`);
        }
        console.log(`🎞️ GIF动图保留原始格式: ${(file.size/1024/1024).toFixed(2)}MB`);
        return file;
    }

    try {
        const processedFile = await _processImageCore(file, {
            quality: 0.92,
            fillBackground: '#FFFFFF',
            maxFileSize: 5 * 1024 * 1024,
            skipIfSmallJpeg: true,
            suffix: '.jpg'
        });
        console.log(`📦 图片压缩: ${(file.size/1024/1024).toFixed(2)}MB → ${(processedFile.size/1024/1024).toFixed(2)}MB`);
        return processedFile;
    } catch (e) {
        // 加载失败，返回原文件
        return file;
    }
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
    let isJsonUpload = (resTypeSelect.value === "json") || (type === "recommend_app");
    let isNetdisk = (resTypeSelect.value === "netdisk");  // ☁️ 是否网盘模式
    
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
        if (!github_token) {
            const hasExistingToken = isEditMode && !!(editItemData?.github_token || editItemData?.has_private_token);
            if (isEditMode && hasExistingToken) {
                // 编辑模式下已有密钥，留空表示保留原值，不发送 github_token 字段
                github_token = null;
            } else {
                return showToast(t('publish.pat_required'), "warning");
            }
        }
    }

    if (!title || !shortDesc) return showToast(t('publish.name_desc_required'), "warning");
    if (type === "recommend_link" && !finalLink) return showToast(t('publish.link_required'), "warning");
    if ((type === "tool" || type === "recommend_tool") && !isJsonUpload && !isNetdisk && !finalLink) return showToast(t('publish.git_required'), "warning");
    if (isJsonUpload && !jsonFile && !finalLink) return showToast(t('publish.json_required'), "warning");
    if (isNetdisk && !finalLink) return showToast(t('publish.netdisk_required'), "warning");  // ☁️
    
    // 🎨 工具/应用类型必须勾选原创
    const isOriginalCheckbox = container.querySelector("#is-original-checkbox");
    const isOriginal = isOriginalCheckbox?.checked || false;
    if ((type === "tool" || type === "app") && !isOriginal) {
        return showToast(t('publish.original_required_toast'), "warning");
    }

    // 💸 是否支持退款 (仅 tool/app 类型)
    const allowRefundCheckbox = container.querySelector("#allow-refund-checkbox");
    const allowRefund = (type === "tool" || type === "app") ? (allowRefundCheckbox?.checked ?? true) : null;

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
                if (uploadRes && uploadRes.url) {
                    uploadedUrls.push(uploadRes.url);
                } else {
                    throw new Error(`图片上传失败: ${uploadRes?.error || '未知错误'}`);
                }
            }
            
            coverUrl = uploadedUrls[0];  // 第一张作为封面
            imageUrls = uploadedUrls;     // 全部图片URL
        }

        submitBtn.innerHTML = `⏳ ${t('publish.syncing')}`;
        // 🖼️ 统一封面逻辑：第一张图片始终作为封面（兑容拖拽排序后的顺序变化）
        if (imageUrls && imageUrls.length > 0) {
            coverUrl = imageUrls[0];
        }
        const submitData = {
            type, title, shortDesc, fullDesc, price, link: finalLink, coverUrl, imageUrls,  // 🖼️ 添加 imageUrls
            author: currentUser.account, github_token,
            netdisk_password,  // ☁️ 网盘密码（后端加密存储）
            is_netdisk: isNetdisk,  // ☁️ 标记为网盘资源
            is_original: isOriginal  // 🎨 标记为原创作品
        };

        // 💸 仅 tool/app 类型提交 allow_refund 字段
        if (allowRefund !== null) {
            submitData.allow_refund = allowRefund;
        }

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