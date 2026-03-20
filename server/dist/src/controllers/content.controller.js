"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContent = exports.getContentHistory = exports.generateContent = void 0;
const gemini_1 = require("../ai/gemini");
const brandProfiles_1 = require("../db/queries/brandProfiles");
const content_1 = require("../db/queries/content");
const supabase_1 = require("../db/supabase");
const parsePositiveInt = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const generateContent = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const brandProfile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, req.user.id);
        const contentPack = await (0, gemini_1.generateContentPack)(brandProfile, req.body);
        const content = await (0, content_1.saveGeneratedContent)(client, req.user.id, {
            ...req.body,
            brandProfileId: brandProfile?.id ?? null,
            ...contentPack,
        });
        await (0, content_1.trackContentGenerationUsage)(client, req.user.id, {
            contentId: content.id,
            provider: 'gemini',
            brandProfileId: brandProfile?.id ?? null,
            platform: req.body.platform ?? null,
            goal: req.body.goal ?? null,
            tone: req.body.tone ?? null,
            audience: req.body.audience ?? null,
            productName: req.body.productName,
            productDescription: req.body.productDescription ?? null,
            keywords: req.body.keywords ?? [],
        });
        return res.status(200).json({
            status: 'success',
            message: 'Content generated successfully',
            data: content,
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
