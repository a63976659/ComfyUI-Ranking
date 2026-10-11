// 公共评分控件；原评论模块继续转导出，资源与帖子共用同一响应契约。
import { t } from "../components/用户体验增强.js";
import { showToast } from "../components/UI交互提示组件.js";
import { captureRequestSession } from "../core/网络请求_基础设施.js";
import { getUser, eventBus, EVENTS } from "../core/状态管理.js";
import { CACHE } from "../core/全局配置.js";
import { createTaskViewScope, subscribeTaskSessionChanges } from "../task/任务视图生命周期.js";

const validCount = value => Number.isSafeInteger(value) && value >= 0;
const validScore = value => Number.isInteger(value) && value >= 1 && value <= 5;
const validAverage = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5;
let ratingSequence = 0;

export function isValidRatingResponse(response, score) {
    return response?.status === "success" && validAverage(response.rating_avg)
        && validCount(response.rating_count) && validScore(response.user_score)
        && response.user_score === score && !!response.rating_dist
        && typeof response.rating_dist === "object" && !Array.isArray(response.rating_dist)
        && [1, 2, 3, 4, 5].every(value => validCount(response.rating_dist[String(value)]));
}

export function createRatingStars({ ratingData = {}, currentUser = null, authorAccount = "",
    onRate = null, isCurrent = () => true, compact = false } = {}) {
    const data = ratingData && typeof ratingData === "object" && !Array.isArray(ratingData) ? ratingData : {};
    let average = validAverage(data.rating_avg) ? data.rating_avg : 0;
    let count = validCount(data.rating_count) ? data.rating_count : 0;
    const account = currentUser?.account || null;
    const rawScore = data.rated_by?.[account];
    const initialScore = typeof rawScore === "number" ? rawScore : rawScore?.score;
    let ownScore = count > 0 && validScore(initialScore) ? initialScore : null;
    let processing = false, preview = 0, scope = null;
    let confirmedAverage = average, confirmedCount = count;
    const matches = captureRequestSession();
    const current = () => (!scope || scope.isCurrent()) && container.isConnected && isCurrent() && matches()
        && (getUser()?.account || null) === account;
    const interactive = !compact && typeof onRate === "function" && !!account && account !== authorAccount;
    const container = document.createElement("div");
    container.className = `ranking-rating${compact ? " ranking-rating--compact" : ""}`;
    const row = document.createElement("div"); row.className = "ranking-rating__row";
    row.setAttribute("role", "group"); row.setAttribute("aria-label", t('rating.stars'));
    const controls = [], icons = [];
    const tooltip = document.createElement("div"); tooltip.className = "ranking-rating__tooltip";
    tooltip.id = `ranking-rating-tip-${++ratingSequence}`;
    tooltip.setAttribute("role", "tooltip"); tooltip.hidden = true;
    const showTooltip = text => { tooltip.textContent = text; tooltip.hidden = false; };
    const hideTooltip = () => { tooltip.hidden = true; };
    for (let index = 1; index <= (compact ? 1 : 5); index++) {
        const control = document.createElement(interactive ? "button" : "span");
        control.className = "ranking-rating__star";
        const icon = document.createElement("span"); icon.className = "ranking-rating__icon";
        icon.setAttribute("aria-hidden", "true"); control.append(icon); icons.push(icon);
        if (interactive) {
            control.type = "button";
            control.setAttribute("aria-label", t('rating.choose_score', { score: index }));
            control.setAttribute("aria-describedby", tooltip.id);
            controls.push(control);
            const showPreview = () => {
                if (processing || !current()) return;
                preview = index; render(); showTooltip(t('rating.choose_score', { score: index }));
            };
            control.addEventListener("mouseenter", showPreview);
            control.addEventListener("focus", showPreview);
            control.addEventListener("blur", () => { preview = 0; render(); hideTooltip(); });
            control.addEventListener("click", () => submit(index));
        } else control.setAttribute("aria-hidden", "true");
        row.append(control);
    }
    if (!compact && count >= 5 && validCount(data.rating_dist?.['5']) && data.rating_dist['5'] / count >= 0.9) {
        const sixth = document.createElement("span"); sixth.className = "ranking-rating__sixth";
        sixth.textContent = "★"; sixth.title = t('rating.sixth_star_tip');
        sixth.setAttribute("role", "img"); sixth.setAttribute("aria-label", t('rating.sixth_star_tip')); row.append(sixth);
    }
    const scoreText = document.createElement("span"); scoreText.className = "ranking-rating__score";
    if (!compact) { scoreText.setAttribute("aria-live", "polite"); scoreText.setAttribute("aria-atomic", "true"); }
    row.append(scoreText); container.append(row);
    const ownRow = document.createElement("div"); ownRow.className = "ranking-rating__own";
    container.append(ownRow, tooltip);
    container.addEventListener("mouseleave", () => { preview = 0; render(); hideTooltip(); });
    if (!interactive && !compact) {
        container.title = t(!account ? 'rating.login_required' : account === authorAccount ? 'rating.self_forbidden' : 'rating.stars');
    }
    function render() {
        container.hidden = compact && count === 0;
        container.setAttribute("aria-busy", String(processing));
        scoreText.textContent = compact ? average.toFixed(1) : `${average.toFixed(1)} (${t('rating.count', { count })})`;
        icons.forEach((icon, offset) => {
            const fill = compact ? 1 : (preview || Math.round(average * 2) / 2) - offset;
            icon.dataset.fill = fill >= 0.75 ? "full" : fill >= 0.25 ? "half" : "empty";
            icon.textContent = fill >= 0.25 ? "★" : "☆";
        });
        controls.forEach((control, index) => {
            control.disabled = processing;
            control.setAttribute("aria-pressed", String(ownScore === index + 1));
        });
        ownRow.hidden = compact || !ownScore;
        ownRow.textContent = ownScore ? `${t('rating.your_score')}: ${'★'.repeat(ownScore)}${'☆'.repeat(5 - ownScore)}` : "";
    }
    async function submit(score) {
        if (!interactive || processing || !current()) return;
        const original = { average, count, ownScore };
        const focused = controls.find(control => control === document.activeElement);
        processing = true; preview = 0;
        average = ownScore && count > 0 ? (average * count - ownScore + score) / count
            : (average * count + score) / (count + 1);
        if (!ownScore) count = Math.min(Number.MAX_SAFE_INTEGER, count + 1);
        ownScore = score; render();
        try {
            const response = await onRate(score, { isCurrent: current });
            if (!current()) return;
            if (!isValidRatingResponse(response, score)) throw new Error();
            average = response.rating_avg; count = response.rating_count; ownScore = response.user_score;
            confirmedAverage = average; confirmedCount = count;
            showToast(t('rating.submit_success'), "success");
        } catch (_) {
            if (!current()) return;
            ({ average, count, ownScore } = original);
            showToast(t('rating.submit_failed'), "error");
        } finally {
            if (!current()) return;
            processing = false; preview = 0; render(); hideTooltip();
            if (focused && document.activeElement === document.body) focused.focus({ preventScroll: true });
        }
    }
    render();
    if (!compact && account) {
        let constructing = true, observer;
        scope = createTaskViewScope({
            sessionMatches: () => matches() && (getUser()?.account || null) === account && isCurrent(),
            connected: () => constructing || container.isConnected,
            subscribe: notify => subscribeTaskSessionChanges(notify, { target: window, eventBus, events: EVENTS,
                userKey: CACHE.LEGACY_KEYS.USER, tokenKey: CACHE.LEGACY_KEYS.TOKEN }),
            cancelReads: () => {}, invalidate: () => {}
        });
        scope.addCleanup(() => {
            observer?.disconnect(); average = confirmedAverage; count = confirmedCount;
            ownScore = null; processing = false; preview = 0; render(); hideTooltip();
            controls.forEach(control => { control.disabled = true; });
        });
        container._cleanup = () => scope.dispose();
        queueMicrotask(() => {
            constructing = false;
            if (!scope.isCurrent()) return;
            observer = new MutationObserver(() => { if (!container.isConnected) scope.dispose(); });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
    return container;
}
