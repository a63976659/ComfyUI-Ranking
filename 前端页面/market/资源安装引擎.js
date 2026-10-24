// 前端页面/market/资源安装引擎.js
import { showToast, showConfirm, createInstallProgress } from "../components/UI交互提示组件.js";
import { api } from "../core/网络请求API.js";
import { requestSSE, request } from "../core/网络请求_基础设施.js";
import { openUserProfileModal } from "../profile/个人中心视图.js";
import { API, CACHE, SKILL_INSTALL, UI, IS_WEB_MODE, escapeHtml, getSidebarListCacheKey } from "../core/全局配置.js";
import { t } from "../components/用户体验增强.js";
import { createResourceOperationScope } from "./资源操作生命周期.js";
import { describeInstallSource } from "./安装来源.js";
import { attachInstallDirectory } from "./安装目录.js";
import { isValidPurchaseStatus } from "./购买状态生命周期.js";
import { saveAcquiredItem } from "./资源获取记录.js";
export { getAcquiredItems } from "./资源获取记录.js";

// 📱 Web 模式兼容：ComfyUI 的 app 对象仅存在于本地环境，改为受保护动态导入
// （Web 模式不暴露安装/下载入口，不会走到此路径；万一走到也不抛错）
async function _loadGraphToCanvas(graphData, isCurrent) {
    if (!isCurrent() || !graphData || typeof graphData !== "object" || Array.isArray(graphData) || Object.hasOwn(graphData, "error")) return false;
    try {
        const { app } = await import("../../../scripts/app.js");
        if (!isCurrent()) return false;
        await app.loadGraphData(graphData);
        return true;
    } catch (e) {
        console.warn("当前环境无法加载工作流到画布");
        return false;
    }
}
import { removeCache, removeCacheByPrefix } from "../components/性能优化工具.js";

// ==========================================
// 📦 已获取资源记录管理
// ==========================================

/**
 * 🗑️ 清除使用量相关缓存
 */
function clearUsesCache() {
    // 🔧 修复：API 层缓存键带完整查询串，removeCache 精确删除命中不到（no-op），
    // 安装后使用量/下载数仍会从旧缓存返回，改用前缀删除
    removeCacheByPrefix('api_/api/items');
    removeCacheByPrefix('api_/api/creators');
    const tabs = ['tools', 'skills', 'apps', 'recommends', 'creators'];
    const sorts = ['time', 'downloads', 'likes', 'favorites', 'tips', 'views', 'daily_views', 'rating'];
    for (const tab of tabs) {
        for (const sort of sorts) {
            removeCache(getSidebarListCacheKey(tab, sort));
        }
    }
    console.log('📊 使用量缓存已清除');
}

/**
 * 🔒 P0安全加固：读取当前登录 Token（转发给本地插件，由其代理向云端做 Authorization 鉴权）
 * @returns {string} JWT Token（未登录时为空字符串）
 */
function _getAuthToken() {
    try {
        const localToken = localStorage.getItem("ComfyCommunity_Token");
        if (localToken) return localToken;
    } catch (error) {
        console.warn('无法读取本地登录凭证存储');
    }
    try {
        return sessionStorage.getItem("ComfyCommunity_Token") || "";
    } catch (error) {
        console.warn('无法读取会话登录凭证存储');
        return "";
    }
}

function _getInstallErrorMessage(result) {
    if (result?.outcomeUnknown) return t('install.connection_uncertain');
    const errorKeys = {
        missing_params: 'install.error_missing_params',
        invalid_repository: 'install.error_invalid_repository',
        invalid_target: 'install.error_invalid_target',
        git_missing: 'install.error_git_missing',
        install_timeout: 'install.error_timeout',
        install_queue_timeout: 'install.error_queue_timeout',
        install_queue_full: 'install.error_queue_full',
        git_clone_failed: 'install.error_git_clone',
        insufficient_disk_space: 'install.error_disk_space',
        remote_rejected: 'install.error_remote_rejected',
        source_changed: 'install.error_source_changed',
        package_too_large: 'install.error_package_too_large',
        repository_too_large: 'install.error_repository_too_large',
        process_guard_unavailable: 'install.error_process_guard',
        download_failed: 'install.error_download',
        target_occupied: 'install.error_target_occupied',
        permission_denied: 'install.error_permission_denied',
        invalid_archive: 'install.error_invalid_archive',
        install_failed: 'install.error_generic'
    };
    const errorKey = Object.hasOwn(errorKeys, result?.error_code) ? errorKeys[result.error_code] : "";
    return errorKey ? t(errorKey) : t('install.error_generic');
}

/** 流式与旧式安装共用终态确认；旧式响应另核查HTTP状态。 */
function _getInstallOutcome(data, response = null) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return "unknown";
    if (Object.hasOwn(data, "outcomeUnknown") && data.outcomeUnknown !== false) return "unknown";
    if (data.message !== undefined && typeof data.message !== "string") return "unknown";
    if (data.status === "success") {
        return (!response || response.ok) && !Object.hasOwn(data, "error") && !Object.hasOwn(data, "error_code")
            ? "success" : "unknown";
    }
    if ((!response && data.status !== "error") || (data.status !== undefined && data.status !== "error")) return "unknown";
    if (data.error_code !== undefined && (typeof data.error_code !== "string" || !data.error_code.trim())) return "unknown";
    if (data.error !== undefined && (typeof data.error !== "string" || !data.error.trim())) return "unknown";
    if (data.status === "error" || typeof data.error_code === "string") return "error";
    // 无错误码的旧响应仅接受明确客户端拒绝或成功HTTP中的旧式error字段。
    // 服务器/网关5xx本身不能证明磁盘发布没有发生。
    if (typeof data.error === "string" && response && (response.ok || (response.status >= 400 && response.status < 500))) return "error";
    return "unknown";
}

const INSTALL_STAGE_KEYS = {
    queued: 'install.stage_queued',
    validate: 'install.stage_validate',
    auth: 'install.stage_auth',
    cleanup: 'install.stage_cleanup',
    git_mirror: 'install.stage_git_mirror',
    git_cloning: 'install.stage_git_clone',
    git_fallback: 'install.stage_git_fallback',
    git_direct: 'install.stage_git_direct',
    downloading: 'install.stage_downloading',
    download_done: 'install.stage_download_done',
    extracting: 'install.stage_extracting',
    installing: 'install.stage_installing',
    complete: 'install.stage_complete',
    error: 'install.stage_failed'
};

function _installTransferText(event, message) {
    const spec = UI.INSTALL_TRANSFER;
    if (!spec.STAGES.includes(event.stage) || event.status === 'error') return message;
    const value = event.transfer;
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !Number.isSafeInteger(value.received_bytes) || value.received_bytes < 0 || value.received_bytes > spec.MAX_BYTES) return message;
    const total = value.total_bytes;
    if (total != null && (!Number.isSafeInteger(total) || total <= 0 || total > spec.MAX_BYTES || value.received_bytes > total)) return message;
    function size(bytes) {
        let unit = 0;
        while (bytes >= spec.BASE && unit + 1 < spec.UNIT_KEYS.length) { bytes /= spec.BASE; unit++; }
        return `${unit ? bytes.toFixed(1) : String(bytes)} ${t(spec.UNIT_KEYS[unit])}`;
    }
    const received = size(value.received_bytes);
    const label = total == null ? t('install.transfer_unknown', { stage: message, received })
        : t('install.transfer_known', { stage: message, received, total: size(total) });
    const rate = value.bytes_per_second;
    return Number.isSafeInteger(rate) && rate >= 0 && rate <= spec.MAX_RATE
        ? t('install.transfer_rate', { label, rate: size(rate) }) : label;
}

const WORKFLOW_STAGE_KEYS = {
    validate: 'workflow.stage_validate',
    cache_check: 'workflow.stage_cache_check',
    cache_hit: 'workflow.stage_cache_hit',
    downloading: 'workflow.stage_downloading',
    saving: 'workflow.stage_saving',
    complete: 'workflow.stage_download_complete',
    error: 'workflow.stage_failed'
};

function _createProgressDiagnostics(stageKeys) {
    const entries = [], startedAt = Date.now();
    return {
        entries,
        record(event) {
            const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            const rawStage = typeof event.stage === 'string' ? event.stage : '';
            entries.push({
                stageKey: Object.hasOwn(stageKeys, rawStage) ? stageKeys[rawStage] : '',
                progress: Number.isFinite(event.progress) ? Math.max(0, Math.min(100, event.progress)) : null,
                time: `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
            });
            if (entries.length > 50) entries.shift();
        }
    };
}

function _getWorkflowErrorMessage(result) {
    if (result?.outcomeUnknown) return t('workflow.connection_uncertain');
    const errorKeys = {
        invalid_request: 'workflow.error_invalid_request',
        missing_params: 'workflow.error_missing_params',
        invalid_app_id: 'workflow.error_invalid_id',
        invalid_workflow_data: 'workflow.error_invalid_data',
        auth_failed: 'workflow.error_auth',
        remote_rejected: 'workflow.error_remote',
        network_failed: 'workflow.error_network',
        cloud_cooldown: 'workflow.error_cloud_cooldown',
        download_failed: 'workflow.error_generic'
    };
    const errorKey = Object.hasOwn(errorKeys, result?.error_code) ? errorKeys[result.error_code] : "";
    return errorKey ? t(errorKey) : t('workflow.error_generic');
}

/**
 * 渲染网盘资源UI（链接+密码+按钮绑定）
 * @param {HTMLElement} inlineStatusBox - 状态显示容器
 * @param {Object} itemData - 资源数据
 * @param {string} netdiskPassword - 网盘密码（为空则显示无密码版本）
 */
function _getSafeExternalUrl(link) {
    let parsedUrl;
    try {
        if (typeof link !== 'string' || !link.trim()) throw new Error('Missing resource link');
        parsedUrl = new URL(link.trim());
    } catch (_) {
        showToast(t('netdisk.invalid_link'), 'error');
        return null;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
        showToast(t('netdisk.invalid_link'), 'error');
        return null;
    }
    return parsedUrl.href;
}

function _openExternalResource(link, itemId, isCurrent) {
    if (!isCurrent()) return;
    const safeUrl = _getSafeExternalUrl(link);
    if (!safeUrl) return;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    api.recordItemUse(itemId).then(() => {
        if (!isCurrent()) return;
        clearUsesCache();
        window.dispatchEvent(new CustomEvent('comfy-trigger-sidebar-reload', { detail: { force: true } }));
    }).catch(() => {});
}

function _renderNetdiskUI(inlineStatusBox, itemData, netdiskPassword, isCurrent) {
    if (!isCurrent()) return;
    inlineStatusBox.replaceChildren();
    inlineStatusBox.style.display = 'block';

    const container = document.createElement('div');
    container.className = 'netdisk-card';
    const summary = document.createElement('div');
    summary.className = 'netdisk-card__summary';
    summary.textContent = t(netdiskPassword ? 'netdisk.authorized_with_password' : 'netdisk.authorized_no_password');
    container.appendChild(summary);

    const panel = document.createElement('div');
    panel.className = 'netdisk-card__panel';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'netdisk-card__open';
    openButton.textContent = t('netdisk.open');
    openButton.addEventListener('click', () => _openExternalResource(itemData.link, itemData.id, isCurrent));

    let hint = null;
    if (netdiskPassword) {
        const row = document.createElement('div');
        row.className = 'netdisk-card__row';
        const codeLabel = document.createElement('span');
        codeLabel.className = 'netdisk-card__label';
        codeLabel.textContent = t('netdisk.code_label');
        const code = document.createElement('code');
        code.className = 'netdisk-card__code';
        code.textContent = netdiskPassword;
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'netdisk-card__copy';
        copyButton.textContent = t('netdisk.copy');
        copyButton.addEventListener('click', async () => {
            if (!isCurrent()) return;
            try {
                await navigator.clipboard.writeText(netdiskPassword);
                if (isCurrent()) copyButton.textContent = t('common.copied');
            } catch (error) {
                if (isCurrent()) showToast(t('netdisk.copy_failed'), 'error');
            }
        });
        row.append(codeLabel, code, copyButton);
        panel.append(row);

        hint = document.createElement('div');
        hint.className = 'netdisk-card__hint';
        hint.textContent = t('netdisk.download_hint');
    }

    panel.prepend(openButton);
    container.appendChild(panel);
    if (hint) container.appendChild(hint);
    inlineStatusBox.appendChild(container);
}

/**
 * 检查资源是否已安装
 * @param {string} itemId - 资源ID
 * @returns {{installed: boolean, hasUpdate: boolean, localVersion: string|null, storageAvailable: boolean}}
 */
export function checkItemStatus(itemId, cloudVersion) {
    const versionStatus = getInstalledVersionStatus(itemId);
    const localVersion = versionStatus.version;
    if (!localVersion) {
        return { installed: versionStatus.installed === true, hasUpdate: false, localVersion: null, storageAvailable: versionStatus.available };
    }
    const hasUpdate = cloudVersion && localVersion !== cloudVersion;
    return { installed: true, hasUpdate, localVersion, storageAvailable: versionStatus.available };
}

const failedInstalledVersionWrites = new Map();

export function getInstalledVersionStatus(itemId) {
    try {
        const failedWrite = failedInstalledVersionWrites.has(itemId);
        const recorded = failedWrite ? failedInstalledVersionWrites.get(itemId)
            : localStorage.getItem(CACHE.LOCAL_KEYS.INSTALLED_VERSION_PREFIX + itemId);
        const unconfirmed = recorded === CACHE.INSTALLED_VERSION_UNCONFIRMED;
        return { version: unconfirmed ? null : recorded, installed: !!recorded, versionConfirmed: !!recorded && !unconfirmed, available: !failedWrite };
    } catch (error) {
        console.warn('无法读取本地安装版本标记');
        return { version: null, installed: false, versionConfirmed: false, available: false };
    }
}

export function saveInstalledVersion(itemId, version) {
    if (!version) return true;
    try {
        localStorage.setItem(CACHE.LOCAL_KEYS.INSTALLED_VERSION_PREFIX + itemId, version);
        failedInstalledVersionWrites.delete(itemId);
        return true;
    } catch (error) {
        failedInstalledVersionWrites.set(itemId, version);
        console.warn('无法保存本地安装版本标记');
        return false;
    }
}

function _recordToolInstalledVersion(itemId, result) {
    const value = result?.installed_version;
    const confirmed = typeof value === "string" && /^(?:[a-f0-9]{7}|[a-f0-9]{40})$/i.test(value.trim());
    const version = confirmed ? value.trim().slice(0, 7).toLowerCase() : CACHE.INSTALLED_VERSION_UNCONFIRMED;
    if (!saveInstalledVersion(itemId, version)) {
        showToast(t('install.version_record_unavailable'), 'warning');
    }
    if (!confirmed) showToast(t('install.version_unconfirmed'), 'warning');
}

function _guessInstallTargetName(itemUrl) {
    try {
        const lastSegment = String(itemUrl).replace(/\/+$/, '').split('/').pop() || '';
        const name = lastSegment.replace(/\.git$/i, '');
        return /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..' && !name.includes('..')
            ? name
            : null;
    } catch (error) {
        return null;
    }
}

const activeOperations = new Map();
let latestWalletRefresh = 0;

export function setupResourceInstall(btnUse, itemData, currentUser, inlineStatusBox, options = {}) {
    btnUse.type = "button";
    btnUse.classList.add("resource-install__button");
    for (const property of ["background", "color", "border", "border-color"]) btnUse.style.removeProperty(property);
    inlineStatusBox.classList.add("resource-install__status");
    const account = currentUser?.account, token = _getAuthToken();
    const scope = createResourceOperationScope(btnUse, inlineStatusBox, account, options);
    const isCurrent = () => scope.isCurrent();
    const confirm = (message, options = {}) => showConfirm(message, { ...options, signal: scope.confirmationSignal });
    let phase = "idle", previousProgress, removeProgressCleanup = () => {};
    const operationKey = JSON.stringify([account, String(itemData.id)]);
    scope.addCleanup(() => { if (activeOperations.get(operationKey) === scope) activeOperations.delete(operationKey); });
    const trackProgress = () => {
        removeProgressCleanup(); previousProgress?.destroy();
        previousProgress = createInstallProgress(inlineStatusBox);
        const progress = previousProgress;
        removeProgressCleanup = scope.addCleanup(() => progress.destroy());
        return progress;
    };
    const releaseButton = () => {
        if (phase !== "idle") return;
        if (activeOperations.get(operationKey) === scope) activeOperations.delete(operationKey);
        if (isCurrent()) { btnUse.disabled = false; btnUse.removeAttribute("aria-busy"); }
    };
    btnUse.onclick = async (e) => {
        e.stopPropagation();
        if (!isCurrent() || phase !== "idle" || activeOperations.has(operationKey)) return;
        if (!account) return showToast(t('auth.login_required'), "warning");
        activeOperations.set(operationKey, scope);
        ++latestWalletRefresh;  // 新操作使先前余额补新失效。
        phase = "preflight"; btnUse.disabled = true; btnUse.setAttribute("aria-busy", "true");
        let restoreFocus = false;
        try {
            const price = itemData.price ?? 0;
            if (!Number.isSafeInteger(price) || price < 0 || !itemData.id) {
                showToast(t('acquire.invalid_id'), "error"); return;
            }
            const isFree = price === 0 || account === itemData.author;
            const isTool = itemData.type === 'tool' || itemData.type === 'recommend_tool';
            const isSkill = itemData.type === 'skill' || itemData.type === 'recommend_skill';
            let skillFlow, skillTarget;
            const isApp = itemData.type === 'app' || itemData.type === 'recommend_app';
            if (IS_WEB_MODE && isFree) return showToast(t('web.install_on_desktop'), "warning");

            // 同一次新读取决定是否拥有；查询失败不能继续到付款。
            let alreadyOwned = false;
            try {
                const status = await api.getPurchaseStatus(account, itemData.id, scope.readOptions);
                if (!isCurrent()) return;
                if (!isValidPurchaseStatus(status)) throw new Error();
                if (status.price_confirmation_supported !== true) {
                    showToast(t('acquire.purchase_verification_unavailable'), "warning");
                    return;
                }
                alreadyOwned = status.owned;
            } catch (_) {
                if (isCurrent()) showToast(t('common.network_error_retry'), "error");
                return;
            }
            if (IS_WEB_MODE && alreadyOwned) return showToast(t('item.owned_purchased'), "warning");

            if (!IS_WEB_MODE && isSkill && itemData.is_netdisk !== true) {
                skillFlow = await import('./Skill安装流程.js');
                if (!isCurrent()) return;
                skillTarget = await skillFlow.chooseSkillDirectory(scope);
                if (!isCurrent()) return;
                if (!skillTarget) { restoreFocus = true; return; }
            }

            if (!isFree && !alreadyOwned) {
                let balance;
                try {
                    const wallet = await api.getWallet(account, scope.readOptions);
                    if (!isCurrent()) return;
                    if (wallet?.status !== "success" || !Number.isSafeInteger(wallet.balance) || wallet.balance < 0) throw new Error();
                    balance = wallet.balance;
                } catch (_) {
                    if (isCurrent()) showToast(t('common.network_error_retry'), "error");
                    return;
                }
                if (balance < price) {
                    const recharge = await confirm(`${t('acquire.balance_short', { balance, price })} ${t('acquire.balance_recharge_prompt')}`);
                    if (recharge && isCurrent()) await openUserProfileModal(currentUser);
                    return;
                }
                if (itemData.is_netdisk === true) {
                    if (!_getSafeExternalUrl(itemData.link)) return;
                } else {
                    inlineStatusBox.style.display = "block";
                    inlineStatusBox.textContent = t('acquire.validation_running');
                    const validationController = new AbortController();
                    const removeValidationCleanup = scope.addCleanup(() => validationController.abort());
                    const timeout = setTimeout(() => validationController.abort(), isSkill ? SKILL_INSTALL.PREFLIGHT_TIMEOUT : API.BACKGROUND_TIMEOUT);
                    let validationMessage = t('common.network_error_retry');
                    try {
                        const response = await fetch(`${API.BASE_URL}/api/validate_resource`, {
                            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                            body: JSON.stringify({ url: itemData.link, item_id: itemData.id, account }),
                            signal: validationController.signal
                        });
                        if (!isCurrent()) return;
                        const data = await response.json();
                        if (!isCurrent()) return;
                        if (isSkill && !response.ok) {
                            validationMessage = t(data?.error_code === 'invalid_repository' ? 'install.error_invalid_repository'
                                : data?.error_code === 'invalid_skill_package' ? 'skill.invalid_package' : 'skill.source_unavailable');
                            throw new Error();
                        }
                        if (!response.ok || data?.status !== "success" || data.error) throw new Error();
                        if (isSkill && data.skill_repository_verified !== true) {
                            validationMessage = t('skill.cloud_update_required');
                            throw new Error();
                        }
                    } catch (_) {
                        if (isCurrent()) inlineStatusBox.textContent = t('acquire.validation_blocked', { message: validationMessage });
                        return;
                    } finally { clearTimeout(timeout); removeValidationCleanup(); }
                }
                const confirmPay = await confirm(t('acquire.purchase_confirmation_html', { price }), { html: true });
                if (!isCurrent()) return;
                if (!confirmPay) { inlineStatusBox.style.display = "none"; return; }
            }
            if (!isCurrent()) return;
            inlineStatusBox.style.display = "block";
            inlineStatusBox.textContent = t('acquire.purchase_running');
            let purchaseRes;
            try {
                purchaseRes = await api.purchaseItem(account, itemData.id, isFree ? 0 : price);
                if (!isCurrent()) return;
                if (purchaseRes?.status !== "success" || typeof purchaseRes.already_owned !== "boolean"
                    || typeof purchaseRes.is_netdisk !== "boolean"
                    || (purchaseRes.netdisk_password != null && typeof purchaseRes.netdisk_password !== "string")) throw new Error();
            } catch (error) {
                if (!isCurrent()) return;
                inlineStatusBox.setAttribute("role", "alert");
                if (["purchase_price_changed", "purchase_price_confirmation_required"].includes(error?.code)) {
                    phase = "unknown"; btnUse.removeAttribute("aria-busy");
                    inlineStatusBox.textContent = t('acquire.price_changed');
                } else if (error?.status >= 400 && error.status < 500) {
                    inlineStatusBox.textContent = t(error.status === 402 ? 'acquire.purchase_balance_short' : 'common.error');
                } else {
                    phase = "unknown"; btnUse.removeAttribute("aria-busy");
                    inlineStatusBox.textContent = t('acquire.purchase_unknown');
                }
                return;
            }
            alreadyOwned = purchaseRes.already_owned;
            if (!isFree) showToast(t(alreadyOwned ? 'acquire.already_owned_no_charge' : 'acquire.purchase_success', { price }), alreadyOwned ? "info" : "success");
            // 权威余额来自 SQL 钱包；补新不阻塞已经确认的资源交付。
            if (!isFree) {
                const walletVersion = ++latestWalletRefresh;
                api.getWallet(account, scope.readOptions).then(wallet => {
                    if (walletVersion !== latestWalletRefresh || !isCurrent() || wallet?.status !== "success" || !Number.isSafeInteger(wallet.balance) || wallet.balance < 0) return;
                    currentUser.balance = wallet.balance;
                    window.dispatchEvent(new CustomEvent("comfy-wallet-update", { detail: { account, balance: wallet.balance } }));
                }).catch(() => {});
            }
            if (!isCurrent()) return;

            // 📱 Web 模式：购买完成即止，不进入任何下载/安装/网盘交付分支
            if (IS_WEB_MODE) {
                inlineStatusBox.style.display = "block";
                inlineStatusBox.innerHTML = alreadyOwned
                    ? `<span class="resource-install__message resource-install__message--success">✅ ${escapeHtml(t('item.owned_purchased'))}</span>`
                    : `<span class="resource-install__message resource-install__message--success">✅ ${escapeHtml(t('web.purchase_success_desktop'))}</span>`;
                showToast(t('web.install_on_desktop'), "info");
                return;
            }

            // ☁️ 优先处理网盘资源（不论是工具还是应用）
            const isNetdisk = purchaseRes.is_netdisk;
            const netdiskPassword = purchaseRes.netdisk_password;

            if (isNetdisk) {
                // 网盘资源：显示链接和密码（recordItemUse 延迟到用户点击按钮后）
                saveAcquiredItem(itemData);
                _renderNetdiskUI(inlineStatusBox, itemData, netdiskPassword, isCurrent);
                btnUse.innerHTML = `✅ ${escapeHtml(t('common.acquired'))}`;
                btnUse.setAttribute("data-install-state", "success");
                return;  // ← 提前返回，不进入 Git 安装流程
            }

            if (isSkill) {
                if (!skillFlow) {
                    skillFlow = await import('./Skill安装流程.js');
                    if (!isCurrent()) return;
                    skillTarget = await skillFlow.chooseSkillDirectory(scope);
                    if (!isCurrent()) return;
                    if (!skillTarget) { restoreFocus = true; return; }
                }
                phase = 'install';
                const progress = trackProgress();
                const controller = new AbortController();
                const removeCancel = scope.addCleanup(() => controller.abort());
                progress.addCancelButton(t('install.cancel_in_progress'), () => controller.abort());
                let directoryPlan;
                try {
                    const result = await skillFlow.runSkillInstall({
                        target: skillTarget, credentials: { account, token, item_id: String(itemData.id) }, scope,
                        signal: controller.signal,
                        confirm: (html, options) => showConfirm(html, { ...options, signal: controller.signal }),
                        onProgress: event => {
                            if (!isCurrent()) return;
                            const stageKey = Object.hasOwn(INSTALL_STAGE_KEYS, event.stage) ? INSTALL_STAGE_KEYS[event.stage] : 'skill.preparing';
                            const label = event.skillAction === 'status' ? t('skill.checking_result')
                                : event.skillAction === 'prepare' && event.stage === 'complete' ? t('skill.prepared') : t(stageKey);
                            progress.update(event.progress, _installTransferText(event, label));
                        }
                    });
                    if (!isCurrent()) return;
                    if (result.status === 'cancelled') { restoreFocus = true; progress.error(t('skill.cancelled')); return; }
                    if (typeof result.plan_id === 'string' && /^[a-f0-9]{32}$/.test(result.plan_id)) directoryPlan = result.plan_id;
                    if (result.outcomeUnknown) {
                        phase = 'unknown'; btnUse.removeAttribute('aria-busy');
                        progress.error(t('skill.outcome_unknown')); return;
                    }
                    if (result.status !== 'success' || result.installed !== true) {
                        progress.error(skillFlow.skillErrorMessage({ code: result.error_code })); return;
                    }
                    progress.complete(t('install.complete'));
                    _recordToolInstalledVersion(itemData.id, result);
                    saveAcquiredItem(itemData);
                    btnUse.textContent = `✅ ${t('common.installed')}`;
                    btnUse.setAttribute('data-install-state', 'success');
                    try { await api.recordItemUse(itemData.id); if (isCurrent()) clearUsesCache(); } catch {}
                } catch (error) {
                    if (isCurrent()) progress.error(controller.signal.aborted ? t('skill.cancelled') : skillFlow.skillErrorMessage(error));
                } finally {
                    removeCancel(); controller.abort();
                    try {
                        if (directoryPlan && isCurrent()) attachInstallDirectory(inlineStatusBox, {
                            plan_id: directoryPlan, account, token, item_id: String(itemData.id)
                        }, scope, { skill: true });
                    } catch {}
                    if (phase === 'install') phase = 'idle';
                    releaseButton();
                }
                return;
            }

            if (isTool) {
                const installSource = describeInstallSource(itemData.link);
                inlineStatusBox.style.display = "block";
                inlineStatusBox.textContent = t('install.preview_loading');
                let installPreview = null;
                const previewController = new AbortController();
                const removePreviewCleanup = scope.addCleanup(() => previewController.abort());
                const previewTimeout = setTimeout(() => previewController.abort(), API.BACKGROUND_TIMEOUT);
                try {
                    const previewResponse = await fetch("/community_hub/install_preview", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: itemData.link }), signal: previewController.signal
                    });
                    if (!isCurrent()) return;
                    if (previewResponse.ok) {
                        const previewData = await previewResponse.json();
                        if (!isCurrent()) return;
                        if (previewData.status === "success") installPreview = previewData;
                    }
                } catch (error) {
                    if (!isCurrent()) return;
                } finally { clearTimeout(previewTimeout); removePreviewCleanup(); }
                if (!isCurrent()) return;
                const guessedTargetName = _guessInstallTargetName(itemData.link);
                const targetDisplay = installPreview?.target_display
                    || (guessedTargetName ? `custom_nodes/${guessedTargetName}` : null);
                const installPromptText = t(
                    isFree ? 'install.confirm_git' : 'install.confirm_zip',
                    { folder: targetDisplay || t('install.target_unknown') }
                );
                const targetStateText = installPreview
                    ? (installPreview.self_update
                        ? t('install.target_self_update')
                        : (installPreview.already_exists
                            ? t('install.target_exists')
                            : t('install.target_new')))
                    : t('install.preview_unavailable');
                let localVersionText = '';
                if (installPreview?.already_exists) {
                    if (installPreview.current_git_version) {
                        localVersionText = t('install.current_git_version', {
                            version: installPreview.current_git_version
                        });
                    } else if (!isFree) {
                        try {
                            const recordedVersion = getInstalledVersionStatus(itemData.id).version;
                            if (recordedVersion) {
                                localVersionText = t('install.recorded_local_version', { version: recordedVersion });
                            }
                        } catch (error) {
                            console.warn('无法读取本地已安装版本记录');
                        }
                    }
                }

                phase = "confirm";
                inlineStatusBox.innerHTML = `
                    <div class="resource-install__confirmation" role="group" aria-label="${escapeHtml(t('install.confirmation_region'))}">
                        <div role="heading" aria-level="3" class="resource-install__heading">${escapeHtml(installPromptText)}</div>
                        <div class="resource-install__preview">${escapeHtml(t(installSource ? 'install.source' : 'install.source_unavailable', { source: installSource?.label }))}</div>
                        <div role="status" aria-live="polite" class="resource-install__preview">${escapeHtml(targetStateText)}</div>
                        ${localVersionText ? `<div role="status" aria-live="polite" class="resource-install__preview">${escapeHtml(localVersionText)}</div>` : ''}
                        <div class="resource-install__actions">
                            <button id="btn-confirm-install" type="button" class="resource-install__button resource-install__button--confirm">${escapeHtml(t('install.confirm_button'))}</button>
                            <button id="btn-cancel-install" type="button" class="resource-install__button">${escapeHtml(t('common.cancel'))}</button>
                        </div>
                    </div>
                `;
                const confirmInstallButton = inlineStatusBox.querySelector('#btn-confirm-install');
                const cancelInstallButton = inlineStatusBox.querySelector('#btn-cancel-install');
                let removeEscapeCleanup = () => {};
                const removeInstallEscapeHandler = () => {
                    inlineStatusBox.removeEventListener("keydown", handleInstallEscape); removeEscapeCleanup();
                };
                const cancelInstallPrompt = () => {
                    if (!isCurrent() || phase !== "confirm") return;
                    phase = "idle"; releaseButton();
                    removeInstallEscapeHandler();
                    inlineStatusBox.style.display = "none";
                    btnUse.focus();
                };
                const handleInstallEscape = (event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        cancelInstallPrompt();
                    }
                };
                cancelInstallButton.onclick = cancelInstallPrompt;
                inlineStatusBox.addEventListener("keydown", handleInstallEscape);
                removeEscapeCleanup = scope.addCleanup(removeInstallEscapeHandler);
                confirmInstallButton.focus();
                confirmInstallButton.onclick = async () => {
                    if (!isCurrent() || phase !== "confirm") return;
                    phase = "install";
                    let directoryAttempted = false;
                    try {
                        removeInstallEscapeHandler();
                        confirmInstallButton.disabled = true;
                        cancelInstallButton.disabled = true;
                        // 获取最新的 item 数据以确保路由决策准确
                        // noCache: true 绕过前端 GET 请求缓存（5min TTL），确保读取服务器最新 has_private_token 值
                        let freshHasPrivateToken = !!itemData.has_private_token;
                        let apiFetchFailed = false;
                        let sourceChanged = false;
                        let sourceUnverified = false;
                        try {
                            const freshRes = await request(`/api/items/${itemData.id}`, scope.readOptions);
                            if (!isCurrent()) return;
                            if (freshRes.status === "success" && freshRes.data) {
                                freshHasPrivateToken = !!freshRes.data.has_private_token;
                                const freshSource = describeInstallSource(freshRes.data.link);
                                sourceUnverified = !installSource || !freshSource;
                                sourceChanged = !sourceUnverified && freshSource.identity !== installSource.identity;
                            } else {
                                apiFetchFailed = true;
                            }
                        } catch (e) {
                            apiFetchFailed = true;
                            if (!isCurrent()) return;
                        }
                        if (!isCurrent()) return;
                        if (sourceChanged || sourceUnverified) {
                            const message = sourceChanged ? t('install.error_source_changed') : t('install.source_unavailable');
                            inlineStatusBox.textContent = message;
                            showToast(message, 'warning');
                            return;
                        }
                        const hasPrivateToken = freshHasPrivateToken;
                        // 路由决策：仅当确认是免费+无私有Token时才走 git clone
                        // 如果 API 获取失败且缓存中无 has_private_token 信息，保守地走 ZIP 代理路径
                        const useGitClone = isFree && !hasPrivateToken && !apiFetchFailed;
                        const localApiEndpoint = useGitClone
                            ? "/community_hub/install_tool"
                            : "/community_hub/install_private_tool";

                        directoryAttempted = true;
                        const progress = trackProgress();
                        const cancelController = new AbortController();
                        progress.addCancelButton(t('install.cancel_in_progress'), () => cancelController.abort());
                        const diagnostics = _createProgressDiagnostics(INSTALL_STAGE_KEYS);

                        try {
                            // 发起 SSE 流式安装请求
                            const result = await requestSSE(
                                `${localApiEndpoint}_stream`,
                                { url: itemData.link, id: itemData.id, account, token },
                                (event) => {
                                    if (!isCurrent()) return;
                                    diagnostics.record(event);
                                    const rawStage = typeof event.stage === "string" ? event.stage : "";
                                    const stageKey = Object.hasOwn(INSTALL_STAGE_KEYS, rawStage) ? INSTALL_STAGE_KEYS[rawStage] : "";
                                    progress.update(event.progress, event.status === "error"
                                        ? _getInstallErrorMessage(event)
                                        : _installTransferText(event, t(stageKey || 'install.stage_installing')));
                                },
                                { signal: cancelController.signal }
                            );

                            if (!isCurrent()) return;
                            if (result?.cancelRequested) {
                                phase = "unknown"; btnUse.removeAttribute("aria-busy");
                                const message = t('install.cancel_outcome_uncertain');
                                progress.error(message);
                                showToast(message, "warning");
                                return;
                            }

                            const outcome = _getInstallOutcome(result);
                            if (outcome === "unknown") {
                                phase = "unknown"; btnUse.removeAttribute("aria-busy");
                                const message = t('install.connection_uncertain');
                                progress.error(message);
                                progress.showDiagnostics(diagnostics.entries, result);
                                showToast(message, "warning");
                                return;
                            }
                            if (outcome === "success") {
                                progress.complete(t('install.complete'));
                                // 根据后端返回的 message 判断是否为自更新场景
                                const isSelfUpdate = result.message && result.message.includes("重启") && result.message.includes("生效");
                                if (isSelfUpdate) {
                                    showToast(t('install.completed_update', { title: itemData.title }), "success");
                                } else {
                                    showToast(t('install.completed_restart', { title: itemData.title }), "success");
                                }

                                // 仅记录本次引擎证明的commit；榜单版本不能证明已经安装。
                                if (!isSelfUpdate) _recordToolInstalledVersion(itemData.id, result);

                                // 记录使用量（后端自动去重）
                                try {
                                    await api.recordItemUse(itemData.id);
                                    if (!isCurrent()) return;
                                    clearUsesCache();
                                } catch (_) {}
                                if (!isCurrent()) return;

                                // 🚀 保存到已获取记录
                                saveAcquiredItem(itemData);

                                // 🚀 更新按钮状态
                                btnUse.innerHTML = `✅ ${escapeHtml(t('common.installed'))}`;
                                btnUse.setAttribute("data-install-state", "success");
                            } else {
                                if (result?.outcomeUnknown) { phase = "unknown"; btnUse.removeAttribute("aria-busy"); }
                                const message = _getInstallErrorMessage(result);
                                progress.error(message);
                                progress.showDiagnostics(diagnostics.entries, result);
                                showToast(t('install.failed_for_item', { title: itemData.title, message }), "error");
                            }
                        } catch(err) {
                            if (!isCurrent()) return;
                            if (!err?.fallbackSafe) {
                                phase = "unknown"; btnUse.removeAttribute("aria-busy");
                                const message = t('install.connection_uncertain');
                                progress.error(message);
                                progress.showDiagnostics(diagnostics.entries, err);
                                showToast(message, "error");
                                return;
                            }
                            // 降级到原接口
                            progress.destroy();
                            inlineStatusBox.innerHTML = `<span class="resource-install__message resource-install__message--info">⏳ ${escapeHtml(t('install.background_started'))}</span>`;

                            try {
                                const res = await fetch(localApiEndpoint, {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ url: itemData.link, id: itemData.id, account, token })
                                });
                                if (!isCurrent()) return;
                                const data = await res.json();
                                if (!isCurrent()) return;
                                const outcome = _getInstallOutcome(data, res);
                                if (outcome === "unknown") {
                                    phase = "unknown"; btnUse.removeAttribute("aria-busy");
                                    inlineStatusBox.textContent = t('install.connection_uncertain');
                                    showToast(t('install.connection_uncertain'), "warning");
                                    return;
                                }
                                if (outcome === "error") {
                                    const isLinkError = data?.error_code === 'invalid_repository'
                                        || (typeof data?.error === "string" && data.error.includes('不是有效的 Git'));
                                    const safeMessage = isLinkError ? t('install.error_invalid_repository') : _getInstallErrorMessage(data);
                                    inlineStatusBox.innerHTML = isLinkError
                                        ? `<span class="resource-install__message resource-install__message--error">❌ ${escapeHtml(safeMessage)}</span><br><button id="btn-open-source-link" type="button" class="resource-install__button resource-install__source">🔗 ${escapeHtml(t('install.open_source'))}</button>`
                                        : `<span class="resource-install__message resource-install__message--error">❌ ${escapeHtml(t('install.failed_for_item', { title: itemData.title, message: safeMessage }))}</span>`;
                                    // 🔒 XSS防护：链接改为 DOM 事件绑定（内联 onclick 里的引号即使转义，
                                    // 也会被浏览器先还原再交给 JS 解析，依然能被注入；本文件其他分支均用此写法）
                                    if (isLinkError) {
                                        const btnOpenSource = inlineStatusBox.querySelector('#btn-open-source-link');
                                        if (btnOpenSource) {
                                            btnOpenSource.onclick = () => {
                                                if (!isCurrent()) return;
                                                const safeUrl = _getSafeExternalUrl(itemData.link);
                                                if (safeUrl) window.open(safeUrl, '_blank', 'noopener,noreferrer');
                                            };
                                        }
                                    }
                                    showToast(t('install.failed_for_item', { title: itemData.title, message: safeMessage }), "error");
                                } else {
                                    // 根据后端返回的 message 判断是否为自更新场景
                                    const isSelfUpdate = data.message && data.message.includes("重启") && data.message.includes("生效");
                                    if (isSelfUpdate) {
                                        inlineStatusBox.innerHTML = `<div class="resource-install__message resource-install__message--success resource-install__complete">🔄 ${escapeHtml(t('install.stage_complete'))}</div><div class="resource-install__note">${escapeHtml(t('install.restart_to_apply'))}</div>`;
                                        showToast(t('install.completed_update', { title: itemData.title }), "success");
                                    } else {
                                        inlineStatusBox.innerHTML = `<div class="resource-install__message resource-install__message--success resource-install__complete">🎉 ${escapeHtml(t('install.complete'))}</div><div class="resource-install__note">${escapeHtml(t('install.restart_to_load'))}</div>`;
                                        showToast(t('install.completed_restart', { title: itemData.title }), "success");
                                    }

                                    if (!isSelfUpdate) _recordToolInstalledVersion(itemData.id, data);

                                    try {
                                        await api.recordItemUse(itemData.id);
                                        if (!isCurrent()) return;
                                        clearUsesCache();
                                    } catch (_) {}
                                    if (!isCurrent()) return;

                                    saveAcquiredItem(itemData);

                                    btnUse.innerHTML = `✅ ${escapeHtml(t('common.installed'))}`;
                                    btnUse.setAttribute("data-install-state", "success");
                                }
                            } catch(err2) {
                                if (!isCurrent()) return;
                                phase = "unknown"; btnUse.removeAttribute("aria-busy");
                                inlineStatusBox.innerHTML = `<span class="resource-install__message resource-install__message--error">❌ ${escapeHtml(t('install.connection_uncertain'))}</span>`;
                            }
                        }
                    } catch (_) {
                        if (isCurrent()) { phase = "unknown"; btnUse.removeAttribute("aria-busy"); inlineStatusBox.textContent = t('install.connection_uncertain'); }
                    } finally {
                        try { if (directoryAttempted && isCurrent()) attachInstallDirectory(inlineStatusBox, { url: itemData.link }, scope); } catch {}
                        if (phase === "install") phase = "idle"; releaseButton();
                    }
                };
            } else if (isApp) {
                const progress = trackProgress();
                const diagnostics = _createProgressDiagnostics(WORKFLOW_STAGE_KEYS);

                // 附带 account 凭证，解决问题 2 (一键鉴权加载)
                try {
                    const result = await requestSSE(
                        "/community_hub/download_app_stream",
                        { url: itemData.link, id: itemData.id, account, token },
                        (event) => {
                            if (!isCurrent()) return;
                            diagnostics.record(event);
                            const stageKey = typeof event.stage === "string" && Object.hasOwn(WORKFLOW_STAGE_KEYS, event.stage)
                                ? WORKFLOW_STAGE_KEYS[event.stage]
                                : "";
                            const message = event.status === "error"
                                ? _getWorkflowErrorMessage(event)
                                : t(stageKey || 'workflow.stage_downloading');
                            progress.update(event.progress, message);
                        },
                        { timeout: API.WORKFLOW_DOWNLOAD_TIMEOUT }
                    );

                    if (!isCurrent()) return;
                    if (result.status === "success") {
                        const graphLoaded = await _loadGraphToCanvas(result.data, isCurrent);
                        if (!isCurrent()) return;
                        if (!graphLoaded) {
                            const message = t('workflow.canvas_load_failed');
                            progress.error(message);
                            progress.showDiagnostics(diagnostics.entries, result);
                            showToast(message, "error");
                            return;
                        }
                        progress.complete(t('workflow.loaded_for_item', { title: itemData.title }));
                        showToast(t('workflow.loaded_for_item', { title: itemData.title }), "success");

                        // 🚀 安装成功后，盖上本地版本戳
                        if (itemData.latest_version) {
                            if (!saveInstalledVersion(itemData.id, itemData.latest_version)) {
                                showToast(t('install.version_record_unavailable'), 'warning');
                            }
                        }

                        // 记录使用量（后端自动去重）
                        api.recordItemUse(itemData.id).then(() => {
                            if (!isCurrent()) return;
                            clearUsesCache();
                        }).catch(() => {});

                        // 🚀 保存到已获取记录
                        saveAcquiredItem(itemData);

                        // 🚀 更新按钮状态
                        btnUse.innerHTML = `✅ ${escapeHtml(t('common.downloaded'))}`;
                        btnUse.setAttribute("data-install-state", "success");
                    } else {
                        if (result?.outcomeUnknown) { phase = "unknown"; btnUse.removeAttribute("aria-busy"); }
                        const message = _getWorkflowErrorMessage(result);
                        const localizedMessage = result.error_code
                            ? message
                            : t('workflow.failed', { message });
                        progress.error(localizedMessage);
                        progress.showDiagnostics(diagnostics.entries, result);
                        showToast(localizedMessage, "error");
                    }
                } catch(err) {
                    if (!isCurrent()) return;
                    if (!err?.fallbackSafe) {
                        phase = "unknown"; btnUse.removeAttribute("aria-busy");
                        const message = t('workflow.connection_uncertain');
                        progress.error(message);
                        progress.showDiagnostics(diagnostics.entries, err);
                        showToast(message, "error");
                        return;
                    }
                    // 降级到原接口
                    progress.destroy();
                    inlineStatusBox.innerHTML = `<span class="resource-install__message resource-install__message--info">⏳ ${escapeHtml(t('workflow.fallback_loading'))}</span>`;

                    try {
                        const res = await fetch("/community_hub/download_app", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ url: itemData.link, id: itemData.id, account, token })
                        });
                        if (!isCurrent()) return;
                        if (!res.ok) {
                            const messageKey = [401, 403].includes(res.status)
                                ? 'workflow.error_auth'
                                : ([502, 503, 504].includes(res.status) ? 'workflow.error_network' : 'workflow.error_generic');
                            inlineStatusBox.innerHTML = `<span class="resource-install__message resource-install__message--error">❌ ${escapeHtml(t('workflow.http_failed', { status: res.status, message: t(messageKey) }))}</span>`;
                            return;
                        }
                        let data;
                        try {
                            data = await res.json();
                            if (!isCurrent()) return;
                        } catch (parseErr) {
                            if (!isCurrent()) return;
                            inlineStatusBox.innerHTML = `<span class="resource-install__message resource-install__message--error">❌ ${escapeHtml(t('workflow.parse_failed'))}</span>`;
                            showToast(t('common.parse_error'), "error");
                            return;
                        }
                        if (data?.status !== "success") {
                            // 旧式响应的服务端原文可能未本地化，也可能包含上游诊断/链接信息；
                            // 使用稳定双语类别提示，不把远端正文直接展示或写入诊断日志。
                            const message = t('workflow.error_remote');
                            inlineStatusBox.innerHTML = `<span class="resource-install__message resource-install__message--error">❌ ${escapeHtml(message)}</span>`;
                            showToast(message, "error");
                        } else {
                            const graphLoaded = await _loadGraphToCanvas(data.data, isCurrent);
                            if (!isCurrent()) return;
                            if (!graphLoaded) {
                                const message = t('workflow.canvas_load_failed');
                                inlineStatusBox.textContent = message;
                                showToast(message, "error");
                                return;
                            }
                            inlineStatusBox.innerHTML = `<div class="resource-install__message resource-install__message--success resource-install__complete">✅ ${escapeHtml(t('workflow.loaded_for_item', { title: itemData.title }))}</div><div class="resource-install__note">${escapeHtml(t('workflow.loaded_warning'))}</div>`;
                            showToast(t('workflow.loaded_for_item', { title: itemData.title }), "success");

                            if (itemData.latest_version) {
                                if (!saveInstalledVersion(itemData.id, itemData.latest_version)) {
                                    showToast(t('install.version_record_unavailable'), 'warning');
                                }
                            }

                            api.recordItemUse(itemData.id).then(() => {
                                if (!isCurrent()) return;
                                clearUsesCache();
                            }).catch(() => {});

                            saveAcquiredItem(itemData);

                            btnUse.innerHTML = `✅ ${escapeHtml(t('common.downloaded'))}`;
                            btnUse.setAttribute("data-install-state", "success");
                        }
                    } catch(err2) {
                        if (!isCurrent()) return;
                        phase = "unknown"; btnUse.removeAttribute("aria-busy");
                        inlineStatusBox.innerHTML = `<span class="resource-install__message resource-install__message--error">❌ ${escapeHtml(t('workflow.local_connection_failed', { message: t('common.network_error_retry') }))}</span>`;
                    }
                }
            } else {
                // ☁️ 网盘链接或纯链接模式（recordItemUse 延迟到用户点击按钮后）

                // ☁️ 从购买响应中获取网盘信息（安全：只有购买成功后才返回）
                const isNetdisk = purchaseRes.is_netdisk;
                const netdiskPassword = purchaseRes.netdisk_password;

                // ☁️ 网盘资源：购买后显示密码
                if (isNetdisk) {
                    _renderNetdiskUI(inlineStatusBox, itemData, netdiskPassword, isCurrent);
                } else {
                    inlineStatusBox.replaceChildren();
                    const card = document.createElement('div');
                    card.className = 'netdisk-card';
                    const summary = document.createElement('div');
                    summary.className = 'netdisk-card__summary';
                    summary.textContent = t('acquire.pure_link_authorized');
                    const openButton = document.createElement('button');
                    openButton.type = 'button';
                    openButton.className = 'netdisk-card__open';
                    openButton.textContent = t('netdisk.open');
                    openButton.addEventListener('click', () => _openExternalResource(itemData.link, itemData.id, isCurrent));
                    const panel = document.createElement('div');
                    panel.className = 'netdisk-card__panel';
                    panel.appendChild(openButton);
                    card.append(summary, panel);
                    inlineStatusBox.appendChild(card);
                }
            }
        } catch (_) {
            if (isCurrent()) { inlineStatusBox.style.display = "block"; inlineStatusBox.textContent = t('common.error'); }
        } finally {
            if (phase === "preflight") phase = "idle";
            releaseButton();
            if (restoreFocus && phase === "idle" && isCurrent()) btnUse.focus();
        }
    };
    return scope;
}
