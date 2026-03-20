"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageHistory = exports.generateImage = void 0;
const imageGen_1 = require("../ai/imageGen");
const images_1 = require("../db/queries/images");
const supabase_1 = require("../db/supabase");
const parsePositiveInt = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const generateImage = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const result = await (0, imageGen_1.generateProductImage)(req.body);
        const image = await (0, images_1.saveGeneratedImage)(client, req.user.id, {
            contentId: req.body.contentId ?? null,
            sourceImageUrl: req.body.sourceImageUrl ?? null,
            generatedImageUrl: result.imageUrl,
            backgroundStyle: req.body.backgroundStyle ?? null,
            prompt: result.promptUsed,
        });
        await (0, images_1.trackImageGenerationUsage)(client, req.user.id, {
            imageId: image.id,
            provider: result.provider,
            contentId: req.body.contentId ?? null,
            productName: req.body.productName,
            productDescription: req.body.productDescription ?? null,
            backgroundStyle: req.body.backgroundStyle ?? null,
            prompt: result.promptUsed,
            sourceImageUrl: req.body.sourceImageUrl ?? null,
        });
        return res.status(200).json({
            status: 'success',
            message: `Image generated successfully using ${result.provider}`,
            data: {
                ...image,
                provider: result.provider,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate image';
        return res.status(502).json({
            status: 'error',
            message,
        });
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
