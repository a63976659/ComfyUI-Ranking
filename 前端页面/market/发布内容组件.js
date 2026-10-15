import { validateImageFile } from "./图片文件检查.js";
// 前端页面/market/发布内容组件.js
import { generatePublishHTML } from "./发布内容_UI模板.js";
import { createPublishSubmissionScope } from "./发布提交生命周期.js";
import { handlePublishSubmit } from "./发布内容_提交引擎.js";
import { t } from "../components/用户体验增强.js";
import { showConfirm, showToast } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { escapeHtml, TYPE_RULES, areKeyboardShortcutsEnabled } from "../core/全局配置.js";

// ==========================================
// 📌 模块级常量
// ==========================================

// 📋 四榜发布表单声明式规则：tool 插件榜 / skill Skill榜 / app 工作流 / recommend 推荐榜
// UI 显隐、联动、校验统一读取此配置，避免类型分支散落多处
export { TYPE_RULES };

/**
 * 创建单个图片预览 wrapper 元素
 * @param {string} imgUrl - 图片URL或Base64
 * @param {number} idx - 图片索引（0为封面）
 * @returns {HTMLElement} wrapper DOM元素
 */
function _createImagePreviewWrapper(imgUrl, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ranking-publish__image';
    wrapper.classList.toggle('ranking-publish__image--cover', idx === 0);
    wrapper.innerHTML = `
        <img src="${escapeHtml(imgUrl)}" class="ranking-publish__thumbnail" alt="">
        ${idx === 0 ? `<span class="cover-label ranking-publish__cover-label">${t('post.cover')}</span>` : ''}
        <button type="button" data-action="remove" class="ranking-publish__image-remove" aria-label="${escapeHtml(t('post.remove_image', { index: idx + 1 }))}">×</button>
    `;
    return wrapper;
}

// 🖼️ 编辑模式下回显已有图片的辅助函数
function renderImagePreviews(imageUrls, container) {
    container.innerHTML = '';
    imageUrls.forEach((url, idx) => {
        container.appendChild(_createImagePreviewWrapper(url, idx));
    });
}

// ✅ 更新封面标记：第一张显示绿色边框和"封面"标签
function updateCoverMark(previewContainer) {
    const wrappers = previewContainer.querySelectorAll(':scope > div');
    wrappers.forEach((wrapper, idx) => {
        const img = wrapper.querySelector('img');
        const coverLabel = wrapper.querySelector('.cover-label');
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'group');
        wrapper.setAttribute('aria-label', t('post.image_position', { index: idx + 1, total: wrappers.length }));
        const shortcutsEnabled = areKeyboardShortcutsEnabled();
        wrapper.title = shortcutsEnabled ? t('post.image_move_hint') : t('post.image_drag_hint');
        if (shortcutsEnabled) wrapper.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');
        else wrapper.removeAttribute('aria-keyshortcuts');
        const removeBtn = wrapper.querySelector('button[data-action="remove"]');
        if (removeBtn) removeBtn.setAttribute('aria-label', t('post.remove_image', { index: idx + 1 }));
        if (img) {
            wrapper.classList.toggle('ranking-publish__image--cover', idx === 0);
        }
        if (idx === 0) {
            if (!coverLabel) {
                const label = document.createElement('span');
                label.className = 'cover-label ranking-publish__cover-label';
                label.textContent = t('post.cover');
                wrapper.appendChild(label);
            }
        } else {
            if (coverLabel) coverLabel.remove();
        }
    });
}

const imageSortOwners = new WeakMap();

// ✅ 为图片预览容器设置拖拽排序
function setupImageDragSort(previewContainer, fileArray, options = {}) {
    const owner = {};
    imageSortOwners.set(previewContainer, owner);
    const wrappers = Array.from(previewContainer.querySelectorAll(':scope > div'));
    if (wrappers.length === 0) return;
    updateCoverMark(previewContainer);
    const canInteract = () => previewContainer.isConnected &&
        typeof options.isCurrent === 'function' && options.isCurrent();

    const isActiveBinding = () => imageSortOwners.get(previewContainer) === owner && canInteract();
    let dragSrcEl = null;
    let dragSrcFile = null;
    const resetDrag = () => {
        dragSrcEl = null;
        dragSrcFile = null;
        Array.from(previewContainer.children).forEach(w => {
            w.classList.remove('ranking-publish__image--dragging');
            w.classList.remove('ranking-publish__image--target');
        });
    };
    const getDragState = (target) => {
        if (!isActiveBinding() || !dragSrcEl) return null;
        const current = Array.from(previewContainer.children);
        const from = current.indexOf(dragSrcEl);
        const to = current.indexOf(target);
        if (current.length !== fileArray.length || from < 0 || to < 0 ||
            from >= fileArray.length || to >= fileArray.length || fileArray[from] !== dragSrcFile) return null;
        return { current, from, to };
    };

    // 清除所有旧事件，防止重复绑定
    wrappers.forEach(wrapper => {
        wrapper.classList.remove('ranking-publish__image--dragging');
        wrapper.classList.remove('ranking-publish__image--target');
        wrapper.onkeydown = null;
        wrapper.ondragstart = null;
        wrapper.ondragover = null;
        wrapper.ondragleave = null;
        wrapper.ondrop = null;
        wrapper.ondragend = null;
    });

    wrappers.forEach(wrapper => {
        wrapper.draggable = true;
        wrapper.classList.add('ranking-publish__image--sortable');

        // 绑定删除按钮
        const removeBtn = wrapper.querySelector('button[data-action="remove"]');
        if (removeBtn) {
            removeBtn.onclick = null; // 清除旧事件，防止重复绑定
            removeBtn.onclick = (e) => {
                if (!isActiveBinding() || removeBtn.disabled) return;
                const currentIdx = Array.from(previewContainer.children).indexOf(wrapper);
                if (currentIdx < 0 || currentIdx >= fileArray.length) return;
                const ownedFocus = document.activeElement === removeBtn || document.activeElement === wrapper;
                e.stopPropagation();
                fileArray.splice(currentIdx, 1);
                wrapper.remove();
                updateCoverMark(previewContainer);
                setupImageDragSort(previewContainer, fileArray, options);
                if (ownedFocus && canInteract() && document.activeElement === document.body) {
                    const remaining = Array.from(previewContainer.children);
                    const next = remaining[Math.min(currentIdx, remaining.length - 1)];
                    if (next) next.focus({ preventScroll: true });
                    else options.focusEmpty?.();
                }
            };
        }

        wrapper.onkeydown = (e) => {
            if (!areKeyboardShortcutsEnabled() || e.defaultPrevented || e.keyCode === 229 ||
                e.target !== wrapper || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
                e.repeat || e.isComposing || !isActiveBinding() ||
                !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            const current = Array.from(previewContainer.children);
            const from = current.indexOf(wrapper);
            const to = from + (e.key === 'ArrowLeft' ? -1 : 1);
            e.preventDefault();
            e.stopPropagation();
            if (from < 0 || to < 0 || to >= current.length) return;
            const [moved] = fileArray.splice(from, 1);
            fileArray.splice(to, 0, moved);
            previewContainer.insertBefore(wrapper, to > from ? current[to].nextSibling : current[to]);
            updateCoverMark(previewContainer);
            wrapper.focus({ preventScroll: true });
        };

        wrapper.ondragstart = (e) => {
            if (!isActiveBinding() || e.defaultPrevented || !e.dataTransfer ||
                typeof e.dataTransfer.setData !== 'function') return;
            const current = Array.from(previewContainer.children);
            const index = current.indexOf(wrapper);
            if (current.length !== fileArray.length || index < 0 || index >= fileArray.length) return;
            resetDrag();
            dragSrcEl = wrapper;
            dragSrcFile = fileArray[index];
            e.stopPropagation();
            wrapper.classList.add('ranking-publish__image--dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));
        };

        wrapper.ondragover = (e) => {
            const state = getDragState(wrapper);
            if (!state || e.defaultPrevented || !e.dataTransfer) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            state.current.forEach(w => w.classList.remove('ranking-publish__image--target'));
            if (state.from !== state.to) wrapper.classList.add('ranking-publish__image--target');
        };

        wrapper.ondragleave = () => {
            if (!isActiveBinding() || !dragSrcEl) return;
            wrapper.classList.remove('ranking-publish__image--target');
        };

        wrapper.ondrop = (e) => {
            const state = getDragState(wrapper);
            if (!state || e.defaultPrevented || !e.dataTransfer) return;
            e.preventDefault();
            e.stopPropagation();
            const source = dragSrcEl;
            resetDrag();
            if (state.from === state.to) return;
            const [moved] = fileArray.splice(state.from, 1);
            fileArray.splice(state.to, 0, moved);
            previewContainer.insertBefore(source, state.to > state.from ? state.current[state.to].nextSibling : wrapper);
            updateCoverMark(previewContainer);
        };

        wrapper.ondragend = () => {
            if (!isActiveBinding()) return;
            resetDrag();
        };
    });
}

export function createPublishView(currentUser, onBackCallback, onSuccessCallback, editItemData = null, initialType = null) {
    const container = document.createElement("div");
    container.className = 'ranking-publish-view';

    const isEditMode = !!editItemData;
    const viewTitle = isEditMode ? `✏️ ${t('publish.edit_content')}` : `🚀 ${t('publish.new_content')}`;
    const submitBtnText = isEditMode ? `💾 ${t('publish.save_changes')}` : `🚀 ${t('publish.confirm_publish')}`;
    const hasExistingToken = isEditMode && !!(editItemData.github_token || editItemData.has_private_token);

    // 1. 渲染分离出去的视图模板
    container.innerHTML = generatePublishHTML(isEditMode, viewTitle, submitBtnText, hasExistingToken, editItemData, t);

    let submissionScope;
    container.querySelector("#btn-back").onclick = async () => {
        if (!submissionScope?.isCurrent()) return;
        // 检查是否有已编辑内容
        const hasChanges = !!(
            container.querySelector("#pub-title")?.value?.trim() ||
            container.querySelector("#pub-short")?.value?.trim() ||
            container.querySelector("#pub-full")?.value?.trim() ||
            imageFiles?.length > 0
        );

        if (hasChanges) {
            const confirmed = await showConfirm(
                isEditMode ? t('publish.unsaved_changes_desc') : t('publish.leave_confirm_desc'),
                {
                    title: isEditMode ? t('publish.unsaved_changes_title') : t('publish.leave_confirm_title'),
                    confirmText: t('common.leave'),
                    cancelText: t('common.stay'),
                    type: 'warning', signal: submissionScope.confirmationSignal
                }
            );
            if (!confirmed || !submissionScope.isCurrent()) return;
        }

        submissionScope.dispose();
        if (onBackCallback) onBackCallback();
    };

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
                pendingHint.innerHTML = `⏳ ${t('publish.current_price')} <strong>${escapeHtml(String(editItemData.price))}</strong> ${t('common.credits')} → ${t('publish.will_change_in')} <strong>${hoursLeft}</strong> ${t('publish.hours_later')} <strong class="ranking-publish__pending-value">${escapeHtml(String(editItemData.pending_price))}</strong> ${t('common.credits')}`;
            }
        }

        // 🖼️ 编辑模式回显已有图片
        let editImageUrls = editItemData.imageUrls || [];
        if (editItemData.coverUrl && !editImageUrls.includes(editItemData.coverUrl)) {
            editImageUrls.unshift(editItemData.coverUrl);
        }
        editImageUrls = [...editImageUrls]; // 复制一份，避免直接修改原始数据
        editItemData.imageUrls = editImageUrls; // 同步给提交引擎，确保提交时顺序一致
        if (editImageUrls.length > 0) {
            container.querySelector("#cover-file-hint").style.display = "inline";
            renderImagePreviews(editImageUrls, imagesPreview);
            setupImageDragSort(imagesPreview, editImageUrls, { isCurrent: () => submissionScope?.isCurrent(), focusEmpty: () => { if (submissionScope?.isCurrent() && imagesInput.isConnected) imagesInput.focus({ preventScroll: true }); } });
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
                if (editItemData.type === "tool" || editItemData.type === "skill") {
                    // 🔧 缺陷修复：tool/skill 类型禁用 json 资源，HF 云端文件链接直接按外部链接回显，
                    // 否则联动回退 link 后链接输入框为空，保存必然校验失败
                    resTypeSelect.value = "link";
                    inputLink.value = editItemData.link;
                } else {
                    resTypeSelect.value = "json";
                    container.querySelector("#json-file-hint").style.display = "inline";
                }
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

    /**
     * 根据资源接入类型统一设置各输入框的显示/隐藏
     * @param {string} resType - 资源接入类型: link/netdisk/json
     * @param {Object} boxes - DOM元素集合
     * @param {HTMLElement|null} boxes.boxPrivateRepo - 私有仓库设置区（推荐类型传null）
     */
    const _setResourceTypeVisibility = (resType, { boxPrivateRepo: privateRepo } = {}) => {
        if (resType === "link") {
            boxLink.style.display = "block";
            boxJson.style.display = "none";
            boxNetdisk.style.display = "none";
            boxNetdiskPassword.style.display = "none";
            if (privateRepo) privateRepo.style.display = "block";
        } else if (resType === "netdisk") {
            boxLink.style.display = "none";
            boxJson.style.display = "none";
            boxNetdisk.style.display = "block";
            boxNetdiskPassword.style.display = "block";
            if (privateRepo) privateRepo.style.display = "none";
        } else {
            boxLink.style.display = "none";
            boxJson.style.display = "block";
            boxNetdisk.style.display = "none";
            boxNetdiskPassword.style.display = "none";
            if (privateRepo) privateRepo.style.display = "none";
        }
    };

    // 表单联动引擎 (强制状态机模型，读取 TYPE_RULES 声明式规则)
    const updateFormView = () => {
        const mainType = typeSelect.value;
        const rules = TYPE_RULES[mainType] || TYPE_RULES.tool;
        const jsonOption = resTypeSelect.querySelector('option[value="json"]');

        boxRecommendType.style.display = rules.recommendForm ? "block" : "none";
        boxCover.style.display = "block";
        boxPrice.style.display = rules.price ? "flex" : "none";
        boxAllowRefund.style.display = rules.refund ? "block" : "none";  // 💸 退款勾选仅规则允许的类型显示
        boxResourceSelect.style.display = "block";
        if (!rules.privateRepoWhenLink) boxPrivateRepo.style.display = "none";  // 推荐榜永不显示私有仓库区

        if (rules.resType.lockedByForm) {
            // 🔄 推荐榜：资源类型由推荐形式唯一决定，禁用手动修改（修复双控失配缺陷）
            if (jsonOption) jsonOption.disabled = false;
            const lockedResType = rules.formToResType[recommendTypeSelect.value] || "link";
            // 编辑旧失配数据被归一化时，把网盘链接搬到链接输入框，避免保存时丢链接
            if (isEditMode && resTypeSelect.value === "netdisk" && lockedResType === "link") {
                const inputNetdiskLink = container.querySelector("#pub-netdisk-link");
                if (inputNetdiskLink && inputNetdiskLink.value.trim() && !inputLink.value.trim()) {
                    inputLink.value = inputNetdiskLink.value.trim();
                }
            }
            resTypeSelect.value = lockedResType;
            resTypeSelect.disabled = true;
        } else if (rules.resType.fixed) {
            // 工作流：锁定 json 资源
            if (jsonOption) jsonOption.disabled = false;
            resTypeSelect.value = rules.resType.fixed;
            resTypeSelect.disabled = true;
        } else {
            // 插件榜：只允许白名单内的资源类型，非法值回退到首选项
            ['link', 'netdisk', 'json'].forEach(v => {
                const opt = resTypeSelect.querySelector(`option[value="${v}"]`);
                if (opt) opt.disabled = !rules.resType.selectable.includes(v);
            });
            if (!rules.resType.selectable.includes(resTypeSelect.value)) {
                resTypeSelect.value = rules.resType.selectable[0];
            }
            resTypeSelect.disabled = false;
        }

        // 触发UI更新以显示对应输入框（仅允许私有仓库的类型传入该区引用）
        _setResourceTypeVisibility(resTypeSelect.value, rules.privateRepoWhenLink ? { boxPrivateRepo } : {});
    };

    // ☁️ 编辑模式下：定义完 updateFormView 后，立即刷新表单UI状态
    if (isEditMode) {
        updateFormView();
    }

    typeSelect.onchange = () => {
        updateFormView();
    };
    recommendTypeSelect.onchange = () => {
        // 🔄 推荐形式变化时，资源类型由规则唯一决定并同步刷新
        updateFormView();
    };
    resTypeSelect.onchange = updateFormView;
    
    isPrivateCheck.onchange = (e) => {
        tokenContainer.style.display = e.target.checked ? "block" : "none";
    };
    
    // 🎯 根据初始类型自动设置并锁定主类别（非编辑模式下）
    if (!isEditMode && initialType) {
        if (initialType === "tool" || initialType === "tools") {
            typeSelect.value = "tool";
        } else if (initialType === "skill" || initialType === "skills") {
            typeSelect.value = "skill";
        } else if (initialType === "app" || initialType === "apps") {
            typeSelect.value = "app";
        } else if (initialType === "recommend" || initialType === "recommends") {
            typeSelect.value = "recommend";
        }
        // 🔒 锁定主类别，禁止修改
        typeSelect.disabled = true;
    }
    
    updateFormView();

    // 文件头确认后才创建预览，迟到选择不覆盖后一次选择。
    let previewGeneration = 0, previewPending = false, resumeDisabled = false;
    const previewUrls = new Set();
    const releasePreviews = () => {
        for (const url of previewUrls) URL.revokeObjectURL(url);
        previewUrls.clear();
    };
    imagesInput.onchange = async (e) => {
        if (!submissionScope?.isCurrent()) return;
        const rawFiles = Array.from(e.target.files).slice(0, 6);
        if (!rawFiles.length) return;
        const generation = ++previewGeneration;
        if (!previewPending) resumeDisabled = submitBtn.disabled;
        previewPending = true; submitBtn.disabled = true;
        try {
            const files = [];
            for (const file of rawFiles) {
                try { await validateImageFile(file); files.push(file); }
                catch (_) {
                    if (generation === previewGeneration && submissionScope.isCurrent()) showToast(t('common.operation_failed'), 'warning');
                }
                if (generation !== previewGeneration || !submissionScope.isCurrent()) return;
            }
            if (!files.length) return;
            releasePreviews(); imageFiles = files; imagesPreview.replaceChildren();
            for (const [index, file] of files.entries()) {
                const url = URL.createObjectURL(file); previewUrls.add(url);
                imagesPreview.appendChild(_createImagePreviewWrapper(url, index));
            }
            updateCoverMark(imagesPreview); setupImageDragSort(imagesPreview, imageFiles, { isCurrent: () => submissionScope?.isCurrent(), focusEmpty: () => { if (submissionScope?.isCurrent() && imagesInput.isConnected) imagesInput.focus({ preventScroll: true }); } });
        } catch (_) {
            if (generation === previewGeneration && submissionScope.isCurrent()) {
                releasePreviews(); imageFiles = []; imagesPreview.replaceChildren();
                showToast(t('common.operation_failed'), 'warning');
            }
        } finally {
            if (generation === previewGeneration) {
                previewPending = false;
                if (submissionScope.isCurrent()) submitBtn.disabled = resumeDisabled;
            }
        }
    };

    inputJson.onchange = (e) => { jsonFile = e.target.files[0]; };

    // 🎨 原创勾选框逻辑：工具/应用类型强制确认弹窗
    const isOriginalCheckbox = container.querySelector("#is-original-checkbox");
    const originalHintText = container.querySelector("#original-hint-text");
    
    // 根据类型更新原创提示文案（读取 TYPE_RULES 规则）
    const updateOriginalHint = () => {
        const rules = TYPE_RULES[typeSelect.value];
        if (originalHintText) {
            if (rules?.originalRequired) {
                originalHintText.textContent = `⚠️ ${t('publish.original_required_hint')}`;
                originalHintText.classList.add('ranking-publish__original-required');
            } else {
                originalHintText.textContent = t('publish.original_default_hint');
                originalHintText.classList.remove('ranking-publish__original-required');
            }
        }
    };
    
    // 显示原创确认弹窗
    const showOriginalConfirmModal = (onConfirm, onCancel) => {
        if (!submissionScope?.isCurrent()) return;
        const contentDiv = document.createElement("div");
        contentDiv.className = "ranking-original-confirm";
        contentDiv.innerHTML = `
            <div class="ranking-original-confirm__copy">
                <p class="ranking-original-confirm__description">${t('publish.original_confirm_desc')}</p>
                <p class="ranking-original-confirm__subtitle">${t('publish.original_confirm_subtitle')}</p>
                <ul class="ranking-original-confirm__list">
                    <li>${t('publish.original_confirm_item1')}</li>
                    <li>${t('publish.original_confirm_item2')}</li>
                    <li>${t('publish.original_confirm_item3')}</li>
                </ul>
                <p class="ranking-original-confirm__warning">
                    💡 ${t('publish.original_confirm_warning')}
                </p>
            </div>
            <div class="ranking-original-confirm__actions">
                <button type="button" id="btn-original-cancel" class="ranking-original-confirm__button">${t('common.cancel')}</button>
                <button type="button" id="btn-original-confirm" class="ranking-original-confirm__button ranking-original-confirm__button--confirm">${t('common.confirm')}</button>
            </div>
        `;
        
        const modal = globalModal.openModal(t('publish.original_confirm_title'), contentDiv, { width: "450px" });
        const release = submissionScope.addCleanup(() => globalModal.closeModal(modal));
        contentDiv._cleanup = release;
        
        contentDiv.querySelector("#btn-original-confirm").onclick = () => {
            if (!submissionScope.isCurrent()) return;
            globalModal.closeModal(modal);
            onConfirm();
        };
        contentDiv.querySelector("#btn-original-cancel").onclick = () => {
            if (!submissionScope.isCurrent()) return;
            globalModal.closeModal(modal);
            onCancel();
        };
    };
    
    // 监听原创勾选框变化
    isOriginalCheckbox.onchange = (e) => {
        if (!submissionScope?.isCurrent()) return;
        const rules = TYPE_RULES[typeSelect.value];
        // 只有规则要求原创强制的类型才需要确认弹窗
        if (rules?.originalRequired && e.target.checked) {
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
    submissionScope = createPublishSubmissionScope(container, submitBtn, currentUser?.account);
    submissionScope.addCleanup(() => { ++previewGeneration; releasePreviews(); imageFiles = []; jsonFile = null; imagesPreview.replaceChildren(); });
    submitBtn.onclick = () => previewPending ? undefined : handlePublishSubmit({
        submissionScope,
        container, currentUser, isEditMode, editItemData, 
        imageFiles, jsonFile, onSuccessCallback, submitBtn, submitBtnText  // 🖼️ imageFiles 替换 coverFile
    });

    return container;
}