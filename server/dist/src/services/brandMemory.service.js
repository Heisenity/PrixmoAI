"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRelevantMemoriesForSchedulingRecommendation = exports.recordBrandMemoryFeedback = exports.getRelevantMemoriesForBrandDescription = exports.getRelevantMemoriesForImageGeneration = exports.getRelevantMemoriesForContentGeneration = exports.syncConnectedAccountIntelligenceSemanticMemory = exports.syncAnalyticsLearningSemanticMemory = exports.syncGeneratedImageSemanticMemory = exports.syncGeneratedContentSemanticMemory = exports.syncBrandProfileSemanticMemory = exports.formatSemanticReferenceChunks = void 0;
const constants_1 = require("../config/constants");
const gemini_1 = require("../ai/gemini");
const brandMemoryEmbeddings_1 = require("../db/queries/brandMemoryEmbeddings");
const brandMemorySignals_1 = require("../db/queries/brandMemorySignals");
const analytics_1 = require("../db/queries/analytics");
const socialAccountIntelligence_1 = require("../db/queries/socialAccountIntelligence");
const socialAccounts_1 = require("../db/queries/socialAccounts");
const observability_1 = require("../lib/observability");
const zod_1 = require("zod");
const GEMINI_EMBEDDING_API_URL = (model, apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
const PLATFORM_MEMORY_STALE_MS = 6 * 60 * 60 * 1000;
const ANALYTICS_MEMORY_LOOKBACK_DAYS = 120;
const BRAND_MEMORY_RECENCY_HALF_LIFE_DAYS = {
    'brand-profile-summary': 180,
    'brand-description': 150,
    'brand-voice-note': 160,
    'platform-performance-insight': 45,
    'connected-account-intelligence': 30,
    'user-generation-prompt': 60,
    'generated-caption': 35,
    'generated-hashtags': 28,
    'generated-reel-script': 40,
    'image-prompt': 45,
};
const BRAND_MEMORY_TASK_POLICY = {
    'caption-generation': {
        default: 0.56,
        'brand-profile-summary': 0.9,
        'brand-description': 0.88,
        'brand-voice-note': 1,
        'platform-performance-insight': 0.96,
        'connected-account-intelligence': 1,
        'generated-caption': 1,
        'generated-hashtags': 0.68,
        'generated-reel-script': 0.72,
        'user-generation-prompt': 0.82,
        'image-prompt': 0.52,
    },
    'hashtag-generation': {
        default: 0.48,
        'brand-profile-summary': 0.76,
        'brand-description': 0.62,
        'brand-voice-note': 0.66,
        'platform-performance-insight': 1,
        'connected-account-intelligence': 0.94,
        'generated-caption': 0.78,
        'generated-hashtags': 1,
        'generated-reel-script': 0.52,
        'user-generation-prompt': 0.84,
        'image-prompt': 0.4,
    },
    'reel-script-generation': {
        default: 0.54,
        'brand-profile-summary': 0.84,
        'brand-description': 0.72,
        'brand-voice-note': 0.92,
        'platform-performance-insight': 0.92,
        'connected-account-intelligence': 0.96,
        'generated-caption': 0.72,
        'generated-hashtags': 0.48,
        'generated-reel-script': 1,
        'user-generation-prompt': 0.86,
        'image-prompt': 0.56,
    },
    'image-generation': {
        default: 0.5,
        'brand-profile-summary': 0.78,
        'brand-description': 0.76,
        'brand-voice-note': 0.72,
        'platform-performance-insight': 0.74,
        'connected-account-intelligence': 1,
        'generated-caption': 0.58,
        'generated-hashtags': 0.34,
        'generated-reel-script': 0.44,
        'user-generation-prompt': 0.82,
        'image-prompt': 1,
    },
    'brand-description': {
        default: 0.5,
        'brand-profile-summary': 1,
        'brand-description': 1,
        'brand-voice-note': 0.98,
        'platform-performance-insight': 0.72,
        'connected-account-intelligence': 0.78,
        'generated-caption': 0.64,
        'generated-hashtags': 0.3,
        'generated-reel-script': 0.5,
        'user-generation-prompt': 0.76,
        'image-prompt': 0.3,
    },
    'scheduler-caption-recommendation': {
        default: 0.52,
        'brand-profile-summary': 0.94,
        'brand-description': 0.88,
        'brand-voice-note': 1,
        'platform-performance-insight': 1,
        'connected-account-intelligence': 1,
        'generated-caption': 1,
        'generated-hashtags': 0.62,
        'generated-reel-script': 0.76,
        'user-generation-prompt': 0.9,
        'image-prompt': 0.44,
    },
};
const clampText = (value, maxChars = 2200) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) {
        return normalized;
    }
    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};
const formatList = (values) => values && values.length > 0 ? values.join(', ') : 'not provided';
const hasEnoughText = (value) => value.trim().length >= 16;
const SEMANTIC_CHUNK_MAX_CHARS = 520;
const SEMANTIC_CHUNK_MIN_CHARS = 140;
const SEMANTIC_CHUNK_OVERLAP_SENTENCES = 1;
const splitParagraphs = (value) => value
    .split(/\n\s*\n+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
const splitSentences = (value) => value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
const detectSemanticChunkLabel = (text) => {
    const normalized = text.toLowerCase();
    if (/\b(tone|voice|style|messaging|personality|warm|bold|professional|playful)\b/.test(normalized)) {
        return 'tone';
    }
    if (/\b(audience|customer|buyer|teams|founder|marketer|developer|businesses|professionals|users)\b/.test(normalized)) {
        return 'audience';
    }
    if (/\b(product|service|solution|offer|platform|tool|helps|provides|built for|use case|value)\b/.test(normalized)) {
        return 'offer';
    }
    if (/\b(industry|market|category|niche|brand|positioning|sector)\b/.test(normalized)) {
        return 'positioning';
    }
    if (/\b(post|bio|caption|instagram|facebook|linkedin|reddit|x|twitter|competitor|social)\b/.test(normalized)) {
        return 'social';
    }
    if (/\b(result|proof|engagement|conversion|click|share|save|performance|analytics)\b/.test(normalized)) {
        return 'performance';
    }
    return 'general';
};
const buildSemanticTextChunks = (value, options) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return [];
    }
    const maxChars = options?.maxChars ?? SEMANTIC_CHUNK_MAX_CHARS;
    const minChars = options?.minChars ?? SEMANTIC_CHUNK_MIN_CHARS;
    const maxChunks = options?.maxChunks ?? 6;
    const paragraphs = splitParagraphs(value);
    const fragments = paragraphs.length > 1
        ? paragraphs.flatMap((paragraph) => splitSentences(paragraph))
        : splitSentences(normalized);
    if (!fragments.length) {
        return [];
    }
    const chunks = [];
    let currentSentences = [];
    const flushChunk = () => {
        if (!currentSentences.length) {
            return;
        }
        const chunkText = currentSentences.join(' ').replace(/\s+/g, ' ').trim();
        if (!chunkText) {
            currentSentences = [];
            return;
        }
        chunks.push({
            label: detectSemanticChunkLabel(chunkText),
            text: clampText(chunkText, Math.max(maxChars, 1800)),
        });
        currentSentences = currentSentences.slice(Math.max(0, currentSentences.length - SEMANTIC_CHUNK_OVERLAP_SENTENCES));
    };
    for (const fragment of fragments) {
        const candidate = [...currentSentences, fragment].join(' ').trim();
        if (candidate.length > maxChars && currentSentences.length > 0) {
            flushChunk();
        }
        currentSentences.push(fragment);
        const currentLength = currentSentences.join(' ').length;
        if (currentLength >= minChars && currentLength >= maxChars * 0.85) {
            flushChunk();
        }
    }
    flushChunk();
    const merged = chunks.reduce((accumulator, chunk) => {
        const previous = accumulator[accumulator.length - 1];
        if (previous &&
            previous.label === chunk.label &&
            `${previous.text} ${chunk.text}`.length <= maxChars * 1.25) {
            previous.text = clampText(`${previous.text} ${chunk.text}`, maxChars);
            return accumulator;
        }
        accumulator.push(chunk);
        return accumulator;
    }, []);
    return merged.slice(0, maxChunks);
};
const shouldSemanticChunkMemoryEntry = (entry) => entry.contentText.length >= 420 &&
    [
        'brand-description',
        'brand-profile-summary',
        'brand-voice-note',
        'platform-performance-insight',
        'connected-account-intelligence',
        'user-generation-prompt',
        'generated-caption',
        'generated-reel-script',
    ].includes(entry.memoryType);
const expandMemoryEntryForIndexing = (entry) => {
    if (!shouldSemanticChunkMemoryEntry(entry)) {
        return [
            {
                ...entry,
                contentText: clampText(entry.contentText),
            },
        ];
    }
    const chunks = buildSemanticTextChunks(entry.contentText);
    if (chunks.length <= 1) {
        return [
            {
                ...entry,
                contentText: clampText(entry.contentText),
            },
        ];
    }
    return chunks.map((chunk, index) => ({
        ...entry,
        sourceKey: `${entry.sourceKey}::chunk-${index + 1}`,
        contentText: chunk.text,
        metadata: {
            ...(entry.metadata ?? {}),
            semanticChunk: true,
            semanticChunkIndex: index + 1,
            semanticChunkLabel: chunk.label,
            semanticChunkCount: chunks.length,
            semanticChunkSourceKey: entry.sourceKey,
        },
    }));
};
const formatSemanticReferenceChunks = (label, value, maxChunks = 4) => {
    if (!value?.trim()) {
        return [];
    }
    const chunks = buildSemanticTextChunks(value, {
        maxChars: 420,
        minChars: 120,
        maxChunks,
    });
    if (!chunks.length) {
        return [`- ${label}: ${clampText(value, 320)}`];
    }
    return chunks.map((chunk, index) => `- ${label} chunk ${index + 1} (${chunk.label}): ${clampText(chunk.text, 320)}`);
};
exports.formatSemanticReferenceChunks = formatSemanticReferenceChunks;
const normalizeTokens = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
const uniqueTokens = (value) => Array.from(new Set(normalizeTokens(value)));
const lexicalOverlapScore = (queryText, candidateText) => {
    const queryTokens = uniqueTokens(queryText);
    if (!queryTokens.length) {
        return 0;
    }
    const candidateTokens = new Set(uniqueTokens(candidateText));
    const hitCount = queryTokens.filter((token) => candidateTokens.has(token)).length;
    return hitCount / queryTokens.length;
};
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const normalizePlatformKey = (value) => {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : null;
};
const safeToNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};
const ratioFromPercentLikeValue = (value) => {
    const numericValue = safeToNumber(value);
    if (numericValue <= 0) {
        return 0;
    }
    return numericValue > 1 ? numericValue / 100 : numericValue;
};
const toStringArray = (value) => Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
const incrementCounter = (map, value) => {
    const normalized = value?.trim();
    if (!normalized) {
        return;
    }
    map.set(normalized, (map.get(normalized) ?? 0) + 1);
};
const topListFromMap = (map, limit = 3) => [...map.entries()]
    .sort((left, right) => {
    if (right[1] !== left[1]) {
        return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
})
    .slice(0, limit)
    .map(([value]) => value);
const daysSince = (value) => {
    if (!value) {
        return 365;
    }
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
        return 365;
    }
    return Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));
};
const getFreshnessScore = (memoryType, createdAt, lastFeedbackAt) => {
    const halfLifeDays = BRAND_MEMORY_RECENCY_HALF_LIFE_DAYS[memoryType] ??
        BRAND_MEMORY_RECENCY_HALF_LIFE_DAYS['generated-caption'];
    const effectiveTimestamp = lastFeedbackAt ?? createdAt ?? null;
    const ageDays = daysSince(effectiveTimestamp);
    return clamp01(Math.max(0.18, Math.exp((-1 * ageDays) / Math.max(halfLifeDays, 1))));
};
const getTaskPolicyScore = (task, memoryType) => {
    const taskPolicy = BRAND_MEMORY_TASK_POLICY[task];
    return clamp01(taskPolicy[memoryType] ??
        taskPolicy.default ??
        0.5);
};
const getPlatformAlignmentBoost = (selectedPlatform, match) => {
    const normalizedRequestedPlatform = normalizePlatformKey(selectedPlatform);
    const memoryPlatform = normalizePlatformKey(typeof match.metadata.platform === 'string'
        ? match.metadata.platform
        : typeof match.metadata.platformKey === 'string'
            ? match.metadata.platformKey
            : null);
    if (!normalizedRequestedPlatform || !memoryPlatform) {
        return 0;
    }
    return memoryPlatform === normalizedRequestedPlatform ? 0.08 : -0.03;
};
const isMemoryCompatibleWithPlatform = (selectedPlatform, match) => {
    if (match.memoryType !== 'connected-account-intelligence') {
        return true;
    }
    const normalizedRequestedPlatform = normalizePlatformKey(selectedPlatform);
    const memoryPlatform = normalizePlatformKey(typeof match.metadata.platform === 'string'
        ? match.metadata.platform
        : null);
    return Boolean(normalizedRequestedPlatform &&
        memoryPlatform &&
        normalizedRequestedPlatform === memoryPlatform);
};
const serializeMemoryForLog = (match) => ({
    id: match.id,
    sourceTable: match.sourceTable,
    sourceId: match.sourceId,
    sourceKey: match.sourceKey,
    memoryType: match.memoryType,
    similarity: Number((match.similarity ?? 0).toFixed(4)),
    vectorSimilarity: match.vectorSimilarity !== undefined
        ? Number(match.vectorSimilarity.toFixed(4))
        : null,
    keywordScore: match.keywordScore !== undefined ? Number(match.keywordScore.toFixed(4)) : null,
    hybridScore: match.hybridScore !== undefined ? Number(match.hybridScore.toFixed(4)) : null,
    qualityScore: match.qualityScore !== undefined ? Number(match.qualityScore.toFixed(4)) : null,
    promotionScore: match.promotionScore !== undefined
        ? Number(match.promotionScore.toFixed(4))
        : null,
    performanceScore: match.performanceScore !== undefined
        ? Number(match.performanceScore.toFixed(4))
        : null,
    freshnessScore: match.freshnessScore !== undefined
        ? Number(match.freshnessScore.toFixed(4))
        : null,
    taskPolicyScore: match.taskPolicyScore !== undefined
        ? Number(match.taskPolicyScore.toFixed(4))
        : null,
    compositeScore: match.compositeScore !== undefined
        ? Number(match.compositeScore.toFixed(4))
        : null,
    preview: clampText(match.contentText, 220),
});
const memoryRerankResponseSchema = zod_1.z.object({
    rankedIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(constants_1.BRAND_MEMORY_RERANK_CANDIDATE_COUNT),
});
const readEmbeddingValues = (payload) => {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Embedding provider returned an empty response');
    }
    const record = payload;
    const directEmbedding = record.embedding;
    const firstEmbedding = Array.isArray(record.embeddings)
        ? record.embeddings[0]
        : null;
    const values = directEmbedding &&
        typeof directEmbedding === 'object' &&
        Array.isArray(directEmbedding.values)
        ? directEmbedding.values
        : firstEmbedding &&
            typeof firstEmbedding === 'object' &&
            Array.isArray(firstEmbedding.values)
            ? firstEmbedding.values
            : null;
    if (!values) {
        throw new Error('Embedding provider did not return vector values');
    }
    const embedding = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (embedding.length !== constants_1.GEMINI_EMBEDDING_DIMENSION) {
        throw new Error(`Embedding dimension mismatch. Expected ${constants_1.GEMINI_EMBEDDING_DIMENSION}, received ${embedding.length}.`);
    }
    return embedding;
};
const generateEmbedding = async (text) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured for brand memory embeddings');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, constants_1.GEMINI_EMBEDDING_TIMEOUT_MS);
    try {
        const response = await fetch(GEMINI_EMBEDDING_API_URL(constants_1.DEFAULT_GEMINI_EMBEDDING_MODEL, apiKey), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: {
                    parts: [
                        {
                            text,
                        },
                    ],
                },
                output_dimensionality: constants_1.GEMINI_EMBEDDING_DIMENSION,
            }),
            signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null));
        if (!response.ok) {
            throw new Error(`Embedding request failed (${response.status}): ${payload?.error?.message ??
                response.statusText}`);
        }
        return readEmbeddingValues(payload);
    }
    catch (error) {
        if (error instanceof Error &&
            error.name === 'AbortError') {
            throw new Error(`Embedding request timed out after ${constants_1.GEMINI_EMBEDDING_TIMEOUT_MS}ms`);
        }
        throw error instanceof Error
            ? error
            : new Error('Failed to generate brand memory embedding');
    }
    finally {
        clearTimeout(timeout);
    }
};
const buildBrandProfileMemoryEntries = (profile) => {
    const entries = [];
    const secondaryIndustries = formatList(profile.secondaryIndustries);
    const summary = clampText([
        `Brand name: ${profile.brandName ?? 'not provided'}.`,
        `Primary industry: ${profile.primaryIndustry ?? profile.industry ?? 'not provided'}.`,
        `Secondary industries: ${secondaryIndustries}.`,
        `Target audience: ${profile.targetAudience ?? 'not provided'}.`,
        `Brand voice: ${profile.brandVoice ?? 'not provided'}.`,
        `Website: ${profile.websiteUrl ?? 'not provided'}.`,
        `Country: ${profile.country ?? 'not provided'}.`,
        `Language: ${profile.language ?? 'not provided'}.`,
    ].join(' '));
    if (hasEnoughText(summary)) {
        entries.push({
            brandProfileId: profile.id,
            sourceTable: 'brand_profiles',
            sourceId: profile.id,
            sourceKey: 'profile-summary',
            memoryType: 'brand-profile-summary',
            contentText: summary,
            metadata: {
                primaryIndustry: profile.primaryIndustry ?? null,
                secondaryIndustries: profile.secondaryIndustries,
                targetAudience: profile.targetAudience ?? null,
                brandVoice: profile.brandVoice ?? null,
            },
        });
    }
    if (profile.description && hasEnoughText(profile.description)) {
        entries.push({
            brandProfileId: profile.id,
            sourceTable: 'brand_profiles',
            sourceId: profile.id,
            sourceKey: 'brand-description',
            memoryType: 'brand-description',
            contentText: clampText(`Brand description for ${profile.brandName ?? 'this brand'}: ${profile.description}`),
            metadata: {
                brandName: profile.brandName ?? null,
            },
        });
    }
    if (profile.brandVoice && hasEnoughText(profile.brandVoice)) {
        entries.push({
            brandProfileId: profile.id,
            sourceTable: 'brand_profiles',
            sourceId: profile.id,
            sourceKey: 'brand-voice',
            memoryType: 'brand-voice-note',
            contentText: clampText(`Brand voice guidance: ${profile.brandVoice}. Audience: ${profile.targetAudience ?? 'not provided'}.`),
            metadata: {
                targetAudience: profile.targetAudience ?? null,
            },
        });
    }
    return entries;
};
const buildGeneratedContentMemoryEntries = (content) => {
    const entries = [];
    const promptBrief = clampText([
        `Generation brief for ${content.productName}.`,
        `Description: ${content.productDescription ?? 'not provided'}.`,
        `Platform: ${content.platform ?? 'not provided'}.`,
        `Goal: ${content.goal ?? 'not provided'}.`,
        `Tone: ${content.tone ?? 'not provided'}.`,
        `Audience: ${content.audience ?? 'not provided'}.`,
        `Keywords: ${formatList(content.keywords)}.`,
    ].join(' '));
    if (hasEnoughText(promptBrief)) {
        entries.push({
            brandProfileId: content.brandProfileId,
            sourceTable: 'generated_content',
            sourceId: content.id,
            sourceKey: 'generation-brief',
            memoryType: 'user-generation-prompt',
            contentText: promptBrief,
            metadata: {
                platform: content.platform ?? null,
                goal: content.goal ?? null,
                tone: content.tone ?? null,
                audience: content.audience ?? null,
            },
        });
    }
    content.captions.forEach((caption, index) => {
        const captionText = clampText([
            `Caption variant ${index + 1} for ${content.productName}.`,
            `Hook: ${caption.hook}.`,
            `Main copy: ${caption.mainCopy}.`,
            `Short caption: ${caption.shortCaption}.`,
            `CTA: ${caption.cta}.`,
        ].join(' '));
        if (!hasEnoughText(captionText)) {
            return;
        }
        entries.push({
            brandProfileId: content.brandProfileId,
            sourceTable: 'generated_content',
            sourceId: content.id,
            sourceKey: `caption-${index + 1}`,
            memoryType: 'generated-caption',
            contentText: captionText,
            metadata: {
                platform: content.platform ?? null,
                goal: content.goal ?? null,
            },
        });
    });
    if (content.hashtags.length > 0) {
        entries.push({
            brandProfileId: content.brandProfileId,
            sourceTable: 'generated_content',
            sourceId: content.id,
            sourceKey: 'hashtags',
            memoryType: 'generated-hashtags',
            contentText: clampText(`Hashtags for ${content.productName}: ${content.hashtags.join(' ')}`),
            metadata: {
                platform: content.platform ?? null,
            },
        });
    }
    const reelScriptText = clampText([
        `Reel script for ${content.productName}.`,
        `Hook: ${content.reelScript.hook}.`,
        `Body: ${content.reelScript.body}.`,
        `CTA: ${content.reelScript.cta}.`,
    ].join(' '));
    if (hasEnoughText(content.reelScript.hook) ||
        hasEnoughText(content.reelScript.body) ||
        hasEnoughText(content.reelScript.cta)) {
        entries.push({
            brandProfileId: content.brandProfileId,
            sourceTable: 'generated_content',
            sourceId: content.id,
            sourceKey: 'reel-script',
            memoryType: 'generated-reel-script',
            contentText: reelScriptText,
            metadata: {
                platform: content.platform ?? null,
            },
        });
    }
    return entries;
};
const buildGeneratedImageMemoryEntries = (image, context = {}) => {
    const promptText = clampText([
        `Image prompt for ${context.productName ?? 'a product image'}.`,
        `Prompt: ${image.prompt ?? 'not provided'}.`,
        `Product description: ${context.productDescription ?? 'not provided'}.`,
        `Platform: ${context.platform ?? 'not provided'}.`,
        `Background style: ${context.backgroundStyle ?? image.backgroundStyle ?? 'not provided'}.`,
        `Brand name: ${context.brandProfile?.brandName ?? 'not provided'}.`,
    ].join(' '));
    if (!image.prompt || !hasEnoughText(promptText)) {
        return [];
    }
    return [
        {
            brandProfileId: context.brandProfile?.id ?? null,
            sourceTable: 'generated_images',
            sourceId: image.id,
            sourceKey: 'image-prompt',
            memoryType: 'image-prompt',
            contentText: promptText,
            metadata: {
                brandName: context.brandProfile?.brandName ?? null,
                platform: context.platform ?? null,
                backgroundStyle: context.backgroundStyle ?? image.backgroundStyle ?? null,
                sourceImageUrl: context.sourceImageUrl ?? image.sourceImageUrl ?? null,
            },
        },
    ];
};
const buildPlatformStrategySignalsMap = (rows) => {
    const aggregates = new Map();
    rows.forEach((row) => {
        const platform = normalizePlatformKey(row.platform);
        if (!platform) {
            return;
        }
        const current = aggregates.get(platform) ??
            {
                goals: new Map(),
                tones: new Map(),
                audiences: new Map(),
                keywords: new Map(),
                recentGenerationCount: 0,
            };
        incrementCounter(current.goals, row.goal);
        incrementCounter(current.tones, row.tone);
        incrementCounter(current.audiences, row.audience);
        toStringArray(row.keywords).forEach((keyword) => incrementCounter(current.keywords, keyword.toLowerCase()));
        current.recentGenerationCount += 1;
        aggregates.set(platform, current);
    });
    return new Map([...aggregates.entries()].map(([platform, aggregate]) => [
        platform,
        {
            platform,
            topGoals: topListFromMap(aggregate.goals, 3),
            topTones: topListFromMap(aggregate.tones, 3),
            topAudiences: topListFromMap(aggregate.audiences, 3),
            topKeywords: topListFromMap(aggregate.keywords, 5),
            recentGenerationCount: aggregate.recentGenerationCount,
        },
    ]));
};
const buildPlatformSnapshotSummaryText = (input) => clampText([
    `${input.platform} performance memory for this brand.`,
    `Posts analyzed: ${safeToNumber(input.metrics.posts)}.`,
    `Average engagement rate: ${safeToNumber(input.metrics.averageEngagementRate).toFixed(2)}%.`,
    `Reach: ${safeToNumber(input.metrics.reach)}.`,
    `Impressions: ${safeToNumber(input.metrics.impressions)}.`,
    `Saves: ${safeToNumber(input.metrics.saves)}.`,
    `Shares: ${safeToNumber(input.metrics.shares)}.`,
    `Clicks: ${safeToNumber(input.metrics.postClicks)}.`,
    `Top goals: ${formatList(input.signals?.topGoals)}.`,
    `Top tones: ${formatList(input.signals?.topTones)}.`,
    `Top audiences: ${formatList(input.signals?.topAudiences)}.`,
    `Top keywords: ${formatList(input.signals?.topKeywords)}.`,
    `Best post sample: ${input.topPostCaption ?? 'not provided'}.`,
].join(' '));
const buildPlatformSnapshotMemoryEntry = (snapshot) => ({
    brandProfileId: snapshot.brandProfileId,
    sourceTable: 'brand_platform_memory_snapshots',
    sourceId: snapshot.id,
    sourceKey: snapshot.platform,
    memoryType: 'platform-performance-insight',
    contentText: snapshot.summaryText,
    metadata: {
        platform: snapshot.platform,
        snapshotType: snapshot.snapshotType,
        ...snapshot.metrics,
        signals: snapshot.signals,
    },
});
const buildConnectedAccountIntelligenceMetadata = (profile) => ({
    platform: profile.platform,
    socialAccountId: profile.socialAccountId,
    sourcePostCount: profile.sourcePostCount,
    accountTone: profile.accountTone,
    mainThemes: profile.mainThemes,
    hookStyles: profile.hookStyles,
    ctaStyles: profile.ctaStyles,
    captionLengthPattern: profile.captionLengthPattern,
    emojiStyle: profile.emojiStyle,
    hashtagBehavior: profile.hashtagBehavior,
    formatMix: profile.formatMix,
    bestPatterns: profile.bestPatterns,
    weakPatterns: profile.weakPatterns,
    visualDna: profile.visualDna,
    lastSyncedAt: profile.lastSyncedAt,
});
const buildConnectedAccountIntelligenceMemoryEntry = (profile) => ({
    sourceTable: 'social_account_intelligence_profiles',
    sourceId: profile.id,
    sourceKey: `${profile.platform}:${profile.socialAccountId}`,
    memoryType: 'connected-account-intelligence',
    contentText: profile.summaryText,
    metadata: buildConnectedAccountIntelligenceMetadata(profile),
});
const buildAnalyticsWindowStart = () => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - ANALYTICS_MEMORY_LOOKBACK_DAYS);
    return date.toISOString();
};
const buildAnalyticsWindowEnd = () => new Date().toISOString();
const syncGeneratedContentPerformanceSignals = async (client, userId) => {
    const analyticsRows = await (0, analytics_1.getAnalyticsByUserId)(client, userId, {
        start: buildAnalyticsWindowStart(),
        end: buildAnalyticsWindowEnd(),
    });
    const aggregates = new Map();
    analyticsRows.forEach((row) => {
        if (!row.contentId) {
            return;
        }
        const current = aggregates.get(row.contentId) ??
            {
                contentId: row.contentId,
                platform: row.platform,
                posts: 0,
                reach: 0,
                impressions: 0,
                shares: 0,
                saves: 0,
                clicks: 0,
                engagementRateSum: 0,
                engagementRateCount: 0,
                completionRateSum: 0,
                completionRateCount: 0,
            };
        current.posts += 1;
        current.reach += row.reach;
        current.impressions += row.impressions;
        current.shares += row.shares;
        current.saves += row.saves;
        current.clicks += row.postClicks;
        if (row.engagementRate !== null) {
            current.engagementRateSum += ratioFromPercentLikeValue(row.engagementRate);
            current.engagementRateCount += 1;
        }
        if (row.completionRate !== null) {
            current.completionRateSum += ratioFromPercentLikeValue(row.completionRate);
            current.completionRateCount += 1;
        }
        aggregates.set(row.contentId, current);
    });
    const rawScores = [...aggregates.values()].map((aggregate) => {
        const impressions = Math.max(aggregate.impressions, 1);
        const reach = Math.max(aggregate.reach, 1);
        const engagementRate = aggregate.engagementRateCount > 0
            ? aggregate.engagementRateSum / aggregate.engagementRateCount
            : 0;
        const saveRate = aggregate.saves / impressions;
        const shareRate = aggregate.shares / impressions;
        const clickRate = aggregate.clicks / impressions;
        const completionRate = aggregate.completionRateCount > 0
            ? aggregate.completionRateSum / aggregate.completionRateCount
            : 0;
        const reachRate = Math.min(1, reach / Math.max(reach, impressions));
        const rawScore = engagementRate * 0.4 +
            saveRate * 0.2 +
            shareRate * 0.16 +
            clickRate * 0.14 +
            completionRate * 0.06 +
            reachRate * 0.04;
        return {
            aggregate,
            rawScore,
        };
    });
    const highestScore = rawScores.reduce((current, entry) => Math.max(current, entry.rawScore), 0);
    await Promise.all(rawScores.map(async ({ aggregate, rawScore }) => {
        const normalizedPerformance = highestScore > 0 ? rawScore / highestScore : 0;
        const rows = await (0, brandMemoryEmbeddings_1.getBrandMemoryEmbeddingsBySource)(client, {
            userId,
            sourceTable: 'generated_content',
            sourceId: aggregate.contentId,
        });
        await Promise.all(rows.map(async (row) => {
            const rowId = typeof row.id === 'string' && row.id.trim().length > 0 ? row.id : null;
            if (!rowId) {
                return;
            }
            const currentQualityScore = safeToNumber(row.quality_score);
            const nextQualityScore = clamp01(currentQualityScore * 0.82 + normalizedPerformance * 0.18);
            await (0, brandMemoryEmbeddings_1.updateBrandMemoryEmbeddingById)(client, {
                userId,
                id: rowId,
                patch: {
                    performance_score: clamp01(normalizedPerformance),
                    quality_score: nextQualityScore,
                },
            });
        }));
    }));
};
const ensureAnalyticsAwareMemories = async (client, userId, brandProfile) => {
    const existingSnapshots = await (0, brandMemorySignals_1.getBrandPlatformMemorySnapshotsByUser)(client, userId);
    const existingPerformanceSnapshots = existingSnapshots.filter((snapshot) => snapshot.snapshotType === 'performance');
    const newestSnapshotTime = existingPerformanceSnapshots.reduce((current, snapshot) => {
        const next = new Date(snapshot.updatedAt).getTime();
        return Number.isFinite(next) ? Math.max(current, next) : current;
    }, 0);
    const shouldRefresh = !existingPerformanceSnapshots.length ||
        Date.now() - newestSnapshotTime > PLATFORM_MEMORY_STALE_MS;
    if (!shouldRefresh) {
        return {
            snapshots: existingSnapshots,
            analyticsContext: {
                platforms: existingSnapshots.map((snapshot) => snapshot.platform),
                snapshotCount: existingSnapshots.length,
                refreshed: false,
            },
        };
    }
    const [analyticsSummary, generatedContentSignalsResult] = await Promise.all([
        (0, analytics_1.getGenerationOverview)(client, userId),
        client
            .from('generated_content')
            .select('platform, goal, tone, audience, keywords, created_at')
            .eq('user_id', userId),
    ]);
    if (generatedContentSignalsResult.error) {
        throw new Error(generatedContentSignalsResult.error.message ||
            'Failed to fetch generated content strategy signals for brand memory');
    }
    const strategySignals = buildPlatformStrategySignalsMap((generatedContentSignalsResult.data ?? []));
    const snapshots = await Promise.all(analyticsSummary.platformSignals.map(async (signal) => {
        const platformKey = normalizePlatformKey(signal.platform);
        if (!platformKey) {
            return null;
        }
        const platformStrategySignals = strategySignals.get(platformKey) ?? null;
        const summaryText = buildPlatformSnapshotSummaryText({
            platform: signal.platform,
            metrics: {
                posts: signal.posts,
                reach: signal.reach,
                impressions: signal.impressions,
                likes: signal.likes,
                comments: signal.comments,
                shares: signal.shares,
                saves: signal.saves,
                averageEngagementRate: signal.averageEngagementRate,
                postClicks: signal.topPost?.postClicks ?? 0,
            },
            signals: platformStrategySignals,
            topPostCaption: signal.topPost?.caption ?? null,
        });
        const snapshot = await (0, brandMemorySignals_1.upsertBrandPlatformMemorySnapshot)(client, {
            userId,
            brandProfileId: brandProfile?.id ?? null,
            platform: platformKey,
            snapshotType: 'performance',
            summaryText,
            metrics: {
                posts: signal.posts,
                reach: signal.reach,
                impressions: signal.impressions,
                likes: signal.likes,
                comments: signal.comments,
                shares: signal.shares,
                saves: signal.saves,
                averageEngagementRate: signal.averageEngagementRate,
                latestRecordedAt: signal.latestRecordedAt,
            },
            topPosts: signal.recentPosts.map((post) => ({
                id: post.id,
                caption: post.caption,
                engagementRate: post.engagementRate,
                platform: post.platform,
                recordedAt: post.recordedAt,
                shares: post.shares,
                saves: post.saves,
                postClicks: post.postClicks,
            })),
            signals: {
                strategy: platformStrategySignals,
                topPost: signal.topPost
                    ? {
                        id: signal.topPost.id,
                        caption: signal.topPost.caption,
                        engagementRate: signal.topPost.engagementRate,
                        shares: signal.topPost.shares,
                        saves: signal.topPost.saves,
                        postClicks: signal.topPost.postClicks,
                    }
                    : null,
            },
            sourceWindowStart: buildAnalyticsWindowStart(),
            sourceWindowEnd: buildAnalyticsWindowEnd(),
        });
        await indexBrandMemoryEntries(client, userId, [
            buildPlatformSnapshotMemoryEntry(snapshot),
        ]);
        return snapshot;
    }));
    await syncGeneratedContentPerformanceSignals(client, userId);
    const refreshedSnapshots = snapshots.filter((snapshot) => Boolean(snapshot));
    const retainedSnapshots = existingSnapshots.filter((snapshot) => snapshot.snapshotType !== 'performance');
    const nextSnapshots = [...retainedSnapshots, ...refreshedSnapshots];
    return {
        snapshots: nextSnapshots,
        analyticsContext: {
            platforms: nextSnapshots.map((snapshot) => snapshot.platform),
            snapshotCount: nextSnapshots.length,
            refreshed: true,
            topPlatforms: analyticsSummary.topPlatforms,
            snapshotTypes: nextSnapshots.map((snapshot) => snapshot.snapshotType),
        },
    };
};
const buildContentGenerationQueryText = (brandProfile, productInput) => clampText([
    `Need semantically relevant brand memory for ${productInput.productName}.`,
    `Brand name: ${productInput.brandName ?? brandProfile?.brandName ?? 'not provided'}.`,
    `Product description: ${productInput.productDescription ?? 'not provided'}.`,
    `Platform: ${productInput.platform ?? 'not provided'}.`,
    `Goal: ${productInput.goal ?? 'not provided'}.`,
    `Tone: ${productInput.tone ?? brandProfile?.brandVoice ?? 'not provided'}.`,
    `Audience: ${productInput.audience ?? brandProfile?.targetAudience ?? 'not provided'}.`,
    `Keywords: ${formatList(productInput.keywords)}.`,
    `Primary industry: ${brandProfile?.primaryIndustry ?? brandProfile?.industry ?? 'not provided'}.`,
    `Secondary industries: ${formatList(brandProfile?.secondaryIndustries)}.`,
].join(' '));
const buildBrandDescriptionQueryText = (input) => clampText([
    `Need the most relevant stored brand memories to write a brand description for ${input.brandName}.`,
    `Short note: ${input.shortInput}.`,
    `Primary industry: ${input.primaryIndustry ?? input.industry ?? 'not provided'}.`,
    `Secondary industries: ${formatList(input.secondaryIndustries)}.`,
    `Target audience: ${input.targetAudience ?? 'not provided'}.`,
    `Brand voice: ${input.brandVoice ?? 'not provided'}.`,
    `Website: ${input.websiteUrl ?? 'not provided'}.`,
    `Username: ${input.username ?? 'not provided'}.`,
    `Social context: ${input.socialContext ?? 'not provided'}.`,
    `Existing description: ${input.existingDescription ?? 'not provided'}.`,
].join(' '));
const buildMemoryRerankPrompt = (queryText, candidates, limit) => [
    'You are reranking retrieved brand-memory candidates for an AI generation system.',
    'Return the memories in the most useful order for the current request.',
    'Prioritize direct relevance to the request, tone fit, industry fit, platform fit, and reusable strategic value.',
    'Prefer memories that would genuinely improve the generated output.',
    'Do not invent ids or include explanations.',
    `Return JSON only in this exact shape: {"rankedIds":["id-1","id-2"]}. Return at most ${limit} ids.`,
    '',
    'Current request:',
    queryText,
    '',
    'Candidate memories:',
    ...candidates.map((candidate, index) => [
        `Candidate ${index + 1}:`,
        `- id: ${candidate.id}`,
        `- memoryType: ${candidate.memoryType}`,
        `- similarity: ${candidate.similarity.toFixed(2)}`,
        `- hybridScore: ${(candidate.hybridScore ?? candidate.similarity).toFixed(2)}`,
        `- content: ${candidate.contentText}`,
    ].join('\n')),
].join('\n');
const indexBrandMemoryEntries = async (client, userId, entries) => {
    const expandedEntries = entries.flatMap(expandMemoryEntryForIndexing);
    const groupedBySource = new Map();
    for (const entry of expandedEntries) {
        const groupKey = `${entry.sourceTable}:${entry.sourceId}`;
        groupedBySource.set(groupKey, [...(groupedBySource.get(groupKey) ?? []), entry]);
    }
    for (const sourceEntries of groupedBySource.values()) {
        const first = sourceEntries[0];
        await (0, brandMemoryEmbeddings_1.archiveBrandMemoryEmbeddingsBySource)(client, {
            userId,
            sourceTable: first.sourceTable,
            sourceId: first.sourceId,
            retainSourceKeys: sourceEntries.map((entry) => entry.sourceKey),
        });
    }
    for (const entry of expandedEntries) {
        if (!hasEnoughText(entry.contentText)) {
            continue;
        }
        const embedding = await generateEmbedding(entry.contentText);
        await (0, brandMemoryEmbeddings_1.upsertBrandMemoryEmbedding)(client, {
            userId,
            brandProfileId: entry.brandProfileId ?? null,
            sourceTable: entry.sourceTable,
            sourceId: entry.sourceId,
            sourceKey: entry.sourceKey,
            memoryType: entry.memoryType,
            contentText: entry.contentText,
            embedding,
            metadata: entry.metadata ?? {},
        });
    }
};
const syncBrandProfileSemanticMemory = async (client, userId, profile) => {
    const entries = buildBrandProfileMemoryEntries(profile);
    if (!entries.length) {
        return 0;
    }
    await indexBrandMemoryEntries(client, userId, entries);
    console.info('[brand-memory] indexed brand profile memory', {
        userId,
        brandProfileId: profile.id,
        entries: entries.length,
    });
    return entries.length;
};
exports.syncBrandProfileSemanticMemory = syncBrandProfileSemanticMemory;
const syncGeneratedContentSemanticMemory = async (client, userId, content) => {
    const entries = buildGeneratedContentMemoryEntries(content);
    if (!entries.length) {
        return 0;
    }
    await indexBrandMemoryEntries(client, userId, entries);
    console.info('[brand-memory] indexed generated content memory', {
        userId,
        contentId: content.id,
        entries: entries.length,
    });
    return entries.length;
};
exports.syncGeneratedContentSemanticMemory = syncGeneratedContentSemanticMemory;
const syncGeneratedImageSemanticMemory = async (client, userId, image, context = {}) => {
    const entries = buildGeneratedImageMemoryEntries(image, context);
    if (!entries.length) {
        return 0;
    }
    await indexBrandMemoryEntries(client, userId, entries);
    console.info('[brand-memory] indexed generated image memory', {
        userId,
        imageId: image.id,
        entries: entries.length,
    });
    return entries.length;
};
exports.syncGeneratedImageSemanticMemory = syncGeneratedImageSemanticMemory;
const syncAnalyticsLearningSemanticMemory = async (client, userId, brandProfile, profile) => {
    const snapshot = await (0, brandMemorySignals_1.upsertBrandPlatformMemorySnapshot)(client, {
        userId,
        brandProfileId: brandProfile?.id ?? profile.brandProfileId ?? null,
        platform: profile.platform,
        snapshotType: 'learning-loop',
        summaryText: profile.summaryText,
        metrics: profile.metrics,
        topPosts: profile.topContentIds.map((contentId) => ({ contentId })),
        signals: {
            analyticsContext: profile.analyticsContext,
            patterns: profile.patterns,
            weakPatterns: profile.weakPatterns,
            recommendationText: profile.recommendationText,
            sourceProfileId: profile.id,
            profileType: profile.profileType,
        },
        sourceWindowStart: profile.sourceWindowStart,
        sourceWindowEnd: profile.sourceWindowEnd,
    });
    await indexBrandMemoryEntries(client, userId, [
        buildPlatformSnapshotMemoryEntry(snapshot),
    ]);
    console.info('[brand-memory] indexed analytics learning memory', {
        userId,
        learningProfileId: profile.id,
        snapshotId: snapshot.id,
        platform: profile.platform,
    });
    return snapshot;
};
exports.syncAnalyticsLearningSemanticMemory = syncAnalyticsLearningSemanticMemory;
const syncConnectedAccountIntelligenceSemanticMemory = async (client, profile) => {
    const entry = buildConnectedAccountIntelligenceMemoryEntry(profile);
    await indexBrandMemoryEntries(client, profile.userId, [entry]);
    console.info('[brand-memory] indexed connected account intelligence', {
        userId: profile.userId,
        socialAccountId: profile.socialAccountId,
        platform: profile.platform,
        sourcePostCount: profile.sourcePostCount,
    });
    return 1;
};
exports.syncConnectedAccountIntelligenceSemanticMemory = syncConnectedAccountIntelligenceSemanticMemory;
const rerankBrandMemories = async (queryText, candidates, limit) => {
    if (candidates.length <= 1) {
        return {
            matches: candidates.slice(0, limit),
            provider: null,
        };
    }
    const rerankPool = candidates.slice(0, Math.max(limit, constants_1.BRAND_MEMORY_RERANK_CANDIDATE_COUNT));
    const prompt = buildMemoryRerankPrompt(queryText, rerankPool, limit);
    const reranked = await (0, gemini_1.generateStructuredDataWithGroqFallback)(prompt, memoryRerankResponseSchema, 'memory-rerank');
    const rankMap = new Map(reranked.data.rankedIds.map((id, index) => [id, 1 - index / Math.max(limit, 1)]));
    const ordered = rerankPool
        .filter((candidate) => rankMap.has(candidate.id))
        .map((candidate) => ({
        ...candidate,
        rerankScore: rankMap.get(candidate.id),
    }))
        .sort((left, right) => {
        const rerankDelta = (right.rerankScore ?? 0) - (left.rerankScore ?? 0);
        if (rerankDelta !== 0) {
            return rerankDelta;
        }
        return (right.hybridScore ?? right.similarity) - (left.hybridScore ?? left.similarity);
    });
    return {
        matches: ordered.slice(0, limit),
        provider: reranked.provider,
    };
};
const applyMemoryTaskScoring = (queryText, taskContext, match) => {
    const lexicalScore = lexicalOverlapScore(queryText, match.contentText);
    const baseScore = clamp01(match.hybridScore ?? match.similarity);
    const freshnessScore = getFreshnessScore(match.memoryType, match.createdAt, match.lastFeedbackAt ?? null);
    const taskPolicyScore = getTaskPolicyScore(taskContext.task, match.memoryType);
    const qualityScore = clamp01(match.qualityScore ?? 0.5);
    const promotionScore = clamp01(match.promotionScore ?? 0);
    const performanceScore = clamp01(match.performanceScore ?? 0);
    const platformAlignmentBoost = getPlatformAlignmentBoost(taskContext.selectedPlatform, match);
    const compositeScore = clamp01(baseScore * 0.5 +
        lexicalScore * 0.08 +
        freshnessScore * 0.12 +
        taskPolicyScore * 0.1 +
        qualityScore * 0.1 +
        promotionScore * 0.05 +
        performanceScore * 0.05 +
        platformAlignmentBoost);
    return {
        ...match,
        keywordScore: Math.max(match.keywordScore ?? 0, lexicalScore),
        freshnessScore,
        taskPolicyScore,
        compositeScore,
        similarity: Math.max(match.similarity, compositeScore),
        hybridScore: Math.max(match.hybridScore ?? baseScore, compositeScore),
    };
};
const retrieveBrandMemories = async (client, userId, queryText, options) => {
    if (!hasEnoughText(queryText)) {
        return {
            matches: [],
            telemetry: {
                task: options.taskContext.task,
                queryText,
                retrievalStrategy: 'vector',
                fallbackUsed: false,
                rerankProvider: null,
                candidatePool: [],
                selectedMemories: [],
                selectedPlatform: options.taskContext.selectedPlatform ?? null,
                selectedGoal: options.taskContext.selectedGoal ?? null,
                analyticsContext: options.taskContext.analyticsContext ?? {},
                metadata: options.taskContext.metadata ?? {},
            },
        };
    }
    const embedding = await generateEmbedding(queryText);
    const limit = Math.max(options.limit ?? constants_1.BRAND_MEMORY_MATCH_COUNT, 1);
    const baseTelemetry = {
        task: options.taskContext.task,
        queryText,
        selectedPlatform: options.taskContext.selectedPlatform ?? null,
        selectedGoal: options.taskContext.selectedGoal ?? null,
        analyticsContext: options.taskContext.analyticsContext ?? {},
        metadata: {
            ...(options.taskContext.metadata ?? {}),
            queryText,
        },
    };
    try {
        const hybridMatches = await (0, brandMemoryEmbeddings_1.hybridMatchBrandMemory)(client, {
            userId,
            embedding,
            queryText,
            limit: Math.max(limit, constants_1.BRAND_MEMORY_RERANK_CANDIDATE_COUNT),
            memoryTypes: options.memoryTypes,
            vectorLimit: constants_1.BRAND_MEMORY_VECTOR_CANDIDATE_COUNT,
            keywordLimit: constants_1.BRAND_MEMORY_KEYWORD_CANDIDATE_COUNT,
        });
        const enrichedMatches = hybridMatches
            .filter((match) => isMemoryCompatibleWithPlatform(options.taskContext.selectedPlatform, match))
            .map((match) => applyMemoryTaskScoring(queryText, options.taskContext, match));
        const filteredMatches = enrichedMatches.filter((match) => (match.compositeScore ?? match.hybridScore ?? match.similarity) >= constants_1.BRAND_MEMORY_MIN_SIMILARITY);
        const candidatePool = filteredMatches.length > 0
            ? [...filteredMatches].sort((left, right) => (right.compositeScore ?? 0) - (left.compositeScore ?? 0))
            : [...enrichedMatches]
                .sort((left, right) => (right.compositeScore ?? 0) - (left.compositeScore ?? 0))
                .slice(0, Math.max(limit, constants_1.BRAND_MEMORY_RERANK_CANDIDATE_COUNT));
        try {
            const reranked = await rerankBrandMemories(queryText, candidatePool, limit);
            return {
                matches: reranked.matches,
                telemetry: {
                    ...baseTelemetry,
                    retrievalStrategy: 'hybrid-rerank',
                    fallbackUsed: false,
                    rerankProvider: reranked.provider,
                    candidatePool: candidatePool.map(serializeMemoryForLog),
                    selectedMemories: reranked.matches.map(serializeMemoryForLog),
                },
            };
        }
        catch (rerankError) {
            console.warn('[brand-memory] rerank failed, falling back to hybrid ranking', {
                userId,
                error: rerankError instanceof Error ? rerankError.message : String(rerankError),
            });
            return {
                matches: candidatePool.slice(0, limit),
                telemetry: {
                    ...baseTelemetry,
                    retrievalStrategy: 'hybrid',
                    fallbackUsed: true,
                    rerankProvider: null,
                    candidatePool: candidatePool.map(serializeMemoryForLog),
                    selectedMemories: candidatePool.slice(0, limit).map(serializeMemoryForLog),
                },
            };
        }
    }
    catch (hybridError) {
        console.warn('[brand-memory] hybrid retrieval failed, falling back to vector ranking', {
            userId,
            error: hybridError instanceof Error ? hybridError.message : String(hybridError),
        });
    }
    const rawMatches = await (0, brandMemoryEmbeddings_1.matchBrandMemory)(client, {
        userId,
        embedding,
        limit: Math.max(limit, constants_1.BRAND_MEMORY_RERANK_CANDIDATE_COUNT),
        memoryTypes: options.memoryTypes,
    });
    const platformScopedRawMatches = rawMatches.filter((match) => isMemoryCompatibleWithPlatform(options.taskContext.selectedPlatform, match));
    const filteredMatches = platformScopedRawMatches.filter((match) => match.similarity >= constants_1.BRAND_MEMORY_MIN_SIMILARITY);
    const finalMatches = (filteredMatches.length > 0 ? filteredMatches : platformScopedRawMatches)
        .map((match) => applyMemoryTaskScoring(queryText, options.taskContext, match))
        .sort((left, right) => (right.compositeScore ?? 0) - (left.compositeScore ?? 0))
        .slice(0, limit);
    return {
        matches: finalMatches,
        telemetry: {
            ...baseTelemetry,
            retrievalStrategy: 'vector',
            fallbackUsed: true,
            rerankProvider: null,
            candidatePool: finalMatches.map(serializeMemoryForLog),
            selectedMemories: finalMatches.map(serializeMemoryForLog),
        },
    };
};
const includePrimaryConnectedAccountIntelligence = async (client, userId, platform, matches) => {
    const normalizedPlatform = normalizePlatformKey(platform);
    if (normalizedPlatform !== 'instagram' &&
        normalizedPlatform !== 'facebook') {
        return matches.filter((match) => match.memoryType !== 'connected-account-intelligence');
    }
    const account = await (0, socialAccounts_1.getPrimarySocialAccountByUserAndPlatform)(client, userId, normalizedPlatform);
    if (!account) {
        return matches;
    }
    const profile = await (0, socialAccountIntelligence_1.getSocialAccountIntelligenceProfileBySocialAccountId)(client, account.id);
    if (!profile) {
        return matches;
    }
    const existing = matches.find((match) => match.memoryType === 'connected-account-intelligence' &&
        match.metadata.socialAccountId === account.id);
    const remaining = matches.filter((match) => match !== existing);
    const connectedAccountMemory = {
        id: existing?.id ?? `connected-account-intelligence:${profile.id}`,
        brandProfileId: existing?.brandProfileId ?? null,
        sourceTable: 'social_account_intelligence_profiles',
        sourceId: profile.id,
        sourceKey: `${profile.platform}:${profile.socialAccountId}`,
        memoryType: 'connected-account-intelligence',
        contentText: profile.summaryText,
        metadata: {
            ...(existing?.metadata ?? {}),
            ...buildConnectedAccountIntelligenceMetadata(profile),
        },
        similarity: existing?.similarity ?? 1,
        vectorSimilarity: existing?.vectorSimilarity,
        keywordScore: existing?.keywordScore,
        hybridScore: existing?.hybridScore ?? 1,
        rerankScore: existing?.rerankScore,
        qualityScore: existing?.qualityScore,
        promotionScore: existing?.promotionScore,
        performanceScore: existing?.performanceScore,
        reuseCount: existing?.reuseCount,
        successfulReuseCount: existing?.successfulReuseCount,
        acceptanceCount: existing?.acceptanceCount,
        rejectionCount: existing?.rejectionCount,
        regenerationCount: existing?.regenerationCount,
        editCount: existing?.editCount,
        scheduleUseCount: existing?.scheduleUseCount,
        freshnessScore: existing?.freshnessScore,
        taskPolicyScore: existing?.taskPolicyScore,
        compositeScore: existing?.compositeScore ?? 1,
        lastFeedbackAt: existing?.lastFeedbackAt ?? null,
        archivedAt: existing?.archivedAt ?? null,
        createdAt: existing?.createdAt ?? profile.createdAt,
        updatedAt: profile.updatedAt,
    };
    return [
        connectedAccountMemory,
        ...remaining.filter((match) => match.memoryType !== 'connected-account-intelligence'),
    ];
};
const getRelevantMemoriesForContentGeneration = async (client, userId, brandProfile, productInput) => {
    const platformMemory = await ensureAnalyticsAwareMemories(client, userId, brandProfile);
    const retrieval = await retrieveBrandMemories(client, userId, buildContentGenerationQueryText(brandProfile, productInput), {
        limit: constants_1.BRAND_MEMORY_MATCH_COUNT,
        memoryTypes: [
            'brand-profile-summary',
            'brand-description',
            'brand-voice-note',
            'generated-caption',
            'generated-reel-script',
            'generated-hashtags',
            'user-generation-prompt',
            'image-prompt',
            'platform-performance-insight',
            'connected-account-intelligence',
        ],
        taskContext: {
            task: 'caption-generation',
            brandProfileId: brandProfile?.id ?? null,
            selectedPlatform: productInput.platform ?? null,
            selectedGoal: productInput.goal ?? null,
            requestContext: 'generate-content',
            analyticsContext: platformMemory.analyticsContext,
            metadata: {
                productName: productInput.productName,
                tone: productInput.tone ?? null,
                audience: productInput.audience ?? null,
            },
        },
    });
    const matches = await includePrimaryConnectedAccountIntelligence(client, userId, productInput.platform, retrieval.matches);
    const connectedAccountMemory = matches.find((match) => match.memoryType === 'connected-account-intelligence');
    if (connectedAccountMemory) {
        (0, observability_1.logOperationalEvent)('Connected account intelligence used for content generation', {
            userId,
            platform: productInput.platform ?? null,
            socialAccountId: connectedAccountMemory.metadata.socialAccountId ?? null,
            memoryId: connectedAccountMemory.id,
        });
    }
    const observabilityLog = await (0, brandMemorySignals_1.createBrandMemoryGenerationLog)(client, {
        userId,
        brandProfileId: brandProfile?.id ?? null,
        taskType: 'caption-generation',
        requestContext: 'generate-content',
        provider: 'hybrid',
        rerankProvider: retrieval.telemetry.rerankProvider,
        fallbackUsed: retrieval.telemetry.fallbackUsed,
        retrievalStrategy: retrieval.telemetry.retrievalStrategy,
        queryText: retrieval.telemetry.queryText,
        selectedPlatform: retrieval.telemetry.selectedPlatform,
        selectedGoal: retrieval.telemetry.selectedGoal,
        retrievedMemories: retrieval.telemetry.candidatePool,
        selectedMemories: retrieval.telemetry.selectedMemories,
        analyticsContext: retrieval.telemetry.analyticsContext,
        evaluationSummary: {
            selectedCount: matches.length,
            candidateCount: retrieval.telemetry.candidatePool.length,
            averageCompositeScore: matches.length > 0
                ? Number((matches.reduce((total, match) => total + (match.compositeScore ?? 0), 0) / matches.length).toFixed(4))
                : 0,
        },
        metadata: retrieval.telemetry.metadata,
    }).catch((error) => {
        console.warn('[brand-memory] failed to persist content observability log', {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    });
    console.info('[brand-memory] retrieved content generation memories', {
        userId,
        matchCount: matches.length,
        productName: productInput.productName,
        platform: productInput.platform ?? null,
        strategy: retrieval.telemetry.retrievalStrategy,
        rerankProvider: retrieval.telemetry.rerankProvider,
        fallbackUsed: retrieval.telemetry.fallbackUsed,
        observabilityLogId: observabilityLog?.id ?? null,
        selectedMemoryIds: matches.map((match) => match.id),
    });
    return matches;
};
exports.getRelevantMemoriesForContentGeneration = getRelevantMemoriesForContentGeneration;
const getRelevantMemoriesForImageGeneration = async (client, userId, brandProfile, productInput) => {
    const platformMemory = await ensureAnalyticsAwareMemories(client, userId, brandProfile);
    const retrieval = await retrieveBrandMemories(client, userId, buildContentGenerationQueryText(brandProfile, productInput), {
        limit: Math.min(constants_1.BRAND_MEMORY_MATCH_COUNT, 6),
        memoryTypes: [
            'brand-profile-summary',
            'brand-description',
            'brand-voice-note',
            'generated-caption',
            'generated-hashtags',
            'generated-reel-script',
            'user-generation-prompt',
            'image-prompt',
            'platform-performance-insight',
            'connected-account-intelligence',
        ],
        taskContext: {
            task: 'image-generation',
            brandProfileId: brandProfile?.id ?? null,
            selectedPlatform: productInput.platform ?? null,
            selectedGoal: productInput.goal ?? null,
            requestContext: 'generate-image',
            analyticsContext: platformMemory.analyticsContext,
            metadata: {
                productName: productInput.productName,
                tone: productInput.tone ?? null,
                audience: productInput.audience ?? null,
            },
        },
    });
    const matches = await includePrimaryConnectedAccountIntelligence(client, userId, productInput.platform, retrieval.matches);
    const connectedAccountMemory = matches.find((match) => match.memoryType === 'connected-account-intelligence');
    if (connectedAccountMemory) {
        (0, observability_1.logOperationalEvent)('Connected account intelligence used for image generation', {
            userId,
            platform: productInput.platform ?? null,
            socialAccountId: connectedAccountMemory.metadata.socialAccountId ?? null,
            memoryId: connectedAccountMemory.id,
        });
    }
    console.info('[brand-memory] retrieved image generation memories', {
        userId,
        matchCount: matches.length,
        productName: productInput.productName,
        platform: productInput.platform ?? null,
        strategy: retrieval.telemetry.retrievalStrategy,
        rerankProvider: retrieval.telemetry.rerankProvider,
        fallbackUsed: retrieval.telemetry.fallbackUsed,
        selectedMemoryIds: matches.map((match) => match.id),
    });
    return matches;
};
exports.getRelevantMemoriesForImageGeneration = getRelevantMemoriesForImageGeneration;
const getRelevantMemoriesForBrandDescription = async (client, userId, input) => {
    const platformMemory = await ensureAnalyticsAwareMemories(client, userId, null);
    const retrieval = await retrieveBrandMemories(client, userId, buildBrandDescriptionQueryText(input), {
        limit: 4,
        memoryTypes: [
            'brand-profile-summary',
            'brand-description',
            'brand-voice-note',
            'generated-caption',
            'generated-reel-script',
            'user-generation-prompt',
            'image-prompt',
            'platform-performance-insight',
        ],
        taskContext: {
            task: 'brand-description',
            selectedPlatform: null,
            selectedGoal: null,
            requestContext: 'brand-description',
            analyticsContext: platformMemory.analyticsContext,
            metadata: {
                brandName: input.brandName,
                primaryIndustry: input.primaryIndustry ?? input.industry ?? null,
            },
        },
    });
    const matches = retrieval.matches;
    const observabilityLog = await (0, brandMemorySignals_1.createBrandMemoryGenerationLog)(client, {
        userId,
        brandProfileId: null,
        taskType: 'brand-description',
        requestContext: 'brand-description',
        provider: 'hybrid',
        rerankProvider: retrieval.telemetry.rerankProvider,
        fallbackUsed: retrieval.telemetry.fallbackUsed,
        retrievalStrategy: retrieval.telemetry.retrievalStrategy,
        queryText: retrieval.telemetry.queryText,
        selectedPlatform: null,
        selectedGoal: null,
        retrievedMemories: retrieval.telemetry.candidatePool,
        selectedMemories: retrieval.telemetry.selectedMemories,
        analyticsContext: retrieval.telemetry.analyticsContext,
        evaluationSummary: {
            selectedCount: matches.length,
            candidateCount: retrieval.telemetry.candidatePool.length,
        },
        metadata: retrieval.telemetry.metadata,
    }).catch((error) => {
        console.warn('[brand-memory] failed to persist brand description observability log', {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    });
    console.info('[brand-memory] retrieved brand description memories', {
        userId,
        matchCount: matches.length,
        brandName: input.brandName,
        strategy: retrieval.telemetry.retrievalStrategy,
        rerankProvider: retrieval.telemetry.rerankProvider,
        fallbackUsed: retrieval.telemetry.fallbackUsed,
        observabilityLogId: observabilityLog?.id ?? null,
        selectedMemoryIds: matches.map((match) => match.id),
    });
    return matches;
};
exports.getRelevantMemoriesForBrandDescription = getRelevantMemoriesForBrandDescription;
const getFeedbackScoreDelta = (eventType, intensity) => {
    const normalizedIntensity = clamp01(intensity <= 0 ? 1 : intensity);
    switch (eventType) {
        case 'accepted':
            return 0.08 * normalizedIntensity;
        case 'rejected':
            return -0.09 * normalizedIntensity;
        case 'regenerated':
            return -0.05 * normalizedIntensity;
        case 'edited':
            return 0.03 * normalizedIntensity;
        case 'scheduled':
            return 0.06 * normalizedIntensity;
        case 'reused':
            return 0.04 * normalizedIntensity;
        case 'performance_promoted':
            return 0.07 * normalizedIntensity;
        case 'performance_demoted':
            return -0.06 * normalizedIntensity;
        case 'schedule_opened':
            return 0.01 * normalizedIntensity;
        default:
            return 0;
    }
};
const recordBrandMemoryFeedback = async (client, input) => {
    const rows = await (0, brandMemoryEmbeddings_1.getBrandMemoryEmbeddingsBySource)(client, {
        userId: input.userId,
        sourceTable: input.sourceTable,
        sourceId: input.sourceId,
    });
    const matchingRows = rows.filter((row) => {
        const rowKey = typeof row.source_key === 'string' && row.source_key.trim()
            ? row.source_key
            : 'primary';
        const rowMetadata = row.metadata && typeof row.metadata === 'object'
            ? row.metadata
            : {};
        const semanticChunkSourceKey = typeof rowMetadata.semanticChunkSourceKey === 'string'
            ? rowMetadata.semanticChunkSourceKey
            : null;
        const requestedSourceKey = input.sourceKey ?? 'primary';
        return rowKey === requestedSourceKey || semanticChunkSourceKey === requestedSourceKey;
    });
    if (!matchingRows.length) {
        return null;
    }
    const intensity = input.intensity ?? 1;
    const scoreDelta = getFeedbackScoreDelta(input.eventType, intensity);
    await Promise.all(matchingRows.map(async (row) => {
        const rowId = typeof row.id === 'string' && row.id.trim().length > 0 ? row.id : null;
        if (!rowId) {
            return;
        }
        const nextQualityScore = clamp01(safeToNumber(row.quality_score) + scoreDelta);
        const nextPromotionScore = clamp01(safeToNumber(row.promotion_score) +
            (input.eventType === 'accepted' || input.eventType === 'scheduled'
                ? 0.04
                : input.eventType === 'rejected'
                    ? -0.03
                    : input.eventType === 'performance_promoted'
                        ? 0.05
                        : input.eventType === 'performance_demoted'
                            ? -0.05
                            : 0));
        await (0, brandMemoryEmbeddings_1.updateBrandMemoryEmbeddingById)(client, {
            userId: input.userId,
            id: rowId,
            patch: {
                quality_score: nextQualityScore,
                promotion_score: nextPromotionScore,
                reuse_count: safeToNumber(row.reuse_count) +
                    (input.eventType === 'accepted' ||
                        input.eventType === 'reused' ||
                        input.eventType === 'scheduled'
                        ? 1
                        : 0),
                successful_reuse_count: safeToNumber(row.successful_reuse_count) +
                    (input.eventType === 'accepted' || input.eventType === 'scheduled'
                        ? 1
                        : 0),
                acceptance_count: safeToNumber(row.acceptance_count) +
                    (input.eventType === 'accepted' ? 1 : 0),
                rejection_count: safeToNumber(row.rejection_count) +
                    (input.eventType === 'rejected' ? 1 : 0),
                regeneration_count: safeToNumber(row.regeneration_count) +
                    (input.eventType === 'regenerated' ? 1 : 0),
                edit_count: safeToNumber(row.edit_count) + (input.eventType === 'edited' ? 1 : 0),
                schedule_use_count: safeToNumber(row.schedule_use_count) +
                    (input.eventType === 'scheduled' ? 1 : 0),
                last_feedback_at: new Date().toISOString(),
                archived_at: input.eventType === 'performance_demoted' && nextQualityScore < 0.18
                    ? new Date().toISOString()
                    : row.archived_at ?? null,
            },
        });
    }));
    return (0, brandMemorySignals_1.createBrandMemoryFeedbackEvent)(client, {
        userId: input.userId,
        brandProfileId: input.brandProfileId ?? null,
        sourceTable: input.sourceTable,
        sourceId: input.sourceId,
        sourceKey: input.sourceKey ?? 'primary',
        memoryType: input.memoryType,
        eventType: input.eventType,
        platform: input.platform ?? null,
        contentId: input.contentId ?? null,
        generatedImageId: input.generatedImageId ?? null,
        scheduledPostId: input.scheduledPostId ?? null,
        scheduledItemId: input.scheduledItemId ?? null,
        acceptedFeedbackEventId: input.acceptedFeedbackEventId ?? null,
        usedForScheduler: input.usedForScheduler ?? null,
        usedSameCaptionForScheduler: input.usedSameCaptionForScheduler ?? null,
        intensity,
        wasAiRecommended: input.wasAiRecommended ?? false,
        weightDelta: scoreDelta,
        metadata: input.metadata ?? {},
    });
};
exports.recordBrandMemoryFeedback = recordBrandMemoryFeedback;
const getRelevantMemoriesForSchedulingRecommendation = async (client, userId, brandProfile, input) => {
    const platformMemory = await ensureAnalyticsAwareMemories(client, userId, brandProfile);
    return retrieveBrandMemories(client, userId, buildContentGenerationQueryText(brandProfile, input), {
        limit: constants_1.BRAND_MEMORY_MATCH_COUNT,
        memoryTypes: [
            'brand-profile-summary',
            'brand-description',
            'brand-voice-note',
            'generated-caption',
            'generated-hashtags',
            'generated-reel-script',
            'user-generation-prompt',
            'image-prompt',
            'platform-performance-insight',
        ],
        taskContext: {
            task: 'scheduler-caption-recommendation',
            brandProfileId: brandProfile?.id ?? null,
            selectedPlatform: input.platform ?? null,
            selectedGoal: input.goal ?? null,
            requestContext: 'scheduler-caption-recommendation',
            analyticsContext: platformMemory.analyticsContext,
            metadata: {
                productName: input.productName,
                tone: input.tone ?? null,
                audience: input.audience ?? null,
            },
        },
    });
};
exports.getRelevantMemoriesForSchedulingRecommendation = getRelevantMemoriesForSchedulingRecommendation;
