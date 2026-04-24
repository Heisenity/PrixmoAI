"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackImageGenerationUsage = exports.getImageDailyUsageCount = exports.getImageMonthlyUsageCount = exports.deleteGeneratedImage = exports.getGeneratedImageHistory = exports.getGeneratedImageById = exports.saveGeneratedImage = void 0;
const constants_1 = require("../../config/constants");
const subscriptions_1 = require("./subscriptions");
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const toGeneratedImage = (row) => ({
    id: row.id,
    userId: row.user_id,
    contentId: row.content_id,
    conversationId: row.conversation_id,
    sourceImageUrl: row.source_image_url,
    generatedImageUrl: row.generated_image_url,
    backgroundStyle: row.background_style,
    prompt: row.prompt,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket,
    storageObjectKey: row.storage_object_key,
    storagePublicUrl: row.storage_public_url,
    storageContentType: row.storage_content_type,
    storageSizeBytes: typeof row.storage_size_bytes === 'number' ? row.storage_size_bytes : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const saveGeneratedImage = async (client, userId, input) => {
    const { data, error } = await client
        .from('generated_images')
        .insert({
        user_id: userId,
        content_id: input.contentId ?? null,
        conversation_id: input.conversationId ?? null,
        source_image_url: input.sourceImageUrl ?? null,
        generated_image_url: input.generatedImageUrl,
        background_style: input.backgroundStyle ?? null,
        prompt: input.prompt ?? null,
        storage_provider: input.storageProvider ?? null,
        storage_bucket: input.storageBucket ?? null,
        storage_object_key: input.storageObjectKey ?? null,
        storage_public_url: input.storagePublicUrl ?? null,
        storage_content_type: input.storageContentType ?? null,
        storage_size_bytes: input.storageSizeBytes ?? null,
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
const getImageDailyUsageCount = async (client, userId) => (0, subscriptions_1.getDailyUsageCount)(client, userId, constants_1.FEATURE_KEYS.imageGeneration);
exports.getImageDailyUsageCount = getImageDailyUsageCount;
const trackImageGenerationUsage = async (client, userId, metadata = {}, idempotencyKey) => (0, subscriptions_1.recordUsageEvent)(client, userId, constants_1.FEATURE_KEYS.imageGeneration, metadata, idempotencyKey);
exports.trackImageGenerationUsage = trackImageGenerationUsage;
