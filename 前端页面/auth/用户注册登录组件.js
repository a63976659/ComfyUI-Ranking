import { renderLoginForm } from "./登录表单组件.js";
import { renderRegisterForm } from "./注册表单组件.js";
import { renderResetForm } from "./重置密码表单组件.js";
import { renderRecoverForm } from "./找回账号表单组件.js";
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";

export function createAuthView(onSuccessCallback) {
    const container = document.createElement("div");
    let disposed = false, generation = 0, mounted = false, busy = false;
    let observer, keyboardSubmit;
    container.className = "auth-view";
    container.innerHTML = `
        <button type="button" id="btn-back-auth" class="auth-view__back">⬅ ${t('common.back')}</button>
        <h2 class="auth-view__title">🔐 ${t('auth.title')}</h2>
        <div id="auth-form-container"></div>
    `;
    
    container.querySelector("#btn-back-auth").onclick = () => {
        container._cleanup();
        window.dispatchEvent(new CustomEvent("comfy-route-back"));
    };

    const formContainer = container.querySelector("#auth-form-container");

    const releaseForm = () => {
        if (keyboardSubmit) formContainer.removeEventListener('keydown', keyboardSubmit);
        keyboardSubmit = null;
        formContainer.querySelectorAll('input, textarea').forEach(input => { input.value = ''; });
        const cleanup = formContainer._onCleanup; formContainer._onCleanup = null;
        try { cleanup?.(); } catch (_) {}
    };
    container._cleanup = () => {
        if (disposed) return;
        disposed = true; generation++; busy = false;
        observer?.disconnect(); releaseForm();
    };
    const switchView = (viewState, options = {}) => {
        if (disposed) return;
        const restoreFocus = container.isConnected && formContainer.contains(document.activeElement);
        releaseForm(); generation++; busy = false;
        const currentGeneration = generation;
        const current = () => !disposed && generation === currentGeneration && container.isConnected;
        const submit = async formData => {
            if (!current() || busy) return;
            busy = true;
            const button = formContainer.querySelector('button[id^="btn-submit"]');
            if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
            try { await onSuccessCallback?.(formData, { isCurrent: current }); }
            catch (_) { if (current()) showToast(t('common.error'), 'error'); }
            finally {
                if (current()) {
                    busy = false;
                    if (button) { button.disabled = false; button.setAttribute('aria-busy', 'false'); }
                }
            }
        };
        formContainer.innerHTML = ""; 
        if (viewState === "login") {
            renderLoginForm(formContainer, switchView, submit);
        } else if (viewState === "register") {
            renderRegisterForm(formContainer, switchView, submit);
        } else if (viewState === "reset") {
            renderResetForm(formContainer, switchView, submit, options.prefill);
        } else if (viewState === "recover") {
            renderRecoverForm(formContainer, switchView);
        }
        const submitButton = formContainer.querySelector('button[id^="btn-submit"]');
        if (submitButton) {
            keyboardSubmit = event => {
                const input = event.target;
                if (!current() || event.defaultPrevented || event.key !== 'Enter' || event.isComposing
                    || event.keyCode === 229 || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
                    || !(input instanceof HTMLInputElement) || !['text', 'email', 'password'].includes(input.type)
                    || input.disabled || input.readOnly || !formContainer.contains(input)) return;
                event.preventDefault();
                if (!submitButton.disabled && formContainer.contains(submitButton)) submitButton.click();
            };
            formContainer.addEventListener('keydown', keyboardSubmit);
        }
        if (restoreFocus && current()) {
            formContainer.querySelector('input:not([disabled]), button:not([disabled])')?.focus();
        }
    };

    switchView("login");
    observer = new MutationObserver(() => {
        if (container.isConnected) mounted = true;
        else if (mounted) container._cleanup();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    return container;
}