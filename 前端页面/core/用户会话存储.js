import { normalizeProfileData } from '../profile/个人资料工具.js';

/** 持久化只保留资料字段；钱包、凭证和未知字段不能混入用户记录。 */
export function sessionProfile(value) {
    if (!value || typeof value.account !== 'string' || !value.account.trim()) throw new Error('Invalid user session');
    const profile = normalizeProfileData(value, value.account, true);
    for (const key of ['balance', 'earn_balance', 'tip_balance', 'task_balance', 'frozen_balance', 'total_withdrawn']) delete profile[key];
    return profile;
}

export function readUserSession(storages, keys, now = Date.now()) {
    for (const storage of storages) {
        try {
            const raw = storage?.getItem(keys.USER), token = storage?.getItem(keys.TOKEN);
            if (!raw || typeof token !== 'string' || !token.trim()) continue;
            const saved = JSON.parse(raw);
            if (saved.expireAt !== undefined && (!Number.isFinite(saved.expireAt) || saved.expireAt <= now)) {
                storage.removeItem(keys.USER); storage.removeItem(keys.TOKEN); continue;
            }
            return { user: sessionProfile(saved.user || saved), token, expireAt: saved.expireAt };
        } catch (_) {}
    }
    return null;
}

export function writeUserSession(storages, keys, user, token, remember, expireAt) {
    const profile = sessionProfile(user);
    if (typeof token !== 'string' || !token.trim() || !Number.isFinite(expireAt)) throw new Error('Invalid user session');
    const selected = storages[remember ? 0 : 1];
    // 清除另一个登录方式的旧凭证，再发布完整的新记录。失败不能继续创建混合身份。
    try {
        for (const storage of storages) {
            if (!storage) throw new Error('Unavailable storage');
            storage.removeItem(keys.USER); storage.removeItem(keys.TOKEN);
        }
        selected.setItem(keys.USER, JSON.stringify({ user: profile, expireAt }));
        selected.setItem(keys.TOKEN, token);
    } catch (_) {
        for (const storage of storages) {
            try { storage?.removeItem(keys.USER); storage?.removeItem(keys.TOKEN); } catch (_) {}
        }
        throw new Error('Session storage unavailable');
    }
    return profile;
}
