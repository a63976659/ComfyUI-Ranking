// 前端页面/task/发布任务组件.js
// ==========================================
// 📝 发布任务组件
// ==========================================
// 功能：发布新任务表单
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { removeCache, removeCacheByPrefix } from "../components/性能优化工具.js";
import { compressImageForUpload } from "../market/发布内容_提交引擎.js";
import { escapeHtml, TASK_LIMITS, IMAGE_PROCESS } from "../core/全局配置.js";
import { createPublishSubmissionScope } from "../market/发布提交生命周期.js";

function readTaskDeadline(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return null;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1] ? value : null;
}

function localCalendarDate(date) {
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readTaskPrice(value) {
    const raw = String(value ?? '').trim();
    if (!/^[0-9]+$/.test(raw)) return null;
    const price = Number(raw);
    return Number.isSafeInteger(price) && price <= TASK_LIMITS.MAX_PRICE ? price : null;
}

function readDepositRatio(value) {
    const raw = String(value ?? '');
    return TASK_LIMITS.DEPOSIT_RATIOS.find(ratio => String(ratio) === raw) ?? null;
}

/**
 * 🚀 清除任务列表缓存
 */
function clearTaskListCache() {
    // 🔧 修复：API 层缓存键带完整查询串（api_/api/tasks?status=..&sort=..），
    // removeCache 精确删除命中不到（no-op），发任务后任务榜仍会从旧缓存返回，改用前缀删除
    removeCacheByPrefix('api_/api/tasks');
    // 🔧 P1修复：任务榜组件实际使用 TasksCache_${status}_${sort} 键（非 ListCache_*），按真实键格式精准清除
    const statuses = ['', 'open', 'in_progress', 'submitted', 'completed', 'disputed'];
    // 任务榜排序值：latest, price, deadline, views, daily_views, likes, favorites
    const sorts = ['latest', 'price', 'deadline', 'views', 'daily_views', 'likes', 'favorites'];
    for (const status of statuses) {
        for (const sort of sorts) {
            removeCache(`TasksCache_${status}_${sort}`);
        }
    }
    console.log('🗑️ 已清除任务列表缓存');
}

/**
 * 🖼️ 处理任务图片上传
 */
async function _processTaskImages(selectedImages, publishBtn, isCurrent = () => true) {
    const referenceImages = [];
    for (let i = 0; i < selectedImages.length; i++) {
        if (!isCurrent()) return null;
        if (selectedImages[i].isExisting) {
            referenceImages.push(selectedImages[i].dataUrl);
        } else {
            publishBtn.textContent = `⏳ ${t('task.upload_progress', { current: i + 1, total: selectedImages.length })}...`;
            try {
                const processedFile = await compressImageForUpload(selectedImages[i].file);
                if (!isCurrent()) return null;
                const res = await api.uploadFile(processedFile, "task");
                if (!isCurrent()) return null;
                if (res?.status !== 'success' || typeof res.url !== 'string' || !res.url.trim()) {
                    throw new Error('Unconfirmed task image upload');
                }
                referenceImages.push(res.url);
            } catch (uploadErr) {
                if (!isCurrent()) return null;
                console.error("任务图片上传失败");
                throw uploadErr;
            }
        }
    }
    return referenceImages;
}

/**
 * 📝 创建发布任务视图
 * @param {Object|string} currentUser - 当前用户
 * @param {Object} editTaskData - 编辑模式时的任务数据（可选）
 */
export function createPublishTaskView(currentUser, editTaskData = null) {
    const isEditMode = !!editTaskData;
    const isLockedStatus = editTaskData && ["in_progress", "submitted"].includes(editTaskData.status);
    
    const container = document.createElement("div");
    container.className = "task-publish ranking-publish-form";
    
    // 使用本地日历日期，不通过 UTC 转换选择器的日期。
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = localCalendarDate(tomorrow);
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 7);
    const defaultDate = isEditMode ? (readTaskDeadline(editTaskData.deadline) ?? '') : localCalendarDate(defaultDeadline);

    // 编辑模式下的字段值
    const editTitle = isEditMode ? (editTaskData.title || '') : '';
    const editDescription = isEditMode ? (editTaskData.description || '') : '';
    const editRefLink = isEditMode ? (editTaskData.reference_link || '') : '';
    const editTotalPrice = isEditMode ? (editTaskData.total_price ?? '') : '';
    const editDepositRatio = isEditMode ? (editTaskData.deposit_ratio || 30) : 30;
    
    container.innerHTML = `
        <!-- 顶部导航 -->
        <div class="task-publish__header">
            <button type="button" id="btn-back" class="task-publish__back">
                ⬅ ${t('common.back')}
            </button>
            <span class="task-publish__heading">📝 ${isEditMode ? t('task.edit_task') : t('task.publish')}</span>
            <div class="task-publish__header-spacer"></div>
        </div>
        
        <!-- 表单内容 -->
        <div class="task-publish__body">
            
            <!-- 任务标题 -->
            <div>
                <label for="task-title" class="task-publish__label">
                    📌 ${t('task.task_title')} <span aria-hidden="true" class="task-publish__required">*</span>
                </label>
                <input type="text" id="task-title" required maxlength="50" placeholder="${t('task.title_placeholder')}" value="${escapeHtml(editTitle)}"
                       class="task-publish__input">
            </div>
            
            <!-- 任务描述 -->
            <div>
                <label for="task-description" class="task-publish__label">
                    📄 ${t('task.description')} <span aria-hidden="true" class="task-publish__required">*</span>
                </label>
                <textarea id="task-description" required aria-describedby="desc-count" rows="6" maxlength="2000" placeholder="${t('task.description_placeholder')}"
                          class="task-publish__textarea">${escapeHtml(editDescription)}</textarea>
                <div class="task-publish__counter">
                    <span id="desc-count">${editDescription.length}</span>/2000
                </div>
            </div>
            
            <!-- 参考图片 -->
            <div>
                <label for="ref-images" class="task-publish__label">
                    🖼️ ${t('task.reference_images_optional')}
                </label>
                <input type="file" id="ref-images" multiple accept="image/*" 
                       style="display: none;">
                <div id="image-preview" class="task-publish__images"></div>
                <button type="button" id="btn-add-image" class="task-publish__add-image">
                    + ${t('task.add_reference_image')}
                </button>
            </div>
            
            <!-- 参考链接 -->
            <div>
                <label for="ref-link" class="task-publish__label">
                    🔗 ${t('task.reference_link_optional')}
                </label>
                <input type="url" id="ref-link" placeholder="https://..." value="${escapeHtml(editRefLink)}"
                       class="task-publish__input">
            </div>
            
            <!-- 价格设置 -->
            <div class="task-publish__price-grid">
                <!-- 总价格 -->
                <div>
                    <label for="total-price" class="task-publish__label">
                        💰 ${t('task.total_price')} <span aria-hidden="true" class="task-publish__required">*</span>
                    </label>
                    <div class="task-publish__amount-wrap">
                        <input type="number" id="total-price" required aria-describedby="task-price-hint" min="0" max="${TASK_LIMITS.MAX_PRICE}" step="1" placeholder="100" value="${escapeHtml(editTotalPrice)}" ${isLockedStatus ? 'disabled' : ''}
                               class="task-publish__amount">
                        <span class="task-publish__credits">${t('common.credits')}</span>
                    </div>
                    <div id="task-price-hint" class="task-publish__hint">${isLockedStatus ? t('task.price_locked') : t('task.price_range', { max: TASK_LIMITS.MAX_PRICE })}</div>
                </div>
                
                <!-- 订金比例 -->
                <div>
                    <label for="deposit-ratio" class="task-publish__label">
                        📊 ${t('task.deposit_ratio')} <span aria-hidden="true" class="task-publish__required">*</span>
                    </label>
                    <select id="deposit-ratio" required aria-describedby="task-deposit-hint" ${isLockedStatus ? 'disabled' : ''} class="task-publish__select">
                        ${TASK_LIMITS.DEPOSIT_RATIOS.map(ratio => `<option value="${ratio}" ${editDepositRatio == ratio ? 'selected' : ''}>${ratio}%</option>`).join('')}
                    </select>
                    <div id="task-deposit-hint" class="task-publish__hint">${isLockedStatus ? t('task.deposit_locked') : t('task.deposit_deducted_on_assign')}</div>
                </div>
            </div>
            
            <!-- 价格说明 -->
            <div id="price-summary" class="task-publish__summary">
                <div class="task-publish__summary-title">💡 ${t('task.price_description')}</div>
                <div class="task-publish__summary-body">
                    ${t('task.total_price')}: <span id="summary-total" class="task-publish__summary-total">0</span> ${t('common.credits')}<br>
                    ${t('task.deposit_on_assign')}: <span id="summary-deposit" class="task-publish__summary-deposit">0</span> ${t('common.credits')}<br>
                    ${t('task.remaining_on_accept')}: <span id="summary-remaining">0</span> ${t('common.credits')}
                </div>
            </div>
            
            <!-- 截止日期 -->
            <div>
                <label for="deadline" class="task-publish__label">
                    ⏰ ${t('task.deadline')} <span aria-hidden="true" class="task-publish__required">*</span>
                </label>
                <input type="date" id="deadline" required ${isLockedStatus ? 'aria-describedby="task-deadline-hint"' : ''} min="${minDate}" value="${defaultDate}" ${isLockedStatus ? 'disabled' : ''}
                       class="task-publish__date">
                ${isLockedStatus ? `<div id="task-deadline-hint" class="task-publish__hint">${t('task.deadline_locked')}</div>` : ''}
            </div>
            
            <!-- 提交按钮 -->
            <button type="button" id="btn-publish" class="task-publish__submit">
                🚀 ${isEditMode ? t('task.save_changes') : t('task.publish_task')}
            </button>
            
            <!-- 提示 -->
            <div class="task-publish__footer">
                ${t('task.manage_in_task_list')}
            </div>
        </div>
    `;
    
    // 🔌 绑定事件
    
    // 返回按钮
    let leaving = false;
    const backButton = container.querySelector('#btn-back');
    backButton.onclick = async () => {
        if (!scope.isCurrent() || leaving) return;
        leaving = true;
        backButton.disabled = true;
        backButton.setAttribute('aria-busy', 'true');
        let navigated = false;
        try {
            const hasChanges = !!(
                container.querySelector('#task-title')?.value?.trim() ||
                container.querySelector('#task-description')?.value?.trim() ||
                container.querySelector('#image-preview')?.children?.length > 0 || readers.size > 0 ||
                container.querySelector('#ref-link')?.value?.trim()
            );
            if (hasChanges) {
                const confirmed = await showConfirm(
                    isEditMode ? t('publish.unsaved_changes_desc') : t('publish.leave_confirm_desc'),
                    {
                        title: isEditMode ? t('publish.unsaved_changes_title') : t('publish.leave_confirm_title'),
                        confirmText: t('common.leave'), cancelText: t('common.stay'),
                        type: 'warning', signal: scope.confirmationSignal
                    }
                );
                if (!confirmed || !scope.isCurrent()) return;
            }
            navigated = true;
            window.dispatchEvent(new CustomEvent('comfy-route-back'));
        } catch {
            if (!scope.isCurrent()) return;
            console.warn('任务返回确认失败');
            showToast(t('common.operation_failed'), 'error');
        } finally {
            if (!scope.isCurrent()) return;
            leaving = navigated;
            backButton.disabled = navigated;
            backButton.removeAttribute('aria-busy');
        }
    };

    // 描述字数统计
    const descInput = container.querySelector("#task-description");
    const descCount = container.querySelector("#desc-count");
    descInput.oninput = () => {
        if (!scope.isCurrent()) return;
        descCount.textContent = descInput.value.length;
    };
    
    // 价格计算
    const totalPriceInput = container.querySelector("#total-price");
    const depositRatioSelect = container.querySelector("#deposit-ratio");
    const summaryTotal = container.querySelector("#summary-total");
    const summaryDeposit = container.querySelector("#summary-deposit");
    const summaryRemaining = container.querySelector("#summary-remaining");
    
    const renderPriceSummary = () => {
        const total = readTaskPrice(totalPriceInput.value);
        const ratio = readDepositRatio(depositRatioSelect.value);
        if (total === null || ratio === null) {
            summaryTotal.textContent = summaryDeposit.textContent = summaryRemaining.textContent = t('common.unknown');
            return;
        }
        const deposit = Math.floor(total * ratio / 100);
        const remaining = total - deposit;
        
        summaryTotal.textContent = total;
        summaryDeposit.textContent = deposit;
        summaryRemaining.textContent = remaining;
    };
    
    const updatePriceSummary = () => { if (scope.isCurrent()) renderPriceSummary(); };
    totalPriceInput.oninput = updatePriceSummary;
    depositRatioSelect.onchange = updatePriceSummary;
    
    // 图片上传
    const refImagesInput = container.querySelector("#ref-images");
    const imagePreview = container.querySelector("#image-preview");
    const btnAddImage = container.querySelector("#btn-add-image");
    let selectedImages = [];
    const account = typeof currentUser === 'string' ? currentUser : currentUser?.account;
    const publishBtn = container.querySelector('#btn-publish');
    const scope = createPublishSubmissionScope(container, publishBtn, account);
    const readers = new Set();
    const readTimers = new Map();
    let submitting = false;
    scope.addCleanup(() => {
        for (const timer of readTimers.values()) clearTimeout(timer);
        readTimers.clear();
        for (const reader of readers) { try { reader.abort(); } catch {} }
        readers.clear(); selectedImages = [];
        imagePreview.innerHTML = '';
        container.querySelectorAll('input, textarea, select').forEach(input => {
            input.value = ''; input.disabled = true;
        });
        container.querySelectorAll('button').forEach(button => { button.disabled = true; });
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        status.textContent = t('auth.session_changed');
        container.replaceChildren(status);
    });
    
    btnAddImage.onclick = () => {
        if (!scope.isCurrent() || submitting) return;
        if (selectedImages.length + readers.size >= TASK_LIMITS.MAX_REFERENCE_IMAGES) {
            showToast(t('task.max_6_images'), "warning");
            return;
        }
        refImagesInput.click();
    };
    
    refImagesInput.onchange = () => {
        if (!scope.isCurrent() || submitting) return;
        const files = Array.from(refImagesInput.files);
        refImagesInput.value = '';
        for (const file of files) {
            if (selectedImages.length + readers.size >= TASK_LIMITS.MAX_REFERENCE_IMAGES) {
                showToast(t('task.max_6_images'), 'warning'); break;
            }
            if (typeof file.type !== 'string' || !file.type.startsWith('image/')) continue;
            if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > IMAGE_PROCESS.MAX_INPUT_BYTES) {
                showToast(t('task.image_size_limit', { max: IMAGE_PROCESS.MAX_INPUT_BYTES / (1024 * 1024) }), 'warning');
                continue;
            }
            const reader = new FileReader();
            readers.add(reader);
            const finish = () => {
                if (!readers.delete(reader)) return false;
                clearTimeout(readTimers.get(reader)); readTimers.delete(reader);
                return true;
            };
            const fail = () => {
                if (!finish() || !scope.isCurrent()) return;
                showToast(t('image.load_failed'), 'error');
            };
            reader.onload = e => {
                if (!finish() || !scope.isCurrent()) return;
                if (typeof e.target?.result !== 'string' || !e.target.result.startsWith('data:image/')) {
                    showToast(t('image.load_failed'), 'error'); return;
                }
                selectedImages.push({ file, dataUrl: e.target.result });
                renderImagePreview();
            };
            reader.onerror = reader.onabort = fail;
            readTimers.set(reader, setTimeout(() => {
                if (!readers.has(reader)) return;
                fail(); try { reader.abort(); } catch {}
            }, IMAGE_PROCESS.TIMEOUT));
            try { reader.readAsDataURL(file); } catch { fail(); }
        }
    };
    
    const renderImagePreview = () => {
        imagePreview.innerHTML = selectedImages.map((img, i) => `
            <div class="task-publish__image">
                <img alt="${escapeHtml(t('task.reference_images'))} ${i + 1}" src="${escapeHtml(img.dataUrl)}" class="task-publish__preview">
                <button type="button" aria-label="${escapeHtml(t('task.remove_reference_image', { index: i + 1 }))}" class="btn-remove-img task-publish__remove" data-index="${i}">×</button>
            </div>
        `).join("");
        
        imagePreview.querySelectorAll(".btn-remove-img").forEach(btn => {
            btn.onclick = () => {
                if (!scope.isCurrent() || submitting) return;
                const index = parseInt(btn.dataset.index);
                selectedImages.splice(index, 1);
                renderImagePreview();
            };
        });
        
        btnAddImage.style.display = selectedImages.length >= TASK_LIMITS.MAX_REFERENCE_IMAGES ? "none" : "block";
    };
    
    // 编辑模式：加载已有的参考图片
    if (isEditMode && Array.isArray(editTaskData.reference_images) && editTaskData.reference_images.length > 0) {
        editTaskData.reference_images.filter(url => typeof url === 'string').slice(0, TASK_LIMITS.MAX_REFERENCE_IMAGES).forEach(url => {
            selectedImages.push({
                file: null,
                dataUrl: url,
                isExisting: true
            });
        });
        renderImagePreview();
    }
    
    // 发布/保存按钮
    container.querySelector("#btn-publish").onclick = async () => {
        if (!scope.isCurrent() || leaving) return;
        if (readers.size > 0) { showToast(t('task.images_reading'), 'warning'); return; }
        const title = container.querySelector("#task-title").value.trim();
        const description = descInput.value.trim();
        const refLink = container.querySelector("#ref-link").value.trim();
        const totalPrice = readTaskPrice(totalPriceInput.value);
        const depositRatio = readDepositRatio(depositRatioSelect.value);
        const deadline = readTaskDeadline(container.querySelector("#deadline").value);
        
        // 验证
        const validations = [
            [!title, t('task.please_enter_title')],
            [!description, t('task.please_enter_description')],
            [!isLockedStatus && totalPrice === null, t('task.price_range', { max: TASK_LIMITS.MAX_PRICE })],
            [!isLockedStatus && depositRatio === null, t('task.deposit_invalid')],
            [!isLockedStatus && deadline === null, t('task.deadline_invalid')]
        ];
        const failed = validations.find(([cond]) => cond);
        if (failed) { showToast(failed[1], "warning"); return; }
        if (!scope.begin()) return;
        submitting = true;
        refImagesInput.disabled = btnAddImage.disabled = true;
        imagePreview.querySelectorAll('.btn-remove-img').forEach(button => { button.disabled = true; });
        let saveAttempted = false, committed = false, outcomeUnknown = false;
        
        try {
            const publishBtn = container.querySelector("#btn-publish");
            publishBtn.disabled = true;
            publishBtn.textContent = `⏳ ${t('task.uploading_images')}...`;
            
            // 上传参考图片（只上传新选择的图片）
            const referenceImages = await _processTaskImages(selectedImages.slice(), publishBtn, scope.isCurrent);
            if (!scope.isCurrent()) return;
            if (!referenceImages) throw new Error('Task images unavailable');
            
            if (isEditMode) {
                // 编辑模式：更新任务
                publishBtn.textContent = `⏳ ${t('common.saving')}...`;
                
                const updateData = {
                    title,
                    description,
                    referenceImages,
                    referenceLink: refLink || null
                };
                
                // 只有在非锁定状态下才更新价格相关字段
                if (!isLockedStatus) {
                    updateData.totalPrice = totalPrice;
                    updateData.depositRatio = depositRatio;
                    updateData.deadline = deadline;
                }
                
                saveAttempted = true;
                const result = await api.updateTask(editTaskData.id, updateData);
                if (!scope.isCurrent()) return;
                if (result?.status !== 'success') throw new Error('Unconfirmed task update');
                committed = true;
                
                showToast(t('task.edit_success'), "success");
            } else {
                // 新建模式：创建任务
                publishBtn.textContent = `⏳ ${t('task.publishing')}...`;
                
                saveAttempted = true;
                const result = await api.createTask({
                    title,
                    description,
                    referenceImages,
                    referenceLink: refLink || null,
                    totalPrice,
                    depositRatio,
                    deadline,
                    publisher: account
                });
                if (!scope.isCurrent()) return;
                if (result?.status !== 'success' || typeof result.data?.id !== 'string' || !result.data.id.trim()) {
                    throw new Error('Unconfirmed task publication');
                }
                committed = true;
                
                showToast(t('task.publish_success'), "success");
            }
            
            // 🚀 清除任务列表缓存，确保返回列表时能看到更新
            try { clearTaskListCache(); } catch { console.warn('任务发布后的缓存清理失败'); }
            // 🔄 触发列表刷新，确保新内容立即显示
            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload"));
            
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
            
        } catch (err) {
            if (!scope.isCurrent() || committed) return;
            console.error(isEditMode ? "修改任务失败" : "发布任务失败");
            outcomeUnknown = saveAttempted && ![400, 401, 403, 404, 409, 422, 429].includes(err?.status);
            showToast(t(outcomeUnknown ? 'publish.save_unconfirmed' : (isEditMode ? 'task.edit_failed' : 'task.publish_failed')),
                outcomeUnknown ? 'warning' : 'error');
        } finally {
            if (!scope.isCurrent()) return;
            scope.finish(committed, outcomeUnknown);
            submitting = committed || outcomeUnknown;
            refImagesInput.disabled = btnAddImage.disabled = submitting;
            imagePreview.querySelectorAll('.btn-remove-img').forEach(button => { button.disabled = submitting; });
            const publishBtn = container.querySelector("#btn-publish");
            publishBtn.disabled = committed || outcomeUnknown;
            publishBtn.textContent = outcomeUnknown ? t('publish.result_pending')
                : `🚀 ${isEditMode ? t('task.save_changes') : t('task.publish_task')}`;
        }
    };
    
    renderPriceSummary();
    return container;
}
