// 前端页面/market/发布内容_UI模板.js
import { escapeHtml } from "../core/全局配置.js";

export function generatePublishHTML(isEditMode, viewTitle, submitBtnText, hasExistingToken, editItemData, t) {
    const safeData = editItemData || {};

    return `
        <section class="ranking-publish" aria-labelledby="publish-view-title">
        <header class="ranking-publish__header">
            <button type="button" id="btn-back" class="ranking-publish__back">⬅ ${escapeHtml(t('common.back'))}</button>
            <h2 id="publish-view-title" class="ranking-publish__title">${escapeHtml(viewTitle)}</h2>
        </header>

        <div class="ranking-publish__row">
            <div class="ranking-publish__field">
                <label for="pub-type">${escapeHtml(t('publish.main_category'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <select id="pub-type" class="form-input" aria-required="true">
                    <option value="tool">🧰 ${escapeHtml(t('publish.type_tool'))}</option>
                    <option value="skill">⚡ ${escapeHtml(t('publish.type_skill'))}</option>
                    <option value="app">📦 ${escapeHtml(t('publish.type_app'))}</option>
                    <option value="recommend">🌟 ${escapeHtml(t('publish.type_recommend'))}</option>
                </select>
            </div>
            <div id="box-recommend-type" class="ranking-publish__field" style="display: none;">
                <label for="pub-recommend-type">${escapeHtml(t('publish.recommend_form'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <select id="pub-recommend-type" class="form-input" aria-required="true">
                    <option value="recommend_tool">🧰 ${escapeHtml(t('publish.recommend_as_tool'))}</option>
                    <option value="recommend_skill">⚡ ${escapeHtml(t('publish.recommend_as_skill'))}</option>
                    <option value="recommend_app">📦 ${escapeHtml(t('publish.recommend_as_app'))}</option>
                    <option value="recommend_link">🔗 ${escapeHtml(t('publish.recommend_as_link'))}</option>
                </select>
            </div>
            <div class="ranking-publish__field ranking-publish__field--wide">
                <label for="pub-title">${escapeHtml(t('publish.name'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <input type="text" id="pub-title" placeholder="${escapeHtml(t('publish.name_placeholder'))}" required class="form-input">
            </div>
        </div>

        <div class="ranking-publish__field">
            <label for="pub-short">${escapeHtml(t('publish.short_desc'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
            <input type="text" id="pub-short" placeholder="${escapeHtml(t('publish.short_desc_placeholder'))}" maxlength="50" required class="form-input">
        </div>

        <div class="ranking-publish__row ranking-publish__panel">
            <div class="ranking-publish__field" id="box-resource-select">
                <label for="pub-resource-type">${escapeHtml(t('publish.resource_type'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <select id="pub-resource-type" class="form-input" aria-required="true">
                    <option value="link">🔗 ${escapeHtml(t('publish.resource_link'))}</option>
                    <option value="json">📄 ${escapeHtml(t('publish.resource_json'))}</option>
                    <option value="netdisk">☁️ ${escapeHtml(t('publish.resource_netdisk'))}</option>
                </select>
            </div>
            <div class="ranking-publish__field ranking-publish__field--wide" id="box-link">
                <label for="pub-link">${escapeHtml(t('publish.source_url'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <input type="text" id="pub-link" placeholder="${escapeHtml(t('publish.source_url_placeholder'))}" class="form-input" aria-required="true">
            </div>
            <div class="ranking-publish__field ranking-publish__field--wide" id="box-json" style="display: none;">
                <label for="pub-json">${escapeHtml(t('publish.select_json'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span> <span id="json-file-hint" class="ranking-publish__file-hint" style="display: none;">(${escapeHtml(t('publish.has_cloud_file'))})</span></label>
                <input type="file" id="pub-json" accept=".json" aria-describedby="json-file-hint" class="ranking-publish__file">
            </div>
            <div class="ranking-publish__field ranking-publish__field--wide" id="box-netdisk" style="display: none;">
                <label for="pub-netdisk-link">${escapeHtml(t('publish.netdisk_link'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <input type="text" id="pub-netdisk-link" placeholder="${escapeHtml(t('publish.netdisk_placeholder'))}" class="form-input" aria-required="true">
            </div>
        </div>

        <div id="netdisk-password-settings" class="ranking-publish__panel" style="display: none;">
            <div class="ranking-publish__row">
                <div class="ranking-publish__field">
                    <label for="pub-netdisk-password" class="ranking-publish__security-label">🔐 ${escapeHtml(t('publish.netdisk_password'))}</label>
                    <input type="text" id="pub-netdisk-password" placeholder="${escapeHtml(t('publish.netdisk_password_placeholder'))}" maxlength="20" class="form-input" aria-describedby="publish-password-hint">
                </div>
                <div id="publish-password-hint" class="ranking-publish__hint ranking-publish__field--wide ranking-publish__aligned-hint">🔒 <strong>${escapeHtml(t('publish.security_guarantee'))}</strong>：${escapeHtml(t('publish.password_encrypted_hint'))}</div>
            </div>
        </div>

        <div id="private-repo-settings" class="ranking-publish__panel" style="display: none;">
            <label class="ranking-publish__checkbox">
                <input type="checkbox" id="pub-is-private" ${hasExistingToken ? 'checked' : ''}>
                <span>${escapeHtml(t('publish.private_repo_hint'))}</span>
            </label>
            <div id="github-token-container" class="ranking-publish__token" style="display: ${hasExistingToken ? 'block' : 'none'};">
                <label for="pub-github-token" class="ranking-publish__security-label">🔒 ${escapeHtml(t('publish.pat_label'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <div id="publish-pat-hint" class="ranking-publish__hint">${escapeHtml(t('publish.pat_hint'))} <strong class="ranking-publish__security-emphasis">${escapeHtml(t('publish.pat_privacy'))}</strong></div>
                <input type="password" id="pub-github-token" value="${escapeHtml(isEditMode ? (safeData.github_token || '') : '')}" placeholder="${hasExistingToken && !safeData.github_token ? escapeHtml(t('publish.token_keep_hint')) : escapeHtml(t('publish.token_placeholder'))}" class="form-input" aria-describedby="publish-pat-hint">
            </div>
        </div>

        <div id="box-cover" class="ranking-publish__panel ranking-publish__field">
            <label for="pub-images">🖼️ ${escapeHtml(t('publish.effect_images'))} <span id="cover-file-hint" class="ranking-publish__file-hint" style="display: none;">(${escapeHtml(t('publish.reselect_override'))})</span></label>
            <input type="file" id="pub-images" accept="image/*" multiple class="ranking-publish__file" aria-describedby="publish-images-hint cover-file-hint">
            <div id="publish-images-hint" class="ranking-publish__hint">${escapeHtml(t('publish.drag_select_hint'))}</div>
            <div id="pub-images-preview" class="ranking-publish__preview"></div>
        </div>

        <div id="box-price" class="ranking-publish__row">
            <div class="ranking-publish__field">
                <label for="pub-price">${escapeHtml(t('publish.price'))} <span class="ranking-publish__required ranking-required-marker" aria-hidden="true"></span></label>
                <input type="number" id="pub-price" value="0" min="0" class="form-input ranking-publish__price" aria-required="true" aria-describedby="publish-price-hint price-pending-hint">
                <div id="price-pending-hint" class="ranking-publish__pending" role="status" style="display: none;"></div>
            </div>
            <div id="publish-price-hint" class="ranking-publish__hint ranking-publish__field--wide ranking-publish__aligned-hint">${escapeHtml(t('publish.price_hint'))}<br>⚠️ <strong>${escapeHtml(t('publish.price_delay_hint'))}</strong></div>
        </div>

        <div class="ranking-publish__field">
            <label for="pub-full">${escapeHtml(t('publish.full_desc'))}</label>
            <textarea id="pub-full" rows="36" placeholder="${escapeHtml(t('publish.full_desc_placeholder'))}" class="form-input ranking-publish__description"></textarea>
        </div>

        <div class="ranking-publish__panel">
            <label class="ranking-publish__checkbox">
                <input type="checkbox" id="is-original-checkbox" ${safeData.is_original ? 'checked' : ''} aria-describedby="original-hint-text" />
                <span>🎨 ${escapeHtml(t('publish.mark_as_original'))}</span>
            </label>
            <div id="original-hint-text" class="ranking-publish__hint ranking-publish__checkbox-hint">${escapeHtml(t('publish.original_default_hint'))}</div>
        </div>

        <div id="box-allow-refund" class="ranking-publish__panel">
            <label class="ranking-publish__checkbox">
                <input type="checkbox" id="allow-refund-checkbox" ${safeData.allow_refund !== false ? 'checked' : ''} aria-describedby="publish-refund-hint" />
                <span>💸 ${escapeHtml(t('publish.allow_refund'))}</span>
            </label>
            <div id="publish-refund-hint" class="ranking-publish__hint ranking-publish__checkbox-hint">${escapeHtml(t('publish.refund_hint'))}</div>
        </div>

        <button type="button" id="btn-submit-publish" class="ranking-publish__submit">${escapeHtml(submitBtnText)}</button>
        </section>
    `;
}
