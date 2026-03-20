"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeveloperResearchEvents = exports.getDeveloperResearchSummary = exports.getGenerationOverview = exports.getWeeklyAnalyticsComparison = exports.getBestPerformingPostThisWeek = exports.getAnalyticsSummary = exports.getAnalyticsHistory = exports.getAnalyticsByUserId = exports.saveAnalyticsData = void 0;
const constants_1 = require("../../config/constants");
const subscriptions_1 = require("./subscriptions");
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const toNumber = (value) => typeof value === 'number'
    ? value
    : typeof value === 'string'
        ? Number(value) || 0
        : 0;
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const toRecord = (value) => isRecord(value) ? value : {};
const toStringArray = (value) => Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
const incrementCounter = (map, rawValue, normalizer) => {
    if (typeof rawValue !== 'string') {
        return;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
        return;
    }
    const finalValue = normalizer ? normalizer(trimmed) : trimmed;
    map.set(finalValue, (map.get(finalValue) ?? 0) + 1);
};
const topItemsFromMap = (map, limit = 5) => [...map.entries()]
    .sort((left, right) => {
    if (right[1] !== left[1]) {
        return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
})
    .slice(0, limit)
    .map(([value, count]) => ({
    value,
    count,
}));
const normalizePage = (page) => Number.isFinite(page) && page && page > 0 ? page : DEFAULT_PAGE;
const normalizeLimit = (limit) => Number.isFinite(limit) && limit && limit > 0 ? limit : DEFAULT_LIMIT;
const getEngagementScore = (item) => item.likes + item.comments + item.shares + item.saves;
const getCurrentMonthWindow = () => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
};
const getCurrentWeekWindow = () => {
    const now = new Date();
    const currentDay = now.getUTCDay();
    const daysSinceMonday = (currentDay + 6) % 7;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
};
const getPreviousWeekWindow = () => {
    const { start } = getCurrentWeekWindow();
    const currentStart = new Date(start);
    const previousStart = new Date(currentStart);
    previousStart.setUTCDate(previousStart.getUTCDate() - 7);
    return {
        start: previousStart.toISOString(),
        end: currentStart.toISOString(),
    };
};
const toAnalyticsData = (row) => ({
    id: row.id,
    userId: row.user_id,
    scheduledPostId: row.scheduled_post_id,
    contentId: row.content_id,
    platform: row.platform,
    postExternalId: row.post_external_id,
    reach: toNumber(row.reach),
    impressions: toNumber(row.impressions),
    likes: toNumber(row.likes),
    comments: toNumber(row.comments),
    shares: toNumber(row.shares),
    saves: toNumber(row.saves),
    engagementRate: row.engagement_rate === null ? null : Number(row.engagement_rate),
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const toUsageTrackingEvent = (row) => ({
    id: row.id,
    userId: row.user_id,
    featureKey: row.feature_key,
    usedAt: row.used_at,
    metadata: toRecord(row.metadata),
});
const applyDateRange = (query, column, options) => {
    let nextQuery = query;
    if (options.start) {
        nextQuery = nextQuery.gte(column, options.start);
    }
    if (options.end) {
        nextQuery = nextQuery.lt(column, options.end);
    }
    return nextQuery;
};
const getTableCount = async (client, table, userId) => {
    const { count, error } = await client
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (error) {
        throw new Error(error.message || `Failed to count records in ${table}`);
    }
    return count ?? 0;
};
const saveAnalyticsData = async (client, userId, input) => {
    const { data, error } = await client
        .from('analytics')
        .insert({
        user_id: userId,
        scheduled_post_id: input.scheduledPostId ?? null,
        content_id: input.contentId ?? null,
        platform: input.platform ?? null,
        post_external_id: input.postExternalId ?? null,
        reach: input.reach ?? 0,
        impressions: input.impressions ?? 0,
        likes: input.likes ?? 0,
        comments: input.comments ?? 0,
        shares: input.shares ?? 0,
        saves: input.saves ?? 0,
        engagement_rate: input.engagementRate ?? null,
        recorded_at: input.recordedAt ?? new Date().toISOString(),
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to save analytics data');
    }
    return toAnalyticsData(data);
};
exports.saveAnalyticsData = saveAnalyticsData;
const getAnalyticsByUserId = async (client, userId, options = {}) => {
    let query = client
        .from('analytics')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });
    query = applyDateRange(query, 'recorded_at', options);
    const { data, error } = await query;
    if (error) {
        throw new Error(error.message || 'Failed to fetch analytics');
    }
    return (data ?? []).map((row) => toAnalyticsData(row));
};
exports.getAnalyticsByUserId = getAnalyticsByUserId;
const getAnalyticsHistory = async (client, userId, options = {}) => {
    const page = normalizePage(options.page);
    const limit = normalizeLimit(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = client
        .from('analytics')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });
    query = applyDateRange(query, 'recorded_at', options).range(from, to);
    const { data, count, error } = await query;
    if (error) {
        throw new Error(error.message || 'Failed to fetch analytics history');
    }
    const total = count ?? 0;
    return {
        items: (data ?? []).map((row) => toAnalyticsData(row)),
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
};
exports.getAnalyticsHistory = getAnalyticsHistory;
const getAnalyticsSummary = async (client, userId) => {
    const { start, end } = getCurrentMonthWindow();
    const rows = await (0, exports.getAnalyticsByUserId)(client, userId, {
        start,
        end,
    });
    const summary = rows.reduce((accumulator, item) => {
        accumulator.reach += item.reach;
        accumulator.impressions += item.impressions;
        accumulator.likes += item.likes;
        accumulator.comments += item.comments;
        accumulator.shares += item.shares;
        accumulator.saves += item.saves;
        accumulator.posts += 1;
        return accumulator;
    }, {
        reach: 0,
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        posts: 0,
        averageEngagement: 0,
    });
    const totalEngagement = summary.likes + summary.comments + summary.shares + summary.saves;
    return {
        ...summary,
        averageEngagement: rows.length > 0 ? Number((totalEngagement / rows.length).toFixed(2)) : 0,
    };
};
exports.getAnalyticsSummary = getAnalyticsSummary;
const getBestPerformingPostThisWeek = async (client, userId) => {
    const { start, end } = getCurrentWeekWindow();
    const rows = await (0, exports.getAnalyticsByUserId)(client, userId, {
        start,
        end,
    });
    return rows.reduce((best, item) => {
        if (!best) {
            return item;
        }
        return getEngagementScore(item) > getEngagementScore(best) ? item : best;
    }, null);
};
exports.getBestPerformingPostThisWeek = getBestPerformingPostThisWeek;
const getWeeklyAnalyticsComparison = async (client, userId) => {
    const currentWeek = getCurrentWeekWindow();
    const previousWeek = getPreviousWeekWindow();
    const [currentRows, previousRows] = await Promise.all([
        (0, exports.getAnalyticsByUserId)(client, userId, currentWeek),
        (0, exports.getAnalyticsByUserId)(client, userId, previousWeek),
    ]);
    const currentWeekScore = currentRows.reduce((total, item) => total + getEngagementScore(item), 0);
    const previousWeekScore = previousRows.reduce((total, item) => total + getEngagementScore(item), 0);
    const percentageChange = previousWeekScore === 0
        ? currentWeekScore > 0
            ? 100
            : 0
        : Number((((currentWeekScore - previousWeekScore) / previousWeekScore) *
            100).toFixed(2));
    return {
        currentWeek: currentWeekScore,
        previousWeek: previousWeekScore,
        percentageChange,
        direction: currentWeekScore > previousWeekScore
            ? 'up'
            : currentWeekScore < previousWeekScore
                ? 'down'
                : 'flat',
    };
};
exports.getWeeklyAnalyticsComparison = getWeeklyAnalyticsComparison;
const getGenerationOverview = async (client, userId) => {
    const { start, end } = getCurrentMonthWindow();
    const [totalGeneratedContent, totalGeneratedImages, totalScheduledPosts, contentGenerationsThisMonth, imageGenerationsThisMonth, scheduledStatusesResult, generatedContentInsightsResult, analyticsRecordsThisMonthResult,] = await Promise.all([
        getTableCount(client, 'generated_content', userId),
        getTableCount(client, 'generated_images', userId),
        getTableCount(client, 'scheduled_posts', userId),
        (0, subscriptions_1.getMonthlyUsageCount)(client, userId, constants_1.FEATURE_KEYS.contentGeneration),
        (0, subscriptions_1.getMonthlyUsageCount)(client, userId, constants_1.FEATURE_KEYS.imageGeneration),
        client.from('scheduled_posts').select('status').eq('user_id', userId),
        client
            .from('generated_content')
            .select('platform, goal, tone, audience, keywords')
            .eq('user_id', userId),
        client
            .from('analytics')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('recorded_at', start)
            .lt('recorded_at', end),
    ]);
    if (scheduledStatusesResult.error) {
        throw new Error(scheduledStatusesResult.error.message ||
            'Failed to fetch scheduled post statuses');
    }
    if (generatedContentInsightsResult.error) {
        throw new Error(generatedContentInsightsResult.error.message ||
            'Failed to fetch generated content insights');
    }
    if (analyticsRecordsThisMonthResult.error) {
        throw new Error(analyticsRecordsThisMonthResult.error.message ||
            'Failed to fetch analytics record count');
    }
    const scheduledPostStatusBreakdown = constants_1.SCHEDULED_POST_STATUSES.reduce((accumulator, status) => ({
        ...accumulator,
        [status]: 0,
    }), {});
    for (const row of (scheduledStatusesResult.data ?? [])) {
        scheduledPostStatusBreakdown[row.status] =
            (scheduledPostStatusBreakdown[row.status] ?? 0) + 1;
    }
    const platformCounts = new Map();
    const goalCounts = new Map();
    const toneCounts = new Map();
    const audienceCounts = new Map();
    const keywordCounts = new Map();
    for (const row of (generatedContentInsightsResult.data ?? [])) {
        incrementCounter(platformCounts, row.platform);
        incrementCounter(goalCounts, row.goal);
        incrementCounter(toneCounts, row.tone);
        incrementCounter(audienceCounts, row.audience);
        for (const keyword of toStringArray(row.keywords)) {
            incrementCounter(keywordCounts, keyword.toLowerCase());
        }
    }
    return {
        totalGeneratedContent,
        totalGeneratedImages,
        totalScheduledPosts,
        scheduledPostStatusBreakdown,
        contentGenerationsThisMonth,
        imageGenerationsThisMonth,
        analyticsRecordsThisMonth: analyticsRecordsThisMonthResult.count ?? 0,
        topPlatforms: topItemsFromMap(platformCounts),
        topGoals: topItemsFromMap(goalCounts),
        topTones: topItemsFromMap(toneCounts),
        topAudiences: topItemsFromMap(audienceCounts),
        topKeywords: topItemsFromMap(keywordCounts),
    };
};
exports.getGenerationOverview = getGenerationOverview;
const getDeveloperResearchSummary = async (adminClient, options = {}) => {
    let query = adminClient
        .from('usage_tracking')
        .select('user_id, feature_key, metadata, used_at')
        .order('used_at', { ascending: false });
    query = applyDateRange(query, 'used_at', options);
    const { data, error } = await query;
    if (error) {
        throw new Error(error.message || 'Failed to fetch developer research data');
    }
    const rows = (data ?? []);
    const uniqueUsers = new Set();
    const featureCounts = new Map();
    const providerCounts = new Map();
    const platformCounts = new Map();
    const goalCounts = new Map();
    const toneCounts = new Map();
    const audienceCounts = new Map();
    const keywordCounts = new Map();
    const productCounts = new Map();
    for (const row of rows) {
        uniqueUsers.add(row.user_id);
        incrementCounter(featureCounts, row.feature_key);
        const metadata = toRecord(row.metadata);
        incrementCounter(providerCounts, metadata.provider);
        incrementCounter(platformCounts, metadata.platform);
        incrementCounter(goalCounts, metadata.goal);
        incrementCounter(toneCounts, metadata.tone);
        incrementCounter(audienceCounts, metadata.audience);
        incrementCounter(productCounts, metadata.productName);
        for (const keyword of toStringArray(metadata.keywords)) {
            incrementCounter(keywordCounts, keyword.toLowerCase());
        }
    }
    return {
        totalUsers: uniqueUsers.size,
        totalUsageEvents: rows.length,
        totalContentGenerations: rows.filter((row) => row.feature_key === constants_1.FEATURE_KEYS.contentGeneration).length,
        totalImageGenerations: rows.filter((row) => row.feature_key === constants_1.FEATURE_KEYS.imageGeneration).length,
        featureBreakdown: topItemsFromMap(featureCounts, 10),
        providerBreakdown: topItemsFromMap(providerCounts, 10),
        topPlatforms: topItemsFromMap(platformCounts, 10),
        topGoals: topItemsFromMap(goalCounts, 10),
        topTones: topItemsFromMap(toneCounts, 10),
        topAudiences: topItemsFromMap(audienceCounts, 10),
        topKeywords: topItemsFromMap(keywordCounts, 10),
        topProducts: topItemsFromMap(productCounts, 10),
    };
};
exports.getDeveloperResearchSummary = getDeveloperResearchSummary;
const getDeveloperResearchEvents = async (adminClient, options = {}) => {
    const page = normalizePage(options.page);
    const limit = normalizeLimit(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = adminClient
        .from('usage_tracking')
        .select('*', { count: 'exact' })
        .order('used_at', { ascending: false });
    query = applyDateRange(query, 'used_at', options);
    if (options.featureKey) {
        query = query.eq('feature_key', options.featureKey);
    }
    const { data, count, error } = await query.range(from, to);
    if (error) {
        throw new Error(error.message || 'Failed to fetch developer research events');
    }
    const total = count ?? 0;
    return {
        items: (data ?? []).map((row) => toUsageTrackingEvent(row)),
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
};
exports.getDeveloperResearchEvents = getDeveloperResearchEvents;
