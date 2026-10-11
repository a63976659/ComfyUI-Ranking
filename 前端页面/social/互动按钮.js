// 点赞/收藏共用的乐观更新控件；旧评论模块保留导出以兼容调用方。
import { showToast } from "../components/UI交互提示组件.js";
import { t } from "../components/用户体验增强.js";

const buttonStates = new WeakMap();

function validCount(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function setupToggleButton(btnElement, initialState, initialCount, activeText, inactiveText, activeColor, apiCallback) {
    const previous = buttonStates.get(btnElement);
    const disabledInitially = btnElement.disabled && !previous?.processing;
    const numericCount = typeof initialCount === "string" && initialCount.trim() ? Number(initialCount) : initialCount;
    const state = { active: Boolean(initialState), count: validCount(numericCount) ? numericCount : 0, processing: false };
    buttonStates.set(btnElement, state);
    const isCurrent = () => buttonStates.get(btnElement) === state;
    btnElement.type = "button";
    btnElement.classList.add("interaction-toggle");
    // 当前调用方使用固定十六进制色值；不允许任意 CSS 表达式进入样式。
    btnElement.style.setProperty("--interaction-color", typeof activeColor === "string" && /^#[\da-f]{6}$/i.test(activeColor) ? activeColor : "#3b82f6");
    for (const property of ["color", "border-color", "background", "border", "padding", "border-radius", "cursor"]) {
        btnElement.style.removeProperty(property);
    }

    const updateUI = () => {
        btnElement.textContent = `${state.active ? activeText : inactiveText} (${state.count})`;
        btnElement.setAttribute("aria-pressed", String(state.active));
        btnElement.setAttribute("aria-busy", String(state.processing));
        btnElement.dataset.active = String(state.active);
        btnElement.disabled = disabledInitially || state.processing;
    };
    updateUI();

    btnElement.onclick = async event => {
        event.stopPropagation();
        if (!isCurrent() || state.processing || disabledInitially) return;
        const oldActive = state.active;
        const oldCount = state.count;
        state.active = !state.active;
        state.count = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, state.count + (state.active ? 1 : -1)));
        state.processing = true;
        updateUI();
        try {
            const response = await apiCallback(state.active);
            if (!isCurrent()) return;
            // undefined 兼容原有 void 回调；当前业务回调返回云端 envelope。
            if (response !== undefined && (response?.status !== "success" || !validCount(response.new_count))) {
                if (response?.status === "cancelled") {
                    state.active = oldActive;
                    state.count = oldCount;
                    return;
                }
                throw new Error("Invalid interaction response");
            }
            if (response !== undefined && Object.hasOwn(response, "new_count")) state.count = response.new_count;
        } catch {
            if (!isCurrent()) return;
            state.active = oldActive;
            state.count = oldCount;
            showToast(t("common.operation_failed"), "error");
        } finally {
            if (isCurrent()) {
                state.processing = false;
                updateUI();
            }
        }
    };
}
