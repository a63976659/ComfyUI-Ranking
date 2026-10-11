// 前端页面/core/侧边栏数据引擎.js
// ==========================================
// 📊 侧边栏数据加载引擎
// ==========================================
// 作用：负责列表数据的加载、缓存、分页、渲染
// 关联文件：
//   - 网络请求API.js (数据获取)
//   - 列表卡片组件.js (工具/应用卡片渲染)
//   - 创作者卡片组件.js (创作者卡片渲染)
//   - 性能优化工具.js (分页加载、骨架屏)
// ==========================================
// ⚡ P1性能优化：
//   - 首屏仅加载 PAGE_SIZE 条数据
//   - 滚动到底部自动加载更多
//   - 骨架屏加载动画
//   - 增强缓存策略
// ==========================================

import { fetchSidebarList, readSidebarListCache, readCreatorsSessionCache as getCreatorsFromSessionStorage,
    writeCreatorsSessionCache as saveCreatorsToSessionStorage } from "./榜单数据来源.js";
import { mountSidebarDomainView } from "./榜单视图切换.js";
import { setupSidebarPagination as _setupPaginationLoader } from "./榜单分页控制.js";
import { createSidebarPaginationStore } from "./榜单分页状态.js";
import { sortDataLocally, filterItemsByKeyword, searchCreatorsLocally } from "./榜单本地查询.js";

import { api } from "./网络请求API.js";
import { proxyImages } from "./网络请求API.js";
import { createItemCard } from "../market/列表卡片组件.js";
import { createCreatorCard } from "../market/创作者卡片组件.js";
import {
    createSkeleton,
    setCache,
    lazyLoadImages,
    renderListLoadError
} from "../components/性能优化工具.js";
import { applyViewportAnimations, getAnimationTypeForTab, scrollCardIntoView, stopViewportAnimations } from "../components/动画音效引擎.js";
import { t } from "../components/用户体验增强.js";
import { showToast } from "../components/UI交互提示组件.js";  // 🔧 降级提示改走统一组件（原为手写 div）

// 💬 讨论区组件（动态导入）
let postsViewModule = null;
async function getPostsView() {
    if (!postsViewModule) {
        postsViewModule = await import("../post/讨论区组件.js");
    }
    return postsViewModule;
}

// 📝 任务榜组件（动态导入）
let tasksViewModule = null;
async function getTasksView() {
    if (!tasksViewModule) {
        tasksViewModule = await import("../task/任务榜组件.js");
    }
    return tasksViewModule;
}

// 🧩 提示词组件（动态导入）
let promptsViewModule = null;
async function getPromptsView() {
    if (!promptsViewModule) {
        promptsViewModule = await import("../prompt/提示词组件.js");
    }
    return promptsViewModule;
}


// ==========================================
// 🔧 配置常量
// ==========================================
const PAGE_SIZE = 20;                           // 每页数量
const CREATORS_PAGE_SIZE = 12;                  // 创作者每页数量（卡片更大）

/**
 * ⏱️ 获取缓存过期时间（毫秒）
 * 从用户设置中读取，默认2小时（7200秒）
 * @returns {number} 缓存过期时间（毫秒）
 */
function getCacheExpireTime() {
    try {
        const settingsStr = localStorage.getItem('ComfyCommunity_Settings');
        if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            const seconds = parseInt(settings.cacheExpireSeconds);
            if (seconds && seconds >= 60 && seconds <= 86400) {
                return seconds * 1000;  // 转为毫秒
            }
        }
    } catch (e) {}
    return 1000 * 60 * 60 * 2;  // 默认2小时
}

// ==========================================
// 🔄 同榜单数据与创作者会话缓存
// ==========================================
/**
 * 从同 tab 的任意排序状态中获取已有数据
 */
const findExistingTabData = tab => paginationStore.findCompleteData(tab);

// ==========================================
// 📦 分页状态管理
// ==========================================
// 每个标签页独立的分页状态
const paginationStore = createSidebarPaginationStore();
const getPaginationState = (tab, sort) => paginationStore.get(tab, sort);

export function disposeSidebarContent(contentArea) {
    stopViewportAnimations(contentArea);
    try { paginationStore.stopLoaders(); }
    catch { console.warn('Sidebar pagination cleanup failed'); }
    for (const child of Array.from(contentArea.children)) {
        const cleanup = child._cleanup;
        child._cleanup = null;
        try { cleanup?.call(child); }
        catch { console.warn('Sidebar list view cleanup failed'); }
    }
}


// ==========================================
// 🚀 主加载函数
// ==========================================
export async function loadSidebarContent({
    tab,
    sort,
    keyword,
    contentArea,
    currentUser,
    renderToken,
    getRenderToken,
    force = false,
    expandItemId = null,  // 新增：要自动展开的卡片ID
    isNavigationCurrent = () => true
}) {
    if (renderToken !== getRenderToken()) return;
    const canNavigate = () => renderToken === getRenderToken() && isNavigationCurrent();
    // 新榜单取得视图所有权时停止所有旧分页器，保留各榜单已加载数据。
    paginationStore.stopLoaders();

    const domainViews = {
        posts: { loadModule: getPostsView, factory: 'createPostsView', errorKey: 'feedback.load_posts_failed',
            afterMount: module => { if (module.loadPosts) module.loadPosts(); } },
        tasks: { loadModule: getTasksView, factory: 'createTasksView', errorKey: 'feedback.load_tasks_failed' },
        prompts: { loadModule: getPromptsView, factory: 'createPromptsView', errorKey: 'feedback.load_prompts_failed' },
    };
    if (Object.hasOwn(domainViews, tab)) {
        await mountSidebarDomainView({ contentArea, currentUser, keyword, renderToken, getRenderToken,
            ...domainViews[tab] });
        return;
    }

    const cacheKey = `ListCache_${tab}_${sort}`;
    const state = getPaginationState(tab, sort);
    const pageSize = tab === "creators" ? CREATORS_PAGE_SIZE : PAGE_SIZE;
    const sameCreatorSearchData = tab === "creators" && keyword && state.isSearchResult &&
        state.searchKeyword === keyword && Array.isArray(state.allData) && state.allData.length > 0
        ? state.allData
        : null;

    // ========== 🔄 强制刷新：清除当前 tab/sort 的内存缓存 ==========
    if (force) {
        state.allData = [];
        state.displayedCount = 0;
        state.isFullyLoaded = false;
        if (!sameCreatorSearchData) {
            state.isSearchResult = false;
            state.searchKeyword = "";
        }
    }

    // 停止之前的分页加载器
    if (state.loader) {
        state.loader.stop();
        state.loader = null;  // 清除引用，防止旧分页器状态残留
    }

    // ========== 🔍 搜索过滤统一入口 ==========
    // 🔧 修复：过滤职责原先分裂在三处且口径不一致 —— loadMoreData 与分页器的
    // getTotalDataCount 都是「先过滤再切片」（正确），而各首屏分支是「先切 20 条再过滤」，
    // renderBatch 内部又对切好的批次再过滤一次。后果不只是首屏条数偏少：首屏与分页
    // 处于不同的数据空间（首屏在「原始前 20 条」里找匹配，分页在「过滤后全集」里按 20
    // 步长切片），排在第 20 条之后的匹配项会永久丢失，甚至首屏直接显示「没有搜索到相关内容」。
    // 现统一收口到本函数：所有取数路径都先过滤、再切片，renderBatch 只负责渲染。
    // 创作者Tab的 keyword 由后端搜索接口过滤，此处不做本地过滤（与原口径一致）。
    const _applySearchScope = (dataArray) => {
        const scoped = !keyword || tab === "creators" ? dataArray : filterItemsByKeyword(dataArray, keyword);
        if (!expandItemId || tab === "creators") return scoped;
        const target = dataArray.find(item => String(item.id) === String(expandItemId));
        if (!target) return scoped;
        return [target, ...scoped.filter(item => String(item.id) !== String(expandItemId))];
    };

    // ========== 渲染函数：渲染一批数据（只渲染，过滤由 _applySearchScope 统一负责）==========
    let targetLookupStarted = false;
    const renderBatch = (dataArray, append = false) => {
        if (renderToken !== getRenderToken()) return;

        // 🔧 数据已由调用方经 _applySearchScope 过滤，本函数只负责渲染（不再二次过滤）
        const displayData = dataArray;

        // 首次渲染清空容器
        if (!append) {
            disposeSidebarContent(contentArea);
            contentArea.innerHTML = "";
            state.displayedCount = 0;
        }

        // 空数据处理
        if (displayData.length === 0 && state.displayedCount === 0) {
            const emptyState = document.createElement('div');
            emptyState.style.cssText = 'text-align:center; padding:40px 20px; color:#888;';
            emptyState.textContent = t(keyword ? 'feedback.no_search_results' : 'feedback.no_list_data');
            emptyState.setAttribute('role', 'status');
            contentArea.replaceChildren(emptyState);
            if (!expandItemId) return 0;
        }

        // 渲染卡片
        const fragment = document.createDocumentFragment();
        const animationType = getAnimationTypeForTab(tab);
        const cards = [];
        let targetCard = null;  // 用于保存需要展开的目标卡片

        if (tab === "tools" || tab === "skills" || tab === "apps" || tab === "recommends") {
            displayData.forEach(data => {
                const card = createItemCard(data, currentUser);
                cards.push(card);
                fragment.appendChild(card);
                // 检查是否是需要展开的卡片
                if (expandItemId && String(data.id) === String(expandItemId)) {
                    targetCard = card;
                }
            });
        } else if (tab === "creators") {
            displayData.forEach(data => {
                const card = createCreatorCard(data, currentUser);
                cards.push(card);
                fragment.appendChild(card);
            });
        }

        contentArea.appendChild(fragment);

        // ✨ 应用视口感知动画：可见卡片依次错开载入，滚动/分页进入视口的卡片自动补播动画
        applyViewportAnimations(contentArea, cards, animationType, !append);

        // 对新渲染的图片启用懒加载
        lazyLoadImages(contentArea, "img:not(.lazy-loaded):not(.lazy-loading)");

        // 🔔 自动展开目标卡片（如果有）
        if (targetCard && !append) {
            requestAnimationFrame(() => {
                if (!canNavigate()) return;
                // 滚动到卡片位置
                scrollCardIntoView(targetCard);
                // 模拟点击摘要区域展开卡片
                const summary = targetCard.querySelector('.item-summary') || targetCard.firstElementChild;
                if (summary) summary.click();
            });
        }

        // 目标不在列表快照中时补取，仍使用原榜单卡片展开。
        if (expandItemId && !targetCard && !append && !targetLookupStarted && canNavigate()) {
            targetLookupStarted = true;
            (async () => {
                try {
                    const res = await api.getItemById(expandItemId);
                    if (!canNavigate()) return;
                    if (res?.status !== "success" || !res.data || String(res.data.id) !== String(expandItemId)) {
                        showToast(t('notif.item_not_found'), "error");
                        return;
                    }
                    const target = state.allData.find(item => String(item.id) === String(expandItemId)) || proxyImages([res.data])[0];
                    state.loader?.stop();
                    state.loader = null;
                    state.allData = [target, ...state.allData.filter(item => String(item.id) !== String(expandItemId))];
                    const scoped = _applySearchScope(state.allData);
                    renderBatch(scoped.slice(0, pageSize), false);
                    if (scoped.length > pageSize) {
                        _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab, renderToken, getRenderToken);
                    }
                } catch (_) {
                    if (canNavigate()) showToast(t('notif.load_item_failed'), "error");
                }
            })();
        }

        state.displayedCount += displayData.length;
        return displayData.length;
    };

    // ========== 分页加载更多函数 ==========
    const loadMoreData = async (page, size, { isCurrent = () => true } = {}) => {
        if (!isCurrent()) return [];
        // 计算要显示的数据范围
        const start = (page - 1) * size;
        const end = start + size;

        // 从全量数据中截取（统一走 _applySearchScope，与首屏处于同一数据空间）
        const dataSlice = _applySearchScope(state.allData);

        const batch = dataSlice.slice(start, end);

        if (batch.length > 0) {
            renderBatch(batch, true);
        }

        return batch;
    };

    // ========== 尝试从缓存加载 ==========
    // 📌 本处的缓存口径与 任务榜/讨论区/提示词（统一走 性能优化工具.js 的
    // readListCache，命中后一律调 silentRefresh 后台补新）**刻意不同**，不是历史遗留，勿顺手归一：
    //   - 这里缓存的是全量数据（items 200 条 / creators 500 条），分页完全在本地做，
    //     所以缓存命中即等于「数据完整」，只在 expired 时才值得再发一次网络请求；
    //   - 那三个列表只缓存第一页，命中后数据必然不完整，故一律后台 silentRefresh 补新。
    // 若强行统一成「总是后台刷新」，插件榜会在每次 Tab 切换时多发一次 200 条的全量请求。
    // 获取完整缓存信息（包含过期状态）
    const { value: cachedData, expired: isCacheExpired, found: hasCacheData } =
        readSidebarListCache(cacheKey, { creators: tab === 'creators' });

    // 有缓存时直接渲染缓存（搜索时也使用缓存，renderBatch 会处理 keyword 过滤）
    // 🔍 创作者Tab有keyword时不使用缓存，每次都从后端搜索
    // 🔧 修复：原实现还把「刚清空搜索框」也列为跳过缓存的理由，但 cacheKey 不含 keyword、
    // 搜索结果也从不写入该键（见下方 isCreatorSearch 判断），缓存里存的始终是干净的全量列表，
    // 清空搜索框后完全可以直接用缓存上屏；强制联网只会让用户在弱网下白等一整个重试预算
    const skipCache = tab === "creators" && !!keyword;
    if (!force && hasCacheData && !skipCache) {
        // 🚀 缓存数据也需要过一遍图片代理，确保新字段也被处理
        const proxiedData = proxyImages(cachedData);
        state.allData = proxiedData;
        state.isFullyLoaded = true;
        // 缓存是全量列表而非搜索结果，清除搜索标记，避免下次加载仍被当作搜索结果处理
        if (tab === "creators" && !keyword) {
            state.isSearchResult = false;
            state.searchKeyword = "";
        }

        // 首屏渲染（仅第一页）—— 先过滤再切片，与 loadMoreData 同一数据空间
        const scopedData = _applySearchScope(proxiedData);
        renderBatch(scopedData.slice(0, pageSize), false);

        // 如果有更多数据，启动分页加载器
        if (scopedData.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab, renderToken, getRenderToken);
        }

        // 【新增】Tab 切换后台静默刷新 —— 仅缓存过期时触发
        if (isCacheExpired) {
            console.log(`🔄 缓存已过期，${tab}_${sort} 启动后台静默刷新...`);

            setTimeout(async () => {
                // 保存当前上下文快照，防止网络延迟期间用户切换Tab导致竞态
                const savedToken = renderToken;
                const savedTab = tab;
                const savedSort = sort;

                // 防竞态检查1：回调开始执行时验证
                if (savedToken !== getRenderToken()) return;

                try {
                    const rawData = await fetchSidebarList({ tab: savedTab, sort: savedSort, background: true });
                    if (savedToken !== getRenderToken()) return;
                    const newData = proxyImages(rawData);

                    // 防竞态检查2：网络请求完成后再次验证
                    if (savedToken !== getRenderToken()) return;

                    // 🛡️ 空响应防护：云端返回空列表时不回写缓存、也不清屏重渲染。
                    // 本分支由「缓存过期」触发，是切 Tab 时最常走到的路径，若不拦，
                    // 下方 state.allData = newData + contentArea.innerHTML = "" 会把
                    // 已上屏的本地数据连画面带缓存一起清空（见 _isEmptyOverwrite 说明）
                    if (_isEmptyOverwrite(newData, state.allData, cachedData)) {
                        console.warn(`🛡️ ${savedTab}_${savedSort} 云端返回空列表，保留本地数据，跳过缓存回写`);
                        return;
                    }

                    // 只有token匹配时才同时更新state.allData和setCache
                    if (_shouldUpdateData(state.allData, newData)) {
                        console.log(`✅ ${savedTab}_${savedSort} 检测到新数据，执行静默更新`);
                        state.allData = newData;
                        state.displayedCount = 0; // 重置分页计数
                        // 📴 持久化到 localStorage，保证重启后离线仍可展示
                        setCache(cacheKey, newData, getCacheExpireTime(), true);

                        // 更新创作者 sessionStorage 缓存
                        if (savedTab === "creators") {
                            saveCreatorsToSessionStorage(newData);
                        }

                        // 完整重新渲染（替代之前只更新数字的方案）
                        // 🔧 先过滤再切片：搜索场景下静默刷新同样会触发，
                        // 原实现在 newData 前 20 条里过滤，会漏掉靠后的匹配项
                        const scopedNewData = _applySearchScope(newData);
                        renderBatch(scopedNewData.slice(0, pageSize), false);

                        if (scopedNewData.length > pageSize) {
                            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, savedTab, savedToken, getRenderToken);
                        }
                    } else {
                        // 关键字段无变化 → 无需重渲染。但 newData 才是刚从云端取回的权威数据，
                        // 缓存必须回写 newData：若仍回写旧的 state.allData，等于把旧数据固化并
                        // 续期（续期后 isCacheExpired 转 false，下次连静默刷新都不再触发），
                        // 导致缓存中的旧版本号被长期锁死、卡片徽章无法出现。
                        // 注意此处刻意不更新 state.allData：首屏已按旧数据渲染，保持二者一致可
                        // 避免分页加载与已渲染卡片错位；新数据在下次进入读取缓存时生效
                        setCache(cacheKey, newData, getCacheExpireTime(), true);
                    }
                } catch (err) {
                    if (savedToken !== getRenderToken()) return;
                    console.warn(`⚠️ ${savedTab}_${savedSort} 后台刷新失败`);
                }
            }, 0);
        }

        return;
    }

    // ========== 🔄 本地排序优先：同 tab 已有数据时直接排序渲染（强制刷新时跳过）==========
    // 🔍 创作者Tab有keyword时不走本地排序优先，必须调用后端搜索API
    // 🔍 创作者Tab清空搜索框后也不走本地排序优先，避免使用搜索时的部分结果
    // 🔍 如果当前state是搜索结果，也不走本地排序优先
    // 仅在"正在搜索"或"刚清空搜索但state仍是搜索结果"时跳过本地排序
    const isCreatorSearching = tab === "creators" && keyword;
    const isCreatorSearchCleared = tab === "creators" && !keyword && state.isSearchResult;
    const skipLocalSort = isCreatorSearching || isCreatorSearchCleared || state.isSearchResult;
    const existingData = findExistingTabData(tab);
    if (!force && !skipLocalSort && existingData && existingData.length > 0) {
        const locallySorted = sortDataLocally(existingData, tab, sort);
        state.allData = locallySorted;
        state.isFullyLoaded = true;
        state.displayedCount = 0;  // 重置已显示计数，因为数据重新排序了

        // 首屏渲染（先过滤再切片）
        const scopedSorted = _applySearchScope(locallySorted);
        renderBatch(scopedSorted.slice(0, pageSize), false);

        // 启动分页加载器
        if (scopedSorted.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab, renderToken, getRenderToken);
        }

        // 存入当前排序的缓存（📴 创作者数据同样持久化到 localStorage，保证重启后离线可展示）
        setCache(cacheKey, locallySorted, getCacheExpireTime(), true);

        return; // 本地排序后直接返回，不需要后台刷新（数据是同一批）
    }

    // ========== 🚀 缓存先行：阻塞前先用本地已有数据上屏 ==========
    // 走到这里说明上面两条快路径都没命中：要么是 force 强制刷新（刻意跳过缓存），
    // 要么是本次会话还没有该 tab 的完整数据。弱网下一次列表请求最长要烧满整个重试预算，
    // 期间用户只能盯骨架屏；此刻若本地已有可用数据，就先渲染首屏，网络请求照常往下走，
    // 回来后按 renderToken + _shouldUpdateData 决定是否重渲染（与上方静默刷新同口径）。
    // 🔍 新关键词的创作者搜索不参与缓存先行，避免显示其它查询结果；只有强制刷新当前同一关键词时，
    // 才临时复用精确匹配的上一批搜索结果（state.searchKeyword），失败时继续保留它。
    let renderedInstant = false;
    if (!isCreatorSearching || sameCreatorSearchData) {
        // 可立即上屏的数据：当前排序的列表缓存（force 时被跳过）→ 创作者 sessionStorage 降级副本
        let instantData = sameCreatorSearchData ||
            ((hasCacheData && Array.isArray(cachedData) && cachedData.length > 0) ? cachedData : null);
        if (!instantData && tab === "creators") {
            const sessionData = getCreatorsFromSessionStorage();
            if (Array.isArray(sessionData) && sessionData.length > 0) instantData = sessionData;
        }
        if (instantData) {
            console.log(`🚀 ${tab}_${sort} 缓存先行：先用本地数据渲染首屏，网络请求转后台`);
            // 🚀 与上方缓存命中分支同口径：本地数据也过一遍图片代理（proxyImages 内部会先剥除
            // 已有代理前缀，幂等），确保代理规则新增的字段同样被处理
            // sessionStorage 副本的顺序不保证与当前排序一致，统一本地排一次（对已排序数据幂等）
            const sortedData = sortDataLocally(proxyImages(instantData), tab, sort);
            state.allData = sortedData;
            state.isFullyLoaded = true;
            state.isSearchResult = !!sameCreatorSearchData;
            state.searchKeyword = sameCreatorSearchData ? keyword : "";
            // 🔧 先过滤再切片（tools/skills/apps/recommends 带 keyword 时同样会进入本分支）
            const scopedInstant = _applySearchScope(sortedData);
            renderBatch(scopedInstant.slice(0, pageSize), false);
            if (scopedInstant.length > pageSize) {
                _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab, renderToken, getRenderToken);
            }
            renderedInstant = true;
        }
    }

    // ========== 显示加载骨架屏（已有本地数据上屏时跳过，避免闪屏）==========
    if (!renderedInstant) {
        disposeSidebarContent(contentArea);
        contentArea.innerHTML = "";
        const skeleton = createSkeleton(tab === "creators" ? "list" : "card", 3);
        contentArea.appendChild(skeleton);
    }

    // ========== 从网络加载数据 ==========
    try {
        const rawData = await fetchSidebarList({ tab, sort, keyword, force });
        if (renderToken !== getRenderToken()) return;
        const realData = proxyImages(rawData);
        if (renderToken !== getRenderToken()) return;
        if (tab === 'creators') {
            state.isSearchResult = !!keyword;
            state.searchKeyword = keyword || '';
        }

        // 存入缓存（📴 创作者数据同样持久化到 localStorage，保证重启后离线仍可展示；搜索结果不存入缓存）
        const isCreatorSearch = tab === "creators" && keyword;
        // 🛡️ 空响应防护：创作者搜索命中 0 条是有效答案（下方要渲染「没有搜索到相关内容」），
        // 必须排除在防护之外，否则会把空搜索结果误判成云端故障、改渲染全量列表
        const isEmptyOverwrite = !isCreatorSearch && _isEmptyOverwrite(realData, cachedData, state.allData);
        if (isEmptyOverwrite) {
            console.warn(`🛡️ ${tab}_${sort} 云端返回空列表，保留本地数据，不覆盖缓存`);
        } else if (!isCreatorSearch) {
            setCache(cacheKey, realData, getCacheExpireTime(), true);
        }

        // 创作者非搜索数据存入 sessionStorage（用于离线降级）
        if (tab === "creators" && !isCreatorSearch && !isEmptyOverwrite) {
            saveCreatorsToSessionStorage(realData);
        }

        state.isFullyLoaded = true;

        // 🛡️ 空响应且本地数据已上屏：保持当前画面，不用空列表清屏（与缓存同口径不回写）
        if (isEmptyOverwrite && renderedInstant) {
            return;
        }

        // 🚀 缓存先行场景：网络数据与已上屏的本地数据无实质差异时不重渲染，避免清屏重画
        // 打断用户已经滚动的阅读位置（与上方后台静默刷新同口径）。缓存已在上面回写权威新数据，
        // 此处刻意不更新 state.allData，保持与已渲染卡片一致，防止分页加载错位
        if (renderedInstant && !_shouldUpdateData(state.allData, realData)) {
            return;
        }

        // 更新状态
        state.allData = realData;

        // 渲染首屏（先过滤再切片：tools/skills/apps/recommends 的 keyword 是本地搜索，
        // realData 是未过滤的全量数据，原实现在前 20 条里过滤会漏掉靠后的匹配项）
        const scopedReal = _applySearchScope(realData);
        renderBatch(scopedReal.slice(0, pageSize), false);

        // 启动分页加载器
        if (scopedReal.length > pageSize) {
            _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab, renderToken, getRenderToken);
        }

    } catch (error) {
        // 🔍 防竞态：本次加载已被更新的加载取代（切Tab、换排序、继续输入关键词）时直接退出。
        // renderBatch 内部本来就有这道守卫，但它之外的降级分支会直接写 contentArea.innerHTML
        // 并弹提示，缺少守卫会让过期结果覆盖掉新内容
        if (renderToken !== getRenderToken()) {
            console.warn(`⏹️ ${tab}_${sort} 请求已过期，忽略本次失败`);
            return;
        }
        // 🔍 主动撤销（上方 cancelAll）不是网络故障：用户只是又敲了一个字，
        // 新一次加载已经在跑了。这里必须静默退出，否则会误弹「网络不可用」提示
        if (error && error.name === 'RequestCancelledError') {
            console.log(`⏹️ ${tab}_${sort} 搜索请求已被新关键词取代`);
            return;
        }
        console.error("数据加载失败");

        // 🚀 缓存先行场景：首屏已经用本地数据上屏，网络失败时保持当前画面即可，不再走下面的
        // 降级分支（否则会把同一批数据重渲染一遍、重播卡片动画）。与上方后台静默刷新失败一致：
        // 只记录日志，不额外打扰用户
        if (renderedInstant) {
            console.warn(`📴 ${tab}_${sort} 网络刷新失败，保持已渲染的本地数据`);
            if (force) showToast(t('feedback.refresh_failed_cached'), 'warning');
            return;
        }

        // 🚀 回退到任何可用缓存（包括过期的）
        // 🔍 创作者Tab搜索场景跳过此分支：renderBatch 对创作者不做本地过滤，
        // 直接渲染全量缓存会导致搜索结果未过滤，改由下方本地搜索降级分支处理
        if (hasCacheData && cachedData && !(tab === "creators" && keyword)) {
            console.warn(`📴 网络失败，降级显示${isCacheExpired ? '过期' : ''}缓存`);
            state.allData = cachedData;
            // 🔧 先过滤再切片：本分支已排除 creators+keyword，但 tools/skills/apps/recommends
            // 带 keyword 时会进来；renderBatch 不再自行过滤，此处必须显式过滤
            const scopedCached = _applySearchScope(cachedData);
            renderBatch(scopedCached.slice(0, pageSize), false);

            // 如果是过期缓存，显示提示
            // 🔧 改用统一提示组件 + 词典（原为手写 div、无动画不排队，且文案硬编码中文）
            if (isCacheExpired) {
                showToast(t('feedback.cache_fallback'), 'warning');
            }
            return;
        }

        // 🚀 创作者Tab：尝试从 sessionStorage 或内存中降级
        if (tab === "creators") {
            let fallbackData = null;

            // 1. 优先从当前内存状态获取
            if (state.allData && state.allData.length > 0 &&
                (!state.isSearchResult || state.searchKeyword === keyword)) {
                fallbackData = state.allData;
            }
            // 2. 从本地列表缓存获取（含过期缓存，搜索结果不入库故不会污染）
            if (!fallbackData && hasCacheData && cachedData) {
                fallbackData = cachedData;
            }
            // 3. 尝试从 sessionStorage 获取
            if (!fallbackData) {
                fallbackData = getCreatorsFromSessionStorage();
            }
            // 4. 从其他排序状态获取
            if (!fallbackData) {
                fallbackData = findExistingTabData("creators");
            }

            if (fallbackData && fallbackData.length > 0) {
                let displayData = fallbackData;

                // 搜索场景：执行本地搜索
                if (keyword) {
                    displayData = searchCreatorsLocally(keyword, fallbackData);
                    if (displayData.length === 0) {
                        const emptyState = document.createElement('div');
                        emptyState.style.cssText = 'text-align:center; padding:40px 20px; color:#888;';
                        emptyState.textContent = t('feedback.no_search_results');
                        emptyState.setAttribute('role', 'status');
                        contentArea.replaceChildren(emptyState);

                        // 🔧 改用统一提示组件 + 词典（原为手写 div 且文案硬编码中文）
                        showToast(t('feedback.search_local_result'), 'warning');
                        return;
                    }
                }

                // 按当前排序排序
                displayData = sortDataLocally(displayData, tab, sort);
                state.allData = displayData;
                // 统一走 _applySearchScope（创作者Tab恒等返回，数据已由上方
                // searchCreatorsLocally 过滤），保证各渲染入口口径完全一致
                const scopedFallback = _applySearchScope(displayData);
                renderBatch(scopedFallback.slice(0, pageSize), false);

                // 启动分页加载器
                if (scopedFallback.length > pageSize) {
                    _setupPaginationLoader(contentArea, state, pageSize, loadMoreData, keyword, tab, renderToken, getRenderToken);
                }

                // 🔧 改用统一提示组件 + 词典（原为手写 div 且两条文案均硬编码中文）
                showToast(keyword ? t('feedback.search_local_result') : t('feedback.cache_fallback'), 'warning');
                return;
            } else if (keyword) {
                renderListLoadError(contentArea, t('common.network_error_retry'), () => loadSidebarContent({
                    tab, sort, keyword, contentArea, currentUser, renderToken, getRenderToken,
                    force: true, expandItemId, isNavigationCurrent
                }), t);
                return;
            }
        }

        // 无本地数据时提供原位重试，保留当前 ComfyUI 页面与榜单上下文。
        renderListLoadError(contentArea, t('common.network_error_retry'), () => loadSidebarContent({
            tab, sort, keyword, contentArea, currentUser, renderToken, getRenderToken,
            force: true, expandItemId, isNavigationCurrent
        }), t);
    }
}


/**
 * 🛡️ 空响应防护：本次云端返回是否属于「请求成功但列表为空」，且本地已有非空数据
 *
 * 背景：网络失败本身从不清理本地数据（重试耗尽只置云端冷却并回退过期缓存，见技术文档
 * 04 章 4.2.2），但云端偶发返回 HTTP 200 + data:[] 会——例如 Space 冷启动时 HF Dataset
 * 尚未加载完。此时 realData/newData 为 []，照原样回写缓存就把断网降级的唯一数据来源清掉了。
 *
 * 只拦「新数据为空 且 本地已有非空数据」这一种组合：本地本来就是空的（首次使用、刚清过
 * 缓存、云端确实一条都没有）时返回 false，照常写入，不改变任何正常流程。
 * 调用方须自行排除搜索结果场景——搜索命中 0 条是有效答案，不是云端故障。
 *
 * @param {Array} newData - 本次从云端取回的数据
 * @param {...(Array|null|undefined)} localData - 本地已有数据（缓存副本 / 内存 state.allData）
 * @returns {boolean} true = 属于会覆盖本地好数据的空响应，应跳过回写与重渲染
 */
function _isEmptyOverwrite(newData, ...localData) {
    if (Array.isArray(newData) && newData.length > 0) return false;
    return localData.some(d => Array.isArray(d) && d.length > 0);
}

/** 判断是否需要更新数据 —— 对比ID顺序和关键字段 */
function _shouldUpdateData(oldData, newData) {
    if (!oldData || !newData) return true;
    if (oldData.length !== newData.length) return true;

    // 检查ID顺序是否一致（检测排序变化、新增/删除）
    // 比对条数覆盖首屏渲染量（PAGE_SIZE），避免首屏可见卡片（第 11~20 条）的版本/数字更新被漏检
    const checkCount = Math.min(PAGE_SIZE, oldData.length);
    for (let i = 0; i < checkCount; i++) {
        const oldId = oldData[i].id || oldData[i].account;
        const newId = newData[i].id || newData[i].account;
        if (oldId !== newId) return true;

        // 检查关键数字字段
        const keyFields = ['likes', 'downloads', 'uses', 'views', 'daily_views', 'recent_tips', 'favorites', 'rating_avg', 'rating_count'];
        for (const field of keyFields) {
            if ((oldData[i][field] || 0) !== (newData[i][field] || 0)) return true;
        }

        // 检查版本号（字符串）：云端扫描到插件新版本时往往只有 latest_version 变化，
        // 点赞/下载/浏览等数字字段全不动；若不比对它，卡片上的"可更新"徽章将永远刷不出来
        if ((oldData[i].latest_version || '') !== (newData[i].latest_version || '')) return true;
    }
    return false;
}


