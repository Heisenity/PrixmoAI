"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackImageGenerationUsage = exports.getImageMonthlyUsageCount = exports.deleteGeneratedImage = exports.getGeneratedImageHistory = exports.getGeneratedImageById = exports.saveGeneratedImage = void 0;
const constants_1 = require("../../config/constants");
const subscriptions_1 = require("./subscriptions");
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const toGeneratedImage = (row) => ({
    id: row.id,
    userId: row.user_id,
    contentId: row.content_id,
    sourceImageUrl: row.source_image_url,
    generatedImageUrl: row.generated_image_url,
    backgroundStyle: row.background_style,
    prompt: row.prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const saveGeneratedImage = async (client, userId, input) => {
    const { data, error } = await client
        .from('generated_images')
        .insert({
        user_id: userId,
        content_id: input.contentId ?? null,
        source_image_url: input.sourceImageUrl ?? null,
        generated_image_url: input.generatedImageUrl,
        background_style: input.backgroundStyle ?? null,
        prompt: input.prompt ?? null,
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to save generated image');
    }
    return toGeneratedImage(data);
};
exports.saveGeneratedImage = saveGeneratedImage;
const getGeneratedImageById = async (client, userId, imageId) => {
    const { data, error } = await client
        .from('generated_images')
        .select('*')
        .eq('id', imageId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch image');
    }
    return data ? toGeneratedImage(data) : null;
};
exports.getGeneratedImageById = getGeneratedImageById;
const getGeneratedImageHistory = async (client, userId, options = {}) => {
    const page = Number.isFinite(options.page) && options.page && options.page > 0
        ? options.page
        : DEFAULT_PAGE;
    const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
        ? options.limit
        : DEFAULT_LIMIT;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await client
        .from('generated_images')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
    if (error) {
        throw new Error(error.message || 'Failed to fetch image history');
    }
    const total = count ?? 0;
    return {
        items: (data ?? []).map((row) => toGeneratedImage(row)),
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
};
exports.getGeneratedImageHistory = getGeneratedImageHistory;
const deleteGeneratedImage = async (client, userId, imageId) => {
    const { error } = await client
        .from('generated_images')
        .delete()
        .eq('id', imageId)
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || 'Failed to delete generated image');
    }
};
exports.deleteGeneratedImage = deleteGeneratedImage;
const getImageMonthlyUsageCount = async (client, userId) => (0, subscriptions_1.getMonthlyUsageCount)(client, userId, constants_1.FEATURE_KEYS.imageGeneration);
exports.getImageMonthlyUsageCount = getImageMonthlyUsageCount;
const trackImageGenerationUsage = async (client, userId, metadata = {}) => (0, subscriptions_1.recordUsageEvent)(client, userId, constants_1.FEATURE_KEYS.imageGeneration, metadata);
exports.trackImageGenerationUsage = trackImageGenerationUsage;
