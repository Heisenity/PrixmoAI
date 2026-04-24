"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContentPack = exports.generateStructuredDataWithGroqFallback = exports.generateStructuredDataWithFallback = exports.generateStructuredDataWithProviderOrder = exports.generateContentPackWithFallback = exports.hasMeaningfulReelScript = exports.generateReelScript = exports.generateHashtags = exports.generateCaptions = exports.ContentGenerationProvidersExhaustedError = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
const constants_1 = require("../config/constants");
const caption_prompt_1 = require("./prompts/caption.prompt");
const hashtag_prompt_1 = require("./prompts/hashtag.prompt");
const script_prompt_1 = require("./prompts/script.prompt");
const requestCancellation_1 = require("../lib/requestCancellation");
dotenv_1.default.config();
const CONTENT_GENERATION_RETRY_MESSAGE = 'We couldn’t complete your request right now. Please try again in a moment.';
class ContentGenerationProvidersExhaustedError extends Error {
    constructor(failures) {
        super(CONTENT_GENERATION_RETRY_MESSAGE);
        this.name = 'ContentGenerationProvidersExhaustedError';
        this.failures = failures;
    }
}
exports.ContentGenerationProvidersExhaustedError = ContentGenerationProvidersExhaustedError;
const PROVIDER_TIMEOUTS = {
    gemini: constants_1.GEMINI_GENERATION_TIMEOUT_MS,
    groq: constants_1.GROQ_GENERATION_TIMEOUT_MS,
};
const formatProviderTimeoutLabel = (timeoutMs) => {
    if (timeoutMs % 1000 === 0) {
        return `${timeoutMs / 1000}s`;
    }
    return `${(timeoutMs / 1000).toFixed(1)}s`;
};
const isGeminiImmediateFallbackFailure = (message) => /gemini request failed \((429|500|503)\)/i.test(message) ||
    /status["']?\s*:\s*["']?(UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL)/i.test(message) ||
    /currently experiencing high demand|try again later|resource exhausted|unavailable/i.test(message);
const logContentPhase = (event, details) => {
    console.info(`[content-generation] ${event}`, details);
};
const logStructuredStage = (provider, artifact, stage, details = {}) => {
    console.info('[content-generation] structured-stage', {
        provider,
        artifact,
        stage,
        ...details,
    });
};
const createAdaptiveTimeoutController = (baseSignal) => {
    const controller = new AbortController();
    let firstTokenTimer = null;
    let idleTimer = null;
    let maxTimer = null;
    let timeoutMessage = '';
    const abortWithMessage = (message) => {
        timeoutMessage = message;
        controller.abort();
    };
    const clearTimer = (timer) => {
        if (timer) {
            clearTimeout(timer);
        }
    };
    const startFirstTokenTimer = () => {
        clearTimer(firstTokenTimer);
        firstTokenTimer = setTimeout(() => {
            abortWithMessage(`groq request timed out waiting for first token after ${formatProviderTimeoutLabel(constants_1.GROQ_FIRST_TOKEN_TIMEOUT_MS)}`);
        }, constants_1.GROQ_FIRST_TOKEN_TIMEOUT_MS);
    };
    const resetIdleTimer = () => {
        clearTimer(idleTimer);
        idleTimer = setTimeout(() => {
            abortWithMessage(`groq stream went idle for ${formatProviderTimeoutLabel(constants_1.GROQ_STREAM_IDLE_TIMEOUT_MS)}`);
        }, constants_1.GROQ_STREAM_IDLE_TIMEOUT_MS);
    };
    startFirstTokenTimer();
    maxTimer = setTimeout(() => {
        abortWithMessage(`groq request reached safety cap after ${formatProviderTimeoutLabel(constants_1.GROQ_MAX_GENERATION_TIMEOUT_MS)}`);
    }, constants_1.GROQ_MAX_GENERATION_TIMEOUT_MS);
    const handleBaseAbort = () => {
        controller.abort();
    };
    baseSignal?.addEventListener('abort', handleBaseAbort, { once: true });
    return {
        signal: controller.signal,
        hasTimedOut: () => Boolean(timeoutMessage),
        getTimeoutMessage: () => timeoutMessage,
        markFirstChunkReceived: () => {
            clearTimer(firstTokenTimer);
            firstTokenTimer = null;
            resetIdleTimer();
        },
        markChunkActivity: () => {
            if (firstTokenTimer) {
                clearTimer(firstTokenTimer);
                firstTokenTimer = null;
            }
            resetIdleTimer();
        },
        cleanup: () => {
            clearTimer(firstTokenTimer);
            clearTimer(idleTimer);
            clearTimer(maxTimer);
            baseSignal?.removeEventListener('abort', handleBaseAbort);
        },
    };
};
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
    const combined = Object.values(value)
        .map((entry) => extractTextValue(entry, depth + 1))
        .filter(Boolean)
        .join(' ')
        .trim();
    return combined;
};
const requiredTextSchema = zod_1.z.preprocess((value) => extractTextValue(value), zod_1.z.string().trim().min(1));
const optionalTextSchema = zod_1.z.preprocess((value) => {
    const normalized = extractTextValue(value);
    return normalized || undefined;
}, zod_1.z.string().trim().min(1).optional());
const captionVariantSchema = zod_1.z
    .object({
    hook: requiredTextSchema,
    mainCopy: requiredTextSchema,
    shortCaption: optionalTextSchema,
    Caption: optionalTextSchema,
    cta: requiredTextSchema,
})
    .transform((value) => ({
    hook: value.hook,
    mainCopy: value.mainCopy,
    shortCaption: value.shortCaption ?? value.Caption ?? '',
    cta: value.cta,
}));
const captionResponseSchema = zod_1.z.object({
    captions: zod_1.z.array(captionVariantSchema).min(constants_1.CAPTION_VARIATION_COUNT),
});
const hashtagResponseSchema = zod_1.z.object({
    hashtags: zod_1.z.array(requiredTextSchema).min(constants_1.HASHTAG_VARIATION_COUNT),
});
const reelScriptSchema = zod_1.z.object({
    hook: requiredTextSchema,
    body: requiredTextSchema,
    cta: requiredTextSchema,
});
const reelScriptResponseSchema = zod_1.z.preprocess((value) => {
    if (!isRecord(value)) {
        return value;
    }
    if (isRecord(value.reelScript)) {
        return value;
    }
    const alternate = value.script ?? value.reel_script ?? value.reel ?? value.videoScript;
    return isRecord(alternate)
        ? {
            ...value,
            reelScript: alternate,
        }
        : value;
}, zod_1.z.object({
    reelScript: reelScriptSchema,
}));
const EMPTY_REEL_SCRIPT = {
    hook: '',
    body: '',
    cta: '',
};
const STRUCTURED_PROVIDER_RETRY_LIMIT = {
    gemini: 1,
    groq: 2,
};
const stripMarkdownFences = (rawText) => {
    const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fencedMatch ? fencedMatch[1].trim() : rawText.trim();
};
const buildStructuredFailureSnippet = (rawText) => rawText.replace(/\s+/g, ' ').trim().slice(0, 240);
const extractLikelyJsonCandidate = (rawText) => {
    const candidate = stripMarkdownFences(rawText);
    const firstBrace = candidate.indexOf('{');
    if (firstBrace === -1) {
        return candidate.trim();
    }
    const sliced = candidate.slice(firstBrace);
    const lastBrace = sliced.lastIndexOf('}');
    return (lastBrace === -1 ? sliced : sliced.slice(0, lastBrace + 1)).trim();
};
const removeTrailingJsonCommas = (rawText) => rawText.replace(/,\s*([}\]])/g, '$1');
const closeObviousJsonContainers = (rawText) => {
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const char of rawText) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }
        if (char === '{' || char === '[') {
            stack.push(char);
            continue;
        }
        if (char === '}') {
            if (stack[stack.length - 1] === '{') {
                stack.pop();
            }
            continue;
        }
        if (char === ']') {
            if (stack[stack.length - 1] === '[') {
                stack.pop();
            }
        }
    }
    return `${rawText}${stack
        .reverse()
        .map((token) => (token === '{' ? '}' : ']'))
        .join('')}`;
};
const buildStructuredRetryPrompt = (prompt) => `${prompt}\n\nReturn only one valid JSON object. No markdown, no commentary, no trailing commas.`;
const isRetryableStructuredOutputError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return (/valid json/i.test(message) ||
        /unexpected .* format/i.test(message) ||
        /Expected ',' or '}'/i.test(message) ||
        /unterminated string/i.test(message) ||
        /unexpected end of json/i.test(message) ||
        /unexpected non-whitespace character after json/i.test(message));
};
const parseJsonCandidate = (candidate, strategy) => ({
    value: JSON.parse(candidate),
    strategy,
});
const parseStructuredJson = (rawText) => {
    const strictCandidate = stripMarkdownFences(rawText);
    try {
        return parseJsonCandidate(strictCandidate, 'strict');
    }
    catch {
        const extractedCandidate = extractLikelyJsonCandidate(rawText);
        if (extractedCandidate && extractedCandidate !== strictCandidate) {
            try {
                return parseJsonCandidate(extractedCandidate, 'extracted');
            }
            catch {
                // Fall through to repair path.
            }
        }
        const repairedCandidate = closeObviousJsonContainers(removeTrailingJsonCommas(extractedCandidate || strictCandidate));
        if (repairedCandidate) {
            try {
                return parseJsonCandidate(repairedCandidate, 'repaired');
            }
            catch {
                // Fall through to terminal error below.
            }
        }
        const error = new Error('Provider did not return valid JSON');
        error.rawTextSnippet =
            buildStructuredFailureSnippet(rawText);
        throw error;
    }
};
const normalizeWhitespace = (value) => value.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
const extractLabeledSection = (block, labels, nextLabels) => {
    const match = block.match(new RegExp(`(?:^|\\n)\\s*(?:${labels})\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextLabels})\\s*:|$)`, 'i'));
    return match?.[1]?.trim() ?? '';
};
const getCaptionCandidateBlocks = (rawText) => {
    const normalized = normalizeWhitespace(stripMarkdownFences(rawText));
    const hookBlocks = normalized
        .split(/(?=^\s*hook\s*:)/gim)
        .map((block) => block.trim())
        .filter(Boolean);
    if (hookBlocks.length > 1) {
        return hookBlocks;
    }
    const headingNormalized = normalized.replace(/(?:^|\n)\s*(?:variation|option|caption)\s*\d+\s*:?\s*/gim, '\n@@CAPTION_BLOCK@@\n');
    const headingBlocks = headingNormalized
        .split('@@CAPTION_BLOCK@@')
        .map((block) => block.trim())
        .filter(Boolean);
    return headingBlocks.length > 0 ? headingBlocks : [normalized];
};
const salvageCaptionResponseFromText = (rawText) => {
    const fieldLabels = {
        hook: 'hook',
        mainCopy: 'main\\s*copy|maincopy|main\\s*caption|body|copy',
        shortCaption: 'short\\s*caption|caption',
        cta: 'cta|call\\s*to\\s*action',
    };
    const nextLabels = Object.values(fieldLabels).join('|');
    const captions = getCaptionCandidateBlocks(rawText)
        .map((block) => ({
        hook: extractLabeledSection(block, fieldLabels.hook, nextLabels),
        mainCopy: extractLabeledSection(block, fieldLabels.mainCopy, nextLabels),
        shortCaption: extractLabeledSection(block, fieldLabels.shortCaption, nextLabels),
        cta: extractLabeledSection(block, fieldLabels.cta, nextLabels),
    }))
        .filter((caption) => caption.hook &&
        caption.mainCopy &&
        caption.shortCaption &&
        caption.cta)
        .slice(0, constants_1.CAPTION_VARIATION_COUNT);
    return captions.length >= constants_1.CAPTION_VARIATION_COUNT ? { captions } : null;
};
const salvageHashtagResponseFromText = (rawText) => {
    const normalized = normalizeWhitespace(stripMarkdownFences(rawText));
    const explicitHashtags = normalized.match(/#[\p{L}\p{N}_][\p{L}\p{N}_]*/gu) ?? [];
    if (explicitHashtags.length >= constants_1.HASHTAG_VARIATION_COUNT) {
        return { hashtags: explicitHashtags };
    }
    const fallbackHashtags = normalized
        .split(/[\n,]/)
        .map((value) => value
        .replace(/^[\s*-]+/, '')
        .replace(/^\d+[.)-]\s*/, '')
        .trim())
        .filter((value) => value &&
        value.length <= 40 &&
        value.split(/\s+/).length <= 3 &&
        !/[{}[\]":]/.test(value))
        .map((value) => (value.startsWith('#') ? value : `#${value}`));
    return fallbackHashtags.length >= constants_1.HASHTAG_VARIATION_COUNT
        ? { hashtags: fallbackHashtags }
        : null;
};
const salvageReelScriptResponseFromText = (rawText) => {
    const normalized = normalizeWhitespace(stripMarkdownFences(rawText));
    const nextLabels = 'hook|body|cta|call\\s*to\\s*action';
    const labeled = {
        hook: extractLabeledSection(normalized, 'hook', nextLabels),
        body: extractLabeledSection(normalized, 'body', nextLabels),
        cta: extractLabeledSection(normalized, 'cta|call\\s*to\\s*action', nextLabels),
    };
    if (labeled.hook && labeled.body && labeled.cta) {
        return {
            reelScript: labeled,
        };
    }
    const blocks = normalized
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);
    if (blocks.length >= 3) {
        return {
            reelScript: {
                hook: blocks[0],
                body: blocks.slice(1, -1).join('\n\n'),
                cta: blocks[blocks.length - 1] ?? '',
            },
        };
    }
    return null;
};
const salvageStructuredResponseFromText = (artifact, rawText) => {
    switch (artifact) {
        case 'captions':
            return salvageCaptionResponseFromText(rawText);
        case 'hashtags':
            return salvageHashtagResponseFromText(rawText);
        case 'reel-script':
            return salvageReelScriptResponseFromText(rawText);
        default:
            return null;
    }
};
const toProviderErrorMessage = (provider, responseText, status) => {
    const compactText = responseText.trim().replace(/\s+/g, ' ').slice(0, 280);
    if (compactText) {
        return `${provider} request failed (${status}): ${compactText}`;
    }
    return `${provider} request failed (${status})`;
};
const withTimeout = async (provider, operation, requestSignal) => {
    if (provider === 'groq') {
        (0, requestCancellation_1.throwIfRequestCancelled)(requestSignal);
        return operation(requestSignal ?? new AbortController().signal);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUTS[provider]);
    const handleRequestAbort = () => {
        controller.abort();
    };
    requestSignal?.addEventListener('abort', handleRequestAbort, {
        once: true,
    });
    try {
        (0, requestCancellation_1.throwIfRequestCancelled)(requestSignal);
        return await operation(controller.signal);
    }
    catch (error) {
        if ((0, requestCancellation_1.isAbortError)(error)) {
            if (requestSignal?.aborted) {
                throw new requestCancellation_1.RequestCancelledError();
            }
            throw new Error(`${provider} request timed out after ${formatProviderTimeoutLabel(PROVIDER_TIMEOUTS[provider])}`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
        requestSignal?.removeEventListener('abort', handleRequestAbort);
    }
};
const callGemini = async (prompt, signal) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
    }
    const startedAt = Date.now();
    logContentPhase('started', {
        provider: 'gemini',
        kind: 'request',
        promptChars: prompt.length,
    });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${constants_1.DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
            },
        }),
        signal,
    });
    if (!response.ok) {
        throw new Error(toProviderErrorMessage('gemini', await response.text(), response.status));
    }
    const data = (await response.json());
    const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('\n')
        .trim();
    if (!text) {
        throw new Error('gemini returned an empty response');
    }
    logContentPhase('succeeded', {
        provider: 'gemini',
        kind: 'request',
        durationMs: Date.now() - startedAt,
        responseChars: text.length,
    });
    return text;
};
const extractGroqStreamChunkText = (payload) => {
    const parsed = JSON.parse(payload);
    return parsed.choices?.[0]?.delta?.content ?? '';
};
const readGroqStreamText = async (response, signal, adaptiveTimeout, onFirstChunk) => {
    if (!response.body) {
        throw new Error('groq returned an empty response stream');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let combinedText = '';
    let hasReceivedFirstChunk = false;
    try {
        while (true) {
            (0, requestCancellation_1.throwIfRequestCancelled)(signal);
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!hasReceivedFirstChunk) {
                adaptiveTimeout.markFirstChunkReceived();
                hasReceivedFirstChunk = true;
                onFirstChunk?.();
            }
            else {
                adaptiveTimeout.markChunkActivity();
            }
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            for (const event of events) {
                const lines = event
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean);
                for (const line of lines) {
                    if (!line.startsWith('data:')) {
                        continue;
                    }
                    const payload = line.slice(5).trim();
                    if (!payload || payload === '[DONE]') {
                        continue;
                    }
                    combinedText += extractGroqStreamChunkText(payload);
                }
            }
        }
        const trailing = buffer.trim();
        if (trailing.startsWith('data:')) {
            const payload = trailing.slice(5).trim();
            if (payload && payload !== '[DONE]') {
                combinedText += extractGroqStreamChunkText(payload);
            }
        }
    }
    catch (error) {
        if ((0, requestCancellation_1.isAbortError)(error)) {
            if (adaptiveTimeout.hasTimedOut()) {
                throw new Error(adaptiveTimeout.getTimeoutMessage());
            }
            if (signal.aborted) {
                throw new requestCancellation_1.RequestCancelledError();
            }
        }
        throw error;
    }
    finally {
        reader.releaseLock();
    }
    return combinedText.trim();
};
const callGroq = async (prompt, signal) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY is not configured');
    }
    const adaptiveTimeout = createAdaptiveTimeoutController(signal);
    const startedAt = Date.now();
    let firstChunkAt = null;
    logContentPhase('started', {
        provider: 'groq',
        kind: 'stream-request',
        promptChars: prompt.length,
    });
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: constants_1.DEFAULT_GROQ_MODEL,
                temperature: 0,
                stream: true,
                response_format: {
                    type: 'json_object',
                },
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
            signal: adaptiveTimeout.signal,
        });
        if (!response.ok) {
            throw new Error(toProviderErrorMessage('groq', await response.text(), response.status));
        }
        const text = await readGroqStreamText(response, adaptiveTimeout.signal, adaptiveTimeout, () => {
            if (firstChunkAt === null) {
                firstChunkAt = Date.now();
                logContentPhase('started', {
                    provider: 'groq',
                    kind: 'first-token',
                    afterMs: firstChunkAt - startedAt,
                });
            }
        });
        if (!text) {
            throw new Error('groq returned an empty response');
        }
        logContentPhase('succeeded', {
            provider: 'groq',
            kind: 'stream-request',
            durationMs: Date.now() - startedAt,
            firstTokenAfterMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
            responseChars: text.length,
        });
        return text;
    }
    catch (error) {
        logContentPhase('failed', {
            provider: 'groq',
            kind: 'stream-request',
            durationMs: Date.now() - startedAt,
            firstTokenAfterMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
            error: error instanceof Error ? error.message : error,
        });
        if ((0, requestCancellation_1.isAbortError)(error)) {
            if (signal.aborted) {
                throw new requestCancellation_1.RequestCancelledError();
            }
            if (adaptiveTimeout.hasTimedOut()) {
                throw new Error(adaptiveTimeout.getTimeoutMessage());
            }
        }
        throw error;
    }
    finally {
        adaptiveTimeout.cleanup();
    }
};
const callProvider = async (provider, prompt, signal) => withTimeout(provider, (providerSignal) => provider === 'gemini'
    ? callGemini(prompt, providerSignal)
    : callGroq(prompt, providerSignal), signal);
const generateStructuredResponseWithProvider = async (provider, prompt, schema, artifact, signal) => {
    const retryLimit = STRUCTURED_PROVIDER_RETRY_LIMIT[provider] ?? 1;
    let attempt = 0;
    let currentPrompt = prompt;
    let lastError = null;
    while (attempt < retryLimit) {
        attempt += 1;
        (0, requestCancellation_1.throwIfRequestCancelled)(signal);
        try {
            const rawText = await callProvider(provider, currentPrompt, signal);
            let parsedJson;
            try {
                const parsed = parseStructuredJson(rawText);
                parsedJson = parsed.value;
            }
            catch (error) {
                logStructuredStage(provider, artifact, 'malformed-json', {
                    attempt,
                    retryLimit,
                    error: error instanceof Error ? error.message : String(error),
                    rawTextSnippet: error instanceof Error && 'rawTextSnippet' in error
                        ? error.rawTextSnippet ?? null
                        : buildStructuredFailureSnippet(rawText),
                });
                const salvaged = salvageStructuredResponseFromText(artifact, rawText);
                if (salvaged !== null) {
                    const salvagedResult = schema.safeParse(salvaged);
                    if (salvagedResult.success) {
                        logStructuredStage(provider, artifact, 'plain-text-salvage-success', {
                            attempt,
                        });
                        if (attempt > 1) {
                            logStructuredStage(provider, artifact, 'retry-recovery-success', {
                                attempt,
                                via: 'plain-text-salvage',
                            });
                        }
                        return salvagedResult.data;
                    }
                    logStructuredStage(provider, artifact, 'plain-text-salvage-failure', {
                        attempt,
                        issues: salvagedResult.error.issues
                            .slice(0, 3)
                            .map((issue) => ({
                            path: issue.path.join('.') || 'response',
                            message: issue.message,
                        })),
                    });
                }
                throw error;
            }
            const result = schema.safeParse(parsedJson);
            if (result.success) {
                if (attempt > 1) {
                    logStructuredStage(provider, artifact, 'retry-recovery-success', {
                        attempt,
                        via: 'structured-json',
                    });
                }
                return result.data;
            }
            logStructuredStage(provider, artifact, 'schema-mismatch', {
                attempt,
                issues: result.error.issues.slice(0, 3).map((issue) => ({
                    path: issue.path.join('.') || 'response',
                    message: issue.message,
                })),
                rawTextSnippet: buildStructuredFailureSnippet(rawText),
            });
            const salvaged = salvageStructuredResponseFromText(artifact, rawText);
            if (salvaged !== null) {
                const salvagedResult = schema.safeParse(salvaged);
                if (salvagedResult.success) {
                    logStructuredStage(provider, artifact, 'plain-text-salvage-success', {
                        attempt,
                    });
                    if (attempt > 1) {
                        logStructuredStage(provider, artifact, 'retry-recovery-success', {
                            attempt,
                            via: 'schema-salvage',
                        });
                    }
                    return salvagedResult.data;
                }
                logStructuredStage(provider, artifact, 'plain-text-salvage-failure', {
                    attempt,
                    issues: salvagedResult.error.issues.slice(0, 3).map((issue) => ({
                        path: issue.path.join('.') || 'response',
                        message: issue.message,
                    })),
                });
            }
            const firstIssue = result.error.issues[0];
            const fieldPath = firstIssue?.path.join('.') || 'response';
            const error = new Error(`${provider} returned an unexpected ${fieldPath} format. Please try again.`);
            error.rawTextSnippet =
                buildStructuredFailureSnippet(rawText);
            throw error;
        }
        catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (/request failed \(\d+\)/i.test(message)) {
                logStructuredStage(provider, artifact, 'provider-http-failure', {
                    attempt,
                    error: message,
                });
            }
            else if (/empty response/i.test(message)) {
                logStructuredStage(provider, artifact, 'empty-response', {
                    attempt,
                    error: message,
                });
            }
            if (!isRetryableStructuredOutputError(error) || attempt >= retryLimit) {
                break;
            }
            console.warn('[content-generation] structured output retry', {
                provider,
                attempt,
                retryLimit,
                error: error instanceof Error ? error.message : String(error),
                rawTextSnippet: error instanceof Error && 'rawTextSnippet' in error
                    ? error.rawTextSnippet ?? null
                    : null,
            });
            currentPrompt = buildStructuredRetryPrompt(prompt);
        }
    }
    if (attempt > 1) {
        logStructuredStage(provider, artifact, 'retry-recovery-failure', {
            attempts: attempt,
            error: lastError instanceof Error ? lastError.message : String(lastError),
        });
    }
    throw lastError instanceof Error
        ? lastError
        : new Error(`${provider} returned an invalid structured response.`);
};
const normalizeHashtag = (value) => {
    const cleaned = value.trim().replace(/\s+/g, '');
    if (!cleaned) {
        return cleaned;
    }
    return cleaned.startsWith('#')
        ? cleaned.toLowerCase()
        : `#${cleaned.toLowerCase()}`;
};
const generateCaptionsWithProvider = async (provider, brandProfile, productInput, signal) => {
    const startedAt = Date.now();
    logContentPhase('started', {
        provider,
        kind: 'captions',
    });
    const response = await generateStructuredResponseWithProvider(provider, (0, caption_prompt_1.buildCaptionPrompt)(brandProfile, productInput), captionResponseSchema, 'captions', signal);
    const captions = response.captions
        .map((caption) => ({
        hook: caption.hook.trim(),
        mainCopy: caption.mainCopy.trim(),
        shortCaption: caption.shortCaption.trim(),
        cta: caption.cta.trim(),
    }))
        .filter((caption) => caption.hook &&
        caption.mainCopy &&
        caption.shortCaption &&
        caption.cta)
        .slice(0, constants_1.CAPTION_VARIATION_COUNT);
    if (captions.length < constants_1.CAPTION_VARIATION_COUNT) {
        throw new Error(`${provider} did not return enough caption options`);
    }
    logContentPhase('succeeded', {
        provider,
        kind: 'captions',
        durationMs: Date.now() - startedAt,
        variants: captions.length,
    });
    return captions;
};
const generateHashtagsWithProvider = async (provider, brandProfile, productInput, signal) => {
    const startedAt = Date.now();
    logContentPhase('started', {
        provider,
        kind: 'hashtags',
    });
    const response = await generateStructuredResponseWithProvider(provider, (0, hashtag_prompt_1.buildHashtagPrompt)(brandProfile, productInput), hashtagResponseSchema, 'hashtags', signal);
    const hashtags = Array.from(new Set(response.hashtags.map(normalizeHashtag).filter(Boolean))).slice(0, constants_1.HASHTAG_VARIATION_COUNT);
    if (hashtags.length < constants_1.HASHTAG_VARIATION_COUNT) {
        throw new Error(`${provider} did not return enough hashtag options`);
    }
    logContentPhase('succeeded', {
        provider,
        kind: 'hashtags',
        durationMs: Date.now() - startedAt,
        variants: hashtags.length,
    });
    return hashtags;
};
const generateReelScriptWithProvider = async (provider, brandProfile, productInput, signal) => {
    const startedAt = Date.now();
    logContentPhase('started', {
        provider,
        kind: 'reel-script',
    });
    const response = await generateStructuredResponseWithProvider(provider, (0, script_prompt_1.buildReelScriptPrompt)(brandProfile, productInput), reelScriptResponseSchema, 'reel-script', signal);
    logContentPhase('succeeded', {
        provider,
        kind: 'reel-script',
        durationMs: Date.now() - startedAt,
        chars: response.reelScript.hook.length +
            response.reelScript.body.length +
            response.reelScript.cta.length,
    });
    return response.reelScript;
};
const generateContentPackWithProvider = async (provider, brandProfile, productInput, options = {}) => {
    const includeReelScript = options.includeReelScript ?? true;
    const signal = options.signal;
    const startedAt = Date.now();
    (0, requestCancellation_1.throwIfRequestCancelled)(signal);
    logContentPhase('started', {
        provider,
        kind: 'content-pack',
        includeReelScript,
    });
    const captionsPromise = generateCaptionsWithProvider(provider, brandProfile, productInput, signal);
    const hashtagsPromise = generateHashtagsWithProvider(provider, brandProfile, productInput, signal);
    const reelScriptPromise = includeReelScript
        ? (async () => {
            try {
                (0, requestCancellation_1.throwIfRequestCancelled)(signal);
                return await generateReelScriptWithProvider(provider, brandProfile, productInput, signal);
            }
            catch (error) {
                if (error instanceof requestCancellation_1.RequestCancelledError) {
                    throw error;
                }
                console.warn(`[content-generation] ${provider} reel script generation failed; continuing with captions and hashtags only.`, error instanceof Error ? error.message : error);
                return EMPTY_REEL_SCRIPT;
            }
        })()
        : Promise.resolve(EMPTY_REEL_SCRIPT);
    const [captionsResult, hashtagsResult, reelScriptResult] = await Promise.allSettled([
        captionsPromise,
        hashtagsPromise,
        reelScriptPromise,
    ]);
    if (captionsResult.status === 'rejected') {
        throw captionsResult.reason;
    }
    if (hashtagsResult.status === 'rejected') {
        throw hashtagsResult.reason;
    }
    if (reelScriptResult.status === 'rejected') {
        throw reelScriptResult.reason;
    }
    const captions = captionsResult.value;
    const hashtags = hashtagsResult.value;
    const reelScript = reelScriptResult.value;
    logContentPhase('succeeded', {
        provider,
        kind: 'content-pack',
        durationMs: Date.now() - startedAt,
        hasReelScript: (0, exports.hasMeaningfulReelScript)(reelScript),
    });
    return {
        captions,
        hashtags,
        reelScript,
    };
};
const generateCaptions = async (brandProfile, productInput) => generateCaptionsWithProvider('gemini', brandProfile, productInput);
exports.generateCaptions = generateCaptions;
const generateHashtags = async (brandProfile, productInput) => generateHashtagsWithProvider('gemini', brandProfile, productInput);
exports.generateHashtags = generateHashtags;
const generateReelScript = async (brandProfile, productInput) => generateReelScriptWithProvider('gemini', brandProfile, productInput);
exports.generateReelScript = generateReelScript;
const hasMeaningfulReelScript = (script) => Boolean(script.hook.trim() && script.body.trim() && script.cta.trim());
exports.hasMeaningfulReelScript = hasMeaningfulReelScript;
const generateContentPackWithFallback = async (brandProfile, productInput, options = {}) => {
    const failures = [];
    const startedAt = Date.now();
    (0, requestCancellation_1.throwIfRequestCancelled)(options.signal);
    console.info('[content-generation] Provider flow', {
        primary: 'gemini',
        fallback: 'groq',
    });
    try {
        await options.onProviderChange?.('gemini');
        const contentPack = await generateContentPackWithProvider('gemini', brandProfile, productInput, options);
        return {
            contentPack,
            provider: 'gemini',
        };
    }
    catch (error) {
        if (error instanceof requestCancellation_1.RequestCancelledError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'gemini request failed';
        failures.push({
            provider: 'gemini',
            message,
        });
        console.warn(isGeminiImmediateFallbackFailure(message)
            ? '[content-generation] Gemini overload/unavailable detected; falling back to Groq immediately.'
            : '[content-generation] Gemini failed; falling back to Groq.', message);
        logContentPhase('failed', {
            provider: 'gemini',
            kind: 'content-pack',
            durationMs: Date.now() - startedAt,
            error: message,
        });
    }
    try {
        await options.onProviderChange?.('groq');
        const contentPack = await generateContentPackWithProvider('groq', brandProfile, productInput, options);
        return {
            contentPack,
            provider: 'groq',
        };
    }
    catch (error) {
        if (error instanceof requestCancellation_1.RequestCancelledError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'groq request failed';
        failures.push({
            provider: 'groq',
            message,
        });
        logContentPhase('failed', {
            provider: 'groq',
            kind: 'content-pack',
            durationMs: Date.now() - startedAt,
            error: message,
        });
        throw new ContentGenerationProvidersExhaustedError(failures);
    }
};
exports.generateContentPackWithFallback = generateContentPackWithFallback;
const generateStructuredDataWithProviderOrder = async (prompt, schema, artifact, providerOrder, options = {}) => {
    const failures = [];
    const startedAt = Date.now();
    (0, requestCancellation_1.throwIfRequestCancelled)(options.signal);
    for (const provider of providerOrder) {
        logContentPhase('started', {
            provider,
            kind: artifact,
        });
        try {
            await options.onProviderChange?.(provider);
            const data = await generateStructuredResponseWithProvider(provider, prompt, schema, artifact, options.signal);
            logContentPhase('succeeded', {
                provider,
                kind: artifact,
                durationMs: Date.now() - startedAt,
            });
            return {
                data,
                provider,
            };
        }
        catch (error) {
            if (error instanceof requestCancellation_1.RequestCancelledError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : `${provider} request failed`;
            failures.push({
                provider,
                message,
            });
            logContentPhase('failed', {
                provider,
                kind: artifact,
                durationMs: Date.now() - startedAt,
                error: message,
            });
        }
    }
    throw new ContentGenerationProvidersExhaustedError(failures);
};
exports.generateStructuredDataWithProviderOrder = generateStructuredDataWithProviderOrder;
const generateStructuredDataWithFallback = async (prompt, schema, artifact, options = {}) => (0, exports.generateStructuredDataWithProviderOrder)(prompt, schema, artifact, ['gemini', 'groq'], options);
exports.generateStructuredDataWithFallback = generateStructuredDataWithFallback;
const generateStructuredDataWithGroqFallback = async (prompt, schema, artifact, options = {}) => (0, exports.generateStructuredDataWithProviderOrder)(prompt, schema, artifact, ['groq', 'gemini'], options);
exports.generateStructuredDataWithGroqFallback = generateStructuredDataWithGroqFallback;
const generateContentPack = async (brandProfile, productInput, options = {}) => {
    const result = await (0, exports.generateContentPackWithFallback)(brandProfile, productInput, options);
    return result.contentPack;
};
exports.generateContentPack = generateContentPack;
