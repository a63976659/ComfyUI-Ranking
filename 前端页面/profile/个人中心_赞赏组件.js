// 前端页面/profile/个人中心_赞赏组件.js
import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { openUserProfileModal } from "./个人中心视图.js"; // 【修复点】：引入个人中心视图函数

export function openTipModal(currentUser, targetUser, onSuccess) {
    const container = document.createElement("div");
    container.style.color = "#eee";
    container.innerHTML = `
        <div style="margin-bottom: 15px; background: rgba(255,152,0,0.1); padding: 10px; border-radius: 4px; border: 1px solid #FF9800;">
            当前余额: <strong style="color:#FF9800;">${currentUser.balance || 0}</strong> 积分
        </div>
        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">输入打赏金额 <span style="font-size:12px; color:#888;">(100积分=1⭐, 上限 22500)</span></label>
            <input type="number" id="tip-amount" min="10" max="22500" step="10" value="100" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#FF9800; font-weight:bold; font-size:16px; border-radius:4px; box-sizing:border-box;">
        </div>
        <div style="margin-bottom: 25px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:#aaa;">
                <input type="checkbox" id="tip-anonymous"> 匿名打赏 (隐藏我的名字)
            </label>
        </div>
        <button id="btn-submit-tip" style="width:100%; padding:12px; background:#FF9800; color:#fff; border:none; border-radius:6px; font-weight:bold; font-size:15px; cursor:pointer; box-shadow: 0 4px 10px rgba(255,152,0,0.3); transition: 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">确 认 打 赏</button>
    `;

    const btn = container.querySelector("#btn-submit-tip");
    btn.onclick = async () => {
        const amount = parseInt(container.querySelector("#tip-amount").value);
        const isAnon = container.querySelector("#tip-anonymous").checked;

        if (!amount || amount <= 0) return showToast("打赏金额必须大于 0", "warning");
        
        // 【新增】：本地前置余额校验
        if ((currentUser.balance || 0) < amount) {
            if (await showConfirm("您的积分余额不足，是否立刻前往个人中心充值？")) {
                globalModal.closeTopModal();
                // 【修复点】：直接调用函数唤起个人中心
                openUserProfileModal(currentUser);
            }
            return; // 余额不足，直接终止
        }

        btn.disabled = true;
        btn.innerText = "处理中...";
        try {
            const res = await api.tipUser(currentUser.account, targetUser.account, amount, isAnon);
            showToast("🎉 打赏成功！感谢您的慷慨支持。", "success");
            globalModal.closeTopModal();
            if (onSuccess) onSuccess(res.balance);
        } catch (err) {
            // 【修改点 3】：增加余额不足引导充值的逻辑
            if (err.message && err.message.includes("余额不足")) {
                if (await showConfirm("您的积分余额不足，是否立刻前往个人中心充值？")) {
                    globalModal.closeTopModal();
                    // 【修复点】：直接调用函数唤起个人中心
                    openUserProfileModal(currentUser);
                }
            } else {
                showToast(err.message, "error");
            }
            btn.disabled = false;
            btn.innerText = "确 认 打 赏";
        }
    };

    globalModal.openModal(`🎁 赞赏 ${targetUser.name}`, container, { width: "320px" });
}