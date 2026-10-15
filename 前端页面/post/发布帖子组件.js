// 前端页面/post/发布帖子组件.js
// ==========================================
// ✏️ 发布帖子组件（支持图文/视频双模式）
// ==========================================
// 功能：上传图片或视频、输入标题和正文、发布帖子
// 关联文件：
//   - 网络请求API.js (上传图片、发布帖子)
//   - UI交互提示组件.js (提示信息)
// ==========================================

import { createPublishFieldErrors } from "../market/发布字段错误.js";
import { bindPublishFilePicker, setPublishFilePickerAction } from "../market/发布文件选择可访问性.js";
import { compressPublishImage as compressImage, capturePublishVideoFrame } from "../market/有界图片处理.js";
import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { removeCache, removeCacheByPrefix } from "../components/性能优化工具.js";
import { createPublishEditingLock } from "../market/发布编辑锁.js";
import { createPublishSubmissionScope } from "../market/发布提交生命周期.js";
import { areKeyboardShortcutsEnabled, API, CACHE, PUBLISH_MEDIA_LIMITS, IMAGE_PROCESS, escapeHtml } from "../core/全局配置.js";

function requirePostUpload(result) {
    if (result?.status !== 'success' || typeof result.url !== 'string' || !result.url.trim()) {
        throw new Error('Unconfirmed post upload');
    }
    return result.url;
}

function confirmPostSave(result, isEditMode) {
    if (result?.status !== 'success' || (!isEditMode &&
        (typeof result.data?.id !== 'string' || !result.data.id.trim()))) {
        throw new Error('Unconfirmed post save');
    }
}

// 📦 清除帖子列表缓存
function clearPostListCache() {
    // 🔧 修复：API 层缓存键带完整查询串（api_/api/posts?sort=..&limit=..），
    // removeCache 精确删除命中不到（no-op），发帖后讨论区仍会从旧缓存返回，改用前缀删除
    removeCacheByPrefix('api_/api/posts');
    // 🔧 P1修复：讨论区组件实际使用 PostsCache_${sort} 键（非 ListCache_*），按真实键格式精准清除
    // 讨论区排序值：latest, likes, favorites, tips, views, daily_views, rating
    const sorts = ['latest', 'likes', 'favorites', 'tips', 'views', 'daily_views', 'rating'];
    for (const sort of sorts) {
        removeCache(`PostsCache_${sort}`);
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
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'group');
        wrapper.setAttribute('aria-label', t('post.image_position', { index: idx + 1, total: wrappers.length }));
        if (areKeyboardShortcutsEnabled()) wrapper.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');
        else wrapper.removeAttribute('aria-keyshortcuts');
        wrapper.title = t(areKeyboardShortcutsEnabled() ? 'post.image_move_hint' : 'post.image_drag_hint');
        const remove = wrapper.querySelector('button[data-action="remove"]');
        if (remove) {
            remove.type = 'button';
            remove.setAttribute('aria-label', t('post.remove_image', { index: idx + 1 }));
        }
        if (img && !img.hasAttribute('alt')) img.alt = '';

        if (img) {
            img.style.borderColor = idx === 0 ? 'var(--rk-success, #4caf50)' : 'var(--rk-border, var(--border-color, #444))';
        }
        if (idx === 0) {
            if (!coverLabel) {
                const label = document.createElement('span');
                label.className = 'cover-label';
                
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
    const { onRemove, onDrop, canInteract = () => true, focusEmpty } = options;
    const getWrappers = () => Array.from(previewContainer.children).filter(
        child => child.tagName === 'DIV' && child.querySelector('img')
    );

    const wrappers = getWrappers();
    if (wrappers.length === 0) return;

    updateCoverMark(previewContainer);
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
            }, { previewContainer, wrapper, canInteract, focusEmpty });
        }

        wrapper.onkeydown = (e) => {
            if (!areKeyboardShortcutsEnabled() || e.defaultPrevented || e.keyCode === 229 || e.target !== wrapper || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
                e.repeat || e.isComposing || !canInteract() ||
                !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            const current = getWrappers();
            const from = current.indexOf(wrapper);
            const to = from + (e.key === 'ArrowLeft' ? -1 : 1);
            e.preventDefault(); e.stopPropagation();
            // 编辑保存按已有URL、新文件分组；不能移动到另一组而仅改变视觉顺序。
            if (from < 0 || to < 0 || to >= current.length ||
                current[to]._imageType !== wrapper._imageType) return;
            previewContainer.insertBefore(wrapper, to > from ? current[to].nextSibling : current[to]);
            if (onDrop) onDrop();
            else if (fileArray) {
                const [moved] = fileArray.splice(from, 1);
                fileArray.splice(to, 0, moved);
            }
            updateCoverMark(previewContainer);
            wrapper.focus();
        };

        wrapper.ondragstart = (e) => {
            if (!canInteract()) { e.preventDefault(); return; }
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
            wrapper.style.borderLeft = '3px solid var(--rk-success, #4caf50)';
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
            if (!canInteract() || targetIndex === dragSrcIndex || dragSrcIndex === -1 ||
                !currentWrappers.includes(dragSrcEl) || wrapper._imageType !== dragSrcEl._imageType) return;

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
 * 📐 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ===== 共用样式常量 =====
// P3-1: 图片预览包装器通用尺寸样式


// ===== 共用辅助函数 =====

// P2-2: 清除所有拖拽插入指示线
function _clearDragIndicators(wrappers) {
    wrappers.forEach(w => {
        w.style.borderLeft = '';
        w.style.paddingLeft = '';
        
    });
}

// P2-1: 创建图片区域「+」添加按钮
function _createAddButton(imagesInput, scope) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.setAttribute("aria-label", t("post.upload_images"));
    addBtn.setAttribute("data-file-picker-button", "");
    addBtn.className = "post-publish-add";
    addBtn.textContent = "+";
    addBtn.onclick = (e) => {
        if (!scope.isCurrent() || imagesInput.disabled) return;
        e.stopPropagation();
        imagesInput.click();
    };
    return addBtn;
}

// P3-2: 显示视频错误提示并重置 input
function _showVideoErrorAndReset(msg, videoInput) {
    showToast(msg, "warning");
    videoInput.value = '';
}

// P1-1: 创建删除按钮点击处理器（停止冒泡 + 执行回调）
function _createRemoveButtonHandler(removeCallback, options = {}) {
    const { previewContainer, wrapper, canInteract = () => true, focusEmpty } = options;
    const images = () => Array.from(previewContainer.children).filter(child =>
        child.tagName === 'DIV' && child.querySelector('img'));
    return (e) => {
        e.stopPropagation();
        if (!canInteract() || e.currentTarget?.disabled) return;
        const index = previewContainer ? images().indexOf(wrapper) : -1;
        if (previewContainer && index < 0) return;
        const restoreFocus = wrapper?.contains(document.activeElement);
        removeCallback();
        if (!restoreFocus || !canInteract()) return;
        const remaining = images();
        const next = remaining[Math.min(index, remaining.length - 1)];
        if (next) next.querySelector('button[data-action="remove"]').focus();
        else focusEmpty?.focus();
    };
}

/**
 * 🎬 使用 XMLHttpRequest 上传视频并支持进度回调
 */
function uploadVideoWithProgress(file, onProgress, { signal } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let settled = false;
        const abort = () => {
            finish(Object.assign(new Error('Video upload aborted'), { name: 'AbortError' }));
            try { xhr.abort(); } catch {}
        };
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener('abort', abort);
            xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
            xhr.upload.onprogress = null;
            if (error) reject(error); else resolve(result);
        };
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        const tokenFrom = readStorage => {
            try { return readStorage().getItem(CACHE.LEGACY_KEYS.TOKEN); } catch { return null; }
        };
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('file_type', 'post_video');
            xhr.open('POST', `${API.BASE_URL}/api/upload`);
            const token = tokenFrom(() => localStorage) || tokenFrom(() => sessionStorage);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.upload.onprogress = event => {
                if (settled || !event.lengthComputable || !Number.isFinite(event.loaded) ||
                    !Number.isFinite(event.total) || event.loaded < 0 || event.total <= 0) return;
                const percent = Math.max(0, Math.min(100, Math.round(event.loaded / event.total * 100)));
                try { onProgress?.(percent); } catch {}
            };
            xhr.onload = () => {
                if (settled) return;
                if (xhr.status < 200 || xhr.status >= 300) {
                    finish(Object.assign(new Error('Video upload rejected'), { status: xhr.status })); return;
                }
                try {
                    if (typeof xhr.responseText !== 'string' || xhr.responseText.length > API.VIDEO_UPLOAD_RESPONSE_MAX_CHARS) {
                        throw new Error('Invalid video upload response');
                    }
                    const result = JSON.parse(xhr.responseText);
                    requirePostUpload(result);
                    finish(null, result);
                } catch { finish(new Error('Unconfirmed video upload')); }
            };
            xhr.onerror = () => finish(new Error('Video upload network failure'));
            xhr.ontimeout = () => finish(new Error('Video upload timed out'));
            xhr.onabort = () => finish(Object.assign(new Error('Video upload aborted'), { name: 'AbortError' }));
            xhr.timeout = API.VIDEO_UPLOAD_TIMEOUT;
            xhr.send(formData);
        } catch { finish(new Error('Video upload could not start')); }
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

    container.classList.add("ranking-publish-form", "discussion-publish");
    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div class="ranking-publish-header">
            <div class="ranking-publish-heading">
                <button type="button" id="btn-back-publish" class="ranking-publish-back">
                    ⬅ ${t('common.back')}
                </button>
                <span class="ranking-publish-title">✏️ ${isEditMode ? t('post.edit_title') : t('post.publish')}</span>
            </div>
        </div>
        
        <!-- 表单内容 -->
        <div class="ranking-publish-body">
            <!-- 模式切换 -->
            <div class="post-publish__field-group">
                <label class="post-publish__field-label">
                    ${t('post.mode_label')}
                </label>
                <div role="group" aria-label="${t('post.mode_label')}" class="post-publish__modes">
                    <button type="button" id="mode-image" class="post-publish__mode-image">
                        📷 ${t('post.mode_image')}
                    </button>
                    <button type="button" id="mode-video" class="post-publish__mode-video">
                        🎬 ${t('post.mode_video')}
                    </button>
                </div>
            </div>
            
            <!-- 图片上传区 -->
            <div id="image-upload-section" class="post-publish__upload-section">
                <label for="images-input" class="post-publish__field-label">
                    🖼️ ${t('post.upload_images')} <span class="post-publish__required">*</span>
                    <span class="post-publish__hint">（${t('post.max_9_images')}）</span>
                </label>
                <input type="file" id="images-input" accept="image/*" multiple style="display: none;">
                <div id="images-preview" class="post-publish__images-preview">
                    <div class="post-publish__upload-empty">
                        <div class="post-publish__upload-icon">📷</div>
                        ${t('post.click_upload')}
                    </div>
                </div>
            </div>
            
            <!-- 视频上传区 -->
            <div id="video-upload-section" style="display: none;" class="post-publish__upload-section">
                <label for="video-input" class="post-publish__field-label">
                    🎬 ${t('post.upload_video')} <span class="post-publish__required">*</span>
                    <span class="post-publish__hint">${t('post.video_limits_hint', { megabytes: PUBLISH_MEDIA_LIMITS.VIDEO_MAX_BYTES / (1024 * 1024), minutes: PUBLISH_MEDIA_LIMITS.VIDEO_MAX_SECONDS / 60 })}</span>
                </label>
                <input type="file" id="video-input" accept="video/mp4,video/webm,video/quicktime" style="display: none;">
                <div id="video-preview-area" class="post-publish__video-preview">
                    <div id="video-empty-state" class="post-publish__upload-empty">
                        <div class="post-publish__upload-icon">🎬</div>
                        ${t('post.click_upload_video')}
                    </div>
                    <div id="video-player-wrap" style="display: none;">
                        <video id="video-player" controls class="post-publish__video"></video>
                        <div class="post-publish__video-info">
                            <div class="post-publish__video-meta">
                                <div id="video-name"></div>
                                <div id="video-meta"></div>
                            </div>
                            <button type="button" id="btn-remove-video" aria-label="${t('common.delete')} ${t('post.mode_video')}" class="post-publish__remove-video">×</button>
                        </div>
                        <!-- 封面区域 -->
                        <div id="video-cover-wrap" style="display: none;" class="post-publish__cover-section">
                            <div class="post-publish__cover-heading">${t('post.video_cover')}</div>
                            <div class="ranking-publish-cover-controls">
                                <div class="post-publish__cover-slot">
                                    <img id="cover-thumb" src="" style="display: none;" class="post-publish__cover-image">
                                    <span id="cover-label" style="display: none;" class="post-publish__cover-label">${t('post.cover')}</span>
                                </div>
                                <div class="post-publish__cover-actions">
                                    <button type="button" id="btn-capture-frame" class="ranking-publish-secondary">
                                        📸 ${t('post.capture_frame')}
                                    </button>
                                    <button type="button" id="btn-upload-cover" class="ranking-publish-secondary">
                                        🖼️ ${t('post.upload_cover')}
                                    </button>
                                    <input type="file" id="cover-input" accept="image/*" style="display: none;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 标题输入 -->
            <div class="post-publish__field-group">
                <label for="title-input" class="post-publish__field-label">
                    📝 ${t('post.title_label')} <span class="post-publish__required">*</span>
                </label>
                <input type="text" id="title-input" class="ranking-publish-input" value="${escapeHtml(editTitle)}" placeholder="${t('post.title_placeholder')}" maxlength="50">
                <div class="post-publish__counter">
                    <span id="title-count">${editTitle.length}</span>/50
                </div>
            </div>
            
            <!-- 正文输入 -->
            <div class="post-publish__field-group">
                <label for="content-input" class="post-publish__field-label">
                    ✍️ ${t('post.content_label')}
                </label>
                <textarea id="content-input" class="post-publish__content ranking-publish-input" placeholder="${t('post.content_placeholder')}" maxlength="2000">${escapeHtml(editContent)}</textarea>
                <div class="post-publish__counter">
                    <span id="content-count">${editContent.length}</span>/2000
                </div>
            </div>
            
            <!-- 原创作品勾选框 -->
            <div class="post-publish__original">
                <label class="post-publish__original-label">
                    <input type="checkbox" id="is-original-checkbox" ${editIsOriginal ? 'checked' : ''} class="post-publish__original-checkbox" />
                    <span class="post-publish__original-text">🎨 ${t('publish.mark_as_original')}</span>
                </label>
                <div class="post-publish__original-hint">
                    ${t('publish.original_default_hint')}
                </div>
            </div>
            
            <!-- 提示信息 -->
            <div class="post-publish__notice">
                💡 <strong>${t('post.publish_notice')}：</strong><br>
                • ${t('post.notice_original')}<br>
                • ${t('post.notice_compress')}<br>
                • ${t('post.notice_manage')}
            </div>
            
            <!-- 确认发布按钮 -->
            <button type="button" id="btn-submit-post" class="post-publish__submit">
                🚀 ${isEditMode ? t('task.save_changes') : t('common.publish')}
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
    const account = currentUser?.account;
    const scope = createPublishSubmissionScope(container, submitBtn, account);
    const refreshImageShortcuts = () => {
        if (scope.isCurrent()) updateCoverMark(imagesPreview);
    };
    window.addEventListener('comfy-settings-changed', refreshImageShortcuts);
    window.addEventListener('storage', refreshImageShortcuts);
    scope.addCleanup(() => {
        window.removeEventListener('comfy-settings-changed', refreshImageShortcuts);
        window.removeEventListener('storage', refreshImageShortcuts);
    });
    const editingLock = createPublishEditingLock(container, [submitBtn, container.querySelector("#btn-back-publish")]);
    scope.addCleanup(() => editingLock.dispose());
    const previewReaders = new Set(), temporaryVideos = new Map();
    const metadataTimers = new Map();
    function releaseVideoMetadata(video) {
        const url = temporaryVideos.get(video);
        if (!temporaryVideos.has(video)) return;
        clearTimeout(metadataTimers.get(video)); metadataTimers.delete(video);
        temporaryVideos.delete(video); video.onloadedmetadata = video.onerror = null;
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch {}
        URL.revokeObjectURL(url);
    }
    let videoGeneration = 0, coverGeneration = 0, coverController = null;
    let manualCoverController = null;
    function invalidateVideoSelection() {
        videoGeneration++; coverGeneration++;
        coverController?.abort(); coverController = null;
        manualCoverController?.abort();
        videoPlayer.onloadeddata = null;
        for (const video of temporaryVideos.keys()) releaseVideoMetadata(video);
        return videoGeneration;
    }
    let imageSelectionController = null;
    let imagePreviewGeneration = 0;
    const previewTimers = new Map();
    function finishPreviewReader(reader) {
        clearTimeout(previewTimers.get(reader)); previewTimers.delete(reader);
        previewReaders.delete(reader); reader.onload = reader.onerror = reader.onabort = null;
    }
    function beginImagePreviews() {
        const generation = ++imagePreviewGeneration;
        for (const reader of previewReaders) { try { reader.abort(); } catch {} finally { finishPreviewReader(reader); } }
        previewReaders.clear();
        return generation;
    }

    scope.addCleanup(() => {
        imageSelectionController?.abort();
        coverController?.abort(); coverController = null;
        manualCoverController?.abort();
        for (const reader of previewReaders) { try { reader.abort(); } catch {} finally { finishPreviewReader(reader); } }
        previewReaders.clear();
        for (const video of temporaryVideos.keys()) releaseVideoMetadata(video);
        videoPlayer.onloadeddata = null;
        try { videoPlayer.pause(); videoPlayer.removeAttribute('src'); videoPlayer.load(); } catch {}
        for (const url of [videoObjectUrl, coverObjectUrl]) if (url) URL.revokeObjectURL(url);
        videoObjectUrl = coverObjectUrl = null;
        imageFiles = []; existingImageUrls = [];
        videoFile = videoCoverFile = null; currentVideoUrl = currentCoverUrl = '';
        container.querySelectorAll('input, textarea, select').forEach(input => { input.value = ''; input.disabled = true; });
        container.querySelectorAll('button').forEach(button => { button.disabled = true; });
        const status = document.createElement('p'); status.setAttribute('role', 'status');
        status.textContent = t('auth.session_changed'); container.replaceChildren(status);
    });
    
    // ========== 模式切换 ==========
    function updateModeUI() {
        modeImageBtn.setAttribute('aria-pressed', String(postMode === 'image'));
        modeVideoBtn.setAttribute('aria-pressed', String(postMode === 'video'));
        if (postMode === 'image') {
            imageSection.style.display = 'block';
            videoSection.style.display = 'none';
        } else {
            imageSection.style.display = 'none';
            videoSection.style.display = 'block';
        }
    }
    
    function switchMode(mode) {
        if (postMode === mode) return;
        fieldErrors.clearAll();
        imageSelectionController?.abort();
        invalidateVideoSelection();
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
    container.querySelector("#btn-back-publish").onclick = async () => {
        if (!scope.isCurrent()) return;
        // 检查是否有已编辑内容（图文或视频模式）
        const titleVal = container.querySelector("#title-input")?.value?.trim();
        const contentVal = container.querySelector("#content-input")?.value?.trim();
        const hasChanges = !!(
            titleVal ||
            contentVal ||
            imageFiles?.length > 0 ||
            videoFile
        );

        if (hasChanges) {
            const confirmed = await showConfirm(
                isEditMode ? t('publish.unsaved_changes_desc') : t('publish.leave_confirm_desc'),
                {
                    title: isEditMode ? t('publish.unsaved_changes_title') : t('publish.leave_confirm_title'),
                    confirmText: t('common.leave'),
                    cancelText: t('common.stay'),
                    type: 'warning', signal: scope.confirmationSignal
                }
            );
            if (!confirmed || !scope.isCurrent()) return;
        }

        scope.dispose();
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 字数统计
    titleInput.oninput = () => {
        if (!scope.isCurrent()) return;
        titleCount.textContent = titleInput.value.length;
    };
    contentInput.oninput = () => {
        if (!scope.isCurrent()) return;
        contentCount.textContent = contentInput.value.length;
    };
    
    // ========== 图片相关逻辑 ==========
    imagesInput.onchange = async (e) => {
        if (!scope.isCurrent() || imageSelectionController || manualCoverController) return;
        const files = Array.from(e.target.files);
        imagesInput.value = '';
        const totalImages = existingImageUrls.length + imageFiles.length;
        const remaining = PUBLISH_MEDIA_LIMITS.MAX_IMAGES - totalImages;
        
        if (remaining <= 0) {
            showToast(t('post.max_9_images'), "warning");
            return;
        }
        
        const toAdd = files.slice(0, remaining);
        if (toAdd.length === 0) return;
        
        const controller = new AbortController(); imageSelectionController = controller;
        const cancel = () => controller.abort();
        scope.confirmationSignal.addEventListener('abort', cancel, { once: true });
        const inputDisabled = imagesInput.disabled, submitDisabled = submitBtn.disabled;
        imagesInput.disabled = true; submitBtn.disabled = true; imagesInput.setAttribute('aria-busy', 'true');
        try {
            const accepted = [];
            for (const file of toAdd) {
                if (!scope.isCurrent() || controller.signal.aborted) return;
                try {
                    const processed = await compressImage(file, { signal: controller.signal });
                    if (!scope.isCurrent() || controller.signal.aborted) return;
                    accepted.push(processed);
                } catch (error) {
                    if (!scope.isCurrent() || controller.signal.aborted) return;
                }
            }
            if (accepted.length !== toAdd.length) showToast(t('post.image_invalid_file'), 'warning');
            if (!accepted.length) return;
            imageFiles = [...imageFiles, ...accepted];

            if (isEditMode) {
                renderExistingImagePreviews();
            } else {
                renderImagePreviews();
            }
        } finally {
            scope.confirmationSignal.removeEventListener('abort', cancel);
            if (imageSelectionController === controller) imageSelectionController = null;
            if (scope.isCurrent()) {
                imagesInput.disabled = inputDisabled; submitBtn.disabled = submitDisabled;
                imagesInput.removeAttribute('aria-busy');
            }
        }
    };

    // 渲染已有图片预览（编辑模式）
    function renderExistingImagePreviews() {
        const generation = beginImagePreviews();
        const totalImages = existingImageUrls.length + imageFiles.length;
        
        if (totalImages === 0) {
            imagesPreview.innerHTML = `
                <div class="post-publish__upload-empty">
                    <div class="post-publish__upload-icon">📷</div>
                    ${t('post.click_upload')}
                </div>
            `;
            setPublishFilePickerAction(imagesPreview, () => { if (scope.isCurrent()) imagesInput.click(); });
            return;
        }
        
        imagesPreview.innerHTML = "";
        setPublishFilePickerAction(imagesPreview, null);
        
        const onDropReorder = () => {
            if (!scope.isCurrent()) return;
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
            wrapper.className = "post-publish-preview";
            
            wrapper.innerHTML = `
                <img src="${escapeHtml(url)}" class="post-publish__preview-image">
                ${idx === 0 ? `<span class="post-publish__cover-label cover-label">${t('post.cover')}</span>` : ''}
                <button type="button" data-action="remove" data-existing-idx="${idx}" class="post-publish__remove-image">×</button>
            `;

            wrapper._imageType = 'existing';
            wrapper._imageData = url;

            wrapper.querySelector("button").onclick = _createRemoveButtonHandler(() => {
                if (!scope.isCurrent()) return;
                existingImageUrls = existingImageUrls.filter(u => u !== url);
                renderExistingImagePreviews();
            }, { previewContainer: imagesPreview, wrapper, focusEmpty: imagesPreview,
                canInteract: () => scope.isCurrent() && !imagesInput.disabled && !submitBtn.disabled });
            
            imagesPreview.appendChild(wrapper);
        });
        
        setupImageDragSort(imagesPreview, null, { onDrop: onDropReorder, focusEmpty: imagesPreview,
            canInteract: () => scope.isCurrent() && !imagesInput.disabled && !submitBtn.disabled });
        
        imageFiles.forEach((file, idx) => {
            const reader = new FileReader();
            previewReaders.add(reader);
            reader.onabort = () => finishPreviewReader(reader);
            const wrapper = document.createElement("div");
            wrapper.className = "post-publish-preview";
            wrapper.innerHTML = `
                <img src="" class="post-publish__preview-image">
                ${existingImageUrls.length === 0 && idx === 0 ? `<span class="post-publish__cover-label cover-label">${t('post.cover')}</span>` : ''}
                <button type="button" data-action="remove" data-idx="${idx}" class="post-publish__remove-image">×</button>
            `;

            wrapper.querySelector('img').removeAttribute('src');
            wrapper._imageType = 'file';
            wrapper._imageData = file;

            wrapper.querySelector("button").onclick = _createRemoveButtonHandler(() => {
                if (!scope.isCurrent()) return;
                imageFiles = imageFiles.filter(f => f !== file);
                renderExistingImagePreviews();
            }, { previewContainer: imagesPreview, wrapper, focusEmpty: imagesPreview,
                canInteract: () => scope.isCurrent() && !imagesInput.disabled && !submitBtn.disabled });

            imagesPreview.appendChild(wrapper);
            setupImageDragSort(imagesPreview, null, { onDrop: onDropReorder, focusEmpty: imagesPreview,
            canInteract: () => scope.isCurrent() && !imagesInput.disabled && !submitBtn.disabled });
            reader.onerror = () => {
                if (!previewReaders.has(reader)) return;
                finishPreviewReader(reader);
                if (!scope.isCurrent() || generation !== imagePreviewGeneration) return;
                wrapper.querySelector('img').alt = t('post.image_preview_failed');
                wrapper.title = t('post.image_preview_failed');
            };
            reader.onload = (e) => {
                if (!previewReaders.has(reader)) return;
                finishPreviewReader(reader);
                if (!scope.isCurrent() || generation !== imagePreviewGeneration) return;
                wrapper.querySelector('img').src = e.target.result;
            };
            previewTimers.set(reader, setTimeout(() => {
                if (!previewReaders.has(reader)) return;
                reader.onerror?.(); try { reader.abort(); } catch {}
            }, IMAGE_PROCESS.TIMEOUT));
            try { reader.readAsDataURL(file); } catch { reader.onerror?.(); }
        });
        
        if (totalImages < PUBLISH_MEDIA_LIMITS.MAX_IMAGES) {
            imagesPreview.appendChild(_createAddButton(imagesInput, scope));
        }
    }
    
    // 渲染图片预览（新建模式）
    function renderImagePreviews() {
        const generation = beginImagePreviews();
        if (imageFiles.length === 0) {
            imagesPreview.innerHTML = `
                <div class="post-publish__upload-empty">
                    <div class="post-publish__upload-icon">📷</div>
                    ${t('post.click_upload')}
                </div>
            `;
            setPublishFilePickerAction(imagesPreview, () => { if (scope.isCurrent()) imagesInput.click(); });
            return;
        }
        
        imagesPreview.innerHTML = "";
        setPublishFilePickerAction(imagesPreview, null);
        
        imageFiles.forEach((file, idx) => {
            const reader = new FileReader();
            previewReaders.add(reader);
            reader.onabort = () => finishPreviewReader(reader);
            const wrapper = document.createElement("div");
            wrapper.className = "post-publish-preview";

            wrapper.innerHTML = `
                <img src="" class="post-publish__preview-image">
                ${idx === 0 ? `<span class="post-publish__cover-label cover-label">${t('post.cover')}</span>` : ''}
                <button type="button" data-action="remove" data-idx="${idx}" class="post-publish__remove-image">×</button>
            `;

            wrapper.querySelector('img').removeAttribute('src');
            wrapper._imageType = 'file';
            wrapper._imageData = file;

            imagesPreview.appendChild(wrapper);
            setupImageDragSort(imagesPreview, imageFiles, {
                focusEmpty: imagesPreview,
                canInteract: () => scope.isCurrent() && !imagesInput.disabled && !submitBtn.disabled,
                onRemove: (wrapper) => {
                    if (!scope.isCurrent()) return;
                    const idx = imageFiles.indexOf(wrapper._imageData);
                    if (idx >= 0) imageFiles.splice(idx, 1);
                    renderImagePreviews();
                }
            });
            reader.onerror = () => {
                if (!previewReaders.has(reader)) return;
                finishPreviewReader(reader);
                if (!scope.isCurrent() || generation !== imagePreviewGeneration) return;
                wrapper.querySelector('img').alt = t('post.image_preview_failed');
                wrapper.title = t('post.image_preview_failed');
            };
            reader.onload = (e) => {
                if (!previewReaders.has(reader)) return;
                finishPreviewReader(reader);
                if (!scope.isCurrent() || generation !== imagePreviewGeneration) return;
                wrapper.querySelector('img').src = e.target.result;
            };
            previewTimers.set(reader, setTimeout(() => {
                if (!previewReaders.has(reader)) return;
                reader.onerror?.(); try { reader.abort(); } catch {}
            }, IMAGE_PROCESS.TIMEOUT));
            try { reader.readAsDataURL(file); } catch { reader.onerror?.(); }
        });
        
        if (imageFiles.length < PUBLISH_MEDIA_LIMITS.MAX_IMAGES) {
            imagesPreview.appendChild(_createAddButton(imagesInput, scope));
        }
    }
    
    // ========== 视频相关逻辑 ==========
    
    // 视频文件选择
    videoInput.onchange = async (e) => {
        if (!scope.isCurrent()) return;
        const file = e.target.files?.[0];
        if (!file) return;
        const generation = invalidateVideoSelection();
        const initialCoverGeneration = coverGeneration;
        
        // 格式检查
        const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
        const validExts = ['.mp4', '.webm', '.mov'];
        const isValidType = validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
        if (!isValidType) {
            _showVideoErrorAndReset(t('post.error_video_format'), videoInput);
            return;
        }
        
        // 大小检查
        if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > PUBLISH_MEDIA_LIMITS.VIDEO_MAX_BYTES) {
            _showVideoErrorAndReset(t('post.error_video_size'), videoInput);
            return;
        }
        
        // 时长检查
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        const tempUrl = URL.createObjectURL(file);
        temporaryVideos.set(tempVideo, tempUrl);
        
        tempVideo.onloadedmetadata = () => {
            if (!scope.isCurrent() || generation !== videoGeneration || !temporaryVideos.has(tempVideo)) return;
            const duration = tempVideo.duration;
            releaseVideoMetadata(tempVideo);
            if (!Number.isFinite(duration) || duration <= 0) {
                _showVideoErrorAndReset(t('post.error_video_load'), videoInput);
                return;
            }
            if (duration > PUBLISH_MEDIA_LIMITS.VIDEO_MAX_SECONDS) {
                _showVideoErrorAndReset(t('post.error_video_duration'), videoInput);
                return;
            }
            
            videoDuration = duration;
            videoFile = file;
            if (initialCoverGeneration === coverGeneration) { videoCoverFile = null; currentCoverUrl = ''; }
            if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
            videoObjectUrl = URL.createObjectURL(file);
            currentVideoUrl = '';
            renderVideoPreview();
        };
        
        tempVideo.onerror = () => {
            if (!scope.isCurrent() || generation !== videoGeneration || !temporaryVideos.has(tempVideo)) return;
            releaseVideoMetadata(tempVideo);
            _showVideoErrorAndReset(t('post.error_video_load'), videoInput);
        };
        metadataTimers.set(tempVideo, setTimeout(() => {
            if (temporaryVideos.has(tempVideo)) tempVideo.onerror?.();
        }, PUBLISH_MEDIA_LIMITS.VIDEO_METADATA_TIMEOUT));
        tempVideo.src = tempUrl;
    };
    
    // 渲染视频预览
    function renderVideoPreview() {
        const generation = videoGeneration;
        if (!videoFile && !currentVideoUrl) {
            videoEmptyState.style.display = 'flex';
            videoPlayerWrap.style.display = 'none';
            videoPreviewArea.style.borderStyle = 'dashed';
            videoPreviewArea.style.cursor = 'pointer';
            setPublishFilePickerAction(videoPreviewArea, () => { if (scope.isCurrent()) videoInput.click(); });
            return;
        }
        
        videoEmptyState.style.display = 'none';
        videoPlayerWrap.style.display = 'block';
        videoPreviewArea.style.borderStyle = 'solid';
        videoPreviewArea.style.cursor = 'default';
        setPublishFilePickerAction(videoPreviewArea, null);
        
        const src = videoObjectUrl || currentVideoUrl;
        videoPlayer.src = src;
        
        if (videoFile) {
            videoNameEl.textContent = videoFile.name;
            videoMetaEl.textContent = `${formatFileSize(videoFile.size)} · ${Math.round(videoDuration)} ${t('common.seconds')}`;
        } else if (currentVideoUrl) {
            videoNameEl.textContent = t('post.existing_video');
            videoMetaEl.textContent = '';
        }
        
        // 自动生成封面（首次加载视频数据时）
        videoPlayer.onloadeddata = async () => {
            if (!scope.isCurrent() || generation !== videoGeneration) return;
            if (!videoCoverFile && !currentCoverUrl && !manualCoverController) {
                const coverRequest = ++coverGeneration;
                const cover = await generateCoverFromVideo(videoPlayer);
                if (!scope.isCurrent() || generation !== videoGeneration || coverRequest !== coverGeneration) return;
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
        manualCoverController?.abort();
        coverController?.abort();
        const controller = new AbortController(); coverController = controller;
        const cancel = () => controller.abort();
        if (scope.confirmationSignal.aborted) cancel();
        else scope.confirmationSignal.addEventListener('abort', cancel, { once: true });
        try {
            return await capturePublishVideoFrame(videoEl, { signal: controller.signal });
        } catch (err) {
            if (!scope.isCurrent() || err?.name === 'AbortError') return null;
            console.error('帖子封面生成失败');
            return null;
        } finally {
            scope.confirmationSignal.removeEventListener('abort', cancel);
            if (coverController === controller) coverController = null;
        }
    }

    // 删除视频
    btnRemoveVideo.onclick = (e) => {
        if (!scope.isCurrent()) return;
        e.stopPropagation();
        invalidateVideoSelection();
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
        if (!scope.isCurrent()) return;
        e.stopPropagation();
        if (!videoPlayer.videoWidth) {
            showToast(t('post.error_video_not_ready'), "warning");
            return;
        }
        const generation = videoGeneration, coverRequest = ++coverGeneration;
        const cover = await generateCoverFromVideo(videoPlayer);
        if (!scope.isCurrent() || generation !== videoGeneration || coverRequest !== coverGeneration) return;
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
        if (!scope.isCurrent()) return;
        e.stopPropagation();
        coverInput.click();
    };
    
    coverInput.onchange = async (e) => {
        if (!scope.isCurrent() || manualCoverController || imageSelectionController) return;
        const file = e.target.files?.[0];
        coverInput.value = '';
        if (!file) return;
        const generation = videoGeneration, request = ++coverGeneration;
        coverController?.abort(); coverController = null;
        const controller = new AbortController(); manualCoverController = controller;
        const cancel = () => controller.abort();
        if (scope.confirmationSignal.aborted) cancel();
        else scope.confirmationSignal.addEventListener('abort', cancel, { once: true });
        const wasInputDisabled = coverInput.disabled, wasSubmitDisabled = submitBtn.disabled;
        coverInput.disabled = true; submitBtn.disabled = true;
        coverInput.setAttribute('aria-busy', 'true');
        try {
            const cover = await compressImage(file, { signal: controller.signal });
            if (!scope.isCurrent() || controller.signal.aborted || generation !== videoGeneration || request !== coverGeneration) return;
            videoCoverFile = cover;
            currentCoverUrl = '';
            renderCoverThumb();
        } catch (error) {
            if (!scope.isCurrent() || controller.signal.aborted || generation !== videoGeneration || request !== coverGeneration) return;
            showToast(t('post.image_invalid_file'), "warning");
        } finally {
            scope.confirmationSignal.removeEventListener('abort', cancel);
            if (manualCoverController === controller) manualCoverController = null;
            if (scope.isCurrent()) {
                coverInput.disabled = wasInputDisabled; submitBtn.disabled = wasSubmitDisabled;
                coverInput.removeAttribute('aria-busy');
            }
        }
    };
    
    // 阻止视频区域的拖拽冒泡到 ComfyUI 画布
    videoPreviewArea.ondragenter = (e) => {
        if (!scope.isCurrent()) return;
        e.stopPropagation();
    };
    videoPreviewArea.ondragover = (e) => {
        if (!scope.isCurrent()) return;
        e.stopPropagation();
    };
    videoPreviewArea.ondrop = (e) => {
        if (!scope.isCurrent()) return;
        e.stopPropagation();
    };
    videoPlayer.ondragenter = (e) => {
        if (!scope.isCurrent()) return;
        e.stopPropagation();
    };
    videoPlayer.ondragover = (e) => {
        if (!scope.isCurrent()) return;
        e.stopPropagation();
    };
    videoPlayer.ondrop = (e) => {
        if (!scope.isCurrent()) return;
        e.stopPropagation();
    };
    
    // ========== 提交发布/保存 ==========
    const fieldErrors = createPublishFieldErrors([titleInput, contentInput], scope.confirmationSignal);
    scope.addCleanup(fieldErrors.dispose);
    let submissionPhase = 'idle';
    submitBtn.onclick = async () => {
        if (!scope.isCurrent()) return;
        if (submissionPhase !== 'idle' || imageSelectionController || manualCoverController) return;
        fieldErrors.clearAll();
        let saveAttempted = false, committed = false, outcomeUnknown = false;
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        const isOriginal = isOriginalCheckbox?.checked || false;
        // 一次提交只使用点击时的内容和媒体，异步等待不再读取可变编辑状态。
        const submission = Object.freeze({
            postMode: postMode,
            imageFiles: Object.freeze([...imageFiles]),
            existingImageUrls: Object.freeze([...existingImageUrls]),
            videoFile: videoFile,
            videoCoverFile: videoCoverFile,
            currentVideoUrl: currentVideoUrl,
            currentCoverUrl: currentCoverUrl,
            targetId: editPostData?.id
        });
        
        if (submission.postMode === 'video') {
            // 视频模式校验
            if (!title) {
                fieldErrors.show(titleInput, t('post.error_no_title'));
                return;
            }
            if (!content) {
                fieldErrors.show(contentInput, t('post.error_no_content'));
                return;
            }
            if (!submission.videoFile && !submission.currentVideoUrl) {
                showToast(t('post.error_no_video'), "warning");
                return;
            }
            if (!submission.videoCoverFile && !submission.currentCoverUrl) {
                showToast(t('post.error_no_cover'), "warning");
                return;
            }
            
            if (!scope.begin()) return;
            submissionPhase = 'submitting';
        editingLock.lock();
            try {
                submitBtn.disabled = true;
                
                // 上传封面
                let coverUrl = submission.currentCoverUrl;
                if (submission.videoCoverFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_cover')}`;
                    const res = await api.uploadFile(submission.videoCoverFile, "post");
                    if (!scope.isCurrent()) return;
                    coverUrl = requirePostUpload(res);
                }
                
                // 上传视频（带进度的 XMLHttpRequest）
                let videoUrl = submission.currentVideoUrl;
                if (submission.videoFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_video')} 0%`;
                    const res = await uploadVideoWithProgress(submission.videoFile, (percent) => {
                        if (scope.isCurrent()) submitBtn.textContent = `⏳ ${t('post.uploading_video')} ${percent}%`;
                    }, { signal: scope.confirmationSignal });
                    if (!scope.isCurrent()) return;
                    videoUrl = requirePostUpload(res);
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
                    saveAttempted = true;
                    const result = await api.updatePost(submission.targetId, payload);
                    if (!scope.isCurrent()) return;
                    confirmPostSave(result, true);
                    committed = true;
                    showToast(t('post.edit_success'), "success");
                } else {
                    payload.author = account;
                    saveAttempted = true;
                    const result = await api.createPost(payload, { publicationId: scope.publicationId });
                    if (!scope.isCurrent()) return;
                    confirmPostSave(result, false);
                    committed = true;
                    showToast(t('post.publish_success'), "success");
                }
                
                clearPostListCache();
                window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload"));
                window.dispatchEvent(new CustomEvent("comfy-route-back"));
                
            } catch (err) {
                if (!scope.isCurrent() || committed) return;
                outcomeUnknown = saveAttempted && ![400, 401, 403, 404, 409, 422, 429].includes(err?.status);
                showToast(t(outcomeUnknown ? 'publish.save_unconfirmed' : (isEditMode ? 'post.edit_failed' : 'post.publish_failed')),
                    outcomeUnknown ? 'warning' : 'error');
            } finally {
                if (!scope.isCurrent()) return;
                scope.finish(committed, outcomeUnknown);
            if (!committed && !outcomeUnknown) editingLock.unlock();
                submissionPhase = committed ? 'committed' : (outcomeUnknown ? 'unconfirmed' : 'idle');
                submitBtn.disabled = committed || outcomeUnknown;
                submitBtn.textContent = outcomeUnknown ? t('publish.result_pending') : `🚀 ${isEditMode ? t('task.save_changes') : t('common.publish')}`;
            }
            
            return;
        }
        
        // ========== 图文模式（原有逻辑完全保留） ==========
        const totalImages = submission.existingImageUrls.length + submission.imageFiles.length;
        if (totalImages === 0) {
            showToast(t('post.error_no_image'), "warning");
            return;
        }
        if (!title) {
            fieldErrors.show(titleInput, t('post.error_no_title'));
            return;
        }
        
        if (!scope.begin()) return;
        submissionPhase = 'submitting';
        editingLock.lock();
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = `⏳ ${t('post.compressing_images')}...`;
            
            const compressedFiles = [];
            for (let i = 0; i < submission.imageFiles.length; i++) {
                submitBtn.textContent = `🖼️ ${t('post.compressing_progress', { current: i + 1, total: submission.imageFiles.length })}...`;
                const compressed = await compressImage(submission.imageFiles[i], { signal: scope.confirmationSignal });
                if (!scope.isCurrent()) return;
                compressedFiles.push(compressed);
            }
            
            const uploadedUrls = [];
            for (let i = 0; i < compressedFiles.length; i++) {
                submitBtn.textContent = `⏳ ${t('post.uploading_progress', { current: i + 1, total: compressedFiles.length })}...`;
                const res = await api.uploadFile(compressedFiles[i], "post");
                if (!scope.isCurrent()) return;
                uploadedUrls.push(requirePostUpload(res));
            }
            
            const allImages = [...submission.existingImageUrls, ...uploadedUrls];
            
            if (isEditMode) {
                submitBtn.textContent = `⏳ ${t('common.saving')}...`;
                saveAttempted = true;
                const result = await api.updatePost(submission.targetId, {
                    title,
                    content,
                    cover_image: allImages[0],
                    images: allImages,
                    is_original: isOriginal
                });
                if (!scope.isCurrent()) return;
                confirmPostSave(result, true);
                committed = true;
                showToast(t('post.edit_success'), "success");
            } else {
                submitBtn.textContent = `⏳ ${t('post.publishing')}...`;
                saveAttempted = true;
                const result = await api.createPost({
                    title,
                    content,
                    cover_image: allImages[0],
                    images: allImages,
                    author: account,
                    is_original: isOriginal
                }, { publicationId: scope.publicationId });
                if (!scope.isCurrent()) return;
                confirmPostSave(result, false);
                committed = true;
                showToast(t('post.publish_success'), "success");
            }
            
            clearPostListCache();
            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload"));
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
            
        } catch (err) {
            if (!scope.isCurrent() || committed) return;
            outcomeUnknown = saveAttempted && ![400, 401, 403, 404, 409, 422, 429].includes(err?.status);
            showToast(t(outcomeUnknown ? 'publish.save_unconfirmed' : (isEditMode ? 'post.edit_failed' : 'post.publish_failed')),
                outcomeUnknown ? 'warning' : 'error');
        } finally {
            if (!scope.isCurrent()) return;
            scope.finish(committed, outcomeUnknown);
            if (!committed && !outcomeUnknown) editingLock.unlock();
            submissionPhase = committed ? 'committed' : (outcomeUnknown ? 'unconfirmed' : 'idle');
            submitBtn.disabled = committed || outcomeUnknown;
            submitBtn.textContent = outcomeUnknown ? t('publish.result_pending') : `🚀 ${isEditMode ? t('task.save_changes') : t('common.publish')}`;
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
    
    scope.addCleanup(bindPublishFilePicker(imagesPreview, imagesInput, t('post.upload_images'), scope.confirmationSignal));
    scope.addCleanup(bindPublishFilePicker(videoPreviewArea, videoInput, t('post.upload_video'), scope.confirmationSignal));
    coverInput.setAttribute('aria-label', t('post.upload_cover'));

    return container;
}
