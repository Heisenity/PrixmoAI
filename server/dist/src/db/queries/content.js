"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackReelScriptGenerationUsage = exports.trackContentGenerationUsage = exports.getReelScriptDailyUsageCount = exports.getContentDailyUsageCount = exports.getContentMonthlyUsageCount = exports.deleteGeneratedContent = exports.getGeneratedContentHistory = exports.getGeneratedContentById = exports.saveGeneratedContent = void 0;
const constants_1 = require("../../config/constants");
const subscriptions_1 = require("./subscriptions");
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const toStringArray = (value) => Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const extractTextValue = (value, depth = 0) => {
    if (depth > 4) {
        return '';
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => extractTextValue(entry, depth + 1))
            .filter(Boolean)
            .join(' ')
            .trim();
    }
    if (!isRecord(value)) {
        return '';
    }
    const preferredKeys = ['text', 'value', 'content', 'copy', 'message', 'script'];
    for (const key of preferredKeys) {
        const normalized = extractTextValue(value[key], depth + 1);
        if (normalized) {
            return normalized;
        }
    }
    return Object.values(value)
        .map((entry) => extractTextValue(entry, depth + 1))
        .filter(Boolean)
        .join(' ')
        .trim();
};
const toCaptionVariants = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
        if (typeof entry === 'string') {
            const normalized = entry.trim();
            if (!normalized) {
                return null;
            }
            return {
                hook: normalized,
                mainCopy: normalized,
                shortCaption: normalized,
                cta: 'Learn more.',
            };
        }
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null;
        }
        const record = entry;
        const hook = typeof record.hook === 'string' ? record.hook.trim() : '';
        const mainCopy = typeof record.mainCopy === 'string' ? record.mainCopy.trim() : '';
        const shortCaption = typeof record.shortCaption === 'string'
            ? record.shortCaption.trim()
            : '';
        const cta = typeof record.cta === 'string' ? record.cta.trim() : '';
        if (!hook || !mainCopy || !shortCaption || !cta) {
            return null;
        }
        return {
            hook,
            mainCopy,
            shortCaption,
            cta,
        };
    })
        .filter((entry) => Boolean(entry));
};
const toReelScript = (value) => {
    if (!isRecord(value)) {
        return {
            hook: '',
            body: '',
            cta: '',
        };
    }
    const record = value;
    return {
        hook: extractTextValue(record.hook),
        body: extractTextValue(record.body),
        cta: extractTextValue(record.cta),
    };
};
const toGeneratedContent = (row) => ({
    id: row.id,
    userId: row.user_id,
    brandProfileId: row.brand_profile_id,
    conversationId: row.conversation_id,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket,
    storageObjectKey: row.storage_object_key,
    storagePublicUrl: row.storage_public_url,
    storageContentType: row.storage_content_type,
    storageSizeBytes: typeof row.storage_size_bytes === 'number' ? row.storage_size_bytes : null,
    productName: row.product_name,
    productDescription: row.product_description,
    productImageUrl: row.product_image_url,
    platform: row.platform,
    goal: row.goal,
    tone: row.tone,
    audience: row.audience,
    keywords: toStringArray(row.keywords),
    captions: toCaptionVariants(row.captions),
    hashtags: toStringArray(row.hashtags),
    reelScript: toReelScript(row.reel_script),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const normalizePage = (page) => Number.isFinite(page) && page && page > 0 ? page : DEFAULT_PAGE;
const normalizeLimit = (limit) => Number.isFinite(limit) && limit && limit > 0 ? limit : DEFAULT_LIMIT;
const saveGeneratedContent = async (client, userId, input) => {
    const { data, error } = await client
        .from('generated_content')
        .insert({
        user_id: userId,
        brand_profile_id: input.brandProfileId ?? null,
        conversation_id: input.conversationId ?? null,
        product_name: input.productName,
        product_description: input.productDescription ?? null,
        product_image_url: input.productImageUrl ?? null,
        platform: input.platform ?? null,
        goal: input.goal ?? null,
        tone: input.tone ?? null,
        audience: input.audience ?? null,
        keywords: input.keywords ?? [],
        captions: input.captions,
        hashtags: input.hashtags,
        reel_script: input.reelScript,
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
        throw new Error(error?.message || 'Failed to save generated content');
    }
    return toGeneratedContent(data);
};
exports.saveGeneratedContent = saveGeneratedContent;
const getGeneratedContentById = async (client, userId, contentId) => {
    const { data, error } = await client
        .from('generated_content')
        .select('*')
        .eq('id', contentId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch content item');
    }
    return data ? toGeneratedContent(data) : null;
};
exports.getGeneratedContentById = getGeneratedContentById;
const getGeneratedContentHistory = async (client, userId, options = {}) => {
    const page = normalizePage(options.page);
    const limit = normalizeLimit(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await client
        .from('generated_content')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
    if (error) {
        throw new Error(error.message || 'Failed to fetch content history');
    }
    const total = count ?? 0;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    return {
        items: (data ?? []).map((row) => toGeneratedContent(row)),
        page,
        limit,
        total,
        totalPages,
    };
};
exports.getGeneratedContentHistory = getGeneratedContentHistory;
const deleteGeneratedContent = async (client, userId, contentId) => {
    const { error } = await client
        .from('generated_content')
        .delete()
        .eq('id', contentId)
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || 'Failed to delete content');
    }
};
exports.deleteGeneratedContent = deleteGeneratedContent;
const getContentMonthlyUsageCount = async (client, userId) => (0, subscriptions_1.getMonthlyUsageCount)(client, userId, constants_1.FEATURE_KEYS.contentGeneration);
exports.getContentMonthlyUsageCount = getContentMonthlyUsageCount;
const getContentDailyUsageCount = async (client, userId) => (0, subscriptions_1.getDailyUsageCount)(client, userId, constants_1.FEATURE_KEYS.contentGeneration);
exports.getContentDailyUsageCount = getContentDailyUsageCount;
const getReelScriptDailyUsageCount = async (client, userId) => (0, subscriptions_1.getDailyUsageCount)(client, userId, constants_1.FEATURE_KEYS.reelScriptGeneration);
exports.getReelScriptDailyUsageCount = getReelScriptDailyUsageCount;
const trackContentGenerationUsage = async (client, userId, metadata = {}, idempotencyKey) => (0, subscriptions_1.recordUsageEvent)(client, userId, constants_1.FEATURE_KEYS.contentGeneration, metadata, idempotencyKey);
exports.trackContentGenerationUsage = trackContentGenerationUsage;
const trackReelScriptGenerationUsage = async (client, userId, metadata = {}, idempotencyKey) => (0, subscriptions_1.recordUsageEvent)(client, userId, constants_1.FEATURE_KEYS.reelScriptGeneration, metadata, idempotencyKey);
exports.trackReelScriptGenerationUsage = trackReelScriptGenerationUsage;
