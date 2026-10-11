/** 锁住本次发布的编辑入口；返回、提交按钮由原生命周期管理。 */
export function createPublishEditingLock(container, excluded = []) {
    let locked = false, disposed = false;
    const controls = new Map();
    const except = target => excluded.some(node => node === target || node?.contains(target));
    const captureControls = () => {
        if (!locked || disposed) return;
        for (const control of container.querySelectorAll('input, textarea, select, button')) {
            if (except(control)) continue;
            if (!controls.has(control)) controls.set(control, control.disabled);
            control.disabled = true;
        }
    };
    const preventEditing = event => {
        if (!locked || disposed || except(event.target)) return;
        // 媒体播放不改变待发布内容，仍可预览；其它点击/键盘/拖拽入口锁定。
        if (event.target?.closest?.('video, audio')) return;
        event.preventDefault(); event.stopImmediatePropagation();
    };
    const events = ['click', 'keydown', 'dragstart', 'drop', 'input', 'change'];
    for (const name of events) container.addEventListener(name, preventEditing, true);
    const observer = new MutationObserver(captureControls);
    return {
        lock() {
            if (disposed || locked) return;
            locked = true; captureControls();
            observer.observe(container, { childList: true, subtree: true });
        },
        unlock() {
            if (disposed || !locked) return;
            locked = false; observer.disconnect();
            for (const [control, disabled] of controls) {
                if (container.contains(control)) control.disabled = disabled;
            }
            controls.clear();
        },
        dispose() {
            if (disposed) return;
            disposed = true; observer.disconnect(); controls.clear();
            for (const name of events) container.removeEventListener(name, preventEditing, true);
        }
    };
}
