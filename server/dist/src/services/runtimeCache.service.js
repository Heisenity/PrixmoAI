"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateBillingRuntimeCache = exports.buildBillingSubscriptionCacheKey = exports.buildBillingPlansCacheKey = exports.invalidateAnalyticsRuntimeCache = exports.buildAnalyticsHistoryCacheKey = exports.buildAnalyticsBestPostCacheKey = exports.buildAnalyticsWeeklyComparisonCacheKey = exports.buildAnalyticsSummaryCacheKey = exports.buildAnalyticsDashboardCacheKey = exports.buildAnalyticsOverviewCacheKey = exports.buildRuntimeCacheKey = exports.deleteRuntimeCacheByPrefix = exports.deleteRuntimeCacheKey = exports.getOrSetJsonCache = void 0;
const constants_1 = require("../config/constants");
const redis_1 = require("../lib/redis");
const getOrSetJsonCache = async (key, compute) => {
    if (!redis_1.isRedisConfigured) {
        return compute();
    }
    try {
        const client = (0, redis_1.getRedisClient)();
        const cached = await client.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        const value = await compute();
        await client.set(key, JSON.stringify(value), 'PX', constants_1.RUNTIME_CACHE_TTL_MS);
        return value;
    }
    catch (error) {
        console.warn('[runtime-cache] cache read/write failed; falling back to source data', {
            key,
            error: error instanceof Error ? error.message : String(error),
        });
        return compute();
    }
};
exports.getOrSetJsonCache = getOrSetJsonCache;
const deleteRuntimeCacheKey = async (key) => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    try {
        await (0, redis_1.getRedisClient)().del(key);
    }
    catch (error) {
        console.warn('[runtime-cache] failed to delete cache key', {
            key,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.deleteRuntimeCacheKey = deleteRuntimeCacheKey;
const deleteRuntimeCacheByPrefix = async (...parts) => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    const client = (0, redis_1.getRedisClient)();
    const prefix = (0, exports.buildRuntimeCacheKey)(...parts);
    const pattern = `${prefix}*`;
    let cursor = '0';
    try {
        do {
            const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length) {
                await client.del(...keys);
            }
        } while (cursor !== '0');
    }
    catch (error) {
        console.warn('[runtime-cache] failed to delete cache prefix', {
            prefix,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.deleteRuntimeCacheByPrefix = deleteRuntimeCacheByPrefix;
const buildRuntimeCacheKey = (...parts) => (0, redis_1.buildRedisKey)('cache', ...parts);
exports.buildRuntimeCacheKey = buildRuntimeCacheKey;
const buildAnalyticsOverviewCacheKey = (userId) => (0, exports.buildRuntimeCacheKey)('analytics', userId, 'overview');
exports.buildAnalyticsOverviewCacheKey = buildAnalyticsOverviewCacheKey;
const buildAnalyticsDashboardCacheKey = (userId, filters) => (0, exports.buildRuntimeCacheKey)('analytics', userId, 'dashboard', filters.preset || 'none', filters.start || 'none', filters.end || 'none', filters.platform || 'all');
exports.buildAnalyticsDashboardCacheKey = buildAnalyticsDashboardCacheKey;
const buildAnalyticsSummaryCacheKey = (userId) => (0, exports.buildRuntimeCacheKey)('analytics', userId, 'summary');
exports.buildAnalyticsSummaryCacheKey = buildAnalyticsSummaryCacheKey;
const buildAnalyticsWeeklyComparisonCacheKey = (userId) => (0, exports.buildRuntimeCacheKey)('analytics', userId, 'weekly-comparison');
exports.buildAnalyticsWeeklyComparisonCacheKey = buildAnalyticsWeeklyComparisonCacheKey;
const buildAnalyticsBestPostCacheKey = (userId) => (0, exports.buildRuntimeCacheKey)('analytics', userId, 'best-post');
exports.buildAnalyticsBestPostCacheKey = buildAnalyticsBestPostCacheKey;
const buildAnalyticsHistoryCacheKey = (userId, filters) => (0, exports.buildRuntimeCacheKey)('analytics', userId, 'history', filters.page, filters.limit, filters.start || 'none', filters.end || 'none');
exports.buildAnalyticsHistoryCacheKey = buildAnalyticsHistoryCacheKey;
const invalidateAnalyticsRuntimeCache = async (userId) => (0, exports.deleteRuntimeCacheByPrefix)('analytics', userId);
exports.invalidateAnalyticsRuntimeCache = invalidateAnalyticsRuntimeCache;
const buildBillingPlansCacheKey = (userId, superAdminTestingPlan = 'default') => (0, exports.buildRuntimeCacheKey)('billing', userId, 'plans', superAdminTestingPlan);
exports.buildBillingPlansCacheKey = buildBillingPlansCacheKey;
const buildBillingSubscriptionCacheKey = (userId, superAdminTestingPlan = 'default') => (0, exports.buildRuntimeCacheKey)('billing', userId, 'subscription', superAdminTestingPlan);
exports.buildBillingSubscriptionCacheKey = buildBillingSubscriptionCacheKey;
const invalidateBillingRuntimeCache = async (userId) => (0, exports.deleteRuntimeCacheByPrefix)('billing', userId);
exports.invalidateBillingRuntimeCache = invalidateBillingRuntimeCache;
