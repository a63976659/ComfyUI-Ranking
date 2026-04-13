// 前端页面/market/资源安装引擎.js
import { app } from "../../../scripts/app.js"; 
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { api } from "../core/网络请求API.js"; 
import { openUserProfileModal } from "../profile/个人中心视图.js";
import { CACHE } from "../core/全局配置.js";
import { removeCache } from "../components/性能优化工具.js";

// ==========================================
// 📦 已获取资源记录管理
// ==========================================

/**
 * 🗑️ 清除使用量相关缓存
 */
function clearUsesCache() {
    removeCache('api_/api/items');
    removeCache('api_/api/creators');
    const tabs = ['tools', 'apps', 'recommends', 'creators'];
    const sorts = ['time', 'downloads', 'likes', 'favorites', 'tips', 'views', 'daily_views'];
    for (const tab of tabs) {
        for (const sort of sorts) {
            removeCache(`ListCache_${tab}_${sort}`);
        }
    }
    console.log('📊 使用量缓存已清除');
}

/**
 * 保存已获取的资源记录到本地
 * @param {Object} itemData - 资源数据
 */
function saveAcquiredItem(itemData) {
    try {
        const key = CACHE.LOCAL_KEYS.ACQUIRED_ITEMS;
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        
        // 检查是否已存在，如果存在则更新
        const index = existing.findIndex(item => item.id === itemData.id);
        const record = {
            id: itemData.id,
            title: itemData.title,
            type: itemData.type,
            author: itemData.author,
            shortDesc: itemData.shortDesc,
            coverBase64: itemData.coverBase64,
            link: itemData.link,
            price: itemData.price || 0,
            local_version: itemData.latest_version,
            acquired_at: Date.now()
        };
        
        if (index >= 0) {
            existing[index] = record;
        } else {
            existing.unshift(record); // 新记录放在最前面
        }
        
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
        console.warn("保存已获取资源记录失败:", e);
    }
}

/**
 * 获取所有已获取的资源记录
 * @returns {Array}
 */
export function getAcquiredItems() {
    try {
        const key = CACHE.LOCAL_KEYS.ACQUIRED_ITEMS;
        return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (e) {
        return [];
    }
}

/**
 * 检查资源是否已安装
 * @param {string} itemId - 资源ID
 * @returns {Object|null} { installed: boolean, hasUpdate: boolean, localVersion: string|null }
 */
export function checkItemStatus(itemId, cloudVersion) {
    const localVersion = localStorage.getItem(`ComfyCommunity_LocalVer_${itemId}`);
    if (!localVersion) {
        return { installed: false, hasUpdate: false, localVersion: null };
    }
    const hasUpdate = cloudVersion && localVersion !== cloudVersion;
    return { installed: true, hasUpdate, localVersion };
}

export function setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox) {
    btnUse.onclick = async (e) => {
        e.stopPropagation();
        if (!currentUser) return showToast("⚠️ 请先登录您的社区账号后再获取！", "warning");

        const isFree = !itemData.price || itemData.price <= 0 || currentUser.account === itemData.author;
        const isTool = itemData.type === 'tool' || itemData.type === 'recommend_tool';
        const isApp = itemData.type === 'app' || itemData.type === 'recommend_app';

        // 【新增】：本地前置余额校验（购买前动态获取最新余额）
        if (!isFree) {
            try {
                const walletRes = await api.getWallet(currentUser.account);
                if (walletRes && walletRes.status === "success") {
                    currentUser.balance = walletRes.balance || 0;
                }
            } catch (e) {
                console.warn("获取钱包余额失败:", e);
            }
            
            if ((currentUser.balance || 0) < itemData.price) {
                if (await showConfirm(`您的积分余额不足（当前：${currentUser.balance || 0}，需要：${itemData.price}）。是否前往个人中心充值？`)) {
                    if (typeof globalModal !== 'undefined') globalModal.closeTopModal();
                    // 【修复点】：直接调用函数唤起个人中心，解决白屏 Bug
                    openUserProfileModal(currentUser);
                }
                return; // 余额不足，直接终止后续所有云端请求
            }
        }

        // 防线 1：扣费前进行死链探测 (解决问题 1)
        if (!isFree) {
            inlineStatusBox.style.display = "block";
            inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 正在检测云端资源有效性...</span>`;
            
            try {
                // 直接向云端发起验证
                const valRes = await fetch("https://zhiwei666-comfyui-ranking-api.hf.space/api/validate_resource", {
                    method: "POST", headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        url: itemData.link,
                        item_id: itemData.id,
                        account: currentUser.account
                    })
                });
                const valData = await valRes.json();
                if (!valRes.ok || valData.error) {
                    inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 拦截提示: ${valData.error || '无法访问源地址'}</span>`;
                    return; // 发现死链，强行阻断用户付款
                }
            } catch(e) {
                // 验证接口网络波动不阻断主流程
            }

            const confirmPay = await showConfirm(`该资源标价为 <strong style="color:#FF9800;">${itemData.price} 积分</strong>。<br><br>确认获取吗？<br><span style="font-size:12px;color:#aaa;">(注：一次购买永久免费，如果已购买过系统将直接放行，不会重复扣款)</span>`);
            if (!confirmPay) {
                inlineStatusBox.style.display = "none";
                return;
            }
        } else {
            inlineStatusBox.style.display = "block";
        }

        inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 正在校验购买状态与扣款安全...</span>`;

        // 记录是否已经拥有，决定是否涨销量
        let alreadyOwned = false; 

        // 防线 2：事务级扣费 (天然解决问题 3，意外中断不重扣)
        let purchaseRes = null;  // ☁️ 保存购买响应（包含网盘密码）
        // 🐛 Bug修复：防御性校验，防止 itemId 为空
        if (!itemData.id) {
            console.warn('⚠️ 资源安装: itemData.id 为空，已拦截无效请求');
            inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 获取失败：资源ID无效</span>`;
            return;
        }
        try {
            purchaseRes = await api.purchaseItem(currentUser.account, itemData.id);
            
            // 【需求2修改核心】：如果返回 already_owned，改变提示
            if (purchaseRes && purchaseRes.already_owned) {
                alreadyOwned = true;
                if (!isFree) showToast("您已购买过此商品，此次使用不会收费！", "info");
            } else if (!isFree) {
                showToast(`支付成功！已扣除 ${itemData.price} 积分。`, "success");
            }

            // 更新用户本地显示的余额缓存
            try {
                const profileRes = await api.getUserProfile(currentUser.account);
                if (profileRes.data && profileRes.data.balance !== undefined) {
                    currentUser.balance = profileRes.data.balance;
                }
            } catch(e) {}

        } catch (err) {
            // 【需求3修改核心】：捕获余额不足异常，阻断流程并引导充值
            if (err.message && err.message.includes("余额不足")) {
                inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 获取失败：积分余额不足。</span>`;
                if (await showConfirm("您的积分余额不足，是否立刻前往个人中心充值？")) {
                    // 【修复点】：直接调用函数唤起个人中心，解决白屏 Bug
                    openUserProfileModal(currentUser);
                }
                return; // 直接退出函数，不会走到下方的安装流程
            } else {
                inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 获取失败: ${err.message}</span>`;
                showToast("获取失败：" + err.message, "error");
                return;
            }
        }

        // ☁️ 优先处理网盘资源（不论是工具还是应用）
        const isNetdisk = purchaseRes?.is_netdisk || itemData.is_netdisk;
        const netdiskPassword = purchaseRes?.netdisk_password || itemData.netdisk_password;
        
        if (isNetdisk) {
            // 网盘资源：显示链接和密码（recordItemUse 延迟到用户点击按钮后）
            saveAcquiredItem(itemData);
            
            if (netdiskPassword) {
                // 🔒 XSS防护：使用DOM API安全构建网盘密码显示区域
                inlineStatusBox.innerHTML = '';
                inlineStatusBox.style.display = 'block';
                
                const container = document.createElement('div');
                container.innerHTML = `
                    <div style="color: #4CAF50; font-weight: bold; margin-bottom: 10px;">✅ 授权通过，网盘资源信息如下：</div>
                    <div style="background: #1a1d2e; padding: 12px; border-radius: 6px; border: 1px solid #2d334a;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="color: #2196F3;">🔗 网盘链接：</span>
                            <button id="btn-netdisk-open-pwd-${itemData.id}" style="padding: 6px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">📂 打开网盘</button>
                        </div>
                        <div id="netdisk-pwd-container-${itemData.id}" style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: #FF9800;">🔐 提取码：</span>
                            <code id="netdisk-pwd-code-${itemData.id}" style="background: #333; padding: 4px 10px; border-radius: 4px; color: #FFD700; font-weight: bold; letter-spacing: 2px;"></code>
                            <button id="btn-copy-pwd-${itemData.id}" style="padding: 4px 8px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 复制</button>
                        </div>
                    </div>
                    <div style="margin-top: 8px; font-size: 11px; color: #888;">💡 提示：请复制提取码后前往网盘下载资源</div>
                `;
                inlineStatusBox.appendChild(container);
                
                // 安全设置密码文本（防止XSS）
                const pwdCodeEl = container.querySelector(`#netdisk-pwd-code-${itemData.id}`);
                if (pwdCodeEl) pwdCodeEl.textContent = netdiskPassword;
                
                // 绑定复制按钮事件
                const copyBtn = container.querySelector(`#btn-copy-pwd-${itemData.id}`);
                if (copyBtn) {
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(netdiskPassword);
                        copyBtn.textContent = '✅ 已复制';
                    };
                }
                // 绑定按钮点击事件
                const btnOpen = inlineStatusBox.querySelector(`#btn-netdisk-open-pwd-${itemData.id}`);
                if (btnOpen) {
                    btnOpen.onclick = () => {
                        window.open(itemData.link, '_blank');
                        api.recordItemUse(itemData.id).then(() => {
                            clearUsesCache();
                            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload", { detail: { force: true } }));
                        }).catch(err => console.warn('📊 使用量记录失败:', err));
                    };
                }
            } else {
                inlineStatusBox.innerHTML = `
                    <div style="color: #4CAF50; font-weight: bold; margin-bottom: 10px;">✅ 授权通过，请前往网盘下载：</div>
                    <button id="btn-netdisk-open-${itemData.id}" style="padding: 6px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">🔗 打开网盘链接</button>
                `;
                // 绑定按钮点击事件
                const btnOpen = inlineStatusBox.querySelector(`#btn-netdisk-open-${itemData.id}`);
                if (btnOpen) {
                    btnOpen.onclick = () => {
                        window.open(itemData.link, '_blank');
                        api.recordItemUse(itemData.id).then(() => {
                            clearUsesCache();
                            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload", { detail: { force: true } }));
                        }).catch(err => console.warn('📊 使用量记录失败:', err));
                    };
                }
            }
            btnUse.innerHTML = `✅ 已获取`;
            btnUse.style.background = "#4CAF50";
            return;  // ← 提前返回，不进入 Git 安装流程
        }

        if (isTool) {
            const installPromptText = isFree 
                ? "✅ 授权通过！是否通过 Git 自动将此工具克隆安装到本地 <b>custom_nodes</b> 文件夹？" 
                : "✅ 授权通过！是否开始静默下载并热覆盖到本地 <b>custom_nodes</b> 文件夹？";
                
            inlineStatusBox.innerHTML = `
                <div style="color: #ccc; margin-bottom: 10px; font-size: 13px;">${installPromptText}</div>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-confirm-install" style="padding: 6px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">✔️ 同意并安装</button>
                    <button id="btn-cancel-install" style="padding: 6px 15px; background: transparent; color: #aaa; border: 1px solid #555; border-radius: 4px; cursor: pointer;">✖ 取消</button>
                </div>
            `;
            inlineStatusBox.querySelector('#btn-cancel-install').onclick = () => inlineStatusBox.style.display = "none";
            inlineStatusBox.querySelector('#btn-confirm-install').onclick = async () => {
                inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 正在后台静默安装 (关闭侧边栏不影响进度)...</span>`;
                
                try {
                    // 🚀 双轨分流引擎：免费走直连 Clone，付费走云端防盗版 ZIP 覆写
                    // 设置了 github_token 的工具（无论免费还是付费）都走云端代理
                    
                    // 获取最新的 item 数据以确保路由决策准确
                    let freshHasPrivateToken = !!itemData.has_private_token;
                    try {
                        const freshRes = await api.getItemById(itemData.id);
                        if (freshRes.status === "success" && freshRes.data) {
                            freshHasPrivateToken = !!freshRes.data.has_private_token;
                        }
                    } catch (e) {
                        // 获取失败时使用缓存数据的值
                        console.warn("获取最新 item 数据失败，使用缓存值:", e);
                    }
                    const hasPrivateToken = freshHasPrivateToken;
                    const localApiEndpoint = (isFree && !hasPrivateToken) 
                        ? "/community_hub/install_tool" 
                        : "/community_hub/install_private_tool";
                    
                    // 发起后台异步安装请求
                    const res = await fetch(localApiEndpoint, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        // ✅ 补全 id 和 account 凭证参数
                        body: JSON.stringify({ url: itemData.link, id: itemData.id, account: currentUser.account }) 
                    });
                    const data = await res.json();
                    
                    if (data.error) {
                        inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 安装失败: ${data.error}</span>`;
                        showToast(`插件 [${itemData.title}] 安装失败: ${data.error}`, "error"); 
                    } else {
                        inlineStatusBox.innerHTML = `<div style="color: #4CAF50; font-size: 14px; font-weight: bold;">🎉 工具安装成功！</div><div style="color: #aaa; margin-top: 5px;">请重启 ComfyUI 以加载新节点。</div>`;
                        showToast(`🎉 插件 [${itemData.title}] 安装成功！请重启 ComfyUI。`, "success");
                        
                        // 🚀 安装成功后，盖上本地版本戳
                        if (itemData.latest_version) {
                            localStorage.setItem(`ComfyCommunity_LocalVer_${itemData.id}`, itemData.latest_version);
                        }
                        
                        // 记录使用量（后端自动去重）
                        try {
                            await api.recordItemUse(itemData.id);
                            clearUsesCache();
                        } catch(err) { console.warn('📊 使用量记录失败:', err); }
                        
                        // 🚀 保存到已获取记录
                        saveAcquiredItem(itemData);
                        
                        // 🚀 更新按钮状态
                        btnUse.innerHTML = `✅ 已安装`;
                        btnUse.style.background = "#4CAF50";
                    }
                } catch(err) { 
                    inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 无法连接到本地服务。</span>`; 
                }
            };
        } else if (isApp) {
            inlineStatusBox.innerHTML = `<span style="color: #2196F3;">⏳ 授权通过，正在安全鉴权并热加载入工作区...</span>`;
            
            // 附带 account 凭证，解决问题 2 (一键鉴权加载)
            try {
                const res = await fetch("/community_hub/download_app", { 
                    method: "POST", 
                    headers: { "Content-Type": "application/json" }, 
                    body: JSON.stringify({ url: itemData.link, id: itemData.id, account: currentUser.account }) 
                });
                if (!res.ok) {
                    const errText = await res.text().catch(() => '未知服务端错误');
                    inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 加载失败 (${res.status})：${errText}</span>`;
                    return;
                }
                const data = await res.json();
                if (data.error) { 
                    inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 加载失败：${data.error}</span>`; 
                    showToast(`工作流加载失败：${data.error}`, "error");
                } else {
                    app.loadGraphData(data.data); 
                    inlineStatusBox.innerHTML = `<div style="color: #4CAF50; font-weight: bold;">✅ 工作流已加载到画布！</div><div style="color: #888; margin-top: 4px;">由于本地节点差异可能出现飘红，请使用管理器补全节点。</div>`;
                    showToast(`✅ 工作流 [${itemData.title}] 已成功加载到画布！`, "success");
                    
                    // 🚀 安装成功后，盖上本地版本戳
                    if (itemData.latest_version) {
                        localStorage.setItem(`ComfyCommunity_LocalVer_${itemData.id}`, itemData.latest_version);
                    }
                    
                    // 记录使用量（后端自动去重）
                    api.recordItemUse(itemData.id).then(() => {
                        clearUsesCache();
                    }).catch(err => console.warn('📊 使用量记录失败:', err));
                    
                    // 🚀 保存到已获取记录
                    saveAcquiredItem(itemData);
                    
                    // 🚀 更新按钮状态
                    btnUse.innerHTML = `✅ 已下载`;
                    btnUse.style.background = "#4CAF50";
                }
            } catch(err) {
                console.error('❌ 应用下载失败:', err);
                inlineStatusBox.innerHTML = `<span style="color: #F44336;">❌ 无法连接到本地服务：${err.message || '网络错误'}</span>`;
            }
        } else {
            // ☁️ 网盘链接或纯链接模式（recordItemUse 延迟到用户点击按钮后）
            
            // ☁️ 从购买响应中获取网盘信息（安全：只有购买成功后才返回）
            const isNetdisk = purchaseRes?.is_netdisk || itemData.is_netdisk;
            const netdiskPassword = purchaseRes?.netdisk_password || itemData.netdisk_password;
            
            // ☁️ 网盘资源：购买后显示密码
            if (isNetdisk && netdiskPassword) {
                // 🔒 XSS防护：使用DOM API安全构建网盘密码显示区域
                inlineStatusBox.innerHTML = '';
                
                const container2 = document.createElement('div');
                container2.innerHTML = `
                    <div style="color: #4CAF50; font-weight: bold; margin-bottom: 10px;">✅ 授权通过，网盘资源信息如下：</div>
                    <div style="background: #1a1d2e; padding: 12px; border-radius: 6px; border: 1px solid #2d334a;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="color: #2196F3;">🔗 网盘链接：</span>
                            <button id="btn-netdisk-mode-pwd-${itemData.id}" style="padding: 6px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">📂 打开网盘</button>
                        </div>
                        <div id="netdisk-mode-pwd-container-${itemData.id}" style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: #FF9800;">🔐 提取码：</span>
                            <code id="netdisk-mode-pwd-code-${itemData.id}" style="background: #333; padding: 4px 10px; border-radius: 4px; color: #FFD700; font-weight: bold; letter-spacing: 2px;"></code>
                            <button id="btn-copy-mode-pwd-${itemData.id}" style="padding: 4px 8px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 复制</button>
                        </div>
                    </div>
                    <div style="margin-top: 8px; font-size: 11px; color: #888;">💡 提示：请复制提取码后前往网盘下载资源</div>
                `;
                inlineStatusBox.appendChild(container2);
                
                // 安全设置密码文本（防止XSS）
                const pwdCodeEl2 = container2.querySelector(`#netdisk-mode-pwd-code-${itemData.id}`);
                if (pwdCodeEl2) pwdCodeEl2.textContent = netdiskPassword;
                
                // 绑定复制按钮事件
                const copyBtn2 = container2.querySelector(`#btn-copy-mode-pwd-${itemData.id}`);
                if (copyBtn2) {
                    copyBtn2.onclick = () => {
                        navigator.clipboard.writeText(netdiskPassword);
                        copyBtn2.textContent = '✅ 已复制';
                    };
                }
                
                // 绑定按钮点击事件
                const btnOpen = inlineStatusBox.querySelector(`#btn-netdisk-mode-pwd-${itemData.id}`);
                if (btnOpen) {
                    btnOpen.onclick = () => {
                        window.open(itemData.link, '_blank');
                        api.recordItemUse(itemData.id).then(() => {
                            clearUsesCache();
                            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload", { detail: { force: true } }));
                        }).catch(err => console.warn('📊 使用量记录失败:', err));
                    };
                }
            } else if (isNetdisk) {
                // ☁️ 网盘资源无密码
                inlineStatusBox.innerHTML = `
                    <div style="color: #4CAF50; font-weight: bold; margin-bottom: 10px;">✅ 授权通过，请前往网盘下载：</div>
                    <button id="btn-netdisk-mode-${itemData.id}" style="padding: 6px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">🔗 打开网盘链接</button>
                `;
                // 绑定按钮点击事件
                const btnOpen = inlineStatusBox.querySelector(`#btn-netdisk-mode-${itemData.id}`);
                if (btnOpen) {
                    btnOpen.onclick = () => {
                        window.open(itemData.link, '_blank');
                        api.recordItemUse(itemData.id).then(() => {
                            clearUsesCache();
                            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload", { detail: { force: true } }));
                        }).catch(err => console.warn('📊 使用量记录失败:', err));
                    };
                }
            } else {
                // 纯链接模式
                inlineStatusBox.innerHTML = `
                    <div style="color: #4CAF50; font-weight: bold; margin-bottom: 10px;">✅ 授权通过，该资源需手动访问源地址获取：</div>
                    <button id="btn-pure-link-${itemData.id}" style="padding: 6px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">🔗 前往获取</button>
                `;
                // 绑定按钮点击事件
                const btnOpen = inlineStatusBox.querySelector(`#btn-pure-link-${itemData.id}`);
                if (btnOpen) {
                    btnOpen.onclick = () => {
                        window.open(itemData.link, '_blank');
                        api.recordItemUse(itemData.id).then(() => {
                            clearUsesCache();
                            window.dispatchEvent(new CustomEvent("comfy-trigger-sidebar-reload", { detail: { force: true } }));
                        }).catch(err => console.warn('📊 使用量记录失败:', err));
                    };
                }
            }
        }
    };
}