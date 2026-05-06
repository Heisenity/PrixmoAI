"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAnalyticsLearningWorker = exports.enqueueAnalyticsLearningJob = exports.refreshAnalyticsLearningForUser = void 0;
const bullmq_1 = require("bullmq");
const constants_1 = require("../config/constants");
const analyticsLearning_1 = require("../db/queries/analyticsLearning");
const analytics_1 = require("../db/queries/analytics");
const brandProfiles_1 = require("../db/queries/brandProfiles");
const supabase_1 = require("../db/supabase");
const redis_1 = require("../lib/redis");
const queueNames_1 = require("../queues/queueNames");
const workerOptions_1 = require("../queues/workerOptions");
const runtimeCache_service_1 = require("./runtimeCache.service");
const brandMemory_service_1 = require("./brandMemory.service");
const analyticsPerformance_1 = require("../lib/analyticsPerformance");
let analyticsLearningQueue = null;
let analyticsLearningWorker = null;
let analyticsLearningWorkerIdleTimer = null;
const CONTENT_TOPIC_RULES = [
    {
        id: 'educational',
        matchers: [/\btips?\b/i, /\bguide\b/i, /\blearn\b/i, /\beducat/i, /\bexplained?\b/i],
    },
    {
        id: 'promotional',
        matchers: [/\bsale\b/i, /\boffer\b/i, /\bdiscount\b/i, /\bbuy\b/i, /\bshop\b/i],
    },
    {
        id: 'product',
        matchers: [/\bproduct\b/i, /\blaunch\b/i, /\bfeature\b/i, /\bsolution\b/i],
    },
    {
        id: 'community',
        matchers: [/\bcommunity\b/i, /\bjoin\b/i, /\btogether\b/i, /\bteam\b/i],
    },
    {
        id: 'thought-leadership',
        matchers: [/\binsight\b/i, /\bstrategy\b/i, /\btrend\b/i, /\bwhy\b/i, /\bopinion\b/i],
    },
];
const toStringArray = (value) => Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const extractTextValue = (value, depth = 0) => {
    if (depth > 4) {
        return '';
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => extractTextValue(entry, depth + 1))
            .filter(Boolean)
            .join(' ')
            .trim();
    }
    if (!isRecord(value)) {
        return '';
    }
    for (const key of ['text', 'value', 'content', 'copy', 'message', 'script']) {
        const normalized = extractTextValue(value[key], depth + 1);
        if (normalized) {
            return normalized;
        }
    }
    return Object.values(value)
        .map((entry) => extractTextValue(entry, depth + 1))
        .filter(Boolean)
        .join(' ')
        .trim();
};
const toCaptionText = (value) => {
    if (!Array.isArray(value)) {
        return '';
    }
    return value
        .map((entry) => {
        if (typeof entry === 'string') {
            return entry.trim();
        }
        if (!isRecord(entry)) {
            return '';
        }
        return [
            typeof entry.hook === 'string' ? entry.hook.trim() : '',
            typeof entry.mainCopy === 'string' ? entry.mainCopy.trim() : '',
            typeof entry.shortCaption === 'string' ? entry.shortCaption.trim() : '',
            typeof entry.cta === 'string' ? entry.cta.trim() : '',
        ]
            .filter(Boolean)
            .join(' ');
    })
        .filter(Boolean)
        .join(' ');
};
const toCaptionVariants = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
        if (!isRecord(entry)) {
            return null;
        }
        const hook = typeof entry.hook === 'string' ? entry.hook.trim() : '';
        const mainCopy = typeof entry.mainCopy === 'string' ? entry.mainCopy.trim() : '';
        const shortCaption = typeof entry.shortCaption === 'string' ? entry.shortCaption.trim() : '';
        const cta = typeof entry.cta === 'string' ? entry.cta.trim() : '';
        if (!hook || !mainCopy || !shortCaption || !cta) {
            return null;
        }
        return {
            hook,
            mainCopy,
            shortCaption,
            cta,
        };
    })
        .filter((entry) => Boolean(entry));
};
const toGeneratedContent = (row) => ({
    id: row.id,
    userId: '',
    brandProfileId: row.brand_profile_id,
    conversationId: null,
    storageProvider: null,
    storageBucket: null,
    storageObjectKey: null,
    storagePublicUrl: null,
    storageContentType: null,
    storageSizeBytes: null,
    productName: row.product_name,
    productDescription: row.product_description,
    productImageUrl: null,
    platform: row.platform,
    goal: row.goal,
    tone: row.tone,
    audience: row.audience,
    keywords: toStringArray(row.keywords),
    captions: toCaptionVariants(row.captions),
    hashtags: toStringArray(row.hashtags),
    reelScript: {
        hook: extractTextValue(isRecord(row.reel_script) ? row.reel_script.hook : ''),
        body: extractTextValue(isRecord(row.reel_script) ? row.reel_script.body : ''),
        cta: extractTextValue(isRecord(row.reel_script) ? row.reel_script.cta : ''),
    },
    createdAt: '',
    updatedAt: '',
});
const normalizePlatform = (value) => value?.trim().toLowerCase() || null;
const normalizeCaptionText = (value) => (value || '').replace(/\s+/g, ' ').trim();
const getAnalyticsLearningKey = (analytics) => analytics.postExternalId ??
    analytics.scheduledPostId ??
    analytics.contentId ??
    analytics.id;
const countHashtags = (value) => (value.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
const inferCaptionLengthBucket = (value) => {
    const length = normalizeCaptionText(value).length;
    if (length <= 140) {
        return 'short';
    }
    if (length <= 280) {
        return 'medium';
    }
    return 'long';
};
const inferHookStyle = (value) => {
    const normalized = normalizeCaptionText(value);
    const firstSentence = normalized.split(/[.!?\n]/, 1)[0] ?? normalized;
    const firstLine = firstSentence.trim();
    if (!firstLine) {
        return 'unknown';
    }
    if (/\?$/.test(firstLine) || /^(what|why|how|when|where|who)\b/i.test(firstLine)) {
        return 'question';
    }
    if (/^\d+[\).:\-]/.test(firstLine) || /\btop\s+\d+\b/i.test(firstLine)) {
        return 'number-led';
    }
    if (/^(how to|here's how|here is how)\b/i.test(firstLine)) {
        return 'how-to';
    }
    if (/^(stop|start|meet|introducing|discover|unlock|imagine|transform)\b/i.test(firstLine)) {
        return 'command-led';
    }
    if (/\b(you|your)\b/i.test(firstLine)) {
        return 'audience-led';
    }
    return 'statement';
};
const inferCtaStyle = (value) => {
    const normalized = normalizeCaptionText(value).toLowerCase();
    if (!normalized) {
        return 'soft';
    }
    if (/\b(comment|reply|tell us|let us know|dm us)\b/.test(normalized)) {
        return 'conversation';
    }
    if (/\b(save|share|tag|send this)\b/.test(normalized)) {
        return 'engagement';
    }
    if (/\b(book|buy|shop|click|visit|learn more|discover|get started)\b/.test(normalized)) {
        return 'conversion';
    }
    if (/\b(follow|join|subscribe)\b/.test(normalized)) {
        return 'community';
    }
    return 'soft';
};
const inferHashtagBucket = (value) => {
    const hashtagCount = countHashtags(value);
    if (hashtagCount === 0) {
        return 'none';
    }
    if (hashtagCount <= 4) {
        return 'light';
    }
    return 'heavy';
};
const inferTopicTags = (value, postType) => {
    const tags = new Set();
    const normalized = normalizeCaptionText(value);
    if (postType === 'reel') {
        tags.add('reels');
    }
    if (postType === 'carousel') {
        tags.add('carousel');
    }
    for (const rule of CONTENT_TOPIC_RULES) {
        if (rule.matchers.some((matcher) => matcher.test(normalized))) {
            tags.add(rule.id);
        }
    }
    if (!tags.size) {
        tags.add('general');
    }
    return [...tags];
};
const inferFormatType = (analytics, scheduledPost, content) => {
    const postType = normalizePlatform(analytics.postType);
    if (postType) {
        if (postType.includes('reel')) {
            return 'reel';
        }
        if (postType.includes('carousel')) {
            return 'carousel';
        }
        if (postType.includes('video')) {
            return 'video';
        }
    }
    if (scheduledPost?.media_type === 'video') {
        return content?.reelScript.body ? 'reel' : 'video';
    }
    if (scheduledPost?.media_type === 'image') {
        return 'image';
    }
    return 'post';
};
const ratioFromPercentLikeValue = (value) => {
    if (value === null || !Number.isFinite(value)) {
        return 0;
    }
    return value > 1 ? value / 100 : value;
};
const buildFeedbackMap = (rows) => {
    const map = new Map();
    for (const row of rows) {
        const contentId = row.content_id;
        if (!contentId) {
            continue;
        }
        const current = map.get(contentId) ?? {
            accepted: 0,
            rejected: 0,
            edited: 0,
            regenerated: 0,
            scheduled: 0,
            reused: 0,
            sameCaptionScheduled: 0,
        };
        switch (row.event_type) {
            case 'accepted':
                current.accepted += 1;
                break;
            case 'rejected':
                current.rejected += 1;
                break;
            case 'edited':
                current.edited += 1;
                break;
            case 'regenerated':
                current.regenerated += 1;
                break;
            case 'scheduled':
                current.scheduled += 1;
                if (row.used_same_caption_for_scheduler) {
                    current.sameCaptionScheduled += 1;
                }
                break;
            case 'reused':
                current.reused += 1;
                break;
            default:
                break;
        }
        map.set(contentId, current);
    }
    return map;
};
const buildLearningRows = (analyticsRows, generatedContentMap, scheduledPostMap, feedbackMap) => {
    const emptyFeedback = {
        accepted: 0,
        rejected: 0,
        edited: 0,
        regenerated: 0,
        scheduled: 0,
        reused: 0,
        sameCaptionScheduled: 0,
    };
    const provisional = analyticsRows
        .map((analytics) => {
        const platform = normalizePlatform(analytics.platform);
        if (!platform) {
            return null;
        }
        const content = analytics.contentId && generatedContentMap.has(analytics.contentId)
            ? generatedContentMap.get(analytics.contentId) ?? null
            : null;
        const scheduledPost = analytics.scheduledPostId && scheduledPostMap.has(analytics.scheduledPostId)
            ? scheduledPostMap.get(analytics.scheduledPostId) ?? null
            : null;
        const feedback = analytics.contentId
            ? feedbackMap.get(analytics.contentId) ?? emptyFeedback
            : emptyFeedback;
        const captionText = normalizeCaptionText(analytics.caption ||
            scheduledPost?.caption ||
            (content ? toCaptionText(content.captions) : ''));
        const hookSource = content?.reelScript.hook && content.reelScript.hook.trim().length > 0
            ? content.reelScript.hook
            : captionText;
        return {
            analytics,
            content,
            scheduledPost,
            feedback,
            normalizedScore: 0,
            rawScore: 0,
            formatType: inferFormatType(analytics, scheduledPost, content),
            captionLengthBucket: inferCaptionLengthBucket(captionText),
            hookStyle: inferHookStyle(hookSource),
            ctaStyle: inferCtaStyle([captionText, content?.reelScript.cta ?? ''].filter(Boolean).join(' ')),
            hashtagBucket: inferHashtagBucket(captionText),
            topicTags: inferTopicTags(captionText, analytics.postType),
            captionText,
            strategy: {
                goal: content?.goal ?? null,
                tone: content?.tone ?? null,
                audience: content?.audience ?? null,
                keywords: content?.keywords ?? [],
                productName: content?.productName ?? null,
            },
        };
    })
        .filter((row) => Boolean(row));
    const latestByPostKey = new Map();
    for (const row of provisional) {
        const postKey = getAnalyticsLearningKey(row.analytics);
        const existing = latestByPostKey.get(postKey);
        if (!existing ||
            new Date(row.analytics.recordedAt).getTime() >
                new Date(existing.analytics.recordedAt).getTime()) {
            latestByPostKey.set(postKey, row);
        }
    }
    const deduped = [...latestByPostKey.values()];
    const scoreMap = new Map((0, analyticsPerformance_1.buildAnalyticsPerformanceScores)(deduped.map((row) => ({
        id: row.analytics.id,
        likes: row.analytics.likes,
        comments: row.analytics.comments,
        saves: row.analytics.saves,
        shares: row.analytics.shares,
        impressions: row.analytics.impressions,
        reach: row.analytics.reach,
        engagements: row.analytics.likes +
            row.analytics.comments +
            row.analytics.shares +
            row.analytics.saves +
            row.analytics.reactions,
        engagementRate: row.analytics.engagementRate,
        followersAtPostTime: row.analytics.followersAtPostTime,
        publishedTime: row.analytics.publishedTime,
    }))).map((entry) => [entry.id, entry.score / 100]));
    const maxRawScore = deduped.reduce((current, row) => Math.max(current, scoreMap.get(row.analytics.id) ?? 0), 0);
    return deduped.map((row) => ({
        ...row,
        rawScore: scoreMap.get(row.analytics.id) ?? 0,
        normalizedScore: maxRawScore > 0 ? (scoreMap.get(row.analytics.id) ?? 0) / maxRawScore : 0,
    }));
};
const groupPatternDimension = (rows, dimension, selector) => {
    const aggregateMap = new Map();
    for (const row of rows) {
        const labels = selector(row)
            .map((value) => value.trim())
            .filter(Boolean);
        for (const label of labels) {
            const current = aggregateMap.get(label) ?? {
                label,
                sampleSize: 0,
                performanceTotal: 0,
                engagementRateTotal: 0,
                shareRateTotal: 0,
                saveRateTotal: 0,
                clickRateTotal: 0,
                completionRateTotal: 0,
            };
            const impressions = Math.max(row.analytics.impressions, 1);
            current.sampleSize += 1;
            current.performanceTotal += row.normalizedScore;
            current.engagementRateTotal +=
                row.analytics.engagementRate !== null
                    ? ratioFromPercentLikeValue(row.analytics.engagementRate)
                    : 0;
            current.shareRateTotal += row.analytics.shares / impressions;
            current.saveRateTotal += row.analytics.saves / impressions;
            current.clickRateTotal += row.analytics.postClicks / impressions;
            current.completionRateTotal += ratioFromPercentLikeValue(row.analytics.completionRate);
            aggregateMap.set(label, current);
        }
    }
    return [...aggregateMap.values()]
        .filter((entry) => entry.sampleSize >= 2)
        .map((entry) => {
        const averagePerformanceScore = entry.performanceTotal / entry.sampleSize;
        const averageEngagementRate = entry.engagementRateTotal / entry.sampleSize;
        const averageShareRate = entry.shareRateTotal / entry.sampleSize;
        const averageSaveRate = entry.saveRateTotal / entry.sampleSize;
        const averageClickRate = entry.clickRateTotal / entry.sampleSize;
        const averageCompletionRate = entry.completionRateTotal / entry.sampleSize;
        return {
            dimension,
            label: entry.label,
            sampleSize: entry.sampleSize,
            averagePerformanceScore,
            supportingMetrics: {
                engagementRate: Number((averageEngagementRate * 100).toFixed(2)),
                shareRate: Number((averageShareRate * 100).toFixed(2)),
                saveRate: Number((averageSaveRate * 100).toFixed(2)),
                clickRate: Number((averageClickRate * 100).toFixed(2)),
                completionRate: Number((averageCompletionRate * 100).toFixed(2)),
            },
        };
    });
};
const labelDimension = (dimension, value) => {
    const normalizedValue = value.trim().toLowerCase();
    switch (dimension) {
        case 'caption_length':
            return `${value} captions`;
        case 'hook_style':
            if (normalizedValue === 'unknown') {
                return 'posts where PrixmoAI could not clearly detect the opening hook';
            }
            return `${value} hooks`;
        case 'format':
            return `${value} posts`;
        case 'hashtag_density':
            return `${value} hashtag usage`;
        case 'cta_style':
            return `${value} CTAs`;
        case 'topic':
            return `${value} topics`;
        case 'goal':
            return `${value} goals`;
        case 'tone':
            return `${value} tone`;
        default:
            return value;
    }
};
const isUnknownHookPattern = (pattern) => Boolean(pattern &&
    pattern.dimension === 'hook_style' &&
    pattern.label.trim().toLowerCase() === 'unknown');
const toPatternExplanation = (dimension, label, lift, supportingMetrics, isWeak) => {
    const leadMetric = supportingMetrics.saveRate >= supportingMetrics.shareRate
        ? 'save rate'
        : supportingMetrics.shareRate >= supportingMetrics.clickRate
            ? 'share rate'
            : supportingMetrics.clickRate > 0
                ? 'click rate'
                : 'engagement rate';
    const liftLabel = lift >= 0
        ? `${Math.abs(lift * 100).toFixed(1)}% above the brand baseline`
        : `${Math.abs(lift * 100).toFixed(1)}% below the brand baseline`;
    return isWeak
        ? `${labelDimension(dimension, label)} are underperforming, mostly on ${leadMetric}, and are ${liftLabel}.`
        : `${labelDimension(dimension, label)} are outperforming the brand baseline and are strongest on ${leadMetric} (${liftLabel}).`;
};
const humanizeLabel = (value) => value
    ?.replace(/[-_]+/g, ' ')
    .trim() ?? '';
const toReadableFormat = (value) => {
    const normalized = humanizeLabel(value);
    return normalized ? `${normalized} post` : 'post';
};
const withArticle = (value) => /^[aeiou]/i.test(value.trim()) ? `an ${value}` : `a ${value}`;
const toReadableHook = (value) => {
    const normalized = humanizeLabel(value).toLowerCase();
    if (!normalized || normalized === 'unknown') {
        return null;
    }
    return `${normalized} opening`;
};
const toReadableCallToAction = (value) => {
    const normalized = humanizeLabel(value).toLowerCase();
    return normalized ? `${normalized} call to action` : null;
};
const toReadableTopic = (value) => {
    const normalized = humanizeLabel(value);
    return normalized && normalized !== 'general' ? normalized : null;
};
const toReadableTone = (value) => {
    const normalized = humanizeLabel(value).toLowerCase();
    return normalized ? `${normalized} tone` : null;
};
const toReadableGoal = (value) => {
    const normalized = humanizeLabel(value).toLowerCase();
    return normalized ? `${normalized} goal` : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const getPatternLabelsForRow = (row, dimension) => {
    switch (dimension) {
        case 'caption_length':
            return [row.captionLengthBucket];
        case 'hook_style':
            return row.hookStyle.trim().toLowerCase() === 'unknown' ? [] : [row.hookStyle];
        case 'format':
            return [row.formatType];
        case 'hashtag_density':
            return [row.hashtagBucket];
        case 'cta_style':
            return [row.ctaStyle];
        case 'topic':
            return row.topicTags;
        case 'goal':
            return row.strategy.goal ? [row.strategy.goal] : [];
        case 'tone':
            return row.strategy.tone ? [row.strategy.tone] : [];
        default:
            return [];
    }
};
const estimatePatternAccuracy = (rows, pattern) => {
    if (!pattern) {
        return null;
    }
    const matching = rows.filter((row) => getPatternLabelsForRow(row, pattern.dimension).includes(pattern.label));
    const comparison = rows.filter((row) => !matching.includes(row));
    if (matching.length < 2 || comparison.length < 2) {
        return null;
    }
    const predictedScore = pattern.averagePerformanceScore;
    const absolutePercentErrors = matching
        .map((row) => {
        const actual = row.normalizedScore;
        if (actual <= 0 && predictedScore <= 0) {
            return 0;
        }
        if (actual <= 0) {
            return 100;
        }
        return Math.abs((actual - predictedScore) / actual) * 100;
    })
        .filter((value) => Number.isFinite(value));
    if (!absolutePercentErrors.length) {
        return null;
    }
    const mape = absolutePercentErrors.reduce((total, value) => total + value, 0) /
        absolutePercentErrors.length;
    const matchingAverage = matching.reduce((total, row) => total + row.normalizedScore, 0) / matching.length;
    const comparisonAverage = comparison.reduce((total, row) => total + row.normalizedScore, 0) / comparison.length;
    const meanDelta = matchingAverage - comparisonAverage;
    if (meanDelta <= 0) {
        return null;
    }
    const accuracy = clamp(100 - mape, 0, 99);
    const label = accuracy >= 85 ? 'High-confidence signal' : accuracy >= 70 ? 'Solid signal' : 'Early signal';
    return {
        accuracy: Number(accuracy.toFixed(1)),
        label,
        mape: Number(mape.toFixed(3)),
        matchingPosts: matching.length,
    };
};
const buildRecommendationMessage = ({ platform, profile, winningRow, topPattern, weakPattern, winningFormat, winningHook, winningCallToAction, winningTopic, winningTone, winningGoal, recommendationStats, }) => {
    if (!topPattern || !recommendationStats || recommendationStats.accuracy < 70) {
        return {
            recommendationText: 'Need a few more strong posts before PrixmoAI can suggest the next post with confidence.',
            recommendationReason: weakPattern
                ? `PrixmoAI can already see that ${labelDimension(weakPattern.dimension, weakPattern.label).toLowerCase()} are underperforming, but it still needs a clearer winner before making a firm next-post call.`
                : `PrixmoAI needs a little more clean ${platform} data before it can turn the latest brand and scheduler signals into a strong next-post recommendation.`,
            recommendationAccuracy: null,
            recommendationAccuracyLabel: null,
        };
    }
    const subject = toReadableFormat(winningFormat);
    const topic = winningTopic ?? toReadableTopic(winningRow?.strategy.productName ?? null);
    const details = [
        topic ? `about ${topic}` : null,
        winningHook ? `with a ${winningHook}` : null,
        winningCallToAction ? `and a ${winningCallToAction}` : null,
    ].filter(Boolean);
    const recommendationText = [
        [
            `Next, try ${withArticle(subject)}`,
            details.length ? details.join(' ') : null,
        ]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim() + '.',
        winningTone ? `Use ${withArticle(winningTone)}.` : null,
        winningGoal
            ? `Keep the goal focused on ${humanizeLabel(winningGoal)
                .replace(/\s+goal$/i, '')
                .toLowerCase()}.`
            : null,
    ]
        .filter(Boolean)
        .join(' ');
    const patternLabel = labelDimension(topPattern.dimension, topPattern.label).toLowerCase();
    const liftPercent = Math.abs(topPattern.lift * 100).toFixed(1);
    const weakNote = weakPattern && weakPattern.dimension !== topPattern.dimension
        ? ` Skip ${labelDimension(weakPattern.dimension, weakPattern.label).toLowerCase()} for now.`
        : '';
    const profileIndustry = profile?.primaryIndustry ?? profile?.industry ?? null;
    const brandAnchor = profileIndustry ? ` for your ${profileIndustry} brand` : '';
    return {
        recommendationText,
        recommendationReason: `Based on ${recommendationStats.matchingPosts} similar posts${brandAnchor}, ${patternLabel} are scoring ${liftPercent}% above your usual results.${weakNote}`,
        recommendationAccuracy: recommendationStats.accuracy,
        recommendationAccuracyLabel: recommendationStats.label,
    };
};
const buildPatternsForPlatform = (rows) => {
    const overallAverage = rows.reduce((total, row) => total + row.normalizedScore, 0) /
        Math.max(rows.length, 1);
    const aggregates = [
        ...groupPatternDimension(rows, 'caption_length', (row) => [row.captionLengthBucket]),
        ...groupPatternDimension(rows, 'hook_style', (row) => row.hookStyle.trim().toLowerCase() === 'unknown' ? [] : [row.hookStyle]),
        ...groupPatternDimension(rows, 'format', (row) => [row.formatType]),
        ...groupPatternDimension(rows, 'hashtag_density', (row) => [row.hashtagBucket]),
        ...groupPatternDimension(rows, 'cta_style', (row) => [row.ctaStyle]),
        ...groupPatternDimension(rows, 'topic', (row) => row.topicTags),
        ...groupPatternDimension(rows, 'goal', (row) => row.strategy.goal ? [row.strategy.goal] : []),
        ...groupPatternDimension(rows, 'tone', (row) => row.strategy.tone ? [row.strategy.tone] : []),
    ];
    const enriched = aggregates.map((entry) => {
        const lift = entry.averagePerformanceScore - overallAverage;
        return {
            dimension: entry.dimension,
            label: entry.label,
            sampleSize: entry.sampleSize,
            averagePerformanceScore: Number(entry.averagePerformanceScore.toFixed(4)),
            lift: Number(lift.toFixed(4)),
            supportingMetrics: entry.supportingMetrics,
            explanation: '',
        };
    });
    const patterns = enriched
        .filter((entry) => entry.lift >= 0.05)
        .sort((left, right) => {
        if (right.averagePerformanceScore !== left.averagePerformanceScore) {
            return right.averagePerformanceScore - left.averagePerformanceScore;
        }
        return right.sampleSize - left.sampleSize;
    })
        .slice(0, constants_1.ANALYTICS_LEARNING_MAX_PATTERNS)
        .map((entry) => ({
        ...entry,
        explanation: toPatternExplanation(entry.dimension, entry.label, entry.lift, entry.supportingMetrics, false),
    }));
    const weakPatterns = enriched
        .filter((entry) => entry.lift <= -0.05)
        .sort((left, right) => left.averagePerformanceScore - right.averagePerformanceScore)
        .slice(0, Math.max(2, Math.min(3, constants_1.ANALYTICS_LEARNING_MAX_PATTERNS)))
        .map((entry) => ({
        ...entry,
        explanation: toPatternExplanation(entry.dimension, entry.label, entry.lift, entry.supportingMetrics, true),
    }));
    return {
        patterns,
        weakPatterns,
    };
};
const buildLearningAggregate = (platform, rows, profile) => {
    const overallAverage = rows.reduce((total, row) => total + row.normalizedScore, 0) /
        Math.max(rows.length, 1);
    const averageEngagementRate = rows.reduce((total, row) => total + ratioFromPercentLikeValue(row.analytics.engagementRate), 0) / Math.max(rows.length, 1);
    const averageShareRate = rows.reduce((total, row) => total + row.analytics.shares / Math.max(row.analytics.impressions, 1), 0) / Math.max(rows.length, 1);
    const averageSaveRate = rows.reduce((total, row) => total + row.analytics.saves / Math.max(row.analytics.impressions, 1), 0) / Math.max(rows.length, 1);
    const averageWatchRate = rows.reduce((total, row) => total + row.analytics.videoPlays / Math.max(row.analytics.impressions, 1), 0) / Math.max(rows.length, 1);
    const { patterns, weakPatterns } = buildPatternsForPlatform(rows);
    const winningRow = [...rows].sort((left, right) => right.normalizedScore - left.normalizedScore)[0];
    const topContentIds = rows
        .filter((row) => row.content?.id &&
        (row.normalizedScore > 0 ||
            row.analytics.impressions > 0 ||
            row.analytics.reach > 0 ||
            row.analytics.likes > 0 ||
            row.analytics.comments > 0 ||
            row.analytics.shares > 0 ||
            row.analytics.saves > 0))
        .sort((left, right) => right.normalizedScore - left.normalizedScore)
        .slice(0, 5)
        .map((row) => row.content?.id);
    const patternSummary = patterns.length > 0
        ? patterns
            .map((pattern) => `${labelDimension(pattern.dimension, pattern.label)} (${pattern.sampleSize} posts)`)
            .join(', ')
        : 'No strong repeatable winner yet';
    const weakSummary = weakPatterns.length > 0
        ? weakPatterns
            .map((pattern) => `${labelDimension(pattern.dimension, pattern.label)}`)
            .join(', ')
        : 'No obvious weak pattern yet';
    const topPattern = patterns.find((pattern) => !isUnknownHookPattern(pattern)) ?? null;
    const weakPattern = weakPatterns[0] ?? null;
    const winningFormat = patterns.find((pattern) => pattern.dimension === 'format')?.label ?? winningRow?.formatType ?? 'post';
    const winningHook = toReadableHook(patterns.find((pattern) => pattern.dimension === 'hook_style')?.label) ??
        toReadableHook(winningRow?.hookStyle ?? null);
    const winningCallToAction = toReadableCallToAction(patterns.find((pattern) => pattern.dimension === 'cta_style')?.label) ??
        toReadableCallToAction(winningRow?.ctaStyle ?? null);
    const winningTopic = toReadableTopic(patterns.find((pattern) => pattern.dimension === 'topic')?.label) ??
        winningRow?.topicTags.map((topic) => toReadableTopic(topic)).find(Boolean) ??
        null;
    const winningTone = toReadableTone(patterns.find((pattern) => pattern.dimension === 'tone')?.label) ??
        toReadableTone(winningRow?.strategy.tone ?? null);
    const winningGoal = toReadableGoal(patterns.find((pattern) => pattern.dimension === 'goal')?.label) ??
        toReadableGoal(winningRow?.strategy.goal ?? null);
    const recommendationStats = estimatePatternAccuracy(rows, topPattern);
    const { recommendationText, recommendationReason, recommendationAccuracy, recommendationAccuracyLabel, } = buildRecommendationMessage({
        platform,
        profile,
        winningRow,
        topPattern,
        weakPattern,
        winningFormat,
        winningHook,
        winningCallToAction,
        winningTopic,
        winningTone,
        winningGoal,
        recommendationStats,
    });
    const summaryText = [
        `${platform} learning memory for this brand.`,
        `Unique published posts analyzed: ${rows.length}.`,
        `Average engagement rate: ${(averageEngagementRate * 100).toFixed(2)}%.`,
        `Average share rate: ${(averageShareRate * 100).toFixed(2)}%.`,
        `Average save rate: ${(averageSaveRate * 100).toFixed(2)}%.`,
        averageWatchRate > 0
            ? `Average watch rate: ${(averageWatchRate * 100).toFixed(2)}%.`
            : null,
        `Strongest patterns: ${patternSummary}.`,
        `Weak patterns: ${weakSummary}.`,
        winningRow?.strategy.goal
            ? `Best recent goal signal: ${winningRow.strategy.goal}.`
            : null,
        recommendationText,
    ]
        .filter(Boolean)
        .join(' ');
    return {
        platform,
        rows,
        overallAverage,
        patterns,
        weakPatterns,
        summaryText,
        recommendationText,
        recommendationReason,
        recommendationAccuracy,
        recommendationAccuracyLabel,
        metrics: {
            postsAnalyzed: rows.length,
            averagePerformanceScore: Number(overallAverage.toFixed(4)),
            averageEngagementRate: Number((averageEngagementRate * 100).toFixed(2)),
            averageShareRate: Number((averageShareRate * 100).toFixed(2)),
            averageSaveRate: Number((averageSaveRate * 100).toFixed(2)),
            averageWatchRate: Number((averageWatchRate * 100).toFixed(2)),
            acceptedCount: rows.reduce((total, row) => total + row.feedback.accepted, 0),
            rejectedCount: rows.reduce((total, row) => total + row.feedback.rejected, 0),
            editedCount: rows.reduce((total, row) => total + row.feedback.edited, 0),
            scheduledCount: rows.reduce((total, row) => total + row.feedback.scheduled, 0),
            profilePrimaryIndustry: profile?.primaryIndustry ?? profile?.industry ?? null,
            recommendationAccuracy,
        },
        analyticsContext: {
            topPatterns: patterns.map((pattern) => ({
                dimension: pattern.dimension,
                label: pattern.label,
                sampleSize: pattern.sampleSize,
                lift: pattern.lift,
            })),
            weakPatterns: weakPatterns.map((pattern) => ({
                dimension: pattern.dimension,
                label: pattern.label,
                sampleSize: pattern.sampleSize,
                lift: pattern.lift,
            })),
            winningFormats: patterns
                .filter((pattern) => pattern.dimension === 'format')
                .map((pattern) => pattern.label),
            winningGoals: patterns
                .filter((pattern) => pattern.dimension === 'goal')
                .map((pattern) => pattern.label),
            winningTones: patterns
                .filter((pattern) => pattern.dimension === 'tone')
                .map((pattern) => pattern.label),
            recommendationReason,
            recommendationAccuracy,
            recommendationAccuracyLabel,
            recommendationSignal: topPattern && recommendationStats
                ? {
                    dimension: topPattern.dimension,
                    label: topPattern.label,
                    sampleSize: topPattern.sampleSize,
                    lift: topPattern.lift,
                    mape: recommendationStats.mape,
                }
                : null,
        },
        topContentIds,
    };
};
const getLearningQueue = () => {
    if (!analyticsLearningQueue) {
        analyticsLearningQueue = new bullmq_1.Queue(queueNames_1.QUEUE_NAMES.analyticsLearningUser, (0, redis_1.getBullMqConfig)('prixmoai:queue:analytics-learning-user'));
    }
    return analyticsLearningQueue;
};
const clearLearningWorkerIdleTimer = () => {
    if (!analyticsLearningWorkerIdleTimer) {
        return;
    }
    clearTimeout(analyticsLearningWorkerIdleTimer);
    analyticsLearningWorkerIdleTimer = null;
};
const scheduleLearningWorkerIdleShutdown = () => {
    if (constants_1.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS <= 0 || !analyticsLearningWorker) {
        return;
    }
    clearLearningWorkerIdleTimer();
    const workerToClose = analyticsLearningWorker;
    analyticsLearningWorkerIdleTimer = setTimeout(() => {
        if (analyticsLearningWorker !== workerToClose) {
            return;
        }
        analyticsLearningWorker = null;
        void workerToClose.close().catch((error) => {
            console.error(`[analytics-learning] ${error instanceof Error
                ? error.message
                : 'Failed to close idle analytics learning worker.'}`);
        });
    }, constants_1.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS);
    analyticsLearningWorkerIdleTimer.unref?.();
};
const fetchGeneratedContentMap = async (client, userId, contentIds) => {
    if (!contentIds.length) {
        return new Map();
    }
    const { data, error } = await client
        .from('generated_content')
        .select('id, brand_profile_id, product_name, product_description, platform, goal, tone, audience, keywords, captions, hashtags, reel_script')
        .eq('user_id', userId)
        .in('id', contentIds);
    if (error) {
        throw new Error(error.message || 'Failed to fetch generated content for analytics learning');
    }
    return new Map((data ?? []).map((row) => {
        const item = toGeneratedContent(row);
        return [item.id, item];
    }));
};
const fetchScheduledPostMap = async (client, userId, scheduledPostIds) => {
    if (!scheduledPostIds.length) {
        return new Map();
    }
    const { data, error } = await client
        .from('scheduled_posts')
        .select('id, content_id, media_type, platform, caption')
        .eq('user_id', userId)
        .in('id', scheduledPostIds);
    if (error) {
        throw new Error(error.message || 'Failed to fetch scheduled posts for analytics learning');
    }
    return new Map((data ?? []).map((row) => [row.id, row]));
};
const fetchFeedbackEvents = async (client, userId, contentIds) => {
    if (!contentIds.length) {
        return [];
    }
    const { data, error } = await client
        .from('brand_memory_feedback_events')
        .select('content_id, event_type, source_key, used_same_caption_for_scheduler, metadata')
        .eq('user_id', userId)
        .in('content_id', contentIds);
    if (error) {
        throw new Error(error.message || 'Failed to fetch feedback events for analytics learning');
    }
    return (data ?? []);
};
const refreshAnalyticsLearningForUser = async (client, userId, options = {}) => {
    const sourceWindowEnd = new Date().toISOString();
    const windowStartDate = new Date();
    windowStartDate.setUTCDate(windowStartDate.getUTCDate() - constants_1.ANALYTICS_LEARNING_LOOKBACK_DAYS);
    const sourceWindowStart = windowStartDate.toISOString();
    const run = await (0, analyticsLearning_1.createAnalyticsLearningRun)(client, {
        userId,
        triggerSource: options.triggerSource ?? 'manual',
        platforms: options.platforms ?? [],
        sourceWindowStart,
        sourceWindowEnd,
        summary: {
            requestedPlatforms: options.platforms ?? [],
            requestedContentIds: options.contentIds ?? [],
        },
    });
    try {
        const [analyticsRows, brandProfile] = await Promise.all([
            (0, analytics_1.getAnalyticsByUserId)(client, userId, {
                start: sourceWindowStart,
                end: sourceWindowEnd,
            }),
            (0, brandProfiles_1.getBrandProfileByUserId)(client, userId),
        ]);
        const filteredAnalyticsRows = analyticsRows.filter((row) => {
            const platform = normalizePlatform(row.platform);
            if (!platform) {
                return false;
            }
            if (options.platforms?.length && !options.platforms.includes(platform)) {
                return false;
            }
            if (options.contentIds?.length && (!row.contentId || !options.contentIds.includes(row.contentId))) {
                return false;
            }
            if (options.scheduledPostIds?.length &&
                (!row.scheduledPostId || !options.scheduledPostIds.includes(row.scheduledPostId))) {
                return false;
            }
            if (options.analyticsIds?.length && !options.analyticsIds.includes(row.id)) {
                return false;
            }
            return true;
        });
        const contentIds = [
            ...new Set(filteredAnalyticsRows
                .map((row) => row.contentId)
                .filter((value) => Boolean(value))),
        ];
        const scheduledPostIds = [
            ...new Set(filteredAnalyticsRows
                .map((row) => row.scheduledPostId)
                .filter((value) => Boolean(value))),
        ];
        const [generatedContentMap, scheduledPostMap, feedbackRows] = await Promise.all([
            fetchGeneratedContentMap(client, userId, contentIds),
            fetchScheduledPostMap(client, userId, scheduledPostIds),
            fetchFeedbackEvents(client, userId, contentIds),
        ]);
        const feedbackMap = buildFeedbackMap(feedbackRows);
        const learningRows = buildLearningRows(filteredAnalyticsRows, generatedContentMap, scheduledPostMap, feedbackMap);
        const platformMap = new Map();
        for (const row of learningRows) {
            const platformRows = platformMap.get(row.analytics.platform?.toLowerCase() || row.content?.platform?.toLowerCase() || '');
            if (platformRows) {
                platformRows.push(row);
            }
            else {
                platformMap.set(normalizePlatform(row.analytics.platform) ?? 'unknown', [row]);
            }
        }
        let profilesUpdated = 0;
        const updatedPlatforms = [];
        for (const [platform, rows] of platformMap.entries()) {
            if (!platform || platform === 'unknown' || rows.length < constants_1.ANALYTICS_LEARNING_MIN_POSTS) {
                continue;
            }
            const aggregate = buildLearningAggregate(platform, rows, brandProfile);
            const highestScore = rows.reduce((current, row) => Math.max(current, row.normalizedScore), 0);
            const winningThreshold = Math.max(0.75, highestScore * 0.82);
            const solidThreshold = Math.max(0.55, highestScore * 0.62);
            const neutralThreshold = Math.max(0.35, highestScore * 0.42);
            await Promise.all(rows.map((row) => {
                const outcomeLabel = row.normalizedScore >= winningThreshold
                    ? 'winning'
                    : row.normalizedScore >= solidThreshold
                        ? 'solid'
                        : row.normalizedScore >= neutralThreshold
                            ? 'neutral'
                            : 'weak';
                return (0, analyticsLearning_1.upsertAnalyticsLearningPostSignal)(client, {
                    userId,
                    analyticsId: row.analytics.id,
                    contentId: row.content?.id ?? row.analytics.contentId ?? null,
                    scheduledPostId: row.scheduledPost?.id ?? row.analytics.scheduledPostId ?? null,
                    platform,
                    sourcePostKey: row.analytics.postExternalId ??
                        row.analytics.scheduledPostId ??
                        row.analytics.id,
                    performanceScore: Number(row.normalizedScore.toFixed(4)),
                    outcomeLabel,
                    formatType: row.formatType,
                    captionLengthBucket: row.captionLengthBucket,
                    hookStyle: row.hookStyle,
                    ctaStyle: row.ctaStyle,
                    hashtagBucket: row.hashtagBucket,
                    topicTags: row.topicTags,
                    metrics: {
                        impressions: row.analytics.impressions,
                        reach: row.analytics.reach,
                        likes: row.analytics.likes,
                        comments: row.analytics.comments,
                        shares: row.analytics.shares,
                        saves: row.analytics.saves,
                        videoPlays: row.analytics.videoPlays,
                        engagementRate: row.analytics.engagementRate,
                        completionRate: row.analytics.completionRate,
                    },
                    strategy: row.strategy,
                    userFeedback: row.feedback,
                    publishedTime: row.analytics.publishedTime,
                });
            }));
            const learningProfile = await (0, analyticsLearning_1.upsertAnalyticsLearningProfile)(client, {
                userId,
                brandProfileId: brandProfile?.id ?? null,
                platform,
                summaryText: aggregate.summaryText,
                recommendationText: aggregate.recommendationText,
                metrics: aggregate.metrics,
                patterns: aggregate.patterns,
                weakPatterns: aggregate.weakPatterns,
                topContentIds: aggregate.topContentIds,
                analyticsContext: aggregate.analyticsContext,
                sourceWindowStart,
                sourceWindowEnd,
                lastAnalyzedAt: new Date().toISOString(),
            });
            await (0, brandMemory_service_1.syncAnalyticsLearningSemanticMemory)(client, userId, brandProfile, learningProfile);
            profilesUpdated += 1;
            updatedPlatforms.push(platform);
        }
        await (0, runtimeCache_service_1.invalidateAnalyticsRuntimeCache)(userId);
        const summary = {
            platformsConsidered: [...platformMap.keys()].filter((platform) => platform && platform !== 'unknown'),
            updatedPlatforms,
            postsAnalyzed: learningRows.length,
            profilesUpdated,
            learningCandidates: learningRows.length,
        };
        await (0, analyticsLearning_1.updateAnalyticsLearningRun)(client, {
            id: run.id,
            userId,
            status: 'completed',
            postsAnalyzed: learningRows.length,
            profilesUpdated,
            summary,
            errorMessage: null,
        });
        console.info('[analytics-learning] learning loop completed', {
            userId,
            triggerSource: options.triggerSource ?? 'manual',
            postsAnalyzed: learningRows.length,
            profilesUpdated,
            platforms: updatedPlatforms,
            runId: run.id,
        });
        return summary;
    }
    catch (error) {
        await (0, analyticsLearning_1.updateAnalyticsLearningRun)(client, {
            id: run.id,
            userId,
            status: 'failed',
            summary: {},
            errorMessage: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
        console.error('[analytics-learning] learning loop failed', {
            userId,
            triggerSource: options.triggerSource ?? 'manual',
            runId: run.id,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};
exports.refreshAnalyticsLearningForUser = refreshAnalyticsLearningForUser;
const enqueueAnalyticsLearningJob = async (data) => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    await getLearningQueue().add('learn-user', data, {
        jobId: [
            'analytics-learning',
            data.userId,
            data.platforms?.join(',') || 'all-platforms',
            data.contentIds?.join(',') || 'all-content',
        ].join('-'),
        removeOnComplete: true,
        removeOnFail: {
            age: 60 * 60,
            count: 100,
        },
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
    });
    (0, exports.startAnalyticsLearningWorker)();
};
exports.enqueueAnalyticsLearningJob = enqueueAnalyticsLearningJob;
const startAnalyticsLearningWorker = () => {
    if (!supabase_1.isSupabaseAdminConfigured || !redis_1.isRedisConfigured) {
        return;
    }
    if (analyticsLearningWorker) {
        clearLearningWorkerIdleTimer();
        return;
    }
    analyticsLearningWorker = new bullmq_1.Worker(queueNames_1.QUEUE_NAMES.analyticsLearningUser, async (job) => {
        const client = (0, supabase_1.requireSupabaseAdmin)();
        return (0, exports.refreshAnalyticsLearningForUser)(client, job.data.userId, {
            triggerSource: job.data.triggerSource,
            platforms: job.data.platforms,
            contentIds: job.data.contentIds,
            scheduledPostIds: job.data.scheduledPostIds,
            analyticsIds: job.data.analyticsIds,
        });
    }, {
        ...(0, redis_1.getBullMqConfig)('prixmoai:worker:analytics-learning-user'),
        ...(0, workerOptions_1.getLowCommandWorkerOptions)(),
        concurrency: constants_1.ANALYTICS_LEARNING_JOB_CONCURRENCY,
    });
    analyticsLearningWorker.on('active', clearLearningWorkerIdleTimer);
    analyticsLearningWorker.on('drained', scheduleLearningWorkerIdleShutdown);
    console.log('[analytics-learning] Worker started. Waiting for learning jobs.');
};
exports.startAnalyticsLearningWorker = startAnalyticsLearningWorker;
