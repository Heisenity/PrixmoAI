"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInternalResearchEvents = exports.getInternalResearchSummary = exports.getHistory = exports.getBestPost = exports.getWeeklyComparison = exports.getSummary = exports.getOverview = exports.recordAnalytics = void 0;
const analytics_1 = require("../db/queries/analytics");
const supabase_1 = require("../db/supabase");
const parsePositiveInt = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const parseOptionalDate = (value) => typeof value === 'string' && value.trim() ? value : undefined;
const recordAnalytics = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const analytics = await (0, analytics_1.saveAnalyticsData)(client, req.user.id, req.body);
        return res.status(200).json({
            status: 'success',
            message: 'Analytics recorded successfully',
            data: analytics,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to record analytics',
        });
    }
};
exports.recordAnalytics = recordAnalytics;
const getOverview = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const [generation, performance, weeklyComparison, bestPostThisWeek] = await Promise.all([
            (0, analytics_1.getGenerationOverview)(client, req.user.id),
            (0, analytics_1.getAnalyticsSummary)(client, req.user.id),
            (0, analytics_1.getWeeklyAnalyticsComparison)(client, req.user.id),
            (0, analytics_1.getBestPerformingPostThisWeek)(client, req.user.id),
        ]);
        return res.status(200).json({
            status: 'success',
            data: {
                generation,
                performance,
                weeklyComparison,
                bestPostThisWeek,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch analytics overview',
        });
    }
};
exports.getOverview = getOverview;
const getSummary = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const summary = await (0, analytics_1.getAnalyticsSummary)(client, req.user.id);
        return res.status(200).json({
            status: 'success',
            data: summary,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch analytics summary',
        });
    }
};
exports.getSummary = getSummary;
const getWeeklyComparison = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const comparison = await (0, analytics_1.getWeeklyAnalyticsComparison)(client, req.user.id);
        return res.status(200).json({
            status: 'success',
            data: comparison,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch weekly analytics comparison',
        });
    }
};
exports.getWeeklyComparison = getWeeklyComparison;
const getBestPost = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const bestPost = await (0, analytics_1.getBestPerformingPostThisWeek)(client, req.user.id);
        return res.status(200).json({
            status: 'success',
            data: bestPost,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch best performing post',
        });
    }
};
exports.getBestPost = getBestPost;
const getHistory = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const history = await (0, analytics_1.getAnalyticsHistory)(client, req.user.id, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 20),
            start: parseOptionalDate(req.query.start),
            end: parseOptionalDate(req.query.end),
        });
        return res.status(200).json({
            status: 'success',
            data: history,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch analytics history',
        });
    }
};
exports.getHistory = getHistory;
const getInternalResearchSummary = async (req, res) => {
    try {
        const adminClient = (0, supabase_1.requireSupabaseAdmin)();
        const summary = await (0, analytics_1.getDeveloperResearchSummary)(adminClient, {
            start: parseOptionalDate(req.query.start),
            end: parseOptionalDate(req.query.end),
        });
        return res.status(200).json({
            status: 'success',
            data: summary,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch developer research summary',
        });
    }
};
exports.getInternalResearchSummary = getInternalResearchSummary;
const getInternalResearchEvents = async (req, res) => {
    try {
        const adminClient = (0, supabase_1.requireSupabaseAdmin)();
        const events = await (0, analytics_1.getDeveloperResearchEvents)(adminClient, {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 20),
            start: parseOptionalDate(req.query.start),
            end: parseOptionalDate(req.query.end),
            featureKey: typeof req.query.featureKey === 'string' && req.query.featureKey.trim()
                ? req.query.featureKey
                : undefined,
        });
        return res.status(200).json({
            status: 'success',
            data: events,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch developer research events',
        });
    }
};
exports.getInternalResearchEvents = getInternalResearchEvents;
