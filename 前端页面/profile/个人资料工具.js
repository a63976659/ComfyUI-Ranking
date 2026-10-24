import { normalizeProfileImageUrl } from '../core/全局配置.js';

/** 用户资料与 SQL 钱包响应分别校验，未知内部字段不进入页面。 */
const PUBLIC_FIELDS = ['name', 'avatar', 'avatarDataUrl', 'bannerUrl', 'intro', 'gender', 'country', 'region'];
const WALLET_FIELDS = ['balance', 'earn_balance', 'tip_balance', 'task_balance', 'frozen_balance', 'total_withdrawn'];

export function normalizeProfileData(value, account, own = false) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.account !== account
        || typeof account !== 'string' || !account.trim()) throw new Error('Invalid profile');
    const result = { account };
    for (const key of [...PUBLIC_FIELDS, ...(own ? ['email', 'phone', 'birthday'] : [])]) {
        if (typeof value[key] === 'string') result[key] = ['avatar', 'avatarDataUrl', 'bannerUrl'].includes(key)
            ? normalizeProfileImageUrl(value[key]) : value[key];
    }
    for (const key of ['age', 'created_at', 'receivedLikes', 'receivedFavorites', 'receivedUses']) {
        if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) result[key] = value[key];
    }
    for (const key of ['followers', 'following']) {
        result[key] = Array.isArray(value[key]) ? value[key].filter(v => typeof v === 'string' && v.trim()) : [];
    }
    result.privacy = Object.fromEntries(['follows', 'followers', 'likes', 'favorites', 'downloads']
        .map(key => [key, value.privacy?.[key] === true]));
    result.following_count = !own && Number.isSafeInteger(value.following_count) && value.following_count >= 0
        ? value.following_count : result.following.length;
    if (!own && result.privacy.follows) result.following = [];
    result.is_admin = value.is_admin === true || (own && value.isAdmin === true);
    if (own) Object.assign(result, normalizeWalletData({ ...value, status: 'success' }));
    return result;
}

export function normalizeWalletData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.status !== 'success') return {};
    return Object.fromEntries(WALLET_FIELDS.filter(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
        .map(key => [key, value[key]]));
}

/** 身份有效性由调用者核查；此函数还核对存储记录的账号，防止覆盖新账号。 */
export function mergeStoredProfile(account, freshData, storages, userKey) {
    for (const storage of storages) {
        try {
            const raw = storage?.getItem(userKey);
            if (!raw) continue;
            const saved = JSON.parse(raw);
            if (saved?.user?.account !== account) continue;
            const profile = normalizeProfileData({ ...saved.user, ...freshData }, account, true);
            for (const key of WALLET_FIELDS) delete profile[key];
            storage.setItem(userKey, JSON.stringify({ ...saved, user: profile }));
        } catch (_) {}
    }
}
