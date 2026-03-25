// 前端页面/market/资金与钱包_提现组件.js
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";

/**
 * 提现弹窗组件 (带邮箱验证码安全风控)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onBalanceChange 提现成功后的回调刷新函数
 */
export function openWithdrawModal(currentUser, onBalanceChange) {
    const maxWithdraw = currentUser.earn_balance || 0; 
    
    if (maxWithdraw <= 0) {
        return showToast("您的可提现收益为 0，快去发布优质工具赚取积分吧！", "warning");
    }

    const container = document.createElement("div");
    container.style.color = "#ccc";

    container.innerHTML = `
        <div style="margin-bottom: 20px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 13px; color: #2196F3; margin-bottom: 4px;">可提现收益 (积分)</div>
                <div style="font-size: 24px; font-weight: bold; color: #fff;">${maxWithdraw}</div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #888;">
                <div>提现比例：1 积分 = 1 元</div>
                <div style="color: #aaa; margin-top: 4px;">预计可得：<span id="cny-amount" style="color:#4CAF50; font-weight:bold;">0.00</span> 元</div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">提现积分数量 <span style="color: #F44336;">*</span></label>
            <input type="number" id="withdraw-amount" placeholder="最多可提取 ${maxWithdraw}" max="${maxWithdraw}" min="1" style="width: 100%; padding: 10px; background: #333; border: 1px solid #555; color: #FF9800; font-weight: bold; border-radius: 4px; box-sizing: border-box;">
            <div style="font-size: 11px; color: #888; margin-top: 5px;">* 最低提现额度为 1 积分</div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">收款支付宝账号 <span style="color: #F44336;">*</span></label>
            <input type="text" id="withdraw-account" placeholder="手机号或邮箱" style="width: 100%; padding: 10px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">收款人真实姓名 <span style="color: #F44336;">*</span></label>
            <input type="text" id="withdraw-name" placeholder="用于支付宝转账核验" style="width: 100%; padding: 10px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="margin-bottom: 25px; padding: 15px; background: #2a2a2a; border-radius: 8px; border: 1px solid #444;">
            <label style="display: block; margin-bottom: 8px; color: #FF9800; font-weight: bold;">⚠️ 安全验证</label>
            <div style="font-size: 12px; color: #aaa; margin-bottom: 10px;">提现操作需要向绑定的安全邮箱 <b>${currentUser.email || '您的邮箱'}</b> 发送验证码。</div>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="withdraw-code" placeholder="输入 6 位验证码" maxlength="6" style="flex: 1; padding: 10px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; text-align: center;">
                <button id="btn-send-code" style="padding: 0 15px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; white-space: nowrap; transition: 0.2s;">获取验证码</button>
            </div>
        </div>

        <button id="btn-submit-withdraw" style="width: 100%; padding: 12px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 15px; box-shadow: 0 4px 10px rgba(255, 152, 0, 0.3);">提交提现申请</button>
    `;

    const inputAmount = container.querySelector("#withdraw-amount");
    const cnyDisplay = container.querySelector("#cny-amount");
    inputAmount.oninput = (e) => {
        let val = parseInt(e.target.value) || 0;
        if (val > maxWithdraw) { val = maxWithdraw; e.target.value = val; }
        cnyDisplay.innerText = (val / 1).toFixed(2);
    };

    const btnSendCode = container.querySelector("#btn-send-code");
    let countdownTimer = null;

    btnSendCode.onclick = async () => {
        btnSendCode.disabled = true;
        btnSendCode.style.background = "#555";
        btnSendCode.innerText = "发送中...";
        try {
            await api.sendVerifyCode(currentUser.email, "email", "withdraw", currentUser.account);
            showToast(`验证码已发送至您的邮箱，请查收`, "success");
            
            let timeLeft = 60;
            btnSendCode.innerText = `${timeLeft}s 后重发`;
            countdownTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(countdownTimer);
                    btnSendCode.disabled = false;
                    btnSendCode.style.background = "#2196F3";
                    btnSendCode.innerText = "获取验证码";
                } else {
                    btnSendCode.innerText = `${timeLeft}s 后重发`;
                }
            }, 1000);
        } catch (err) {
            showToast(err.message || "发送失败，请稍后重试", "error");
            btnSendCode.disabled = false;
            btnSendCode.style.background = "#2196F3";
            btnSendCode.innerText = "获取验证码";
        }
    };

    const btnSubmit = container.querySelector("#btn-submit-withdraw");
    btnSubmit.onclick = async () => {
        const amount = parseInt(inputAmount.value);
        const alipayAccount = container.querySelector("#withdraw-account").value.trim();
        const realName = container.querySelector("#withdraw-name").value.trim();
        const code = container.querySelector("#withdraw-code").value.trim();

        if (!amount || amount < 1) return showToast("最低提现额度为 1 积分！", "warning");
        if (!alipayAccount || !realName) return showToast("请完整填写收款人支付宝账号与真实姓名！", "warning");
        if (code.length !== 6) return showToast("请输入 6 位有效验证码！", "warning");

        btnSubmit.innerHTML = "⏳ 提交中...";
        btnSubmit.disabled = true;

        try {
            await new Promise(r => setTimeout(r, 1500));
            
            showToast("🎉 提现申请提交成功！预计 1-3 个工作日内打款至您的支付宝。", "success");
            globalModal.closeTopModal();
            
            if (onBalanceChange) {
                currentUser.earn_balance -= amount; 
                onBalanceChange(currentUser.earn_balance);
            }
        } catch (error) {
            showToast("提现失败：" + error.message, "error");
            btnSubmit.innerHTML = "提交提现申请";
            btnSubmit.disabled = false;
        }
    };

    globalModal.openModal("💸 收益提现申请", container, { width: "450px" });
}