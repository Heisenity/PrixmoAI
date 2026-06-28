"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateProductImage = exports.ImageGenerationProvidersExhaustedError = void 0;
const requestCancellation_1 = require("../lib/requestCancellation");
const providerCircuit_service_1 = require("../services/providerCircuit.service");
class ImageGenerationProvidersExhaustedError extends Error {
    constructor(failures) {
        super(resolveUserFacingFailureMessage(failures));
        this.name = 'ImageGenerationProvidersExhaustedError';
        this.failures = failures;
    }
}
exports.ImageGenerationProvidersExhaustedError = ImageGenerationProvidersExhaustedError;
const KNOWN_BFL_FLUX_ENDPOINT = 'https://api.bfl.ai/v1/flux-pro-1.1';
const DEFAULT_HF_FLUX_MODEL = 'black-forest-labs/FLUX.1-dev';
const HF_INFERENCE_BASE_URL = 'https://api-inference.huggingface.co/models';
const HF_ROUTER_INFERENCE_BASE_URL = 'https://router.huggingface.co/hf-inference/models';
const PIXAZO_GENERATE_ENDPOINT = 'https://gateway.pixazo.ai/flux-1-schnell/v1/getDataBatch';
const PIXAZO_STATUS_ENDPOINT = 'https://gateway.pixazo.ai/flux-1-schnell/v1/checkStatus';
const AIMLAPI_GENERATE_ENDPOINT = 'https://api.aimlapi.com/v1/images/generations';
const DEFAULT_CLOUDFLARE_WORKER_IMAGE_URL = 'https://prixmoai.computerbro1234.workers.dev';
const CLOUDFLARE_WORKER_TIMEOUT_MS = Number(process.env.CLOUDFLARE_WORKER_GENERATION_TIMEOUT_MS || 45000);
const FLUX_TIMEOUT_MS = Number(process.env.FLUX_GENERATION_TIMEOUT_MS || 45000);
const PIXAZO_TIMEOUT_MS = Number(process.env.PIXAZO_GENERATION_TIMEOUT_MS || 75000);
const AIMLAPI_TIMEOUT_MS = Number(process.env.AIMLAPI_GENERATION_TIMEOUT_MS || 45000);
const IMAGE_VALIDATION_TIMEOUT_MS = 15000;
const FLUX_POLL_INTERVAL_MS = Number(process.env.FLUX_POLL_INTERVAL_MS || 3000);
const FLUX_MAX_POLLS = Number(process.env.FLUX_MAX_POLLS || 6);
const PIXAZO_POLL_INTERVAL_MS = Number(process.env.PIXAZO_POLL_INTERVAL_MS || 3000);
const PIXAZO_MAX_POLLS = Number(process.env.PIXAZO_MAX_POLLS || 20);
const AIMLAPI_MAX_PROMPT_LENGTH = Number(process.env.AIMLAPI_MAX_PROMPT_LENGTH || 1900);
const DEFAULT_AIMLAPI_MODEL = process.env.AIMLAPI_IMAGE_MODEL || 'alibaba/wan-2-6-image';
let huggingFaceInferenceModulePromise = null;
const getOptionalEnv = (key) => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const getCloudflareWorkerConfig = () => {
    const endpoint = getOptionalEnv('CLOUDFLARE_WORKER_IMAGE_URL') ||
        DEFAULT_CLOUDFLARE_WORKER_IMAGE_URL;
    const apiKey = getOptionalEnv('CLOUDFLARE_WORKER_API_KEY');
    if (!apiKey) {
        throw new Error('CLOUDFLARE_WORKER_API_KEY is not configured');
    }
    return {
        endpoint,
        apiKey,
    };
};
const loadHuggingFaceInferenceModule = () => {
    if (!huggingFaceInferenceModulePromise) {
        huggingFaceInferenceModulePromise = import('@huggingface/inference');
    }
    return huggingFaceInferenceModulePromise;
};
const resolveUserFacingFailureMessage = (failures) => {
    if (!failures.length) {
        return "We couldn't generate your image right now. Please try again.";
    }
    const codes = new Set(failures.map((failure) => failure.code));
    if (codes.has('source_image_unsupported')) {
        return 'This request uses a reference image, and the available providers could not complete image-to-image generation right now. Try again in a moment, or remove the reference image to generate from text only.';
    }
    if (codes.has('prompt_too_long')) {
        return 'Your image brief is too long for the current providers. Shorten the product description or prompt and try again.';
    }
    if (codes.size === 1 && codes.has('timeout')) {
        return 'Image generation is temporarily delayed because many requests are being processed right now. Please try again in a moment.';
    }
    if (codes.has('rate_limited')) {
        return 'The image providers are busy right now. Please wait a moment and try again.';
    }
    if (codes.has('insufficient_credits')) {
        return 'One of the image providers has run out of credits. Please top up that provider account or try again with another available provider.';
    }
    if (codes.has('configuration')) {
        return 'One of the image providers is temporarily misconfigured. Please try again in a moment.';
    }
    if (codes.has('invalid_response')) {
        return 'The image provider returned an invalid result. Please try again.';
    }
    if (codes.has('provider_unavailable')) {
        return 'The image providers are temporarily unavailable. Please try again in a moment.';
    }
    if (codes.has('request_rejected')) {
        return 'This image request could not be processed in its current form. Please adjust the prompt and try again.';
    }
    return failures[0]?.userMessage ||
        "We couldn't generate your image right now. Please try again.";
};
const REFERENCE_SIMILARITY_PATTERN = /\b(similar|same|like\s+(?:this|the|that)\s+image|like\s+the\s+reference|as\s+per\s+the\s+(?:image|reference)|based\s+on\s+the\s+(?:image|reference)|match\s+the\s+(?:image|reference)|use\s+the\s+(?:image|reference)\s+below|shown\s+below|pasted\s+below)\b/i;
const IMAGE_MEMORY_PROMPT_TYPE_PRIORITY = {
    'image-prompt': 100,
    'platform-performance-insight': 92,
    'brand-voice-note': 84,
    'brand-description': 80,
    'brand-profile-summary': 76,
    'user-generation-prompt': 72,
};
const asString = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
const asStringArray = (value) => Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
const asRecordArray = (value) => Array.isArray(value)
    ? value.filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
const buildBrandDirection = (brandProfile) => {
    if (!brandProfile) {
        return [];
    }
    return [
        'Brand profile direction (use as soft visual art direction only, never as visible text inside the image):',
        `- Industry: ${brandProfile.industry ?? 'not provided'}`,
        `- Target audience: ${brandProfile.targetAudience ?? 'not provided'}`,
        `- Brand voice: ${brandProfile.brandVoice ?? 'not provided'}`,
        `- Brand description: ${brandProfile.description ?? 'not provided'}`,
    ];
};
const buildTrendDirection = (trendIntelligence) => {
    if (!trendIntelligence || trendIntelligence.topCandidates.length === 0) {
        return [];
    }
    return [
        'Fresh live creative direction from web and social trend research (distill the pattern, do not copy exact creators or compositions):',
        `- Summary: ${trendIntelligence.summary}`,
        `- Primary platform: ${trendIntelligence.selectedPlatform ?? 'not provided'}`,
        `- Goal: ${trendIntelligence.selectedGoal ?? 'not provided'}`,
        ...trendIntelligence.insights.slice(0, 3).map((insight, index) => `- Visual signal ${index + 1}: ${insight.headline} | ${insight.explanation}`),
    ];
};
const clampDirectiveText = (value, maxLength = 220) => {
    const normalized = normalizePromptText(value);
    if (!normalized) {
        return null;
    }
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};
const summarizeWeightedRecord = (value, limit = 4) => {
    if (!value) {
        return null;
    }
    const entries = Object.entries(value)
        .map(([key, rawValue]) => {
        const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        return {
            key: key.trim(),
            value: numericValue,
        };
    })
        .filter((entry) => entry.key && Number.isFinite(entry.value) && entry.value > 0)
        .sort((left, right) => right.value - left.value)
        .slice(0, limit)
        .map((entry) => `${entry.key} ${entry.value}`);
    return entries.length > 0 ? entries.join(', ') : null;
};
const buildLinkedCampaignImageDirection = (contentContext) => {
    if (!contentContext) {
        return [];
    }
    const keywords = (contentContext.keywords ?? [])
        .map((keyword) => normalizePromptText(keyword))
        .filter(Boolean)
        .slice(0, 6);
    const lines = [
        'Linked campaign context from this workspace (treat this as real business context for the visual):',
        contentContext.goal ? `- Goal: ${contentContext.goal}` : null,
        contentContext.tone ? `- Tone: ${contentContext.tone}` : null,
        contentContext.audience ? `- Audience: ${contentContext.audience}` : null,
        keywords.length > 0 ? `- Keywords / concepts: ${keywords.join(', ')}` : null,
    ].filter((line) => Boolean(line));
    return lines.length > 1 ? lines : [];
};
const buildConnectedAccountImageDirection = (brandMemories) => {
    const connectedAccountMemory = brandMemories?.find((match) => match.memoryType === 'connected-account-intelligence');
    if (!connectedAccountMemory) {
        return [];
    }
    const metadata = asRecord(connectedAccountMemory.metadata);
    const visualDna = asRecord(metadata?.visualDna);
    const accountTone = clampDirectiveText(asString(metadata?.accountTone), 140);
    const mainThemes = asStringArray(metadata?.mainThemes).slice(0, 5);
    const formatMix = summarizeWeightedRecord(asRecord(metadata?.formatMix), 4);
    const bestPatterns = asRecordArray(metadata?.bestPatterns);
    const weakPatterns = asRecordArray(metadata?.weakPatterns);
    const strongestFormat = asString(bestPatterns[0]?.format);
    const weakerFormat = asString(weakPatterns[0]?.format);
    const connectedAccountSummary = clampDirectiveText(connectedAccountMemory.contentText, 320);
    const lines = [
        'Connected account visual intelligence from recent posts on the selected platform (use this strongly when it improves business fit and does not conflict with the user brief or reference image):',
        connectedAccountSummary ? `- Summary: ${connectedAccountSummary}` : null,
        accountTone ? `- Account tone: ${accountTone}` : null,
        mainThemes.length > 0
            ? `- Recurring themes: ${mainThemes.join(', ')}`
            : null,
        formatMix ? `- Recent format emphasis: ${formatMix}` : null,
        asString(visualDna?.composition)
            ? `- Composition pattern: ${clampDirectiveText(asString(visualDna?.composition), 180)}`
            : null,
        asString(visualDna?.background)
            ? `- Background pattern: ${clampDirectiveText(asString(visualDna?.background), 180)}`
            : null,
        asString(visualDna?.colorMood)
            ? `- Color mood: ${clampDirectiveText(asString(visualDna?.colorMood), 180)}`
            : null,
        asString(visualDna?.framing)
            ? `- Framing style: ${clampDirectiveText(asString(visualDna?.framing), 180)}`
            : null,
        asString(visualDna?.textUsage)
            ? `- Text usage tendency: ${clampDirectiveText(asString(visualDna?.textUsage), 180)}`
            : null,
        strongestFormat
            ? `- Strong recent post-format signal: ${strongestFormat} content has been responding well`
            : null,
        weakerFormat
            ? `- Avoid defaulting to weaker recent post-format signals like ${weakerFormat} unless the brief explicitly asks for it`
            : null,
        '- Keep the generated image compatible with this account’s recognizable visual system while still creating a fresh original asset.',
    ].filter((line) => Boolean(line));
    return lines.length > 1 ? lines : [];
};
const getImageMemoryDirectiveLabel = (memoryType) => {
    switch (memoryType) {
        case 'image-prompt':
            return 'Strong past image direction';
        case 'platform-performance-insight':
            return 'Platform performance guidance';
        case 'brand-voice-note':
            return 'Brand-expression guidance';
        case 'brand-description':
            return 'Brand-description guidance';
        case 'brand-profile-summary':
            return 'Brand summary guidance';
        case 'user-generation-prompt':
            return 'Reusable user preference';
        default:
            return 'Relevant brand memory';
    }
};
const extractImageMemoryDirectiveText = (memory) => {
    if (memory.memoryType === 'image-prompt') {
        const promptMatch = memory.contentText.match(/Prompt:\s*(.+?)(?:\.\s*Product description:|$)/i);
        const extractedPrompt = clampDirectiveText(promptMatch?.[1] ?? null, 260);
        if (extractedPrompt) {
            return extractedPrompt;
        }
    }
    if (memory.memoryType === 'platform-performance-insight') {
        const metadata = asRecord(memory.metadata);
        const signals = asRecord(metadata?.signals);
        const recommendationText = clampDirectiveText(asString(signals?.recommendationText), 220);
        if (recommendationText) {
            return recommendationText;
        }
    }
    return clampDirectiveText(memory.contentText, 260);
};
const selectBrandMemoriesForImagePrompt = (brandMemories) => {
    const usefulMemoryTypes = new Set([
        'image-prompt',
        'platform-performance-insight',
        'brand-voice-note',
        'brand-description',
        'brand-profile-summary',
        'user-generation-prompt',
    ]);
    const selectedTypes = new Set();
    return (brandMemories ?? [])
        .filter((memory) => usefulMemoryTypes.has(memory.memoryType))
        .filter((memory) => normalizePromptText(memory.contentText).length >= 24)
        .sort((left, right) => {
        const rightPriority = IMAGE_MEMORY_PROMPT_TYPE_PRIORITY[right.memoryType] ?? 0;
        const leftPriority = IMAGE_MEMORY_PROMPT_TYPE_PRIORITY[left.memoryType] ?? 0;
        if (rightPriority !== leftPriority) {
            return rightPriority - leftPriority;
        }
        const rightScore = right.compositeScore ??
            right.rerankScore ??
            right.hybridScore ??
            right.similarity ??
            0;
        const leftScore = left.compositeScore ??
            left.rerankScore ??
            left.hybridScore ??
            left.similarity ??
            0;
        return rightScore - leftScore;
    })
        .filter((memory) => {
        if (selectedTypes.has(memory.memoryType)) {
            return false;
        }
        selectedTypes.add(memory.memoryType);
        return true;
    })
        .slice(0, 4);
};
const buildRetrievedImageMemoryDirection = (brandMemories) => {
    const selectedMemories = selectBrandMemoriesForImagePrompt(brandMemories);
    if (selectedMemories.length === 0) {
        return [];
    }
    return [
        'Retrieved brand memories relevant to this image (apply the strategy behind them when it strengthens the result and still fits the user brief or reference image):',
        ...selectedMemories
            .map((memory) => {
            const directiveText = extractImageMemoryDirectiveText(memory);
            if (!directiveText) {
                return null;
            }
            return `- ${getImageMemoryDirectiveLabel(memory.memoryType)}: ${directiveText}`;
        })
            .filter((line) => Boolean(line)),
        '- Use the strategic pattern behind these memories to sharpen positioning, styling, hierarchy, polish, and audience fit. Do not recreate an old asset verbatim.',
    ];
};
const buildPlatformImageDirection = (platform) => {
    const normalizedPlatform = platform?.trim().toLowerCase() ?? '';
    switch (normalizedPlatform) {
        case 'instagram':
            return 'Platform fit: Instagram. Make it instantly scroll-stopping, visually bold, cleanly composed, and strong at first glance.';
        case 'facebook':
            return 'Platform fit: Facebook. Keep it clear, warm, and broadly appealing with an easy-to-read focal hierarchy.';
        case 'linkedin':
            return 'Platform fit: LinkedIn. Keep it polished, credible, premium, and professionally composed without feeling stiff.';
        case 'x':
            return 'Platform fit: X. Make it punchy, high-contrast, and fast to understand in a crowded feed.';
        case 'pinterest':
            return 'Platform fit: Pinterest. Make it aspirational, highly save-worthy, visually rich, and strong as a planning or inspiration image.';
        default:
            return null;
    }
};
const BACKGROUND_STYLE_DIRECTIONS = {
    'clean studio background': 'seamless clean studio backdrop, softbox lighting, controlled shadows, uncluttered negative space, premium commercial product photography',
    'soft luxury shadow set': 'soft luxury shadow set with layered diffused shadows, warm high-end lighting, subtle dimensional depth, elegant premium surface treatment',
    'editorial marble surface': 'editorial marble surface with natural veining, reflective highlights, magazine-quality styling, polished luxury still-life composition',
    'muted gradient backdrop': 'muted gradient backdrop with smooth tonal falloff, soft atmospheric depth, refined modern color transitions, no harsh banding',
    'minimal industrial texture': 'minimal industrial texture with refined concrete or brushed metal, clean geometry, restrained grit, premium utilitarian finish',
    'premium showroom interior': 'premium showroom interior with curated display lighting, expensive materials, clean spatial depth, high-end retail presentation',
    'warm lifestyle room': 'warm lifestyle room with believable natural light, tasteful decor, soft lived-in atmosphere, product placed naturally in context',
    'luxury boutique display': 'luxury boutique display with elevated shelving, soft accent lighting, refined retail styling, elegant premium merchandising',
    'urban street backdrop': 'urban street backdrop with controlled cinematic depth, believable street texture, tasteful blur, no distracting signage or text',
    'nature daylight setting': 'nature daylight setting with soft natural light, organic textures, gentle depth of field, fresh outdoor premium mood',
    'festive indian decor': 'festive Indian decor with tasteful warm lights, premium traditional accents, rich but uncluttered styling, celebratory atmosphere',
    'modern cafe table scene': 'modern cafe table scene with warm ambient light, clean tabletop composition, lifestyle realism, tasteful depth in the background',
    'dark cinematic spotlight': 'dark cinematic spotlight with controlled rim light, moody graphite shadows, dramatic subject separation, premium filmic contrast',
    'pastel paper sweep': 'pastel paper sweep with smooth curved backdrop, soft studio lighting, gentle shadows, clean commercial product presentation',
    'wooden tabletop studio': 'wooden tabletop studio with refined grain texture, warm directional light, realistic contact shadows, premium handcrafted feel',
    'concrete wall and floor': 'concrete wall and floor with modern matte texture, clean architectural lines, soft shadow gradient, premium minimalist realism',
    'high-end retail shelf': 'high-end retail shelf with neat product staging, soft shelf lighting, premium store ambience, clean background hierarchy',
    'minimal tech gradient': 'minimal tech gradient with sleek blue-gray lighting, subtle futuristic depth, clean reflections, premium AI SaaS visual language',
    'vintage film backdrop': 'vintage film backdrop with cinematic texture, tasteful retro color grading, subtle grain, old-studio atmosphere without visible text',
    'custom background': 'custom background directed by the user, interpreted literally first, then polished into a coherent premium scene',
};
const normalizePromptText = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const buildAdvancedBackgroundDirection = (input) => {
    const selectedStyle = normalizePromptText(input.backgroundStyle);
    const customBackground = normalizePromptText(input.backgroundPrompt);
    const presetDirection = BACKGROUND_STYLE_DIRECTIONS[selectedStyle.toLowerCase()] ?? selectedStyle;
    if (customBackground) {
        return [
            `Background style preset: ${presetDirection || 'premium, clean, social-ready image background'}.`,
            `User custom background request: "${customBackground}". Treat this as the highest-priority background instruction.`,
            'Preserve every named place, era, material, object, color, mood, weather, culture, and visual reference from the custom background request.',
            'If the custom background is vague, expand it into a specific professional scene with clear surface material, spatial depth, lighting direction, atmosphere, and color harmony.',
            'If the preset and custom background conflict, follow the custom background and use the preset only for polish, lighting quality, and production value.',
            'Keep the background supportive: it should make the product or subject look better without stealing focus or adding irrelevant props.',
        ].join(' ');
    }
    if (presetDirection) {
        return [
            `Background style: ${presetDirection}.`,
            'Make the background feel intentional and production-ready, with clear material choice, lighting direction, depth, and realistic contact shadows.',
            'Keep the scene clean and commercially useful for social media.',
        ].join(' ');
    }
    return [
        'Background style: clean premium studio setting with modern lighting and social-ready polish.',
        'Choose a background that fits the product category, brand tone, and target audience without inventing unrelated props.',
    ].join(' ');
};
const buildReferenceImageDirection = (input) => {
    if (!input.sourceImageUrl) {
        return [];
    }
    const combinedReferenceBrief = [
        input.productDescription,
        input.prompt,
        input.backgroundPrompt,
    ]
        .map(normalizePromptText)
        .filter(Boolean)
        .join(' ');
    const userWantsCloseReferenceMatch = REFERENCE_SIMILARITY_PATTERN.test(combinedReferenceBrief);
    return [
        'A reference image is attached. Treat it as the primary visual anchor for this generation, not as a weak optional hint.',
        userWantsCloseReferenceMatch
            ? 'The user explicitly wants a similar image based on that reference. Match the reference subject category, composition, framing, styling, palette, lighting, background logic, era, and overall mood as closely as possible while still delivering a polished new final image.'
            : 'Use the reference to preserve the core subject, product form, recognisable details, composition cues, styling, and visual mood while improving polish, lighting, background quality, and commercial usefulness.',
        'Do not ignore or dilute the reference just because the product name is short, broad, or abstract. Product and brand context should guide adaptation, but the reference image stays dominant unless the user clearly asks to move away from it.',
        'When the brief is short or vague, infer more from the reference image instead of defaulting to generic category imagery.',
    ];
};
const buildImagePrompt = (brandProfile, input, options = {}) => {
    const platformDirection = buildPlatformImageDirection(input.platform);
    const parts = [
        'Create one polished, premium, platform-ready marketing image.',
        `Primary subject / offer context: ${input.productName}.`,
        input.brandName
            ? `Brand / business name: ${input.brandName}. Use this only as business context, not as visible text inside the image unless explicitly requested.`
            : 'No brand / business name is being used for this generation. Do not invent one and do not use the workspace owner personal name as the visible brand name.',
        input.platform
            ? `Target platform: ${input.platform}.`
            : 'Target platform was not specified. Choose a composition that feels broadly social-media ready.',
        platformDirection,
        ...buildLinkedCampaignImageDirection(options.contentContext),
        input.productDescription
            ? `User brief: ${input.productDescription}. Treat this as high-priority creative intent.`
            : 'No detailed brief was provided beyond the product context, so infer the strongest visual direction from the available reference, brand profile, and platform cues.',
        input.prompt
            ? `Additional creative direction: ${input.prompt.trim()}.`
            : 'Creative direction: premium, modern, on-brand product creative shaped by the product brief and brand profile.',
        ...buildReferenceImageDirection(input),
        ...buildConnectedAccountImageDirection(options.brandMemories),
        ...buildRetrievedImageMemoryDirection(options.brandMemories),
        input.sourceImageUrl
            ? 'Use the attached reference together with the text brief, platform direction, and brand context at the same time. Do not collapse the request into generic imagery.'
            : 'No source image is provided. Create a fresh hero composition centered on the subject described in the brief.',
        buildAdvancedBackgroundDirection(input),
        'Define a clear scene, lighting style, camera angle, mood, color palette, and product focus based on the brief.',
        'Make those visual decisions feel on-brand, audience-aware, and appropriate for the inferred business domain.',
        'Do not assume fashion, ecommerce, or any other niche unless the product input or brand profile supports it.',
        'Use brand and trend signals as secondary optimization layers only. If they conflict with a clear user brief or reference image, follow the user brief and reference first.',
        'Do not add any visible text, typography, logos, brand names, usernames, watermarks, packaging copy, or poster-style wording unless the user explicitly asks for text inside the image.',
        input.negativePrompt
            ? `Avoid these elements: ${input.negativePrompt}.`
            : 'Avoid extra products, distorted anatomy, wrong materials, warped text, clutter, and low-detail rendering.',
        'Keep the main subject in sharp focus and make the final image social-media ready.',
        ...buildBrandDirection(brandProfile),
        ...buildTrendDirection(options.trendIntelligence),
    ];
    return parts.filter(Boolean).join(' ');
};
const truncatePrompt = (prompt, maxLength) => {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    const truncated = normalized.slice(0, Math.max(0, maxLength - 1));
    const lastWhitespaceIndex = truncated.lastIndexOf(' ');
    if (lastWhitespaceIndex > Math.floor(maxLength * 0.7)) {
        return `${truncated.slice(0, lastWhitespaceIndex).trimEnd()}…`;
    }
    return `${truncated.trimEnd()}…`;
};
const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(new requestCancellation_1.RequestCancelledError('Image generation cancelled by user.'));
        return;
    }
    const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', handleAbort);
        resolve();
    }, ms);
    const handleAbort = () => {
        clearTimeout(timeout);
        reject(new requestCancellation_1.RequestCancelledError('Image generation cancelled by user.'));
    };
    signal?.addEventListener('abort', handleAbort, {
        once: true,
    });
});
const normalizeDimension = (value, fallback) => {
    const safeValue = Number.isFinite(value) && value ? Math.trunc(value) : fallback;
    const bounded = Math.min(1024, Math.max(256, safeValue));
    const snapped = Math.round(bounded / 32) * 32;
    return Math.min(1024, Math.max(256, snapped));
};
const withTimeout = async (timeoutMs, operation, requestSignal) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const handleRequestAbort = () => {
        controller.abort();
    };
    requestSignal?.addEventListener('abort', handleRequestAbort, {
        once: true,
    });
    try {
        (0, requestCancellation_1.throwIfRequestCancelled)(requestSignal, 'Image generation cancelled by user.');
        return await operation(controller.signal);
    }
    catch (error) {
        if ((0, requestCancellation_1.isAbortError)(error)) {
            if (requestSignal?.aborted) {
                throw new requestCancellation_1.RequestCancelledError('Image generation cancelled by user.');
            }
            throw new Error('Request timed out');
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
        requestSignal?.removeEventListener('abort', handleRequestAbort);
    }
};
const createDeadline = (timeoutMs) => Date.now() + timeoutMs;
const getRemainingMs = (deadlineAt) => Math.max(0, deadlineAt - Date.now());
const runWithDeadline = async (deadlineAt, operation, requestSignal) => {
    const remainingMs = getRemainingMs(deadlineAt);
    if (remainingMs <= 0) {
        throw new Error('Request timed out');
    }
    return withTimeout(remainingMs, operation, requestSignal);
};
const sleepWithinDeadline = async (deadlineAt, delayMs, requestSignal) => {
    const remainingMs = getRemainingMs(deadlineAt);
    if (remainingMs <= 0) {
        throw new Error('Request timed out');
    }
    (0, requestCancellation_1.throwIfRequestCancelled)(requestSignal, 'Image generation cancelled by user.');
    await sleep(Math.min(delayMs, remainingMs), requestSignal);
    (0, requestCancellation_1.throwIfRequestCancelled)(requestSignal, 'Image generation cancelled by user.');
};
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const BASE64_IMAGE_PATTERN = /^[A-Za-z0-9+/=\s]+$/;
const toErrorMessage = (value, fallback) => {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (isRecord(value)) {
        const candidates = [
            value.message,
            value.error,
            value.details,
            value.reason,
            value.status,
        ];
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate;
            }
        }
        if (isRecord(value.error)) {
            return toErrorMessage(value.error, fallback);
        }
    }
    if (value instanceof Error && value.message.trim()) {
        return value.message;
    }
    return fallback;
};
const classifyProviderFailure = (provider, error) => {
    const technicalMessage = toErrorMessage(error, `${provider} image generation failed`);
    const normalizedMessage = technicalMessage.toLowerCase();
    if (/source-image guided generation does not support|image-to-image generation right now|remove the reference image to generate from text only/i.test(technicalMessage)) {
        return {
            provider,
            code: 'source_image_unsupported',
            message: technicalMessage,
            userMessage: 'This request uses a reference image, and that flow is not available with the current provider right now. Try again in a moment, or remove the reference image to generate from text only.',
        };
    }
    if (/run out of credits|insufficent_credits|insufficient credits|top up your balance|update your payment method/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'insufficient_credits',
            message: technicalMessage,
            userMessage: 'This image provider has run out of credits. Please top up that provider account or try again with another available provider.',
        };
    }
    if (/at most 2000 character|too_big|prompt is too long|string must contain at most/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'prompt_too_long',
            message: technicalMessage,
            userMessage: 'Your image brief is too long for the current providers. Shorten the product description or prompt and try again.',
        };
    }
    if (/request timed out|timed out before returning an image|timeout/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'timeout',
            message: technicalMessage,
            userMessage: 'Image generation is temporarily delayed because many requests are being processed right now. Please try again in a moment.',
        };
    }
    if (/429|too many requests|rate limit|quota/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'rate_limited',
            message: technicalMessage,
            userMessage: 'The image providers are busy right now. Please wait a moment and try again.',
        };
    }
    if (/503|502|500|internal server error|service unavailable|bad gateway|overloaded|temporarily unavailable/i.test(normalizedMessage)
        || /temporarily skipped after repeated failures/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'provider_unavailable',
            message: technicalMessage,
            userMessage: 'The image providers are temporarily unavailable. Please try again in a moment.',
        };
    }
    if (/did not return an image url|non-image response|invalid image url|invalid image|invalid result|unexpected format/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'invalid_response',
            message: technicalMessage,
            userMessage: 'The image provider returned an invalid result. Please try again.',
        };
    }
    if (/cannot post \/models\//i.test(normalizedMessage)) {
        return {
            provider,
            code: 'configuration',
            message: technicalMessage,
            userMessage: 'Flux is pointing to the wrong endpoint. Leave FLUX_API_ENDPOINT empty when using a Hugging Face token, then restart the server.',
        };
    }
    if (/not configured|forbidden|unauthorized|401|403/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'configuration',
            message: technicalMessage,
            userMessage: 'One of the image providers is temporarily misconfigured. Please try again in a moment.',
        };
    }
    if (/400|bad request|invalid payload|unprocessable/i.test(normalizedMessage)) {
        return {
            provider,
            code: 'request_rejected',
            message: technicalMessage,
            userMessage: 'This image request could not be processed in its current form. Please adjust the prompt and try again.',
        };
    }
    return {
        provider,
        code: 'unknown',
        message: technicalMessage,
        userMessage: "We couldn't generate your image right now. Please try again.",
    };
};
const toDataImageUrl = (value, mimeType = 'image/png') => {
    const normalized = value.trim();
    if (!normalized || !BASE64_IMAGE_PATTERN.test(normalized)) {
        return null;
    }
    return `data:${mimeType};base64,${normalized.replace(/\s+/g, '')}`;
};
const extractImageUrl = (value) => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('http://') ||
            trimmed.startsWith('https://') ||
            trimmed.startsWith('data:image/')) {
            return trimmed;
        }
        return null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const extracted = extractImageUrl(item);
            if (extracted) {
                return extracted;
            }
        }
        return null;
    }
    if (!isRecord(value)) {
        return null;
    }
    const base64Candidates = [
        value.b64_json,
        value.base64,
        value.image_base64,
        value.imageBase64,
    ];
    for (const candidate of base64Candidates) {
        if (typeof candidate === 'string') {
            const dataUrl = toDataImageUrl(candidate);
            if (dataUrl) {
                return dataUrl;
            }
        }
    }
    const preferredKeys = [
        'url',
        'image_url',
        'imageUrl',
        'sample',
        'sample_url',
        'sampleUrl',
        'output',
        'response_url',
        'responseUrl',
        'result_url',
        'resultUrl',
    ];
    for (const key of preferredKeys) {
        const extracted = extractImageUrl(value[key]);
        if (extracted) {
            return extracted;
        }
    }
    for (const nestedKey of ['data', 'result', 'results', 'images', 'output']) {
        const extracted = extractImageUrl(value[nestedKey]);
        if (extracted) {
            return extracted;
        }
    }
    return null;
};
const extractStatusUrl = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    const candidates = [
        value.polling_url,
        value.pollingUrl,
        value.status_url,
        value.statusUrl,
        value.result_url,
        value.resultUrl,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && /^https?:\/\//.test(candidate.trim())) {
            return candidate.trim();
        }
    }
    return null;
};
const extractRequestId = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    const candidates = [
        value.id,
        value.request_id,
        value.requestId,
        value.job_id,
        value.jobId,
        value.task_id,
        value.taskId,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return null;
};
const parseResponsePayload = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
        const imageBuffer = Buffer.from(await response.arrayBuffer()).toString('base64');
        return {
            image_url: `data:${contentType};base64,${imageBuffer}`,
        };
    }
    if (contentType.includes('application/json')) {
        return response.json().catch(() => null);
    }
    const text = await response.text().catch(() => '');
    return text.trim() ? { message: text } : null;
};
const validateRemoteImageUrl = async (url) => {
    if (url.startsWith('data:image/')) {
        return url;
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    }
    catch {
        throw new Error('Provider returned an invalid image URL');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Provider returned an unsupported image URL');
    }
    const headResponse = await withTimeout(IMAGE_VALIDATION_TIMEOUT_MS, (signal) => fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal,
    }).catch(() => null));
    const headContentType = headResponse?.headers.get('content-type') || '';
    if (headResponse?.ok &&
        (headContentType.startsWith('image/') ||
            headContentType === 'application/octet-stream')) {
        return url;
    }
    const getResponse = await withTimeout(IMAGE_VALIDATION_TIMEOUT_MS, (signal) => fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal,
    }));
    const getContentType = getResponse.headers.get('content-type') || '';
    if (!getResponse.ok ||
        (!getContentType.startsWith('image/') &&
            getContentType !== 'application/octet-stream')) {
        throw new Error(`Provider returned a non-image response (${getResponse.status} ${getContentType || 'unknown'})`);
    }
    return url;
};
const validateRemoteImageUrlWithSignal = async (url, signal) => {
    if (url.startsWith('data:image/')) {
        (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Image generation cancelled by user.');
        return url;
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    }
    catch {
        throw new Error('Provider returned an invalid image URL');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Provider returned an unsupported image URL');
    }
    (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Image generation cancelled by user.');
    const headResponse = await withTimeout(IMAGE_VALIDATION_TIMEOUT_MS, (validationSignal) => fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: validationSignal,
    }).catch(() => null), signal);
    const headContentType = headResponse?.headers.get('content-type') || '';
    if (headResponse?.ok &&
        (headContentType.startsWith('image/') ||
            headContentType === 'application/octet-stream')) {
        return url;
    }
    const getResponse = await withTimeout(IMAGE_VALIDATION_TIMEOUT_MS, (validationSignal) => fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: validationSignal,
    }), signal);
    const getContentType = getResponse.headers.get('content-type') || '';
    if (!getResponse.ok ||
        (!getContentType.startsWith('image/') &&
            getContentType !== 'application/octet-stream')) {
        throw new Error(`Provider returned a non-image response (${getResponse.status} ${getContentType || 'unknown'})`);
    }
    return url;
};
const toModelPath = (model) => model
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
const buildDefaultHuggingFaceEndpoints = (model) => {
    const modelPath = toModelPath(model);
    return [
        `${HF_ROUTER_INFERENCE_BASE_URL}/${modelPath}`,
        `${HF_INFERENCE_BASE_URL}/${modelPath}`,
    ];
};
const normalizeHuggingFaceEndpoint = (configuredEndpoint, model) => {
    const modelPath = toModelPath(model);
    if (!configuredEndpoint) {
        return `${HF_ROUTER_INFERENCE_BASE_URL}/${modelPath}`;
    }
    try {
        const parsedUrl = new URL(configuredEndpoint);
        const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');
        if (parsedUrl.hostname === 'huggingface.co' ||
            parsedUrl.hostname.endsWith('.huggingface.co')) {
            parsedUrl.protocol = 'https:';
            parsedUrl.host = 'router.huggingface.co';
        }
        if (!normalizedPath || normalizedPath === '/') {
            parsedUrl.pathname = `/hf-inference/models/${modelPath}`;
            parsedUrl.search = '';
            return parsedUrl.toString();
        }
        if (normalizedPath === '/models') {
            parsedUrl.pathname = `/hf-inference/models/${modelPath}`;
            parsedUrl.search = '';
            return parsedUrl.toString();
        }
        if (normalizedPath.startsWith('/hf-inference/models/')) {
            parsedUrl.pathname = normalizedPath;
            return parsedUrl.toString();
        }
        if (normalizedPath.startsWith('/models/')) {
            parsedUrl.pathname = `/hf-inference${normalizedPath}`;
            return parsedUrl.toString();
        }
        parsedUrl.pathname = `/hf-inference/models/${modelPath}`;
        parsedUrl.search = '';
        return parsedUrl.toString();
    }
    catch {
        return `${HF_ROUTER_INFERENCE_BASE_URL}/${modelPath}`;
    }
};
const resolveFluxConfig = () => {
    const apiKey = getOptionalEnv('HUGGINGFACE_API_KEY');
    if (!apiKey) {
        throw new Error('HUGGINGFACE_API_KEY is not configured');
    }
    const configuredEndpoint = getOptionalEnv('FLUX_API_ENDPOINT');
    const configuredStatusEndpoint = getOptionalEnv('FLUX_STATUS_ENDPOINT');
    const model = getOptionalEnv('FLUX_MODEL_ID') ||
        getOptionalEnv('FLUX_IMAGE_MODEL') ||
        DEFAULT_HF_FLUX_MODEL;
    const isHuggingFaceToken = apiKey.startsWith('hf_');
    const shouldUseHuggingFaceDefault = isHuggingFaceToken &&
        (!configuredEndpoint || configuredEndpoint === KNOWN_BFL_FLUX_ENDPOINT);
    const isExplicitHuggingFaceEndpoint = Boolean(configuredEndpoint && configuredEndpoint.includes('huggingface.co'));
    const normalizedHuggingFaceEndpoint = normalizeHuggingFaceEndpoint(configuredEndpoint, model);
    const endpointCandidates = shouldUseHuggingFaceDefault || isExplicitHuggingFaceEndpoint
        ? Array.from(new Set([
            normalizedHuggingFaceEndpoint,
            ...buildDefaultHuggingFaceEndpoints(model),
        ]))
        : [configuredEndpoint || KNOWN_BFL_FLUX_ENDPOINT];
    const endpoint = shouldUseHuggingFaceDefault || isExplicitHuggingFaceEndpoint
        ? normalizedHuggingFaceEndpoint
        : configuredEndpoint || KNOWN_BFL_FLUX_ENDPOINT;
    const mode = shouldUseHuggingFaceDefault
        ? 'huggingface'
        : endpoint.includes('huggingface.co')
            ? 'huggingface'
            : endpoint.includes('bfl.ai')
                ? 'bfl'
                : 'generic';
    return {
        apiKey,
        endpoint,
        endpointCandidates,
        mode,
        model,
        statusEndpoint: configuredStatusEndpoint,
    };
};
const getFluxHeaders = (config) => {
    if (config.mode === 'bfl') {
        return {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
            'x-key': config.apiKey,
        };
    }
    return {
        'Content-Type': 'application/json',
        Accept: 'image/png, application/json',
        Authorization: `Bearer ${config.apiKey}`,
    };
};
const getPixazoHeaders = () => {
    const apiKey = getOptionalEnv('PIXAZO_API_KEY');
    if (!apiKey) {
        throw new Error('PIXAZO_API_KEY is not configured');
    }
    return {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Ocp-Apim-Subscription-Key': apiKey,
    };
};
const getAimlApiKey = () => getOptionalEnv('AIMLAPI_KEY');
const pollFluxStatusUrl = async (config, statusUrl, deadlineAt) => {
    for (let attempt = 0; attempt < FLUX_MAX_POLLS; attempt += 1) {
        await sleepWithinDeadline(deadlineAt, FLUX_POLL_INTERVAL_MS);
        const payload = await runWithDeadline(deadlineAt, async (signal) => {
            const response = await fetch(statusUrl, {
                method: 'GET',
                headers: getFluxHeaders(config),
                signal,
            });
            const nextPayload = await parseResponsePayload(response);
            if (!response.ok) {
                throw new Error(toErrorMessage(nextPayload, 'Flux status polling failed'));
            }
            return nextPayload;
        });
        const imageUrl = extractImageUrl(payload);
        if (imageUrl) {
            return validateRemoteImageUrl(imageUrl);
        }
        const statusValue = isRecord(payload) && typeof payload.status === 'string'
            ? payload.status.toLowerCase()
            : '';
        if (statusValue &&
            ['failed', 'error', 'cancelled', 'rejected'].includes(statusValue)) {
            throw new Error(toErrorMessage(payload, 'Flux image generation failed'));
        }
    }
    throw new Error('Flux image generation timed out before returning an image');
};
const pollFluxRequest = async (config, requestId, deadlineAt) => {
    if (!config.statusEndpoint) {
        throw new Error('Flux did not return an image URL');
    }
    const statusEndpoint = config.statusEndpoint;
    const usesPathPlaceholder = statusEndpoint.includes('{id}');
    for (let attempt = 0; attempt < FLUX_MAX_POLLS; attempt += 1) {
        await sleepWithinDeadline(deadlineAt, FLUX_POLL_INTERVAL_MS);
        const payload = await runWithDeadline(deadlineAt, async (signal) => {
            const response = await fetch(usesPathPlaceholder
                ? statusEndpoint.replace('{id}', encodeURIComponent(requestId))
                : statusEndpoint, {
                method: usesPathPlaceholder ? 'GET' : 'POST',
                headers: getFluxHeaders(config),
                body: usesPathPlaceholder
                    ? undefined
                    : JSON.stringify({
                        id: requestId,
                        request_id: requestId,
                    }),
                signal,
            });
            const nextPayload = await parseResponsePayload(response);
            if (!response.ok) {
                throw new Error(toErrorMessage(nextPayload, 'Flux status polling failed'));
            }
            return nextPayload;
        });
        const imageUrl = extractImageUrl(payload);
        if (imageUrl) {
            return validateRemoteImageUrl(imageUrl);
        }
        const statusValue = isRecord(payload) && typeof payload.status === 'string'
            ? payload.status.toLowerCase()
            : '';
        if (statusValue &&
            ['failed', 'error', 'cancelled', 'rejected'].includes(statusValue)) {
            throw new Error(toErrorMessage(payload, 'Flux image generation failed'));
        }
    }
    throw new Error('Flux image generation timed out before returning an image');
};
const generateWithCloudflareWorker = async (prompt, input) => {
    if (input.sourceImageUrl) {
        throw new Error('Cloudflare Worker image generation does not support source-image guided generation in this pipeline');
    }
    const { endpoint, apiKey } = getCloudflareWorkerConfig();
    const workerPrompt = truncatePrompt(prompt, 2400);
    const payload = await withTimeout(CLOUDFLARE_WORKER_TIMEOUT_MS, async (signal) => {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: workerPrompt,
            }),
            signal,
        });
        const nextPayload = await parseResponsePayload(response);
        if (!response.ok) {
            throw new Error(toErrorMessage(nextPayload, 'Cloudflare Worker image generation failed'));
        }
        return nextPayload;
    });
    const imageUrl = extractImageUrl(payload);
    if (!imageUrl) {
        throw new Error('Cloudflare Worker did not return an image');
    }
    return validateRemoteImageUrl(imageUrl);
};
const generateWithHuggingFaceFlux = async (config, prompt, input, deadlineAt) => {
    if (input.sourceImageUrl) {
        throw new Error('Flux Hugging Face inference does not support source-image guided generation in this pipeline');
    }
    const huggingFaceModule = await loadHuggingFaceInferenceModule();
    const client = new huggingFaceModule.InferenceClient(config.apiKey);
    const width = normalizeDimension(input.width, 768);
    const height = normalizeDimension(input.height, 768);
    const negativePrompt = input.negativePrompt?.trim();
    console.info('[image-generation] flux huggingface client', {
        model: config.model,
    });
    const imageUrl = await runWithDeadline(deadlineAt, (signal) => client.textToImage({
        model: config.model,
        inputs: prompt,
        parameters: {
            num_inference_steps: 5,
            width,
            height,
            ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        },
    }, {
        signal,
        outputType: 'dataUrl',
    }));
    return validateRemoteImageUrl(imageUrl);
};
const generateWithFlux = async (prompt, input) => {
    const config = resolveFluxConfig();
    const deadlineAt = createDeadline(FLUX_TIMEOUT_MS);
    const fluxPrompt = truncatePrompt(prompt, 2400);
    const width = normalizeDimension(input.width, 768);
    const height = normalizeDimension(input.height, 768);
    if (config.mode === 'huggingface') {
        return generateWithHuggingFaceFlux(config, fluxPrompt, input, deadlineAt);
    }
    const requestBody = JSON.stringify({
        prompt: fluxPrompt,
        width,
        height,
        ...(getOptionalEnv('FLUX_IMAGE_MODEL')
            ? { model: config.model }
            : {}),
        ...(input.sourceImageUrl
            ? {
                source_image_url: input.sourceImageUrl,
            }
            : {}),
    });
    let payload = null;
    let lastError = null;
    console.info('[image-generation] flux endpoint candidates', {
        endpoints: config.endpointCandidates,
    });
    for (const endpoint of config.endpointCandidates) {
        try {
            payload = await runWithDeadline(deadlineAt, async (signal) => {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: getFluxHeaders(config),
                    body: requestBody,
                    signal,
                });
                const nextPayload = await parseResponsePayload(response);
                if (!response.ok) {
                    throw new Error(toErrorMessage(nextPayload, 'Flux image generation failed'));
                }
                return nextPayload;
            });
            break;
        }
        catch (error) {
            console.warn('[image-generation] flux endpoint failed', {
                endpoint,
                error: toErrorMessage(error, 'Flux image generation failed'),
            });
            lastError =
                error instanceof Error ? error : new Error('Flux image generation failed');
        }
    }
    if (!payload) {
        throw lastError || new Error('Flux image generation failed');
    }
    const imageUrl = extractImageUrl(payload);
    if (imageUrl) {
        return validateRemoteImageUrl(imageUrl);
    }
    const statusUrl = extractStatusUrl(payload);
    if (statusUrl) {
        return pollFluxStatusUrl(config, statusUrl, deadlineAt);
    }
    const requestId = extractRequestId(payload);
    if (requestId) {
        return pollFluxRequest(config, requestId, deadlineAt);
    }
    throw new Error(toErrorMessage(payload, 'Flux did not return an image URL'));
};
const generateWithPixazo = async (prompt, input, signal) => {
    const deadlineAt = createDeadline(PIXAZO_TIMEOUT_MS);
    const pixazoPrompt = truncatePrompt(prompt, 2400);
    const width = normalizeDimension(input.width, 768);
    const height = normalizeDimension(input.height, 768);
    const seed = Date.now();
    const headers = getPixazoHeaders();
    (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Image generation cancelled by user.');
    const initialPayload = await runWithDeadline(deadlineAt, async (providerSignal) => {
        const response = await fetch(PIXAZO_GENERATE_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                prompt: pixazoPrompt,
                num_steps: 4,
                width,
                height,
                seed,
                ...(input.sourceImageUrl ? { image_urls: [input.sourceImageUrl] } : {}),
            }),
            signal: providerSignal,
        });
        const nextPayload = await parseResponsePayload(response);
        if (!response.ok) {
            throw new Error(toErrorMessage(nextPayload, 'Pixazo text-to-image request failed'));
        }
        return nextPayload;
    }, signal);
    const immediateUrl = extractImageUrl(initialPayload);
    if (immediateUrl) {
        return validateRemoteImageUrlWithSignal(immediateUrl, signal);
    }
    const requestId = extractRequestId(initialPayload);
    if (!requestId) {
        throw new Error('Pixazo did not return a request ID for polling');
    }
    for (let attempt = 0; attempt < PIXAZO_MAX_POLLS; attempt += 1) {
        await sleepWithinDeadline(deadlineAt, PIXAZO_POLL_INTERVAL_MS, signal);
        const statusPayload = await runWithDeadline(deadlineAt, async (providerSignal) => {
            const response = await fetch(PIXAZO_STATUS_ENDPOINT, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    requestId,
                    request_id: requestId,
                }),
                signal: providerSignal,
            });
            const nextPayload = await parseResponsePayload(response);
            if (!response.ok) {
                throw new Error(toErrorMessage(nextPayload, 'Pixazo status polling failed'));
            }
            return nextPayload;
        }, signal);
        const imageUrl = extractImageUrl(statusPayload);
        if (imageUrl) {
            return validateRemoteImageUrlWithSignal(imageUrl, signal);
        }
        const statusValue = isRecord(statusPayload) && typeof statusPayload.status === 'string'
            ? statusPayload.status.toLowerCase()
            : '';
        if (statusValue &&
            ['failed', 'error', 'cancelled', 'rejected'].includes(statusValue)) {
            throw new Error(toErrorMessage(statusPayload, 'Pixazo image generation failed'));
        }
    }
    throw new Error('Pixazo image generation timed out before returning an image');
};
const generateWithAimlApi = async (prompt, input) => {
    const apiKey = getAimlApiKey();
    if (!apiKey) {
        throw new Error('AIMLAPI_KEY is not configured');
    }
    const deadlineAt = createDeadline(AIMLAPI_TIMEOUT_MS);
    const aimlPrompt = truncatePrompt(prompt, 1900);
    const width = normalizeDimension(input.width, 768);
    const height = normalizeDimension(input.height, 768);
    const payload = await runWithDeadline(deadlineAt, async (signal) => {
        const response = await fetch(AIMLAPI_GENERATE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: DEFAULT_AIMLAPI_MODEL,
                prompt: aimlPrompt,
                response_format: 'url',
                n: 1,
                image_size: {
                    width,
                    height,
                },
                ...(input.sourceImageUrl ? { image_urls: [input.sourceImageUrl] } : {}),
            }),
            signal,
        });
        const nextPayload = await parseResponsePayload(response);
        if (!response.ok) {
            throw new Error(toErrorMessage(nextPayload, 'AIML image generation request failed'));
        }
        return nextPayload;
    });
    const imageUrl = extractImageUrl(payload);
    if (!imageUrl) {
        throw new Error('AIML did not return an image URL');
    }
    return validateRemoteImageUrl(imageUrl);
};
const providers = [
    {
        provider: 'pixazo',
        generate: generateWithPixazo,
    },
];
const tryProvider = async (provider, prompt, input, signal, onProviderChange) => {
    if (await (0, providerCircuit_service_1.isProviderCircuitOpen)('image', provider.provider)) {
        const failure = classifyProviderFailure(provider.provider, `${provider.provider} temporarily skipped after repeated failures`);
        return {
            success: false,
            provider: provider.provider,
            failure,
        };
    }
    try {
        await onProviderChange?.(provider.provider);
        (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Image generation cancelled by user.');
        const imageUrl = await provider.generate(prompt, input, signal);
        await (0, providerCircuit_service_1.recordProviderCircuitSuccess)('image', provider.provider);
        return {
            success: true,
            provider: provider.provider,
            imageUrl,
        };
    }
    catch (error) {
        if (error instanceof requestCancellation_1.RequestCancelledError) {
            throw error;
        }
        const failure = classifyProviderFailure(provider.provider, error);
        await (0, providerCircuit_service_1.recordProviderCircuitFailure)('image', provider.provider);
        console.warn(`[image-generation] ${provider.provider} provider failed`, {
            code: failure.code,
            error: failure.message,
        });
        return {
            success: false,
            provider: provider.provider,
            failure,
        };
    }
};
const generateProductImage = async (brandProfile, input, options = {}) => {
    const promptUsed = buildImagePrompt(brandProfile, input, {
        trendIntelligence: options.trendIntelligence,
        brandMemories: options.brandMemories,
        contentContext: options.contentContext,
    });
    const failures = [];
    const signal = options.signal;
    for (const provider of providers) {
        (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Image generation cancelled by user.');
        const result = await tryProvider(provider, promptUsed, input, signal, options.onProviderChange);
        if (result.success) {
            return {
                imageUrl: result.imageUrl,
                provider: result.provider,
                promptUsed,
            };
        }
        failures.push(result.failure);
    }
    throw new ImageGenerationProvidersExhaustedError(failures);
};
exports.generateProductImage = generateProductImage;
