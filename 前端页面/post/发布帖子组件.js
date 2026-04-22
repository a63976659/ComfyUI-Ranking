// 前端页面/post/发布帖子组件.js
// ==========================================
// ✏️ 发布帖子组件（支持图文/视频双模式）
// ==========================================
// 功能：上传图片或视频、输入标题和正文、发布帖子
// 关联文件：
//   - 网络请求API.js (上传图片、发布帖子)
//   - UI交互提示组件.js (提示信息)
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { removeCache } from "../components/性能优化工具.js";
import { API } from "../core/全局配置.js";

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

// ✅ 更新封面标记：第一张显示绿色边框和"封面"标签
function updateCoverMark(previewContainer) {
    const wrappers = Array.from(previewContainer.children).filter(
        child => child.tagName === 'DIV' && child.querySelector('img')
    );
    wrappers.forEach((wrapper, idx) => {
        const img = wrapper.querySelector('img');
        const coverLabel = wrapper.querySelector('.cover-label');
        if (img) {
            img.style.borderColor = idx === 0 ? '#4CAF50' : '#444';
        }
        if (idx === 0) {
            if (!coverLabel) {
                const label = document.createElement('span');
                label.className = 'cover-label';
                label.style.cssText = 'position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px; pointer-events: none;';
                label.textContent = t('post.cover');
                wrapper.appendChild(label);
            }
        } else {
            if (coverLabel) coverLabel.remove();
        }
    });
}

// ✅ 为图片预览容器设置拖拽排序
function setupImageDragSort(previewContainer, fileArray, options = {}) {
    const { onRemove, onDrop } = options;
    const getWrappers = () => Array.from(previewContainer.children).filter(
        child => child.tagName === 'DIV' && child.querySelector('img')
    );

    const wrappers = getWrappers();
    if (wrappers.length === 0) return;

    let dragSrcEl = null;
    let dragSrcIndex = -1;

    // 清除所有旧事件，防止重复绑定
    wrappers.forEach(wrapper => {
        wrapper.ondragstart = null;
        wrapper.ondragover = null;
        wrapper.ondragleave = null;
        wrapper.ondrop = null;
        wrapper.ondragend = null;
    });

    wrappers.forEach(wrapper => {
        wrapper.draggable = true;
        wrapper.style.cursor = 'grab';

        // 绑定删除按钮（如果尚未绑定）
        const removeBtn = wrapper.querySelector('button[data-action="remove"]');
        if (removeBtn && !removeBtn.onclick) {
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                if (onRemove) {
                    onRemove(wrapper);
                } else if (fileArray) {
                    const currentWrappers = getWrappers();
                    const currentIdx = currentWrappers.indexOf(wrapper);
                    if (currentIdx >= 0 && currentIdx < fileArray.length) {
                        fileArray.splice(currentIdx, 1);
                    }
                    wrapper.remove();
                    updateCoverMark(previewContainer);
                    setupImageDragSort(previewContainer, fileArray, options);
                }
            };
        }

        wrapper.ondragstart = (e) => {
            e.stopPropagation();
            dragSrcEl = wrapper;
            dragSrcIndex = getWrappers().indexOf(wrapper);
            wrapper.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(dragSrcIndex));
        };

        wrapper.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';

            const currentWrappers = getWrappers();
            const targetIndex = currentWrappers.indexOf(wrapper);
            if (targetIndex === dragSrcIndex) {
                currentWrappers.forEach(w => {
                    w.style.borderLeft = '';
                    w.style.paddingLeft = '';
                });
                return;
            }

            // 清除所有插入指示
            currentWrappers.forEach(w => {
                w.style.borderLeft = '';
                w.style.paddingLeft = '';
            });

            // 在当前目标左侧显示绿色竖线指示插入位置
            wrapper.style.borderLeft = '3px solid #4CAF50';
            wrapper.style.paddingLeft = '5px';
        };

        wrapper.ondragleave = () => {
            wrapper.style.borderLeft = '';
            wrapper.style.paddingLeft = '';
        };

        wrapper.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentWrappers = getWrappers();
            const targetIndex = currentWrappers.indexOf(wrapper);
            if (targetIndex === dragSrcIndex || dragSrcIndex === -1) return;

            // 移动 DOM 元素
            if (targetIndex > dragSrcIndex) {
                previewContainer.insertBefore(dragSrcEl, wrapper.nextSibling);
            } else {
                previewContainer.insertBefore(dragSrcEl, wrapper);
            }

            // 同步数组
            if (onDrop) {
                onDrop();
            } else if (fileArray && dragSrcIndex >= 0 && dragSrcIndex < fileArray.length) {
                const [moved] = fileArray.splice(dragSrcIndex, 1);
                fileArray.splice(targetIndex, 0, moved);
            }

            // 更新封面标记
            updateCoverMark(previewContainer);
        };

        wrapper.ondragend = () => {
            dragSrcEl = null;
            dragSrcIndex = -1;
            getWrappers().forEach(w => {
                w.style.opacity = '';
                w.style.borderLeft = '';
                w.style.paddingLeft = '';
            });
        };
    });
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
 * 📐 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * 🎬 使用 XMLHttpRequest 上传视频并支持进度回调
 */
function uploadVideoWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("file", file);
        formData.append("file_type", "post_video");

        const baseUrl = API?.BASE_URL || "";
        xhr.open("POST", `${baseUrl}/api/upload`);

        const token = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch {
                    resolve({ url: xhr.responseText });
                }
            } else {
                let msg = `上传失败 (${xhr.status})`;
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.detail || data.message || data.error) msg = data.detail || data.message || data.error;
                } catch {}
                reject(new Error(msg));
            }
        };

        xhr.onerror = () => reject(new Error('网络错误，上传失败'));
        xhr.ontimeout = () => reject(new Error('上传超时'));
        xhr.timeout = 300000;
        xhr.send(formData);
    });
}

/**
 * ✏️ 创建发布帖子视图
 * @param {Object|string} currentUser - 当前用户
 * @param {Object} editPostData - 编辑模式时的帖子数据（可选）
 */
export function createPublishPostView(currentUser, editPostData = null) {
    const isEditMode = !!editPostData;
    
    // 编辑模式下的字段值
    const editTitle = isEditMode ? (editPostData.title || '') : '';
    const editContent = isEditMode ? (editPostData.content || '') : '';
    const editImageUrls = isEditMode ? (editPostData.images || editPostData.image_urls || []) : [];
    const editIsOriginal = isEditMode ? (editPostData.is_original || false) : false;
    const editPostType = isEditMode ? (editPostData.post_type || 'image') : 'image';
    const editVideoUrl = isEditMode ? (editPostData.video_url || '') : '';
    const editCoverUrl = isEditMode ? (editPostData.cover_image || '') : '';
    
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
    
    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; border-bottom: 1px solid #444; background: #1a1a1a;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="btn-back-publish" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                    <span style="font-size: 14px;">⬅</span> ${t('common.back')}
                </button>
                <span style="font-size: 16px; font-weight: bold; color: #fff;">✏️ ${isEditMode ? '编辑帖子' : t('post.publish')}</span>
            </div>
        </div>
        
        <!-- 表单内容 -->
        <div style="flex: 1; overflow-y: auto; padding: 15px;">
            <!-- 模式切换 -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    ${t('post.mode_label') || '发布模式'}
                </label>
                <div style="display: flex; gap: 0; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; overflow: hidden;">
                    <button id="mode-image" style="flex: 1; padding: 10px; background: #4CAF50; color: #fff; border: none; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;">
                        📷 ${t('post.mode_image') || '图文'}
                    </button>
                    <button id="mode-video" style="flex: 1; padding: 10px; background: transparent; color: #888; border: none; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s; border-left: 1px solid #444;">
                        🎬 ${t('post.mode_video') || '视频'}
                    </button>
                </div>
            </div>
            
            <!-- 图片上传区 -->
            <div id="image-upload-section" style="margin-bottom: 20px;">
                <label style="display: block; font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    🖼️ ${t('post.upload_images')} <span style="color: #F44336;">*</span>
                    <span style="font-weight: normal; color: #888; font-size: 12px;">（${t('post.max_9_images')}）</span>
                </label>
                <input type="file" id="images-input" accept="image/*" multiple style="display: none;">
                <div id="images-preview" style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 80px; padding: 15px; background: #1a1a1a; border: 2px dashed #444; border-radius: 8px; cursor: pointer; transition: 0.2s;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; color: #666; font-size: 13px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">📷</div>
                        ${t('post.click_upload')}
                    </div>
                </div>
            </div>
            
            <!-- 视频上传区 -->
            <div id="video-upload-section" style="margin-bottom: 20px; display: none;">
                <label style="display: block; font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    🎬 ${t('post.upload_video') || '上传视频'} <span style="color: #F44336;">*</span>
                    <span style="font-weight: normal; color: #888; font-size: 12px;">（mp4/webm/mov，≤50MB，≤3分钟）</span>
                </label>
                <input type="file" id="video-input" accept="video/mp4,video/webm,video/quicktime" style="display: none;">
                <div id="video-preview-area" style="padding: 15px; background: #1a1a1a; border: 2px dashed #444; border-radius: 8px; cursor: pointer; transition: 0.2s;">
                    <div id="video-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; color: #666; font-size: 13px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">🎬</div>
                        ${t('post.click_upload_video') || '点击选择视频'}
                    </div>
                    <div id="video-player-wrap" style="display: none;">
                        <video id="video-player" controls style="width: 100%; max-height: 300px; border-radius: 8px; background: #000; display: block;"></video>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
                            <div style="font-size: 12px; color: #aaa; line-height: 1.5;">
                                <div id="video-name"></div>
                                <div id="video-meta"></div>
                            </div>
                            <button id="btn-remove-video" style="width: 28px; height: 28px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 16px; line-height: 1; flex-shrink: 0;">×</button>
                        </div>
                        <!-- 封面区域 -->
                        <div id="video-cover-wrap" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #333;">
                            <div style="font-size: 12px; font-weight: bold; color: #fff; margin-bottom: 8px;">${t('post.video_cover') || '视频封面'}</div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                                    <img id="cover-thumb" src="" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid #4CAF50; display: none;">
                                    <span id="cover-label" style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px; display: none;">${t('post.cover')}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <button id="btn-capture-frame" style="padding: 6px 12px; background: #333; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">
                                        📸 ${t('post.capture_frame') || '截取当前帧'}
                                    </button>
                                    <button id="btn-upload-cover" style="padding: 6px 12px; background: #333; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">
                                        🖼️ ${t('post.upload_cover') || '手动上传封面'}
                                    </button>
                                    <input type="file" id="cover-input" accept="image/*" style="display: none;">
                                </div>
                            </div>
                        </div>
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
            
            <!-- 确认发布按钮 -->
            <button id="btn-submit-post" style="width: 100%; padding: 12px; background: #4CAF50; border: none; color: #fff; border-radius: 6px; cursor: pointer; font-size: 15px; font-weight: bold; transition: 0.2s; margin-top: 15px; margin-bottom: 5px;" onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'">
                🚀 ${isEditMode ? '保存修改' : t('common.publish')}
            </button>
        </div>
    `;
    
    // ========== 状态变量 ==========
    let postMode = isEditMode && editPostType === 'video' ? 'video' : 'image';
    let imageFiles = [];
    let existingImageUrls = [];
    let videoFile = null;
    let videoCoverFile = null;
    let videoDuration = 0;
    let videoObjectUrl = null;
    let coverObjectUrl = null;
    let currentVideoUrl = isEditMode ? editVideoUrl : '';
    let currentCoverUrl = isEditMode ? editCoverUrl : '';
    
    // ========== DOM 引用 ==========
    const modeImageBtn = container.querySelector("#mode-image");
    const modeVideoBtn = container.querySelector("#mode-video");
    const imageSection = container.querySelector("#image-upload-section");
    const videoSection = container.querySelector("#video-upload-section");
    const imagesInput = container.querySelector("#images-input");
    const imagesPreview = container.querySelector("#images-preview");
    if (imagesPreview) {
        imagesPreview.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
        imagesPreview.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });
    }
    const videoInput = container.querySelector("#video-input");
    const videoPreviewArea = container.querySelector("#video-preview-area");
    const videoEmptyState = container.querySelector("#video-empty-state");
    const videoPlayerWrap = container.querySelector("#video-player-wrap");
    const videoPlayer = container.querySelector("#video-player");
    const videoNameEl = container.querySelector("#video-name");
    const videoMetaEl = container.querySelector("#video-meta");
    const btnRemoveVideo = container.querySelector("#btn-remove-video");
    const videoCoverWrap = container.querySelector("#video-cover-wrap");
    const coverThumb = container.querySelector("#cover-thumb");
    const coverLabel = container.querySelector("#cover-label");
    const btnCaptureFrame = container.querySelector("#btn-capture-frame");
    const btnUploadCover = container.querySelector("#btn-upload-cover");
    const coverInput = container.querySelector("#cover-input");
    const titleInput = container.querySelector("#title-input");
    const contentInput = container.querySelector("#content-input");
    const titleCount = container.querySelector("#title-count");
    const contentCount = container.querySelector("#content-count");
    const submitBtn = container.querySelector("#btn-submit-post");
    const isOriginalCheckbox = container.querySelector("#is-original-checkbox");
    
    // ========== 模式切换 ==========
    function updateModeUI() {
        if (postMode === 'image') {
            modeImageBtn.style.background = '#4CAF50';
            modeImageBtn.style.color = '#fff';
            modeVideoBtn.style.background = 'transparent';
            modeVideoBtn.style.color = '#888';
            imageSection.style.display = 'block';
            videoSection.style.display = 'none';
        } else {
            modeImageBtn.style.background = 'transparent';
            modeImageBtn.style.color = '#888';
            modeVideoBtn.style.background = '#4CAF50';
            modeVideoBtn.style.color = '#fff';
            imageSection.style.display = 'none';
            videoSection.style.display = 'block';
        }
    }
    
    function switchMode(mode) {
        if (postMode === mode) return;
        postMode = mode;
        // 清空用户新选择的文件内容，防止混合；保留编辑模式下的原始URL数据
        if (mode === 'image') {
            videoFile = null;
            videoCoverFile = null;
            videoDuration = 0;
            if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
            renderVideoPreview();
            // 重新渲染图片区，确保UI与当前数据一致
            if (isEditMode) {
                renderExistingImagePreviews();
            } else {
                renderImagePreviews();
            }
        } else {
            imageFiles = [];
            if (isEditMode) {
                renderExistingImagePreviews();
            } else {
                renderImagePreviews();
            }
            renderVideoPreview();
        }
        updateModeUI();
    }
    
    modeImageBtn.onclick = () => switchMode('image');
    modeVideoBtn.onclick = () => switchMode('video');
    
    // 编辑模式：加载已有的图片
    if (isEditMode && editImageUrls.length > 0) {
        existingImageUrls = [...editImageUrls];
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
    
    // ========== 图片相关逻辑 ==========
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
            imagesPreview.onclick = () => imagesInput.click();
            return;
        }
        
        imagesPreview.innerHTML = "";
        imagesPreview.onclick = null;
        
        const onDropReorder = () => {
            const wrappers = Array.from(imagesPreview.children).filter(c => c.querySelector('img'));
            const newExisting = [];
            const newFiles = [];
            wrappers.forEach(w => {
                if (w._imageType === 'existing') newExisting.push(w._imageData);
                else if (w._imageType === 'file') newFiles.push(w._imageData);
            });
            existingImageUrls = newExisting;
            imageFiles = newFiles;
        };
        
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
                <button data-action="remove" data-existing-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
            `;
            
            wrapper._imageType = 'existing';
            wrapper._imageData = url;
            
            wrapper.querySelector("button").onclick = (e) => {
                e.stopPropagation();
                existingImageUrls = existingImageUrls.filter((_, i) => i !== idx);
                renderExistingImagePreviews();
            };
            
            imagesPreview.appendChild(wrapper);
        });
        
        setupImageDragSort(imagesPreview, null, { onDrop: onDropReorder });
        
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
                    <button data-action="remove" data-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                `;
                
                wrapper._imageType = 'file';
                wrapper._imageData = file;
                
                wrapper.querySelector("button").onclick = (e) => {
                    e.stopPropagation();
                    imageFiles = imageFiles.filter((_, i) => i !== idx);
                    renderExistingImagePreviews();
                };
                
                imagesPreview.appendChild(wrapper);
                setupImageDragSort(imagesPreview, null, { onDrop: onDropReorder });
            };
            reader.readAsDataURL(file);
        });
        
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
            imagesPreview.onclick = () => imagesInput.click();
            return;
        }
        
        imagesPreview.innerHTML = "";
        imagesPreview.onclick = null;
        
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
                    <button data-action="remove" data-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                `;
                
                wrapper._imageType = 'file';
                wrapper._imageData = file;
                
                imagesPreview.appendChild(wrapper);
                setupImageDragSort(imagesPreview, imageFiles, {
                    onRemove: (wrapper) => {
                        const idx = imageFiles.indexOf(wrapper._imageData);
                        if (idx >= 0) imageFiles.splice(idx, 1);
                        renderImagePreviews();
                    }
                });
            };
            reader.readAsDataURL(file);
        });
        
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
    
    // ========== 视频相关逻辑 ==========
    
    // 视频文件选择
    videoInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // 格式检查
        const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
        const validExts = ['.mp4', '.webm', '.mov'];
        const isValidType = validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
        if (!isValidType) {
            showToast(t('post.error_video_format') || '仅支持 mp4、webm、mov 格式的视频', "warning");
            videoInput.value = '';
            return;
        }
        
        // 大小检查
        const MAX_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            showToast(t('post.error_video_size') || '视频大小不能超过 50MB', "warning");
            videoInput.value = '';
            return;
        }
        
        // 时长检查
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        const tempUrl = URL.createObjectURL(file);
        tempVideo.src = tempUrl;
        
        tempVideo.onloadedmetadata = () => {
            URL.revokeObjectURL(tempUrl);
            if (tempVideo.duration > 180) {
                showToast(t('post.error_video_duration') || '视频时长不能超过 3 分钟', "warning");
                videoInput.value = '';
                return;
            }
            
            videoDuration = tempVideo.duration;
            videoFile = file;
            if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
            videoObjectUrl = URL.createObjectURL(file);
            currentVideoUrl = '';
            renderVideoPreview();
        };
        
        tempVideo.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            showToast(t('post.error_video_load') || '无法读取视频信息', "warning");
            videoInput.value = '';
        };
    };
    
    // 渲染视频预览
    function renderVideoPreview() {
        if (!videoFile && !currentVideoUrl) {
            videoEmptyState.style.display = 'flex';
            videoPlayerWrap.style.display = 'none';
            videoPreviewArea.style.borderStyle = 'dashed';
            videoPreviewArea.style.cursor = 'pointer';
            videoPreviewArea.onclick = () => videoInput.click();
            return;
        }
        
        videoEmptyState.style.display = 'none';
        videoPlayerWrap.style.display = 'block';
        videoPreviewArea.style.borderStyle = 'solid';
        videoPreviewArea.style.cursor = 'default';
        videoPreviewArea.onclick = null;
        
        const src = videoObjectUrl || currentVideoUrl;
        videoPlayer.src = src;
        
        if (videoFile) {
            videoNameEl.textContent = videoFile.name;
            videoMetaEl.textContent = `${formatFileSize(videoFile.size)} · ${Math.round(videoDuration)}秒`;
        } else if (currentVideoUrl) {
            videoNameEl.textContent = t('post.existing_video') || '已有视频';
            videoMetaEl.textContent = '';
        }
        
        // 自动生成封面（首次加载视频数据时）
        videoPlayer.onloadeddata = async () => {
            if (!videoCoverFile && !currentCoverUrl) {
                const cover = await generateCoverFromVideo(videoPlayer);
                if (cover) {
                    videoCoverFile = cover;
                    renderCoverThumb();
                }
            }
        };
        
        videoCoverWrap.style.display = 'block';
        renderCoverThumb();
    }
    
    // 渲染封面缩略图
    function renderCoverThumb() {
        if (coverObjectUrl) { URL.revokeObjectURL(coverObjectUrl); coverObjectUrl = null; }
        const url = videoCoverFile ? URL.createObjectURL(videoCoverFile) : currentCoverUrl;
        if (url) {
            coverThumb.src = url;
            coverThumb.style.display = 'block';
            coverLabel.style.display = 'block';
            if (videoCoverFile) coverObjectUrl = url;
        } else {
            coverThumb.style.display = 'none';
            coverLabel.style.display = 'none';
        }
    }
    
    // 从视频元素生成封面
    async function generateCoverFromVideo(videoEl) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth || 640;
            canvas.height = videoEl.videoHeight || 360;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            
            return await new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    if (blob) {
                        const file = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
                        resolve(file);
                    } else {
                        resolve(null);
                    }
                }, 'image/jpeg', 0.85);
            });
        } catch (err) {
            console.error('封面生成失败:', err);
            return null;
        }
    }
    
    // 删除视频
    btnRemoveVideo.onclick = (e) => {
        e.stopPropagation();
        videoFile = null;
        videoCoverFile = null;
        videoDuration = 0;
        if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
        currentVideoUrl = '';
        currentCoverUrl = '';
        videoInput.value = '';
        renderVideoPreview();
    };
    
    // 截取当前帧
    btnCaptureFrame.onclick = async (e) => {
        e.stopPropagation();
        if (!videoPlayer.videoWidth) {
            showToast(t('post.error_video_not_ready') || '视频尚未加载完成', "warning");
            return;
        }
        const cover = await generateCoverFromVideo(videoPlayer);
        if (cover) {
            videoCoverFile = cover;
            currentCoverUrl = '';
            renderCoverThumb();
            showToast(t('post.cover_captured') || '封面已更新', "success");
        } else {
            showToast(t('post.cover_capture_failed') || '封面截取失败', "error");
        }
    };
    
    // 手动上传封面
    btnUploadCover.onclick = (e) => {
        e.stopPropagation();
        coverInput.click();
    };
    
    coverInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast(t('post.error_cover_format') || '请选择图片文件作为封面', "warning");
            coverInput.value = '';
            return;
        }
        videoCoverFile = file;
        currentCoverUrl = '';
        renderCoverThumb();
        coverInput.value = '';
    };
    
    // 阻止视频区域的拖拽冒泡到 ComfyUI 画布
    videoPreviewArea.ondragenter = (e) => { e.stopPropagation(); };
    videoPreviewArea.ondragover = (e) => { e.stopPropagation(); };
    videoPreviewArea.ondrop = (e) => { e.stopPropagation(); };
    videoPlayer.ondragenter = (e) => { e.stopPropagation(); };
    videoPlayer.ondragover = (e) => { e.stopPropagation(); };
    videoPlayer.ondrop = (e) => { e.stopPropagation(); };
    
    // ========== 提交发布/保存 ==========
    submitBtn.onclick = async () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        const isOriginal = isOriginalCheckbox?.checked || false;
        
        if (postMode === 'video') {
            // 视频模式校验
            if (!title) {
                showToast(t('post.error_no_title'), "warning");
                return;
            }
            if (!content) {
                showToast(t('post.error_no_content') || '请输入正文内容', "warning");
                return;
            }
            if (!videoFile && !currentVideoUrl) {
                showToast(t('post.error_no_video') || '请选择视频文件', "warning");
                return;
            }
            if (!videoCoverFile && !currentCoverUrl) {
                showToast(t('post.error_no_cover') || '请等待封面生成或手动上传封面', "warning");
                return;
            }
            
            try {
                submitBtn.disabled = true;
                
                // 上传封面
                let coverUrl = currentCoverUrl;
                if (videoCoverFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_cover') || '上传封面中...'}`;
                    const res = await api.uploadFile(videoCoverFile, "post");
                    coverUrl = res.url;
                }
                
                // 上传视频（带进度的 XMLHttpRequest）
                let videoUrl = currentVideoUrl;
                if (videoFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_video') || '上传视频中...'} 0%`;
                    const res = await uploadVideoWithProgress(videoFile, (percent) => {
                        submitBtn.textContent = `⏳ ${t('post.uploading_video') || '上传视频中...'} ${percent}%`;
                    });
                    videoUrl = res.url;
                }
                
                submitBtn.textContent = `⏳ ${isEditMode ? t('common.saving') : t('post.publishing')}...`;
                
                const payload = {
                    title,
                    content,
                    cover_image: coverUrl,
                    images: [],
                    post_type: "video",
                    video_url: videoUrl,
                    is_original: isOriginal
                };
                
                if (isEditMode) {
                    await api.updatePost(editPostData.id, payload);
                    showToast(t('post.edit_success'), "success");
                } else {
                    payload.author = currentUser.account;
                    await api.createPost(payload);
                    showToast(t('post.publish_success'), "success");
                }
                
                clearPostListCache();
                window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload"));
                window.dispatchEvent(new CustomEvent("comfy-route-back"));
                
            } catch (err) {
                showToast((isEditMode ? t('post.edit_failed') : t('post.publish_failed')) + ": " + err.message, "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = `🚀 ${isEditMode ? '保存修改' : t('common.publish')}`;
            }
            
            return;
        }
        
        // ========== 图文模式（原有逻辑完全保留） ==========
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
            
            const compressedFiles = [];
            for (let i = 0; i < imageFiles.length; i++) {
                submitBtn.textContent = `🖼️ ${t('post.compressing_progress', { current: i + 1, total: imageFiles.length })}...`;
                const compressed = await compressImage(imageFiles[i]);
                compressedFiles.push(compressed);
            }
            
            const uploadedUrls = [];
            for (let i = 0; i < compressedFiles.length; i++) {
                submitBtn.textContent = `⏳ ${t('post.uploading_progress', { current: i + 1, total: compressedFiles.length })}...`;
                const res = await api.uploadFile(compressedFiles[i], "post");
                uploadedUrls.push(res.url);
            }
            
            const allImages = [...existingImageUrls, ...uploadedUrls];
            
            if (isEditMode) {
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
            
            clearPostListCache();
            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload"));
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
            
        } catch (err) {
            showToast((isEditMode ? t('post.edit_failed') : t('post.publish_failed')) + ": " + err.message, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = `🚀 ${isEditMode ? '保存修改' : t('common.publish')}`;
        }
    };
    
    // ========== 初始渲染 ==========
    updateModeUI();
    if (isEditMode && editImageUrls.length > 0) {
        renderExistingImagePreviews();
    } else if (!isEditMode) {
        renderImagePreviews();
    }
    if (postMode === 'video') {
        renderVideoPreview();
    }
    
    return container;
}
