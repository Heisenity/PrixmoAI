"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeveloperResearchEvents = exports.getDeveloperResearchSummary = exports.getGenerationOverview = exports.getWeeklyAnalyticsComparison = exports.getBestPerformingPostThisWeek = exports.getAnalyticsSummary = exports.getAnalyticsHistory = exports.getAnalyticsAudienceSnapshotsByUserId = exports.saveAnalyticsAudienceSnapshot = exports.getAnalyticsByUserId = exports.saveAnalyticsData = void 0;
const constants_1 = require("../../config/constants");
const subscriptions_1 = require("./subscriptions");
const timezone_1 = require("../../lib/timezone");
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
const toAudienceBreakdownItems = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
            if (typeof entry === 'string' && entry.trim()) {
                return { label: entry.trim(), value: 1 };
            }
            const record = toRecord(entry);
            const label = typeof record.label === 'string'
                ? record.label
                : typeof record.name === 'string'
                    ? record.name
                    : typeof record.key === 'string'
                        ? record.key
                        : null;
            if (!label?.trim()) {
                return null;
            }
            return {
                label: label.trim(),
                value: toNumber(record.value ?? record.count ?? record.total ?? record.percentage),
            };
        })
            .filter((entry) => Boolean(entry));
    }
    return Object.entries(toRecord(value))
        .map(([label, rawValue]) => ({
        label,
        value: toNumber(rawValue),
    }))
        .filter((entry) => entry.label.trim().length > 0);
};
const toActiveHoursMap = (value) => Object.fromEntries(Object.entries(toRecord(value)).map(([key, rawValue]) => [key, toNumber(rawValue)]));
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
const getEngagementScore = (item) => item.likes + item.comments + item.shares + item.saves + item.reactions;
const normalizePlatformLabel = (value) => {
    if (!value) {
        return 'Other';
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return 'Other';
    }
    if (normalized === 'instagram') {
        return 'Instagram';
    }
    if (normalized === 'linkedin') {
        return 'LinkedIn';
    }
    if (normalized === 'facebook') {
        return 'Facebook';
    }
    if (normalized === 'x' || normalized === 'twitter') {
        return 'X';
    }
    if (normalized === 'youtube') {
        return 'YouTube';
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
const getCurrentMonthWindow = () => (0, timezone_1.getIstMonthWindow)();
const getCurrentWeekWindow = () => {
    const now = new Date();
    const currentDay = (0, timezone_1.getIstDayOfWeek)(now);
    const daysSinceMonday = (currentDay + 6) % 7;
    const todayStart = (0, timezone_1.startOfIstDay)(now);
    const start = (0, timezone_1.addIstDays)(todayStart, -daysSinceMonday);
    const end = (0, timezone_1.addIstDays)(start, 7);
    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
};
const getPreviousWeekWindow = () => {
    const { start } = getCurrentWeekWindow();
    const currentStart = new Date(start);
    const previousStart = (0, timezone_1.addIstDays)(currentStart, -7);
    return {
        start: previousStart.toISOString(),
        end: currentStart.toISOString(),
    };
};
const startOfIstDayIso = (value) => (0, timezone_1.getIstDayWindow)(new Date(value)).start;
const endOfIstDayIso = (value) => (0, timezone_1.getIstDayWindow)(new Date(value)).end;
const toAnalyticsData = (row) => ({
    id: row.id,
    userId: row.user_id,
    scheduledPostId: row.scheduled_post_id,
    contentId: row.content_id,
    platform: row.platform,
    postExternalId: row.post_external_id,
    postType: row.post_type ?? null,
    caption: row.caption ?? null,
    mediaUrl: row.media_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? row.media_url ?? null,
    reach: toNumber(row.reach),
    impressions: toNumber(row.impressions),
    likes: toNumber(row.likes),
    comments: toNumber(row.comments),
    shares: toNumber(row.shares),
    saves: toNumber(row.saves),
    reactions: toNumber(row.reactions),
    videoPlays: toNumber(row.video_plays),
    replays: toNumber(row.replays),
    exits: toNumber(row.exits),
    profileVisits: toNumber(row.profile_visits),
    postClicks: toNumber(row.post_clicks),
    pageLikes: toNumber(row.page_likes),
    completionRate: row.completion_rate === null || row.completion_rate === undefined
        ? null
        : Number(row.completion_rate),
    followersAtPostTime: row.followers_at_post_time === null || row.followers_at_post_time === undefined
        ? null
        : toNumber(row.followers_at_post_time),
    engagementRate: row.engagement_rate === null ? null : Number(row.engagement_rate),
    publishedTime: row.published_time ?? null,
    topComments: toStringArray(row.top_comments),
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const toAnalyticsAudienceSnapshot = (row) => ({
    id: row.id,
    userId: row.user_id,
    socialAccountId: row.social_account_id,
    platform: row.platform,
    followers: toNumber(row.followers),
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    profileVisits: toNumber(row.profile_visits),
    pageLikes: toNumber(row.page_likes),
    ageDistribution: toAudienceBreakdownItems(row.age_distribution),
    genderDistribution: toAudienceBreakdownItems(row.gender_distribution),
    topLocations: toAudienceBreakdownItems(row.top_locations),
    activeHours: toActiveHoursMap(row.active_hours),
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
    const buildInsertPayload = (includeExtendedFields) => ({
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
        ...(includeExtendedFields
            ? {
                post_type: input.postType ?? null,
                caption: input.caption ?? null,
                media_url: input.mediaUrl ?? null,
                thumbnail_url: input.thumbnailUrl ?? null,
                reactions: input.reactions ?? 0,
                video_plays: input.videoPlays ?? 0,
                replays: input.replays ?? 0,
                exits: input.exits ?? 0,
                profile_visits: input.profileVisits ?? 0,
                post_clicks: input.postClicks ?? 0,
                page_likes: input.pageLikes ?? 0,
                completion_rate: input.completionRate ?? null,
                followers_at_post_time: input.followersAtPostTime ?? null,
                published_time: input.publishedTime ?? null,
                top_comments: input.topComments ?? [],
            }
            : {}),
    });
    let { data, error } = await client
        .from('analytics')
        .insert(buildInsertPayload(true))
        .select('*')
        .single();
    if (error &&
        /column .* does not exist|schema cache/i.test(error.message || '')) {
        const fallback = await client
            .from('analytics')
            .insert(buildInsertPayload(false))
            .select('*')
            .single();
        data = fallback.data;
        error = fallback.error;
    }
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
const saveAnalyticsAudienceSnapshot = async (client, userId, input) => {
    const recordedAt = input.recordedAt ?? new Date().toISOString();
    const lookupResult = await client
        .from('analytics_audience_snapshots')
        .select('*')
        .eq('user_id', userId)
        .eq('social_account_id', input.socialAccountId)
        .gte('recorded_at', startOfIstDayIso(recordedAt))
        .lt('recorded_at', endOfIstDayIso(recordedAt))
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (lookupResult.error &&
        /relation .*analytics_audience_snapshots.* does not exist|schema cache/i.test(lookupResult.error.message || '')) {
        return null;
    }
    if (lookupResult.error) {
        throw new Error(lookupResult.error.message || 'Failed to query audience analytics snapshots');
    }
    const payload = {
        user_id: userId,
        social_account_id: input.socialAccountId,
        platform: input.platform,
        followers: input.followers ?? 0,
        impressions: input.impressions ?? 0,
        reach: input.reach ?? 0,
        profile_visits: input.profileVisits ?? 0,
        page_likes: input.pageLikes ?? 0,
        age_distribution: input.ageDistribution ?? [],
        gender_distribution: input.genderDistribution ?? [],
        top_locations: input.topLocations ?? [],
        active_hours: input.activeHours ?? {},
        recorded_at: recordedAt,
    };
    const result = lookupResult.data
        ? await client
            .from('analytics_audience_snapshots')
            .update(payload)
            .eq('id', lookupResult.data.id)
            .select('*')
            .single()
        : await client
            .from('analytics_audience_snapshots')
            .insert(payload)
            .select('*')
            .single();
    if (result.error &&
        /relation .*analytics_audience_snapshots.* does not exist|schema cache/i.test(result.error.message || '')) {
        return null;
    }
    if (result.error || !result.data) {
        throw new Error(result.error?.message || 'Failed to save audience analytics snapshot');
    }
    return toAnalyticsAudienceSnapshot(result.data);
};
exports.saveAnalyticsAudienceSnapshot = saveAnalyticsAudienceSnapshot;
const getAnalyticsAudienceSnapshotsByUserId = async (client, userId, options = {}) => {
    let query = client
        .from('analytics_audience_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });
    query = applyDateRange(query, 'recorded_at', options);
    const { data, error } = await query;
    if (error &&
        /relation .*analytics_audience_snapshots.* does not exist|schema cache/i.test(error.message || '')) {
        return [];
    }
    if (error) {
        throw new Error(error.message || 'Failed to fetch audience analytics snapshots');
    }
    return (data ?? []).map((row) => toAnalyticsAudienceSnapshot(row));
};
exports.getAnalyticsAudienceSnapshotsByUserId = getAnalyticsAudienceSnapshotsByUserId;
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
    const [totalGeneratedContent, totalGeneratedImages, totalScheduledPostsResult, contentGenerationsToday, imageGenerationsToday, contentGenerationsThisMonth, imageGenerationsThisMonth, scheduledStatusesResult, generatedContentInsightsResult, analyticsRecordsThisMonthResult,] = await Promise.all([
        getTableCount(client, 'generated_content', userId),
        getTableCount(client, 'generated_images', userId),
        client
            .from('scheduled_posts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', ['pending', 'scheduled']),
        (0, subscriptions_1.getDailyUsageCount)(client, userId, constants_1.FEATURE_KEYS.contentGeneration),
        (0, subscriptions_1.getDailyUsageCount)(client, userId, constants_1.FEATURE_KEYS.imageGeneration),
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
    if (totalScheduledPostsResult.error) {
        throw new Error(totalScheduledPostsResult.error.message ||
            'Failed to fetch active scheduled post count');
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
    const platformSignalMap = new Map();
    for (const row of (generatedContentInsightsResult.data ?? [])) {
        incrementCounter(platformCounts, row.platform, normalizePlatformLabel);
        incrementCounter(goalCounts, row.goal);
        incrementCounter(toneCounts, row.tone);
        incrementCounter(audienceCounts, row.audience);
        for (const keyword of toStringArray(row.keywords)) {
            incrementCounter(keywordCounts, keyword.toLowerCase());
        }
    }
    const analyticsRows = await (0, exports.getAnalyticsByUserId)(client, userId, {
        start,
        end,
    });
    for (const row of analyticsRows) {
        const platform = normalizePlatformLabel(row.platform);
        const existing = platformSignalMap.get(platform) ??
            {
                platform,
                posts: 0,
                reach: 0,
                impressions: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                saves: 0,
                totalEngagement: 0,
                averageEngagementRate: 0,
                latestRecordedAt: null,
                topPost: null,
                recentPosts: [],
                engagementRateSum: 0,
                engagementRateCount: 0,
            };
        existing.posts += 1;
        existing.reach += row.reach;
        existing.impressions += row.impressions;
        existing.likes += row.likes;
        existing.comments += row.comments;
        existing.shares += row.shares;
        existing.saves += row.saves;
        existing.totalEngagement += getEngagementScore(row);
        existing.recentPosts.push(row);
        if (row.engagementRate !== null) {
            existing.engagementRateSum += row.engagementRate;
            existing.engagementRateCount += 1;
        }
        if (!existing.latestRecordedAt ||
            new Date(row.recordedAt).getTime() > new Date(existing.latestRecordedAt).getTime()) {
            existing.latestRecordedAt = row.recordedAt;
        }
        if (!existing.topPost || getEngagementScore(row) > getEngagementScore(existing.topPost)) {
            existing.topPost = row;
        }
        platformSignalMap.set(platform, existing);
    }
    const platformSignals = [...platformSignalMap.values()]
        .map((entry) => ({
        platform: entry.platform,
        posts: entry.posts,
        reach: entry.reach,
        impressions: entry.impressions,
        likes: entry.likes,
        comments: entry.comments,
        shares: entry.shares,
        saves: entry.saves,
        totalEngagement: entry.totalEngagement,
        averageEngagementRate: entry.engagementRateCount > 0
            ? Number((entry.engagementRateSum / entry.engagementRateCount).toFixed(2))
            : Number((entry.totalEngagement / Math.max(1, entry.posts)).toFixed(2)),
        latestRecordedAt: entry.latestRecordedAt,
        topPost: entry.topPost,
        recentPosts: [...entry.recentPosts]
            .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())
            .slice(0, 3),
    }))
        .sort((left, right) => {
        if (right.totalEngagement !== left.totalEngagement) {
            return right.totalEngagement - left.totalEngagement;
        }
        if (right.posts !== left.posts) {
            return right.posts - left.posts;
        }
        return left.platform.localeCompare(right.platform);
    });
    return {
        totalGeneratedContent,
        totalGeneratedImages,
        totalScheduledPosts: totalScheduledPostsResult.count ?? 0,
        scheduledPostStatusBreakdown,
        contentGenerationsToday,
        imageGenerationsToday,
        contentGenerationsThisMonth,
        imageGenerationsThisMonth,
        analyticsRecordsThisMonth: analyticsRecordsThisMonthResult.count ?? 0,
        topPlatforms: topItemsFromMap(platformCounts),
        topGoals: topItemsFromMap(goalCounts),
        topTones: topItemsFromMap(toneCounts),
        topAudiences: topItemsFromMap(audienceCounts),
        topKeywords: topItemsFromMap(keywordCounts),
        platformSignals,
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
