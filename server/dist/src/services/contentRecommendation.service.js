"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendCaptionForScheduling = void 0;
const zod_1 = require("zod");
const gemini_1 = require("../ai/gemini");
const brandMemorySignals_1 = require("../db/queries/brandMemorySignals");
const brandMemory_service_1 = require("./brandMemory.service");
const recommendationSchema = zod_1.z.object({
    selectedVariantIndex: zod_1.z.number().int().min(1).max(12),
    recommendedCaption: zod_1.z.string().trim().min(16).max(2200),
    reasoning: zod_1.z.string().trim().min(8).max(600),
    note: zod_1.z.string().trim().min(8).max(220),
    supportingMemoryIds: zod_1.z.array(zod_1.z.string().uuid()).max(5).default([]),
});
const clampText = (value, maxChars = 240) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) {
        return normalized;
    }
    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};
const formatList = (values) => values && values.length > 0 ? values.join(', ') : 'not provided';
const normalizePlatformKey = (value) => {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : null;
};
const lexicalOverlapScore = (queryText, candidateText) => {
    const queryTokens = Array.from(new Set(queryText
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)));
    if (!queryTokens.length) {
        return 0;
    }
    const candidateTokens = new Set(candidateText
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3));
    const hits = queryTokens.filter((token) => candidateTokens.has(token)).length;
    return hits / queryTokens.length;
};
const buildCaptionBody = (caption) => [caption.hook, caption.mainCopy, caption.cta].filter(Boolean).join('\n\n').trim();
const buildPlatformMemoryContext = (platform, retrievedMemories) => {
    const normalizedPlatform = normalizePlatformKey(platform);
    if (!normalizedPlatform) {
        return [];
    }
    return retrievedMemories
        .filter((memory) => {
        const memoryPlatform = typeof memory.metadata.platform === 'string'
            ? normalizePlatformKey(memory.metadata.platform)
            : typeof memory.metadata.platformKey === 'string'
                ? normalizePlatformKey(memory.metadata.platformKey)
                : null;
        if (memoryPlatform === normalizedPlatform) {
            return true;
        }
        return (memory.memoryType === 'platform-performance-insight' &&
            memory.contentText.toLowerCase().includes(normalizedPlatform));
    })
        .slice(0, 4)
        .map((memory) => memory.contentText);
};
const buildRecommendationPrompt = (input) => (() => {
    const platformMemoryContext = buildPlatformMemoryContext(input.content.platform, input.retrievedMemories);
    return [
        'You are selecting the single best caption variation to schedule for a brand.',
        'Choose the option most likely to perform for the user based on their goal, tone, audience, keywords, brand memory, and platform analytics.',
        'Treat the selected platform as a primary decision signal.',
        'Prefer the variation that best fits the platform the user selected while generating the content, especially when same-platform memories or analytics cues are available.',
        'Do not choose randomly.',
        'Prefer the option with the strongest hook, clearest CTA, best audience fit, and best platform fit.',
        'You may lightly polish the winning caption, but keep it faithful to the chosen variation and do not invent unsupported product claims.',
        'Return JSON only.',
        '',
        `Brand name: ${input.brandProfile?.brandName ?? 'not provided'}`,
        `Primary industry: ${input.brandProfile?.primaryIndustry ?? input.brandProfile?.industry ?? 'not provided'}`,
        `Secondary industries: ${formatList(input.brandProfile?.secondaryIndustries)}`,
        `Brand voice: ${input.brandProfile?.brandVoice ?? 'not provided'}`,
        `Target audience: ${input.brandProfile?.targetAudience ?? input.content.audience ?? 'not provided'}`,
        `Platform: ${input.content.platform ?? 'not provided'}`,
        `Goal: ${input.content.goal ?? 'not provided'}`,
        `Tone: ${input.content.tone ?? input.brandProfile?.brandVoice ?? 'not provided'}`,
        `Product name: ${input.content.productName}`,
        `Product description: ${input.content.productDescription ?? 'not provided'}`,
        `Keywords: ${formatList(input.content.keywords)}`,
        `Analytics context: ${JSON.stringify(input.analyticsContext)}`,
        `Platform-specific memory cues: ${platformMemoryContext.length > 0
            ? platformMemoryContext.join(' | ')
            : 'not available'}`,
        '',
        'Caption candidates:',
        ...input.captions.map((caption, index) => [
            `Variant ${index + 1}:`,
            `- Hook: ${caption.hook}`,
            `- Main copy: ${caption.mainCopy}`,
            `- Short caption: ${caption.shortCaption}`,
            `- CTA: ${caption.cta}`,
        ].join('\n')),
        '',
        'Relevant brand memories:',
        ...input.retrievedMemories.slice(0, 6).map((memory, index) => [
            `Memory ${index + 1}:`,
            `- id: ${memory.id}`,
            `- type: ${memory.memoryType}`,
            `- score: ${(memory.compositeScore ?? memory.hybridScore ?? memory.similarity ?? 0).toFixed(2)}`,
            `- content: ${memory.contentText}`,
        ].join('\n')),
        '',
        'Return JSON with:',
        '- selectedVariantIndex: the 1-based winning variant index',
        '- recommendedCaption: the final caption text to prefill in scheduler',
        '- reasoning: concise internal explanation for why it is strongest',
        '- note: a short friendly note for the scheduler UI explaining why PrixmoAI recommended it',
        '- supportingMemoryIds: up to 5 ids from the relevant memories list that helped this decision',
    ].join('\n');
})();
const buildFallbackRecommendation = (input) => {
    const platformMemoryContext = buildPlatformMemoryContext(input.content.platform, input.retrievedMemories).join(' ');
    const queryText = [
        input.content.productName,
        input.content.productDescription ?? '',
        input.content.goal ?? '',
        input.content.platform ?? '',
        input.content.tone ?? '',
        input.content.audience ?? '',
        ...(input.content.keywords ?? []),
        platformMemoryContext,
        ...input.retrievedMemories.map((memory) => memory.contentText).slice(0, 3),
    ]
        .join(' ')
        .trim();
    const scoredCandidates = input.captions.map((caption, index) => {
        const captionText = buildCaptionBody(caption);
        const lexicalScore = lexicalOverlapScore(queryText, captionText);
        const hookBoost = lexicalOverlapScore(`${input.content.goal ?? ''} ${input.content.platform ?? ''}`, caption.hook);
        const ctaBoost = lexicalOverlapScore(`${input.content.goal ?? ''} ${input.content.keywords?.join(' ') ?? ''}`, caption.cta);
        const platformMemoryBoost = lexicalOverlapScore(platformMemoryContext, captionText);
        return {
            index,
            captionText,
            score: lexicalScore * 0.48 +
                hookBoost * 0.2 +
                ctaBoost * 0.12 +
                platformMemoryBoost * 0.2,
        };
    });
    const bestCandidate = scoredCandidates.sort((left, right) => right.score - left.score)[0] ??
        {
            index: 0,
            captionText: buildCaptionBody(input.captions[0]),
            score: 0,
        };
    return {
        recommendedCaption: bestCandidate.captionText,
        selectedVariantIndex: bestCandidate.index + 1,
        sourceKey: `caption-${bestCandidate.index + 1}`,
        reasoning: 'This variation best matched the current product brief, goal, and the strongest reusable brand signals available.',
        note: 'PrixmoAI picked this caption because it lines up best with your current goal, brand voice, and past performance signals.',
        strategy: 'fallback',
        provider: 'fallback',
        supportingMemoryIds: input.retrievedMemories.slice(0, 3).map((memory) => memory.id),
        observabilityLogId: null,
    };
};
const recommendCaptionForScheduling = async (client, input) => {
    if (!input.content.captions.length) {
        throw new Error('There are no generated caption variations available to recommend.');
    }
    console.info('[content-recommendation] schedule caption recommendation started', {
        userId: input.userId,
        contentId: input.content.id,
        platform: input.content.platform,
        goal: input.content.goal,
        tone: input.content.tone,
        audience: input.content.audience,
        captionVariants: input.content.captions.length,
    });
    const retrieval = await (0, brandMemory_service_1.getRelevantMemoriesForSchedulingRecommendation)(client, input.userId, input.brandProfile, {
        brandName: input.brandProfile?.brandName ?? null,
        useBrandName: true,
        productName: input.content.productName,
        productDescription: input.content.productDescription ?? null,
        platform: input.content.platform ?? null,
        goal: input.content.goal ?? null,
        tone: input.content.tone ?? null,
        audience: input.content.audience ?? null,
        keywords: input.content.keywords ?? [],
    });
    const matches = retrieval.matches;
    const prompt = buildRecommendationPrompt({
        brandProfile: input.brandProfile,
        content: input.content,
        captions: input.content.captions,
        retrievedMemories: matches,
        analyticsContext: retrieval.telemetry.analyticsContext,
    });
    try {
        const result = await (0, gemini_1.generateStructuredDataWithGroqFallback)(prompt, recommendationSchema, 'memory-rerank');
        const selectedVariantIndex = Math.min(Math.max(result.data.selectedVariantIndex, 1), input.content.captions.length);
        const sourceKey = `caption-${selectedVariantIndex}`;
        const observabilityLog = await (0, brandMemorySignals_1.createBrandMemoryGenerationLog)(client, {
            userId: input.userId,
            brandProfileId: input.brandProfile?.id ?? null,
            taskType: 'scheduler-caption-recommendation',
            requestContext: input.requestContext ?? 'scheduler',
            provider: result.provider,
            rerankProvider: retrieval.telemetry.rerankProvider,
            fallbackUsed: retrieval.telemetry.fallbackUsed,
            retrievalStrategy: retrieval.telemetry.retrievalStrategy,
            queryText: retrieval.telemetry.queryText,
            selectedPlatform: input.content.platform ?? null,
            selectedGoal: input.content.goal ?? null,
            retrievedMemories: retrieval.telemetry.candidatePool,
            selectedMemories: [
                ...retrieval.telemetry.selectedMemories,
                {
                    selectedVariantIndex,
                    sourceKey,
                    recommendedCaption: clampText(result.data.recommendedCaption, 400),
                },
            ],
            analyticsContext: retrieval.telemetry.analyticsContext,
            evaluationSummary: {
                selectedVariantIndex,
                candidateCount: input.content.captions.length,
                selectedMemoryCount: matches.length,
            },
            metadata: {
                productName: input.content.productName,
            },
        }).catch((error) => {
            console.warn('[content-recommendation] failed to persist schedule recommendation log', {
                userId: input.userId,
                contentId: input.content.id,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        });
        console.info('[content-recommendation] schedule caption recommendation succeeded', {
            userId: input.userId,
            contentId: input.content.id,
            provider: result.provider,
            strategy: 'ai',
            selectedVariantIndex,
            observabilityLogId: observabilityLog?.id ?? null,
        });
        return {
            recommendedCaption: result.data.recommendedCaption,
            selectedVariantIndex,
            sourceKey,
            reasoning: result.data.reasoning,
            note: result.data.note,
            strategy: 'ai',
            provider: result.provider,
            supportingMemoryIds: result.data.supportingMemoryIds,
            observabilityLogId: observabilityLog?.id ?? null,
        };
    }
    catch (error) {
        const fallbackRecommendation = buildFallbackRecommendation({
            content: input.content,
            captions: input.content.captions,
            retrievedMemories: matches,
        });
        const observabilityLog = await (0, brandMemorySignals_1.createBrandMemoryGenerationLog)(client, {
            userId: input.userId,
            brandProfileId: input.brandProfile?.id ?? null,
            taskType: 'scheduler-caption-recommendation',
            requestContext: input.requestContext ?? 'scheduler',
            provider: 'fallback',
            rerankProvider: retrieval.telemetry.rerankProvider,
            fallbackUsed: true,
            retrievalStrategy: retrieval.telemetry.retrievalStrategy,
            queryText: retrieval.telemetry.queryText,
            selectedPlatform: input.content.platform ?? null,
            selectedGoal: input.content.goal ?? null,
            retrievedMemories: retrieval.telemetry.candidatePool,
            selectedMemories: [
                ...retrieval.telemetry.selectedMemories,
                {
                    selectedVariantIndex: fallbackRecommendation.selectedVariantIndex,
                    sourceKey: fallbackRecommendation.sourceKey,
                    recommendedCaption: clampText(fallbackRecommendation.recommendedCaption, 400),
                },
            ],
            analyticsContext: retrieval.telemetry.analyticsContext,
            evaluationSummary: {
                selectedVariantIndex: fallbackRecommendation.selectedVariantIndex,
                candidateCount: input.content.captions.length,
                fallbackReason: error instanceof Error ? error.message : String(error),
            },
            metadata: {
                productName: input.content.productName,
            },
        }).catch((logError) => {
            console.warn('[content-recommendation] failed to persist fallback schedule recommendation log', {
                userId: input.userId,
                contentId: input.content.id,
                error: logError instanceof Error ? logError.message : String(logError),
            });
            return null;
        });
        console.warn('[content-recommendation] schedule caption recommendation fell back', {
            userId: input.userId,
            contentId: input.content.id,
            reason: error instanceof Error ? error.message : String(error),
            selectedVariantIndex: fallbackRecommendation.selectedVariantIndex,
            observabilityLogId: observabilityLog?.id ?? null,
        });
        return {
            ...fallbackRecommendation,
            observabilityLogId: observabilityLog?.id ?? null,
        };
    }
};
exports.recommendCaptionForScheduling = recommendCaptionForScheduling;
