// 前端页面/profile/个人中心_赞赏组件.js
// ==========================================
// 🎁 打赏弹窗组件
// ==========================================
// 作用：提供打赏弹窗界面和交互逻辑
// 关联文件：
//   - 打赏等级工具.js (等级计算与显示)
//   - 网络请求API.js (发送打赏请求)
//   - 全局弹窗管理器.js (弹窗管理)
// ==========================================

import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { openUserProfileModal } from "./个人中心视图.js";
import { isMaxTipLevel, renderTipLevelHTML, getTipLevelDescription, calculateTipLevel } from "../components/打赏等级工具.js";

// 最高等级积分上限（9个太阳 = 22500积分）
const MAX_TIP_POINTS = 22500;

/**
 * 打开打赏弹窗
 * @param {object} currentUser - 当前登录用户
 * @param {object} targetUser - 目标用户（被打赏者）
 * @param {function} onSuccess - 成功回调
 * @param {string} itemId - 可选，关联的内容ID
 */
export function openTipModal(currentUser, targetUser, onSuccess, itemId = null) {
    // ==========================================
    // 检查目标用户是否已满级
    // ==========================================
    // 如果是打赏具体内容，从内容的 tip_board 检查
    // 如果是打赏用户，从用户的 tip_board 检查
    // TODO: 需要后端支持查询当前用户对目标的累计打赏金额
    
    const container = document.createElement("div");
    container.style.color = "#eee";
    
    // 当前用户余额
    const userBalance = currentUser.balance || 0;
    
    container.innerHTML = `
        <div style="margin-bottom: 15px; background: rgba(255,152,0,0.1); padding: 10px; border-radius: 4px; border: 1px solid #FF9800;">
            当前余额: <strong style="color:#FF9800;">${userBalance}</strong> 积分
        </div>
        
        <div style="margin-bottom: 12px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">输入打赏金额</label>
            <input type="number" id="tip-amount" min="10" max="${MAX_TIP_POINTS}" step="10" value="100" 
                   style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#FF9800; font-weight:bold; font-size:16px; border-radius:4px; box-sizing:border-box;">
        </div>
        
        <!-- 🚀 新增：等级预览区域 -->
        <div id="tip-level-preview" style="margin-bottom: 15px; background: #1e1e1e; padding: 10px; border-radius: 4px; border: 1px dashed #444;">
            <div style="font-size: 11px; color: #888; margin-bottom: 6px;">打赏后等级预览</div>
            <div id="preview-level" style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
                ${renderTipLevelHTML(100, false)}
                <span style="color:#888;">支持者</span>
            </div>
        </div>
        
        <!-- 等级规则说明 -->
        <div style="margin-bottom: 15px; font-size: 11px; color: #666; line-height: 1.6;">
            <div>📊 等级规则：</div>
            <div style="padding-left: 10px;">
                • 1-100 积分 = 1⭐ 星星，101-200 积分 = 2⭐ 星星，以此类推<br>
                • 每 5 星星 = 1🌙 月亮 (500积分)<br>
                • 每 5 月亮 = 1☀️ 太阳 (2500积分)<br>
                • 最高等级：9☀️ 太阳 (22500积分)
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:#aaa;">
                <input type="checkbox" id="tip-anonymous"> 匿名打赏 (隐藏我的名字)
            </label>
        </div>
        
        <button id="btn-submit-tip" style="width:100%; padding:12px; background:#FF9800; color:#fff; border:none; border-radius:6px; font-weight:bold; font-size:15px; cursor:pointer; box-shadow: 0 4px 10px rgba(255,152,0,0.3); transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
            确 认 打 赏
        </button>
    `;

    // ==========================================
    // 绑定金额输入事件，实时更新等级预览
    // ==========================================
    const amountInput = container.querySelector("#tip-amount");
    const previewLevel = container.querySelector("#preview-level");
    
    const updatePreview = () => {
        const amount = parseInt(amountInput.value) || 0;
        if (amount <= 0) {
            previewLevel.innerHTML = `<span style="color:#666;">请输入有效金额</span>`;
            return;
        }
        
        // 检查是否超过上限
        if (amount > MAX_TIP_POINTS) {
            previewLevel.innerHTML = `<span style="color:#F44336;">⚠️ 超过单次上限 ${MAX_TIP_POINTS} 积分</span>`;
            return;
        }
        
        const levelHtml = renderTipLevelHTML(amount, false);
        const description = getTipLevelDescription(amount);
        const level = calculateTipLevel(amount);
        
        if (level.isMaxLevel) {
            previewLevel.innerHTML = `${levelHtml} <span style="color:#FFD700; font-weight:bold;">👑 至尊赞助者</span>`;
        } else {
            previewLevel.innerHTML = `${levelHtml} <span style="color:#aaa;">${description}</span>`;
        }
    };
    
    amountInput.addEventListener("input", updatePreview);
    
    // ==========================================
    // 绑定提交按钮事件
    // ==========================================
    const btn = container.querySelector("#btn-submit-tip");
    btn.onclick = async () => {
        const amount = parseInt(amountInput.value);
        const isAnon = container.querySelector("#tip-anonymous").checked;

        // 基本校验
        if (!amount || amount <= 0) return showToast("打赏金额必须大于 0", "warning");
        if (amount > MAX_TIP_POINTS) return showToast(`单次打赏上限为 ${MAX_TIP_POINTS} 积分`, "warning");
        
        // 本地前置余额校验
        if (userBalance < amount) {
            if (await showConfirm("您的积分余额不足，是否立刻前往个人中心充值？")) {
                globalModal.closeTopModal();
                openUserProfileModal(currentUser);
            }
            return;
        }

        btn.disabled = true;
        btn.innerText = "处理中...";
        
        try {
            const res = await api.tipUser(currentUser.account, targetUser.account, amount, isAnon, itemId);
            
            // 检查是否达到满级
            const level = calculateTipLevel(amount);
            if (level.isMaxLevel) {
                showToast("🎉 恭喜您成为至尊赞助者！已达最高等级。", "success");
            } else {
                showToast("🎉 打赏成功！感谢您的慷慨支持。", "success");
            }
            
            globalModal.closeTopModal();
            if (onSuccess) onSuccess(res.balance);
        } catch (err) {
            // 余额不足引导充值
            if (err.message && err.message.includes("余额不足")) {
                if (await showConfirm("您的积分余额不足，是否立刻前往个人中心充值？")) {
                    globalModal.closeTopModal();
                    openUserProfileModal(currentUser);
                }
            } else {
                showToast(err.message, "error");
            }
            btn.disabled = false;
            btn.innerText = "确 认 打 赏";
        }
    };

    globalModal.openModal(`🎁 赞赏 ${targetUser.name || targetUser.account}`, container, { width: "340px" });
}
