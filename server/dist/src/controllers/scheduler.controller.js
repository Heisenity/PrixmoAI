"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePostSchedule = exports.updatePostScheduleStatus = exports.updatePostSchedule = exports.listScheduledPosts = exports.createPostSchedule = exports.removeConnectedSocialAccount = exports.updateConnectedSocialAccount = exports.listConnectedSocialAccounts = exports.createConnectedSocialAccount = void 0;
const content_1 = require("../db/queries/content");
const images_1 = require("../db/queries/images");
const scheduledPosts_1 = require("../db/queries/scheduledPosts");
const socialAccounts_1 = require("../db/queries/socialAccounts");
const supabase_1 = require("../db/supabase");
const parsePositiveInt = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const ensureFutureDate = (isoDate, fieldName = 'scheduledFor') => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid ${fieldName} value`);
    }
    if (parsed.getTime() <= Date.now()) {
        throw new Error(`${fieldName} must be a future date`);
    }
};
const resolveScheduledPostDefaults = async (client, userId, input) => {
    const socialAccount = await (0, socialAccounts_1.getSocialAccountById)(client, userId, input.socialAccountId);
    if (!socialAccount) {
        throw new Error('Social account not found');
    }
    const content = input.contentId
        ? await (0, content_1.getGeneratedContentById)(client, userId, input.contentId)
        : null;
    if (input.contentId && !content) {
        throw new Error('Generated content item not found');
    }
    const image = input.generatedImageId
        ? await (0, images_1.getGeneratedImageById)(client, userId, input.generatedImageId)
        : null;
    if (input.generatedImageId && !image) {
        throw new Error('Generated image item not found');
    }
    return {
        socialAccount,
        content,
        image,
        platform: input.platform ?? socialAccount.platform,
        caption: input.caption === undefined
            ? content?.captions?.[0] ?? null
            : input.caption,
        mediaUrl: input.mediaUrl === undefined
            ? image?.generatedImageUrl ?? null
            : input.mediaUrl,
    };
};
const createConnectedSocialAccount = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const account = await (0, socialAccounts_1.createSocialAccount)(client, req.user.id, req.body);
        return res.status(201).json({
            status: 'success',
            message: 'Social account connected successfully',
            data: account,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to connect social account',
        });
    }
};
exports.createConnectedSocialAccount = createConnectedSocialAccount;
const listConnectedSocialAccounts = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const accounts = await (0, socialAccounts_1.getSocialAccountsByUser)(client, req.user.id, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 20),
        });
        return res.status(200).json({
            status: 'success',
            data: accounts,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch social accounts',
        });
    }
};
exports.listConnectedSocialAccounts = listConnectedSocialAccounts;
const updateConnectedSocialAccount = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingAccount = await (0, socialAccounts_1.getSocialAccountById)(client, req.user.id, req.params.id);
        if (!existingAccount) {
            return res.status(404).json({
                status: 'fail',
                message: 'Social account not found',
            });
        }
        const account = await (0, socialAccounts_1.updateSocialAccount)(client, req.user.id, req.params.id, req.body);
        return res.status(200).json({
            status: 'success',
            message: 'Social account updated successfully',
            data: account,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to update social account',
        });
    }
};
exports.updateConnectedSocialAccount = updateConnectedSocialAccount;
const removeConnectedSocialAccount = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingAccount = await (0, socialAccounts_1.getSocialAccountById)(client, req.user.id, req.params.id);
        if (!existingAccount) {
            return res.status(404).json({
                status: 'fail',
                message: 'Social account not found',
            });
        }
        await (0, socialAccounts_1.deleteSocialAccount)(client, req.user.id, req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Social account removed successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to remove social account',
        });
    }
};
exports.removeConnectedSocialAccount = removeConnectedSocialAccount;
const createPostSchedule = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        ensureFutureDate(req.body.scheduledFor);
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
            socialAccountId: req.body.socialAccountId,
            contentId: req.body.contentId ?? null,
            generatedImageId: req.body.generatedImageId ?? null,
            platform: req.body.platform ?? null,
            caption: req.body.caption ?? null,
            mediaUrl: req.body.mediaUrl ?? null,
        });
        const scheduledPost = await (0, scheduledPosts_1.createScheduledPost)(client, req.user.id, {
            socialAccountId: req.body.socialAccountId,
            contentId: req.body.contentId ?? null,
            generatedImageId: req.body.generatedImageId ?? null,
            platform: resolved.platform,
            caption: resolved.caption,
            mediaUrl: resolved.mediaUrl,
            scheduledFor: req.body.scheduledFor,
            status: req.body.status ?? 'pending',
        });
        return res.status(201).json({
            status: 'success',
            message: 'Post scheduled successfully',
            data: scheduledPost,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create scheduled post';
        return res.status(message.includes('not found') || message.includes('must be a future')
            ? 400
            : 500).json({
            status: message.includes('not found') || message.includes('must be a future')
                ? 'fail'
                : 'error',
            message,
        });
    }
};
exports.createPostSchedule = createPostSchedule;
const listScheduledPosts = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const scheduledPosts = await (0, scheduledPosts_1.getScheduledPostsByUser)(client, req.user.id, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 20),
        });
        return res.status(200).json({
            status: 'success',
            data: scheduledPosts,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch scheduled posts',
        });
    }
};
exports.listScheduledPosts = listScheduledPosts;
const updatePostSchedule = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, req.params.id);
        if (!existingPost) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled post not found',
            });
        }
        if (req.body.scheduledFor) {
            ensureFutureDate(req.body.scheduledFor);
        }
        const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
            socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
            contentId: req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
            generatedImageId: req.body.generatedImageId === undefined
                ? existingPost.generatedImageId
                : req.body.generatedImageId,
            platform: req.body.platform === undefined ? existingPost.platform : req.body.platform,
            caption: req.body.caption === undefined ? existingPost.caption : req.body.caption,
            mediaUrl: req.body.mediaUrl === undefined ? existingPost.mediaUrl : req.body.mediaUrl,
        });
        const updatedPost = await (0, scheduledPosts_1.updateScheduledPost)(client, req.user.id, req.params.id, {
            socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
            contentId: req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
            generatedImageId: req.body.generatedImageId === undefined
                ? existingPost.generatedImageId
                : req.body.generatedImageId,
            platform: resolved.platform,
            caption: resolved.caption,
            mediaUrl: resolved.mediaUrl,
            scheduledFor: req.body.scheduledFor ?? existingPost.scheduledFor,
            status: req.body.status ?? existingPost.status,
        });
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post updated successfully',
            data: updatedPost,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update scheduled post';
        return res.status(message.includes('not found') || message.includes('must be a future')
            ? 400
            : 500).json({
            status: message.includes('not found') || message.includes('must be a future')
                ? 'fail'
                : 'error',
            message,
        });
    }
};
exports.updatePostSchedule = updatePostSchedule;
const updatePostScheduleStatus = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, req.params.id);
        if (!existingPost) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled post not found',
            });
        }
        const publishedAt = req.body.status === 'published'
            ? req.body.publishedAt ?? new Date().toISOString()
            : req.body.publishedAt ?? null;
        const updatedPost = await (0, scheduledPosts_1.updateScheduledPostStatus)(client, req.user.id, req.params.id, req.body.status, publishedAt);
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post status updated successfully',
            data: updatedPost,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to update scheduled post status',
        });
    }
};
exports.updatePostScheduleStatus = updatePostScheduleStatus;
const deletePostSchedule = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const existingPost = await (0, scheduledPosts_1.getScheduledPostById)(client, req.user.id, req.params.id);
        if (!existingPost) {
            return res.status(404).json({
                status: 'fail',
                message: 'Scheduled post not found',
            });
        }
        await (0, scheduledPosts_1.deleteScheduledPost)(client, req.user.id, req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Scheduled post deleted successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to delete scheduled post',
        });
    }
};
exports.deletePostSchedule = deletePostSchedule;
