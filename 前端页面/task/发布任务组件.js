// 前端页面/task/发布任务组件.js
// ==========================================
// 📝 发布任务组件
// ==========================================
// 功能：发布新任务表单
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { removeCache } from "../components/性能优化工具.js";

/**
 * 🚀 清除任务列表缓存
 */
function clearTaskListCache() {
    removeCache('api_/api/tasks');
    const sorts = ['latest', 'popular', 'hot'];
    for (const sort of sorts) {
        removeCache(`ListCache_tasks_${sort}`);
    }
    console.log('🗑️ 已清除任务列表缓存');
}

/**
 * 📝 创建发布任务视图
 */
export function createPublishTaskView(currentUser) {
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
        boxSizing: "border-box",
        background: "#121212"
    });
    
    // 获取明天的日期作为最小截止日期
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split("T")[0];
    
    // 默认截止日期（7天后）
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 7);
    const defaultDate = defaultDeadline.toISOString().split("T")[0];
    
    container.innerHTML = `
        <!-- 顶部导航 -->
        <div style="display: flex; align-items: center; padding: 12px 15px; background: #1a1a1a; border-bottom: 1px solid #333;">
            <button id="btn-back" style="background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'">
                <span>⬅</span> ${t('common.back')}
            </button>
            <span style="flex: 1; text-align: center; font-size: 15px; font-weight: bold; color: #fff;">📝 ${t('task.publish')}</span>
            <div style="width: 60px;"></div>
        </div>
        
        <!-- 表单内容 -->
        <div style="padding: 15px; display: flex; flex-direction: column; gap: 15px;">
            
            <!-- 任务标题 -->
            <div>
                <label style="display: block; color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
                    📌 ${t('task.task_title')} <span style="color: #F44336;">*</span>
                </label>
                <input type="text" id="task-title" maxlength="50" placeholder="${t('task.title_placeholder')}" 
                       style="width: 100%; padding: 10px 12px; background: #1e1e1e; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; box-sizing: border-box;">
            </div>
            
            <!-- 任务描述 -->
            <div>
                <label style="display: block; color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
                    📄 ${t('task.description')} <span style="color: #F44336;">*</span>
                </label>
                <textarea id="task-description" rows="6" maxlength="2000" placeholder="${t('task.description_placeholder')}"
                          style="width: 100%; padding: 10px 12px; background: #1e1e1e; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; resize: none; box-sizing: border-box; line-height: 1.5;"></textarea>
                <div style="text-align: right; font-size: 11px; color: #666; margin-top: 4px;">
                    <span id="desc-count">0</span>/2000
                </div>
            </div>
            
            <!-- 参考图片 -->
            <div>
                <label style="display: block; color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
                    🖼️ ${t('task.reference_images_optional')}
                </label>
                <input type="file" id="ref-images" multiple accept="image/*" 
                       style="display: none;">
                <div id="image-preview" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;"></div>
                <button id="btn-add-image" style="width: 100%; padding: 12px; background: #1e1e1e; border: 1px dashed #555; border-radius: 8px; color: #888; cursor: pointer; font-size: 13px;">
                    + ${t('task.add_reference_image')}
                </button>
            </div>
            
            <!-- 参考链接 -->
            <div>
                <label style="display: block; color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
                    🔗 ${t('task.reference_link_optional')}
                </label>
                <input type="url" id="ref-link" placeholder="https://..." 
                       style="width: 100%; padding: 10px 12px; background: #1e1e1e; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; box-sizing: border-box;">
            </div>
            
            <!-- 价格设置 -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <!-- 总价格 -->
                <div>
                    <label style="display: block; color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
                        💰 ${t('task.total_price')} <span style="color: #F44336;">*</span>
                    </label>
                    <div style="position: relative;">
                        <input type="number" id="total-price" min="0" step="10" placeholder="100" 
                               style="width: 100%; padding: 10px 12px; padding-right: 40px; background: #1e1e1e; border: 1px solid #333; border-radius: 8px; color: #FF9800; font-size: 16px; font-weight: bold; box-sizing: border-box;">
                        <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #888; font-size: 12px;">${t('common.credits')}</span>
                    </div>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">${t('task.min_10_credits')}</div>
                </div>
                
                <!-- 订金比例 -->
                <div>
                    <label style="display: block; color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
                        📊 ${t('task.deposit_ratio')} <span style="color: #F44336;">*</span>
                    </label>
                    <select id="deposit-ratio" style="width: 100%; padding: 10px 12px; background: #1e1e1e; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; cursor: pointer;">
                        <option value="10">10%</option>
                        <option value="20">20%</option>
                        <option value="30" selected>30%</option>
                        <option value="50">50%</option>
                    </select>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">${t('task.deposit_deducted_on_assign')}</div>
                </div>
            </div>
            
            <!-- 价格说明 -->
            <div id="price-summary" style="padding: 12px; background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.3); border-radius: 8px;">
                <div style="font-size: 12px; color: #FF9800; margin-bottom: 6px;">💡 ${t('task.price_description')}</div>
                <div style="font-size: 13px; color: #ccc; line-height: 1.6;">
                    ${t('task.total_price')}: <span id="summary-total" style="color: #FF9800; font-weight: bold;">0</span> ${t('common.credits')}<br>
                    ${t('task.deposit_on_assign')}: <span id="summary-deposit" style="color: #2196F3;">0</span> ${t('common.credits')}<br>
                    ${t('task.remaining_on_accept')}: <span id="summary-remaining">0</span> ${t('common.credits')}
                </div>
            </div>
            
            <!-- 截止日期 -->
            <div>
                <label style="display: block; color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 6px;">
                    ⏰ ${t('task.deadline')} <span style="color: #F44336;">*</span>
                </label>
                <input type="date" id="deadline" min="${minDate}" value="${defaultDate}"
                       style="width: 100%; padding: 10px 12px; background: #1e1e1e; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; box-sizing: border-box;">
            </div>
            
            <!-- 提交按钮 -->
            <button id="btn-publish" style="margin-top: 10px; padding: 14px; background: linear-gradient(135deg, #FF9800, #F57C00); border: none; color: #fff; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: bold; box-shadow: 0 4px 12px rgba(255,152,0,0.3);">
                🚀 ${t('task.publish_task')}
            </button>
            
            <!-- 提示 -->
            <div style="text-align: center; font-size: 11px; color: #666; padding: 10px 0;">
                ${t('task.manage_in_task_list')}
            </div>
        </div>
    `;
    
    // 🔌 绑定事件
    
    // 返回按钮
    container.querySelector("#btn-back").onclick = () => {
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };
    
    // 描述字数统计
    const descInput = container.querySelector("#task-description");
    const descCount = container.querySelector("#desc-count");
    descInput.oninput = () => {
        descCount.textContent = descInput.value.length;
    };
    
    // 价格计算
    const totalPriceInput = container.querySelector("#total-price");
    const depositRatioSelect = container.querySelector("#deposit-ratio");
    const summaryTotal = container.querySelector("#summary-total");
    const summaryDeposit = container.querySelector("#summary-deposit");
    const summaryRemaining = container.querySelector("#summary-remaining");
    
    const updatePriceSummary = () => {
        const total = parseInt(totalPriceInput.value) || 0;
        const ratio = parseInt(depositRatioSelect.value) || 30;
        const deposit = Math.floor(total * ratio / 100);
        const remaining = total - deposit;
        
        summaryTotal.textContent = total;
        summaryDeposit.textContent = deposit;
        summaryRemaining.textContent = remaining;
    };
    
    totalPriceInput.oninput = updatePriceSummary;
    depositRatioSelect.onchange = updatePriceSummary;
    
    // 图片上传
    const refImagesInput = container.querySelector("#ref-images");
    const imagePreview = container.querySelector("#image-preview");
    const btnAddImage = container.querySelector("#btn-add-image");
    let selectedImages = [];
    
    btnAddImage.onclick = () => {
        if (selectedImages.length >= 6) {
            showToast(t('task.max_6_images'), "warning");
            return;
        }
        refImagesInput.click();
    };
    
    refImagesInput.onchange = () => {
        const files = Array.from(refImagesInput.files);
        const remaining = 6 - selectedImages.length;
        const toAdd = files.slice(0, remaining);
        
        toAdd.forEach(file => {
            if (!file.type.startsWith("image/")) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                selectedImages.push({
                    file: file,
                    dataUrl: e.target.result
                });
                renderImagePreview();
            };
            reader.readAsDataURL(file);
        });
        
        refImagesInput.value = "";
    };
    
    const renderImagePreview = () => {
        imagePreview.innerHTML = selectedImages.map((img, i) => `
            <div style="position: relative; padding-top: 100%; background: #1e1e1e; border-radius: 8px; overflow: hidden;">
                <img src="${img.dataUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                <button class="btn-remove-img" data-index="${i}" style="position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; background: rgba(244,67,54,0.9); border: none; border-radius: 50%; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">×</button>
            </div>
        `).join("");
        
        imagePreview.querySelectorAll(".btn-remove-img").forEach(btn => {
            btn.onclick = () => {
                const index = parseInt(btn.dataset.index);
                selectedImages.splice(index, 1);
                renderImagePreview();
            };
        });
        
        btnAddImage.style.display = selectedImages.length >= 6 ? "none" : "block";
    };
    
    // 发布按钮
    container.querySelector("#btn-publish").onclick = async () => {
        const title = container.querySelector("#task-title").value.trim();
        const description = descInput.value.trim();
        const refLink = container.querySelector("#ref-link").value.trim();
        const totalPrice = parseInt(totalPriceInput.value) || 0;
        const depositRatio = parseInt(depositRatioSelect.value) || 30;
        const deadline = container.querySelector("#deadline").value;
        
        // 验证
        if (!title) {
            showToast(t('task.please_enter_title'), "warning");
            return;
        }
        if (!description) {
            showToast(t('task.please_enter_description'), "warning");
            return;
        }
        if (totalPrice < 0) {
            showToast(t('task.price_min_10'), "warning");
            return;
        }
        if (!deadline) {
            showToast(t('task.please_select_deadline'), "warning");
            return;
        }
        
        try {
            const publishBtn = container.querySelector("#btn-publish");
            publishBtn.disabled = true;
            publishBtn.textContent = `⏳ ${t('task.uploading_images')}...`;
            
            // 上传参考图片
            const referenceImages = [];
            for (let i = 0; i < selectedImages.length; i++) {
                publishBtn.textContent = `⏳ ${t('task.upload_progress', { current: i + 1, total: selectedImages.length })}...`;
                try {
                    const res = await api.uploadFile(selectedImages[i].file, "task");
                    referenceImages.push(res.url);
                } catch (uploadErr) {
                    console.error("图片上传失败:", uploadErr);
                }
            }
            
            publishBtn.textContent = `⏳ ${t('task.publishing')}...`;
            
            const res = await api.createTask({
                title,
                description,
                referenceImages,
                referenceLink: refLink || null,
                totalPrice,
                depositRatio,
                deadline,
                publisher: currentUser.account || currentUser
            });
            
            showToast(t('task.publish_success'), "success");
            
            // 🚀 清除任务列表缓存，确保返回列表时能看到新任务
            clearTaskListCache();
            // 🔄 触发列表刷新，确保新内容立即显示
            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload"));
            
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
            
        } catch (err) {
            console.error("发布任务失败:", err);
            showToast(err.message || t('task.publish_failed'), "error");
        } finally {
            const publishBtn = container.querySelector("#btn-publish");
            publishBtn.disabled = false;
            publishBtn.textContent = `🚀 ${t('task.publish_task')}`;
        }
    };
    
    return container;
}
