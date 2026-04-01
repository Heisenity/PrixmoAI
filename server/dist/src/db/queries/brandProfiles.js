"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBrandProfile = exports.getBrandProfileByUserId = exports.upsertBrandProfile = exports.createBrandProfile = void 0;
const compactObject = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
const toBrandProfile = (row) => ({
    id: row.id,
    userId: row.user_id,
    brandName: row.brand_name,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    username: row.username,
    avatarUrl: row.avatar_url,
    industry: row.industry,
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
    username: input.username ?? null,
    avatar_url: input.avatarUrl ?? null,
    industry: input.industry ?? null,
    target_audience: input.targetAudience ?? null,
    brand_voice: input.brandVoice ?? null,
    description: input.description ?? null,
});
const toBrandProfileUpdatePayload = (input) => compactObject({
    brand_name: input.brandName,
    full_name: input.fullName,
    phone_number: input.phoneNumber,
    username: input.username,
    avatar_url: input.avatarUrl,
    industry: input.industry,
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
