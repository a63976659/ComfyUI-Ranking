/** 表单的所属DOM与清理范围；只丢弃迟到结果，不重放验证码等写请求。 */
export function createAuthFormScope(container) {
    const anchor = container.firstElementChild;
    let disposed = false;
    const cleanups = new Set();
    const alive = () => !disposed && container.isConnected;
    container._onCleanup = () => {
        if (disposed) return;
        disposed = true;
        for (const cleanup of cleanups) { try { cleanup(); } catch (_) {} }
        cleanups.clear();
    };
    return {
        alive,
        current: () => alive() && anchor?.parentElement === container,
        addCleanup(cleanup) {
            if (disposed) { try { cleanup(); } catch (_) {} return; }
            cleanups.add(cleanup);
        }
    };
}

let nextFieldFeedbackId = 0;

export function createAuthFieldFeedback(container, scope, { notify, relatedFields = [] } = {}) {
    const errors = new Map();
    const clearField = input => {
        const record = errors.get(input);
        if (!record) return;
        const descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== record.node.id);
        if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
        else input.removeAttribute('aria-describedby');
        if (input.getAttribute('aria-invalid') === 'true') {
            if (record.previousInvalid === null) input.removeAttribute('aria-invalid');
            else input.setAttribute('aria-invalid', record.previousInvalid);
        }
        record.node.remove();
        errors.delete(input);
    };
    const onInput = event => {
        if (!scope.current()) return;
        const fields = relatedFields.find(group => group.includes(event.target)) || [event.target];
        fields.forEach(clearField);
    };
    container.addEventListener('input', onInput);
    scope.addCleanup(() => {
        container.removeEventListener('input', onInput);
        [...errors.keys()].forEach(clearField);
    });
    return {
        clear(fields = [...errors.keys()]) {
            if (scope.current()) fields.forEach(clearField);
        },
        report(fields, message, level = 'warning') {
            if (!scope.current()) return;
            const inputs = [...new Set(fields)].filter(input => input && container.contains(input) && !input.disabled);
            inputs.forEach((input, index) => {
                clearField(input);
                const node = container.ownerDocument.createElement('div');
                node.id = `ranking-auth-error-${++nextFieldFeedbackId}`;
                node.className = 'auth-form__error auth-field-error';
                node.textContent = message;
                if (index === 0) node.setAttribute('role', 'alert');
                const previousInvalid = input.getAttribute('aria-invalid');
                const descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
                input.setAttribute('aria-describedby', [...new Set([...descriptions, node.id])].join(' '));
                input.setAttribute('aria-invalid', 'true');
                const row = input.closest('.auth-form__code-row');
                (row && container.contains(row) ? row : input).after(node);
                errors.set(input, { node, previousInvalid });
            });
            inputs[0]?.focus();
            notify?.(message, level);
        }
    };
}
