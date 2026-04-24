"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContent = exports.getContentHistory = exports.generateContent = void 0;
const gemini_1 = require("../ai/gemini");
const constants_1 = require("../config/constants");
const brandProfiles_1 = require("../db/queries/brandProfiles");
const content_1 = require("../db/queries/content");
const subscriptions_1 = require("../db/queries/subscriptions");
const supabase_1 = require("../db/supabase");
const requestCancellation_1 = require("../lib/requestCancellation");
const generatedAssetPayloads_1 = require("../lib/generatedAssetPayloads");
const r2Storage_service_1 = require("../services/r2Storage.service");
const contentGenerationQueue_service_1 = require("../services/contentGenerationQueue.service");
const runtimeCache_service_1 = require("../services/runtimeCache.service");
const parsePositiveInt = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const resolveBrandPreference = (brandProfile, useBrandName) => {
    const shouldUseBrandName = useBrandName ?? Boolean(brandProfile?.brandName?.trim());
    if (!shouldUseBrandName) {
        return {
            brandName: null,
            useBrandName: false,
        };
    }
    const brandName = brandProfile?.brandName?.trim();
    if (!brandName) {
        throw new Error('Add your brand name in Settings > Brand memory, or turn off Use brand name.');
    }
    return {
        brandName,
        useBrandName: true,
    };
};
const logGenerationFailure = (scope, userId, error) => {
    if (error instanceof gemini_1.ContentGenerationProvidersExhaustedError) {
        console.error(`[${scope}] All content generation providers failed`, {
            userId,
            failures: error.failures,
        });
        return;
    }
    console.error(`[${scope}] Content generation failed`, {
        userId,
        error: error instanceof Error ? error.message : error,
    });
};
const generateContent = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const cancellation = (0, requestCancellation_1.createRequestCancellation)(req, res);
    try {
        console.info('[content-controller] Generate content request started', {
            userId: req.user.id,
            productName: req.body.productName,
            platform: req.body.platform ?? null,
            goal: req.body.goal ?? null,
        });
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const [brandProfile, subscription, reelScriptUsageCount] = await Promise.all([
            (0, brandProfiles_1.getBrandProfileByUserId)(client, req.user.id),
            (0, subscriptions_1.getCurrentSubscriptionByUserId)(client, req.user.id),
            (0, content_1.getReelScriptDailyUsageCount)(client, req.user.id),
        ]);
        const generationInput = {
            ...req.body,
            ...resolveBrandPreference(brandProfile, req.body.useBrandName),
        };
        const plan = subscription?.plan ?? 'free';
        const reelScriptLimit = (0, subscriptions_1.getPlanFeatureLimit)(plan, constants_1.FEATURE_KEYS.reelScriptGeneration);
        const includeReelScript = reelScriptLimit === null || reelScriptUsageCount < reelScriptLimit;
        const { jobId, result: { contentPack, provider }, } = await (0, contentGenerationQueue_service_1.enqueueContentGenerationJob)({
            userId: req.user.id,
            brandProfile,
            input: generationInput,
            includeReelScript,
        }, cancellation.signal);
        const hasReelScript = (0, gemini_1.hasMeaningfulReelScript)(contentPack.reelScript);
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Content generation cancelled by user.');
        const storedContentAsset = await (0, r2Storage_service_1.storeGeneratedContentInR2)({
            userId: req.user.id,
            productName: generationInput.productName,
            payload: (0, generatedAssetPayloads_1.buildGeneratedContentFilePayload)({
                userId: req.user.id,
                provider,
                brandProfileId: brandProfile?.id ?? null,
                productInput: generationInput,
                contentPack,
                reelScriptIncluded: hasReelScript,
            }),
            signal: cancellation.signal,
        });
        const content = await (0, content_1.saveGeneratedContent)(client, req.user.id, {
            ...generationInput,
            brandProfileId: brandProfile?.id ?? null,
            storageProvider: storedContentAsset?.provider ?? null,
            storageBucket: storedContentAsset?.bucket ?? null,
            storageObjectKey: storedContentAsset?.objectKey ?? null,
            storagePublicUrl: storedContentAsset?.publicUrl ?? null,
            storageContentType: storedContentAsset?.contentType ?? null,
            storageSizeBytes: storedContentAsset?.sizeBytes ?? null,
            ...contentPack,
        });
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Content generation cancelled by user.');
        await (0, content_1.trackContentGenerationUsage)(client, req.user.id, {
            contentId: content.id,
            provider,
            brandProfileId: brandProfile?.id ?? null,
            platform: generationInput.platform ?? null,
            goal: generationInput.goal ?? null,
            tone: generationInput.tone ?? null,
            audience: generationInput.audience ?? null,
            productName: generationInput.productName,
            productDescription: generationInput.productDescription ?? null,
            keywords: generationInput.keywords ?? [],
            reelScriptIncluded: hasReelScript,
        }, `content-generation:${content.id}`);
        if (hasReelScript) {
            (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Content generation cancelled by user.');
            await (0, content_1.trackReelScriptGenerationUsage)(client, req.user.id, {
                contentId: content.id,
                provider,
                brandProfileId: brandProfile?.id ?? null,
                platform: generationInput.platform ?? null,
                goal: generationInput.goal ?? null,
                tone: generationInput.tone ?? null,
                audience: generationInput.audience ?? null,
                productName: generationInput.productName,
            }, `reel-script-generation:${content.id}`);
        }
        await (0, runtimeCache_service_1.invalidateAnalyticsRuntimeCache)(req.user.id);
        console.info('[content-controller] Generate content request succeeded', {
            userId: req.user.id,
            contentId: content.id,
            provider,
            hasReelScript,
        });
        return res.status(200).json({
            status: 'success',
            message: 'Content generated successfully',
            data: content,
            meta: {
                jobId,
            },
        });
    }
    catch (error) {
        if ((0, requestCancellation_1.isRequestCancelledError)(error)) {
            console.info('[content-controller] Generate content request cancelled', {
                userId: req.user?.id ?? 'unknown-user',
            });
            return;
        }
        logGenerationFailure('content', req.user?.id ?? 'unknown-user', error);
        return res.status(500).json({
            status: 'error',
            message: error instanceof gemini_1.ContentGenerationProvidersExhaustedError
                ? error.message
                : error instanceof Error
                    ? error.message
                    : 'Failed to generate content',
        });
    }
    finally {
        cancellation.cleanup();
    }
};
exports.generateContent = generateContent;
const getContentHistory = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const page = parsePositiveInt(req.query.page, 1);
        const limit = parsePositiveInt(req.query.limit, 10);
        const history = await (0, content_1.getGeneratedContentHistory)(client, req.user.id, {
            page,
            limit,
        });
        return res.status(200).json({
            status: 'success',
            data: history,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch content history',
        });
    }
};
exports.getContentHistory = getContentHistory;
const deleteContent = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingContent = await (0, content_1.getGeneratedContentById)(client, req.user.id, req.params.id);
        if (!existingContent) {
            return res.status(404).json({
                status: 'fail',
                message: 'Content item not found',
            });
        }
        await (0, content_1.deleteGeneratedContent)(client, req.user.id, req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Content deleted successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to delete content',
        });
    }
};
exports.deleteContent = deleteContent;
