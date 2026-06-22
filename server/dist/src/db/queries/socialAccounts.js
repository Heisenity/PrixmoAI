"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setPrimarySocialAccountForPlatform = exports.getPrimarySocialAccountByUserAndPlatform = exports.deleteSocialAccount = exports.updateSocialAccount = exports.getSocialAccountById = exports.getSocialAccountCountByUser = exports.getSocialAccountsByUser = exports.upsertSocialAccountByUniqueKey = exports.getSocialAccountByUserAndPlatformAndAccountId = exports.createSocialAccount = void 0;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const compactObject = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const normalizePage = (page) => Number.isFinite(page) && page && page > 0 ? page : DEFAULT_PAGE;
const normalizeLimit = (limit) => Number.isFinite(limit) && limit && limit > 0 ? limit : DEFAULT_LIMIT;
const toSocialAccount = (row) => ({
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    accountId: row.account_id,
    accountName: row.account_name,
    profileUrl: row.profile_url,
    oauthProvider: row.oauth_provider ?? null,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    isPrimaryForPlatform: Boolean(row.is_primary_for_platform),
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    metadata: toRecord(row.metadata),
    connectedAt: row.connected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const createSocialAccount = async (client, userId, input) => {
    const { data, error } = await client
        .from('social_accounts')
        .insert({
        user_id: userId,
        platform: input.platform,
        account_id: input.accountId,
        account_name: input.accountName ?? null,
        profile_url: input.profileUrl ?? null,
        oauth_provider: input.oauthProvider ?? null,
        verification_status: input.verificationStatus ?? 'unverified',
        verified_at: input.verifiedAt ?? null,
        is_primary_for_platform: input.isPrimaryForPlatform ?? false,
        access_token: input.accessToken ?? null,
        refresh_token: input.refreshToken ?? null,
        token_expires_at: input.tokenExpiresAt ?? null,
        metadata: input.metadata ?? {},
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create social account');
    }
    return toSocialAccount(data);
};
exports.createSocialAccount = createSocialAccount;
const getSocialAccountByUserAndPlatformAndAccountId = async (client, userId, platform, accountId) => {
    const { data, error } = await client
        .from('social_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .eq('account_id', accountId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch social account');
    }
    return data ? toSocialAccount(data) : null;
};
exports.getSocialAccountByUserAndPlatformAndAccountId = getSocialAccountByUserAndPlatformAndAccountId;
const upsertSocialAccountByUniqueKey = async (client, userId, input) => {
    const { data, error } = await client
        .from('social_accounts')
        .upsert({
        user_id: userId,
        platform: input.platform,
        account_id: input.accountId,
        account_name: input.accountName ?? null,
        profile_url: input.profileUrl ?? null,
        oauth_provider: input.oauthProvider ?? null,
        verification_status: input.verificationStatus ?? 'unverified',
        verified_at: input.verifiedAt ?? null,
        is_primary_for_platform: input.isPrimaryForPlatform ?? false,
        access_token: input.accessToken ?? null,
        refresh_token: input.refreshToken ?? null,
        token_expires_at: input.tokenExpiresAt ?? null,
        metadata: input.metadata ?? {},
    }, { onConflict: 'user_id,platform,account_id' })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to upsert social account');
    }
    return toSocialAccount(data);
};
exports.upsertSocialAccountByUniqueKey = upsertSocialAccountByUniqueKey;
const getSocialAccountsByUser = async (client, userId, options = {}) => {
    const page = normalizePage(options.page);
    const limit = normalizeLimit(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await client
        .from('social_accounts')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .eq('verification_status', 'verified')
        .order('connected_at', { ascending: false })
        .range(from, to);
    if (error) {
        throw new Error(error.message || 'Failed to fetch social accounts');
    }
    const total = count ?? 0;
    return {
        items: (data ?? []).map((row) => toSocialAccount(row)),
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
};
exports.getSocialAccountsByUser = getSocialAccountsByUser;
const getSocialAccountCountByUser = async (client, userId) => {
    const { count, error } = await client
        .from('social_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('verification_status', 'verified');
    if (error) {
        throw new Error(error.message || 'Failed to fetch social account count');
    }
    return count ?? 0;
};
exports.getSocialAccountCountByUser = getSocialAccountCountByUser;
const getSocialAccountById = async (client, userId, accountId) => {
    const { data, error } = await client
        .from('social_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch social account');
    }
    return data ? toSocialAccount(data) : null;
};
exports.getSocialAccountById = getSocialAccountById;
const updateSocialAccount = async (client, userId, accountId, input) => {
    const payload = compactObject({
        platform: input.platform,
        account_id: input.accountId,
        account_name: input.accountName,
        profile_url: input.profileUrl,
        oauth_provider: input.oauthProvider,
        verification_status: input.verificationStatus,
        verified_at: input.verifiedAt,
        is_primary_for_platform: input.isPrimaryForPlatform,
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        token_expires_at: input.tokenExpiresAt,
        metadata: input.metadata,
    });
    const { data, error } = await client
        .from('social_accounts')
        .update(payload)
        .eq('id', accountId)
        .eq('user_id', userId)
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to update social account');
    }
    return toSocialAccount(data);
};
exports.updateSocialAccount = updateSocialAccount;
const deleteSocialAccount = async (client, userId, accountId) => {
    const { error } = await client
        .from('social_accounts')
        .delete()
        .eq('id', accountId)
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || 'Failed to delete social account');
    }
};
exports.deleteSocialAccount = deleteSocialAccount;
const getPrimarySocialAccountByUserAndPlatform = async (client, userId, platform) => {
    const { data: primary, error: primaryError } = await client
        .from('social_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .eq('verification_status', 'verified')
        .eq('is_primary_for_platform', true)
        .maybeSingle();
    if (primaryError) {
        throw new Error(primaryError.message || 'Failed to fetch primary social account');
    }
    if (primary) {
        return toSocialAccount(primary);
    }
    const { data: fallback, error: fallbackError } = await client
        .from('social_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .eq('verification_status', 'verified')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (fallbackError) {
        throw new Error(fallbackError.message || 'Failed to fetch verified social account');
    }
    return fallback ? toSocialAccount(fallback) : null;
};
exports.getPrimarySocialAccountByUserAndPlatform = getPrimarySocialAccountByUserAndPlatform;
const setPrimarySocialAccountForPlatform = async (client, userId, platform, socialAccountId) => {
    const { data: target, error: targetError } = await client
        .from('social_accounts')
        .select('id')
        .eq('id', socialAccountId)
        .eq('user_id', userId)
        .eq('platform', platform)
        .eq('verification_status', 'verified')
        .maybeSingle();
    if (targetError || !target) {
        throw new Error(targetError?.message ||
            'Only a verified account can be primary for this platform');
    }
    const { error: clearError } = await client
        .from('social_accounts')
        .update({ is_primary_for_platform: false })
        .eq('user_id', userId)
        .eq('platform', platform)
        .eq('is_primary_for_platform', true)
        .neq('id', socialAccountId);
    if (clearError) {
        throw new Error(clearError.message || 'Failed to clear previous primary account');
    }
    const { data, error } = await client
        .from('social_accounts')
        .update({ is_primary_for_platform: true })
        .eq('id', socialAccountId)
        .eq('user_id', userId)
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to set primary social account');
    }
    return toSocialAccount(data);
};
exports.setPrimarySocialAccountForPlatform = setPrimarySocialAccountForPlatform;
