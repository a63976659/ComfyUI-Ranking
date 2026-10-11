/** 发布表单本地校验提示；不保存草稿，也不展示远端异常正文。 */
export function createPublishFieldErrors(inputs, signal) {
    const entries = new Map(); let disposed = false;
    const clear = input => {
        const entry = entries.get(input); if (!entry) return;
        entry.error.hidden = true; entry.error.textContent = '';
        const tokens = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(token => token && token !== entry.error.id);
        if (tokens.length) input.setAttribute('aria-describedby', tokens.join(' ')); else input.removeAttribute('aria-describedby');
        if (entry.active && input.getAttribute('aria-invalid') === 'true') {
            if (entry.previousInvalid === null) input.removeAttribute('aria-invalid');
            else input.setAttribute('aria-invalid', entry.previousInvalid);
        }
        entry.active = false;
    };
    const clearAll = () => { for (const input of entries.keys()) clear(input); };
    const dispose = () => {
        if (disposed) return; disposed = true;
        clearAll();
        for (const [input, entry] of entries) {
            input.removeEventListener('input', entry.onChange); input.removeEventListener('change', entry.onChange); entry.error.remove();
        }
        entries.clear(); signal?.removeEventListener('abort', dispose);
    };
    const show = (input, message) => {
        if (disposed || signal?.aborted) return;
        const entry = entries.get(input); if (!entry) return;
        if (!entry.active) entry.previousInvalid = input.getAttribute('aria-invalid');
        entry.active = true; entry.error.textContent = message; entry.error.hidden = false;
        const tokens = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)); tokens.add(entry.error.id);
        input.setAttribute('aria-describedby', [...tokens].join(' ')); input.setAttribute('aria-invalid', 'true'); input.focus();
    };
    if (signal?.aborted) { disposed = true; return { show, clearAll, dispose }; }
    for (const input of inputs) {
        const error = document.createElement('div'); error.id = `${input.id}-error`; error.className = 'ranking-publish-field-error';
        error.hidden = true; error.setAttribute('role', 'alert'); input.insertAdjacentElement('afterend', error);
        const entry = { error, active: false, previousInvalid: null, onChange: () => clear(input) };
        entries.set(input, entry); input.addEventListener('input', entry.onChange); input.addEventListener('change', entry.onChange);
    }
    signal?.addEventListener('abort', dispose, { once: true });
    return { show, clearAll, dispose };
}
