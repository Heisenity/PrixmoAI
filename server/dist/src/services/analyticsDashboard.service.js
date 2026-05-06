"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsDashboard = void 0;
const constants_1 = require("../config/constants");
const analytics_1 = require("../db/queries/analytics");
const analyticsLearning_1 = require("../db/queries/analyticsLearning");
const timezone_1 = require("../lib/timezone");
const analyticsPerformance_1 = require("../lib/analyticsPerformance");
const PRESET_DAY_MAP = {
    '7d': 7,
    '14d': 14,
    '28d': 28,
    '30d': 30,
};
const HEATMAP_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MINIMUM_BEST_TIME_POSTS = constants_1.ANALYTICS_LEARNING_MIN_POSTS;
const MINIMUM_BEST_TIME_ENGAGEMENT_COVERAGE = 0.5;
const MINIMUM_BEST_TIME_SLOT_SAMPLES = 2;
const BEST_TIME_OUTLIER_MAD_MULTIPLIER = 3;
const BEST_TIME_ZERO_MAD_CAP_MULTIPLIER = 3;
const resolveScheduledPostPublishedAt = (row) => row.published_at ?? (row.status === 'published' ? row.updated_at : null);
const normalizePlatformKey = (value) => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'instagram' || normalized === 'facebook') {
        return normalized;
    }
    return null;
};
const toPlatformLabel = (value) => {
    const normalized = normalizePlatformKey(value);
    if (normalized === 'instagram') {
        return 'Instagram';
    }
    if (normalized === 'facebook') {
        return 'Facebook';
    }
    return 'Other';
};
const toSafeNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};
const toNullableNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const toStringArray = (value) => Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : [];
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const formatTitleCase = (value) => value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
const formatLearningPatternLabel = (dimension, value) => {
    const normalizedValue = value.replace(/[-_]+/g, ' ').trim();
    switch (dimension) {
        case 'caption_length':
            return `${normalizedValue} captions`;
        case 'hook_style':
            if (normalizedValue.toLowerCase() === 'unknown') {
                return 'posts with different opening lines';
            }
            return `${normalizedValue} hooks`;
        case 'cta_style':
            return `${normalizedValue} CTAs`;
        case 'topic':
            return `${normalizedValue} topics`;
        default:
            return normalizedValue;
    }
};
const isUnknownHookPattern = (pattern) => Boolean(pattern &&
    pattern.dimension === 'hook_style' &&
    pattern.label.trim().toLowerCase() === 'unknown');
const hasMeaningfulPostSignal = (post) => post.performanceScore > 0 ||
    post.impressions > 0 ||
    post.reach > 0 ||
    post.engagements > 0 ||
    post.likes > 0 ||
    post.comments > 0 ||
    post.saves > 0 ||
    post.shares > 0;
const CONTENT_TOPIC_RULES = [
    {
        id: 'educational',
        matchers: [/\btips?\b/i, /\bguide\b/i, /\blearn\b/i, /\beducat/i, /\bexplained?\b/i],
    },
    {
        id: 'promotional',
        matchers: [/\bsale\b/i, /\boffer\b/i, /\bdiscount\b/i, /\bbuy\b/i, /\bshop\b/i, /\blink in bio\b/i],
    },
    {
        id: 'motivational',
        matchers: [/\binspire/i, /\bmotivat/i, /\bbelieve\b/i, /\bkeep going\b/i, /\bconfidence\b/i],
    },
    {
        id: 'product',
        matchers: [/\bproduct\b/i, /\blaunch\b/i, /\bcollection\b/i, /\bfeature\b/i, /\bnew arrival\b/i],
    },
    {
        id: 'behind-the-scenes',
        matchers: [/\bbehind the scenes\b/i, /\bbts\b/i, /\bteam\b/i, /\bprocess\b/i, /\bmakers?\b/i],
    },
    {
        id: 'memes',
        matchers: [/\bmeme\b/i, /\bfunny\b/i, /\brelatable\b/i, /\blol\b/i],
    },
    {
        id: 'tips',
        matchers: [/\btips?\b/i, /\bhacks?\b/i, /\bquick win\b/i],
    },
    {
        id: 'tutorials',
        matchers: [/\btutorial\b/i, /\bhow to\b/i, /\bstep by step\b/i, /\bwalkthrough\b/i],
    },
];
const inferContentThemes = (caption, postType) => {
    const topics = new Set();
    const text = caption?.trim() ?? '';
    if (postType === 'reel') {
        topics.add('reels');
    }
    if (postType === 'carousel') {
        topics.add('carousel');
    }
    if (!text) {
        return [...topics];
    }
    for (const rule of CONTENT_TOPIC_RULES) {
        if (rule.matchers.some((matcher) => matcher.test(text))) {
            topics.add(rule.id);
        }
    }
    if (!topics.size) {
        topics.add('general');
    }
    return [...topics];
};
const toAudienceBreakdownItems = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
            if (typeof entry === 'string' && entry.trim()) {
                return { label: entry.trim(), value: 1 };
            }
            if (!isRecord(entry)) {
                return null;
            }
            const label = typeof entry.label === 'string'
                ? entry.label
                : typeof entry.name === 'string'
                    ? entry.name
                    : typeof entry.key === 'string'
                        ? entry.key
                        : null;
            const numericValue = toNullableNumber(entry.value ?? entry.count ?? entry.total ?? entry.percentage) ?? 0;
            if (!label?.trim()) {
                return null;
            }
            return {
                label: label.trim(),
                value: numericValue,
            };
        })
            .filter((entry) => Boolean(entry));
    }
    if (!isRecord(value)) {
        return [];
    }
    return Object.entries(value)
        .map(([label, rawValue]) => {
        const numericValue = toNullableNumber(rawValue);
        if (!label.trim() || numericValue === null) {
            return null;
        }
        return {
            label: label.trim(),
            value: numericValue,
        };
    })
        .filter((entry) => Boolean(entry));
};
const mergeAudienceBreakdownItems = (collections) => {
    const merged = new Map();
    for (const items of collections) {
        for (const item of items) {
            merged.set(item.label, (merged.get(item.label) ?? 0) + item.value);
        }
    }
    return [...merged.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 6);
};
const buildFollowerGrowthSeriesFromAudienceSnapshots = (snapshots) => {
    const dailyBuckets = new Map();
    for (const snapshot of snapshots) {
        const bucket = (0, timezone_1.startOfIstDay)(new Date(snapshot.recordedAt)).toISOString();
        const entries = dailyBuckets.get(bucket) ?? [];
        entries.push(snapshot);
        dailyBuckets.set(bucket, entries);
    }
    return [...dailyBuckets.entries()]
        .map(([date, snapshotsForDay]) => {
        const latestPerAccount = latestByKey(snapshotsForDay, (snapshot) => snapshot.socialAccountId, (snapshot) => snapshot.recordedAt);
        return {
            date,
            label: toDateLabel(date),
            value: latestPerAccount.reduce((total, snapshot) => total + snapshot.followers, 0),
        };
    })
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
};
const aggregateLatestAudienceMetric = (snapshots, selector) => latestByKey(snapshots, (snapshot) => snapshot.socialAccountId, (snapshot) => snapshot.recordedAt).reduce((total, snapshot) => total + selector(snapshot), 0);
const buildActiveHoursHeatmapFromSnapshots = (snapshots, fallback) => {
    const latestSnapshots = latestByKey(snapshots, (snapshot) => snapshot.socialAccountId, (snapshot) => snapshot.recordedAt);
    const values = new Map();
    for (const snapshot of latestSnapshots) {
        for (const [rawKey, rawValue] of Object.entries(snapshot.activeHours)) {
            const match = rawKey.match(/^([A-Za-z]{3})-(\d{1,2})$/);
            if (!match) {
                continue;
            }
            const day = formatTitleCase(match[1]).slice(0, 3);
            const hour = Number.parseInt(match[2], 10);
            if (!Number.isFinite(hour)) {
                continue;
            }
            values.set(`${day}-${hour}`, (values.get(`${day}-${hour}`) ?? 0) + rawValue);
        }
    }
    if (!values.size) {
        return fallback;
    }
    const maxValue = Math.max(...values.values(), 1);
    const cells = [];
    for (let dayIndex = 0; dayIndex < HEATMAP_DAY_LABELS.length; dayIndex += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
            const key = `${HEATMAP_DAY_LABELS[dayIndex]}-${hour}`;
            const rawValue = values.get(key) ?? 0;
            cells.push({
                day: HEATMAP_DAY_LABELS[dayIndex],
                dayIndex,
                hour,
                posts: rawValue,
                averageEngagementRate: rawValue > 0 ? rawValue : null,
                intensity: rawValue > 0 ? Number((rawValue / maxValue).toFixed(4)) : 0,
            });
        }
    }
    return cells;
};
const readMetadataBreakdown = (metadata, candidateKeys) => {
    if (!metadata) {
        return [];
    }
    for (const key of candidateKeys) {
        if (key in metadata) {
            const items = toAudienceBreakdownItems(metadata[key]);
            if (items.length) {
                return items;
            }
        }
    }
    return [];
};
const collectAudienceBreakdown = (accounts, candidateKeys) => mergeAudienceBreakdownItems(accounts.map((account) => readMetadataBreakdown(account.metadata, candidateKeys)));
const toDateLabel = (value) => new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: timezone_1.IST_TIME_ZONE,
});
const buildDateRange = (options) => {
    if (options.preset === 'custom' && options.start && options.end) {
        const customStart = new Date(options.start);
        const customEnd = new Date(options.end);
        if (Number.isFinite(customStart.getTime()) &&
            Number.isFinite(customEnd.getTime()) &&
            customEnd.getTime() > customStart.getTime()) {
            const start = (0, timezone_1.startOfIstDay)(customStart);
            const end = (0, timezone_1.addIstDays)((0, timezone_1.startOfIstDay)(customEnd), 1);
            const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
            const previousEnd = new Date(start);
            const previousStart = (0, timezone_1.addIstDays)(previousEnd, -days);
            return {
                preset: 'custom',
                start: start.toISOString(),
                end: end.toISOString(),
                previousStart: previousStart.toISOString(),
                previousEnd: previousEnd.toISOString(),
                days,
            };
        }
    }
    const preset = options.preset && options.preset in PRESET_DAY_MAP ? options.preset : '30d';
    const days = PRESET_DAY_MAP[preset];
    const end = (0, timezone_1.addIstDays)((0, timezone_1.startOfIstDay)(new Date()), 1);
    const start = (0, timezone_1.addIstDays)(end, -days);
    const previousEnd = new Date(start);
    const previousStart = (0, timezone_1.addIstDays)(previousEnd, -days);
    return {
        preset,
        start: start.toISOString(),
        end: end.toISOString(),
        previousStart: previousStart.toISOString(),
        previousEnd: previousEnd.toISOString(),
        days,
    };
};
const isWithinRange = (value, start, end) => {
    if (!value) {
        return false;
    }
    const timestamp = new Date(value).getTime();
    return (Number.isFinite(timestamp) &&
        timestamp >= new Date(start).getTime() &&
        timestamp < new Date(end).getTime());
};
const getPostKey = (row) => row.scheduledPostId || row.postExternalId || row.id;
const getEngagements = (row) => row.likes + row.comments + row.saves + row.shares + row.reactions;
const toRateRatio = (rate, reach, engagements) => {
    if (typeof rate === 'number' && Number.isFinite(rate)) {
        return rate > 1 ? rate / 100 : rate;
    }
    if (reach <= 0) {
        return null;
    }
    return engagements / reach;
};
const toPercent = (ratio) => ratio === null ? null : Number((ratio * 100).toFixed(2));
const median = (values) => {
    if (!values.length) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const midpoint = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
        : sorted[midpoint];
};
const computeChangePercent = (current, previous) => {
    if (current === null || previous === null) {
        return null;
    }
    if (previous === 0) {
        return current === 0 ? 0 : 100;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
};
const toDirection = (changePercent) => {
    if (changePercent === null) {
        return 'na';
    }
    if (changePercent > 0.25) {
        return 'up';
    }
    if (changePercent < -0.25) {
        return 'down';
    }
    return 'flat';
};
const latestByKey = (items, keyGetter, dateGetter) => {
    const map = new Map();
    for (const item of items) {
        const key = keyGetter(item);
        const existing = map.get(key);
        if (!existing) {
            map.set(key, item);
            continue;
        }
        const currentTs = new Date(dateGetter(item) || 0).getTime();
        const existingTs = new Date(dateGetter(existing) || 0).getTime();
        if (currentTs >= existingTs) {
            map.set(key, item);
        }
    }
    return [...map.values()];
};
const buildTrendBuckets = (rows, range) => {
    const dayBuckets = new Map();
    for (const row of rows) {
        const bucket = (0, timezone_1.startOfIstDay)(new Date(row.recordedAt)).toISOString();
        const entries = dayBuckets.get(bucket) ?? [];
        entries.push(row);
        dayBuckets.set(bucket, entries);
    }
    const points = [];
    for (let cursor = new Date(range.start); cursor < new Date(range.end); cursor = (0, timezone_1.addIstDays)(cursor, 1)) {
        const bucket = cursor.toISOString();
        const rowsForDay = dayBuckets.get(bucket) ?? [];
        const latestRows = latestByKey(rowsForDay, (row) => row.postKey, (row) => row.recordedAt);
        const platformBreakdown = {};
        let impressions = 0;
        let reach = 0;
        let likes = 0;
        let comments = 0;
        let saves = 0;
        let shares = 0;
        let reactions = 0;
        let engagements = 0;
        for (const row of latestRows) {
            impressions += row.impressions;
            reach += row.reach;
            likes += row.likes;
            comments += row.comments;
            saves += row.saves;
            shares += row.shares;
            reactions += row.reactions;
            engagements += row.engagements;
            if (row.platformKey) {
                const existing = platformBreakdown[row.platformKey] ?? {
                    impressions: 0,
                    reach: 0,
                    likes: 0,
                    comments: 0,
                    saves: 0,
                    shares: 0,
                    reactions: 0,
                    engagements: 0,
                };
                existing.impressions += row.impressions;
                existing.reach += row.reach;
                existing.likes += row.likes;
                existing.comments += row.comments;
                existing.saves += row.saves;
                existing.shares += row.shares;
                existing.reactions += row.reactions;
                existing.engagements += row.engagements;
                platformBreakdown[row.platformKey] = existing;
            }
        }
        points.push({
            date: bucket,
            label: toDateLabel(bucket),
            impressions,
            reach,
            likes,
            comments,
            saves,
            shares,
            reactions,
            engagements,
            platformBreakdown,
        });
    }
    return points;
};
const extractKeywords = (caption) => {
    if (!caption) {
        return [];
    }
    const hashtagMatches = caption.match(/#[a-z0-9_]+/gi) ?? [];
    const wordMatches = caption.match(/[a-z0-9]{4,}/gi) ?? [];
    const combined = [...hashtagMatches, ...wordMatches]
        .map((value) => value.trim().toLowerCase())
        .filter((value) => !['http', 'https', 'www', 'prixmoai'].includes(value))
        .slice(0, 8);
    return [...new Set(combined)];
};
const inferPostType = (platform, mediaType, mediaUrl, explicitType) => {
    if (explicitType?.trim()) {
        return explicitType.trim().toLowerCase();
    }
    if (mediaType === 'video') {
        return normalizePlatformKey(platform) === 'instagram' ? 'reel' : 'video';
    }
    if (mediaType === 'image') {
        return 'image';
    }
    const normalizedUrl = mediaUrl?.toLowerCase() || '';
    if (normalizedUrl.includes('.mp4') || normalizedUrl.includes('.mov')) {
        return normalizePlatformKey(platform) === 'instagram' ? 'reel' : 'video';
    }
    return normalizedUrl ? 'image' : null;
};
const buildMetric = (currentValue, previousValue, sparkline, platformBreakdown) => {
    const changePercent = computeChangePercent(currentValue, previousValue);
    return {
        value: currentValue,
        previousValue,
        changePercent,
        direction: toDirection(changePercent),
        sparkline,
        platformBreakdown,
    };
};
const buildSparkline = (points, selector) => points.map((point) => ({
    date: point.date,
    label: point.label,
    value: selector(point),
}));
const buildCumulativeSparklineFromRows = (rows, range, selector) => {
    const dayBuckets = new Map();
    for (const row of rows) {
        const bucket = (0, timezone_1.startOfIstDay)(new Date(row.recordedAt)).toISOString();
        const entries = dayBuckets.get(bucket) ?? [];
        entries.push(row);
        dayBuckets.set(bucket, entries);
    }
    const latestMetricByPost = new Map();
    const points = [];
    for (let cursor = new Date(range.start); cursor < new Date(range.end); cursor = (0, timezone_1.addIstDays)(cursor, 1)) {
        const bucket = cursor.toISOString();
        const rowsForDay = dayBuckets.get(bucket) ?? [];
        const latestRowsForDay = latestByKey(rowsForDay, (row) => row.postKey, (row) => row.recordedAt);
        for (const row of latestRowsForDay) {
            latestMetricByPost.set(row.postKey, Math.max(0, selector(row)));
        }
        const totalForDay = [...latestMetricByPost.values()].reduce((total, value) => total + value, 0);
        points.push({
            date: bucket,
            label: toDateLabel(bucket),
            value: totalForDay,
        });
    }
    return points;
};
const buildHeatmap = (posts) => {
    const scoredTimingPosts = [];
    const buckets = new Map();
    let timedPosts = 0;
    for (const post of posts) {
        if (!post.publishedTime) {
            continue;
        }
        const date = new Date(post.publishedTime);
        if (!Number.isFinite(date.getTime())) {
            continue;
        }
        timedPosts += 1;
        const dayIndex = ((0, timezone_1.getIstDayOfWeek)(date) + 6) % 7;
        const hour = (0, timezone_1.getIstHour)(date);
        const normalizer = post.reach > 0 ? post.reach : post.impressions > 0 ? post.impressions : 0;
        const platform = normalizePlatformKey(post.platform);
        const appreciationActions = platform === 'facebook'
            ? post.reactions > 0
                ? post.reactions
                : post.likes
            : post.likes > 0
                ? post.likes
                : post.reactions;
        const weightedActions = appreciationActions + post.comments * 2 + post.saves * 3 + post.shares * 4;
        const actionCount = appreciationActions + post.comments + post.saves + post.shares;
        if (normalizer <= 0 || weightedActions <= 0) {
            continue;
        }
        scoredTimingPosts.push({
            dayIndex,
            hour,
            rawScore: weightedActions / normalizer,
            cappedScore: 0,
            engagementPercent: Number(((actionCount / normalizer) * 100).toFixed(2)),
        });
    }
    const scoreMedian = median(scoredTimingPosts.map((entry) => entry.rawScore));
    const scoreMad = median(scoredTimingPosts.map((entry) => Math.abs(entry.rawScore - scoreMedian)));
    const robustStdEstimate = scoreMad * 1.4826;
    const outlierCap = scoreMedian > 0 && scoreMad === 0
        ? scoreMedian * BEST_TIME_ZERO_MAD_CAP_MULTIPLIER
        : scoreMedian + robustStdEstimate * BEST_TIME_OUTLIER_MAD_MULTIPLIER;
    for (const scoredPost of scoredTimingPosts) {
        const cappedScore = outlierCap > 0 ? Math.min(scoredPost.rawScore, outlierCap) : scoredPost.rawScore;
        const key = `${scoredPost.dayIndex}-${scoredPost.hour}`;
        const existing = buckets.get(key) ?? {
            signalSum: 0,
            engagementSum: 0,
            engagementSamples: 0,
            posts: 0,
            qualifiedPosts: 0,
            dayIndex: scoredPost.dayIndex,
            hour: scoredPost.hour,
        };
        scoredPost.cappedScore = cappedScore;
        existing.signalSum += cappedScore;
        existing.engagementSum += scoredPost.engagementPercent;
        existing.engagementSamples += 1;
        existing.qualifiedPosts += 1;
        existing.posts += 1;
        buckets.set(key, existing);
    }
    const engagedPosts = scoredTimingPosts.length;
    const candidateSlots = [...buckets.values()]
        .filter((entry) => entry.qualifiedPosts > 0)
        .map((entry) => ({
        day: HEATMAP_DAY_LABELS[entry.dayIndex],
        dayIndex: entry.dayIndex,
        hour: entry.hour,
        posts: entry.posts,
        qualifiedPosts: entry.qualifiedPosts,
        averageEngagementRate: entry.engagementSamples > 0
            ? Number((entry.engagementSum / entry.engagementSamples).toFixed(2))
            : 0,
        averageResponseScore: Number((entry.signalSum / entry.qualifiedPosts).toFixed(6)),
    }))
        .sort((left, right) => {
        if (right.averageResponseScore !== left.averageResponseScore) {
            return right.averageResponseScore - left.averageResponseScore;
        }
        if ((right.averageEngagementRate ?? 0) !== (left.averageEngagementRate ?? 0)) {
            return (right.averageEngagementRate ?? 0) - (left.averageEngagementRate ?? 0);
        }
        return right.posts - left.posts;
    });
    const maxResponseScore = candidateSlots[0]?.averageResponseScore ?? 0;
    const heatmap = [];
    for (let dayIndex = 0; dayIndex < HEATMAP_DAY_LABELS.length; dayIndex += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
            const slot = candidateSlots.find((entry) => entry.dayIndex === dayIndex && entry.hour === hour);
            const averageEngagementRate = slot?.averageEngagementRate ?? null;
            heatmap.push({
                day: HEATMAP_DAY_LABELS[dayIndex],
                dayIndex,
                hour,
                posts: slot?.posts ?? 0,
                averageEngagementRate,
                intensity: slot && maxResponseScore > 0
                    ? Number((slot.averageResponseScore / maxResponseScore).toFixed(4))
                    : 0,
            });
        }
    }
    const headline = candidateSlots[0];
    const secondary = candidateSlots[1];
    const hasMinimumPosts = timedPosts >= MINIMUM_BEST_TIME_POSTS;
    const engagementCoverage = timedPosts > 0 ? engagedPosts / timedPosts : 0;
    const hasSignalWinner = Boolean(headline && headline.averageResponseScore > 0);
    const hasRepeatableWinner = Boolean(headline && headline.qualifiedPosts >= MINIMUM_BEST_TIME_SLOT_SAMPLES);
    const signalStatus = !hasMinimumPosts
        ? 'not-enough-posts'
        : engagedPosts === 0
            ? 'no-engagement'
            : engagementCoverage < MINIMUM_BEST_TIME_ENGAGEMENT_COVERAGE
                ? 'low-engagement-coverage'
                : !hasSignalWinner || !hasRepeatableWinner || !headline || headline.averageEngagementRate <= 0
                    ? 'no-clear-winner'
                    : 'ready';
    const hasEnoughData = signalStatus === 'ready';
    return {
        hasEnoughData,
        minimumPostsRequired: MINIMUM_BEST_TIME_POSTS,
        postsConsidered: timedPosts,
        engagedPostsConsidered: engagedPosts,
        engagementCoverage: Number(engagementCoverage.toFixed(4)),
        signalStatus,
        summary: hasEnoughData && headline
            ? secondary
                ? `Best posting window so far: ${headline.day} ${headline.hour}:00 IST, with ${secondary.day} close behind.`
                : `Best posting window so far: ${headline.day} around ${headline.hour}:00 IST.`
            : !hasMinimumPosts
                ? `Timing signal is still forming. Publish at least ${MINIMUM_BEST_TIME_POSTS} posts so PrixmoAI can find your best posting window.`
                : engagedPosts === 0
                    ? 'No best time yet. Your recent posts need real engagement before PrixmoAI can judge timing.'
                    : engagementCoverage < MINIMUM_BEST_TIME_ENGAGEMENT_COVERAGE
                        ? 'Timing signal is still forming. At least half of your recent posts need engagement before PrixmoAI can judge the best posting time.'
                        : 'Timing signal is still forming. PrixmoAI needs repeated engagement in a time slot before recommending a best time.',
        topSlots: hasEnoughData ? candidateSlots.slice(0, 5) : [],
        heatmap,
    };
};
const buildFollowerGrowthSeries = (posts) => {
    const points = posts
        .filter((post) => post.publishedTime && post.followersAtPostTime !== null)
        .sort((left, right) => new Date(left.publishedTime || 0).getTime() - new Date(right.publishedTime || 0).getTime())
        .map((post) => ({
        date: post.publishedTime,
        label: toDateLabel(post.publishedTime),
        value: post.followersAtPostTime,
    }));
    const deduped = latestByKey(points, (point) => point.date, (point) => point.date);
    return deduped;
};
const getFollowerGrowthValue = (points) => {
    if (points.length < 2) {
        return null;
    }
    return points[points.length - 1].value - points[0].value;
};
const buildPlatformComparison = (posts) => {
    const grouped = new Map();
    for (const post of posts) {
        const key = normalizePlatformKey(post.platform) || 'other';
        const entries = grouped.get(key) ?? [];
        entries.push(post);
        grouped.set(key, entries);
    }
    const impressionValues = [...grouped.values()].map((entries) => entries.reduce((total, post) => total + post.impressions, 0) / Math.max(entries.length, 1));
    const minImpressions = Math.min(...impressionValues, 0);
    const maxImpressions = Math.max(...impressionValues, 1);
    return [...grouped.entries()]
        .map(([platform, entries]) => {
        const postsCount = entries.length;
        const impressions = entries.reduce((total, post) => total + post.impressions, 0);
        const reach = entries.reduce((total, post) => total + post.reach, 0);
        const engagements = entries.reduce((total, post) => total + post.engagements, 0);
        const engagementRate = reach > 0 ? Number(((engagements / reach) * 100).toFixed(2)) : null;
        const followerSeries = buildFollowerGrowthSeries(entries);
        const followerGrowth = getFollowerGrowthValue(followerSeries);
        const followerGrowthValue = followerGrowth ?? 0;
        const averageImpressions = impressions / Math.max(postsCount, 1);
        const normalizedImpressions = maxImpressions === minImpressions
            ? 1
            : (averageImpressions - minImpressions) / (maxImpressions - minImpressions);
        const score = ((engagementRate ?? 0) / 100) * 0.5 +
            normalizedImpressions * 0.3 +
            (followerGrowthValue > 0 ? Math.min(followerGrowthValue / 100, 1) : 0) * 0.2;
        return {
            platform,
            label: toPlatformLabel(platform),
            posts: postsCount,
            impressions,
            reach,
            engagements,
            engagementRate,
            followerGrowth,
            score: Number((score * 100).toFixed(2)),
        };
    })
        .sort((left, right) => right.score - left.score);
};
const buildContentTypeInsights = (posts) => [...posts.reduce((map, post) => {
        const postType = post.postType || 'post';
        const entry = map.get(postType) ?? {
            postType,
            posts: 0,
            engagementRateTotal: 0,
            impressions: 0,
            reach: 0,
            saves: 0,
        };
        entry.posts += 1;
        entry.engagementRateTotal += post.engagementRate ?? 0;
        entry.impressions += post.impressions;
        entry.reach += post.reach;
        entry.saves += post.saves;
        map.set(postType, entry);
        return map;
    }, new Map()).values()]
    .map((entry) => ({
    ...entry,
    averageRate: entry.posts ? entry.engagementRateTotal / entry.posts : 0,
    averageImpressions: entry.posts ? entry.impressions / entry.posts : 0,
    averageReach: entry.posts ? entry.reach / entry.posts : 0,
}))
    .sort((left, right) => right.averageRate - left.averageRate);
const buildContentTopicInsights = (posts) => [...posts.reduce((map, post) => {
        const topics = inferContentThemes(post.caption, post.postType);
        for (const topic of topics) {
            const entry = map.get(topic) ?? {
                topic,
                posts: 0,
                engagementRateTotal: 0,
                comments: 0,
                saves: 0,
            };
            entry.posts += 1;
            entry.engagementRateTotal += post.engagementRate ?? 0;
            entry.comments += post.comments;
            entry.saves += post.saves;
            map.set(topic, entry);
        }
        return map;
    }, new Map()).values()]
    .map((entry) => ({
    ...entry,
    averageRate: entry.posts ? entry.engagementRateTotal / entry.posts : 0,
}))
    .sort((left, right) => right.averageRate - left.averageRate);
const buildInsightCards = (posts, previousPosts, platformComparison, bestTime, trendSeries, range, learningProfiles = []) => {
    const cards = [];
    const sortedPosts = [...posts].sort((left, right) => right.performanceScore - left.performanceScore);
    const rankedPosts = sortedPosts.filter(hasMeaningfulPostSignal);
    const topPost = rankedPosts[0];
    const lowestPost = [...rankedPosts].reverse()[0];
    const bestPlatform = platformComparison[0];
    const secondPlatform = platformComparison[1];
    const contentTypeInsights = buildContentTypeInsights(posts);
    const bestContentType = contentTypeInsights[0];
    const secondContentType = contentTypeInsights[1];
    const topicInsights = buildContentTopicInsights(posts);
    const bestTopic = topicInsights[0];
    const currentFollowerGrowth = getFollowerGrowthValue(buildFollowerGrowthSeries(posts));
    const previousFollowerGrowth = getFollowerGrowthValue(buildFollowerGrowthSeries(previousPosts));
    const followerGrowthChange = computeChangePercent(currentFollowerGrowth, previousFollowerGrowth);
    const weakestTrend = [...trendSeries]
        .map((point) => ({
        ...point,
        engagementRate: point.reach > 0 ? Number(((point.engagements / point.reach) * 100).toFixed(2)) : null,
    }))
        .filter((point) => point.engagementRate !== null)
        .sort((left, right) => left.engagementRate - right.engagementRate)[0];
    const weeksCovered = Math.max(range.days / 7, 1);
    const postsPerWeek = posts.length / weeksCovered;
    const currentEngagements = posts.reduce((total, post) => total + post.engagements, 0);
    const previousEngagements = previousPosts.reduce((total, post) => total + post.engagements, 0);
    const engagementChange = computeChangePercent(currentEngagements, previousEngagements);
    for (const profile of learningProfiles.slice(0, 2)) {
        const platformLabel = formatTitleCase(profile.platform);
        const topPattern = profile.patterns[0];
        const weakPattern = profile.weakPatterns[0];
        cards.push({
            id: `learning-${profile.platform}`,
            title: `${platformLabel} learning loop`,
            description: topPattern
                ? `${platformLabel} is learning that ${formatLearningPatternLabel(topPattern.dimension, topPattern.label)} are working best for this brand.`
                : weakPattern
                    ? `${platformLabel} has enough learning data to flag what to avoid, but a clear repeatable winner has not emerged yet.`
                    : `${platformLabel} is still collecting enough reliable evidence to describe a repeatable winning pattern clearly.`,
            supportingMetric: topPattern
                ? `${topPattern.sampleSize} posts analyzed`
                : 'Updated from the latest learning sync',
            confidence: topPattern && topPattern.sampleSize >= 4
                ? 'high'
                : topPattern
                    ? 'medium'
                    : 'low',
            tone: 'positive',
        });
        if (weakPattern) {
            cards.push({
                id: `learning-weak-${profile.platform}`,
                title: `What to avoid on ${platformLabel}`,
                description: weakPattern.explanation,
                supportingMetric: `${weakPattern.sampleSize} posts analyzed`,
                confidence: weakPattern.sampleSize >= 4 ? 'medium' : 'low',
                tone: 'warning',
            });
        }
    }
    if (topPost) {
        cards.push({
            id: 'top-post',
            title: 'Top performing post',
            description: `${topPost.platformLabel} ${topPost.postType || 'post'} led this period with ${topPost.engagementRate?.toFixed(1) || '0.0'}% engagement.`,
            supportingMetric: `${topPost.impressions.toLocaleString()} impressions`,
            confidence: posts.length >= constants_1.ANALYTICS_LEARNING_MIN_POSTS ? 'high' : 'medium',
            tone: 'positive',
        });
    }
    if (lowestPost && lowestPost.id !== topPost?.id) {
        cards.push({
            id: 'lowest-post',
            title: 'Lowest performing post',
            description: `${lowestPost.platformLabel} ${lowestPost.postType || 'post'} needs a different angle or timing based on the current score.`,
            supportingMetric: `${lowestPost.engagementRate?.toFixed(1) || '0.0'}% engagement`,
            confidence: posts.length >= constants_1.ANALYTICS_LEARNING_MIN_POSTS ? 'medium' : 'low',
            tone: 'warning',
        });
    }
    if (bestTime.hasEnoughData) {
        cards.push({
            id: 'best-time',
            title: 'Best time to post',
            description: bestTime.summary,
            supportingMetric: `${bestTime.topSlots[0]?.averageEngagementRate.toFixed(1) || '0.0'}% avg engagement`,
            confidence: bestTime.postsConsidered >= 10 ? 'high' : 'medium',
            tone: 'positive',
        });
    }
    else {
        const hasMinimumPosts = bestTime.postsConsidered >= bestTime.minimumPostsRequired;
        cards.push({
            id: 'best-time',
            title: 'Best time to post',
            description: bestTime.summary,
            supportingMetric: bestTime.signalStatus === 'no-engagement'
                ? 'No engaged posts yet'
                : bestTime.signalStatus === 'low-engagement-coverage'
                    ? `${Math.round(bestTime.engagementCoverage * 100)}% of posts have engagement`
                    : hasMinimumPosts
                        ? 'Timing signal is still forming'
                        : `${bestTime.postsConsidered} of ${bestTime.minimumPostsRequired} posts collected`,
            confidence: 'low',
            tone: bestTime.signalStatus === 'no-engagement' ? 'warning' : 'neutral',
        });
    }
    if (bestPlatform) {
        const gap = secondPlatform && bestPlatform.score > 0
            ? Number((((bestPlatform.score - secondPlatform.score) / bestPlatform.score) * 100).toFixed(1))
            : null;
        cards.push({
            id: 'best-platform',
            title: 'Best platform',
            description: gap !== null
                ? `${bestPlatform.label} is outperforming ${secondPlatform?.label || 'other channels'} by ${Math.abs(gap).toFixed(1)}% on the blended platform score.`
                : `${bestPlatform.label} is leading on engagement and reach right now.`,
            supportingMetric: `${bestPlatform.engagementRate?.toFixed(1) || '0.0'}% engagement rate`,
            confidence: platformComparison.length > 1 ? 'high' : 'medium',
            tone: 'positive',
        });
    }
    if (bestContentType) {
        const liftVsSecondBest = secondContentType && bestContentType.averageRate > 0
            ? Number((((bestContentType.averageRate - secondContentType.averageRate) /
                bestContentType.averageRate) *
                100).toFixed(1))
            : null;
        cards.push({
            id: 'best-content-type',
            title: 'Best content type',
            description: liftVsSecondBest !== null
                ? `${formatTitleCase(bestContentType.postType)} posts are outperforming ${formatTitleCase(secondContentType?.postType || 'other formats')} by ${Math.abs(liftVsSecondBest).toFixed(1)}% on average engagement.`
                : `${formatTitleCase(bestContentType.postType)} posts are driving the strongest engagement right now.`,
            supportingMetric: `${bestContentType.averageRate.toFixed(1)}% avg engagement`,
            confidence: posts.length >= 5 ? 'high' : 'medium',
            tone: 'positive',
        });
    }
    if (bestTopic) {
        cards.push({
            id: 'best-topic',
            title: 'What should you post?',
            description: bestTopic.topic === 'general'
                ? 'Posts with a clear theme are starting to separate from general updates. Lean into stronger, more repeatable topics.'
                : `${formatTitleCase(bestTopic.topic)} content is drawing the strongest engagement from your audience right now.`,
            supportingMetric: `${bestTopic.averageRate.toFixed(1)}% avg engagement`,
            confidence: bestTopic.posts >= 3 ? 'medium' : 'low',
            tone: 'positive',
        });
    }
    cards.push({
        id: 'engagement-trend',
        title: 'Engagement trend',
        description: engagementChange !== null && engagementChange < 0
            ? 'Engagement is slipping versus the previous period. Lean into the top-performing time slots and formats.'
            : 'Engagement is holding steady or improving versus the previous period.',
        supportingMetric: `${engagementChange?.toFixed(1) ?? '0.0'}% vs previous period`,
        confidence: previousPosts.length > 0 ? 'medium' : 'low',
        tone: engagementChange !== null && engagementChange < 0 ? 'warning' : 'positive',
    });
    if (weakestTrend) {
        cards.push({
            id: 'weakest-trend',
            title: 'Lowest performing trend',
            description: `The weakest day in this range was ${weakestTrend.label}, where engagement lagged compared with the rest of the period.`,
            supportingMetric: `${weakestTrend.engagementRate?.toFixed(1) || '0.0'}% engagement rate`,
            confidence: trendSeries.length >= 5 ? 'medium' : 'low',
            tone: 'warning',
        });
    }
    cards.push({
        id: 'follower-growth',
        title: 'Am I growing?',
        description: currentFollowerGrowth !== null && currentFollowerGrowth > 0
            ? 'Follower momentum is positive in the selected period.'
            : 'Follower growth is flat or unavailable. Consistent posting and stronger formats should help unlock growth.',
        supportingMetric: currentFollowerGrowth !== null
            ? `${currentFollowerGrowth.toLocaleString()} followers vs ${previousFollowerGrowth?.toLocaleString() ?? '—'} previous`
            : 'No follower baseline captured yet',
        confidence: currentFollowerGrowth !== null ? 'medium' : 'low',
        tone: currentFollowerGrowth !== null && currentFollowerGrowth > 0 && (followerGrowthChange ?? 0) >= 0
            ? 'positive'
            : 'neutral',
    });
    cards.push({
        id: 'posting-frequency',
        title: 'Recommended posting frequency',
        description: postsPerWeek < 2
            ? 'Increase publishing cadence toward 3 to 4 posts per week to build better signal and consistency.'
            : postsPerWeek > 5
                ? 'Current cadence is strong. Keep the frequency steady and concentrate on the best formats and time slots.'
                : 'Your current cadence is healthy. Maintain it while refining timing and content mix.',
        supportingMetric: `${postsPerWeek.toFixed(1)} published posts per week`,
        confidence: posts.length >= 6 ? 'high' : 'medium',
        tone: postsPerWeek < 2 ? 'warning' : 'neutral',
    });
    const recommendedAction = bestContentType?.postType === 'reel'
        ? 'Post more reels during the best-performing time windows.'
        : bestTopic?.topic === 'educational' || bestTopic?.topic === 'tutorials' || bestTopic?.topic === 'tips'
            ? 'Create more educational content because saves and engagement are signaling learning intent.'
            : engagementChange !== null && engagementChange < 0 && bestTime.hasEnoughData
                ? 'Try scheduling the next posts inside the strongest day and hour windows to recover engagement.'
                : currentFollowerGrowth !== null && currentFollowerGrowth <= 0
                    ? 'Increase posting frequency slightly and focus on the strongest platform to restart follower growth.'
                    : bestPlatform?.platform === 'instagram'
                        ? 'Shift the next few posts toward Instagram and test the top time slots.'
                        : bestTime.hasEnoughData
                            ? 'Schedule the next posts inside the strongest day and hour windows.'
                            : 'Publish more posts to unlock stronger recommendations.';
    cards.push({
        id: 'next-action',
        title: 'Suggested next action',
        description: recommendedAction,
        supportingMetric: `${posts.length} published post${posts.length === 1 ? '' : 's'} in range`,
        confidence: posts.length >= 8 ? 'high' : posts.length >= 4 ? 'medium' : 'low',
        tone: 'neutral',
    });
    return cards.slice(0, 8);
};
const buildLearningDashboard = (learningProfiles, scopedPostsCount, platformScope) => {
    const sortedProfiles = [...learningProfiles].sort((left, right) => new Date(right.lastAnalyzedAt).getTime() - new Date(left.lastAnalyzedAt).getTime());
    const topProfile = (platformScope !== 'all'
        ? sortedProfiles.find((profile) => profile.platform === platformScope)
        : null) ??
        sortedProfiles[0] ??
        null;
    const topPattern = topProfile?.patterns.find((pattern) => !isUnknownHookPattern(pattern)) ?? null;
    const weakPattern = topProfile?.weakPatterns[0] ?? null;
    const topRecommendationReason = topProfile && typeof topProfile.analyticsContext.recommendationReason === 'string'
        ? topProfile.analyticsContext.recommendationReason
        : null;
    const topRecommendationAccuracy = topProfile && typeof topProfile.analyticsContext.recommendationAccuracy === 'number'
        ? topProfile.analyticsContext.recommendationAccuracy
        : null;
    const topRecommendationAccuracyLabel = topProfile && typeof topProfile.analyticsContext.recommendationAccuracyLabel === 'string'
        ? topProfile.analyticsContext.recommendationAccuracyLabel
        : null;
    const storedRecommendation = topProfile?.recommendationText?.trim() ?? null;
    const genericRecommendationPattern = /keep testing .* consistent cadence so prixmoai can lock onto a stronger winner/i;
    const fallbackRecommendation = topPattern
        ? `Next, try more ${formatLearningPatternLabel(topPattern.dimension, topPattern.label)}. They are landing better than your usual results right now.`
        : weakPattern
            ? 'Need a few more strong posts before PrixmoAI can suggest the next post with confidence.'
            : 'Need a little more clean data before PrixmoAI can suggest the next post.';
    const topRecommendation = storedRecommendation && !genericRecommendationPattern.test(storedRecommendation)
        ? storedRecommendation
        : fallbackRecommendation;
    const isReady = scopedPostsCount >= constants_1.ANALYTICS_LEARNING_MIN_POSTS;
    const missingDataMessage = isReady
        ? null
        : `Publish ${constants_1.ANALYTICS_LEARNING_MIN_POSTS} scheduler posts to unlock smarter recommendations.`;
    const platformLabel = topProfile ? formatTitleCase(topProfile.platform) : 'This platform';
    const summary = !isReady
        ? missingDataMessage
        : topPattern
            ? `${platformLabel} is responding best to ${formatLearningPatternLabel(topPattern.dimension, topPattern.label)} right now.`
            : weakPattern
                ? `${platformLabel} can now flag what to avoid, but the next strong winner is still forming.`
                : topProfile
                    ? `${platformLabel} has enough data to learn from, but the best next-post pattern is still too close to call.`
                    : 'PrixmoAI is analyzing your recent posts and will surface learning signals as soon as the next sync completes.';
    const confidence = !isReady || !topProfile
        ? 'low'
        : scopedPostsCount >= 12
            ? 'high'
            : scopedPostsCount >= constants_1.ANALYTICS_LEARNING_MIN_POSTS
                ? 'medium'
                : 'low';
    return {
        summary,
        topRecommendation: isReady ? topRecommendation : null,
        recommendationReason: isReady ? topRecommendationReason : null,
        recommendationAccuracy: isReady ? topRecommendationAccuracy : null,
        recommendationAccuracyLabel: isReady ? topRecommendationAccuracyLabel : null,
        confidence,
        lastAnalyzedAt: isReady
            ? topProfile?.lastAnalyzedAt ?? topProfile?.updatedAt ?? null
            : null,
        isReady,
        postsConsidered: scopedPostsCount,
        minimumPostsRequired: constants_1.ANALYTICS_LEARNING_MIN_POSTS,
        missingDataMessage,
        profiles: sortedProfiles,
    };
};
const getAnalyticsDashboard = async (client, userId, options = {}) => {
    const range = buildDateRange(options);
    const platformScope = options.platformScope ?? 'all';
    const [{ data: scheduledPostsData, error: scheduledPostsError }, { data: socialAccountsData, error: socialAccountsError }, rawAnalyticsRows, rawAudienceSnapshots, learningProfiles,] = await Promise.all([
        client
            .from('scheduled_posts')
            .select('*')
            .eq('user_id', userId),
        client
            .from('social_accounts')
            .select('*')
            .eq('user_id', userId),
        (0, analytics_1.getAnalyticsByUserId)(client, userId),
        (0, analytics_1.getAnalyticsAudienceSnapshotsByUserId)(client, userId),
        (0, analyticsLearning_1.listAnalyticsLearningProfilesByUser)(client, userId, {
            platform: platformScope === 'all' ? null : platformScope,
        }),
    ]);
    if (scheduledPostsError) {
        throw new Error(scheduledPostsError.message || 'Failed to load scheduled post analytics context');
    }
    if (socialAccountsError) {
        throw new Error(socialAccountsError.message || 'Failed to load connected accounts for analytics');
    }
    const scheduledPosts = (scheduledPostsData ?? []).map((row) => ({
        ...row,
        published_at: resolveScheduledPostPublishedAt(row),
    }));
    const socialAccounts = (socialAccountsData ?? []);
    const scheduledPostById = new Map(scheduledPosts.map((row) => [row.id, row]));
    const socialAccountById = new Map(socialAccounts.map((row) => [row.id, row]));
    const audienceSnapshots = rawAudienceSnapshots.filter((snapshot) => platformScope === 'all' ||
        normalizePlatformKey(snapshot.platform) === platformScope);
    const connectedPlatforms = [...new Set(socialAccounts
            .map((account) => normalizePlatformKey(account.platform))
            .filter((platform) => Boolean(platform)))];
    const analyticsRows = rawAnalyticsRows
        .map((row) => {
        const rawRow = row;
        const scheduledPost = rawRow.scheduledPostId
            ? scheduledPostById.get(rawRow.scheduledPostId)
            : undefined;
        const socialAccount = scheduledPost
            ? socialAccountById.get(scheduledPost.social_account_id)
            : undefined;
        const platform = normalizePlatformKey(rawRow.platform) ||
            normalizePlatformKey(scheduledPost?.platform) ||
            normalizePlatformKey(socialAccount?.platform);
        const platformLabel = toPlatformLabel(platform);
        const likes = toSafeNumber(rawRow.likes);
        const comments = toSafeNumber(rawRow.comments);
        const saves = toSafeNumber(rawRow.saves);
        const shares = toSafeNumber(rawRow.shares);
        const reactions = toSafeNumber(rawRow.reactions);
        const reach = toSafeNumber(rawRow.reach);
        const engagements = likes + comments + saves + shares + reactions;
        const engagementRateRatio = toRateRatio(rawRow.engagementRate, reach, engagements);
        const engagementRate = toPercent(engagementRateRatio);
        const mediaUrl = rawRow.mediaUrl ||
            scheduledPost?.media_url ||
            null;
        return {
            ...rawRow,
            platform,
            platformLabel,
            socialAccountId: scheduledPost?.social_account_id || null,
            socialAccountName: socialAccount?.account_name || socialAccount?.account_id || null,
            postType: inferPostType(platform, scheduledPost?.media_type || null, mediaUrl, rawRow.postType),
            caption: rawRow.caption || scheduledPost?.caption || null,
            mediaUrl,
            thumbnailUrl: rawRow.thumbnailUrl || mediaUrl,
            reactions,
            videoPlays: toSafeNumber(rawRow.videoPlays),
            replays: toSafeNumber(rawRow.replays),
            exits: toSafeNumber(rawRow.exits),
            profileVisits: toSafeNumber(rawRow.profileVisits),
            postClicks: toSafeNumber(rawRow.postClicks),
            pageLikes: toSafeNumber(rawRow.pageLikes),
            completionRate: rawRow.completionRate ?? null,
            followersAtPostTime: rawRow.followersAtPostTime ?? null,
            publishedTime: rawRow.publishedTime ||
                (scheduledPost ? resolveScheduledPostPublishedAt(scheduledPost) : null) ||
                null,
            topComments: rawRow.topComments || [],
            engagementRate,
            platformKey: platform,
            postKey: getPostKey(rawRow),
            engagements,
            engagementRateRatio,
        };
    })
        .filter((row) => platformScope === 'all' || row.platformKey === platformScope);
    const currentRows = analyticsRows.filter((row) => isWithinRange(row.recordedAt, range.start, range.end));
    const previousRows = analyticsRows.filter((row) => isWithinRange(row.recordedAt, range.previousStart, range.previousEnd));
    const currentAudienceSnapshots = audienceSnapshots.filter((snapshot) => isWithinRange(snapshot.recordedAt, range.start, range.end));
    const previousAudienceSnapshots = audienceSnapshots.filter((snapshot) => isWithinRange(snapshot.recordedAt, range.previousStart, range.previousEnd));
    const currentSnapshots = latestByKey(currentRows, (row) => row.postKey, (row) => row.recordedAt);
    const previousSnapshots = latestByKey(previousRows, (row) => row.postKey, (row) => row.recordedAt);
    const currentPublishedPosts = scheduledPosts.filter((post) => {
        const platform = normalizePlatformKey(post.platform);
        if (platformScope !== 'all' && platform !== platformScope) {
            return false;
        }
        return (post.status === 'published' &&
            isWithinRange(resolveScheduledPostPublishedAt(post), range.start, range.end));
    });
    const previousPublishedPosts = scheduledPosts.filter((post) => {
        const platform = normalizePlatformKey(post.platform);
        if (platformScope !== 'all' && platform !== platformScope) {
            return false;
        }
        return (post.status === 'published' &&
            isWithinRange(resolveScheduledPostPublishedAt(post), range.previousStart, range.previousEnd));
    });
    const trendSeries = buildTrendBuckets(currentRows, range);
    const platformBreakdownForMetric = (selector) => {
        const values = {};
        for (const row of currentSnapshots) {
            if (!row.platformKey) {
                continue;
            }
            values[row.platformKey] = (values[row.platformKey] ?? 0) + selector(row);
        }
        return values;
    };
    const sumMetric = (rows, selector) => rows.reduce((total, row) => total + selector(row), 0);
    const currentReach = sumMetric(currentSnapshots, (row) => row.reach);
    const previousReach = sumMetric(previousSnapshots, (row) => row.reach);
    const currentEngagements = sumMetric(currentSnapshots, (row) => row.engagements);
    const previousEngagements = sumMetric(previousSnapshots, (row) => row.engagements);
    const currentFollowerSeriesFromSnapshots = buildFollowerGrowthSeriesFromAudienceSnapshots(currentAudienceSnapshots);
    const previousFollowerSeriesFromSnapshots = buildFollowerGrowthSeriesFromAudienceSnapshots(previousAudienceSnapshots);
    const currentFollowerSeriesFallback = buildFollowerGrowthSeries(currentSnapshots.map((row) => ({
        ...row,
        performanceScore: 0,
        keywords: [],
        trend: [],
    })));
    const previousFollowerSeriesFallback = buildFollowerGrowthSeries(previousSnapshots.map((row) => ({
        ...row,
        performanceScore: 0,
        keywords: [],
        trend: [],
    })));
    const currentFollowerSeries = currentFollowerSeriesFromSnapshots.length > 0
        ? currentFollowerSeriesFromSnapshots
        : currentFollowerSeriesFallback;
    const previousFollowerSeries = previousFollowerSeriesFromSnapshots.length > 0
        ? previousFollowerSeriesFromSnapshots
        : previousFollowerSeriesFallback;
    const currentFollowerGrowth = getFollowerGrowthValue(currentFollowerSeries);
    const previousFollowerGrowth = getFollowerGrowthValue(previousFollowerSeries);
    const overview = {
        impressions: buildMetric(sumMetric(currentSnapshots, (row) => row.impressions), sumMetric(previousSnapshots, (row) => row.impressions), buildCumulativeSparklineFromRows(currentRows, range, (row) => row.impressions), platformBreakdownForMetric((row) => row.impressions)),
        reach: buildMetric(currentReach, previousReach, buildCumulativeSparklineFromRows(currentRows, range, (row) => row.reach), platformBreakdownForMetric((row) => row.reach)),
        engagementRate: buildMetric(currentReach > 0 ? Number(((currentEngagements / currentReach) * 100).toFixed(2)) : null, previousReach > 0
            ? Number(((previousEngagements / previousReach) * 100).toFixed(2))
            : null, buildSparkline(trendSeries, (point) => point.reach > 0 ? Number(((point.engagements / point.reach) * 100).toFixed(2)) : 0)),
        engagements: buildMetric(currentEngagements, previousEngagements, buildCumulativeSparklineFromRows(currentRows, range, (row) => row.engagements), platformBreakdownForMetric((row) => row.engagements)),
        likes: buildMetric(sumMetric(currentSnapshots, (row) => row.likes), sumMetric(previousSnapshots, (row) => row.likes), buildCumulativeSparklineFromRows(currentRows, range, (row) => row.likes), platformBreakdownForMetric((row) => row.likes)),
        comments: buildMetric(sumMetric(currentSnapshots, (row) => row.comments), sumMetric(previousSnapshots, (row) => row.comments), buildCumulativeSparklineFromRows(currentRows, range, (row) => row.comments), platformBreakdownForMetric((row) => row.comments)),
        saves: buildMetric(sumMetric(currentSnapshots, (row) => row.saves), sumMetric(previousSnapshots, (row) => row.saves), buildCumulativeSparklineFromRows(currentRows, range, (row) => row.saves), platformBreakdownForMetric((row) => row.saves)),
        shares: buildMetric(sumMetric(currentSnapshots, (row) => row.shares), sumMetric(previousSnapshots, (row) => row.shares), buildCumulativeSparklineFromRows(currentRows, range, (row) => row.shares), platformBreakdownForMetric((row) => row.shares)),
        newFollowers: buildMetric(currentFollowerGrowth, previousFollowerGrowth, currentFollowerSeries),
        postsPublished: buildMetric(currentPublishedPosts.length, previousPublishedPosts.length, buildSparkline(trendSeries, (point) => currentPublishedPosts.filter((post) => isWithinRange(resolveScheduledPostPublishedAt(post), point.date, (0, timezone_1.addIstDays)(new Date(point.date), 1).toISOString())).length)),
    };
    const postTrendMap = new Map();
    for (const row of currentRows) {
        const entries = postTrendMap.get(row.postKey) ?? [];
        entries.push({
            date: row.recordedAt,
            label: toDateLabel(row.recordedAt),
            impressions: row.impressions,
            reach: row.reach,
            engagements: row.engagements,
        });
        postTrendMap.set(row.postKey, entries);
    }
    const postScores = (0, analyticsPerformance_1.buildAnalyticsPerformanceScores)(currentSnapshots.map((row) => ({
        id: row.id,
        likes: row.likes,
        comments: row.comments,
        saves: row.saves,
        shares: row.shares,
        impressions: row.impressions,
        reach: row.reach,
        engagements: row.engagements,
        engagementRate: row.engagementRate,
        followersAtPostTime: row.followersAtPostTime,
        publishedTime: row.publishedTime,
    })));
    const postScoreMap = new Map(postScores.map((entry) => [entry.id, entry]));
    const posts = currentSnapshots
        .map((row) => {
        const performance = postScoreMap.get(row.id);
        return {
            id: row.id,
            scheduledPostId: row.scheduledPostId,
            contentId: row.contentId,
            platform: row.platform,
            platformLabel: row.platformLabel,
            socialAccountId: row.socialAccountId,
            socialAccountName: row.socialAccountName,
            postExternalId: row.postExternalId,
            postType: row.postType,
            caption: row.caption,
            mediaUrl: row.mediaUrl,
            thumbnailUrl: row.thumbnailUrl,
            publishedTime: row.publishedTime,
            impressions: row.impressions,
            reach: row.reach,
            likes: row.likes,
            comments: row.comments,
            saves: row.saves,
            shares: row.shares,
            reactions: row.reactions,
            videoPlays: row.videoPlays,
            replays: row.replays,
            exits: row.exits,
            profileVisits: row.profileVisits,
            postClicks: row.postClicks,
            pageLikes: row.pageLikes,
            completionRate: row.completionRate,
            followersAtPostTime: row.followersAtPostTime,
            engagements: row.engagements,
            engagementRate: row.engagementRate,
            performanceScore: Number((performance?.score ?? 0).toFixed(2)),
            keywords: extractKeywords(row.caption),
            topComments: row.topComments,
            trend: (postTrendMap.get(row.postKey) ?? [])
                .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
                .slice(-8),
        };
    })
        .sort((left, right) => {
        const leftScore = postScoreMap.get(left.id);
        const rightScore = postScoreMap.get(right.id);
        if (leftScore && rightScore) {
            return (0, analyticsPerformance_1.compareAnalyticsPerformanceScores)({
                ...leftScore,
                likes: left.likes,
                comments: left.comments,
                saves: left.saves,
                shares: left.shares,
                reach: left.reach,
                impressions: left.impressions,
                publishedTime: left.publishedTime,
                id: left.id,
            }, {
                ...rightScore,
                likes: right.likes,
                comments: right.comments,
                saves: right.saves,
                shares: right.shares,
                reach: right.reach,
                impressions: right.impressions,
                publishedTime: right.publishedTime,
                id: right.id,
            });
        }
        return right.performanceScore - left.performanceScore;
    });
    const bestTime = buildHeatmap(posts.filter((post) => Boolean(post.publishedTime)));
    const platformComparison = buildPlatformComparison(posts);
    const audienceFollowerSeries = currentFollowerSeries.length
        ? currentFollowerSeries
        : buildFollowerGrowthSeries(posts);
    const fallbackAgeGenderBreakdown = collectAudienceBreakdown(socialAccounts, [
        'ageGenderBreakdown',
        'age_gender_breakdown',
        'audienceAgeGenderBreakdown',
        'audience_age_gender_breakdown',
    ]);
    const fallbackTopLocations = collectAudienceBreakdown(socialAccounts, [
        'topLocations',
        'top_locations',
        'audienceTopLocations',
        'audience_top_locations',
        'locations',
    ]);
    const latestAudienceSnapshots = latestByKey(currentAudienceSnapshots, (snapshot) => snapshot.socialAccountId, (snapshot) => snapshot.recordedAt);
    const ageDistribution = mergeAudienceBreakdownItems(latestAudienceSnapshots.map((snapshot) => snapshot.ageDistribution));
    const genderDistribution = mergeAudienceBreakdownItems(latestAudienceSnapshots.map((snapshot) => snapshot.genderDistribution));
    const ageGenderBreakdown = ageDistribution.length || genderDistribution.length
        ? mergeAudienceBreakdownItems([
            ...latestAudienceSnapshots.map((snapshot) => [
                ...snapshot.ageDistribution,
                ...snapshot.genderDistribution,
            ]),
        ])
        : fallbackAgeGenderBreakdown;
    const topLocations = mergeAudienceBreakdownItems(latestAudienceSnapshots.map((snapshot) => snapshot.topLocations));
    const mergedTopLocations = topLocations.length ? topLocations : fallbackTopLocations;
    const followerGrowthValue = getFollowerGrowthValue(audienceFollowerSeries);
    const profileVisits = aggregateLatestAudienceMetric(currentAudienceSnapshots, (snapshot) => snapshot.profileVisits);
    const pageLikes = aggregateLatestAudienceMetric(currentAudienceSnapshots, (snapshot) => snapshot.pageLikes);
    const activeHoursHeatmap = buildActiveHoursHeatmapFromSnapshots(currentAudienceSnapshots, bestTime.heatmap);
    const audience = {
        hasAudienceData: audienceFollowerSeries.length > 1 ||
            bestTime.hasEnoughData ||
            ageGenderBreakdown.length > 0 ||
            mergedTopLocations.length > 0,
        ageDistribution,
        genderDistribution,
        ageGenderBreakdown,
        topLocations: mergedTopLocations,
        followerGrowthSeries: audienceFollowerSeries,
        followerGrowthValue,
        profileVisits,
        pageLikes,
        activeHoursHeatmap,
        bestTimeSummary: bestTime.summary,
        summaryNotes: [
            bestTime.summary,
            followerGrowthValue !== null
                ? `Follower baseline changed by ${followerGrowthValue.toLocaleString()} over this range.`
                : 'Follower growth data is not available yet for this account set.',
            ageGenderBreakdown[0]
                ? `Top audience segment: ${ageGenderBreakdown[0].label}.`
                : 'Audience age and gender data is not available yet.',
            mergedTopLocations[0]
                ? `Top location right now: ${mergedTopLocations[0].label}.`
                : 'Location insights will appear as soon as connected platforms provide them.',
        ],
    };
    const insights = buildInsightCards(posts, previousSnapshots.map((row) => ({
        id: row.id,
        scheduledPostId: row.scheduledPostId,
        contentId: row.contentId,
        platform: row.platform,
        platformLabel: row.platformLabel,
        socialAccountId: row.socialAccountId,
        socialAccountName: row.socialAccountName,
        postExternalId: row.postExternalId,
        postType: row.postType,
        caption: row.caption,
        mediaUrl: row.mediaUrl,
        thumbnailUrl: row.thumbnailUrl,
        publishedTime: row.publishedTime,
        impressions: row.impressions,
        reach: row.reach,
        likes: row.likes,
        comments: row.comments,
        saves: row.saves,
        shares: row.shares,
        reactions: row.reactions,
        videoPlays: row.videoPlays,
        replays: row.replays,
        exits: row.exits,
        profileVisits: row.profileVisits,
        postClicks: row.postClicks,
        pageLikes: row.pageLikes,
        completionRate: row.completionRate,
        followersAtPostTime: row.followersAtPostTime,
        engagements: row.engagements,
        engagementRate: row.engagementRate,
        performanceScore: 0,
        keywords: extractKeywords(row.caption),
        topComments: row.topComments,
        trend: [],
    })), platformComparison, bestTime, trendSeries, range, learningProfiles);
    const learning = buildLearningDashboard(learningProfiles, posts.length, platformScope);
    return {
        dateRange: {
            preset: range.preset,
            start: range.start,
            end: range.end,
            previousStart: range.previousStart,
            previousEnd: range.previousEnd,
            days: range.days,
        },
        platformScope,
        lastUpdatedAt: currentRows
            .map((row) => row.recordedAt)
            .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ??
            null,
        connectedPlatforms,
        overview,
        trends: {
            impressionsReachSeries: trendSeries,
            engagementSeries: trendSeries,
        },
        posts,
        audience,
        insights,
        platformComparison,
        bestTimeToPost: bestTime,
        learning,
    };
};
exports.getAnalyticsDashboard = getAnalyticsDashboard;
