// 前端页面/market/发布内容_UI模板.js

export function generatePublishHTML(isEditMode, viewTitle, submitBtnText, hasExistingToken, editItemData) {
    const safeData = editItemData || {};
    
    return `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 15px;">
            <!-- 🚀 返回按钮位置可调整参数：margin-left 控制右移，margin-top 控制下移 -->
            <button id="btn-back" style="margin-left: 15px; margin-top: 15px; background: rgba(51,51,51,0.8); border: 1px solid rgba(85,85,85,0.8); color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='rgba(51,51,51,0.8)'; this.style.borderColor='rgba(85,85,85,0.8)'">
                <span style="font-size: 14px;">⬅</span> 返回
            </button>
            <span style="font-size: 16px; font-weight: bold; color: #fff;">${viewTitle}</span>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 5px;">
            <div style="flex: 1;">
                <label style="display: block; margin-bottom: 5px;">主类别 <span style="color: #F44336;">*</span></label>
                <select id="pub-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="tool">🧰 原创插件 / 工具</option>
                    <option value="app">📦 原创工作流 / 应用</option>
                    <option value="recommend">🌟 推荐他人作品</option>
                </select>
            </div>
            <div id="box-recommend-type" style="display: none; flex: 1;">
                <label style="display: block; margin-bottom: 5px;">推荐形式 (三选一) <span style="color: #F44336;">*</span></label>
                <select id="pub-recommend-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="recommend_tool">🧰 作为工具 (支持Git安装)</option>
                    <option value="recommend_app">📦 作为应用 (加载JSON)</option>
                    <option value="recommend_link">🔗 纯链接 (新窗口打开)</option>
                </select>
            </div>
            <div style="flex: 2;">
                <label style="display: block; margin-bottom: 5px;">名称 <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-title" placeholder="例如：强烈推荐飞行翻译双语增强版！" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
        </div>

        <div style="margin-bottom: 5px;">
            <label style="display: block; margin-bottom: 5px;">简短描述 (一句话介绍) <span style="color: #F44336;">*</span></label>
            <input type="text" id="pub-short" placeholder="最多 50 字，突出核心亮点..." maxlength="50" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555;">
            <div style="flex: 1;" id="box-resource-select">
                <label style="display: block; margin-bottom: 5px;">资源接入 <span style="color: #F44336;">*</span></label>
                <select id="pub-resource-type" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="link">🔗 外部链接 / Git</option>
                    <option value="json">📄 上传 JSON</option>
                    <option value="netdisk">☁️ 网盘链接</option>
                </select>
            </div>
            <div style="flex: 2;" id="box-link">
                <label style="display: block; margin-bottom: 5px;">源地址或外部 URL <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-link" placeholder="输入外部地址或Git库链接..." style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div style="flex: 2; display: none;" id="box-json">
                <label style="display: block; margin-bottom: 5px;">选择 JSON 文件 <span style="color: #F44336;">*</span> <span id="json-file-hint" style="color:#4CAF50; font-size:12px; font-weight:normal; display:none;">(已包含云端文件，重新选择将覆盖)</span></label>
                <input type="file" id="pub-json" accept=".json" style="width: 100%; padding: 6px; color: #aaa; font-size: 12px;">
            </div>
            <div style="flex: 2; display: none;" id="box-netdisk">
                <label style="display: block; margin-bottom: 5px;">网盘链接 <span style="color: #F44336;">*</span></label>
                <input type="text" id="pub-netdisk-link" placeholder="粘贴百度网盘/阿里云盘等分享链接..." style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
        </div>

        <div id="netdisk-password-settings" style="margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555; display: none;">
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 6px; color: #FF9800; font-weight: bold;">🔐 网盘提取码 (可选)</label>
                    <input type="text" id="pub-netdisk-password" placeholder="填写网盘密码，如：1234" maxlength="20" style="width: 100%; padding: 8px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="flex: 2; padding-top: 28px;">
                    <div style="font-size: 11px; color: #888; line-height: 1.4;">🔒 <span style="color: #4CAF50; font-weight: bold;">安全保障</span>：密码加密存储于云端，仅在用户成功购买后所解密显示。未购买用户无法通过任何接口获取。</div>
                </div>
            </div>
        </div>

        <div id="private-repo-settings" style="margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555; display: none;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #aaa; font-size: 13px;">
                <input type="checkbox" id="pub-is-private" ${hasExistingToken ? 'checked' : ''} style="cursor: pointer;">
                这是一个私有 GitHub 仓库（需配置访问密钥）
            </label>
            <div id="github-token-container" style="display: ${hasExistingToken ? 'block' : 'none'}; margin-top: 10px; padding: 12px; background: rgba(33, 150, 243, 0.1); border: 1px dashed #2196F3; border-radius: 6px;">
                <label style="display: block; margin-bottom: 6px; color: #2196F3; font-weight: bold;">🔒 私有库专属访问密钥 (PAT) <span style="color: #F44336;">*</span></label>
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px; line-height: 1.4;">系统使用此 Token 替购买者拉取源码。该密钥仅存储于云端后台，<span style="color:#F44336; font-weight:bold;">绝对不会在前端接口中公开暴露</span>。</div>
                <input type="password" id="pub-github-token" value="${isEditMode ? (safeData.github_token || '') : ''}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style="width: 100%; padding: 8px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
            </div>
        </div>

        <div id="box-cover" style="margin-bottom: 5px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555;">
            <label style="display: block; margin-bottom: 5px;">🖼️ 效果展示图 (最多6张，可选) <span id="cover-file-hint" style="color:#4CAF50; font-size:12px; font-weight:normal; display:none;">(重新选择将覆盖原图)</span></label>
            <input type="file" id="pub-images" accept="image/*" multiple style="width: 100%; padding: 4px; color: #aaa; font-size: 12px;">
            <div style="font-size: 11px; color: #888; margin-top: 4px;">支持拖拽多选，第一张将作为封面图</div>
            <div id="pub-images-preview" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;"></div>
        </div>

        <div id="box-price" style="display: flex; gap: 10px; margin-bottom: 5px;">
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                <label style="display: block; margin-bottom: 5px;">标价 (积分) <span style="color: #F44336;">*</span></label>
                <input type="number" id="pub-price" value="0" min="0" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #FF9800; font-weight: bold; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div style="flex: 2;">
                <div style="font-size: 11px; color: #888; margin-top: 25px; line-height: 1.4;">填写 0 代表免费开源。</div>
            </div>
        </div>

        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px;">详细说明</label>
            <textarea id="pub-full" rows="36" placeholder="介绍具体功能、使用方法、前置环境要求等..." style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; resize: vertical; box-sizing: border-box;"></textarea>
        </div>

        <button id="btn-submit-publish" style="width: 100%; padding: 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 15px; transition: 0.3s; margin-bottom: 20px;">${submitBtnText}</button>
    `;
}