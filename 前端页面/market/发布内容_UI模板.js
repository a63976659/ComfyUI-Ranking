// 前端页面/market/发布内容_UI模板.js

export function generatePublishHTML(isEditMode, viewTitle, submitBtnText, hasExistingToken, editItemData, t) {
    const safeData = editItemData || {};
    
    return `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 15px;">
            <!-- 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移 -->
            <button id="btn-back" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                <span style="font-size: 14px;">⬅</span> ${t('common.back')}
            </button>
            <span style="font-size: 16px; font-weight: bold; color: #fff;">${viewTitle}</span>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 5px;">
            <div style="flex: 1;">
                <label style="display: block; margin-bottom: 5px;">${t('publish.main_category')} <span style="color: #F44336;">*</span></label>
                <select id="pub-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="tool">🧰 ${t('publish.type_tool')}</option>
                    <option value="app">📦 ${t('publish.type_app')}</option>
                    <option value="recommend">🌟 ${t('publish.type_recommend')}</option>
                </select>
            </div>
            <div id="box-recommend-type" style="display: none; flex: 1;">
                <label style="display: block; margin-bottom: 5px;">${t('publish.recommend_form')} <span style="color: #F44336;">*</span></label>
                <select id="pub-recommend-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="recommend_tool">🧰 ${t('publish.recommend_as_tool')}</option>
                    <option value="recommend_app">📦 ${t('publish.recommend_as_app')}</option>
                    <option value="recommend_link">🔗 ${t('publish.recommend_as_link')}</option>
                </select>
            </div>
            <div style="flex: 2;">
                <label style="display: block; margin-bottom: 5px;">${t('publish.name')} <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-title" placeholder="${t('publish.name_placeholder')}" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
        </div>

        <div style="margin-bottom: 5px;">
            <label style="display: block; margin-bottom: 5px;">${t('publish.short_desc')} <span style="color: #F44336;">*</span></label>
            <input type="text" id="pub-short" placeholder="${t('publish.short_desc_placeholder')}" maxlength="50" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555;">
            <div style="flex: 1;" id="box-resource-select">
                <label style="display: block; margin-bottom: 5px;">${t('publish.resource_type')} <span style="color: #F44336;">*</span></label>
                <select id="pub-resource-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="link">🔗 ${t('publish.resource_link')}</option>
                    <option value="json">📄 ${t('publish.resource_json')}</option>
                    <option value="netdisk">☁️ ${t('publish.resource_netdisk')}</option>
                </select>
            </div>
            <div style="flex: 2;" id="box-link">
                <label style="display: block; margin-bottom: 5px;">${t('publish.source_url')} <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-link" placeholder="${t('publish.source_url_placeholder')}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div style="flex: 2; display: none;" id="box-json">
                <label style="display: block; margin-bottom: 5px;">${t('publish.select_json')} <span style="color: #F44336;">*</span> <span id="json-file-hint" style="color:#4CAF50; font-size:12px; font-weight:normal; display:none;">(${t('publish.has_cloud_file')})</span></label>
                <input type="file" id="pub-json" accept=".json" style="width: 100%; padding: 6px; color: #aaa; font-size: 12px;">
            </div>
            <div style="flex: 2; display: none;" id="box-netdisk">
                <label style="display: block; margin-bottom: 5px;">${t('publish.netdisk_link')} <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-netdisk-link" placeholder="${t('publish.netdisk_placeholder')}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
        </div>

        <div id="netdisk-password-settings" style="margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555; display: none;">
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 6px; color: #FF9800; font-weight: bold;">🔐 ${t('publish.netdisk_password')}</label>
                    <input type="text" id="pub-netdisk-password" placeholder="${t('publish.netdisk_password_placeholder')}" maxlength="20" style="width: 100%; padding: 8px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="flex: 2; padding-top: 28px;">
                    <div style="font-size: 11px; color: #888; line-height: 1.4;">🔒 <span style="color: #4CAF50; font-weight: bold;">${t('publish.security_guarantee')}</span>：${t('publish.password_encrypted_hint')}</div>
                </div>
            </div>
        </div>

        <div id="private-repo-settings" style="margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555; display: none;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #aaa; font-size: 13px;">
                <input type="checkbox" id="pub-is-private" ${hasExistingToken ? 'checked' : ''} style="cursor: pointer;">
                ${t('publish.private_repo_hint')}
            </label>
            <div id="github-token-container" style="display: ${hasExistingToken ? 'block' : 'none'}; margin-top: 10px; padding: 12px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; border-radius: 6px;">
                <label style="display: block; margin-bottom: 6px; color: #2196F3; font-weight: bold;">🔒 ${t('publish.pat_label')} <span style="color: #F44336;">*</span></label>
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px; line-height: 1.4;">${t('publish.pat_hint')}</div>
                <input type="password" id="pub-github-token" value="${isEditMode ? (safeData.github_token || '') : ''}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style="width: 100%; padding: 8px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
        </div>

        <div id="box-cover" style="margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555;">
            <label style="display: block; margin-bottom: 5px;">🖼️ ${t('publish.effect_images')} <span id="cover-file-hint" style="color:#4CAF50; font-size:12px; font-weight:normal; display:none;">(${t('publish.reselect_override')})</span></label>
            <input type="file" id="pub-images" accept="image/*" multiple style="width: 100%; padding: 4px; color: #aaa; font-size: 12px;">
            <div style="font-size: 11px; color: #888; margin-top: 4px;">${t('publish.drag_select_hint')}</div>
            <div id="pub-images-preview" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;"></div>
        </div>

        <div id="box-price" style="display: flex; gap: 10px; margin-bottom: 5px;">
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                <label style="display: block; margin-bottom: 5px;">${t('publish.price')} <span style="color: #F44336;">*</span></label>
                <input type="number" id="pub-price" value="0" min="0" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #FF9800; font-weight: bold; border-radius: 4px; box-sizing: border-box;">
                <!-- 🔄 P7后悔模式：价格延迟生效提示 -->
                <div id="price-pending-hint" style="display: none; margin-top: 6px; padding: 6px 8px; background: rgba(255,152,0,0.15); border: 1px dashed #FF9800; border-radius: 4px; font-size: 11px; color: #FF9800;">
                </div>
            </div>
            <div style="flex: 2;">
                <div style="font-size: 11px; color: #888; margin-top: 25px; line-height: 1.4;">${t('publish.price_hint')}<br>⚠️ <strong>${t('publish.price_delay_hint')}</strong></div>
            </div>
        </div>

        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px;">${t('publish.full_desc')}</label>
            <textarea id="pub-full" rows="36" placeholder="${t('publish.full_desc_placeholder')}" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; resize: vertical; box-sizing: border-box;"></textarea>
        </div>

        <!-- 原创作品勾选框 -->
        <div style="margin-bottom: 15px; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="is-original-checkbox" ${safeData.is_original ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer; accent-color: #4CAF50;" />
                <span style="font-size: 13px; color: #ccc;">🎨 标记为原创作品</span>
            </label>
            <div id="original-hint-text" style="font-size: 11px; color: #888; margin-top: 6px; padding-left: 24px;">
                原创内容将获得特殊标识展示，请勿标记非原创内容
            </div>
        </div>

        <button id="btn-submit-publish" style="width: 100%; padding: 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 15px; transition: 0.3s; margin-bottom: 20px;">${submitBtnText}</button>
    `;
}