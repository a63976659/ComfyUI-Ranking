import { PROMPT_LIMITS } from "../core/全局配置.js";

export function parsePromptPrice(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
    const price = Number(value.trim());
    return Number.isSafeInteger(price) && price >= 0 && price <= PROMPT_LIMITS.MAX_PRICE ? price : null;
}

export function validatePromptPriceInput(input, error, t) {
    const price = parsePromptPrice(input.value);
    if (price === null) {
        error.textContent = t("prompt.price_invalid", { max: PROMPT_LIMITS.MAX_PRICE });
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return null;
    }
    error.hidden = true;
    error.textContent = "";
    input.removeAttribute("aria-invalid");
    return price;
}
