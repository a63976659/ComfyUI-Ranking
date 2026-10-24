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

import { createPublishFieldErrors } from "../market/发布字段错误.js";
import { bindPublishFilePicker, setPublishFilePickerAction } from "../market/发布文件选择可访问性.js";
import { compressPublishImage as compressImage, capturePublishVideoFrame } from "../market/有界图片处理.js";
import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { t, tIfExists } from "../components/用户体验增强.js";
import { removeCacheByPrefix } from "../components/性能优化工具.js";
import { createPublishEditingLock } from "../market/发布编辑锁.js";
import { createPublishSubmissionScope } from "../market/发布提交生命周期.js";
import { parsePromptPrice, validatePromptPriceInput } from "./价格校验.js";
import { areKeyboardShortcutsEnabled, API, CACHE, PUBLISH_MEDIA_LIMITS, IMAGE_PROCESS, PROMPT_LIMITS } from "../core/全局配置.js";
import { escapeHtml } from "../components/互动工具函数.js";  // 🧹 P2归一：局部副本已移除

function requirePromptUpload(result) {
    if (result?.status !== 'success' || typeof result.url !== 'string' || !result.url.trim()) {
        throw new Error('Unconfirmed prompt upload');
    }
    return result.url;
}

function confirmPromptSave(result, isEditMode) {
    if (result?.status !== 'success' || (!isEditMode &&
        (typeof result.data?.id !== 'string' || !result.data.id.trim()))) {
        throw new Error('Unconfirmed prompt save');
    }
}

// 📦 清除提示词列表缓存（前缀扫描，覆盖全部 类型/分类/排序 组合）
function clearPromptsListCache() {
    // 🔧 改用缓存模块的前缀删除原语：原先手写的 localStorage 扫描 + removeCache 组合
    // 与 removeCacheByPrefix 等价（同样内存 + localStorage 两级清除，且同样能匹配不带
    // CACHE.PREFIX 的裸键），统一收口避免各发布组件各写一遍易漏清内存的遍历
    removeCacheByPrefix('PromptsCache');
    // 🔧 修复：API 层缓存键带完整查询串（api_/api/prompts?type=..&category=..&sort=..），
    // 原先的 removeCache 精确删除命中不到（no-op），改用前缀删除
    removeCacheByPrefix('api_/api/prompts');
    console.log('🗑️ 已清除提示词列表缓存');
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
                    requirePromptUpload(result);
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
 * 📐 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ===== 多图预览与拖拽排序（参考讨论区发布界面） =====

// 清除所有拖拽插入指示线
function _clearDragIndicators(wrappers) {
    wrappers.forEach(w => {
        w.removeAttribute('data-prompt-drop');
    });
}

// 创建图片区域「+」添加按钮
function _createAddButton(imagesInput, scope) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.setAttribute("aria-label", t("post.upload_images"));
    addBtn.setAttribute("data-file-picker-button", "");
    addBtn.className = "prompt-publish__add";
    addBtn.textContent = "+";
    addBtn.onclick = (e) => {
        if (!scope.isCurrent() || imagesInput.disabled) return;
        e.stopPropagation();
        imagesInput.click();
    };
    return addBtn;
}

// 创建删除按钮点击处理器（停止冒泡 + 执行回调）
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
            wrapper.setAttribute('data-prompt-cover', String(idx === 0));
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
        wrapper.className = "prompt-publish__image";

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
            wrapper.setAttribute('data-prompt-dragging', 'true');
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
            wrapper.setAttribute('data-prompt-drop', 'true');
        };

        wrapper.ondragleave = () => {
            wrapper.removeAttribute('data-prompt-drop');
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
            endWrappers.forEach(w => { w.removeAttribute('data-prompt-dragging'); });
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

    container.classList.add("ranking-publish-form", "prompt-publish");
    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div class="ranking-publish-header">
            <div class="ranking-publish-heading">
                <button type="button" id="btn-back-publish-prompt" class="ranking-publish-back">
                    ⬅ ${t('common.back')}
                </button>
                <span class="ranking-publish-title">🧩 ${isEditMode ? t('prompt.edit_title') : t('prompt.publish_title')}</span>
            </div>
        </div>

        <!-- 表单内容 -->
        <div class="ranking-publish-body">
            <!-- 类型切换（图像/视频提示词） -->
            <div class="prompt-publish__field">
                <label class="prompt-publish__label">🎯 ${t('prompt.type_label')}</label>
                <div role="group" aria-label="${t('prompt.type_label')}" class="prompt-publish__types">
                    <button type="button" id="ptype-image" class="prompt-publish__type">
                        🎨 ${t('prompt.tab_image')}
                    </button>
                    <button type="button" id="ptype-video" class="prompt-publish__type">
                        🎬 ${t('prompt.tab_video')}
                    </button>
                    <button type="button" id="ptype-music" class="prompt-publish__type">
                        🎵 ${t('prompt.tab_music')}
                    </button>
                </div>
            </div>

            <!-- 分类选择 -->
            <div class="prompt-publish__field">
                <label for="category-select" class="prompt-publish__label">🏷️ ${t('prompt.category_label')} <span class="prompt-publish__required ranking-required-marker"></span></label>
                <select id="category-select" class="ranking-publish-input prompt-publish__select">
                    <option value="">${t('prompt.category_select')}</option>
                </select>
            </div>

            <!-- 🏷️ 标签（自定义 + 推荐快加 + 搜索过滤） -->
            <div class="prompt-publish__field">
                <label for="tag-input" class="prompt-publish__label">🔖 ${t('prompt.tag_label')}</label>
                <div id="tags-selected" class="prompt-publish__tags"></div>
                <input type="text" id="tag-input" class="ranking-publish-input" placeholder="${t('prompt.tag_placeholder')}" maxlength="12">
                <div class="prompt-publish__hint">${t('prompt.tag_recommend')}</div>
                <div id="tag-recommend-list" class="prompt-publish__recommendations"></div>
            </div>

            <!-- 标题输入 -->
            <div class="prompt-publish__field">
                <label for="title-input" class="prompt-publish__label">📝 ${t('prompt.title_label')} <span class="prompt-publish__required ranking-required-marker"></span></label>
                <input type="text" id="title-input" class="ranking-publish-input" value="${escapeAttr(editTitle)}" placeholder="${t('prompt.title_placeholder')}" maxlength="50">
                <div class="prompt-publish__count">
                    <span id="title-count">${editTitle.length}</span>/50
                </div>
            </div>

            <!-- 文案/简介输入 -->
            <div class="prompt-publish__field">
                <label for="content-input" class="prompt-publish__label">✍️ ${t('prompt.content_label')} <span class="prompt-publish__required ranking-required-marker"></span></label>
                <textarea id="content-input" class="ranking-publish-input prompt-publish__description" placeholder="${t('prompt.content_placeholder')}" maxlength="2000">${escapeHtml(editContent)}</textarea>
                <div class="prompt-publish__count">
                    <span id="content-count">${editContent.length}</span>/2000
                </div>
            </div>

            <!-- 提示词正文（付费内容） -->
            <div class="prompt-publish__field">
                <label for="text-input" class="prompt-publish__label">🔑 ${t('prompt.text_label')} <span class="prompt-publish__required ranking-required-marker"></span></label>
                <textarea id="text-input" class="ranking-publish-input prompt-publish__text" placeholder="${t('prompt.text_placeholder')}" maxlength="20000">${escapeHtml(editText)}</textarea>
                <div class="prompt-publish__count">
                    <span id="text-count">${editText.length}</span>/20000
                </div>
            </div>

            <!-- 价格设置 -->
            <div class="prompt-publish__field">
                <label for="price-input" class="prompt-publish__label">💎 ${t('prompt.price_label')}</label>
                <input type="number" id="price-input" class="ranking-publish-input" value="${escapeHtml(String(editPrice))}" min="0" max="${PROMPT_LIMITS.MAX_PRICE}" step="1" aria-describedby="price-error">
                <div id="price-error" role="alert" hidden class="prompt-publish__error"></div>
            </div>

            <!-- 原创作品勾选（参考讨论区） -->
            <div class="prompt-publish__original">
                <label class="prompt-publish__checkbox">
                    <input type="checkbox" id="is-original-checkbox" ${editIsOriginal ? 'checked' : ''} class="prompt-publish__check" />
                    <span class="prompt-publish__copy">🎨 ${t('publish.mark_as_original')}</span>
                </label>
                <div class="prompt-publish__checkbox-hint">
                    ${t('publish.original_default_hint')}
                </div>
            </div>

            <!-- 图片上传区（图像提示词专用：多图 + 拖拽排序，首张为封面） -->
            <div id="image-upload-section" class="prompt-publish__field">
                <label class="prompt-publish__label">🖼️ ${t('post.upload_images')} <span class="prompt-publish__required ranking-required-marker"></span>
                    <span class="prompt-publish__optional">（${t('post.max_9_images')}）</span>
                </label>
                <input type="file" id="images-input" accept="image/*" multiple style="display: none;">
                <div id="images-preview" class="prompt-publish__images">
                    <div class="prompt-publish__empty">
                        <div class="prompt-publish__empty-icon">📷</div>
                        ${t('post.click_upload')}
                    </div>
                </div>
            </div>

            <!-- 视频上传区（视频提示词专用：截取当前帧或手动上传封面） -->
            <div id="video-upload-section" style="display: none;" class="prompt-publish__media-section">
                <label class="prompt-publish__label">🎬 ${t('prompt.video_label')} <span id="video-required-mark" class="prompt-publish__required ranking-required-marker"></span><span id="video-optional-mark" style="display: none;" class="prompt-publish__optional">${t('prompt.optional_mark')}</span></label>
                <input type="file" id="video-input" accept="video/mp4,video/webm,video/quicktime" style="display: none;">
                <div id="video-preview-area" class="prompt-publish__media">
                    <div id="video-empty-state" class="prompt-publish__empty">
                        <div class="prompt-publish__empty-icon">🎬</div>
                        ${t('post.click_upload_video')}
                    </div>
                    <div id="video-player-wrap" style="display: none;">
                        <video id="video-player" controls class="prompt-publish__video"></video>
                        <div class="prompt-publish__media-meta">
                            <div class="prompt-publish__meta-copy">
                                <div id="video-name"></div>
                                <div id="video-meta"></div>
                            </div>
                            <button type="button" aria-label="${t('common.delete')} ${t('prompt.video_label')}" id="btn-remove-video" class="prompt-publish__remove-media">×</button>
                        </div>
                        <!-- 封面区域（截取当前帧 / 手动上传） -->
                        <div id="video-cover-wrap" style="display: none;" class="prompt-publish__cover-section">
                            <div class="prompt-publish__cover-title">${t('post.video_cover')}</div>
                            <div class="ranking-publish-cover-controls">
                                <div class="prompt-publish__cover-frame">
                                    <img id="cover-thumb" src="" style="display: none;" class="prompt-publish__cover-image">
                                    <span id="cover-label" style="display: none;" class="prompt-publish__cover-badge">${t('post.cover')}</span>
                                </div>
                                <div class="prompt-publish__cover-actions">
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

            <!-- 🎵 音频上传区（音乐提示词专用：图片+音频方案，视频可选） -->
            <div id="audio-upload-section" style="display: none;" class="prompt-publish__media-section">
                <label class="prompt-publish__label">🎵 ${t('prompt.audio_label')} <span class="prompt-publish__required ranking-required-marker"></span></label>
                <div class="prompt-publish__media-hint">${t('prompt.music_media_hint')}</div>
                <input type="file" id="audio-input" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg" style="display: none;">
                <div id="audio-preview-area" class="prompt-publish__media">
                    <div id="audio-empty-state" class="prompt-publish__empty">
                        <div class="prompt-publish__empty-icon">🎵</div>
                        ${t('post.click_upload_audio')}
                    </div>
                    <div id="audio-player-wrap" style="display: none;">
                        <audio id="audio-player" controls class="prompt-publish__audio"></audio>
                        <div class="prompt-publish__media-meta">
                            <div class="prompt-publish__meta-copy">
                                <div id="audio-name"></div>
                                <div id="audio-meta"></div>
                            </div>
                            <button type="button" aria-label="${t('common.delete')} ${t('prompt.audio_label')}" id="btn-remove-audio" class="prompt-publish__remove-media">×</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 提示信息 -->
            <div class="prompt-publish__notice">
                💡 <strong>${t('prompt.notice_title')}：</strong><br>
                • ${t('prompt.notice_1')}<br>
                • ${t('prompt.notice_2')}<br>
                • ${t('prompt.notice_3')}
            </div>

            <!-- 确认发布按钮 -->
            <button type="button" id="btn-submit-prompt" class="prompt-publish__submit">
                ${isEditMode ? '💾' : '🚀'} ${isEditMode ? t('prompt.save_submit') : t('prompt.publish_submit')}
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
    let categoryGeneration = 0;
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
    const priceError = container.querySelector("#price-error");
    priceInput.addEventListener("input", () => {
        if (!scope.isCurrent()) return;
        if (parsePromptPrice(priceInput.value) !== null) {
            priceError.hidden = true;
            priceError.textContent = "";
            priceInput.removeAttribute("aria-invalid");
        }
    });
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
    const editingLock = createPublishEditingLock(container, [submitBtn, container.querySelector("#btn-back-publish-prompt")]);
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
        for (const url of [videoObjectUrl, coverObjectUrl, audioObjectUrl]) if (url) URL.revokeObjectURL(url);
        videoObjectUrl = coverObjectUrl = audioObjectUrl = null;
        imageFiles = []; existingImageUrls = [];
        videoFile = videoCoverFile = audioFile = null; currentVideoUrl = currentCoverUrl = currentAudioUrl = '';
        selectedTags = []; recommendTags = [];
        try { audioPlayer.pause(); audioPlayer.removeAttribute('src'); audioPlayer.load(); } catch {}
        container.querySelectorAll('input, textarea, select').forEach(input => { input.value = ''; input.disabled = true; });
        container.querySelectorAll('button').forEach(button => { button.disabled = true; });
        const status = document.createElement('p'); status.setAttribute('role', 'status');
        status.textContent = t('auth.session_changed'); container.replaceChildren(status);
    });


    // 防止图片预览区拖拽冒泡到 ComfyUI 画布
    if (imagesPreview) {
        imagesPreview.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
        imagesPreview.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });
    }

    // ========== 返回按钮（有未保存内容时提醒确认） ==========
    container.querySelector("#btn-back-publish-prompt").onclick = async () => {
        if (!scope.isCurrent()) return;
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
                    type: 'warning', signal: scope.confirmationSignal
                }
            );
            if (!scope.isCurrent() || !confirmed) return;
        }

        scope.dispose();
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    // ========== 字数统计 ==========
    titleInput.oninput = () => {
        if (!scope.isCurrent()) return; container.querySelector("#title-count").textContent = titleInput.value.length; };
    contentInput.oninput = () => {
        if (!scope.isCurrent()) return; container.querySelector("#content-count").textContent = contentInput.value.length; };
    textInput.oninput = () => {
        if (!scope.isCurrent()) return; container.querySelector("#text-count").textContent = textInput.value.length; };

    // ========== 类型切换 ==========
    function updateTypeUI() {
        for (const [button, type] of [[ptypeImageBtn, 'image'], [ptypeVideoBtn, 'video'], [ptypeMusicBtn, 'music']]) button.setAttribute('aria-pressed', String(promptType === type));
        // 图像区：图像提示词 + 音乐提示词（图片+音频方案）；视频区：视频/音乐；音频区：仅音乐
        imageSection.style.display = promptType === 'video' ? 'none' : 'block';
        videoSection.style.display = promptType === 'image' ? 'none' : 'block';
        audioSection.style.display = promptType === 'music' ? 'block' : 'none';
        // 音乐提示词的视频为可选项
        videoRequiredMark.style.display = promptType === 'music' ? 'none' : 'inline';
        videoOptionalMark.style.display = promptType === 'music' ? 'inline' : 'none';
    }

    function switchPromptType(type) {
        if (!scope.isCurrent()) return;
        if (promptType === type) return;
        fieldErrors.clearAll();
        imageSelectionController?.abort();
        invalidateVideoSelection();
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
        invalidateVideoSelection();
        videoFile = null;
        videoCoverFile = null;
        videoDuration = 0;
        if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
        currentVideoUrl = '';
        currentCoverUrl = '';
        renderVideoPreview();
    }

    function clearMusicImageAudioState() {
        imageSelectionController?.abort();
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
        const generation = ++categoryGeneration, requestType = promptType;
        categorySelect.innerHTML = `<option value="">${t('prompt.category_select')}</option>`;
        try {
            const res = await api.getPromptCategories(requestType);
            if (!scope.isCurrent() || generation !== categoryGeneration || requestType !== promptType) return;
            const categories = Array.isArray(res) ? res : res?.data;
            if (!Array.isArray(categories) || categories.some(cat => typeof cat !== 'string' || !cat.trim()) ||
                (res?.status !== undefined && res.status !== 'success')) {
                throw new Error('Invalid prompt categories');
            }
            categorySelect.innerHTML = `<option value="">${t('prompt.category_select')}</option>`;
            categories.forEach(cat => {
                const opt = document.createElement("option");
                opt.value = cat;
                opt.textContent = tIfExists('promptcat.' + cat, cat);
                if (cat === editCategory && requestType === editType && !categoriesLoaded) opt.selected = true;
                categorySelect.appendChild(opt);
            });
            if (requestType === editType) categoriesLoaded = true;
        } catch (err) {
            if (!scope.isCurrent() || generation !== categoryGeneration || requestType !== promptType) return;
            console.error("提示词分类加载失败");
            showToast(t('prompt.category_load_failed'), "warning");
        }
    }

    // ========== 标签管理（自定义 + 推荐快加 + 搜索过滤） ==========
    function restoreTagFocus(hadFocus, parent, index) {
        if (!hadFocus || !scope.isCurrent() || document.activeElement !== document.body) return;
        const controls = parent.querySelectorAll("button");
        const target = controls[Math.min(index, controls.length - 1)] || tagInput;
        if (target.isConnected) target.focus({ preventScroll: true });
    }

    function renderSelectedTags() {
        tagsSelectedEl.innerHTML = "";
        selectedTags.forEach((tag, index) => {
            const chip = document.createElement("span");
            chip.className = "prompt-publish__tag";
            chip.textContent = "#" + tag;
            const rm = document.createElement("button");
            rm.textContent = "×";
            rm.className = "prompt-publish__remove-tag";
            rm.type = "button";
            rm.setAttribute("aria-label", `${t("common.delete")} ${tag}`);
            rm.onclick = () => {
                if (!scope.isCurrent() || rm.disabled || !rm.isConnected || !tagsSelectedEl.contains(rm)) return;
                const hadFocus = document.activeElement === rm;
                selectedTags = selectedTags.filter(x => x !== tag);
                renderSelectedTags();
                renderRecommendTags();
                restoreTagFocus(hadFocus, tagsSelectedEl, index);
            };
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
            tagRecommendList.innerHTML = `<span class="prompt-publish__muted">${t('prompt.tag_no_recommend')}</span>`;
            return;
        }
        list.forEach((name, index) => {
            const chip = document.createElement("button");
            chip.className = "prompt-publish__tag";
            chip.type = "button";
            chip.textContent = "+ " + name;
            chip.onclick = () => {
                if (!scope.isCurrent() || chip.disabled || !chip.isConnected || !tagRecommendList.contains(chip)) return;
                const hadFocus = document.activeElement === chip;
                addTag(name);
                restoreTagFocus(hadFocus, tagRecommendList, index);
            };
            tagRecommendList.appendChild(chip);
        });
    }

    function addTag(name) {
        if (!scope.isCurrent()) return;
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
        if (!scope.isCurrent() || e.defaultPrevented || e.key !== "Enter"
            || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey
            || e.isComposing || e.keyCode === 229 || e.repeat
            || tagInput.disabled || tagInput.readOnly) return;
        e.preventDefault(); addTag(tagInput.value);
    };
    tagInput.oninput = () => { if (scope.isCurrent()) renderRecommendTags(); };

    async function loadRecommendTags() {
        try {
            const res = await api.getPromptTags();
            if (!scope.isCurrent()) return;
            recommendTags = res.data || res || [];
            renderRecommendTags();
        } catch (err) {
            if (!scope.isCurrent()) return;
            console.error("提示词推荐标签加载失败");
        }
    }

    // ========== 多图上传（图像提示词专用：最多9张 + 拖拽排序，首张为封面） ==========
    imagesInput.onchange = async (e) => {
        if (!scope.isCurrent() || imageSelectionController || manualCoverController) return;
        const files = Array.from(e.target.files);
        imagesInput.value = '';
        const totalImages = existingImageUrls.length + imageFiles.length;
        const remaining = PUBLISH_MEDIA_LIMITS.MAX_IMAGES - totalImages;

        if (remaining <= 0) {
            showToast(t('post.max_9_images'), "warning");
            imagesInput.value = '';
            return;
        }

        const toAdd = files.slice(0, remaining);
        imagesInput.value = '';
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
        } finally {
            scope.confirmationSignal.removeEventListener('abort', cancel);
            if (imageSelectionController === controller) imageSelectionController = null;
            if (scope.isCurrent()) {
                imagesInput.disabled = inputDisabled; submitBtn.disabled = submitDisabled;
                imagesInput.removeAttribute('aria-busy');
            }
        }
    };

    // 渲染已有图片预览（编辑模式：已有URL与新文件混排）
    function renderExistingImagePreviews() {
        const generation = beginImagePreviews();
        const totalImages = existingImageUrls.length + imageFiles.length;

        if (totalImages === 0) {
            imagesPreview.innerHTML = `
                <div class="prompt-publish__empty">
                    <div class="prompt-publish__empty-icon">📷</div>
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
            wrapper.className = "prompt-publish__image";

            wrapper.innerHTML = `
                <img src="${escapeAttr(url)}" class="prompt-publish__thumbnail">
                ${idx === 0 ? `<span class="prompt-publish__cover-badge cover-label">${t('post.cover')}</span>` : ''}
                <button type="button" data-action="remove" data-existing-idx="${idx}" class="prompt-publish__remove-image">×</button>
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
            wrapper.className = "prompt-publish__image";
            wrapper.innerHTML = `
                <img src="" class="prompt-publish__thumbnail">
                ${existingImageUrls.length === 0 && idx === 0 ? `<span class="prompt-publish__cover-badge cover-label">${t('post.cover')}</span>` : ''}
                <button type="button" data-action="remove" data-idx="${idx}" class="prompt-publish__remove-image">×</button>
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
                <div class="prompt-publish__empty">
                    <div class="prompt-publish__empty-icon">📷</div>
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
            wrapper.className = "prompt-publish__image";

            wrapper.innerHTML = `
                <img src="" class="prompt-publish__thumbnail">
                ${idx === 0 ? `<span class="prompt-publish__cover-badge cover-label">${t('post.cover')}</span>` : ''}
                <button type="button" data-action="remove" data-idx="${idx}" class="prompt-publish__remove-image">×</button>
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

    // ========== 视频上传（视频提示词专用：截帧封面 / 手动上传封面） ==========
    videoInput.onchange = (e) => {
        if (!scope.isCurrent()) return;
        const file = e.target.files?.[0];
        if (!file) return;
        const generation = invalidateVideoSelection();
        const initialCoverGeneration = coverGeneration;

        const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
        const validExts = ['.mp4', '.webm', '.mov'];
        const isValidType = validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
        if (!isValidType) {
            showToast(t('post.error_video_format'), "warning");
            videoInput.value = '';
            return;
        }

        if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > PUBLISH_MEDIA_LIMITS.VIDEO_MAX_BYTES) {
            showToast(t('post.error_video_size'), "warning");
            videoInput.value = '';
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
                showToast(t('post.error_video_load'), "warning");
                videoInput.value = '';
                return;
            }
            if (duration > PUBLISH_MEDIA_LIMITS.VIDEO_MAX_SECONDS) {
                showToast(t('post.error_video_duration'), "warning");
                videoInput.value = '';
                return;
            }

            videoDuration = duration;
            // 🎵 音乐二选一：选定视频后自动清空图片+音频
            if (promptType === 'music' && (imageFiles.length || existingImageUrls.length || audioFile || currentAudioUrl)) {
                clearMusicImageAudioState();
                showToast(t('post.media_exclusive'), "info");
            }
            videoFile = file;
            if (initialCoverGeneration === coverGeneration) { videoCoverFile = null; currentCoverUrl = ''; }
            if (videoObjectUrl) { URL.revokeObjectURL(videoObjectUrl); videoObjectUrl = null; }
            videoObjectUrl = URL.createObjectURL(file);
            currentVideoUrl = '';
            renderVideoPreview();
            videoInput.value = '';
        };

        tempVideo.onerror = () => {
            if (!scope.isCurrent() || generation !== videoGeneration || !temporaryVideos.has(tempVideo)) return;
            releaseVideoMetadata(tempVideo);
            showToast(t('post.error_video_load'), "warning");
            videoInput.value = '';
        };
        metadataTimers.set(tempVideo, setTimeout(() => {
            if (temporaryVideos.has(tempVideo)) tempVideo.onerror?.();
        }, PUBLISH_MEDIA_LIMITS.VIDEO_METADATA_TIMEOUT));
        tempVideo.src = tempUrl;
    };

    // 渲染视频预览（首次加载视频数据时自动生成封面）
    function renderVideoPreview() {
        const generation = videoGeneration;
        if (!videoFile && !currentVideoUrl) {
            videoEmptyState.style.display = 'flex';
            videoPlayerWrap.style.display = 'none';
            videoPreviewArea.style.borderStyle = 'dashed';
            videoPreviewArea.style.cursor = 'pointer';
            setPublishFilePickerAction(videoPreviewArea, () => { if (scope.isCurrent()) videoInput.click(); });
            videoCoverWrap.style.display = 'none';
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

    // 从视频元素截取当前帧生成封面
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
            console.error('提示词封面生成失败');
            return null;
        } finally {
            scope.confirmationSignal.removeEventListener('abort', cancel);
            if (coverController === controller) coverController = null;
        }
    }

    // 删除视频
    btnRemoveVideo.onclick = (e) => {
        if (!scope.isCurrent()) return;
        const hadFocus = document.activeElement === btnRemoveVideo;
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
        if (hadFocus && scope.isCurrent() && videoPreviewArea.isConnected &&
            (document.activeElement === btnRemoveVideo || document.activeElement === document.body)) {
            videoPreviewArea.focus({ preventScroll: true });
        }
    };

    // 截取当前帧作为封面
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
    [videoPreviewArea, videoPlayer].forEach(el => {
        el.ondragenter = (e) => e.stopPropagation();
        el.ondragover = (e) => e.stopPropagation();
        el.ondrop = (e) => e.stopPropagation();
    });

    // ========== 🎵 音频上传（音乐提示词专用：图片+音频方案，视频可选） ==========
    audioInput.onchange = (e) => {
        if (!scope.isCurrent()) return;
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
            setPublishFilePickerAction(audioPreviewArea, () => { if (scope.isCurrent()) audioInput.click(); });
            return;
        }

        audioEmptyState.style.display = 'none';
        audioPlayerWrap.style.display = 'block';
        audioPreviewArea.style.borderStyle = 'solid';
        audioPreviewArea.style.cursor = 'default';
        setPublishFilePickerAction(audioPreviewArea, null);

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
        if (!scope.isCurrent()) return;
        const hadFocus = document.activeElement === btnRemoveAudio;
        e.stopPropagation();
        audioFile = null;
        if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
        currentAudioUrl = '';
        audioInput.value = '';
        renderAudioPreview();
        if (hadFocus && scope.isCurrent() && audioPreviewArea.isConnected &&
            (document.activeElement === btnRemoveAudio || document.activeElement === document.body)) {
            audioPreviewArea.focus({ preventScroll: true });
        }
    };

    // 阻止音频区域的拖拽冒泡到 ComfyUI 画布
    audioPreviewArea.ondragenter = (e) => e.stopPropagation();
    audioPreviewArea.ondragover = (e) => e.stopPropagation();
    audioPreviewArea.ondrop = (e) => e.stopPropagation();

    // ========== 提交发布/保存 ==========
    const fieldErrors = createPublishFieldErrors([categorySelect, titleInput, contentInput, textInput], scope.confirmationSignal);
    scope.addCleanup(fieldErrors.dispose);
    let submissionPhase = 'idle';
    submitBtn.onclick = async () => {
        if (!scope.isCurrent()) return;
        if (submissionPhase !== 'idle' || imageSelectionController || manualCoverController) return;
        fieldErrors.clearAll();
        let saveAttempted = false, committed = false, outcomeUnknown = false;
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        const promptText = textInput.value.trim();
        const category = categorySelect.value;
        const isOriginal = isOriginalCheckbox?.checked || false;
        const price = validatePromptPriceInput(priceInput, priceError, t);
        if (price === null) return;
        // 一次提交只使用点击时的内容和媒体，异步等待不再读取可变编辑状态。
        const submission = Object.freeze({
            promptType: promptType,
            imageFiles: Object.freeze([...imageFiles]),
            existingImageUrls: Object.freeze([...existingImageUrls]),
            videoFile: videoFile,
            videoCoverFile: videoCoverFile,
            currentVideoUrl: currentVideoUrl,
            currentCoverUrl: currentCoverUrl,
            audioFile: audioFile,
            currentAudioUrl: currentAudioUrl,
            selectedTags: Object.freeze([...selectedTags]),
            targetId: editPromptData?.id
        });

        // 表单校验（通用）
        if (!category) {
            fieldErrors.show(categorySelect, t('prompt.category_required'));
            return;
        }
        if (!title) {
            fieldErrors.show(titleInput, t('prompt.title_required'));
            return;
        }
        if (!content) {
            fieldErrors.show(contentInput, t('prompt.content_required'));
            return;
        }
        if (!promptText) {
            fieldErrors.show(textInput, t('prompt.text_required'));
            return;
        }

        // 类型专属校验
        // 视频提示词：视频与封面必填
        // 音乐提示词：有视频时封面必填；无视频时图片+音频必填
        if (submission.promptType === 'video') {
            if (!submission.videoFile && !submission.currentVideoUrl) {
                showToast(t('post.error_no_video'), "warning");
                return;
            }
            if (!submission.videoCoverFile && !submission.currentCoverUrl) {
                showToast(t('post.error_no_cover'), "warning");
                return;
            }
        } else if (submission.promptType === 'music') {
            if (submission.videoFile || submission.currentVideoUrl) {
                if (!submission.videoCoverFile && !submission.currentCoverUrl) {
                    showToast(t('post.error_no_cover'), "warning");
                    return;
                }
            } else {
                if (submission.existingImageUrls.length + submission.imageFiles.length === 0) {
                    showToast(t('post.error_no_image'), "warning");
                    return;
                }
                if (!submission.audioFile && !submission.currentAudioUrl) {
                    showToast(t('post.error_no_audio'), "warning");
                    return;
                }
            }
        } else {
            if (submission.existingImageUrls.length + submission.imageFiles.length === 0) {
                showToast(t('post.error_no_image'), "warning");
                return;
            }
        }

        if (!scope.begin()) return;
        submissionPhase = 'submitting';
        editingLock.lock();
        try {
            submitBtn.disabled = true;

            const basePayload = {
                prompt_type: submission.promptType,
                category,
                title,
                content,
                prompt_text: promptText,
                price,
                tags: submission.selectedTags,
                is_original: isOriginal
            };

            let payload;

            // 🎵 音乐提示词未上传视频时走「图片+音频」方案，与图像提示词共用图片上传链路
            const musicAudioMode = submission.promptType === 'music' && !submission.videoFile && !submission.currentVideoUrl;

            if (submission.promptType !== 'image' && !musicAudioMode) {
                // 上传封面（截取帧或手动上传）
                let coverUrl = submission.currentCoverUrl;
                if (submission.videoCoverFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_cover')}`;
                    const res = await api.uploadFile(submission.videoCoverFile, "cover");
                    if (!scope.isCurrent()) return;
                    coverUrl = requirePromptUpload(res);
                }

                // 上传视频（带进度）
                let videoUrl = submission.currentVideoUrl;
                if (submission.videoFile) {
                    submitBtn.textContent = `⏳ ${t('post.uploading_video')} 0%`;
                    const res = await uploadVideoWithProgress(submission.videoFile, (percent) => {
                        if (!scope.isCurrent()) return;
                        submitBtn.textContent = `⏳ ${t('post.uploading_video')} ${percent}%`;
                    }, { signal: scope.confirmationSignal });
                    if (!scope.isCurrent()) return;
                    videoUrl = requirePromptUpload(res);
                }

                payload = {
                    ...basePayload,
                    cover_image: coverUrl,
                    images: [],
                    media_type: 'video',
                    video_url: videoUrl
                };
                // 音乐提示词改走视频方案时清除旧音频
                if (submission.promptType === 'music') payload.audio_url = null;
            } else {
                // 图像提示词 / 音乐提示词（图片+音频）：压缩并上传多图（首张为封面）
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
                    const res = await api.uploadFile(compressedFiles[i], "cover");
                    if (!scope.isCurrent()) return;
                    uploadedUrls.push(requirePromptUpload(res));
                }

                const allImages = [...submission.existingImageUrls, ...uploadedUrls];

                // 🎵 音乐提示词：上传音频
                let audioUrl = null;
                if (musicAudioMode) {
                    if (submission.audioFile) {
                        submitBtn.textContent = `⏳ ${t('post.uploading_audio')}`;
                        const res = await api.uploadFile(submission.audioFile, "post_audio");
                        if (!scope.isCurrent()) return;
                        audioUrl = requirePromptUpload(res);
                    } else {
                        audioUrl = submission.currentAudioUrl;
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
                saveAttempted = true;
                const result = await api.updatePrompt(submission.targetId, payload);
                if (!scope.isCurrent()) return;
                confirmPromptSave(result, true);
                committed = true;
                showToast(t('prompt.update_success'), "success");
            } else {
                saveAttempted = true;
                const result = await api.createPrompt(payload, { publicationId: scope.publicationId });
                if (!scope.isCurrent()) return;
                confirmPromptSave(result, false);
                committed = true;
                showToast(t('prompt.publish_success'), "success");
            }

            clearPromptsListCache();
            window.dispatchEvent(new CustomEvent("comfy-prompts-refresh"));
            window.dispatchEvent(new CustomEvent("comfy-route-back"));

        } catch (err) {
            if (!scope.isCurrent()) return;
            if (committed) return;
            console.error("提示词发布失败");
            outcomeUnknown = saveAttempted && !(err?.requestBodyRejected === true || [400, 401, 403, 404, 409, 422, 429].includes(err?.status));
            showToast(t(outcomeUnknown ? 'publish.save_unconfirmed' : 'prompt.publish_failed'),
                outcomeUnknown ? 'warning' : 'error');
        } finally {
            if (!scope.isCurrent()) return;
            scope.finish(committed, outcomeUnknown);
            if (!committed && !outcomeUnknown) editingLock.unlock();
            submissionPhase = committed ? 'committed' : (outcomeUnknown ? 'unconfirmed' : 'idle');
            submitBtn.disabled = committed || outcomeUnknown;
            submitBtn.textContent = outcomeUnknown ? t('publish.result_pending') : `${isEditMode ? '💾' : '🚀'} ${isEditMode ? t('prompt.save_submit') : t('prompt.publish_submit')}`;
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

    scope.addCleanup(bindPublishFilePicker(imagesPreview, imagesInput, t('post.upload_images'), scope.confirmationSignal));
    scope.addCleanup(bindPublishFilePicker(videoPreviewArea, videoInput, t('post.upload_video'), scope.confirmationSignal));
    coverInput.setAttribute('aria-label', t('post.upload_cover'));
    scope.addCleanup(bindPublishFilePicker(audioPreviewArea, audioInput, t('prompt.audio_label'), scope.confirmationSignal));

    return container;
}

/**
 * 🔒 属性值转义（input value 回填用）
 */
function escapeAttr(str) {
    return escapeHtml(str);
}
