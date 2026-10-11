// 共用业务弹窗：与确认/重试提示复用同一个可访问性栈。
import { setupDialogAccessibility } from "./UI交互提示组件.js";
import { t } from "./用户体验增强.js";
let modalSequence = 0;

export class ModalManager {
    constructor() {
        this.activeModals = [];
        this.entries = new Map();
        this.overlay = null;
        this.observer = null;
        this.initOverlay();
    }

    initOverlay() {
        if (!document.getElementById('hub-theme-style')) {
            const link = document.createElement('link');
            link.id = 'hub-theme-style'; link.rel = 'stylesheet';
            link.href = new URL('../styles/主题基础.css', import.meta.url).href;
            document.head.appendChild(link);
        }
        this.overlay = document.getElementById('community-hub-overlay');
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'community-hub-overlay';
            this.overlay.className = 'ranking-modal-overlay';
            this.overlay.hidden = true;
            document.body.appendChild(this.overlay);
        }
        this.overlay.onclick = () => this.closeTopModal();
    }

    syncLayers() {
        const top = this.activeModals.at(-1);
        this.activeModals.forEach((modal, index) => {
            modal.style.zIndex = String(9999 + index);
            modal.inert = modal !== top;
            if (modal === top) { modal.removeAttribute('aria-hidden'); modal.setAttribute('aria-modal', 'true'); }
            else { modal.setAttribute('aria-hidden', 'true'); modal.removeAttribute('aria-modal'); }
        });
        this.overlay.hidden = !top;
    }

    openModal(title, contentElement, options = { width: '500px' }) {
        const modal = document.createElement('div');
        modal.className = 'ranking-modal';
        modal.style.setProperty('--ranking-modal-width', options.width || '500px');
        const header = document.createElement('div'); header.className = 'ranking-modal__header';
        const titleNode = document.createElement('span'); titleNode.className = 'ranking-modal__title';
        titleNode.id = `ranking-modal-title-${++modalSequence}`; titleNode.textContent = title;
        const close = document.createElement('button'); close.type = 'button';
        close.className = 'ranking-modal__close'; close.textContent = '✖';
        close.setAttribute('aria-label', t('common.close'));
        close.onclick = event => { event.stopPropagation(); this.closeModal(modal); };
        header.append(titleNode, close);
        const body = document.createElement('div'); body.className = 'ranking-modal__body'; body.appendChild(contentElement);
        modal.append(header, body); document.body.appendChild(modal);
        this.activeModals.push(modal); this.syncLayers();
        const accessibility = setupDialogAccessibility(modal, titleNode.id, null, '.ranking-modal__close', () => this.closeModal(modal));
        this.entries.set(modal, { content: contentElement, accessibility });
        if (!this.observer) {
            this.observer = new MutationObserver(() => {
                for (const current of [...this.activeModals]) if (!current.isConnected) this.closeModal(current);
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        }
        return modal;
    }

    closeModal(modal) {
        const entry = this.entries.get(modal);
        if (!entry) return;
        const wasTop = this.activeModals.at(-1) === modal;
        const restore = wasTop && (modal.contains(document.activeElement) || document.activeElement === document.body);
        this.entries.delete(modal);
        entry.accessibility.cleanup();
        try { entry.content._cleanup?.(); } catch (_) {}
        modal.remove();
        this.activeModals = this.activeModals.filter(current => current !== modal);
        this.syncLayers();
        if (!this.activeModals.length) { this.observer?.disconnect(); this.observer = null; }
        if (restore) {
            entry.accessibility.restoreFocus();
            const top = this.activeModals.at(-1);
            if (top && !top.contains(document.activeElement)) top.querySelector('.ranking-modal__close').focus();
        }
    }

    closeTopModal() { this.closeModal(this.activeModals.at(-1)); }
}

export const globalModal = new ModalManager();
