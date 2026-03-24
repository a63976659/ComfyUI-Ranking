// 前端页面/market/资金与钱包组件.js
import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";

/**
 * 充值弹窗组件 (拉起支付宝/微信支付)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onBalanceChange 充值成功后的回调刷新函数
 */
export function openRechargeModal(currentUser, onBalanceChange) {
    const container = document.createElement("div");
    container.style.color = "#ccc";

    // 充值档位配置
    const rechargeOptions = [
        { points: 100, price: 10 },
        { points: 500, price: 50 },
        { points: 1000, price: 100 },
        { points: 5000, price: 500 }
    ];

    let selectedOption = rechargeOptions[0];
    let paymentMethod = "alipay"; // 默认支付宝

    const renderOptions = () => rechargeOptions.map((opt, index) => `
        <div class="recharge-opt ${selectedOption.points === opt.points ? 'selected' : ''}" data-index="${index}" style="flex: 1; min-width: 45%; padding: 15px; background: ${selectedOption.points === opt.points ? 'rgba(76, 175, 80, 0.2)' : '#2a2a2a'}; border: 2px solid ${selectedOption.points === opt.points ? '#4CAF50' : '#444'}; border-radius: 8px; cursor: pointer; text-align: center; transition: 0.2s;">
            <div style="font-size: 18px; font-weight: bold; color: ${selectedOption.points === opt.points ? '#4CAF50' : '#fff'}; margin-bottom: 5px;">${opt.points} 积分</div>
            <div style="font-size: 12px; color: #888;">￥${opt.price.toFixed(2)}</div>
        </div>
    `).join("");

    container.innerHTML = `
        <div style="margin-bottom: 20px; text-align: center;">
            <div style="font-size: 14px; color: #aaa;">当前账号余额</div>
            <div style="font-size: 28px; font-weight: bold; color: #FF9800; margin-top: 5px;">${currentUser.balance || 0} <span style="font-size: 14px;">积分</span></div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #eee;">选择充值金额</label>
            <div id="recharge-grid" style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${renderOptions()}
            </div>
        </div>

        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #eee;">支付方式</label>
            <div style="display: flex; gap: 15px;">
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                    <input type="radio" name="pay_method" value="alipay" checked>
                    <span style="color: #00A1E9; font-weight: bold;">📘 支付宝</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                    <input type="radio" name="pay_method" value="wechat">
                    <span style="color: #09BB07; font-weight: bold;">📗 微信支付</span>
                </label>
            </div>
        </div>

        <div id="qr-container" style="display: none; text-align: center; margin-bottom: 20px; padding: 20px; background: #fff; border-radius: 8px;">
            <div id="qr-loading" style="color: #666; font-size: 14px; margin-bottom: 10px;">⏳ 正在生成支付二维码...</div>
            <img id="qr-image" style="width: 180px; height: 180px; display: none; margin: 0 auto;">
            <div style="color: #333; font-size: 13px; margin-top: 10px; font-weight: bold;">请使用手机扫码支付 <span id="pay-price-text" style="color: #F44336;"></span> 元</div>
            <div style="color: #888; font-size: 11px; margin-top: 5px;">支付完成后系统将自动到账，请勿关闭弹窗</div>
        </div>

        <button id="btn-create-order" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 15px; box-shadow: 0 4px 10px rgba(76, 175, 80, 0.3);">获取支付二维码</button>
    `;

    // 绑定金额选择事件
    const bindGridEvents = () => {
        container.querySelectorAll('.recharge-opt').forEach(el => {
            el.onclick = () => {
                selectedOption = rechargeOptions[parseInt(el.getAttribute('data-index'))];
                container.querySelector('#recharge-grid').innerHTML = renderOptions();
                bindGridEvents(); // 重新绑定
            };
        });
    };
    bindGridEvents();

    container.querySelectorAll('input[name="pay_method"]').forEach(radio => {
        radio.onchange = (e) => paymentMethod = e.target.value;
    });

    const btnCreateOrder = container.querySelector("#btn-create-order");
    const qrContainer = container.querySelector("#qr-container");
    const qrImage = container.querySelector("#qr-image");
    const qrLoading = container.querySelector("#qr-loading");
    let pollingInterval = null;

    btnCreateOrder.onclick = async () => {
        btnCreateOrder.style.display = "none";
        qrContainer.style.display = "block";
        qrLoading.style.display = "block";
        qrImage.style.display = "none";
        
        try {
            // 【此处对接未来的 FastAPI 支付创建接口】
            // const res = await api.createRechargeOrder({ points: selectedOption.points, method: paymentMethod });
            
            // 模拟接口延迟与返回
            await new Promise(r => setTimeout(r, 1000));
            const mockQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=MockPaymentFlow"; 
            const mockOrderId = "ORDER_" + Date.now();

            qrLoading.style.display = "none";
            qrImage.src = mockQrUrl;
            qrImage.style.display = "block";
            container.querySelector("#pay-price-text").innerText = selectedOption.price.toFixed(2);

            // 开启轮询，检查支付状态
            pollingInterval = setInterval(async () => {
                // const checkRes = await api.checkOrderStatus(mockOrderId);
                // if (checkRes.status === "SUCCESS") { ... }
                
                // 【测试代码】：模拟用户 5 秒后支付成功
            }, 3000);

            // 模拟 5 秒后支付成功的回调
            setTimeout(() => {
                clearInterval(pollingInterval);
                globalModal.closeTopModal();
                showToast(`✅ 充值成功！已到账 ${selectedOption.points} 积分。`, "success");
                if (onBalanceChange) {
                    currentUser.balance = (currentUser.balance || 0) + selectedOption.points;
                    onBalanceChange(currentUser.balance);
                }
            }, 5000);

        } catch (error) {
            qrLoading.innerText = "❌ 订单创建失败: " + error.message;
            qrLoading.style.color = "#F44336";
        }
    };

    // 弹窗关闭时清除轮询
    const modalWrapper = document.createElement("div");
    modalWrapper.appendChild(container);
    modalWrapper.addEventListener("DOMNodeRemovedFromDocument", () => {
        if (pollingInterval) clearInterval(pollingInterval);
    });

    globalModal.openModal("💰 积分充值中心", container, { width: "400px" });
}

/**
 * 提现弹窗组件 (带邮箱验证码安全风控)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onBalanceChange 提现成功后的回调刷新函数
 */
export function openWithdrawModal(currentUser, onBalanceChange) {
    // 后端会返回实际的“可提现收益 (earn_balance)”，这里做防御性取值
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
                <div>提现比例：10 积分 = 1 元</div>
                <div style="color: #aaa; margin-top: 4px;">预计可得：<span id="cny-amount" style="color:#4CAF50; font-weight:bold;">0.00</span> 元</div>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">提现积分数量 <span style="color: #F44336;">*</span></label>
            <input type="number" id="withdraw-amount" placeholder="最多可提取 ${maxWithdraw}" max="${maxWithdraw}" min="100" style="width: 100%; padding: 10px; background: #333; border: 1px solid #555; color: #FF9800; font-weight: bold; border-radius: 4px; box-sizing: border-box;">
            <div style="font-size: 11px; color: #888; margin-top: 5px;">* 最低提现额度为 100 积分</div>
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

    // 动态计算人民币金额
    const inputAmount = container.querySelector("#withdraw-amount");
    const cnyDisplay = container.querySelector("#cny-amount");
    inputAmount.oninput = (e) => {
        let val = parseInt(e.target.value) || 0;
        if (val > maxWithdraw) { val = maxWithdraw; e.target.value = val; }
        cnyDisplay.innerText = (val / 10).toFixed(2);
    };

    // 发送验证码防抖逻辑
    const btnSendCode = container.querySelector("#btn-send-code");
    let countdownTimer = null;

    btnSendCode.onclick = async () => {
        btnSendCode.disabled = true;
        btnSendCode.style.background = "#555";
        btnSendCode.innerText = "发送中...";
        try {
            // 复用你已有的 api.sendVerifyCode，action_type 传 "withdraw"
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

    // 提交提现
    const btnSubmit = container.querySelector("#btn-submit-withdraw");
    btnSubmit.onclick = async () => {
        const amount = parseInt(inputAmount.value);
        const alipayAccount = container.querySelector("#withdraw-account").value.trim();
        const realName = container.querySelector("#withdraw-name").value.trim();
        const code = container.querySelector("#withdraw-code").value.trim();

        if (!amount || amount < 100) return showToast("最低提现额度为 100 积分！", "warning");
        if (!alipayAccount || !realName) return showToast("请完整填写收款人支付宝账号与真实姓名！", "warning");
        if (code.length !== 6) return showToast("请输入 6 位有效验证码！", "warning");

        btnSubmit.innerHTML = "⏳ 提交中...";
        btnSubmit.disabled = true;

        try {
            // 【此处对接未来的 FastAPI 提现申请接口】
            // await api.submitWithdraw({ amount, alipayAccount, realName, code });
            
            // 模拟接口成功
            await new Promise(r => setTimeout(r, 1500));
            
            showToast("🎉 提现申请提交成功！预计 1-3 个工作日内打款至您的支付宝。", "success");
            globalModal.closeTopModal();
            
            if (onBalanceChange) {
                currentUser.earn_balance -= amount; // 扣除可提现余额，转移到冻结余额
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