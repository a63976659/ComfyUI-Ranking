import { processImageCore as _processImageCore } from "./有界图片处理.js";
import { validateImageFile } from "./图片文件检查.js";
import { IMAGE_PROCESS, TYPE_RULES } from "../core/全局配置.js";
// 前端页面/market/发布内容_提交引擎.js
import { createPublishSubmissionScope } from "./发布提交生命周期.js";
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { removeCache, removeCacheByPrefix } from "../components/性能优化工具.js";

/**
 * 📋 获取指定主类型的提交规则（校验与字段组装统一读取，与 UI 显隐同源）
 * @param {string} mainType - 主类型: tool/skill/app/recommend
 */
function getSubmitRules(mainType) {
    return TYPE_RULES[mainType] || TYPE_RULES.tool;
}

/**
 * 🟢 根据发布类型清除对应缓存（精确清除，不影响其他页面）
 * @param {string} type - 发布类型: tool/skill/app/recommend/recommend_tool/recommend_skill/recommend_app/recommend_link
 */
function clearItemCacheByType(type) {
    // 确定当前类型对应的 tab
    let tab = 'recommends';
    if (type === 'tool' || type === 'recommend_tool') {
        tab = 'tools';
    } else if (type === 'skill' || type === 'recommend_skill') {
        tab = 'skills';
    } else if (type === 'app' || type === 'recommend_app') {
        tab = 'apps';
    }
    
    // 清除 API 缓存
    // 🔧 修复：API 层缓存键总是带完整查询串（api_/api/items?type=tool&sort=time&limit=200），
    // 而 removeCache 是精确键删除，原先这几个调用一个也命中不到（no-op），发布成功后
    // request() 仍会从缓存直接返回旧列表、看不到刚发布的内容。改用前缀删除，
    // 一次覆盖全部 type/sort/limit 组合（原先按 type 单独删的那行已被本前缀覆盖，属冗余）
    removeCacheByPrefix('api_/api/items');
    removeCacheByPrefix('api_/api/creators');  // 创作者列表也需要刷新
    
    // 清除侧边栏数据引擎缓存（只清除对应类型）
    const sorts = ['time', 'downloads', 'likes', 'favorites', 'tips', 'views', 'daily_views', 'rating'];
    for (const sort of sorts) {
        removeCache(`ListCache_${tab}_${sort}`);
        removeCache(`ListCache_creators_${sort}`);  // 创作者列表
    }
    
    console.log(`🗑️ 已清除 [${tab}] 类型的列表缓存`);
}

/**
 * 🟢 利用 HTML5 Canvas 纯前端裁剪并压缩头像
 * 功能：强制 1:1 比例中心裁剪，缩放到 512x512，转换为 JPG 格式。
 */
function processAvatar(file) {
    return _processImageCore(file, {
        cropToSquare: true,
        maxFileSize: IMAGE_PROCESS.AVATAR_MAX_BYTES,
        targetSize: IMAGE_PROCESS.AVATAR_SIZE,
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
 * - 最长边至多4096并保持比例；质量压缩后仍超过5MB则拒绝
 * @param {File} file - 原始图片文件
 * @returns {Promise<File>} - 处理后的文件
 */
export async function compressImageForUpload(file) {
    // 如果不是图片文件，直接返回
    if (!file.type || !file.type.startsWith('image/')) {
        return file;
    }

    if (!Number.isFinite(file.size) || file.size < 0 || file.size > IMAGE_PROCESS.MAX_INPUT_BYTES) {
        throw new Error('Image exceeds upload budget');
    }
    // 动图保持原格式；不由Canvas变为静态图片。
    if (file.type === 'image/gif') { await validateImageFile(file); return file; }
    return _processImageCore(file, {
        quality: 0.92, fillBackground: '#FFFFFF', maxFileSize: IMAGE_PROCESS.MAX_OUTPUT_BYTES,
        skipIfSmallJpeg: true, suffix: '.jpg'
    });
}

/**
 * 🟢 新增：全局统一的文件上传包装器（供个人设置等其它组件调用）
 * 会在上传前自动拦截并处理头像图片
 */
export async function uploadFile(file, file_type, options = {}) {
    const current = options.isCurrent || (() => true);
    const feedback = (message, level) => { if (!options.silent && current()) showToast(message, level); };
    if (!current()) return null;
    try {
        let fileToUpload = file;
        
        // 拦截点：如果是头像，就在纯内存中先进行裁剪、缩放、压缩
        if (file_type === "avatar" && file.type && file.type.startsWith("image/")) {
            feedback(`🖼️ ${t('publish.processing_avatar')}`);
            fileToUpload = await processAvatar(file);
        }

        feedback(`🌐 ${t('publish.uploading_file', { size: (fileToUpload.size/1024).toFixed(1) })}`);
        if (!current()) return null;
        const res = await api.uploadFile(fileToUpload, file_type);
        
        if (!current()) return null;
        if (res.status === "success") {
            feedback(`✅ ${t('publish.upload_success')}`);
            return res.url; 
        } else {
            feedback(t('publish.upload_failed'), 'error');
            return null;
        }
    } catch (error) {
        feedback(t('publish.upload_error'), 'error');
        return null;
    }
}

// ==========================================
// 发布表单提交：原会话范围与保存结果核实
// ==========================================
export async function handlePublishSubmit(params) {
    const {
        container, currentUser, isEditMode, editItemData,
        imageFiles, jsonFile, onSuccessCallback, submitBtn, submitBtnText  // 🖼️ imageFiles 替换 coverFile
    } = params;

    const scope = params.submissionScope || createPublishSubmissionScope(container, submitBtn, currentUser?.account);
    if (!scope.isCurrent()) return;
    const expectedRevision = isEditMode ? (editItemData?.edit_revision === undefined ? 0 : editItemData.edit_revision) : null;
    if (isEditMode && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
        showToast(t('common.operation_failed'), 'error'); return;
    }
    const selectedImages = Array.from(imageFiles || []);
    const typeSelect = container.querySelector("#pub-type");
    const recommendTypeSelect = container.querySelector("#pub-recommend-type");
    const resTypeSelect = container.querySelector("#pub-resource-type");
    const boxPrivateRepo = container.querySelector("#private-repo-settings");
    const isPrivateCheck = container.querySelector("#pub-is-private");
    const inputLink = container.querySelector("#pub-link");
    const inputNetdiskLink = container.querySelector("#pub-netdisk-link");  // ☁️ 网盘链接
    const inputNetdiskPassword = container.querySelector("#pub-netdisk-password");  // 🔐 网盘密码

    const mainType = typeSelect.value;
    const rules = getSubmitRules(mainType);  // 📋 本次提交的声明式规则
    let type = mainType;
    if (mainType === "recommend") type = recommendTypeSelect.value;
    
    const title = container.querySelector("#pub-title").value.trim();
    const shortDesc = container.querySelector("#pub-short").value.trim();
    const fullDesc = container.querySelector("#pub-full").value.trim();
    const price = rules.price ? Number(container.querySelector("#pub-price").value) : 0;
    if (!Number.isSafeInteger(price) || price < 0) return showToast(t('common.operation_failed'), "warning");
    
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
    // 📋 仅规则允许私有仓库且该区可见、已勾选时才收集 token
    if (rules.privateRepoWhenLink && boxPrivateRepo.style.display !== "none" && isPrivateCheck.checked) {
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
    if ((type === "tool" || type === "skill" || type === "recommend_tool" || type === "recommend_skill") && !isJsonUpload && !isNetdisk && !finalLink) return showToast(t('publish.git_required'), "warning");
    if (isJsonUpload && !jsonFile && !finalLink) return showToast(t('publish.json_required'), "warning");
    if (isNetdisk && !finalLink) return showToast(t('publish.netdisk_required'), "warning");  // ☁️
    
    // 🎨 规则要求原创强制的类型必须勾选原创
    const isOriginalCheckbox = container.querySelector("#is-original-checkbox");
    const isOriginal = isOriginalCheckbox?.checked || false;
    if (rules.originalRequired && !isOriginal) {
        return showToast(t('publish.original_required_toast'), "warning");
    }

    // 💸 是否支持退款 (仅规则允许的类型提交)
    const allowRefundCheckbox = container.querySelector("#allow-refund-checkbox");
    const allowRefund = rules.refund ? (allowRefundCheckbox?.checked ?? true) : null;

    if (!scope.begin()) return;
    let committed = false, saveAttempted = false, outcomeUnknown = false;
    submitBtn.innerHTML = `⏳ ${t('publish.connecting')}`;
    submitBtn.disabled = true; 

    try {
        if (isJsonUpload && jsonFile) {
            submitBtn.innerHTML = `⏳ ${t('publish.uploading_secure')}`;
            const uploadType = type.includes("app") ? "app" : (type.includes("tool") || type === "skill" ? "tool" : "recommend");
            const jsonUploadRes = await api.uploadFile(jsonFile, uploadType);
            if (!scope.isCurrent()) return;
            if (jsonUploadRes?.status !== "success" || typeof jsonUploadRes.url !== "string" || !jsonUploadRes.url.trim()) throw new Error("Invalid upload result");
            finalLink = jsonUploadRes.url; 
        }

        // 🖼️ 上传多张效果展示图
        let coverUrl = isEditMode ? editItemData.coverUrl : null;
        let imageUrls = isEditMode ? (editItemData.imageUrls || []) : [];
        
        if (selectedImages.length > 0) {
            submitBtn.innerHTML = `⏳ ${t('publish.uploading_images', { current: 0, total: selectedImages.length })}`;
            const uploadedUrls = [];
            
            for (let i = 0; i < selectedImages.length; i++) {
                submitBtn.innerHTML = `⏳ ${t('publish.uploading_images', { current: i + 1, total: selectedImages.length })}`;
                // 上传前压缩：转JPG，超5MB压缩
                const processedFile = await compressImageForUpload(selectedImages[i]);
                if (!scope.isCurrent()) return;
                const uploadRes = await api.uploadFile(processedFile, "cover");
                if (!scope.isCurrent()) return;
                if (uploadRes?.status === "success" && typeof uploadRes.url === "string" && uploadRes.url.trim()) {
                    uploadedUrls.push(uploadRes.url);
                } else {
                    throw new Error("Invalid image upload result");
                }
            }
            
            coverUrl = uploadedUrls[0];  // 第一张作为封面
            imageUrls = uploadedUrls;     // 全部图片URL
        }

        if (!scope.isCurrent()) return;
        submitBtn.innerHTML = `⏳ ${t('publish.syncing')}`;
        // 🖼️ 统一封面逻辑：第一张图片始终作为封面（兑容拖拽排序后的顺序变化）
        if (imageUrls && imageUrls.length > 0) {
            coverUrl = imageUrls[0];
        }
        const submitData = {
            ...(!isEditMode && scope.publicationId ? { request_id: scope.publicationId } : {}),
            ...(isEditMode ? { expected_revision: expectedRevision } : {}),
            type, title, shortDesc, fullDesc, price, link: finalLink, coverUrl, imageUrls,  // 🖼️ 添加 imageUrls
            author: currentUser.account, github_token,
            netdisk_password,  // ☁️ 网盘密码（后端加密存储）
            is_netdisk: isNetdisk,  // ☁️ 标记为网盘资源
            is_original: isOriginal  // 🎨 标记为原创作品
        };

        // 💸 仅 tool/skill/app 类型提交 allow_refund 字段
        if (allowRefund !== null) {
            submitData.allow_refund = allowRefund;
        }

        saveAttempted = true;
        const result = isEditMode
            ? await api.updateItem(editItemData.id, currentUser.account, submitData)
            : await api.publishItem(submitData);
        if (!scope.isCurrent()) return;
        if (result?.status !== "success") throw new Error("Invalid save result");
        committed = true;
        showToast(isEditMode ? `✅ ${t('publish.save_success')}` : `🎉 ${t('publish.publish_success')}`, "success");
        // 主保存已确认；派生缓存或界面回调异常不重新开放提交。
        try { clearItemCacheByType(type); } catch (_) {}
        if (scope.isCurrent() && onSuccessCallback) {
            try { await onSuccessCallback(); } catch (_) {}
        }
    } catch (err) {
        if (!scope.isCurrent() || committed) return;
        if (isEditMode && err?.status === 409 && err?.code === 'resource_revision_conflict') {
            outcomeUnknown = true; // 保持入口锁，要求重开取得新版本；不自动覆盖。
            showToast(t('publish.edit_conflict'), 'warning');
            submitBtn.disabled = true; submitBtn.innerHTML = t('publish.edit_reopen');
            return;
        }
        // 已发出的保存可能在服务端提交；仅已知前置拒绝允许原表单重试。
        const rejected = [400, 401, 403, 404, 409, 422, 429].includes(err?.status);
        outcomeUnknown = saveAttempted && !rejected;
        if (outcomeUnknown) {
            showToast(t('publish.save_unconfirmed'), "warning");
            submitBtn.disabled = true;
            submitBtn.innerHTML = t('publish.result_pending');
            return;
        }
        showToast(t('common.operation_failed'), "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitBtnText;
    } finally {
        scope.finish(committed, outcomeUnknown);
    }
}
