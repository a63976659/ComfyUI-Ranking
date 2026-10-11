const bindings = new WeakMap();

/** onclick属性变化不触发MutationObserver，渲染时显式同步空态语义。 */
export function setPublishFilePickerAction(area, action) {
    area.onclick = action;
    bindings.get(area)?.();
}

/** 上传区域只在空态作为一个按钮；已有媒体中的原生控件保留独立语义。 */
export function bindPublishFilePicker(area, input, label, signal) {
    let disposed = false;
    input.setAttribute('aria-label', label);
    const sync = () => {
        if (disposed) return;
        const active = typeof area.onclick === 'function';
        if (active) {
            area.setAttribute('role', 'button'); area.tabIndex = 0;
            area.setAttribute('aria-label', label);
            area.setAttribute('aria-disabled', String(input.disabled));
            if (input.getAttribute('aria-busy') === 'true') area.setAttribute('aria-busy', 'true');
            else area.removeAttribute('aria-busy');
        } else {
            for (const name of ['role', 'tabindex', 'aria-label', 'aria-disabled', 'aria-busy']) area.removeAttribute(name);
        }
        for (const button of area.querySelectorAll('[data-file-picker-button]')) button.disabled = input.disabled;
    };
    const onKey = event => {
        if (disposed || signal?.aborted || input.disabled || event.target !== area || typeof area.onclick !== 'function'
            || event.isComposing || event.repeat || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); area.click();
    };
    const observer = new MutationObserver(sync);
    const dispose = () => {
        if (disposed) return;
        disposed = true; observer.disconnect();
        if (bindings.get(area) === sync) bindings.delete(area); area.removeEventListener('keydown', onKey);
        signal?.removeEventListener('abort', dispose);
    };
    if (signal?.aborted) { dispose(); return dispose; }
    observer.observe(area, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    observer.observe(input, { attributes: true, attributeFilter: ['disabled', 'aria-busy'] });
    area.addEventListener('keydown', onKey); signal?.addEventListener('abort', dispose, { once: true });
    bindings.set(area, sync); sync(); return dispose;
}
