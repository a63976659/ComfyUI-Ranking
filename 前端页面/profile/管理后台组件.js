// 前端页面/profile/管理后台组件.js
import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";
import { getVersionConfig, getStageLabel } from "../components/关于插件组件.js";
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
        const stageLabel = getStageLabel(config.stage);
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

    actionsBtnGroup.append(btnWithdraw, btnDispute);
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
    // 📢 广告横幅管理卡片
    // ==========================================
    const bannerCard = document.createElement("div");
    bannerCard.style.cssText = "background: rgba(30,30,30,0.95); border: 1px solid rgba(85,85,85,0.6); border-radius: 12px; padding: 20px; margin-bottom: 16px;";

    const bannerHeader = document.createElement("div");
    bannerHeader.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 14px;";

    const bannerTitle = document.createElement("span");
    bannerTitle.style.cssText = "font-size: 14px; font-weight: 600; color: #e6edf3;";
    bannerTitle.innerHTML = "📰 广告横幅管理";

    const bannerBadge = document.createElement("span");
    bannerBadge.style.cssText = "font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(76,175,80,0.15); color: #4CAF50; border: 1px solid rgba(76,175,80,0.3);";
    bannerBadge.textContent = "广告配置";

    bannerHeader.append(bannerTitle, bannerBadge);

    // 启用/禁用开关
    const enableRow = document.createElement("div");
    enableRow.style.cssText = "display: flex; align-items: center; gap: 10px; margin-bottom: 14px;";

    const enableLabel = document.createElement("span");
    enableLabel.style.cssText = "font-size: 13px; color: #aaa;";
    enableLabel.textContent = "启用广告显示：";

    const enableSwitch = document.createElement("input");
    enableSwitch.type = "checkbox";
    enableSwitch.id = "banner-enabled-switch";
    enableSwitch.style.cssText = "width: 18px; height: 18px; cursor: pointer; accent-color: #4CAF50;";

    enableRow.append(enableLabel, enableSwitch);

    // 横幅图片上传
    const bannerImgLabel = document.createElement("div");
    bannerImgLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    bannerImgLabel.textContent = "横幅图片（显示在顶部导航）：";

    const bannerImgPreview = document.createElement("img");
    bannerImgPreview.id = "banner-img-preview";
    bannerImgPreview.style.cssText = "display: none; max-width: 100%; max-height: 80px; border-radius: 6px; margin-bottom: 8px; object-fit: contain; background: #2a2a2a;";

    const bannerImgBtn = document.createElement("button");
    bannerImgBtn.textContent = "🖼️ 选择横幅图片";
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
        bannerImgBtn.textContent = "⬆️ 上传中...";
        bannerImgBtn.disabled = true;
        try {
            const res = await api.uploadFile(file, "banner");
            if (res && res.url) {
                bannerImageUrl = res.url;
                bannerImgPreview.src = res.url;
                bannerImgPreview.style.display = "block";
                showToast("✅ 横幅图片上传成功", "success");
            }
        } catch (e) {
            showToast("❌ 横幅图片上传失败: " + e.message, "error");
        } finally {
            bannerImgBtn.textContent = "🖼️ 选择横幅图片";
            bannerImgBtn.disabled = false;
        }
    };

    // 详情页大图上传
    const detailImgLabel = document.createElement("div");
    detailImgLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    detailImgLabel.textContent = "详情页大图（点击横幅后展开）：";

    const detailImgPreview = document.createElement("img");
    detailImgPreview.id = "banner-detail-img-preview";
    detailImgPreview.style.cssText = "display: none; max-width: 100%; max-height: 120px; border-radius: 6px; margin-bottom: 8px; object-fit: contain; background: #2a2a2a;";

    const detailImgBtn = document.createElement("button");
    detailImgBtn.textContent = "🖼️ 选择详情页大图";
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
        detailImgBtn.textContent = "⬆️ 上传中...";
        detailImgBtn.disabled = true;
        try {
            const res = await api.uploadFile(file, "banner");
            if (res && res.url) {
                detailImageUrl = res.url;
                detailImgPreview.src = res.url;
                detailImgPreview.style.display = "block";
                showToast("✅ 详情页大图上传成功", "success");
            }
        } catch (e) {
            showToast("❌ 详情页大图上传失败: " + e.message, "error");
        } finally {
            detailImgBtn.textContent = "🖼️ 选择详情页大图";
            detailImgBtn.disabled = false;
        }
    };

    // 标题输入框
    const titleLabel = document.createElement("div");
    titleLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    titleLabel.textContent = "广告标题：";

    const titleInput = document.createElement("input");
    titleInput.id = "banner-title-input";
    titleInput.placeholder = "输入广告标题";
    titleInput.style.cssText = "width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: #2a2a2a; color: #e6edf3; font-size: 13px; outline: none; box-sizing: border-box; margin-bottom: 14px; transition: border-color 0.2s;";
    titleInput.onfocus = () => { titleInput.style.borderColor = "#4CAF50"; };
    titleInput.onblur = () => { titleInput.style.borderColor = "rgba(85,85,85,0.6)"; };

    // 描述输入框
    const descLabel = document.createElement("div");
    descLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    descLabel.textContent = "广告描述：";

    const descInput = document.createElement("input");
    descInput.id = "banner-desc-input";
    descInput.placeholder = "输入广告简短描述";
    descInput.style.cssText = "width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: #2a2a2a; color: #e6edf3; font-size: 13px; outline: none; box-sizing: border-box; margin-bottom: 14px; transition: border-color 0.2s;";
    descInput.onfocus = () => { descInput.style.borderColor = "#4CAF50"; };
    descInput.onblur = () => { descInput.style.borderColor = "rgba(85,85,85,0.6)"; };

    // 详情内容输入框
    const detailLabel = document.createElement("div");
    detailLabel.style.cssText = "font-size: 13px; color: #aaa; margin-bottom: 6px;";
    detailLabel.textContent = "详情内容（支持多行文本）：";

    const detailTextarea = document.createElement("textarea");
    detailTextarea.id = "banner-detail-textarea";
    detailTextarea.placeholder = "输入广告详情页的详细文本内容";
    detailTextarea.style.cssText = "width: 100%; min-height: 80px; padding: 12px; border-radius: 8px; border: 1px solid rgba(85,85,85,0.6); background: #2a2a2a; color: #e6edf3; font-size: 13px; resize: vertical; box-sizing: border-box; outline: none; margin-bottom: 14px; transition: border-color 0.2s;";
    detailTextarea.onfocus = () => { detailTextarea.style.borderColor = "#4CAF50"; };
    detailTextarea.onblur = () => { detailTextarea.style.borderColor = "rgba(85,85,85,0.6)"; };

    // 保存按钮
    const btnSaveBanner = document.createElement("button");
    btnSaveBanner.innerHTML = "💾 保存广告配置";
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
        btnSaveBanner.textContent = "💾 保存中...";
        btnSaveBanner.disabled = true;
        try {
            await api.setBannerConfig(config);
            showToast("✅ 广告配置已保存", "success");
            // 保存成功后强制刷新广告横幅（内部已处理缓存清除）
            refreshBanner();
        } catch (e) {
            showToast("❌ 保存失败: " + e.message, "error");
        } finally {
            btnSaveBanner.innerHTML = "💾 保存广告配置";
            btnSaveBanner.disabled = false;
        }
    };

    bannerCard.append(
        bannerHeader, enableRow,
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

    // ==========================================
    // 组装
    // ==========================================
    container.append(navBar, actionsCard, announceCard, scriptCard, bannerCard);

    return container;
}
