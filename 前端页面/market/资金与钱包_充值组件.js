// 前端页面/market/资金与钱包_充值组件.js
import { showToast } from "../components/UI交互提示组件.js";
import { globalModal } from "../components/全局弹窗管理器.js";
import { api } from "../core/网络请求_业务API.js";

/**
 * 充值弹窗组件 (真实拉起支付宝网关)
 * @param {Object} currentUser 当前登录用户
 * @param {Function} onBalanceChange 充值成功后的回调刷新函数
 */
export function openRechargeModal(currentUser, onBalanceChange) {
    const container = document.createElement("div");
    container.style.color = "#ccc";

    const rechargeOptions = [
        { points: 10, price: 10, isCustom: false },
        { points: 100, price: 100, isCustom: false },
        { points: 1000, price: 1000, isCustom: false },
        { isCustom: true, label: "自定义" }
    ];

    let selectedOption = rechargeOptions[0];
    let paymentMethod = "alipay"; 

    const renderOptions = () => rechargeOptions.map((opt, index) => {
        const isSelected = selectedOption === opt;
        if (opt.isCustom) {
            return `
            <div class="recharge-opt ${isSelected ? 'selected' : ''}" data-index="${index}" style="flex: 1; min-width: 45%; padding: 15px; background: ${isSelected ? 'rgba(76, 175, 80, 0.2)' : '#2a2a2a'}; border: 2px solid ${isSelected ? '#4CAF50' : '#444'}; border-radius: 8px; cursor: pointer; text-align: center; transition: 0.2s;">
                <div style="font-size: 18px; font-weight: bold; color: ${isSelected ? '#4CAF50' : '#fff'}; margin-bottom: 5px; line-height: 22px;">${opt.label}</div>
                <div style="font-size: 12px; color: #888;">任意金额</div>
            </div>`;
        } else {
            return `
            <div class="recharge-opt ${isSelected ? 'selected' : ''}" data-index="${index}" style="flex: 1; min-width: 45%; padding: 15px; background: ${isSelected ? 'rgba(76, 175, 80, 0.2)' : '#2a2a2a'}; border: 2px solid ${isSelected ? '#4CAF50' : '#444'}; border-radius: 8px; cursor: pointer; text-align: center; transition: 0.2s;">
                <div style="font-size: 18px; font-weight: bold; color: ${isSelected ? '#4CAF50' : '#fff'}; margin-bottom: 5px;">${opt.points} 积分</div>
                <div style="font-size: 12px; color: #888;">￥${opt.price.toFixed(2)}</div>
            </div>`;
        }
    }).join("");

    container.innerHTML = `
        <div style="margin-bottom: 20px; text-align: center;">
            <div style="font-size: 14px; color: #aaa;">当前账号余额</div>
            <div style="font-size: 28px; font-weight: bold; color: #FF9800; margin-top: 5px;">${currentUser.balance || 0} <span style="font-size: 14px;">积分</span></div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #eee;">选择充值金额 <span style="color: #888; font-weight: normal;">(1 积分 = 1 元)</span></label>
            <div id="recharge-grid" style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${renderOptions()}
            </div>
            <div id="custom-input-container" style="display: none; margin-top: 10px;">
                <input type="number" id="custom-amount" placeholder="请输入自定义金额 (1~999999)" min="1" max="999999" style="width: 100%; padding: 10px; background: #222; border: 1px solid #4CAF50; color: #fff; border-radius: 4px; box-sizing: border-box; text-align: center; font-size: 16px; font-weight: bold; outline: none;">
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
                    <input type="radio" name="pay_method" value="wechat" disabled>
                    <span style="color: #888; font-weight: bold;">📗 微信支付(暂未开通)</span>
                </label>
            </div>
        </div>

        <div id="qr-container" style="display: none; text-align: center; margin-bottom: 20px; padding: 20px; background: #fff; border-radius: 8px;">
            <div id="qr-loading" style="color: #666; font-size: 14px; margin-bottom: 10px;">⏳ 正在连接支付网关...</div>
            <img id="qr-image" style="width: 180px; height: 180px; display: none; margin: 0 auto;">
            <div style="color: #333; font-size: 13px; margin-top: 10px; font-weight: bold;">请使用手机扫码支付 <span id="pay-price-text" style="color: #F44336;"></span> 元</div>
            <div style="color: #888; font-size: 11px; margin-top: 5px;">支付成功后此处将自动跳转，请勿关闭弹窗</div>
        </div>

        <button id="btn-create-order" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 15px; box-shadow: 0 4px 10px rgba(76, 175, 80, 0.3);">获取支付二维码</button>
    `;

    const customInputContainer = container.querySelector("#custom-input-container");
    const customAmountInput = container.querySelector("#custom-amount");

    const bindGridEvents = () => {
        container.querySelectorAll('.recharge-opt').forEach(el => {
            el.onclick = () => {
                selectedOption = rechargeOptions[parseInt(el.getAttribute('data-index'))];
                container.querySelector('#recharge-grid').innerHTML = renderOptions();
                
                if (selectedOption.isCustom) {
                    customInputContainer.style.display = "block";
                    customAmountInput.focus();
                } else {
                    customInputContainer.style.display = "none";
                    customAmountInput.value = ""; 
                }
                bindGridEvents(); 
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
        let finalPoints = 0;
        let finalPrice = 0;

        if (selectedOption.isCustom) {
            const customVal = parseInt(customAmountInput.value);
            if (!customVal || customVal <= 0 || customVal > 999999) {
                return showToast("请输入 6 位以内有效的整数充值金额！", "warning");
            }
            finalPoints = customVal;
            finalPrice = customVal;
        } else {
            finalPoints = selectedOption.points;
            finalPrice = selectedOption.price;
        }

        btnCreateOrder.style.display = "none";
        qrContainer.style.display = "block";
        qrLoading.style.display = "block";
        qrImage.style.display = "none";
        
        try {
            // 封装带有 Token 的请求头
            const token = localStorage.getItem("ComfyCommunity_Token") || sessionStorage.getItem("ComfyCommunity_Token");
            const headers = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            // 1. 发起真实创建订单请求
            const res = await fetch("https://zhiwei666-comfyui-ranking-api.hf.space/api/wallet/create_recharge_order", {
                method: "POST", headers: headers,
                body: JSON.stringify({ account: currentUser.account, amount: finalPoints })
            }).then(async r => {
                const data = await r.json();
                if (!r.ok) throw new Error(data.detail || data.error || "请求被拒绝");
                return data;
            });
            
            qrLoading.style.display = "none";
            
            // 2. 利用免费接口将返回的支付字符串转成真实二维码图片
qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(res.qr_code)}`;
            qrImage.style.display = "block";
            container.querySelector("#pay-price-text").innerText = finalPrice.toFixed(2);

            // 3. 开启真实轮询查单，监听回调
            pollingInterval = setInterval(async () => {
                try {
                    const checkRes = await fetch(`https://zhiwei666-comfyui-ranking-api.hf.space/api/wallet/check_order/${res.order_id}?account=${currentUser.account}`, { headers })
                      .then(r => r.json());
                                          
                    if (checkRes.status === "SUCCESS") {
                        clearInterval(pollingInterval);
                        globalModal.closeTopModal();
                        showToast(`✅ 充值成功！已实时到账 ${finalPoints} 积分。`, "success");

                        // 不做乐观更新，从服务器获取真实余额
                        try {
                            const walletRes = await api.getWallet(currentUser.account);
                            if (walletRes && walletRes.balance !== undefined) {
                                currentUser.balance = walletRes.balance;
                            } else {
                                currentUser.balance = (currentUser.balance || 0) + finalPoints;  // fallback
                            }
                        } catch(e) {
                            currentUser.balance = (currentUser.balance || 0) + finalPoints;  // fallback
                        }

                        if (onBalanceChange) {
                            onBalanceChange(currentUser.balance);
                        }
                    }
                } catch (e) {
                    // 查单接口网络波动不中断主流程
                    console.warn("轮询波动...", e);
                }
            }, 3000);

        } catch (error) {
            qrLoading.innerText = "❌ 创建订单失败: " + error.message;
            qrLoading.style.color = "#F44336";
        }
    };

    const modalWrapper = document.createElement("div");
    modalWrapper.appendChild(container);
    modalWrapper.addEventListener("DOMNodeRemovedFromDocument", () => {
        if (pollingInterval) clearInterval(pollingInterval);
    });

    globalModal.openModal("💰 积分充值中心", container, { width: "400px" });
}