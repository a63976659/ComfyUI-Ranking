// 前端页面/post/发布帖子组件.js
// ==========================================
// ✏️ 发布帖子组件
// ==========================================
// 功能：上传图片、输入标题和正文、发布帖子
// 关联文件：
//   - 网络请求API.js (上传图片、发布帖子)
//   - UI交互提示组件.js (提示信息)
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { removeCache } from "../components/性能优化工具.js";

// 📦 清除帖子列表缓存
function clearPostListCache() {
    removeCache('api_/api/posts');
    // 帖子排序值：latest, likes, favorites, views, daily_views
    const sorts = ['latest', 'likes', 'favorites', 'views', 'daily_views', 'rating'];
    for (const sort of sorts) {
        removeCache(`ListCache_posts_${sort}`);
    }
    console.log('🗑️ 已清除帖子列表缓存');
}

// 🖼️ 图片压缩配置
const IMAGE_MAX_SIZE = 1920;    // 最大宽/高
const IMAGE_QUALITY = 0.85;     // JPG压缩质量

/**
 * 🖼️ 压缩图片：转为JPG格式并限制尺寸
 * @param {File} file - 原始图片文件
 * @returns {Promise<File>} - 压缩后的图片文件
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                
                // 计算缩放尺寸（保持比例，限制最大尺寸）
                let { width, height } = img;
                if (width > IMAGE_MAX_SIZE || height > IMAGE_MAX_SIZE) {
                    if (width > height) {
                        height = Math.round(height * IMAGE_MAX_SIZE / width);
                        width = IMAGE_MAX_SIZE;
                    } else {
                        width = Math.round(width * IMAGE_MAX_SIZE / height);
                        height = IMAGE_MAX_SIZE;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // 转为 JPG 并压缩
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                        const compressedFile = new File([blob], newFileName, { type: "image/jpeg" });
                        console.log(`🖼️ 图片压缩: ${(file.size/1024).toFixed(1)}KB → ${(compressedFile.size/1024).toFixed(1)}KB`);
                        resolve(compressedFile);
                    } else {
                        reject(new Error("图片压缩失败"));
                    }
                }, "image/jpeg", IMAGE_QUALITY);
            };
            img.onerror = () => reject(new Error("图片加载失败"));
        };
        reader.onerror = () => reject(new Error("文件读取失败"));
    });
}

/**
 * ✏️ 创建发布帖子视图
 * @param {Object|string} currentUser - 当前用户
 * @param {Object} editPostData - 编辑模式时的帖子数据（可选）
 */
export function createPublishPostView(currentUser, editPostData = null) {
    const isEditMode = !!editPostData;
    
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        color: "#ccc",
        fontSize: "14px",
        padding: "0",
        overflowY: "auto",
        flex: "1",
        boxSizing: "border-box"
    });
    
    // 编辑模式下的字段值
    const editTitle = isEditMode ? (editPostData.title || '') : '';
    const editContent = isEditMode ? (editPostData.content || '') : '';
    const editImageUrls = isEditMode ? (editPostData.images || editPostData.image_urls || []) : [];
    const editIsOriginal = isEditMode ? (editPostData.is_original || false) : false;
    
    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; border-bottom: 1px solid #444; background: #1a1a1a;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="btn-back-publish" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                    <span style="font-size: 14px;">⬅</span> ${t('common.back')}
                </button>
                <span style="font-size: 16px; font-weight: bold; color: #fff;">✏️ ${isEditMode ? '编辑帖子' : t('post.publish')}</span>
            </div>
            <button id="btn-submit-post" style="background: #4CAF50; border: none; color: #fff; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
                🚀 ${isEditMode ? '保存修改' : t('common.publish')}
            </button>
        </div>
        
        <!-- 表单内容 -->
        <div style="flex: 1; overflow-y: auto; padding: 15px;">
            <!-- 图片上传区 -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    🖼️ ${t('post.upload_images')} <span style="color: #F44336;">*</span>
                    <span style="font-weight: normal; color: #888; font-size: 12px;">（${t('post.max_9_images')}）</span>
                </label>
                <input type="file" id="images-input" accept="image/*" multiple style="display: none;">
                <div id="images-preview" style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 80px; padding: 15px; background: #1a1a1a; border: 2px dashed #444; border-radius: 8px; cursor: pointer; transition: 0.2s;" onclick="document.getElementById('images-input').click()">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; color: #666; font-size: 13px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">📷</div>
                        ${t('post.click_upload')}
                    </div>
                </div>
            </div>
            
            <!-- 标题输入 -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    📝 ${t('post.title_label')} <span style="color: #F44336;">*</span>
                </label>
                <input type="text" id="title-input" value="${editTitle}" placeholder="${t('post.title_placeholder')}" maxlength="50" style="width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box; outline: none;" onfocus="this.style.borderColor='#4CAF50'" onblur="this.style.borderColor='#444'">
                <div style="text-align: right; font-size: 11px; color: #666; margin-top: 4px;">
                    <span id="title-count">${editTitle.length}</span>/50
                </div>
            </div>
            
            <!-- 正文输入 -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    ✍️ ${t('post.content_label')}
                </label>
                <textarea id="content-input" placeholder="${t('post.content_placeholder')}" maxlength="2000" style="width: 100%; height: 200px; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box; outline: none; resize: none; line-height: 1.6;" onfocus="this.style.borderColor='#4CAF50'" onblur="this.style.borderColor='#444'">${editContent}</textarea>
                <div style="text-align: right; font-size: 11px; color: #666; margin-top: 4px;">
                    <span id="content-count">${editContent.length}</span>/2000
                </div>
            </div>
            
            <!-- 原创作品勾选框 -->
            <div style="margin-bottom: 15px; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="is-original-checkbox" ${editIsOriginal ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer; accent-color: #4CAF50;" />
                    <span style="font-size: 13px; color: #ccc;">🎨 标记为原创作品</span>
                </label>
                <div style="font-size: 11px; color: #888; margin-top: 6px; padding-left: 24px;">
                    原创内容将获得特殊标识展示，请勿标记非原创内容
                </div>
            </div>
            
            <!-- 提示信息 -->
            <div style="background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 6px; padding: 12px; font-size: 12px; color: #aaa; line-height: 1.6;">
                💡 <strong>${t('post.publish_notice')}：</strong><br>
                • ${t('post.notice_original')}<br>
                • ${t('post.notice_compress')}<br>
                • ${t('post.notice_manage')}
            </div>
        </div>
    `;
    
    // 状态
    let imageFiles = [];
    let existingImageUrls = [];  // 编辑模式下已有的图片URL
    
    // DOM 引用
    const imagesInput = container.querySelector("#images-input");
    const imagesPreview = container.querySelector("#images-preview");
    const titleInput = container.querySelector("#title-input");
    const contentInput = container.querySelector("#content-input");
    const titleCount = container.querySelector("#title-count");
    const contentCount = container.querySelector("#content-count");
    const submitBtn = container.querySelector("#btn-submit-post");
    const isOriginalCheckbox = container.querySelector("#is-original-checkbox");
    
    // 编辑模式：加载已有的图片
    if (isEditMode && editImageUrls.length > 0) {
        existingImageUrls = [...editImageUrls];
        renderExistingImagePreviews();
    }
    
    // 返回按钮
    container.querySelector("#btn-back-publish").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 字数统计
    titleInput.oninput = () => {
        titleCount.textContent = titleInput.value.length;
    };
    contentInput.oninput = () => {
        contentCount.textContent = contentInput.value.length;
    };
    
    // 图片选择
    imagesInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        const totalImages = existingImageUrls.length + imageFiles.length;
        const remaining = 9 - totalImages;
        
        if (remaining <= 0) {
            showToast(t('post.max_9_images'), "warning");
            return;
        }
        
        const toAdd = files.slice(0, remaining);
        if (toAdd.length === 0) return;
        
        imageFiles = [...imageFiles, ...toAdd];
        
        if (isEditMode) {
            renderExistingImagePreviews();
        } else {
            renderImagePreviews();
        }
    };
    
    // 渲染已有图片预览（编辑模式）
    function renderExistingImagePreviews() {
        const totalImages = existingImageUrls.length + imageFiles.length;
        
        if (totalImages === 0) {
            imagesPreview.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; color: #666; font-size: 13px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📷</div>
                    ${t('post.click_upload')}
                </div>
            `;
            return;
        }
        
        imagesPreview.innerHTML = "";
        
        // 渲染已有图片
        existingImageUrls.forEach((url, idx) => {
            const wrapper = document.createElement("div");
            Object.assign(wrapper.style, {
                position: "relative",
                width: "80px",
                height: "80px"
            });
            
            wrapper.innerHTML = `
                <img src="${url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid ${idx === 0 ? '#4CAF50' : '#444'};">
                ${idx === 0 ? `<span style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px;">${t('post.cover')}</span>` : ''}
                <button data-existing-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
            `;
            
            wrapper.querySelector("button").onclick = (e) => {
                e.stopPropagation();
                existingImageUrls = existingImageUrls.filter((_, i) => i !== idx);
                renderExistingImagePreviews();
            };
            
            imagesPreview.appendChild(wrapper);
        });
        
        // 渲染新上传图片
        imageFiles.forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const wrapper = document.createElement("div");
                Object.assign(wrapper.style, {
                    position: "relative",
                    width: "80px",
                    height: "80px"
                });
                
                const totalIdx = existingImageUrls.length + idx;
                wrapper.innerHTML = `
                    <img src="${e.target.result}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid ${totalIdx === 0 ? '#4CAF50' : '#444'};">
                    ${totalIdx === 0 ? `<span style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px;">${t('post.cover')}</span>` : ''}
                    <button data-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                `;
                
                wrapper.querySelector("button").onclick = (e) => {
                    e.stopPropagation();
                    imageFiles = imageFiles.filter((_, i) => i !== idx);
                    renderExistingImagePreviews();
                };
                
                imagesPreview.appendChild(wrapper);
            };
            reader.readAsDataURL(file);
        });
        
        // 添加"添加更多"按钮
        if (totalImages < 9) {
            const addBtn = document.createElement("div");
            Object.assign(addBtn.style, {
                width: "80px",
                height: "80px",
                border: "2px dashed #444",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#666",
                fontSize: "24px"
            });
            addBtn.textContent = "+";
            addBtn.onclick = (e) => {
                e.stopPropagation();
                imagesInput.click();
            };
            imagesPreview.appendChild(addBtn);
        }
    }
    
    // 渲染图片预览（新建模式）
    function renderImagePreviews() {
        if (imageFiles.length === 0) {
            imagesPreview.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; color: #666; font-size: 13px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📷</div>
                    ${t('post.click_upload')}
                </div>
            `;
            return;
        }
        
        imagesPreview.innerHTML = "";
        
        imageFiles.forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const wrapper = document.createElement("div");
                Object.assign(wrapper.style, {
                    position: "relative",
                    width: "80px",
                    height: "80px"
                });
                
                wrapper.innerHTML = `
                    <img src="${e.target.result}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid ${idx === 0 ? '#4CAF50' : '#444'};">
                    ${idx === 0 ? `<span style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px;">${t('post.cover')}</span>` : ''}
                    <button data-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                `;
                
                wrapper.querySelector("button").onclick = (e) => {
                    e.stopPropagation();
                    imageFiles = imageFiles.filter((_, i) => i !== idx);
                    renderImagePreviews();
                };
                
                imagesPreview.appendChild(wrapper);
            };
            reader.readAsDataURL(file);
        });
        
        // 添加"添加更多"按钮
        if (imageFiles.length < 9) {
            const addBtn = document.createElement("div");
            Object.assign(addBtn.style, {
                width: "80px",
                height: "80px",
                border: "2px dashed #444",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#666",
                fontSize: "24px"
            });
            addBtn.textContent = "+";
            addBtn.onclick = (e) => {
                e.stopPropagation();
                imagesInput.click();
            };
            imagesPreview.appendChild(addBtn);
        }
    }
    
    // 提交发布/保存
    submitBtn.onclick = async () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        
        // 验证
        const totalImages = existingImageUrls.length + imageFiles.length;
        if (totalImages === 0) {
            showToast(t('post.error_no_image'), "warning");
            return;
        }
        if (!title) {
            showToast(t('post.error_no_title'), "warning");
            return;
        }
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = `⏳ ${t('post.compressing_images')}...`;
            
            // 🖼️ 先压缩所有新图片
            const compressedFiles = [];
            for (let i = 0; i < imageFiles.length; i++) {
                submitBtn.textContent = `🖼️ ${t('post.compressing_progress', { current: i + 1, total: imageFiles.length })}...`;
                const compressed = await compressImage(imageFiles[i]);
                compressedFiles.push(compressed);
            }
            
            // 上传压缩后的图片
            const uploadedUrls = [];
            for (let i = 0; i < compressedFiles.length; i++) {
                submitBtn.textContent = `⏳ ${t('post.uploading_progress', { current: i + 1, total: compressedFiles.length })}...`;
                const res = await api.uploadFile(compressedFiles[i], "post");
                uploadedUrls.push(res.url);
            }
            
            // 合并已有图片和新上传的图片
            const allImages = [...existingImageUrls, ...uploadedUrls];
            
            // 获取原创作品勾选状态
            const isOriginal = isOriginalCheckbox?.checked || false;
            
            if (isEditMode) {
                // 编辑模式：更新帖子
                submitBtn.textContent = `⏳ ${t('common.saving')}...`;
                await api.updatePost(editPostData.id, {
                    title,
                    content,
                    cover_image: allImages[0],
                    images: allImages,
                    is_original: isOriginal
                });
                
                showToast(t('post.edit_success'), "success");
            } else {
                // 新建模式：发布帖子
                submitBtn.textContent = `⏳ ${t('post.publishing')}...`;
                await api.createPost({
                    title,
                    content,
                    cover_image: allImages[0],
                    images: allImages,
                    author: currentUser.account,
                    is_original: isOriginal
                });
                
                showToast(t('post.publish_success'), "success");
            }
            
            // 🚀 清除帖子列表缓存，确保返回列表时能看到更新
            clearPostListCache();
            // 🔄 触发列表刷新，确保新内容立即显示
            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload"));
            
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
            
        } catch (err) {
            showToast((isEditMode ? t('post.edit_failed') : t('post.publish_failed')) + ": " + err.message, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = `🚀 ${isEditMode ? '保存修改' : t('common.publish')}`;
        }
    };
    
    return container;
}
