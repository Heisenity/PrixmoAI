"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWorkspaceImage = exports.generateWorkspaceCopy = exports.deleteWorkspaceConversation = exports.updateWorkspaceConversation = exports.getWorkspaceConversationThread = exports.createWorkspaceConversation = exports.listWorkspaceConversations = void 0;
const gemini_1 = require("../ai/gemini");
const imageGen_1 = require("../ai/imageGen");
const constants_1 = require("../config/constants");
const brandProfiles_1 = require("../db/queries/brandProfiles");
const generateWorkspace_1 = require("../db/queries/generateWorkspace");
const content_1 = require("../db/queries/content");
const images_1 = require("../db/queries/images");
const subscriptions_1 = require("../db/queries/subscriptions");
const supabase_1 = require("../db/supabase");
const imageRuntimePolicy_service_1 = require("../services/imageRuntimePolicy.service");
const requestCancellation_1 = require("../lib/requestCancellation");
const generatedAssetPayloads_1 = require("../lib/generatedAssetPayloads");
const r2Storage_service_1 = require("../services/r2Storage.service");
const contentGenerationQueue_service_1 = require("../services/contentGenerationQueue.service");
const imageGenerationQueue_service_1 = require("../services/imageGenerationQueue.service");
const runtimeCache_service_1 = require("../services/runtimeCache.service");
const trimText = (value, maxLength = 120) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength
        ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
        : normalized;
};
const deriveConversationTitle = (candidates) => {
    const source = candidates.find((value) => typeof value === 'string' && value.trim());
    return source ? trimText(source, 64) : 'New chat';
};
const buildCopyPromptSummary = (input) => {
    const fragments = [
        `Create copy for "${input.productName}"`,
        input.platform ? `for ${input.platform}` : null,
        input.goal ? `with the goal "${input.goal}"` : null,
    ].filter(Boolean);
    const description = input.productDescription
        ? trimText(input.productDescription, 180)
        : null;
    return description
        ? `${fragments.join(' ')}. ${description}`
        : `${fragments.join(' ')}.`;
};
const buildImagePromptSummary = (input) => {
    const fragments = [
        `Generate an image for "${input.productName}"`,
        input.sourceImageUrl ? 'Reference image attached' : null,
        input.backgroundStyle ? `Background: ${input.backgroundStyle}` : null,
    ].filter(Boolean);
    const description = input.productDescription
        ? trimText(input.productDescription, 140)
        : null;
    return description
        ? `${fragments.join(' ')}. ${description}`
        : `${fragments.join(' ')}.`;
};
const buildAssistantCopySummary = (productName) => `Generated a copy pack for ${productName}.`;
const buildAssistantImageSummary = (productName) => `Generated an image for ${productName}.`;
const logWorkspaceCopyFailure = (userId, error) => {
    if (error instanceof gemini_1.ContentGenerationProvidersExhaustedError) {
        console.error('[workspace-copy] All content generation providers failed', {
            userId,
            failures: error.failures,
        });
        return;
    }
    console.error('[workspace-copy] Content generation failed', {
        userId,
        error: error instanceof Error ? error.message : error,
    });
};
const logWorkspaceImageFailure = (userId, error) => {
    if (error instanceof imageGen_1.ImageGenerationProvidersExhaustedError) {
        console.error('[workspace-image] All image generation providers failed', {
            userId,
            failures: error.failures,
        });
        return;
    }
    console.error('[workspace-image] Image generation failed', {
        userId,
        error: error instanceof Error ? error.message : error,
    });
};
const resolveConversationType = (currentType, nextType) => {
    if (!currentType || currentType === nextType) {
        return nextType;
    }
    return 'mixed';
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
const ensureConversation = async (client, userId, conversationId) => {
    if (!conversationId) {
        return null;
    }
    const conversation = await (0, generateWorkspace_1.getGenerateConversationById)(client, userId, conversationId);
    if (!conversation) {
        throw new Error('Conversation not found');
    }
    return conversation;
};
const listWorkspaceConversations = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const conversations = await (0, generateWorkspace_1.listGenerateConversations)(client, req.user.id);
        return res.status(200).json({
            status: 'success',
            data: conversations,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch conversations',
        });
    }
};
exports.listWorkspaceConversations = listWorkspaceConversations;
const createWorkspaceConversation = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const conversation = await (0, generateWorkspace_1.createGenerateConversation)(client, req.user.id, {
            title: trimText(req.body.title?.trim() || 'New chat', 64),
            type: req.body.type ?? 'mixed',
        });
        return res.status(201).json({
            status: 'success',
            message: 'Conversation created successfully',
            data: conversation,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to create conversation',
        });
    }
};
exports.createWorkspaceConversation = createWorkspaceConversation;
const getWorkspaceConversationThread = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const thread = await (0, generateWorkspace_1.getGenerateConversationThread)(client, req.user.id, req.params.id);
        if (!thread) {
            return res.status(404).json({
                status: 'fail',
                message: 'Conversation not found',
            });
        }
        return res.status(200).json({
            status: 'success',
            data: thread,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch conversation thread',
        });
    }
};
exports.getWorkspaceConversationThread = getWorkspaceConversationThread;
const updateWorkspaceConversation = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingConversation = await (0, generateWorkspace_1.getGenerateConversationById)(client, req.user.id, req.params.id);
        if (!existingConversation) {
            return res.status(404).json({
                status: 'fail',
                message: 'Conversation not found',
            });
        }
        const conversation = await (0, generateWorkspace_1.updateGenerateConversation)(client, req.user.id, req.params.id, {
            title: req.body.title !== undefined
                ? trimText(req.body.title, 64)
                : undefined,
            isArchived: req.body.isArchived,
        });
        return res.status(200).json({
            status: 'success',
            message: 'Conversation updated successfully',
            data: conversation,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to update conversation',
        });
    }
};
exports.updateWorkspaceConversation = updateWorkspaceConversation;
const deleteWorkspaceConversation = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingConversation = await (0, generateWorkspace_1.getGenerateConversationById)(client, req.user.id, req.params.id);
        if (!existingConversation) {
            return res.status(404).json({
                status: 'fail',
                message: 'Conversation not found',
            });
        }
        await (0, generateWorkspace_1.softDeleteGenerateConversation)(client, req.user.id, req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Conversation deleted successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to delete conversation',
        });
    }
};
exports.deleteWorkspaceConversation = deleteWorkspaceConversation;
const generateWorkspaceCopy = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const cancellation = (0, requestCancellation_1.createRequestCancellation)(req, res);
    const startedAt = Date.now();
    try {
        console.info('[workspace-copy] Generate content request started', {
            userId: req.user.id,
            productName: req.body.productName,
            conversationId: req.body.conversationId ?? null,
            platform: req.body.platform ?? null,
            goal: req.body.goal ?? null,
        });
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingConversation = await ensureConversation(client, req.user.id, req.body.conversationId);
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
        console.info('[workspace-copy] Queue job resolved', {
            userId: req.user.id,
            jobId,
            provider,
            durationMs: Date.now() - startedAt,
        });
        const hasReelScript = (0, gemini_1.hasMeaningfulReelScript)(contentPack.reelScript);
        const userPromptSummary = buildCopyPromptSummary(generationInput);
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Content generation cancelled by user.');
        const conversation = existingConversation ??
            (await (0, generateWorkspace_1.createGenerateConversation)(client, req.user.id, {
                title: deriveConversationTitle([
                    generationInput.productName,
                    generationInput.productDescription,
                    generationInput.audience,
                ]),
                type: 'copy',
                lastMessagePreview: userPromptSummary,
            }));
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Content generation cancelled by user.');
        const storedContentAsset = await (0, r2Storage_service_1.storeGeneratedContentInR2)({
            userId: req.user.id,
            productName: generationInput.productName,
            payload: (0, generatedAssetPayloads_1.buildGeneratedContentFilePayload)({
                userId: req.user.id,
                provider,
                brandProfileId: brandProfile?.id ?? null,
                conversationId: conversation.id,
                productInput: generationInput,
                contentPack,
                reelScriptIncluded: hasReelScript,
            }),
            signal: cancellation.signal,
        });
        const content = await (0, content_1.saveGeneratedContent)(client, req.user.id, {
            ...generationInput,
            conversationId: conversation.id,
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
        const userMessage = await (0, generateWorkspace_1.createGenerateMessage)(client, req.user.id, {
            conversationId: conversation.id,
            role: 'user',
            messageType: 'text',
            content: userPromptSummary,
            metadata: {
                mode: 'copy',
                input: generationInput,
            },
        });
        const assistantMessage = await (0, generateWorkspace_1.createGenerateMessage)(client, req.user.id, {
            conversationId: conversation.id,
            role: 'assistant',
            messageType: 'copy',
            content: buildAssistantCopySummary(generationInput.productName),
            metadata: {
                mode: 'copy',
                contentId: content.id,
            },
            generationId: content.id,
        });
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Content generation cancelled by user.');
        await (0, generateWorkspace_1.createGeneratedAssets)(client, req.user.id, {
            conversationId: conversation.id,
            messageId: assistantMessage.id,
            assets: [
                {
                    assetType: 'copy',
                    payload: {
                        captions: content.captions,
                        platform: content.platform,
                        goal: content.goal,
                        tone: content.tone,
                        audience: content.audience,
                    },
                },
                {
                    assetType: 'hashtags',
                    payload: {
                        hashtags: content.hashtags,
                    },
                },
                ...(hasReelScript
                    ? [
                        {
                            assetType: 'script',
                            payload: {
                                reelScript: content.reelScript,
                            },
                        },
                    ]
                    : []),
            ],
        });
        await (0, generateWorkspace_1.updateGenerateConversation)(client, req.user.id, conversation.id, {
            lastMessagePreview: userMessage.content,
            type: resolveConversationType(conversation.type, 'copy'),
            isArchived: false,
        });
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Content generation cancelled by user.');
        await (0, content_1.trackContentGenerationUsage)(client, req.user.id, {
            contentId: content.id,
            conversationId: conversation.id,
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
                conversationId: conversation.id,
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
        const thread = await (0, generateWorkspace_1.getGenerateConversationThread)(client, req.user.id, conversation.id);
        console.info('[workspace-copy] Generate content request succeeded', {
            userId: req.user.id,
            conversationId: conversation.id,
            contentId: content.id,
            provider,
            hasReelScript,
            durationMs: Date.now() - startedAt,
        });
        return res.status(200).json({
            status: 'success',
            message: 'Content generated successfully',
            data: thread,
            meta: {
                jobId,
            },
        });
    }
    catch (error) {
        if ((0, requestCancellation_1.isRequestCancelledError)(error)) {
            console.info('[workspace-copy] Generate content request cancelled', {
                userId: req.user?.id ?? 'unknown-user',
                conversationId: req.body.conversationId ?? null,
            });
            return;
        }
        logWorkspaceCopyFailure(req.user?.id ?? 'unknown-user', error);
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
exports.generateWorkspaceCopy = generateWorkspaceCopy;
const generateWorkspaceImage = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const cancellation = (0, requestCancellation_1.createRequestCancellation)(req, res);
    try {
        console.info('[workspace-image] Generate image request started', {
            userId: req.user.id,
            productName: req.body.productName,
            conversationId: req.body.conversationId ?? null,
            contentId: req.body.contentId ?? null,
        });
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingConversation = await ensureConversation(client, req.user.id, req.body.conversationId);
        const brandProfile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, req.user.id);
        const generationInput = {
            ...req.body,
            ...resolveBrandPreference(brandProfile, req.body.useBrandName),
        };
        const runtimePolicy = req.imageRuntimePolicy ?? (0, imageRuntimePolicy_service_1.resolveImageRuntimePolicy)('free', 0);
        const { jobId, result } = await (0, imageGenerationQueue_service_1.enqueueImageGenerationJob)({
            runtimePolicy,
            data: {
                userId: req.user.id,
                brandProfile,
                input: generationInput,
            },
        }, cancellation.signal);
        const userPromptSummary = buildImagePromptSummary(generationInput);
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Image generation cancelled by user.');
        const storedImageAsset = await (0, r2Storage_service_1.storeGeneratedImageInR2)({
            userId: req.user.id,
            productName: generationInput.productName,
            imageUrl: result.imageUrl,
            signal: cancellation.signal,
        });
        const conversation = existingConversation ??
            (await (0, generateWorkspace_1.createGenerateConversation)(client, req.user.id, {
                title: deriveConversationTitle([
                    generationInput.productName,
                    generationInput.productDescription,
                    generationInput.prompt,
                ]),
                type: 'image',
                lastMessagePreview: userPromptSummary,
            }));
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Image generation cancelled by user.');
        const image = await (0, images_1.saveGeneratedImage)(client, req.user.id, {
            contentId: generationInput.contentId ?? null,
            conversationId: conversation.id,
            sourceImageUrl: generationInput.sourceImageUrl ?? null,
            generatedImageUrl: storedImageAsset?.publicUrl ?? result.imageUrl,
            backgroundStyle: generationInput.backgroundStyle ?? null,
            prompt: result.promptUsed,
            storageProvider: storedImageAsset?.provider ?? null,
            storageBucket: storedImageAsset?.bucket ?? null,
            storageObjectKey: storedImageAsset?.objectKey ?? null,
            storagePublicUrl: storedImageAsset?.publicUrl ?? null,
            storageContentType: storedImageAsset?.contentType ?? null,
            storageSizeBytes: storedImageAsset?.sizeBytes ?? null,
        });
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Image generation cancelled by user.');
        const userMessage = await (0, generateWorkspace_1.createGenerateMessage)(client, req.user.id, {
            conversationId: conversation.id,
            role: 'user',
            messageType: 'text',
            content: userPromptSummary,
            metadata: {
                mode: 'image',
                input: generationInput,
            },
        });
        const assistantMessage = await (0, generateWorkspace_1.createGenerateMessage)(client, req.user.id, {
            conversationId: conversation.id,
            role: 'assistant',
            messageType: 'image',
            content: buildAssistantImageSummary(generationInput.productName),
            metadata: {
                mode: 'image',
                provider: result.provider,
                imageId: image.id,
            },
            generationId: image.id,
        });
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Image generation cancelled by user.');
        await (0, generateWorkspace_1.createGeneratedAssets)(client, req.user.id, {
            conversationId: conversation.id,
            messageId: assistantMessage.id,
            assets: [
                {
                    assetType: 'image',
                    payload: {
                        image: {
                            ...image,
                            provider: result.provider,
                        },
                    },
                },
                {
                    assetType: 'prompt',
                    payload: {
                        promptUsed: result.promptUsed,
                        sourceImageUrl: generationInput.sourceImageUrl ?? null,
                        backgroundStyle: generationInput.backgroundStyle ?? null,
                    },
                },
            ],
        });
        await (0, generateWorkspace_1.updateGenerateConversation)(client, req.user.id, conversation.id, {
            lastMessagePreview: userMessage.content,
            type: resolveConversationType(conversation.type, 'image'),
            isArchived: false,
        });
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Image generation cancelled by user.');
        await (0, images_1.trackImageGenerationUsage)(client, req.user.id, {
            imageId: image.id,
            conversationId: conversation.id,
            provider: result.provider,
            brandProfileId: brandProfile?.id ?? null,
            contentId: generationInput.contentId ?? null,
            productName: generationInput.productName,
            productDescription: generationInput.productDescription ?? null,
            backgroundStyle: generationInput.backgroundStyle ?? null,
            prompt: result.promptUsed,
            sourceImageUrl: generationInput.sourceImageUrl ?? null,
            queueTier: runtimePolicy.queueTier,
            speedTier: runtimePolicy.speedTier,
            throttleDelayMs: runtimePolicy.throttleDelayMs,
            dailyUsageCountBeforeRequest: runtimePolicy.usageCount,
        }, `image-generation:${image.id}`);
        await (0, runtimeCache_service_1.invalidateAnalyticsRuntimeCache)(req.user.id);
        res.setHeader('X-PrixmoAI-Queue-Tier', runtimePolicy.queueTier);
        res.setHeader('X-PrixmoAI-Speed-Tier', runtimePolicy.speedTier);
        res.setHeader('X-PrixmoAI-Throttle-Delay-Ms', String(runtimePolicy.throttleDelayMs));
        const thread = await (0, generateWorkspace_1.getGenerateConversationThread)(client, req.user.id, conversation.id);
        console.info('[workspace-image] Generate image request succeeded', {
            userId: req.user.id,
            conversationId: conversation.id,
            imageId: image.id,
            provider: result.provider,
        });
        return res.status(200).json({
            status: 'success',
            message: `Image generated successfully using ${result.provider}`,
            data: thread,
            meta: {
                jobId,
                runtime: runtimePolicy,
            },
        });
    }
    catch (error) {
        if ((0, requestCancellation_1.isRequestCancelledError)(error)) {
            await (0, imageRuntimePolicy_service_1.releaseImageRateLimitReservation)(req.user?.id ?? '', req.imageRateLimitReservation);
            req.imageRateLimitReservation = undefined;
            console.info('[workspace-image] Image generation request cancelled', {
                userId: req.user?.id ?? 'unknown-user',
                conversationId: req.body.conversationId ?? null,
            });
            return;
        }
        logWorkspaceImageFailure(req.user?.id ?? 'unknown-user', error);
        return res.status(502).json({
            status: 'error',
            message: error instanceof imageGen_1.ImageGenerationProvidersExhaustedError
                ? error.message
                : error instanceof Error
                    ? error.message
                    : 'Failed to generate image',
        });
    }
    finally {
        cancellation.cleanup();
    }
};
exports.generateWorkspaceImage = generateWorkspaceImage;
