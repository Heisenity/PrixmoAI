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
    try {
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
        const contentPack = await (0, gemini_1.generateContentPack)(brandProfile, generationInput, {
            includeReelScript,
        });
        const userPromptSummary = buildCopyPromptSummary(generationInput);
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
        const content = await (0, content_1.saveGeneratedContent)(client, req.user.id, {
            ...generationInput,
            conversationId: conversation.id,
            brandProfileId: brandProfile?.id ?? null,
            ...contentPack,
        });
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
                ...(includeReelScript
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
        await (0, content_1.trackContentGenerationUsage)(client, req.user.id, {
            contentId: content.id,
            conversationId: conversation.id,
            provider: 'gemini',
            brandProfileId: brandProfile?.id ?? null,
            platform: generationInput.platform ?? null,
            goal: generationInput.goal ?? null,
            tone: generationInput.tone ?? null,
            audience: generationInput.audience ?? null,
            productName: generationInput.productName,
            productDescription: generationInput.productDescription ?? null,
            keywords: generationInput.keywords ?? [],
            reelScriptIncluded: includeReelScript,
        });
        if (includeReelScript) {
            await (0, content_1.trackReelScriptGenerationUsage)(client, req.user.id, {
                contentId: content.id,
                conversationId: conversation.id,
                provider: 'gemini',
                brandProfileId: brandProfile?.id ?? null,
                platform: generationInput.platform ?? null,
                goal: generationInput.goal ?? null,
                tone: generationInput.tone ?? null,
                audience: generationInput.audience ?? null,
                productName: generationInput.productName,
            });
        }
        const thread = await (0, generateWorkspace_1.getGenerateConversationThread)(client, req.user.id, conversation.id);
        return res.status(200).json({
            status: 'success',
            message: 'Content generated successfully',
            data: thread,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to generate content',
        });
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
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingConversation = await ensureConversation(client, req.user.id, req.body.conversationId);
        const brandProfile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, req.user.id);
        const generationInput = {
            ...req.body,
            ...resolveBrandPreference(brandProfile, req.body.useBrandName),
        };
        const runtimePolicy = req.imageRuntimePolicy ?? (0, imageRuntimePolicy_service_1.resolveImageRuntimePolicy)('free', 0);
        const result = await (0, imageRuntimePolicy_service_1.enqueueImageGeneration)(runtimePolicy, () => (0, imageGen_1.generateProductImage)(brandProfile, generationInput));
        const userPromptSummary = buildImagePromptSummary(generationInput);
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
        const image = await (0, images_1.saveGeneratedImage)(client, req.user.id, {
            contentId: generationInput.contentId ?? null,
            conversationId: conversation.id,
            sourceImageUrl: generationInput.sourceImageUrl ?? null,
            generatedImageUrl: result.imageUrl,
            backgroundStyle: generationInput.backgroundStyle ?? null,
            prompt: result.promptUsed,
        });
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
        });
        res.setHeader('X-PrixmoAI-Queue-Tier', runtimePolicy.queueTier);
        res.setHeader('X-PrixmoAI-Speed-Tier', runtimePolicy.speedTier);
        res.setHeader('X-PrixmoAI-Throttle-Delay-Ms', String(runtimePolicy.throttleDelayMs));
        const thread = await (0, generateWorkspace_1.getGenerateConversationThread)(client, req.user.id, conversation.id);
        return res.status(200).json({
            status: 'success',
            message: `Image generated successfully using ${result.provider}`,
            data: thread,
            meta: {
                runtime: runtimePolicy,
            },
        });
    }
    catch (error) {
        return res.status(502).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to generate image',
        });
    }
};
exports.generateWorkspaceImage = generateWorkspaceImage;
