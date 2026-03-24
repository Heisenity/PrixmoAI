"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.saveProfile = void 0;
const brandProfiles_1 = require("../db/queries/brandProfiles");
const supabase_1 = require("../db/supabase");
const toBrandProfileInput = (body) => ({
    fullName: body.fullName,
    phoneNumber: body.phoneNumber ?? null,
    username: body.username ?? null,
    avatarUrl: body.avatarUrl ?? null,
    industry: body.industry ?? null,
    targetAudience: body.targetAudience ?? null,
    brandVoice: body.brandVoice ?? null,
    description: body.description ?? null,
});
const saveProfile = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const profile = await (0, brandProfiles_1.upsertBrandProfile)(client, req.user.id, toBrandProfileInput(req.body));
        return res.status(200).json({
            status: 'success',
            message: 'Brand profile saved successfully',
            profile,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to save brand profile',
        });
    }
};
exports.saveProfile = saveProfile;
const getMe = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const profile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, req.user.id);
        return res.status(200).json({
            status: 'success',
            user: req.user,
            profile,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load current user',
        });
    }
};
exports.getMe = getMe;
