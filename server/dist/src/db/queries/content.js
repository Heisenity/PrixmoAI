"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackContentGenerationUsage = exports.getContentMonthlyUsageCount = exports.deleteGeneratedContent = exports.getGeneratedContentHistory = exports.getGeneratedContentById = exports.saveGeneratedContent = void 0;
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
const toReelScript = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {
            hook: '',
            body: '',
            cta: '',
        };
    }
    const record = value;
    return {
        hook: typeof record.hook === 'string' ? record.hook : '',
        body: typeof record.body === 'string' ? record.body : '',
        cta: typeof record.cta === 'string' ? record.cta : '',
    };
};
const toGeneratedContent = (row) => ({
    id: row.id,
    userId: row.user_id,
    brandProfileId: row.brand_profile_id,
    productName: row.product_name,
    productDescription: row.product_description,
    productImageUrl: row.product_image_url,
    platform: row.platform,
    goal: row.goal,
    tone: row.tone,
    audience: row.audience,
    keywords: toStringArray(row.keywords),
    captions: toStringArray(row.captions),
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
const trackContentGenerationUsage = async (client, userId, metadata = {}) => (0, subscriptions_1.recordUsageEvent)(client, userId, constants_1.FEATURE_KEYS.contentGeneration, metadata);
exports.trackContentGenerationUsage = trackContentGenerationUsage;
