// 前端页面/profile/管理后台组件.js
import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { getVersionConfig, getStageLabel, formatVersionString, clearVersionCache } from "../components/关于插件组件.js";
import { refreshBanner } from "../components/顶部广告组件.js";

/**
 * 创建管理后台视图
 * @param {Object} currentUser - 当前用户对象
 * @returns {HTMLElement} 管理后台容器元素
 */
export function createAdminPanelView(currentUser) {
    const container = document.createElement("div");
    container.style.cssText = "padding: 16px; background: var(--comfy-menu-bg); min-height: 100%;";

    // ==========================================
    // 顶部导航栏
    // ==========================================
    const navBar = document.createElement("div");
    navBar.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 0;";

    const backBtn = document.createElement("button");
    backBtn.innerHTML = "⬅ " + t('common.back');
    backBtn.style.cssText = "margin-left: 14px; margin-top: 2px; display: flex; align-items: center; gap: 6px; background: none; border: 1px solid rgba(85,85,85,0.6); color: #8b949e; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s;";
    backBtn.onmouseenter = () => { backBtn.style.borderColor = "#58a6ff"; backBtn.style.color = "#58a6ff"; };
    backBtn.onmouseleave = () => { backBtn.style.borderColor = "rgba(85,85,85,0.6)"; backBtn.style.color = "#8b949e"; };
    backBtn.onclick = () => {
        import("./个人中心视图.js").then(module => {
            module.openUserProfileModal(currentUser);
        }).catch(err => {
            console.error('加载失败:', err);
            window.dispatchEvent(new CustomEvent("comfy-route-back"));
        });
    };

    const navTitle = document.createElement("span");
    navTitle.style.cssText = "font-size: 16px; font-weight: 600; color: #e6edf3;";
    navTitle.innerHTML = "⚙️ " + t('admin.panel_title');

    const adminBadge = document.createElement("span");
    adminBadge.style.cssText = "font-size: 11px; padding: 3px 10px; border-radius: 10px; background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,140,0,0.2)); color: #ffa500; border: 1px solid rgba(255,165,0,0.3);";
    // 特权徽章逻辑
    getVersionConfig().then(config => {
        const stageLabel = getStageLabel(config?.stage || 'beta');
        adminBadge.textContent = `${stageLabel}${t('profile.max_privilege')}`;
    }).catch(() => {
        adminBadge.textContent = t('profile.beta_max_privilege');
    });

    navBar.append(backBtn, navTitle, adminBadge);

    // ==========================================
    // 管理操作卡片
    // ==========================================
    const actionsCard = document.createElement("div");
    actionsCard.style.cssText = "background: rgba(30,30,30,0.95); border: 1px solid rgba(85,85,85,0.6); border-radius: 12px; padding: 20px; margin-bottom: 16px;";

    const actionsTitle = document.createElement("div");
    actionsTitle.style.cssText = "font-size: 14px; font-weight: 600; color: #e6edf3; margin-bottom: 14px;";
    actionsTitle.innerHTML = "🔧 " + t('admin.functions');

    const actionsBtnGroup = document.createElement("div");
    actionsBtnGroup.style.cssText = "display: flex; gap: 12px; flex-wrap: wrap;";

    // 提现管理按钮
    const btnWithdraw = document.createElement("button");
    btnWithdraw.innerHTML = "💰 " + t('admin.withdraw_manage');
    btnWithdraw.style.cssText = "flex: 1; min-width: 120px; padding: 12px 20px; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #238636, #2ea043); transition: all 0.2s;";
    btnWithdraw.onmouseenter = () => { btnWithdraw.style.transform = "translateY(-1px)"; btnWithdraw.style.boxShadow = "0 4px 12px rgba(35,134,54,0.4)"; };
    btnWithdraw.onmouseleave = () => { btnWithdraw.style.transform = "none"; btnWithdraw.style.boxShadow = "none"; };
    btnWithdraw.onclick = () => {
        import("../task/管理员提现组件.js").then(module => {
            const view = module.createWithdrawManageView(currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(err => { console.error('加载失败:', err); window.dispatchEvent(new CustomEvent("comfy-route-back")); });
    };

    // 仲裁按钮
    const btnDispute = document.createElement("button");
    btnDispute.innerHTML = "⚖️ " + t('admin.arbitration');
    btnDispute.style.cssText = "flex: 1; min-width: 120px; padding: 12px 20px; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #8b5cf6, #7c3aed); transition: all 0.2s;";
    btnDispute.onmouseenter = () => { btnDispute.style.transform = "translateY(-1px)"; btnDispute.style.boxShadow = "0 4px 12px rgba(139,92,246,0.4)"; };
    btnDispute.onmouseleave = () => { btnDispute.style.transform = "none"; btnDispute.style.boxShadow = "none"; };
    btnDispute.onclick = () => {
        import("../task/管理员仲裁组件.js").then(module => {
            const view = module.createAdminDisputeView(currentUser);
            window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
        }).catch(err => { console.error('加载失败:', err); window.dispatchEvent(new CustomEvent("comfy-route-back")); });
    };

    // 版本管理按钮
    const btnVersion = document.createElement("button");
    btnVersion.innerHTML = "🏷️ " + t('admin.version_manage');
    btnVersion.style.cssText = "flex: 1; min-width: 120px; padding: 12px 20px; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #FF9800, #F57C00); transition: all 0.2s;";
    btnVersion.onmouseenter = () => { btnVersion.style.transform = "translateY(-1px)"; btnVersion.style.boxShadow = "0 4px 12px rgba(255,152,0,0.4)"; };
    btnVersion.onmouseleave = () => { btnVersion.style.transform = "none"; btnVersion.style.boxShadow = "none"; };
    btnVersion.onclick = () => {
        const view = createVersionManageView(currentUser);
        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
    };

    // 广告管理按钮
    const btnBanner = document.createElement("button");
    btnBanner.innerHTML = "📰 " + t('admin.banner_manage');
    btnBanner.style.cssText = "flex: 1; min-width: 120px; padding: 12px 20px; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #4CAF50, #388E3C); transition: all 0.2s;";
    btnBanner.onmouseenter = () => { btnBanner.style.transform = "translateY(-1px)"; btnBanner.style.boxShadow = "0 4px 12px rgba(76,175,80,0.4)"; };
    btnBanner.onmouseleave = () => { btnBanner.style.transform = "none"; btnBanner.style.boxShadow = "none"; };
    btnBanner.onclick = () => {
        const view = createBannerManageView(currentUser);
        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
    };

    actionsBtnGroup.append(btnWithdraw, btnDispute, btnVersion, btnBanner);
    actionsCard.append(actionsTitle, actionsBtnGroup);

    // ==========================================
    // 全站系统公告发布卡片
    // ==========================================
    const announceCard = document.createElement("div");
    announceCard.style.cssText = "background: rgba(30,30,30,0.95); border: 1px solid rgba(85,85,85,0.6); border-radius: 12px; padding: 20px; margin-bottom: 16px;";

    const announceHeader = document.createElement("div");
    announceHeader.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 14px;";

    const announceTitle = document.createElement("span");
    announceTitle.style.cssText = "font-size: 14px; font-weight: 600; color: #e6edf3;";
    announceTitle.innerHTML = "📢 " + t('admin.announcement_title');

    const announceBadge = document.createElement("span");
    announceBadge.style.cssText = "font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(255,140,0,0.15); color: #ff8c00; border: 1px solid rgba(255,140,0,0.3);";
    announceBadge.textContent = t('admin.privilege');

    announceHeader.append(announceTitle, announceBadge);

    const announceTextarea = document.createElement("textarea");
    announceTextarea.id = "admin-ann-content";
    announceTextarea.placeholder = t('admin.announce_placeholder');
    announceTextarea.style.cssText = "width: 100%; min-height: 100px; padding: 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: rgba(20,20,20,0.8); color: #e6edf3; font-size: 13px; resize: vertical; box-sizing: border-box; outline: none; transition: border-color 0.2s;";
    announceTextarea.onfocus = () => { announceTextarea.style.borderColor = "#f778ba"; };
    announceTextarea.onblur = () => { announceTextarea.style.borderColor = "rgba(85,85,85,0.6)"; };

    const btnAdminAnnSend = document.createElement("button");
    btnAdminAnnSend.innerHTML = `🚀 ${t('admin.confirm_publish')}`;
    btnAdminAnnSend.style.cssText = "margin-top: 12px; width: 100%; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #f778ba, #e84393); transition: all 0.2s;";
    btnAdminAnnSend.onmouseenter = () => { btnAdminAnnSend.style.transform = "translateY(-1px)"; btnAdminAnnSend.style.boxShadow = "0 4px 12px rgba(247,120,186,0.4)"; };
    btnAdminAnnSend.onmouseleave = () => { btnAdminAnnSend.style.transform = "none"; btnAdminAnnSend.style.boxShadow = "none"; };

    // 公告发布逻辑
    btnAdminAnnSend.onclick = async () => {
        const contentArea = container.querySelector("#admin-ann-content");
        if (!contentArea) return showToast(`⚠️ ${t('admin.ui_load_error')}`, "error");
        const content = contentArea.value;
        if (!content || !content.trim()) return showToast(`⚠️ ${t('admin.empty_content')}`, "warning");
        const isConfirm = await showConfirm(t('admin.announce_confirm'));
        if (!isConfirm) return;
        btnAdminAnnSend.innerText = `🚀 ${t('admin.publishing')}...`;
        btnAdminAnnSend.style.opacity = "0.7";
        btnAdminAnnSend.disabled = true;
        try {
            await api.postSystemAnnouncement(currentUser.account, content);
            contentArea.value = "";
            showToast(`🎉 ${t('admin.publish_success')}`, "success");
        } catch (error) {
            showToast(`❌ ${t('admin.publish_failed')}: ${error.message}`, "error");
        } finally {
            btnAdminAnnSend.innerText = `🚀 ${t('admin.confirm_publish')}`;
            btnAdminAnnSend.style.opacity = "1";
            btnAdminAnnSend.disabled = false;
        }
    };

    announceCard.append(announceHeader, announceTextarea, btnAdminAnnSend);

    // ==========================================
    // API 调试与脚本执行卡片
    // ==========================================
    const scriptCard = document.createElement("div");
    scriptCard.style.cssText = "background: rgba(30,30,30,0.95); border: 1px solid rgba(85,85,85,0.6); border-radius: 12px; padding: 20px; margin-bottom: 16px;";

    const scriptHeader = document.createElement("div");
    scriptHeader.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 14px;";

    const scriptTitle = document.createElement("span");
    scriptTitle.style.cssText = "font-size: 14px; font-weight: 600; color: #e6edf3;";
    scriptTitle.innerHTML = "🖥️ " + t('admin.script_title');

    const scriptBadge = document.createElement("span");
    scriptBadge.style.cssText = "font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(88,166,255,0.15); color: #58a6ff; border: 1px solid rgba(88,166,255,0.3);";
    scriptBadge.textContent = t('admin.dev_tools');

    scriptHeader.append(scriptTitle, scriptBadge);

    const scriptInputRow = document.createElement("div");
    scriptInputRow.style.cssText = "display: flex; gap: 10px; align-items: center;";

    const scriptInput = document.createElement("input");
    scriptInput.id = "admin-script-input";
    scriptInput.placeholder = t('admin.script_placeholder');
    scriptInput.style.cssText = "flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: rgba(20,20,20,0.8); color: #e6edf3; font-size: 13px; outline: none; transition: border-color 0.2s;";
    scriptInput.onfocus = () => { scriptInput.style.borderColor = "#3fb950"; };
    scriptInput.onblur = () => { scriptInput.style.borderColor = "rgba(85,85,85,0.6)"; };

    const btnAdminRunScript = document.createElement("button");
    btnAdminRunScript.innerHTML = `▶️ ${t('admin.execute')}`;
    btnAdminRunScript.style.cssText = "padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #238636, #2ea043); transition: all 0.2s; white-space: nowrap;";
    btnAdminRunScript.onmouseenter = () => { btnAdminRunScript.style.transform = "translateY(-1px)"; btnAdminRunScript.style.boxShadow = "0 4px 12px rgba(35,134,54,0.4)"; };
    btnAdminRunScript.onmouseleave = () => { btnAdminRunScript.style.transform = "none"; btnAdminRunScript.style.boxShadow = "none"; };

    scriptInputRow.append(scriptInput, btnAdminRunScript);

    const resultArea = document.createElement("div");
    resultArea.id = "admin-script-result";
    resultArea.style.cssText = "margin-top: 12px; padding: 12px; border-radius: 8px; background: rgba(13,17,23,0.95); border: 1px solid rgba(85,85,85,0.4); min-height: 60px; font-size: 12px; color: #8b949e; white-space: pre-wrap; word-break: break-all; font-family: monospace;";

    // 脚本执行逻辑
    btnAdminRunScript.onclick = async () => {
        const scriptName = scriptInput.value.trim();
        if (!scriptName) {
            resultArea.innerHTML = `<span style="color: #f85149;">❌ ${t('admin.enter_script_name')}</span>`;
            return;
        }
        btnAdminRunScript.innerText = `⏳ ${t('admin.executing')}...`;
        btnAdminRunScript.disabled = true;
        resultArea.innerHTML = '';
        const runningSpan = document.createElement('span');
        runningSpan.style.color = '#58a6ff';
        runningSpan.textContent = `⚡ ${t('admin.running')} ${scriptName} ...`;
        resultArea.appendChild(runningSpan);
        try {
            const response = await api.runAdminScript(currentUser.account, scriptName);
            const output = response.output || response.message || JSON.stringify(response, null, 2);
            resultArea.innerHTML = `<span style="color: #3fb950;">✅ ${t('admin.exec_success')}：</span>`;
            const outputNode = document.createElement('pre');
            outputNode.style.cssText = 'margin: 8px 0 0 0; white-space: pre-wrap; word-break: break-all; font-family: monospace;';
            outputNode.textContent = '\n' + output;
            resultArea.appendChild(outputNode);
        } catch (error) {
            resultArea.innerHTML = `<span style="color: #f85149;">❌ ${t('admin.exec_failed')}：</span>`;
            const errorNode = document.createElement('pre');
            errorNode.style.cssText = 'margin: 8px 0 0 0; white-space: pre-wrap; word-break: break-all; font-family: monospace;';
            errorNode.textContent = '\n' + error.message;
            resultArea.appendChild(errorNode);
        } finally {
            btnAdminRunScript.innerText = `▶️ ${t('admin.execute')}`;
            btnAdminRunScript.disabled = false;
        }
    };

    scriptCard.append(scriptHeader, scriptInputRow, resultArea);

    // ==========================================
    // 组装
    // ==========================================
    container.append(navBar, actionsCard, announceCard, scriptCard);

    return container;
}

/**
 * 创建版本管理独立视图
 * @param {Object} currentUser - 当前用户对象
 * @returns {HTMLElement} 版本管理容器元素
 */
export function createVersionManageView(currentUser) {
    const container = document.createElement("div");
    container.style.cssText = "padding: 16px; background: var(--comfy-menu-bg); min-height: 100%;";

    // 顶部导航栏
    const navBar = document.createElement("div");
    navBar.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 0;";

    const backBtn = document.createElement("button");
    backBtn.innerHTML = "⬅ " + t('common.back');
    backBtn.style.cssText = "margin-left: 14px; margin-top: 2px; display: flex; align-items: center; gap: 6px; background: none; border: 1px solid rgba(85,85,85,0.6); color: #8b949e; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s;";
    backBtn.onmouseenter = () => { backBtn.style.borderColor = "#58a6ff"; backBtn.style.color = "#58a6ff"; };
    backBtn.onmouseleave = () => { backBtn.style.borderColor = "rgba(85,85,85,0.6)"; backBtn.style.color = "#8b949e"; };
    backBtn.onclick = () => {
        const view = createAdminPanelView(currentUser);
        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
    };

    const navTitle = document.createElement("span");
    navTitle.style.cssText = "font-size: 16px; font-weight: 600; color: #e6edf3;";
    navTitle.innerHTML = "🏷️ " + t('admin.version_manage');

    const versionBadge = document.createElement("span");
    versionBadge.style.cssText = "font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(255,152,0,0.15); color: #FF9800; border: 1px solid rgba(255,152,0,0.3);";
    versionBadge.textContent = t('admin.version_config');

    navBar.append(backBtn, navTitle, versionBadge);

    // 版本管理内容卡片
    const versionCard = document.createElement("div");
    versionCard.style.cssText = "background: rgba(30,30,30,0.95); border: 1px solid rgba(85,85,85,0.6); border-radius: 12px; padding: 20px; margin-bottom: 16px;";

    const versionHint = document.createElement("div");
    versionHint.style.cssText = "font-size: 11px; color: #888; margin-bottom: 12px;";
    versionHint.textContent = t('admin.version_hint');

    const versionRow = document.createElement("div");
    versionRow.style.cssText = "display: flex; gap: 12px; margin-bottom: 12px;";

    // 阶段选择
    const stageDiv = document.createElement("div");
    stageDiv.style.cssText = "flex: 1;";
    stageDiv.innerHTML = `
        <label style="display: block; font-size: 11px; color: #aaa; margin-bottom: 4px;">${t('admin.project_stage')}</label>
        <select id="admin-version-stage" style="width: 100%; padding: 8px; background: #2a2a2a; border: 1px solid rgba(85,85,85,0.6); color: #e6edf3; border-radius: 6px; cursor: pointer; outline: none;">
            <option value="alpha">${t('about.stage_alpha')}</option>
            <option value="beta">${t('about.stage_beta')}</option>
            <option value="rc">${t('about.stage_rc')}</option>
            <option value="stable">${t('about.stage_stable')}</option>
        </select>
    `;

    // 版本号输入
    const numDiv = document.createElement("div");
    numDiv.style.cssText = "flex: 1;";
    numDiv.innerHTML = `
        <label style="display: block; font-size: 11px; color: #aaa; margin-bottom: 4px;">${t('admin.version_number')}</label>
        <div style="display: flex; gap: 4px; align-items: center;">
            <input type="number" id="admin-ver-major" min="0" max="99" value="2" style="width: 42px; padding: 8px 4px; background: #2a2a2a; border: 1px solid rgba(85,85,85,0.6); color: #e6edf3; border-radius: 6px; text-align: center; outline: none;">
            <span style="color: #555;">.</span>
            <input type="number" id="admin-ver-minor" min="0" max="99" value="0" style="width: 42px; padding: 8px 4px; background: #2a2a2a; border: 1px solid rgba(85,85,85,0.6); color: #e6edf3; border-radius: 6px; text-align: center; outline: none;">
            <span style="color: #555;">.</span>
            <input type="number" id="admin-ver-patch" min="0" max="99" value="0" style="width: 42px; padding: 8px 4px; background: #2a2a2a; border: 1px solid rgba(85,85,85,0.6); color: #e6edf3; border-radius: 6px; text-align: center; outline: none;">
        </div>
    `;
    versionRow.append(stageDiv, numDiv);

    const versionPreview = document.createElement("div");
    versionPreview.style.cssText = "background: #1a1a1a; padding: 10px 14px; border-radius: 6px; font-size: 12px; color: #4CAF50; margin-bottom: 12px;";

    const btnApplyVersion = document.createElement("button");
    btnApplyVersion.innerHTML = "📢 " + t('admin.apply_version');
    btnApplyVersion.style.cssText = "width: 100%; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #FF9800, #F57C00); transition: all 0.2s;";
    btnApplyVersion.onmouseenter = () => { btnApplyVersion.style.transform = "translateY(-1px)"; btnApplyVersion.style.boxShadow = "0 4px 12px rgba(255,152,0,0.4)"; };
    btnApplyVersion.onmouseleave = () => { btnApplyVersion.style.transform = "none"; btnApplyVersion.style.boxShadow = "none"; };

    const versionStatus = document.createElement("div");
    versionStatus.style.cssText = "margin-top: 8px; font-size: 11px; color: #666; text-align: center;";

    versionCard.append(versionHint, versionRow, versionPreview, btnApplyVersion, versionStatus);

    // 版本管理逻辑
    const updateVersionPreview = () => {
        const stageSelect = versionCard.querySelector('#admin-version-stage');
        const major = versionCard.querySelector('#admin-ver-major');
        const minor = versionCard.querySelector('#admin-ver-minor');
        const patch = versionCard.querySelector('#admin-ver-patch');
        if (!stageSelect || !major) return;
        const ver = `V${major.value}.${minor.value}.${patch.value}`;
        const label = getStageLabel(stageSelect.value);
        versionPreview.innerHTML = `${t('admin.current_version')}：<strong>${ver}</strong> <span style="color: #FF9800;">${label}</span>`;
    };

    // 延迟绑定事件（等 DOM 挂载）
    setTimeout(() => {
        const stageSelect = versionCard.querySelector('#admin-version-stage');
        const major = versionCard.querySelector('#admin-ver-major');
        const minor = versionCard.querySelector('#admin-ver-minor');
        const patch = versionCard.querySelector('#admin-ver-patch');
        [stageSelect, major, minor, patch].forEach(el => {
            if (el) {
                el.addEventListener('change', updateVersionPreview);
                el.addEventListener('input', updateVersionPreview);
            }
        });

        // 加载当前配置
        getVersionConfig().then(config => {
            if (stageSelect) stageSelect.value = config.stage || 'beta';
            if (major) major.value = config.major ?? 2;
            if (minor) minor.value = config.minor ?? 0;
            if (patch) patch.value = config.patch ?? 0;
            updateVersionPreview();
        }).catch(() => updateVersionPreview());

        // 应用按钮
        btnApplyVersion.onclick = async () => {
            btnApplyVersion.disabled = true;
            btnApplyVersion.innerHTML = '⚙️ ' + t('admin.applying');
            versionStatus.innerHTML = '';
            const versionData = {
                stage: stageSelect.value,
                major: parseInt(major.value) || 0,
                minor: parseInt(minor.value) || 0,
                patch: parseInt(patch.value) || 0
            };
            try {
                await api.setSystemConfig('project_version', versionData);
                clearVersionCache();
                showToast(`✅ ${t('admin.version_updated_to')} ${formatVersionString(versionData)}`, 'success');
                versionStatus.innerHTML = `<span style="color: #4CAF50;">${t('admin.version_synced')}</span>`;
            } catch (e) {
                showToast(t('admin.version_update_failed') + ': ' + e.message, 'error');
                versionStatus.innerHTML = `<span style="color: #f44336;">${t('admin.update_failed')}</span>`;
            } finally {
                btnApplyVersion.disabled = false;
                btnApplyVersion.innerHTML = '📢 ' + t('admin.apply_version');
            }
        };
    }, 100);

    // 组装
    container.append(navBar, versionCard);

    return container;
}

/**
 * 创建广告横幅管理独立视图
 * @param {Object} currentUser - 当前用户对象
 * @returns {HTMLElement} 广告管理容器元素
 */
export function createBannerManageView(currentUser) {
    const container = document.createElement("div");
    container.style.cssText = "padding: 16px; background: var(--comfy-menu-bg); min-height: 100%;";

    // 顶部导航栏
    const navBar = document.createElement("div");
    navBar.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 0;";

    const backBtn = document.createElement("button");
    backBtn.innerHTML = "⬅ " + t('common.back');
    backBtn.style.cssText = "margin-left: 14px; margin-top: 2px; display: flex; align-items: center; gap: 6px; background: none; border: 1px solid rgba(85,85,85,0.6); color: #8b949e; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s;";
    backBtn.onmouseenter = () => { backBtn.style.borderColor = "#58a6ff"; backBtn.style.color = "#58a6ff"; };
    backBtn.onmouseleave = () => { backBtn.style.borderColor = "rgba(85,85,85,0.6)"; backBtn.style.color = "#8b949e"; };
    backBtn.onclick = () => {
        const view = createAdminPanelView(currentUser);
        window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view } }));
    };

    const navTitle = document.createElement("span");
    navTitle.style.cssText = "font-size: 16px; font-weight: 600; color: #e6edf3;";
    navTitle.innerHTML = "📰 " + t('admin.banner_manage_title');

    const bannerBadge = document.createElement("span");
    bannerBadge.style.cssText = "font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(76,175,80,0.15); color: #4CAF50; border: 1px solid rgba(76,175,80,0.3);";
    bannerBadge.textContent = t('admin.banner_config');

    navBar.append(backBtn, navTitle, bannerBadge);

    // 广告管理内容卡片
    const bannerCard = document.createElement("div");
    bannerCard.style.cssText = "background: rgba(30,30,30,0.95); border: 1px solid rgba(85,85,85,0.6); border-radius: 12px; padding: 20px; margin-bottom: 16px;";

    // 启用/禁用开关
    const enableRow = document.createElement("div");
    enableRow.style.cssText = "display: flex; align-items: center; gap: 10px; margin-bottom: 14px;";

    const enableLabel = document.createElement("span");
    enableLabel.style.cssText = "font-size: 13px; color: #aaa;";
    enableLabel.textContent = t('admin.enable_banner_display');

    const enableSwitch = document.createElement("input");
    enableSwitch.type = "checkbox";
    enableSwitch.id = "banner-enabled-switch";
    enableSwitch.style.cssText = "width: 18px; height: 18px; cursor: pointer; accent-color: #4CAF50;";

    enableRow.append(enableLabel, enableSwitch);

    // 横幅图片上传
    const bannerImgLabel = document.createElement("div");
    bannerImgLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    bannerImgLabel.textContent = t('admin.banner_img_hint');

    const bannerImgPreview = document.createElement("img");
    bannerImgPreview.id = "banner-img-preview";
    bannerImgPreview.style.cssText = "display: none; max-width: 100%; max-height: 80px; border-radius: 6px; margin-bottom: 8px; object-fit: contain; background: #2a2a2a;";

    const bannerImgBtn = document.createElement("button");
    bannerImgBtn.textContent = "🖼️ " + t('admin.select_banner_img');
    bannerImgBtn.style.cssText = "padding: 8px 16px; border: 1px dashed rgba(85,85,85,0.6); border-radius: 8px; background: #2a2a2a; color: #ccc; cursor: pointer; font-size: 13px; margin-bottom: 14px; transition: border-color 0.2s;";
    bannerImgBtn.onmouseenter = () => { bannerImgBtn.style.borderColor = "#4CAF50"; };
    bannerImgBtn.onmouseleave = () => { bannerImgBtn.style.borderColor = "rgba(85,85,85,0.6)"; };

    let bannerImageUrl = "";
    const bannerImgInput = document.createElement("input");
    bannerImgInput.type = "file";
    bannerImgInput.accept = "image/*";
    bannerImgInput.style.display = "none";
    bannerImgBtn.onclick = () => bannerImgInput.click();
    bannerImgInput.onchange = async () => {
        const file = bannerImgInput.files[0];
        if (!file) return;
        bannerImgBtn.textContent = "⬆️ " + t('admin.uploading');
        bannerImgBtn.disabled = true;
        try {
            const res = await api.uploadFile(file, "banner");
            if (res && res.url) {
                bannerImageUrl = res.url;
                bannerImgPreview.src = res.url;
                bannerImgPreview.style.display = "block";
                showToast("✅ " + t('admin.banner_upload_success'), "success");
            }
        } catch (e) {
            showToast("❌ " + t('admin.banner_upload_failed') + ": " + e.message, "error");
        } finally {
            bannerImgBtn.textContent = "🖼️ " + t('admin.select_banner_img');
            bannerImgBtn.disabled = false;
        }
    };

    // 详情页大图上传
    const detailImgLabel = document.createElement("div");
    detailImgLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    detailImgLabel.textContent = t('admin.detail_img_hint');

    const detailImgPreview = document.createElement("img");
    detailImgPreview.id = "banner-detail-img-preview";
    detailImgPreview.style.cssText = "display: none; max-width: 100%; max-height: 120px; border-radius: 6px; margin-bottom: 8px; object-fit: contain; background: #2a2a2a;";

    const detailImgBtn = document.createElement("button");
    detailImgBtn.textContent = "🖼️ " + t('admin.select_detail_img');
    detailImgBtn.style.cssText = "padding: 8px 16px; border: 1px dashed rgba(85,85,85,0.6); border-radius: 8px; background: #2a2a2a; color: #ccc; cursor: pointer; font-size: 13px; margin-bottom: 14px; transition: border-color 0.2s;";
    detailImgBtn.onmouseenter = () => { detailImgBtn.style.borderColor = "#4CAF50"; };
    detailImgBtn.onmouseleave = () => { detailImgBtn.style.borderColor = "rgba(85,85,85,0.6)"; };

    let detailImageUrl = "";
    const detailImgInput = document.createElement("input");
    detailImgInput.type = "file";
    detailImgInput.accept = "image/*";
    detailImgInput.style.display = "none";
    detailImgBtn.onclick = () => detailImgInput.click();
    detailImgInput.onchange = async () => {
        const file = detailImgInput.files[0];
        if (!file) return;
        detailImgBtn.textContent = "⬆️ " + t('admin.uploading');
        detailImgBtn.disabled = true;
        try {
            const res = await api.uploadFile(file, "banner");
            if (res && res.url) {
                detailImageUrl = res.url;
                detailImgPreview.src = res.url;
                detailImgPreview.style.display = "block";
                showToast("✅ " + t('admin.detail_upload_success'), "success");
            }
        } catch (e) {
            showToast("❌ " + t('admin.detail_upload_failed') + ": " + e.message, "error");
        } finally {
            detailImgBtn.textContent = "🖼️ " + t('admin.select_detail_img');
            detailImgBtn.disabled = false;
        }
    };

    // 标题输入框
    const titleLabel = document.createElement("div");
    titleLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    titleLabel.textContent = t('admin.banner_title_label');

    const titleInput = document.createElement("input");
    titleInput.id = "banner-title-input";
    titleInput.placeholder = t('admin.banner_title_placeholder');
    titleInput.style.cssText = "width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: #2a2a2a; color: #e6edf3; font-size: 13px; outline: none; box-sizing: border-box; margin-bottom: 14px; transition: border-color 0.2s;";
    titleInput.onfocus = () => { titleInput.style.borderColor = "#4CAF50"; };
    titleInput.onblur = () => { titleInput.style.borderColor = "rgba(85,85,85,0.6)"; };

    // 描述输入框
    const descLabel = document.createElement("div");
    descLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    descLabel.textContent = t('admin.banner_desc_label');

    const descInput = document.createElement("input");
    descInput.id = "banner-desc-input";
    descInput.placeholder = t('admin.banner_desc_placeholder');
    descInput.style.cssText = "width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: #2a2a2a; color: #e6edf3; font-size: 13px; outline: none; box-sizing: border-box; margin-bottom: 14px; transition: border-color 0.2s;";
    descInput.onfocus = () => { descInput.style.borderColor = "#4CAF50"; };
    descInput.onblur = () => { descInput.style.borderColor = "rgba(85,85,85,0.6)"; };

    // 详情内容输入框
    const detailLabel = document.createElement("div");
    detailLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    detailLabel.textContent = t('admin.banner_detail_label');

    const detailTextarea = document.createElement("textarea");
    detailTextarea.id = "banner-detail-textarea";
    detailTextarea.placeholder = t('admin.banner_detail_placeholder');
    detailTextarea.style.cssText = "width: 100%; min-height: 300px; padding: 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: #2a2a2a; color: #e6edf3; font-size: 13px; resize: vertical; box-sizing: border-box; outline: none; margin-bottom: 14px; transition: border-color 0.2s;";
    detailTextarea.onfocus = () => { detailTextarea.style.borderColor = "#4CAF50"; };
    detailTextarea.onblur = () => { detailTextarea.style.borderColor = "rgba(85,85,85,0.6)"; };

    // 保存按钮
    const btnSaveBanner = document.createElement("button");
    btnSaveBanner.innerHTML = "💾 " + t('admin.save_banner_config');
    btnSaveBanner.style.cssText = "width: 100%; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: #fff; background: #4CAF50; transition: all 0.2s;";
    btnSaveBanner.onmouseenter = () => { btnSaveBanner.style.transform = "translateY(-1px)"; btnSaveBanner.style.boxShadow = "0 4px 12px rgba(76,175,80,0.4)"; };
    btnSaveBanner.onmouseleave = () => { btnSaveBanner.style.transform = "none"; btnSaveBanner.style.boxShadow = "none"; };
    btnSaveBanner.onclick = async () => {
        const config = {
            enabled: enableSwitch.checked,
            bannerImage: bannerImageUrl,
            detailImage: detailImageUrl,
            title: titleInput.value.trim(),
            description: descInput.value.trim(),
            detailContent: detailTextarea.value.trim()
        };
        btnSaveBanner.textContent = "💾 " + t('admin.saving');
        btnSaveBanner.disabled = true;
        try {
            await api.setBannerConfig(config);
            showToast("✅ " + t('admin.banner_saved'), "success");
            // 保存成功后强制刷新广告横幅（内部已处理缓存清除）
            refreshBanner();
        } catch (e) {
            showToast("❌ " + t('admin.save_failed') + ": " + e.message, "error");
        } finally {
            btnSaveBanner.innerHTML = "💾 " + t('admin.save_banner_config');
            btnSaveBanner.disabled = false;
        }
    };

    bannerCard.append(
        enableRow,
        bannerImgLabel, bannerImgPreview, bannerImgBtn, bannerImgInput,
        detailImgLabel, detailImgPreview, detailImgBtn, detailImgInput,
        titleLabel, titleInput,
        descLabel, descInput,
        detailLabel, detailTextarea,
        btnSaveBanner
    );

    // 页面加载时读取当前广告配置
    (async () => {
        try {
            const res = await api.getBannerConfig();
            const data = res && res.data;
            if (data) {
                enableSwitch.checked = !!data.enabled;
                if (data.bannerImage) {
                    bannerImageUrl = data.bannerImage;
                    bannerImgPreview.src = data.bannerImage;
                    bannerImgPreview.style.display = "block";
                }
                if (data.detailImage) {
                    detailImageUrl = data.detailImage;
                    detailImgPreview.src = data.detailImage;
                    detailImgPreview.style.display = "block";
                }
                if (data.title) titleInput.value = data.title;
                if (data.description) descInput.value = data.description;
                if (data.detailContent) detailTextarea.value = data.detailContent;
            }
        } catch (e) {
            // 静默失败，保留空表单
            console.warn("加载广告配置失败:", e);
        }
    })();

    // 组装
    container.append(navBar, bannerCard);
    return container;
}
