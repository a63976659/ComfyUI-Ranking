// 申诉详情：证据只在当前会话内展示，所有用户数据写文本节点。
import { api, captureRequestSession, requestCancelManager } from "../core/网络请求API.js";
import { eventBus, EVENTS } from "../core/状态管理.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t, getLanguage } from "../components/用户体验增强.js";
import { CACHE, UI, PLACEHOLDERS } from "../core/全局配置.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "./任务视图生命周期.js";
import { normalizeDispute, disputeImageURL } from "./申诉数据工具.js";

let disputeViewSequence = 0;
function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
}
function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    if (timestamp == null || !Number.isFinite(date.getTime())) return t('common.unknown');
    return date.toLocaleString(getLanguage(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function statusNode(text, error = false) {
    const status = node('div', 'dispute-load-status', text);
    status.setAttribute('role', error ? 'alert' : 'status');
    status.setAttribute('aria-live', 'polite');
    return status;
}

export function createDisputeDetailView(disputeId, currentUser, onBack) {
    const container = node('div', 'dispute-detail-container');
    const instance = ++disputeViewSequence;
    const componentId = `dispute-detail-${instance}`;
    const header = node('header', 'dispute-header');
    const back = node('button', 'dispute-back-btn', `⬅ ${t('common.back')}`);
    back.type = 'button';
    back.onclick = () => { container._cleanup(); onBack?.(); };
    header.append(back, node('h1', 'dispute-title', t('dispute.title')));
    const body = node('div', 'dispute-detail-body');
    body.append(statusNode(t('common.loading')));
    container.append(header, body);
    const scope = createTaskViewScope({
        sessionMatches: captureRequestSession(), connected: () => container.isConnected,
        subscribe: notify => subscribeTaskSessionChanges(notify, {
            target: window, eventBus, events: EVENTS,
            userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN
        }),
        cancelReads: () => requestCancelManager.cancelAll(componentId),
        invalidate: () => {
            body.removeAttribute('aria-busy');
            body.replaceChildren(statusNode(t('dispute.session_changed')));
        }
    });
    container._cleanup = () => { scope.dispose(); body.replaceChildren(); };
    loadDisputeDetail();
    return container;

    async function loadDisputeDetail() {
        if (scope.generation) requestCancelManager.cancelAll(componentId);
        const generation = (scope.generation || 0) + 1;
        scope.generation = generation;
        const current = () => scope.isCurrent() && scope.generation === generation;
        body.replaceChildren(statusNode(t('common.loading')));
        body.setAttribute('aria-busy', 'true');
        try {
            const response = await api.getDisputeDetail(disputeId, { componentId });
            if (!current()) return;
            const dispute = response?.status === 'success' ? normalizeDispute(response.data, disputeId) : null;
            if (!dispute) throw new Error('Invalid dispute response');
            render(dispute);
        } catch (_) {
            if (!current()) return;
            body.replaceChildren(statusNode(t('dispute.get_detail_failed'), true));
        } finally {
            if (current()) body.removeAttribute('aria-busy');
        }
    }
    function section(title) {
        const element = node('section', 'dispute-section');
        element.append(node('h2', 'dispute-section-title', title));
        body.append(element);
        return element;
    }
    function evidenceGallery(urls) {
        const gallery = node('div', 'dispute-evidence');
        urls.forEach((url, index) => {
            const link = node('a', 'dispute-evidence-link');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.setAttribute('aria-label', t('dispute.open_evidence', { index: index + 1 }));
            link.onclick = event => { if (!scope.isCurrent()) event.preventDefault(); };
            const image = node('img');
            image.src = url;
            image.alt = '';
            image.loading = 'lazy';
            link.append(image);
            gallery.append(link);
        });
        return gallery;
    }
    function party(parent, account, name, avatar, label, initiator) {
        const row = node('div', 'dispute-party');
        const image = node('img', 'dispute-party-avatar');
        image.src = avatar || PLACEHOLDERS.AVATAR_SMALL;
        image.alt = '';
        const info = node('div', 'dispute-party-info');
        info.append(node('div', 'dispute-party-name', name || account),
            node('div', 'dispute-party-role', `${label} ${t(initiator ? 'dispute.initiator' : 'dispute.respondent')}`));
        row.append(image, info);
        parent.append(row);
    }
    function statement(parent, kind, text, urls, timeLabel, timestamp) {
        const content = node('div', `dispute-content ${kind}`, text || t('common.none'));
        content.append(evidenceGallery(urls), node('div', 'dispute-time', `${timeLabel} ${formatTime(timestamp)}`));
        parent.append(content);
    }
    function render(dispute) {
        body.replaceChildren();
        const statusLabels = { pending: t('dispute.status_pending'), responded: t('dispute.status_responded'), resolved: t('dispute.status_resolved') };
        const status = node('div', 'dispute-status', statusLabels[dispute.status]);
        status.dataset.status = dispute.status;
        body.append(status);
        const taskSection = section(t('dispute.related_task'));
        taskSection.append(node('div', 'dispute-task-title', dispute.task_title || t('common.unknown_task')),
            node('div', 'dispute-time', `${t('dispute.task_id')}: ${dispute.task_id}`));
        const parties = section(t('dispute.parties'));
        party(parties, dispute.publisher, dispute.publisher_name, dispute.publisher_avatar, t('dispute.publisher'), dispute.initiator_role === 'publisher');
        party(parties, dispute.assignee, dispute.assignee_name, dispute.assignee_avatar, t('task.assignee'), dispute.initiator_role === 'assignee');
        statement(section(t('dispute.initiator_statement')), 'initiator', dispute.reason, dispute.evidence, t('dispute.submitted_at'), dispute.created_at);
        const responseSection = section(t('dispute.respondent_response'));
        const account = typeof currentUser === 'string' ? currentUser : currentUser?.account;
        const respondent = dispute.initiator_role === 'publisher' ? dispute.assignee : dispute.publisher;
        if (dispute.response) {
            statement(responseSection, 'respondent', dispute.response, dispute.response_evidence, t('dispute.responded_at'), dispute.responded_at);
        } else {
            responseSection.append(node('div', 'dispute-no-response', t('dispute.no_response')));
            if (account && account === respondent && dispute.status === 'pending') responseForm(responseSection, dispute);
        }
        if (dispute.status === 'resolved') {
            const result = section(t('dispute.resolution_result'));
            result.classList.add('dispute-resolution');
            let resolution = t('dispute.resolved');
            if (dispute.resolution === 'favor_initiator') resolution = t('dispute.favor_initiator');
            else if (dispute.resolution === 'favor_respondent') resolution = t('dispute.favor_respondent');
            else if (dispute.resolution === 'split') resolution = dispute.resolution_ratio == null ? t('common.unknown')
                : t('dispute.split_detail', { ratio: dispute.resolution_ratio, other: 100 - dispute.resolution_ratio });
            result.append(node('div', 'dispute-resolution-result', resolution));
            if (dispute.resolution_note) result.append(node('div', 'dispute-resolution-note', dispute.resolution_note));
            result.append(node('div', 'dispute-time', `${t('dispute.resolved_at')} ${formatTime(dispute.resolved_at)}`));
        }
    }
    function responseForm(parent, dispute) {
        const form = node('form', 'dispute-respond-form');
        const label = node('label', 'dispute-response-label', t('dispute.respondent_response'));
        const textarea = node('textarea');
        textarea.id = `dispute-response-${instance}`;
        textarea.placeholder = t('dispute.respond_placeholder');
        label.htmlFor = textarea.id;
        const upload = node('button', 'dispute-upload-area', t('dispute.click_upload_evidence_optional'));
        upload.type = 'button';
        const fileInput = node('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.hidden = true;
        const previews = node('div', 'dispute-uploaded-images');
        const progress = statusNode('');
        progress.hidden = true;
        const submit = node('button', 'dispute-respond-btn primary', t('dispute.submit_response'));
        submit.type = 'submit';
        const uploaded = [];
        let uploading = false, submitting = false;
        const current = () => scope.isCurrent() && form.isConnected;
        scope.addCleanup(() => { uploaded.length = 0; textarea.value = ''; fileInput.value = ''; });
        const updateBusy = () => {
            upload.disabled = uploading || submitting;
            submit.disabled = uploading || submitting;
            textarea.disabled = submitting;
            form.setAttribute('aria-busy', String(uploading || submitting));
            submit.textContent = submitting ? t('common.submitting') : t('dispute.submit_response');
            previews.querySelectorAll('button').forEach(button => { button.disabled = uploading || submitting; });
        };
        function renderPreviews() {
            previews.replaceChildren();
            uploaded.forEach((url, index) => {
                const wrapper = node('div', 'dispute-uploaded-image');
                const image = node('img');
                image.src = url; image.alt = '';
                const remove = node('button', 'dispute-remove-evidence', '×');
                remove.type = 'button';
                remove.setAttribute('aria-label', t('dispute.remove_evidence', { index: index + 1 }));
                remove.onclick = () => {
                    if (!current() || uploading || submitting || !remove.isConnected) return;
                    uploaded.splice(index, 1); renderPreviews(); upload.focus();
                };
                wrapper.append(image, remove); previews.append(wrapper);
            });
            updateBusy();
        }
        upload.onclick = () => { if (current() && !uploading && !submitting) fileInput.click(); };
        fileInput.onchange = async () => {
            if (!current() || uploading || submitting) return;
            const files = Array.from(fileInput.files || []);
            fileInput.value = '';
            if (!files.length) return;
            uploading = true; progress.hidden = false; updateBusy();
            try {
                for (const [index, file] of files.entries()) {
                    if (!current()) return;
                    if (uploaded.length >= UI.MAX_DISPUTE_EVIDENCE) {
                        showToast(t('dispute.max_6_images'), 'warning'); break;
                    }
                    progress.textContent = t('dispute.uploading', { current: index + 1, total: files.length });
                    try {
                        const { compressImageForUpload } = await import('../market/发布内容_提交引擎.js');
                        if (!current()) return;
                        const processed = await compressImageForUpload(file);
                        if (!current()) return;
                        const response = await api.uploadFile(processed, 'dispute');
                        if (!current()) return;
                        const url = response?.status === 'success' ? disputeImageURL(response.url) : '';
                        if (!url) throw new Error('Invalid evidence upload');
                        uploaded.push(url); renderPreviews();
                    } catch (_) {
                        if (!current()) return;
                        showToast(t('dispute.upload_failed'), 'error');
                    }
                }
            } finally {
                uploading = false;
                if (current()) { progress.hidden = true; updateBusy(); }
            }
        };
        form.onsubmit = async event => {
            event.preventDefault();
            if (!current() || uploading || submitting) return;
            const responseText = textarea.value.trim();
            if (!responseText) { showToast(t('dispute.please_enter_response'), 'warning'); textarea.focus(); return; }
            submitting = true; updateBusy();
            try {
                const response = await api.respondDispute(dispute.id, responseText, [...uploaded]);
                if (!current()) return;
                if (response?.status !== 'success') throw new Error('Invalid response submission');
                showToast(t('dispute.response_submitted'), 'success');
                await loadDisputeDetail();
                if (scope.isCurrent()) back.focus();
            } catch (_) {
                if (current()) showToast(t('dispute.submit_failed'), 'error');
            } finally {
                submitting = false;
                if (current()) updateBusy();
            }
        };
        form.append(label, textarea, upload, fileInput, previews, progress, submit);
        parent.append(form);
    }
}
