// 前端页面/market/资金与钱包_提现组件.js
import { api } from "../core/网络请求API.js";
import { showToast } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";

/**
 * 提现弹窗组件 (带邮箱验证码安全风控与手续费计算)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onSuccess 提现成功后的回调函数
 */
export function openWithdrawModal(currentUser, onSuccess) {
    // 将双轨账目合并为总可提现额度
    const earn = currentUser.earn_balance || 0;
    const tip = currentUser.tip_balance || 0;
    const maxWithdraw = earn + tip; 
    
    // 🚀 获取历史累计提现金额用于计算免责额度
    const totalWithdrawn = currentUser.total_withdrawn || 0; 
    
    if (maxWithdraw <= 0) {
        return showToast("您的可提现收益为 0，快去发布优质工具赚取积分吧！", "warning");
    }

    const container = document.createElement("div");
    container.style.color = "#ccc";

    container.innerHTML = `
        <div style="margin-bottom: 20px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 12px; color: #2196F3; margin-bottom: 5px;">总可提现积分</div>
                <div style="font-size: 24px; font-weight: bold; color: #fff;">${maxWithdraw}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 12px; color: #888; margin-bottom: 5px;">折合人民币 (扣除手续费前)</div>
                <div style="font-size: 16px; font-weight: bold; color: #4CAF50;">≈ ¥ ${maxWithdraw.toFixed(2)}</div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">提现金额 (积分) <span style="color:#F44336">*</span></label>
            <input type="number" id="withdraw-amount" placeholder="1积分 = 1元" max="${maxWithdraw}" min="1" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
            
            <div id="fee-calc-box" style="margin-top: 10px; padding: 10px; background: rgba(255,152,0,0.1); border: 1px dashed #FF9800; border-radius: 4px; font-size: 12px; color: #FF9800; display:none; line-height: 1.5;">
                <div id="fee-text"></div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">收款支付宝账号 <span style="color:#F44336">*</span></label>
            <input type="text" id="withdraw-account" placeholder="手机号或邮箱" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">真实姓名 (需与支付宝实名一致) <span style="color:#F44336">*</span></label>
            <input type="text" id="withdraw-name" placeholder="收款人真实姓名" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
        </div>

        <div style="margin-bottom: 20px;">
            <label style="display:block; margin-bottom:5px; color:#ccc;">安全验证码 (将发送至您绑定的邮箱) <span style="color:#F44336">*</span></label>
            <div style="display:flex; gap:10px;">
                <input type="text" id="withdraw-code" placeholder="6位验证码" maxlength="6" style="flex:1; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <button id="btn-send-code" style="padding:0 15px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; white-space:nowrap; transition:0.2s;">获取验证码</button>
            </div>
        </div>

        <button id="btn-submit-withdraw" style="width:100%; padding:12px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:15px; transition:0.2s;" onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">确认提现 (金额将转入冻结审核)</button>
    `;

    // 🚀 核心逻辑：动态计算提现手续费
    const inputAmount = container.querySelector("#withdraw-amount");
    inputAmount.oninput = () => {
        let val = parseInt(inputAmount.value);
        if (val > maxWithdraw) { val = maxWithdraw; inputAmount.value = val; }
        
        const feeBox = container.querySelector("#fee-calc-box");
        const feeText = container.querySelector("#fee-text");
        if (!val || val <= 0) {
            feeBox.style.display = "none";
            return;
        }
        
        // 计算规则：100元=100积分免手续费 (1积分=1元)
        const freeQuota = Math.max(0, 100 - totalWithdrawn);
        let fee = 0;
        if (val > freeQuota) {
            fee = Math.floor((val - freeQuota) * 0.1); // 超过免责额度的部分收取 10%
        }
        
        feeBox.style.display = "block";
        if (fee > 0) {
            feeText.innerHTML = `⚠️ 平台累计免手续费额度 (100积分) 已耗尽。<br>本次提现需扣除 10% 平台维护手续费：<strong style="color:#F44336;">${fee} 积分</strong><br>扣除后预计实际到账：<strong style="color:#4CAF50;">${(val - fee).toFixed(2)} 元</strong>`;
        } else {
            feeText.innerHTML = `🎉 您目前享有平台 100元 内免手续费优惠福利！<br>预计全额到账：<strong style="color:#4CAF50;">${val.toFixed(2)} 元</strong>`;
        }
    };

    const btnSendCode = container.querySelector("#btn-send-code");
    btnSendCode.onclick = async () => {
        btnSendCode.disabled = true;
        btnSendCode.style.background = "#555";
        btnSendCode.innerText = "发送中...";
        try {
            await api.sendVerifyCode({ contact: currentUser.email, contact_type: "email", action_type: "withdraw", account: currentUser.account });
            showToast("验证码已发送，请查收邮箱 (注意检查垃圾箱)", "success");
            let count = 60;
            const timer = setInterval(() => {
                count--;
                btnSendCode.innerText = `${count}s 后重发`;
                if (count <= 0) {
                    clearInterval(timer);
                    btnSendCode.disabled = false;
                    btnSendCode.style.background = "#2196F3";
                    btnSendCode.innerText = "获取验证码";
                }
            }, 1000);
        } catch (error) {
            showToast("发送失败: " + error.message, "error");
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
            await api.submitWithdraw({ amount, alipayAccount, real_name: realName, code, account: currentUser.account });
            
            showToast("🎉 提现申请提交成功！预计 1-3 个工作日内打款至您的支付宝。", "success");
            globalModal.closeTopModal();
            
            if (onSuccess) onSuccess(); 
        } catch (error) {
            showToast("提交失败: " + error.message, "error");
            btnSubmit.innerHTML = "确认提现";
            btnSubmit.disabled = false;
        }
    };

    globalModal.openModal("💳 收益提现中心", container, { width: "420px" });
}