"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSourceImageUrl = exports.importSourceImageUrl = exports.uploadSourceImage = exports.getWatermarkedImage = exports.getImageHistory = exports.generateImage = void 0;
const imageGen_1 = require("../ai/imageGen");
const brandProfiles_1 = require("../db/queries/brandProfiles");
const images_1 = require("../db/queries/images");
const supabase_1 = require("../db/supabase");
const imageRuntimePolicy_service_1 = require("../services/imageRuntimePolicy.service");
const storage_service_1 = require("../services/storage.service");
const requestCancellation_1 = require("../lib/requestCancellation");
const r2Storage_service_1 = require("../services/r2Storage.service");
const imageGenerationQueue_service_1 = require("../services/imageGenerationQueue.service");
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
const escapeXml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const inferImageMimeType = (contentType, sourceUrl) => {
    if (contentType) {
        const normalized = contentType.split(';')[0]?.trim().toLowerCase();
        if (normalized.startsWith('image/')) {
            return normalized;
        }
    }
    const pathname = sourceUrl.toLowerCase();
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
        return 'image/jpeg';
    }
    if (pathname.endsWith('.webp')) {
        return 'image/webp';
    }
    if (pathname.endsWith('.gif')) {
        return 'image/gif';
    }
    return 'image/png';
};
const buildWatermarkedSvg = (embeddedImageUrl) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="prixmoai-watermark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070a10" stop-opacity="0.92" />
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.78" />
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="#090c12" />
  <image href="${embeddedImageUrl}" x="0" y="0" width="1200" height="1200" preserveAspectRatio="xMidYMid meet" />
  <g transform="translate(0 0)">
    <rect x="844" y="44" width="304" height="84" rx="30" fill="url(#prixmoai-watermark-gradient)" stroke="#ffffff" stroke-opacity="0.14" />
    <text
      x="1102"
      y="96"
      fill="#ffffff"
      fill-opacity="0.96"
      font-size="34"
      font-family="Arial, Helvetica, sans-serif"
      font-weight="700"
      letter-spacing="6"
      text-anchor="end"
    >
      PRIXMOAI
    </text>
  </g>
</svg>`;
const logImageGenerationFailure = (scope, userId, error) => {
    if (error instanceof imageGen_1.ImageGenerationProvidersExhaustedError) {
        console.error(`[${scope}] All image generation providers failed`, {
            userId,
            failures: error.failures,
        });
        return;
    }
    console.error(`[${scope}] Image generation failed`, {
        userId,
        error: error instanceof Error ? error.message : error,
    });
};
const generateImage = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const cancellation = (0, requestCancellation_1.createRequestCancellation)(req, res);
    try {
        console.info('[image] Generate image request started', {
            userId: req.user.id,
            productName: req.body.productName,
            contentId: req.body.contentId ?? null,
        });
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
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
        (0, requestCancellation_1.throwIfRequestCancelled)(cancellation.signal, 'Image generation cancelled by user.');
        const storedImageAsset = await (0, r2Storage_service_1.storeGeneratedImageInR2)({
            userId: req.user.id,
            productName: generationInput.productName,
            imageUrl: result.imageUrl,
            signal: cancellation.signal,
        });
        const image = await (0, images_1.saveGeneratedImage)(client, req.user.id, {
            contentId: generationInput.contentId ?? null,
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
        await (0, images_1.trackImageGenerationUsage)(client, req.user.id, {
            imageId: image.id,
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
        console.info('[image] Generate image request succeeded', {
            userId: req.user.id,
            imageId: image.id,
            provider: result.provider,
            contentId: generationInput.contentId ?? null,
        });
        return res.status(200).json({
            status: 'success',
            message: `Image generated successfully using ${result.provider}`,
            data: {
                ...image,
                provider: result.provider,
            },
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
            console.info('[image] Image generation request cancelled', {
                userId: req.user?.id ?? 'unknown-user',
            });
            return;
        }
        logImageGenerationFailure('image', req.user?.id ?? 'unknown-user', error);
        const message = error instanceof imageGen_1.ImageGenerationProvidersExhaustedError
            ? error.message
            : error instanceof Error
                ? error.message
                : 'Failed to generate image';
        return res.status(502).json({
            status: 'error',
            message,
        });
    }
    finally {
        cancellation.cleanup();
    }
};
exports.generateImage = generateImage;
const getImageHistory = async (req, res) => {
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
        const history = await (0, images_1.getGeneratedImageHistory)(client, req.user.id, {
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
                : 'Failed to fetch image history',
        });
    }
};
exports.getImageHistory = getImageHistory;
const getWatermarkedImage = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const image = await (0, images_1.getGeneratedImageById)(client, req.user.id, req.params.id);
        if (!image) {
            return res.status(404).json({
                status: 'fail',
                message: 'Generated image not found',
            });
        }
        const upstreamResponse = await fetch(image.generatedImageUrl);
        if (!upstreamResponse.ok) {
            throw new Error('Unable to fetch the original generated image');
        }
        const mimeType = inferImageMimeType(upstreamResponse.headers.get('content-type'), image.generatedImageUrl);
        const binary = await upstreamResponse.arrayBuffer();
        const base64 = Buffer.from(binary).toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const svg = buildWatermarkedSvg(escapeXml(dataUrl));
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('Content-Disposition', `inline; filename="prixmoai-watermarked-${image.id}.svg"`);
        return res.status(200).send(svg);
    }
    catch (error) {
        return res.status(502).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to prepare watermarked image',
        });
    }
};
exports.getWatermarkedImage = getWatermarkedImage;
const uploadSourceImage = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const uploadedSourceImage = await (0, storage_service_1.uploadSourceImage)(req.user.id, req.body);
        return res.status(200).json({
            status: 'success',
            message: 'Source media uploaded successfully',
            data: {
                sourceImageUrl: uploadedSourceImage.publicUrl,
                bucket: uploadedSourceImage.bucket,
                path: uploadedSourceImage.path,
                mediaType: uploadedSourceImage.mediaType,
                contentType: uploadedSourceImage.contentType,
            },
        });
    }
    catch (error) {
        return res.status(502).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to upload source media',
        });
    }
};
exports.uploadSourceImage = uploadSourceImage;
const importSourceImageUrl = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const uploadedSourceImage = await (0, storage_service_1.importExternalSourceImage)(req.user.id, req.body.url);
        return res.status(200).json({
            status: 'success',
            message: 'Source media imported successfully',
            data: {
                sourceImageUrl: uploadedSourceImage.publicUrl,
                bucket: uploadedSourceImage.bucket,
                path: uploadedSourceImage.path,
                mediaType: uploadedSourceImage.mediaType,
                contentType: uploadedSourceImage.contentType,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import source media';
        return res.status(message === 'Invalid media URL' || message === 'No preview available for this link'
            ? 400
            : 502).json({
            status: 'error',
            message,
        });
    }
};
exports.importSourceImageUrl = importSourceImageUrl;
const resolveSourceImageUrl = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const resolvedSourceImage = await (0, storage_service_1.resolveExternalSourceImage)(req.body.url);
        return res.status(200).json({
            status: 'success',
            message: 'Source media resolved successfully',
            data: resolvedSourceImage,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to resolve source media';
        return res.status(message === 'Invalid media URL' || message === 'No preview available for this link'
            ? 400
            : 502).json({
            status: 'error',
            message,
        });
    }
};
exports.resolveSourceImageUrl = resolveSourceImageUrl;
