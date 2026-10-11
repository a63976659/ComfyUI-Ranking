// 本地榜单查询：不依赖 DOM、存储、网络或图片代理。
// 保留数据引擎原有排序/搜索规则；仅缓存最近一次排序的数组引用。

let _lastSortInput = null;
let _lastSortKey = '';
let _lastSortResult = null;

export function sortDataLocally(data, tab, sort) {
    const sortKey = `${tab}_${sort}`;
    // 如果源数据引用相同且排序参数相同，返回缓存结果（避免重复创建数组拷贝）
    if (data === _lastSortInput && sortKey === _lastSortKey && _lastSortResult) {
        return _lastSortResult;
    }

    const sorted = [...data]; // 不修改原数组

    if (tab === "creators") {
        // 创作者排序（与后端 get_creators 一致）
        switch (sort) {
            case "likes": sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0)); break;
            case "favorites": sorted.sort((a, b) => (b.favorites || 0) - (a.favorites || 0)); break;
            case "downloads": sorted.sort((a, b) => (b.downloads || 0) - (a.downloads || 0)); break;
            case "tips": sorted.sort((a, b) => (b.recent_tips || 0) - (a.recent_tips || 0)); break;
            case "views": sorted.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
            case "daily_views": sorted.sort((a, b) => (b.daily_views || 0) - (a.daily_views || 0)); break;
            default: sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); break; // time
        }
    } else {
        // 工具/Skill/应用/推荐排序（与后端 get_items 一致）
        switch (sort) {
            case "downloads": sorted.sort((a, b) => (b.uses || 0) - (a.uses || 0)); break;
            case "likes": sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0)); break;
            case "favorites": sorted.sort((a, b) => (b.favorites || 0) - (a.favorites || 0)); break;
            case "tips":
                // 后端使用 tip_history 的当月数据排序
                sorted.sort((a, b) => {
                    const now = new Date();
                    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const tipA = (a.tip_history || {})[currentMonth] || 0;
                    const tipB = (b.tip_history || {})[currentMonth] || 0;
                    return tipB - tipA;
                });
                break;
            case "views": sorted.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
            case "daily_views": sorted.sort((a, b) => (b.daily_views || 0) - (a.daily_views || 0)); break;
            case "rating":
                sorted.sort((a, b) => {
                    const ratingA = a.rating_avg || 0;
                    const ratingB = b.rating_avg || 0;
                    if (ratingA === ratingB) {
                        return (b.rating_count || 0) - (a.rating_count || 0);
                    }
                    return ratingB - ratingA;
                });
                break;
            default: sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); break; // time
        }
    }

    // 缓存本次排序结果
    _lastSortInput = data;
    _lastSortKey = sortKey;
    _lastSortResult = sorted;
    return sorted;
}

/**
 * 按关键词过滤列表数据（工具/应用/推荐Tab本地搜索）
 * @param {Array} items - 数据数组
 * @param {string} keyword - 搜索关键词
 * @returns {Array} 过滤后的数据
 */
export function filterItemsByKeyword(items, keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return items.filter(item => {
        const textStr = `${item.title||''} ${item.shortDesc||''} ${item.name||''} ${item.account||''}`.toLowerCase();
        return textStr.includes(lowerKeyword);
    });
}

/**
 * 本地搜索创作者数据
 * @param {string} keyword - 搜索关键词
 * @param {Array} data - 创作者数据数组
 * @returns {Array} 匹配的数据
 */
export function searchCreatorsLocally(keyword, data) {
    const lowerKeyword = keyword.toLowerCase();
    return data.filter(item => {
        const name = (item.name || '').toLowerCase();
        const account = (item.account || '').toLowerCase();
        const shortDesc = (item.shortDesc || '').toLowerCase();
        return name.includes(lowerKeyword) ||
               account.includes(lowerKeyword) ||
               shortDesc.includes(lowerKeyword);
    });
}


