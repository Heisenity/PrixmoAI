"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTakenUsernames = exports.getBrandProfileOwnerByUsername = exports.updateBrandProfile = exports.getBrandProfileByUserId = exports.upsertBrandProfile = exports.createBrandProfile = void 0;
const username_1 = require("../../lib/username");
const compactObject = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
const toBrandProfile = (row) => ({
    id: row.id,
    userId: row.user_id,
    brandName: row.brand_name,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    username: row.username,
    avatarUrl: row.avatar_url,
    country: row.country,
    language: row.language,
    websiteUrl: row.website_url,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    industry: row.industry,
    primaryIndustry: row.primary_industry,
    secondaryIndustries: row.secondary_industries ?? [],
    targetAudience: row.target_audience,
    brandVoice: row.brand_voice,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const toBrandProfilePayload = (userId, input) => compactObject({
    user_id: userId,
    brand_name: input.brandName,
    full_name: input.fullName,
    phone_number: input.phoneNumber ?? null,
    username: input.username ? (0, username_1.normalizeUsername)(input.username) : null,
    avatar_url: input.avatarUrl ?? null,
    country: input.country ?? null,
    language: input.language ?? null,
    website_url: input.websiteUrl ?? null,
    logo_url: input.logoUrl ?? null,
    primary_color: input.primaryColor ?? null,
    secondary_color: input.secondaryColor ?? null,
    accent_color: input.accentColor ?? null,
    industry: input.industry ?? null,
    primary_industry: input.primaryIndustry ?? null,
    secondary_industries: input.secondaryIndustries ?? [],
    target_audience: input.targetAudience ?? null,
    brand_voice: input.brandVoice ?? null,
    description: input.description ?? null,
});
const toBrandProfileUpdatePayload = (input) => compactObject({
    brand_name: input.brandName,
    full_name: input.fullName,
    phone_number: input.phoneNumber,
    username: input.username === undefined
        ? undefined
        : (0, username_1.normalizeUsername)(input.username ?? '') || null,
    avatar_url: input.avatarUrl,
    country: input.country,
    language: input.language,
    website_url: input.websiteUrl,
    logo_url: input.logoUrl,
    primary_color: input.primaryColor,
    secondary_color: input.secondaryColor,
    accent_color: input.accentColor,
    industry: input.industry,
    primary_industry: input.primaryIndustry,
    secondary_industries: input.secondaryIndustries,
    target_audience: input.targetAudience,
    brand_voice: input.brandVoice,
    description: input.description,
});
const createBrandProfile = async (client, userId, input) => {
    const { data, error } = await client
        .from('brand_profiles')
        .insert(toBrandProfilePayload(userId, input))
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to create brand profile');
    }
    return toBrandProfile(data);
};
exports.createBrandProfile = createBrandProfile;
const upsertBrandProfile = async (client, userId, input) => {
    const { data, error } = await client
        .from('brand_profiles')
        .upsert(toBrandProfilePayload(userId, input), { onConflict: 'user_id' })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to save brand profile');
    }
    return toBrandProfile(data);
};
exports.upsertBrandProfile = upsertBrandProfile;
const getBrandProfileByUserId = async (client, userId) => {
    const { data, error } = await client
        .from('brand_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch brand profile');
    }
    return data ? toBrandProfile(data) : null;
};
exports.getBrandProfileByUserId = getBrandProfileByUserId;
const updateBrandProfile = async (client, userId, input) => {
    const payload = toBrandProfileUpdatePayload(input);
    if (Object.keys(payload).length === 0) {
        const existingProfile = await (0, exports.getBrandProfileByUserId)(client, userId);
        if (!existingProfile) {
            throw new Error('Brand profile not found');
        }
        return existingProfile;
    }
    const { data, error } = await client
        .from('brand_profiles')
        .update(payload)
        .eq('user_id', userId)
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to update brand profile');
    }
    return toBrandProfile(data);
};
exports.updateBrandProfile = updateBrandProfile;
const getBrandProfileOwnerByUsername = async (client, username) => {
    const normalizedUsername = (0, username_1.normalizeUsername)(username);
    if (!normalizedUsername) {
        return null;
    }
    const { data, error } = await client
        .from('brand_profiles')
        .select('user_id, username')
        .eq('username', normalizedUsername)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to check username availability');
    }
    if (!data?.username) {
        return null;
    }
    return {
        userId: data.user_id,
        username: data.username,
    };
};
exports.getBrandProfileOwnerByUsername = getBrandProfileOwnerByUsername;
const listTakenUsernames = async (client, usernames) => {
    const normalizedUsernames = Array.from(new Set(usernames.map((entry) => (0, username_1.normalizeUsername)(entry)).filter(Boolean)));
    if (!normalizedUsernames.length) {
        return new Set();
    }
    const { data, error } = await client
        .from('brand_profiles')
        .select('username')
        .in('username', normalizedUsernames);
    if (error) {
        throw new Error(error.message || 'Failed to load existing usernames');
    }
    return new Set((data ?? [])
        .map((entry) => entry.username)
        .filter((entry) => Boolean(entry)));
};
exports.listTakenUsernames = listTakenUsernames;
