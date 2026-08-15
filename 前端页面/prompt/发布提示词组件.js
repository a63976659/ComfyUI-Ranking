// 前端页面/prompt/发布提示词组件.js
// ==========================================
// ✏️ 发布提示词组件（支持发布/编辑双模式）
// ==========================================
// 功能：选择类型与分类、图像提示词多图上传（拖拽排序）/视频提示词截帧或手动封面、
//       音乐提示词视频可选（图片+音频方案）、原创作品勾选、填写提示词正文、设置价格、发布或编辑、退出确认提醒
// 关联文件：
//   - 网络请求API.js (上传文件、发布/编辑提示词)
//   - UI交互提示组件.js (提示信息、退出确认弹窗)
//   - 提示词组件.js (发布后刷新列表)
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { t, tIfExists } from "../components/用户体验增强.js";
import { removeCache } from "../components/性能优化工具.js";
import { API } from "../core/全局配置.js";

// 📦 清除提示词列表缓存（前缀扫描，覆盖全部 类型/分类/排序 组合）
function clearPromptsListCache() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.includes('PromptsCache')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    removeCache('api_/api/prompts');
    console.log('🗑️ 已清除提示词列表缓存');
}

// 🖼️ 图片压缩配置
const IMAGE_MAX_SIZE = 1920;    // 最大宽/高
const IMAGE_QUALITY = 0.85;     // JPG压缩质量

/**
 * 🖼️ 压缩图片：转为JPG格式并限制尺寸
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
 * 📐 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ===== 多图预览与拖拽排序（参考讨论区发布界面） =====
const PREVIEW_WRAPPER_STYLE = { position: "relative", width: "80px", height: "80px" };

// 清除所有拖拽插入指示线
function _clearDragIndicators(wrappers) {
    wrappers.forEach(w => {
        w.style.borderLeft = '';
        w.style.paddingLeft = '';
    });
}

// 创建图片区域「+」添加按钮
function _createAddButton(imagesInput) {
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
    return addBtn;
}

// 创建删除按钮点击处理器（停止冒泡 + 执行回调）
function _createRemoveButtonHandler(removeCallback) {
    return (e) => {
        e.stopPropagation();
        removeCallback();
    };
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
            removeBtn.onclick = _createRemoveButtonHandler(() => {
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
            });
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
                _clearDragIndicators(currentWrappers);
                return;
            }

            // 清除所有插入指示
            _clearDragIndicators(currentWrappers);

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
            const endWrappers = getWrappers();
            endWrappers.forEach(w => { w.style.opacity = ''; });
            _clearDragIndicators(endWrappers);
        };
    });
}

/**
 * ✏️ 创建发布提示词视图
 * @param {Object} currentUser - 当前用户
 * @param {Object} editPromptData - 编辑模式时的提示词数据（可选，作者可见 prompt_text）
 */
export function createPublishPromptView(currentUser, editPromptData = null) {
    const isEditMode = !!editPromptData;

    // 编辑模式下的字段值
    const editType = isEditMode ? (editPromptData.prompt_type || 'image') : 'image';
    const editCategory = isEditMode ? (editPromptData.category || '') : '';
    const editTitle = isEditMode ? (editPromptData.title || '') : '';
    const editContent = isEditMode ? (editPromptData.content || '') : '';
    const editText = isEditMode ? (editPromptData.prompt_text || '') : '';
    const editPrice = isEditMode ? (editPromptData.price || 0) : 0;
    const editMediaType = isEditMode ? (editPromptData.media_type || 'image') : 'image';
    const editCoverUrl = isEditMode ? (editPromptData.cover_image || '') : '';
    const editVideoUrl = isEditMode ? (editPromptData.video_url || '') : '';
    const editAudioUrl = isEditMode ? (editPromptData.audio_url || '') : '';   // 🎵 音乐提示词已有音频
    const editImages = isEditMode ? (Array.isArray(editPromptData.images) ? editPromptData.images : []) : [];
    const editIsOriginal = isEditMode ? (editPromptData.is_original || false) : false;
    const editTags = isEditMode ? (Array.isArray(editPromptData.tags) ? editPromptData.tags : []) : [];

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

    const fieldLabelStyle = "display: block; font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 8px;";
    const inputStyle = "width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box; outline: none;";

    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; border-bottom: 1px solid #444; background: #1a1a1a;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="btn-back-publish-prompt" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#667eea'; this.style.borderColor='#667eea'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                    ⬅ ${t('common.back')}
                </button>
                <span style="font-size: 16px; font-weight: bold; color: #fff;">🧩 ${isEditMode ? t('prompt.edit_title') : t('prompt.publish_title')}</span>
            </div>
        </div>

        <!-- 表单内容 -->
        <div style="flex: 1; overflow-y: auto; padding: 15px;">
            <!-- 类型切换（图像/视频提示词） -->
            <div style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">🎯 ${t('prompt.type_label')}</label>
                <div style="display: flex; gap: 0; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; overflow: hidden;">
                    <button id="ptype-image" style="flex: 1; padding: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; border: none; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s;">
                        🎨 ${t('prompt.tab_image')}
                    </button>
                    <button id="ptype-video" style="flex: 1; padding: 10px; background: transparent; color: #888; border: none; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s; border-left: 1px solid #444;">
                        🎬 ${t('prompt.tab_video')}
                    </button>
                    <button id="ptype-music" style="flex: 1; padding: 10px; background: transparent; color: #888; border: none; cursor: pointer; font-size: 13px; font-weight: bold; transition: 0.2s; border-left: 1px solid #444;">
                        🎵 ${t('prompt.tab_music')}
                    </button>
                </div>
            </div>

            <!-- 分类选择 -->
            <div style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">🏷️ ${t('prompt.category_label')} <span style="color: #F44336;">*</span></label>
                <select id="category-select" style="${inputStyle} cursor: pointer;">
                    <option value="">${t('prompt.category_select')}</option>
                </select>
            </div>

            <!-- 🏷️ 标签（自定义 + 推荐快加 + 搜索过滤） -->
            <div style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">🔖 ${t('prompt.tag_label')}</label>
                <div id="tags-selected" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;"></div>
                <input type="text" id="tag-input" placeholder="${t('prompt.tag_placeholder')}" maxlength="12" style="${inputStyle}" onfocus="this.style.borderColor='#764ba2'" onblur="this.style.borderColor='#444'">
                <div style="font-size: 11px; color: #888; margin-top: 6px;">${t('prompt.tag_recommend')}</div>
                <div id="tag-recommend-list" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; max-height: 92px; overflow-y: auto;"></div>
            </div>

            <!-- 标题输入 -->
            <div style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">📝 ${t('prompt.title_label')} <span style="color: #F44336;">*</span></label>
                <input type="text" id="title-input" value="${escapeAttr(editTitle)}" placeholder="${t('prompt.title_placeholder')}" maxlength="50" style="${inputStyle}" onfocus="this.style.borderColor='#764ba2'" onblur="this.style.borderColor='#444'">
                <div style="text-align: right; font-size: 11px; color: #666; margin-top: 4px;">
                    <span id="title-count">${editTitle.length}</span>/50
                </div>
            </div>

            <!-- 文案/简介输入 -->
            <div style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">✍️ ${t('prompt.content_label')} <span style="color: #F44336;">*</span></label>
                <textarea id="content-input" placeholder="${t('prompt.content_placeholder')}" maxlength="2000" style="${inputStyle} height: 100px; resize: none; line-height: 1.6;" onfocus="this.style.borderColor='#764ba2'" onblur="this.style.borderColor='#444'">${escapeHtml(editContent)}</textarea>
                <div style="text-align: right; font-size: 11px; color: #666; margin-top: 4px;">
                    <span id="content-count">${editContent.length}</span>/2000
                </div>
            </div>

            <!-- 提示词正文（付费内容） -->
            <div style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">🔑 ${t('prompt.text_label')} <span style="color: #F44336;">*</span></label>
                <textarea id="text-input" placeholder="${t('prompt.text_placeholder')}" maxlength="20000" style="${inputStyle} height: 180px; resize: none; line-height: 1.6; font-family: monospace;" onfocus="this.style.borderColor='#764ba2'" onblur="this.style.borderColor='#444'">${escapeHtml(editText)}</textarea>
                <div style="text-align: right; font-size: 11px; color: #666; margin-top: 4px;">
                    <span id="text-count">${editText.length}</span>/20000
                </div>
            </div>

            <!-- 价格设置 -->
            <div style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">💎 ${t('prompt.price_label')}</label>
                <input type="number" id="price-input" value="${editPrice}" min="0" max="10000" step="1" style="${inputStyle}" onfocus="this.style.borderColor='#764ba2'" onblur="this.style.borderColor='#444'">
            </div>

            <!-- 原创作品勾选（参考讨论区） -->
            <div style="margin-bottom: 15px; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="is-original-checkbox" ${editIsOriginal ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer; accent-color: #764ba2;" />
                    <span style="font-size: 13px; color: #ccc;">🎨 ${t('publish.mark_as_original')}</span>
                </label>
                <div style="font-size: 11px; color: #888; margin-top: 6px; padding-left: 24px;">
                    ${t('publish.original_default_hint')}
                </div>
            </div>

            <!-- 图片上传区（图像提示词专用：多图 + 拖拽排序，首张为封面） -->
            <div id="image-upload-section" style="margin-bottom: 15px;">
                <label style="${fieldLabelStyle}">🖼️ ${t('post.upload_images')} <span style="color: #F44336;">*</span>
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

            <!-- 视频上传区（视频提示词专用：截取当前帧或手动上传封面） -->
            <div id="video-upload-section" style="margin-bottom: 20px; display: none;">
                <label style="${fieldLabelStyle}">🎬 ${t('prompt.video_label')} <span id="video-required-mark" style="color: #F44336;">*</span><span id="video-optional-mark" style="color: #888; font-weight: normal; font-size: 12px; display: none;">${t('prompt.optional_mark')}</span></label>
                <input type="file" id="video-input" accept="video/mp4,video/webm,video/quicktime" style="display: none;">
                <div id="video-preview-area" style="padding: 15px; background: #1a1a1a; border: 2px dashed #444; border-radius: 8px; cursor: pointer; transition: 0.2s;">
                    <div id="video-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; color: #666; font-size: 13px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">🎬</div>
                        ${t('post.click_upload_video')}
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
                        <!-- 封面区域（截取当前帧 / 手动上传） -->
                        <div id="video-cover-wrap" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color, #333);">
                            <div style="font-size: 12px; font-weight: bold; color: #fff; margin-bottom: 8px;">${t('post.video_cover')}</div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                                    <img id="cover-thumb" src="" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid #4CAF50; display: none;">
                                    <span id="cover-label" style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px; display: none;">${t('post.cover')}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    <button id="btn-capture-frame" style="padding: 6px 12px; background: #333; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">
                                        📸 ${t('post.capture_frame')}
                                    </button>
                                    <button id="btn-upload-cover" style="padding: 6px 12px; background: #333; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#333'">
                                        🖼️ ${t('post.upload_cover')}
                                    </button>
                                    <input type="file" id="cover-input" accept="image/*" style="display: none;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 🎵 音频上传区（音乐提示词专用：图片+音频方案，视频可选） -->
            <div id="audio-upload-section" style="margin-bottom: 20px; display: none;">
                <label style="${fieldLabelStyle}">🎵 ${t('prompt.audio_label')} <span style="color: #F44336;">*</span></label>
                <div style="font-size: 11px; color: #888; margin: -4px 0 8px; line-height: 1.5;">${t('prompt.music_media_hint')}</div>
                <input type="file" id="audio-input" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg" style="display: none;">
                <div id="audio-preview-area" style="padding: 15px; background: #1a1a1a; border: 2px dashed #444; border-radius: 8px; cursor: pointer; transition: 0.2s;">
                    <div id="audio-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; color: #666; font-size: 13px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">🎵</div>
                        ${t('post.click_upload_audio')}
                    </div>
                    <div id="audio-player-wrap" style="display: none;">
                        <audio id="audio-player" controls style="width: 100%; display: block;"></audio>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
                            <div style="font-size: 12px; color: #aaa; line-height: 1.5;">
                                <div id="audio-name"></div>
                                <div id="audio-meta"></div>
                            </div>
                            <button id="btn-remove-audio" style="width: 28px; height: 28px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 16px; line-height: 1; flex-shrink: 0;">×</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 提示信息 -->
            <div style="background: rgba(102,126,234,0.1); border: 1px solid rgba(102,126,234,0.3); border-radius: 6px; padding: 12px; font-size: 12px; color: #aaa; line-height: 1.6;">
                💡 <strong>${t('prompt.notice_title')}：</strong><br>
                • ${t('prompt.notice_1')}<br>
                • ${t('prompt.notice_2')}<br>
                • ${t('prompt.notice_3')}
            </div>

            <!-- 确认发布按钮 -->
            <button id="btn-submit-prompt" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: #fff; border-radius: 6px; cursor: pointer; font-size: 15px; font-weight: bold; transition: 0.2s; margin-top: 15px; margin-bottom: 5px;">
                🚀 ${isEditMode ? t('prompt.save_submit') : t('prompt.publish_submit')}
            </button>
        </div>
    `;

    // ========== 状态变量 ==========
    let promptType = editType;           // image / video / music（提示词模块类型）
    let imageFiles = [];                 // 图像提示词：新上传的图片文件
    let existingImageUrls = [];          // 图像提示词：编辑模式已有图片URL
    let videoFile = null;                // 视频提示词：新上传的视频文件
    let videoDuration = 0;
    let videoObjectUrl = null;
    let videoCoverFile = null;           // 视频封面（截取当前帧或手动上传）
    let coverObjectUrl = null;
    let currentVideoUrl = editVideoUrl;
    let currentCoverUrl = editCoverUrl;
    let audioFile = null;                // 🎵 音乐提示词：新上传的音频文件
    let audioObjectUrl = null;
    let currentAudioUrl = editAudioUrl;
    let categoriesLoaded = false;
    let selectedTags = [...editTags];      // 已选标签
    let recommendTags = [];                // 全站推荐标签 [{name, count}]

    // 编辑模式：加载已有图片（旧数据无 images 字段时回退为单封面）
    if (isEditMode) {
        if (editImages.length > 0) {
            existingImageUrls = [...editImages];
        } else if (editMediaType !== 'video' && editCoverUrl) {
            existingImageUrls = [editCoverUrl];
        }
    }

    // ========== DOM 引用 ==========
    const ptypeImageBtn = container.querySelector("#ptype-image");
    const ptypeVideoBtn = container.querySelector("#ptype-video");
    const ptypeMusicBtn = container.querySelector("#ptype-music");
    const categorySelect = container.querySelector("#category-select");
    const tagInput = container.querySelector("#tag-input");
    const tagsSelectedEl = container.querySelector("#tags-selected");
    const tagRecommendList = container.querySelector("#tag-recommend-list");
    const titleInput = container.querySelector("#title-input");
    const contentInput = container.querySelector("#content-input");
    const textInput = container.querySelector("#text-input");
    const priceInput = container.querySelector("#price-input");
    const isOriginalCheckbox = container.querySelector("#is-original-checkbox");
    const imageSection = container.querySelector("#image-upload-section");
    const imagesInput = container.querySelector("#images-input");
    const imagesPreview = container.querySelector("#images-preview");
    const videoSection = container.querySelector("#video-upload-section");
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
    const audioSection = container.querySelector("#audio-upload-section");
    const audioInput = container.querySelector("#audio-input");
    const audioPreviewArea = container.querySelector("#audio-preview-area");
    const audioEmptyState = container.querySelector("#audio-empty-state");
    const audioPlayerWrap = container.querySelector("#audio-player-wrap");
    const audioPlayer = container.querySelector("#audio-player");
    const audioNameEl = container.querySelector("#audio-name");
    const audioMetaEl = container.querySelector("#audio-meta");
    const btnRemoveAudio = container.querySelector("#btn-remove-audio");
    const videoRequiredMark = container.querySelector("#video-required-mark");
    const videoOptionalMark = container.querySelector("#video-optional-mark");
    const submitBtn = container.querySelector("#btn-submit-prompt");

    // 防止图片预览区拖拽冒泡到 ComfyUI 画布
    if (imagesPreview) {
        imagesPreview.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
        imagesPreview.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });
    }

    // ========== 返回按钮（有未保存内容时提醒确认） ==========
    container.querySelector("#btn-back-publish-prompt").onclick = async () => {
        const titleVal = titleInput.value.trim();
        const contentVal = contentInput.value.trim();
        const textVal = textInput.value.trim();
        const hasChanges = !!(
            titleVal ||
            contentVal ||
            textVal ||
            imageFiles.length > 0 ||
            videoFile ||
            audioFile
        );

        if (hasChanges) {
            const confirmed = await showConfirm(
                isEditMode ? t('publish.unsaved_changes_desc') : t('publish.leave_confirm_desc'),
                {
                    title: isEditMode ? t('publish.unsaved_changes_title') : t('publish.leave_confirm_title'),
                    confirmText: t('common.leave'),
                    cancelText: t('common.stay'),
                    type: 'warning'
                }
            );
            if (!confirmed) return;
        }

        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    // ========== 字数统计 ==========
    titleInput.oninput = () => { container.querySelector("#title-count").textContent = titleInput.value.length; };
    contentInput.oninput = () => { container.querySelector("#content-count").textContent = contentInput.value.length; };
    textInput.oninput = () => { container.querySelector("#text-count").textContent = textInput.value.length; };

    // ========== 类型切换 ==========
    function updateTypeUI() {
        // 先重置三个按钮样式，再高亮当前选中项
        [ptypeImageBtn, ptypeVideoBtn, ptypeMusicBtn].forEach(btn => {
            btn.style.background = 'transparent';
            btn.style.color = '#888';
        });
        const activeBtn = promptType === 'image' ? ptypeImageBtn : (promptType === 'music' ? ptypeMusicBtn : ptypeVideoBtn);
        activeBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        activeBtn.style.color = '#fff';
        // 图像区：图像提示词 + 音乐提示词（图片+音频方案）；视频区：视频/音乐；音频区：仅音乐
        imageSection.style.display = promptType === 'video' ? 'none' : 'block';
        videoSection.style.display = promptType === 'image' ? 'none' : 'block';
        audioSection.style.display = promptType === 'music' ? 'block' : 'none';
        // 音乐提示词的视频为可选项
        videoRequiredMark.style.display = promptType === 'music' ? 'none' : 'inline';
        videoOptionalMark.style.display = promptType === 'music' ? 'inline' : 'none';
    }

    function switchPromptType(type) {
        if (promptType === type) return;
        promptType = type;
        // 清空另一类型的用户新选文件，防止混合；编辑模式下的已有URL数据保留
        if (type === 'image') {
            videoFile = null;
            videoCoverFile = null;
            videoDuration = 0;
            if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
            // 音频仅音乐提示词使用，切走时清空（与切往视频分支一致）
            audioFile = null;
            currentAudioUrl = '';
            if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
            renderAudioPreview();
            renderVideoPreview();
        } else if (type === 'video') {
            // 音频仅音乐提示词使用，切走时清空（编辑模式已有数据同样清除，提交以当前类型为准）
            imageFiles = [];
            audioFile = null;
            currentAudioUrl = '';
            if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
            renderAudioPreview();
            renderVideoPreview();
        } else {
            // 🎵 音乐：图片+音频方案，保留已选图片；视频与音乐共用视频上传区，保留已选视频
            audioFile = null;
            currentAudioUrl = '';
            if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
            renderAudioPreview();
            renderVideoPreview();
        }
        if (isEditMode) {
            renderExistingImagePreviews();
        } else {
            renderImagePreviews();
        }
        updateTypeUI();
        loadCategories();
    }

    ptypeImageBtn.onclick = () => switchPromptType('image');
    ptypeVideoBtn.onclick = () => switchPromptType('video');
    ptypeMusicBtn.onclick = () => switchPromptType('music');

    // 🎵 音乐提示词：视频与「图片+音频」二选一，选定一组自动清空另一组
    function clearMusicVideoState() {
        videoFile = null;
        videoCoverFile = null;
        videoDuration = 0;
        if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
        currentVideoUrl = '';
        currentCoverUrl = '';
        renderVideoPreview();
    }

    function clearMusicImageAudioState() {
        imageFiles = [];
        existingImageUrls = [];
        audioFile = null;
        currentAudioUrl = '';
        if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
        if (isEditMode) {
            renderExistingImagePreviews();
        } else {
            renderImagePreviews();
        }
        renderAudioPreview();
    }

    // ========== 分类加载 ==========
    async function loadCategories() {
        try {
            const res = await api.getPromptCategories(promptType);
            const categories = res.data || res || [];
            categorySelect.innerHTML = `<option value="">${t('prompt.category_select')}</option>`;
            categories.forEach(cat => {
                const opt = document.createElement("option");
                opt.value = cat;
                opt.textContent = tIfExists('promptcat.' + cat, cat);
                if (cat === editCategory && !categoriesLoaded) opt.selected = true;
                categorySelect.appendChild(opt);
            });
            categoriesLoaded = true;
        } catch (err) {
            console.error("加载分类失败:", err);
            showToast(t('prompt.category_load_failed'), "warning");
        }
    }

    // ========== 标签管理（自定义 + 推荐快加 + 搜索过滤） ==========
    function renderSelectedTags() {
        tagsSelectedEl.innerHTML = "";
        selectedTags.forEach(tag => {
            const chip = document.createElement("span");
            chip.style.cssText = "display: inline-flex; align-items: center; gap: 4px; background: rgba(0,188,212,0.15); border: 1px solid rgba(0,188,212,0.4); color: #4DD0E1; font-size: 12px; padding: 3px 8px; border-radius: 10px;";
            chip.textContent = "#" + tag;
            const rm = document.createElement("button");
            rm.textContent = "×";
            rm.style.cssText = "background: none; border: none; color: #4DD0E1; cursor: pointer; font-size: 13px; line-height: 1; padding: 0;";
            rm.onclick = () => { selectedTags = selectedTags.filter(x => x !== tag); renderSelectedTags(); renderRecommendTags(); };
            chip.appendChild(rm);
            tagsSelectedEl.appendChild(chip);
        });
    }

    function renderRecommendTags() {
        const kw = (tagInput.value || "").trim().toLowerCase();
        const list = recommendTags
            .map(item => item.name)
            .filter(name => !selectedTags.includes(name))
            .filter(name => !kw || name.toLowerCase().includes(kw))
            .slice(0, 20);
        tagRecommendList.innerHTML = "";
        if (!list.length) {
            tagRecommendList.innerHTML = `<span style="font-size: 11px; color: #666;">${t('prompt.tag_no_recommend')}</span>`;
            return;
        }
        list.forEach(name => {
            const chip = document.createElement("button");
            chip.style.cssText = "background: rgba(118,75,162,0.2); border: 1px solid rgba(118,75,162,0.5); color: #CE93D8; font-size: 11px; padding: 3px 8px; border-radius: 10px; cursor: pointer; transition: 0.2s;";
            chip.textContent = "+ " + name;
            chip.onclick = () => addTag(name);
            tagRecommendList.appendChild(chip);
        });
    }

    function addTag(name) {
        const clean = (name || "").trim().slice(0, 12);
        if (!clean) return;
        if (selectedTags.length >= 10) { showToast(t('prompt.tag_max'), "warning"); return; }
        if (selectedTags.includes(clean)) return;
        selectedTags.push(clean);
        tagInput.value = "";
        renderSelectedTags();
        renderRecommendTags();
    }

    tagInput.onkeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); addTag(tagInput.value); }
    };
    tagInput.oninput = () => renderRecommendTags();

    async function loadRecommendTags() {
        try {
            const res = await api.getPromptTags();
            recommendTags = res.data || res || [];
            renderRecommendTags();
        } catch (err) {
            console.error("加载推荐标签失败:", err);
        }
    }

    // ========== 多图上传（图像提示词专用：最多9张 + 拖拽排序，首张为封面） ==========
    imagesInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        const totalImages = existingImageUrls.length + imageFiles.length;
        const remaining = 9 - totalImages;

        if (remaining <= 0) {
            showToast(t('post.max_9_images'), "warning");
            imagesInput.value = '';
            return;
        }

        const toAdd = files.slice(0, remaining);
        imagesInput.value = '';
        if (toAdd.length === 0) return;

        imageFiles = [...imageFiles, ...toAdd];

        // 🎵 音乐二选一：选定图片后自动清空视频
        if (promptType === 'music' && (videoFile || currentVideoUrl)) {
            clearMusicVideoState();
            showToast(t('post.media_exclusive'), "info");
        }

        if (isEditMode) {
            renderExistingImagePreviews();
        } else {
            renderImagePreviews();
        }
    };

    // 渲染已有图片预览（编辑模式：已有URL与新文件混排）
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
            Object.assign(wrapper.style, PREVIEW_WRAPPER_STYLE);

            wrapper.innerHTML = `
                <img src="${escapeAttr(url)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid ${idx === 0 ? '#4CAF50' : '#444'};">
                ${idx === 0 ? `<span class="cover-label" style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px;">${t('post.cover')}</span>` : ''}
                <button data-action="remove" data-existing-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
            `;

            wrapper._imageType = 'existing';
            wrapper._imageData = url;

            wrapper.querySelector("button").onclick = _createRemoveButtonHandler(() => {
                existingImageUrls = existingImageUrls.filter(u => u !== url);
                renderExistingImagePreviews();
            });

            imagesPreview.appendChild(wrapper);
        });

        setupImageDragSort(imagesPreview, null, { onDrop: onDropReorder });

        imageFiles.forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const wrapper = document.createElement("div");
                Object.assign(wrapper.style, PREVIEW_WRAPPER_STYLE);
                wrapper.innerHTML = `
                    <img src="${e.target.result}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid ${existingImageUrls.length === 0 && idx === 0 ? '#4CAF50' : '#444'};">
                    ${existingImageUrls.length === 0 && idx === 0 ? `<span class="cover-label" style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px;">${t('post.cover')}</span>` : ''}
                    <button data-action="remove" data-idx="${idx}" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #F44336; color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                `;

                wrapper._imageType = 'file';
                wrapper._imageData = file;

                wrapper.querySelector("button").onclick = _createRemoveButtonHandler(() => {
                    imageFiles = imageFiles.filter(f => f !== file);
                    renderExistingImagePreviews();
                });

                imagesPreview.appendChild(wrapper);
                setupImageDragSort(imagesPreview, null, { onDrop: onDropReorder });
            };
            reader.readAsDataURL(file);
        });

        if (totalImages < 9) {
            imagesPreview.appendChild(_createAddButton(imagesInput));
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
                Object.assign(wrapper.style, PREVIEW_WRAPPER_STYLE);

                wrapper.innerHTML = `
                    <img src="${e.target.result}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 2px solid ${idx === 0 ? '#4CAF50' : '#444'};">
                    ${idx === 0 ? `<span class="cover-label" style="position: absolute; top: 4px; left: 4px; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px;">${t('post.cover')}</span>` : ''}
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
            imagesPreview.appendChild(_createAddButton(imagesInput));
        }
    }

    // ========== 视频上传（视频提示词专用：截帧封面 / 手动上传封面） ==========
    videoInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
        const validExts = ['.mp4', '.webm', '.mov'];
        const isValidType = validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
        if (!isValidType) {
            showToast(t('post.error_video_format'), "warning");
            videoInput.value = '';
            return;
        }

        const MAX_SIZE = 100 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            showToast(t('post.error_video_size'), "warning");
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
                showToast(t('post.error_video_duration'), "warning");
                videoInput.value = '';
                return;
            }

            videoDuration = tempVideo.duration;
            // 🎵 音乐二选一：选定视频后自动清空图片+音频
            if (promptType === 'music' && (imageFiles.length || existingImageUrls.length || audioFile || currentAudioUrl)) {
                clearMusicImageAudioState();
                showToast(t('post.media_exclusive'), "info");
            }
            videoFile = file;
            videoCoverFile = null;
            if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
            videoObjectUrl = URL.createObjectURL(file);
            currentVideoUrl = '';
            currentCoverUrl = '';
            renderVideoPreview();
            videoInput.value = '';
        };

        tempVideo.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            showToast(t('post.error_video_load'), "warning");
            videoInput.value = '';
        };
    };

    // 渲染视频预览（首次加载视频数据时自动生成封面）
    function renderVideoPreview() {
        if (!videoFile && !currentVideoUrl) {
            videoEmptyState.style.display = 'flex';
            videoPlayerWrap.style.display = 'none';
            videoPreviewArea.style.borderStyle = 'dashed';
            videoPreviewArea.style.cursor = 'pointer';
            videoPreviewArea.onclick = () => videoInput.click();
            videoCoverWrap.style.display = 'none';
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
            videoNameEl.textContent = t('post.existing_video');
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

    // 从视频元素截取当前帧生成封面
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

    // 截取当前帧作为封面
    btnCaptureFrame.onclick = async (e) => {
        e.stopPropagation();
        if (!videoPlayer.videoWidth) {
            showToast(t('post.error_video_not_ready'), "warning");
            return;
        }
        const cover = await generateCoverFromVideo(videoPlayer);
        if (cover) {
            videoCoverFile = cover;
            currentCoverUrl = '';
            renderCoverThumb();
            showToast(t('post.cover_captured'), "success");
        } else {
            showToast(t('post.cover_capture_failed'), "error");
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
            showToast(t('post.error_cover_format'), "warning");
            coverInput.value = '';
            return;
        }
        videoCoverFile = file;
        currentCoverUrl = '';
        renderCoverThumb();
        coverInput.value = '';
    };

    // 阻止视频区域的拖拽冒泡到 ComfyUI 画布
    [videoPreviewArea, videoPlayer].forEach(el => {
        el.ondragenter = (e) => e.stopPropagation();
        el.ondragover = (e) => e.stopPropagation();
        el.ondrop = (e) => e.stopPropagation();
    });

    // ========== 🎵 音频上传（音乐提示词专用：图片+音频方案，视频可选） ==========
    audioInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg'];
        const validExts = ['.mp3', '.wav', '.m4a', '.ogg'];
        const isValidType = validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
        if (!isValidType) {
            showToast(t('post.error_audio_format'), "warning");
            audioInput.value = '';
            return;
        }

        const MAX_SIZE = 30 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            showToast(t('post.error_audio_size'), "warning");
            audioInput.value = '';
            return;
        }

        // 🎵 音乐二选一：选定音频后自动清空视频
        if (promptType === 'music' && (videoFile || currentVideoUrl)) {
            clearMusicVideoState();
            showToast(t('post.media_exclusive'), "info");
        }

        audioFile = file;
        if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
        audioObjectUrl = URL.createObjectURL(file);
        currentAudioUrl = '';
        renderAudioPreview();
        audioInput.value = '';
    };

    // 渲染音频预览
    function renderAudioPreview() {
        if (!audioFile && !currentAudioUrl) {
            audioEmptyState.style.display = 'flex';
            audioPlayerWrap.style.display = 'none';
            audioPreviewArea.style.borderStyle = 'dashed';
            audioPreviewArea.style.cursor = 'pointer';
            audioPreviewArea.onclick = () => audioInput.click();
            return;
        }

        audioEmptyState.style.display = 'none';
        audioPlayerWrap.style.display = 'block';
        audioPreviewArea.style.borderStyle = 'solid';
        audioPreviewArea.style.cursor = 'default';
        audioPreviewArea.onclick = null;

        audioPlayer.src = audioObjectUrl || currentAudioUrl;

        if (audioFile) {
            audioNameEl.textContent = audioFile.name;
            audioMetaEl.textContent = formatFileSize(audioFile.size);
        } else if (currentAudioUrl) {
            audioNameEl.textContent = t('post.existing_audio');
            audioMetaEl.textContent = '';
        }
    }

    // 删除音频
    btnRemoveAudio.onclick = (e) => {
        e.stopPropagation();
        audioFile = null;
        if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
        currentAudioUrl = '';
        audioInput.value = '';
        renderAudioPreview();
    };

    // 阻止音频区域的拖拽冒泡到 ComfyUI 画布
    audioPreviewArea.ondragenter = (e) => e.stopPropagation();
    audioPreviewArea.ondragover = (e) => e.stopPropagation();
    audioPreviewArea.ondrop = (e) => e.stopPropagation();

    // ========== 提交发布/保存 ==========
    submitBtn.onclick = async () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        const promptText = textInput.value.trim();
        const category = categorySelect.value;
        const isOriginal = isOriginalCheckbox?.checked || false;
        let price = parseInt(priceInput.value, 10);
        if (isNaN(price) || price < 0) price = 0;

        // 表单校验（通用）
        if (!category) {
            showToast(t('prompt.category_required'), "warning");
            return;
        }
        if (!title) {
            showToast(t('prompt.title_required'), "warning");
            return;
        }
        if (!content) {
            showToast(t('prompt.content_required'), "warning");
            return;
        }
        if (!promptText) {
            showToast(t('prompt.text_required'), "warning");
            return;
        }

        // 类型专属校验
        // 视频提示词：视频与封面必填
        // 音乐提示词：有视频时封面必填；无视频时图片+音频必填
        if (promptType === 'video') {
            if (!videoFile && !currentVideoUrl) {
                showToast(t('post.error_no_video'), "warning");
                return;
            }
            if (!videoCoverFile && !currentCoverUrl) {
                showToast(t('post.error_no_cover'), "warning");
                return;
            }
        } else if (promptType === 'music') {
            if (videoFile || currentVideoUrl) {
                if (!videoCoverFile && !currentCoverUrl) {
                    showToast(t('post.error_no_cover'), "warning");
                    return;
                }
            } else {
                if (existingImageUrls.length + imageFiles.length === 0) {
                    showToast(t('post.error_no_image'), "warning");
                    return;
                }
                if (!audioFile && !currentAudioUrl) {
                    showToast(t('post.error_no_audio'), "warning");
                    return;
                }
            }
        } else {
            if (existingImageUrls.length + imageFiles.length === 0) {
                showToast(t('post.error_no_image'), "warning");
                return;
            }
        }

        try {
            submitBtn.disabled = true;

            const basePayload = {
                prompt_type: promptType,
                category,
                title,
                content,
                prompt_text: promptText,
                price,
                tags: selectedTags,
                is_original: isOriginal
            };

            let payload;

            // 🎵 音乐提示词未上传视频时走「图片+音频」方案，与图像提示词共用图片上传链路
            const musicAudioMode = promptType === 'music' && !videoFile && !currentVideoUrl;

            if (promptType !== 'image' && !musicAudioMode) {
                // 上传封面（截取帧或手动上传）
                let coverUrl = currentCoverUrl;
                if (videoCoverFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_cover')}`;
                    const res = await api.uploadFile(videoCoverFile, "cover");
                    coverUrl = res.url;
                }

                // 上传视频（带进度）
                let videoUrl = currentVideoUrl;
                if (videoFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_video')} 0%`;
                    const res = await uploadVideoWithProgress(videoFile, (percent) => {
                        submitBtn.textContent = `⏳ ${t('post.uploading_video')} ${percent}%`;
                    });
                    videoUrl = res.url;
                }

                payload = {
                    ...basePayload,
                    cover_image: coverUrl,
                    images: [],
                    media_type: 'video',
                    video_url: videoUrl
                };
                // 音乐提示词改走视频方案时清除旧音频
                if (promptType === 'music') payload.audio_url = null;
            } else {
                // 图像提示词 / 音乐提示词（图片+音频）：压缩并上传多图（首张为封面）
                submitBtn.textContent = `⏳ ${t('post.compressing_images')}...`;
                const compressedFiles = [];
                for (let i = 0; i < imageFiles.length; i++) {
                    submitBtn.textContent = `🖼️ ${t('post.compressing_progress', { current: i + 1, total: imageFiles.length })}...`;
                    compressedFiles.push(await compressImage(imageFiles[i]));
                }

                const uploadedUrls = [];
                for (let i = 0; i < compressedFiles.length; i++) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_progress', { current: i + 1, total: compressedFiles.length })}...`;
                    const res = await api.uploadFile(compressedFiles[i], "cover");
                    uploadedUrls.push(res.url);
                }

                const allImages = [...existingImageUrls, ...uploadedUrls];

                // 🎵 音乐提示词：上传音频
                let audioUrl = null;
                if (musicAudioMode) {
                    if (audioFile) {
                        submitBtn.textContent = `⏳ ${t('post.uploading_audio')}`;
                        const res = await api.uploadFile(audioFile, "post_audio");
                        audioUrl = res.url;
                    } else {
                        audioUrl = currentAudioUrl;
                    }
                }

                payload = {
                    ...basePayload,
                    cover_image: allImages[0],
                    images: allImages,
                    media_type: 'image',
                    video_url: null
                };
                if (musicAudioMode) payload.audio_url = audioUrl;
            }

            submitBtn.textContent = `⏳ ${t('prompt.submitting')}...`;
            if (isEditMode) {
                await api.updatePrompt(editPromptData.id, payload);
                showToast(t('prompt.update_success'), "success");
            } else {
                await api.createPrompt(payload);
                showToast(t('prompt.publish_success'), "success");
            }

            clearPromptsListCache();
            window.dispatchEvent(new CustomEvent("comfy-prompts-refresh"));
            window.dispatchEvent(new CustomEvent("comfy-route-back"));

        } catch (err) {
            console.error("发布提示词失败:", err);
            showToast(t('prompt.publish_failed') + ": " + (err?.response?.data?.detail || err.message), "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = `🚀 ${isEditMode ? t('prompt.save_submit') : t('prompt.publish_submit')}`;
        }
    };

    // ========== 初始渲染 ==========
    updateTypeUI();
    if (isEditMode) {
        renderExistingImagePreviews();
    } else {
        renderImagePreviews();
    }
    if (promptType !== 'image') {
        renderVideoPreview();
    }
    if (promptType === 'music') {
        renderAudioPreview();
    }
    renderSelectedTags();
    loadCategories();
    loadRecommendTags();

    return container;
}

/**
 * 🔒 HTML转义（textarea 内容回填用）
 */
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

/**
 * 🔒 属性值转义（input value 回填用）
 */
function escapeAttr(str) {
    return escapeHtml(str);
}
