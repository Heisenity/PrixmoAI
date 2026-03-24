"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateProductImage = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const PIXAZO_GENERATE_ENDPOINT = 'https://gateway.pixazo.ai/flux-1-schnell/v1/getDataBatch';
const PIXAZO_STATUS_ENDPOINT = 'https://gateway.pixazo.ai/flux-1-schnell/v1/checkStatus';
const AIMLAPI_GENERATE_ENDPOINT = 'https://api.aimlapi.com/v1/images/generations';
const DEFAULT_AIMLAPI_MODEL = process.env.AIMLAPI_IMAGE_MODEL || 'alibaba/wan-2-6-image';
const PIXAZO_TIMEOUT_MS = 75000;
const AIMLAPI_TIMEOUT_MS = 75000;
const IMAGE_VALIDATION_TIMEOUT_MS = 15000;
const PIXAZO_POLL_INTERVAL_MS = 3000;
const PIXAZO_MAX_POLLS = 20;
const buildImagePrompt = (input) => {
    if (input.prompt) {
        return input.prompt.trim();
    }
    const parts = [
        `Create a polished product image for ${input.productName}.`,
        input.productDescription
            ? `Product details: ${input.productDescription}.`
            : null,
        input.backgroundStyle
            ? `Background style: ${input.backgroundStyle}.`
            : 'Background style: clean studio lighting with modern premium aesthetics.',
        'Keep the product in focus and make the final image social-media ready.',
    ];
    return parts.filter(Boolean).join(' ');
};
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const normalizeDimension = (value, fallback) => {
    const safeValue = Number.isFinite(value) && value ? Math.trunc(value) : fallback;
    const bounded = Math.min(1024, Math.max(256, safeValue));
    const snapped = Math.round(bounded / 32) * 32;
    return Math.min(1024, Math.max(256, snapped));
};
const createTimeoutSignal = (timeoutMs) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
};
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
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
    return fallback;
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
    const preferredKeys = [
        'url',
        'image_url',
        'imageUrl',
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
    const requestOptions = {
        redirect: 'follow',
        signal: createTimeoutSignal(IMAGE_VALIDATION_TIMEOUT_MS),
    };
    const headResponse = await fetch(url, {
        ...requestOptions,
        method: 'HEAD',
    }).catch(() => null);
    const headContentType = headResponse?.headers.get('content-type') || '';
    if (headResponse?.ok &&
        (headContentType.startsWith('image/') ||
            headContentType === 'application/octet-stream')) {
        return url;
    }
    const getResponse = await fetch(url, {
        ...requestOptions,
        method: 'GET',
    });
    const getContentType = getResponse.headers.get('content-type') || '';
    if (!getResponse.ok ||
        (!getContentType.startsWith('image/') &&
            getContentType !== 'application/octet-stream')) {
        throw new Error(`Provider returned a non-image response (${getResponse.status} ${getContentType || 'unknown'})`);
    }
    return url;
};
const getPixazoHeaders = () => {
    const apiKey = process.env.PIXAZO_API_KEY;
    if (!apiKey) {
        throw new Error('PIXAZO_API_KEY is not configured');
    }
    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Ocp-Apim-Subscription-Key': apiKey,
    };
    if (process.env.PIXAZO_SECRET_KEY) {
        headers['X-Secret-Key'] = process.env.PIXAZO_SECRET_KEY;
    }
    return headers;
};
const generateWithPixazo = async (prompt, input) => {
    const width = normalizeDimension(input.width, 768);
    const height = normalizeDimension(input.height, 768);
    const seed = Date.now();
    const headers = getPixazoHeaders();
    const initialResponse = await fetch(PIXAZO_GENERATE_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            prompt,
            num_steps: 4,
            width,
            height,
            seed,
        }),
        signal: createTimeoutSignal(PIXAZO_TIMEOUT_MS),
    });
    const initialPayload = (await initialResponse.json().catch(() => null));
    if (!initialResponse.ok) {
        throw new Error(toErrorMessage(initialPayload, 'Pixazo text-to-image request failed'));
    }
    const immediateUrl = extractImageUrl(initialPayload);
    if (immediateUrl) {
        return validateRemoteImageUrl(immediateUrl);
    }
    const requestIdCandidate = initialPayload?.requestId ||
        initialPayload?.request_id ||
        initialPayload?.id ||
        initialPayload?.jobId ||
        initialPayload?.job_id;
    const requestId = typeof requestIdCandidate === 'string' ? requestIdCandidate : null;
    if (!requestId) {
        throw new Error('Pixazo did not return a request ID for polling');
    }
    for (let attempt = 0; attempt < PIXAZO_MAX_POLLS; attempt += 1) {
        await sleep(PIXAZO_POLL_INTERVAL_MS);
        const statusResponse = await fetch(PIXAZO_STATUS_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                requestId,
                request_id: requestId,
            }),
            signal: createTimeoutSignal(PIXAZO_TIMEOUT_MS),
        });
        const statusPayload = (await statusResponse.json().catch(() => null));
        if (!statusResponse.ok) {
            throw new Error(toErrorMessage(statusPayload, 'Pixazo status polling failed'));
        }
        const imageUrl = extractImageUrl(statusPayload);
        if (imageUrl) {
            return validateRemoteImageUrl(imageUrl);
        }
        const statusValue = typeof statusPayload?.status === 'string'
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
    const apiKey = process.env.AIMLAPI_KEY;
    if (!apiKey) {
        throw new Error('AIMLAPI_KEY is not configured');
    }
    const width = normalizeDimension(input.width, 768);
    const height = normalizeDimension(input.height, 768);
    const response = await fetch(AIMLAPI_GENERATE_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: DEFAULT_AIMLAPI_MODEL,
            prompt,
            response_format: 'url',
            n: 1,
            image_size: {
                width,
                height,
            },
            ...(input.sourceImageUrl
                ? { image_urls: [input.sourceImageUrl] }
                : {}),
        }),
        signal: createTimeoutSignal(AIMLAPI_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok) {
        throw new Error(toErrorMessage(payload, 'AIMLAPI image generation request failed'));
    }
    const imageUrl = extractImageUrl(payload);
    if (!imageUrl) {
        throw new Error('AIMLAPI did not return an image URL');
    }
    return validateRemoteImageUrl(imageUrl);
};
const generateProductImage = async (input) => {
    const promptUsed = buildImagePrompt(input);
    if (!input.sourceImageUrl) {
        try {
            const imageUrl = await generateWithPixazo(promptUsed, input);
            return {
                imageUrl,
                provider: 'pixazo',
                promptUsed,
            };
        }
        catch (pixazoError) {
            const pixazoMessage = toErrorMessage(pixazoError, 'Pixazo image generation failed');
            try {
                const imageUrl = await generateWithAimlApi(promptUsed, input);
                return {
                    imageUrl,
                    provider: 'aimlapi',
                    promptUsed,
                };
            }
            catch (aimlError) {
                const aimlMessage = toErrorMessage(aimlError, 'AIMLAPI image generation failed');
                throw new Error(`Pixazo failed: ${pixazoMessage}. AIMLAPI fallback failed: ${aimlMessage}`);
            }
        }
    }
    try {
        const imageUrl = await generateWithAimlApi(promptUsed, input);
        return {
            imageUrl,
            provider: 'aimlapi',
            promptUsed,
        };
    }
    catch (error) {
        throw new Error(`AIMLAPI image generation failed: ${toErrorMessage(error, 'Unknown AIMLAPI error')}`);
    }
};
exports.generateProductImage = generateProductImage;
