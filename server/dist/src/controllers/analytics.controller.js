"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInternalResearchEvents = exports.getInternalResearchSummary = exports.getHistory = exports.getBestPost = exports.getWeeklyComparison = exports.getSummary = exports.syncAnalytics = exports.getDashboard = exports.getOverview = exports.recordAnalytics = void 0;
const analytics_1 = require("../db/queries/analytics");
const supabase_1 = require("../db/supabase");
const analyticsDashboard_service_1 = require("../services/analyticsDashboard.service");
const analyticsSync_service_1 = require("../services/analyticsSync.service");
const runtimeCache_service_1 = require("../services/runtimeCache.service");
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
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const analytics = await (0, analytics_1.saveAnalyticsData)(client, userId, req.body);
        await (0, runtimeCache_service_1.invalidateAnalyticsRuntimeCache)(userId);
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
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const data = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildAnalyticsOverviewCacheKey)(userId), async () => {
            const [generation, performance, weeklyComparison, bestPostThisWeek] = await Promise.all([
                (0, analytics_1.getGenerationOverview)(client, userId),
                (0, analytics_1.getAnalyticsSummary)(client, userId),
                (0, analytics_1.getWeeklyAnalyticsComparison)(client, userId),
                (0, analytics_1.getBestPerformingPostThisWeek)(client, userId),
            ]);
            return {
                generation,
                performance,
                weeklyComparison,
                bestPostThisWeek,
            };
        });
        return res.status(200).json({
            status: 'success',
            data,
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
const getDashboard = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const filters = {
            preset: req.query.preset === '7d' ||
                req.query.preset === '14d' ||
                req.query.preset === '28d' ||
                req.query.preset === '30d' ||
                req.query.preset === 'custom'
                ? req.query.preset
                : undefined,
            start: parseOptionalDate(req.query.start),
            end: parseOptionalDate(req.query.end),
            platform: req.query.platform === 'instagram' || req.query.platform === 'facebook'
                ? req.query.platform
                : 'all',
        };
        const dashboard = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildAnalyticsDashboardCacheKey)(userId, filters), () => (0, analyticsDashboard_service_1.getAnalyticsDashboard)(client, userId, {
            preset: filters.preset,
            start: filters.start,
            end: filters.end,
            platformScope: filters.platform,
        }));
        return res.status(200).json({
            status: 'success',
            data: dashboard,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch analytics dashboard',
        });
    }
};
exports.getDashboard = getDashboard;
const syncAnalytics = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const summary = await (0, analyticsSync_service_1.syncAnalyticsForUser)(client, userId);
        return res.status(200).json({
            status: 'success',
            message: 'Analytics synced successfully',
            data: summary,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to sync analytics',
        });
    }
};
exports.syncAnalytics = syncAnalytics;
const getSummary = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const summary = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildAnalyticsSummaryCacheKey)(userId), () => (0, analytics_1.getAnalyticsSummary)(client, userId));
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
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const comparison = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildAnalyticsWeeklyComparisonCacheKey)(userId), () => (0, analytics_1.getWeeklyAnalyticsComparison)(client, userId));
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
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const bestPost = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildAnalyticsBestPostCacheKey)(userId), () => (0, analytics_1.getBestPerformingPostThisWeek)(client, userId));
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
        const userId = req.user.id;
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const filters = {
            page: parsePositiveInt(req.query.page, 1),
            limit: parsePositiveInt(req.query.limit, 20),
            start: parseOptionalDate(req.query.start),
            end: parseOptionalDate(req.query.end),
        };
        const history = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildAnalyticsHistoryCacheKey)(userId, filters), () => (0, analytics_1.getAnalyticsHistory)(client, userId, filters));
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
