"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareConnectedAccountIntelligenceForGeneration = exports.handleVerifiedSocialAccountConnected = exports.ensureSocialAccountIntelligenceSweep = exports.startSocialAccountIntelligenceWorker = exports.enqueueSocialAccountIntelligenceSync = exports.syncSocialAccountIntelligence = void 0;
const crypto_1 = require("crypto");
const bullmq_1 = require("bullmq");
const zod_1 = require("zod");
const constants_1 = require("../config/constants");
const socialAccountIntelligence_1 = require("../db/queries/socialAccountIntelligence");
const socialAccounts_1 = require("../db/queries/socialAccounts");
const supabase_1 = require("../db/supabase");
const observability_1 = require("../lib/observability");
const redis_1 = require("../lib/redis");
const retry_1 = require("../lib/retry");
const queueNames_1 = require("../queues/queueNames");
const workerOptions_1 = require("../queues/workerOptions");
const brandMemory_service_1 = require("./brandMemory.service");
class AccountIntelligenceMetaError extends Error {
    constructor(message, options) {
        super(message);
        this.name = 'AccountIntelligenceMetaError';
        this.statusCode = options.statusCode;
        this.code = options.code;
        this.subcode = options.subcode;
        this.retryAfterMs = options.retryAfterMs;
    }
}
const GRAPH_BASE_URL = `https://graph.facebook.com/${constants_1.META_GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com';
const SWEEP_JOB_ID = 'social-account-intelligence-hourly-sweep';
const STOP_WORDS = new Set([
    'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being',
    'between', 'both', 'brand', 'could', 'from', 'have', 'into', 'just', 'more',
    'most', 'only', 'other', 'over', 'post', 'posts', 'some', 'than', 'that',
    'their', 'there', 'these', 'they', 'this', 'through', 'very', 'what', 'when',
    'where', 'which', 'while', 'with', 'your', 'youre',
]);
let intelligenceQueue = null;
let intelligenceWorker = null;
let intelligenceWorkerIdleTimer = null;
const syncRetryCounts = new Map();
const nowIso = () => new Date().toISOString();
const nextRefreshIso = () => new Date(Date.now() + constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_STALE_MS).toISOString();
const asString = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const asNumber = (value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const nullableNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    return asNumber(value);
};
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const hashText = (value) => value ? (0, crypto_1.createHash)('sha256').update(value).digest('hex') : null;
const extractInstagramShortcode = (permalink) => {
    if (!permalink) {
        return null;
    }
    const match = permalink.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
    return match?.[1] ?? null;
};
const normalizePlatform = (value) => value?.trim().toLowerCase() ?? '';
const isSupportedPlatform = (value) => value === 'instagram' || value === 'facebook';
const normalizeFormat = (platform, mediaType, mediaProductType, attachments) => {
    const type = `${mediaProductType ?? ''} ${mediaType ?? ''}`.toLowerCase();
    if (type.includes('carousel') || Array.isArray(attachments)) {
        return 'carousel';
    }
    if (type.includes('reel')) {
        return 'reel';
    }
    if (type.includes('video')) {
        return 'video';
    }
    if (type.includes('image') || type.includes('photo')) {
        return 'image';
    }
    return platform === 'facebook' ? 'text/link/page-post' : 'image';
};
const getMetaApiMode = (account) => asString(account.metadata.instagramApiMode) === 'instagram_login'
    ? 'instagram'
    : 'facebook';
const buildMetaUrl = (account, path, params) => {
    const base = account.platform === 'instagram' && getMetaApiMode(account) === 'instagram'
        ? INSTAGRAM_GRAPH_BASE_URL
        : GRAPH_BASE_URL;
    const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    if (account.accessToken) {
        url.searchParams.set('access_token', account.accessToken);
    }
    return url;
};
const fetchMetaJson = async (account, path, params) => {
    if (!account.accessToken) {
        throw new AccountIntelligenceMetaError('The connected account no longer has a usable access token.', { statusCode: 401 });
    }
    return (0, retry_1.retryWithBackoff)(async () => {
        const response = await fetch(buildMetaUrl(account, path, params), {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const body = (await response.json().catch(() => ({})));
        if (!response.ok || body.error) {
            const retryAfterSeconds = Number(response.headers.get('retry-after'));
            throw new AccountIntelligenceMetaError(body.error?.message || `Meta request failed with status ${response.status}.`, {
                statusCode: response.status,
                code: body.error?.code,
                subcode: body.error?.error_subcode,
                retryAfterMs: Number.isFinite(retryAfterSeconds)
                    ? retryAfterSeconds * 1000
                    : undefined,
            });
        }
        return body;
    }, {
        attempts: 4,
        baseDelayMs: 750,
        maxDelayMs: 8000,
        shouldRetry: (error) => (0, retry_1.isRetryableError)(error),
        onRetry: ({ error, attempt, nextDelayMs }) => {
            syncRetryCounts.set(account.id, (syncRetryCounts.get(account.id) ?? 0) + 1);
            (0, observability_1.logOperationalEvent)('Connected account sync retrying', {
                userId: account.userId,
                socialAccountId: account.id,
                platform: account.platform,
                provider: 'meta',
                retryAttempt: attempt,
                nextDelayMs,
                reason: error instanceof Error ? error.message : String(error),
            }, 'warn');
        },
    });
};
const getInstagramObjectId = (account) => asString(account.metadata.metaInstagramAccountId) || account.accountId;
const getFacebookPageId = (account) => asString(account.metadata.metaPageId) || account.accountId;
const fetchInstagramProfile = async (account) => {
    const objectId = getMetaApiMode(account) === 'instagram' ? 'me' : getInstagramObjectId(account);
    const payload = await fetchMetaJson(account, objectId, {
        fields: 'id,user_id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,account_type',
    });
    return {
        username: asString(payload.username),
        displayName: asString(payload.name) || account.accountName,
        biography: asString(payload.biography),
        profilePictureUrl: asString(payload.profile_picture_url) ||
            asString(account.metadata.metaInstagramProfilePictureUrl),
        followersCount: nullableNumber(payload.followers_count),
        followsCount: nullableNumber(payload.follows_count),
        mediaCount: nullableNumber(payload.media_count),
        rawPayload: payload,
    };
};
const fetchFacebookProfile = async (account) => {
    const payload = await fetchMetaJson(account, getFacebookPageId(account), {
        fields: 'id,name,username,about,description,link,picture.type(large),followers_count,fan_count',
    });
    const picture = toRecord(toRecord(payload.picture).data);
    return {
        username: asString(payload.username),
        displayName: asString(payload.name) || account.accountName,
        biography: asString(payload.about) || asString(payload.description),
        profilePictureUrl: asString(picture.url),
        followersCount: nullableNumber(payload.followers_count) ?? nullableNumber(payload.fan_count),
        followsCount: null,
        mediaCount: null,
        rawPayload: payload,
    };
};
const buildRawPost = (account, row) => {
    const externalPostId = asString(row.id);
    if (!externalPostId) {
        return null;
    }
    const platform = normalizePlatform(account.platform);
    const captionText = asString(row.caption) || asString(row.message);
    const permalink = asString(row.permalink) || asString(row.permalink_url);
    const mediaType = asString(row.media_type) || asString(row.type);
    const mediaProductType = asString(row.media_product_type);
    const mediaUrl = asString(row.media_url) ||
        asString(toRecord(toRecord(row.full_picture).data).url) ||
        asString(row.full_picture);
    const thumbnailUrl = asString(row.thumbnail_url);
    const likeCount = asNumber(row.like_count);
    const commentsCount = asNumber(row.comments_count) ||
        asNumber(toRecord(row.comments).summary && toRecord(toRecord(row.comments).summary).total_count);
    const reactionCount = asNumber(row.reactions_count) ||
        asNumber(toRecord(toRecord(row.reactions).summary).total_count);
    const shareCount = asNumber(row.shares_count) || asNumber(toRecord(row.shares).count);
    const postedAt = asString(row.timestamp) || asString(row.created_time);
    return {
        userId: account.userId,
        socialAccountId: account.id,
        platform: account.platform,
        externalPostId,
        shortcode: extractInstagramShortcode(permalink),
        permalink,
        captionText,
        captionHash: hashText(captionText),
        mediaFingerprint: hashText([externalPostId, mediaUrl, thumbnailUrl, mediaType].filter(Boolean).join('|')),
        mediaType,
        mediaProductType,
        normalizedFormat: normalizeFormat(platform, mediaType, mediaProductType, row.attachments),
        postedAt,
        mediaUrl,
        thumbnailUrl,
        likeCount,
        commentsCount,
        shareCount,
        saveCount: asNumber(row.saved),
        reactionCount,
        impressionsCount: asNumber(row.impressions),
        reachCount: asNumber(row.reach),
        videoViewsCount: asNumber(row.video_views) || asNumber(row.views),
        rawPayload: row,
        lastMetricsSyncedAt: nowIso(),
    };
};
const extractInsightValue = (item) => {
    const firstValue = item.values?.find((entry) => entry?.value !== undefined)?.value;
    if (firstValue !== undefined) {
        return firstValue;
    }
    if (item.value !== undefined) {
        return item.value;
    }
    const totalValue = toRecord(item.total_value);
    return totalValue.value ?? item.total_value;
};
const sumNumericRecord = (value) => Object.values(toRecord(value)).reduce((total, entry) => total + asNumber(entry), 0);
const fetchPostInsightSnapshot = async (account, post) => {
    const metrics = account.platform === 'instagram'
        ? [
            'impressions',
            'reach',
            'saved',
            'shares',
            'video_views',
            'plays',
            'total_interactions',
        ]
        : [
            'post_impressions',
            'post_impressions_unique',
            'post_reactions_by_type_total',
            'post_activity_by_action_type',
            'post_video_views',
        ];
    try {
        const payload = await fetchMetaJson(account, `${post.externalPostId}/insights`, { metric: metrics.join(',') });
        const values = Object.fromEntries((payload.data ?? [])
            .map((item) => [
            asString(item.name),
            extractInsightValue(item),
        ])
            .filter((entry) => Boolean(entry[0])));
        const actionBreakdown = toRecord(values.post_activity_by_action_type);
        const totalInteractions = asNumber(values.total_interactions);
        const explicitSaves = asNumber(values.saved) ||
            asNumber(actionBreakdown.save) ||
            asNumber(actionBreakdown.saved);
        const explicitShares = asNumber(values.shares) ||
            asNumber(actionBreakdown.share) ||
            asNumber(actionBreakdown.shares);
        const hasExplicitSaves = values.saved !== undefined ||
            actionBreakdown.save !== undefined ||
            actionBreakdown.saved !== undefined;
        const hasExplicitShares = values.shares !== undefined ||
            actionBreakdown.share !== undefined ||
            actionBreakdown.shares !== undefined;
        const resolvedSaves = explicitSaves ||
            (!hasExplicitSaves && hasExplicitShares
                ? Math.max(0, totalInteractions -
                    asNumber(post.likeCount) -
                    asNumber(post.commentsCount) -
                    explicitShares)
                : 0);
        const reactionCount = sumNumericRecord(values.post_reactions_by_type_total) ||
            post.reactionCount;
        return {
            ...post,
            likeCount: asNumber(actionBreakdown.like) ||
                asNumber(actionBreakdown.likes) ||
                post.likeCount,
            saveCount: resolvedSaves || post.saveCount,
            shareCount: explicitShares || post.shareCount,
            reactionCount,
            impressionsCount: asNumber(values.impressions) ||
                asNumber(values.post_impressions) ||
                post.impressionsCount,
            reachCount: asNumber(values.reach) ||
                asNumber(values.post_impressions_unique) ||
                post.reachCount,
            videoViewsCount: asNumber(values.video_views) ||
                asNumber(values.plays) ||
                asNumber(values.post_video_views) ||
                post.videoViewsCount,
            rawPayload: {
                ...post.rawPayload,
                accountIntelligenceInsights: payload,
            },
        };
    }
    catch (error) {
        console.info('[account-intelligence] post insights unavailable; using public counts', {
            userId: account.userId,
            socialAccountId: account.id,
            platform: account.platform,
            externalPostId: post.externalPostId,
            reason: error instanceof Error ? error.message : String(error),
        });
        return post;
    }
};
const enrichPostsWithInsights = async (account, posts) => {
    const enriched = [];
    const concurrency = 2;
    for (let index = 0; index < posts.length; index += concurrency) {
        const batch = posts.slice(index, index + concurrency);
        enriched.push(...(await Promise.all(batch.map((post) => fetchPostInsightSnapshot(account, post)))));
    }
    return enriched;
};
const fetchInstagramPosts = async (account) => {
    const objectId = getMetaApiMode(account) === 'instagram' ? 'me' : getInstagramObjectId(account);
    const payload = await fetchMetaJson(account, `${objectId}/media`, {
        fields: 'id,caption,timestamp,media_type,media_product_type,media_url,thumbnail_url,permalink,like_count,comments_count',
        limit: String(Math.max(1, constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT)),
    });
    return (payload.data ?? [])
        .map((row) => buildRawPost(account, row))
        .filter((row) => Boolean(row));
};
const fetchFacebookPosts = async (account) => {
    const payload = await fetchMetaJson(account, `${getFacebookPageId(account)}/posts`, {
        fields: 'id,message,created_time,permalink_url,full_picture,attachments,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)',
        limit: String(Math.max(1, constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT)),
    });
    return (payload.data ?? [])
        .map((row) => buildRawPost(account, row))
        .filter((row) => Boolean(row));
};
const selectPostsForIncrementalSync = (posts, existingProfile) => {
    if (!existingProfile?.lastPostTimestamp) {
        return posts;
    }
    const checkpointTime = new Date(existingProfile.lastPostTimestamp).getTime();
    const newPosts = posts.filter((post) => {
        if (!post.postedAt) {
            return false;
        }
        const postedTime = new Date(post.postedAt).getTime();
        return Number.isFinite(postedTime) && postedTime > checkpointTime;
    });
    const recentMetricsRefresh = posts.slice(0, Math.min(8, constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT));
    const selectedById = new Map();
    [...newPosts, ...recentMetricsRefresh].forEach((post) => {
        selectedById.set(post.externalPostId, post);
    });
    return [...selectedById.values()];
};
const getWordCounts = (captions) => {
    const counts = new Map();
    captions.forEach((caption) => {
        const words = caption
            .toLowerCase()
            .replace(/https?:\/\/\S+/g, ' ')
            .replace(/#[\p{L}\p{N}_]+/gu, ' ')
            .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu) ?? [];
        new Set(words).forEach((word) => {
            if (!STOP_WORDS.has(word) && !/^\d+$/.test(word)) {
                counts.set(word, (counts.get(word) ?? 0) + 1);
            }
        });
    });
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12)
        .map(([word]) => word);
};
const inferHookStyles = (captions) => {
    const styles = new Map();
    captions.forEach((caption) => {
        const opening = caption.trim().split(/\n|[.!?]/)[0]?.trim() ?? '';
        const style = opening.includes('?')
            ? 'question-led'
            : /\b(how|why|what|when|where)\b/i.test(opening)
                ? 'educational'
                : /\b(stop|never|avoid|mistake|warning)\b/i.test(opening)
                    ? 'warning-led'
                    : /\b\d+\b/.test(opening)
                        ? 'number-led'
                        : opening.length <= 55
                            ? 'short statement'
                            : 'story-led';
        styles.set(style, (styles.get(style) ?? 0) + 1);
    });
    return [...styles.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([style]) => style);
};
const inferCtaStyles = (captions) => {
    const counts = new Map();
    captions.forEach((caption) => {
        const normalized = caption.toLowerCase();
        const matches = [
            [/\b(comment|tell us|reply)\b/, 'comment invitation'],
            [/\b(save|bookmark)\b/, 'save prompt'],
            [/\b(share|send this)\b/, 'share prompt'],
            [/\b(shop|buy|order|link in bio|dm us)\b/, 'conversion CTA'],
            [/\b(follow|stay tuned)\b/, 'follow CTA'],
        ];
        const match = matches.find(([pattern]) => pattern.test(normalized));
        const style = match?.[1] ?? 'soft or no CTA';
        counts.set(style, (counts.get(style) ?? 0) + 1);
    });
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([style]) => style);
};
const scorePost = (post) => {
    const denominator = Math.max(post.reachCount || post.impressionsCount, 1);
    const likeOrReactionSignal = post.platform === 'facebook'
        ? Math.max(post.reactionCount, post.likeCount)
        : post.likeCount;
    const weightedResponse = likeOrReactionSignal +
        post.commentsCount * 2 +
        post.saveCount * 3 +
        post.shareCount * 4;
    return weightedResponse / denominator;
};
const buildFallbackVisualDna = (posts) => {
    const visualPosts = posts.filter((post) => post.mediaUrl || post.thumbnailUrl);
    const formats = new Map();
    visualPosts.forEach((post) => {
        const format = post.normalizedFormat ?? 'visual post';
        formats.set(format, (formats.get(format) ?? 0) + 1);
    });
    const dominantFormat = [...formats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
        composition: dominantFormat
            ? `Recent visuals are mostly ${dominantFormat} posts.`
            : 'No reliable composition pattern is available yet.',
        background: 'Background style needs more visual evidence.',
        colorMood: 'Color mood needs more visual evidence.',
        framing: 'Framing style needs more visual evidence.',
        textUsage: 'Text placement needs more visual evidence.',
        consistency: visualPosts.length >= 6
            ? 'There is enough recent media to guide visual consistency.'
            : 'Visual consistency is still forming.',
        source: 'stored media metadata',
    };
};
const visualDnaSchema = zod_1.z.object({
    composition: zod_1.z.string().max(180),
    background: zod_1.z.string().max(180),
    colorMood: zod_1.z.string().max(180),
    framing: zod_1.z.string().max(180),
    textUsage: zod_1.z.string().max(180),
    consistency: zod_1.z.string().max(180),
});
const analyzeVisualDna = async (posts) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const candidates = posts
        .map((post) => post.thumbnailUrl || post.mediaUrl)
        .filter((value) => Boolean(value))
        .slice(0, Math.min(constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_VISUAL_SAMPLE_LIMIT, 8));
    if (!apiKey || !candidates.length) {
        return {
            visualDna: buildFallbackVisualDna(posts),
            assetsAnalyzed: 0,
        };
    }
    const inlineParts = [];
    for (const imageUrl of candidates) {
        try {
            const response = await fetch(imageUrl, {
                signal: AbortSignal.timeout(8000),
            });
            const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
            const contentLength = Number(response.headers.get('content-length') || 0);
            if (!response.ok ||
                !contentType?.startsWith('image/') ||
                contentLength > 3 * 1024 * 1024) {
                continue;
            }
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > 3 * 1024 * 1024) {
                continue;
            }
            inlineParts.push({
                inlineData: {
                    mimeType: contentType,
                    data: bytes.toString('base64'),
                },
            });
        }
        catch {
            // Public Meta media URLs can expire between fetch and analysis.
        }
    }
    if (!inlineParts.length) {
        return {
            visualDna: buildFallbackVisualDna(posts),
            assetsAnalyzed: 0,
        };
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${constants_1.DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: [
                                'Study these recent social media visuals as a group.',
                                'Describe reusable visual tendencies without identifying people and without copying any single post.',
                                'Return JSON with composition, background, colorMood, framing, textUsage, and consistency.',
                                'Keep each value under 180 characters.',
                            ].join(' '),
                        },
                        ...inlineParts,
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
            },
        }),
    });
    if (!response.ok) {
        throw new Error(`Visual analysis failed with status ${response.status}.`);
    }
    const payload = (await response.json());
    const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
    const parsed = visualDnaSchema.parse(JSON.parse(text || '{}'));
    return {
        visualDna: { ...parsed, source: 'multimodal sample' },
        assetsAnalyzed: inlineParts.length,
    };
};
const deriveIntelligence = async (profile, posts) => {
    const captions = posts
        .map((post) => post.captionText?.trim())
        .filter((caption) => Boolean(caption));
    const repeatedKeywords = getWordCounts(captions);
    const hookStyles = inferHookStyles(captions);
    const ctaStyles = inferCtaStyles(captions);
    const captionLengths = captions.map((caption) => caption.length);
    const averageCaptionLength = captionLengths.length
        ? captionLengths.reduce((total, value) => total + value, 0) / captionLengths.length
        : 0;
    const captionLengthPattern = averageCaptionLength === 0
        ? null
        : averageCaptionLength < 140
            ? 'short'
            : averageCaptionLength < 500
                ? 'medium'
                : 'long';
    const emojiCount = captions.reduce((total, caption) => total + (caption.match(/\p{Extended_Pictographic}/gu)?.length ?? 0), 0);
    const hashtagCount = captions.reduce((total, caption) => total + (caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0), 0);
    const formatMix = posts.reduce((result, post) => {
        const format = post.normalizedFormat ?? 'other';
        result[format] = (result[format] ?? 0) + 1;
        return result;
    }, {});
    const publishDays = posts.reduce((result, post) => {
        if (!post.postedAt) {
            return result;
        }
        const day = new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            timeZone: 'UTC',
        }).format(new Date(post.postedAt));
        result[day] = (result[day] ?? 0) + 1;
        return result;
    }, {});
    const sortedByPerformance = [...posts].sort((left, right) => scorePost(right) - scorePost(left));
    const positivePosts = sortedByPerformance.filter((post) => scorePost(post) > 0);
    const bestPatterns = positivePosts.slice(0, 3).map((post) => ({
        format: post.normalizedFormat ?? 'other',
        hook: inferHookStyles(post.captionText ? [post.captionText] : [])[0] ?? 'not detected',
        responseScore: Number(scorePost(post).toFixed(6)),
        postId: post.externalPostId,
    }));
    const bestPostIds = new Set(bestPatterns.map((pattern) => pattern.postId));
    const weakPatterns = positivePosts.length >= 4
        ? positivePosts
            .slice()
            .reverse()
            .filter((post) => !bestPostIds.has(post.externalPostId))
            .slice(0, 3)
            .map((post) => ({
            format: post.normalizedFormat ?? 'other',
            hook: inferHookStyles(post.captionText ? [post.captionText] : [])[0] ??
                'not detected',
            responseScore: Number(scorePost(post).toFixed(6)),
            postId: post.externalPostId,
        }))
        : [];
    const { visualDna, assetsAnalyzed } = await analyzeVisualDna(posts).catch((error) => {
        console.warn('[account-intelligence] visual analysis skipped', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            visualDna: buildFallbackVisualDna(posts),
            assetsAnalyzed: 0,
        };
    });
    const accountTone = hookStyles.includes('educational')
        ? 'educational and clear'
        : captions.some((caption) => /premium|luxury|exclusive/i.test(caption))
            ? 'premium and polished'
            : captions.some((caption) => /!{2,}|🔥|🚀/u.test(caption))
                ? 'energetic and promotional'
                : captions.length
                    ? 'conversational'
                    : null;
    const mainThemes = repeatedKeywords.slice(0, 6);
    const activeDays = Object.keys(publishDays).length;
    const summaryText = [
        `Connected ${posts[0]?.platform ?? 'social'} account intelligence from ${posts.length} recent posts.`,
        accountTone ? `Tone: ${accountTone}.` : null,
        mainThemes.length ? `Main themes: ${mainThemes.join(', ')}.` : null,
        hookStyles.length ? `Common openings: ${hookStyles.join(', ')}.` : null,
        ctaStyles.length ? `CTA style: ${ctaStyles.join(', ')}.` : null,
        captionLengthPattern
            ? `Typical caption length: ${captionLengthPattern}.`
            : null,
        Object.keys(formatMix).length
            ? `Format mix: ${Object.entries(formatMix)
                .map(([key, value]) => `${key} ${value}`)
                .join(', ')}.`
            : null,
        bestPatterns.length
            ? `Strong recent pattern: ${bestPatterns[0]?.format ?? 'visual'} with ${bestPatterns[0]?.hook ?? 'clear'} openings.`
            : 'Performance evidence is still forming.',
        `Visual direction: ${visualDna.composition ?? 'still forming'} ${visualDna.background ?? ''}`.trim(),
    ]
        .filter(Boolean)
        .join(' ');
    return {
        intelligence: {
            summaryText,
            accountTone,
            mainThemes,
            repeatedKeywords,
            hookStyles,
            ctaStyles,
            captionLengthPattern,
            emojiStyle: captions.length === 0
                ? null
                : emojiCount / captions.length >= 3
                    ? 'emoji-rich'
                    : emojiCount > 0
                        ? 'light emoji use'
                        : 'minimal emoji use',
            hashtagBehavior: captions.length === 0
                ? null
                : hashtagCount / captions.length >= 8
                    ? 'heavy hashtag use'
                    : hashtagCount > 0
                        ? 'selective hashtag use'
                        : 'minimal hashtag use',
            postingCadence: {
                postsAnalyzed: posts.length,
                activeDays,
                dayCounts: publishDays,
            },
            formatMix,
            bestPatterns,
            weakPatterns,
            visualDna,
            performanceContext: {
                postsWithPositiveResponse: positivePosts.length,
                averageResponseScore: posts.length > 0
                    ? Number((posts.reduce((total, post) => total + scorePost(post), 0) /
                        posts.length).toFixed(6))
                    : 0,
                followersCount: profile.followersCount,
                mediaCount: profile.mediaCount,
            },
        },
        visualAssetsAnalyzed: assetsAnalyzed,
    };
};
const normalizeFailureKind = (error) => {
    const statusCode = error?.statusCode;
    if (statusCode === 401)
        return 'authentication_expired';
    if (statusCode === 403)
        return 'permission_missing';
    if (statusCode === 429)
        return 'rate_limited';
    if (typeof statusCode === 'number' && statusCode >= 500)
        return 'meta_unavailable';
    if ((0, retry_1.isRetryableError)(error))
        return 'temporary_network_failure';
    return 'unexpected_failure';
};
const loadAccountForSync = async (client, userId, socialAccountId) => {
    const account = await (0, socialAccounts_1.getSocialAccountById)(client, userId, socialAccountId);
    if (!account || account.verificationStatus !== 'verified') {
        throw new Error('The connected account is missing or is no longer verified.');
    }
    const platform = normalizePlatform(account.platform);
    if (!isSupportedPlatform(platform)) {
        throw new Error('Connected account intelligence only supports Instagram and Facebook.');
    }
    return account;
};
const syncSocialAccountIntelligence = async (client, input) => {
    const account = await loadAccountForSync(client, input.userId, input.socialAccountId);
    const existingProfile = await (0, socialAccountIntelligence_1.getSocialAccountIntelligenceProfileBySocialAccountId)(client, account.id);
    const run = input.runId
        ? await (0, socialAccountIntelligence_1.updateSocialAccountSyncRun)(client, input.runId, {
            status: 'running',
            startedAt: nowIso(),
            checkpointPostId: existingProfile?.lastPostId ?? null,
            checkpointPostedAt: existingProfile?.lastPostTimestamp ?? null,
        })
        : await (0, socialAccountIntelligence_1.createSocialAccountSyncRun)(client, {
            userId: account.userId,
            socialAccountId: account.id,
            platform: account.platform,
            triggerSource: input.triggerSource,
            status: 'running',
            startedAt: nowIso(),
            checkpointPostId: existingProfile?.lastPostId ?? null,
            checkpointPostedAt: existingProfile?.lastPostTimestamp ?? null,
        });
    syncRetryCounts.set(account.id, 0);
    (0, observability_1.logOperationalEvent)('Connected account intelligence sync started', {
        userId: account.userId,
        socialAccountId: account.id,
        platform: account.platform,
        queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
        syncRunId: run.id,
        triggerSource: input.triggerSource,
    });
    try {
        const profile = account.platform === 'instagram'
            ? await fetchInstagramProfile(account)
            : await fetchFacebookProfile(account);
        const fetchedPostCandidates = account.platform === 'instagram'
            ? await fetchInstagramPosts(account)
            : await fetchFacebookPosts(account);
        const fetchedPostsWithoutInsights = selectPostsForIncrementalSync(fetchedPostCandidates, existingProfile);
        const fetchedPosts = await enrichPostsWithInsights(account, fetchedPostsWithoutInsights);
        await (0, socialAccountIntelligence_1.createSocialAccountProfileSnapshot)(client, {
            userId: account.userId,
            socialAccountId: account.id,
            syncRunId: run.id,
            platform: account.platform,
            ...profile,
            fetchedAt: nowIso(),
        });
        const storedPosts = [];
        let insightRowsCount = 0;
        for (const post of fetchedPosts) {
            const storedPost = await (0, socialAccountIntelligence_1.upsertSocialAccountPostRaw)(client, post);
            storedPosts.push(storedPost);
            await (0, socialAccountIntelligence_1.createSocialAccountPostInsight)(client, {
                userId: account.userId,
                socialAccountId: account.id,
                socialAccountPostRawId: storedPost.id,
                syncRunId: run.id,
                platform: account.platform,
                likeCount: storedPost.likeCount,
                commentsCount: storedPost.commentsCount,
                shareCount: storedPost.shareCount,
                saveCount: storedPost.saveCount,
                reactionCount: storedPost.reactionCount,
                impressionsCount: storedPost.impressionsCount,
                reachCount: storedPost.reachCount,
                videoViewsCount: storedPost.videoViewsCount,
                metrics: {
                    normalizedFormat: storedPost.normalizedFormat,
                    responseScore: scorePost(storedPost),
                },
                rawPayload: storedPost.rawPayload,
            });
            insightRowsCount += 1;
        }
        const recentPosts = await (0, socialAccountIntelligence_1.listRecentSocialAccountPosts)(client, account.id, constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT);
        const { intelligence, visualAssetsAnalyzed } = await deriveIntelligence(profile, recentPosts);
        const newestPost = recentPosts[0] ?? null;
        const oldestPost = recentPosts[recentPosts.length - 1] ?? null;
        const syncedAt = nowIso();
        const intelligenceProfile = await (0, socialAccountIntelligence_1.upsertSocialAccountIntelligenceProfile)(client, {
            userId: account.userId,
            socialAccountId: account.id,
            platform: account.platform,
            ...intelligence,
            summaryPayload: {
                username: profile.username,
                displayName: profile.displayName,
                profilePictureUrl: profile.profilePictureUrl,
                generatedAt: syncedAt,
                source: 'connected-meta-account',
            },
            sourcePostCount: recentPosts.length,
            lastPostId: newestPost?.externalPostId ?? null,
            lastPostTimestamp: newestPost?.postedAt ?? null,
            lastSyncedAt: syncedAt,
            nextRefreshAt: nextRefreshIso(),
            sourceWindowStart: oldestPost?.postedAt ?? null,
            sourceWindowEnd: newestPost?.postedAt ?? syncedAt,
        });
        await (0, brandMemory_service_1.syncConnectedAccountIntelligenceSemanticMemory)(client, intelligenceProfile).catch((error) => {
            (0, observability_1.logFailure)('Connected account memory indexing failed', error, {
                userId: account.userId,
                socialAccountId: account.id,
                platform: account.platform,
            }, 'warn');
        });
        await (0, socialAccountIntelligence_1.updateSocialAccountSyncRun)(client, run.id, {
            status: 'completed',
            lastSyncedAt: syncedAt,
            nextRefreshAt: intelligenceProfile.nextRefreshAt,
            fetchedPostsCount: fetchedPostCandidates.length,
            upsertedPostsCount: storedPosts.length,
            insightRowsCount,
            visualAssetsAnalyzed,
            retryCount: syncRetryCounts.get(account.id) ?? 0,
            checkpointPostId: newestPost?.externalPostId ?? null,
            checkpointPostedAt: newestPost?.postedAt ?? null,
            rawSummary: {
                profileUsername: profile.username,
                fetchedPostCandidates: fetchedPostCandidates.length,
                refreshedPosts: fetchedPosts.length,
                storedPosts: recentPosts.length,
                memoryIndexed: true,
            },
            completedAt: syncedAt,
        });
        (0, observability_1.logOperationalEvent)('Connected account intelligence sync completed', {
            userId: account.userId,
            socialAccountId: account.id,
            platform: account.platform,
            queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
            syncRunId: run.id,
            fetchedPostCandidates: fetchedPostCandidates.length,
            refreshedPosts: fetchedPosts.length,
            storedPosts: recentPosts.length,
            visualAssetsAnalyzed,
        });
        return intelligenceProfile;
    }
    catch (error) {
        const failureKind = normalizeFailureKind(error);
        await (0, socialAccountIntelligence_1.updateSocialAccountSyncRun)(client, run.id, {
            status: 'failed',
            normalizedFailureKind: failureKind,
            errorMessage: error instanceof Error ? error.message : String(error),
            retryCount: syncRetryCounts.get(account.id) ?? 0,
            completedAt: nowIso(),
        }).catch(() => undefined);
        (0, observability_1.logFailure)('Connected account intelligence sync failed', error, {
            userId: account.userId,
            socialAccountId: account.id,
            platform: account.platform,
            queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
            syncRunId: run.id,
            failureKind,
        });
        (0, observability_1.recordFailureSpikeSignal)('connected_account_intelligence_sync_failed', {
            queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
            provider: 'meta',
            platform: account.platform,
        });
        throw error;
    }
    finally {
        syncRetryCounts.delete(account.id);
    }
};
exports.syncSocialAccountIntelligence = syncSocialAccountIntelligence;
const getIntelligenceQueue = () => {
    if (!intelligenceQueue) {
        intelligenceQueue = new bullmq_1.Queue(queueNames_1.QUEUE_NAMES.socialAccountIntelligence, (0, redis_1.getBullMqConfig)('prixmoai:queue:social-account-intelligence'));
    }
    return intelligenceQueue;
};
const clearWorkerIdleTimer = () => {
    if (intelligenceWorkerIdleTimer) {
        clearTimeout(intelligenceWorkerIdleTimer);
        intelligenceWorkerIdleTimer = null;
    }
};
const scheduleWorkerIdleShutdown = () => {
    if (constants_1.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS <= 0 || !intelligenceWorker) {
        return;
    }
    clearWorkerIdleTimer();
    const workerToClose = intelligenceWorker;
    intelligenceWorkerIdleTimer = setTimeout(() => {
        if (intelligenceWorker !== workerToClose) {
            return;
        }
        intelligenceWorker = null;
        void workerToClose.close().catch((error) => {
            console.warn('[account-intelligence] failed to close idle worker', {
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }, constants_1.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS);
    intelligenceWorkerIdleTimer.unref?.();
};
const enqueueSocialAccountIntelligenceSync = async (input) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const activeRun = await (0, socialAccountIntelligence_1.findActiveSocialAccountSyncRun)(client, input.socialAccountId);
    if (activeRun && !input.force) {
        (0, observability_1.logOperationalEvent)('Connected account intelligence sync skipped', {
            userId: input.userId,
            socialAccountId: input.socialAccountId,
            queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
            reason: 'A sync is already queued or running.',
            syncRunId: activeRun.id,
        });
        return { queued: false, runId: activeRun.id };
    }
    const account = await loadAccountForSync(client, input.userId, input.socialAccountId);
    let run;
    let createdRun = true;
    try {
        run = await (0, socialAccountIntelligence_1.createSocialAccountSyncRun)(client, {
            userId: input.userId,
            socialAccountId: input.socialAccountId,
            platform: account.platform,
            triggerSource: input.triggerSource,
            status: 'queued',
        });
    }
    catch (error) {
        const concurrentRun = await (0, socialAccountIntelligence_1.findActiveSocialAccountSyncRun)(client, input.socialAccountId);
        if (!concurrentRun) {
            throw error;
        }
        run = concurrentRun;
        createdRun = false;
    }
    if (!createdRun) {
        (0, observability_1.logOperationalEvent)('Connected account intelligence sync skipped', {
            userId: input.userId,
            socialAccountId: input.socialAccountId,
            queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
            reason: 'Another request queued this account first.',
            syncRunId: run.id,
        });
        return { queued: false, runId: run.id };
    }
    if (!redis_1.isRedisConfigured) {
        void (0, exports.syncSocialAccountIntelligence)(client, {
            ...input,
            runId: run.id,
        }).catch(async (error) => {
            await (0, socialAccountIntelligence_1.updateSocialAccountSyncRun)(client, run.id, {
                status: 'failed',
                normalizedFailureKind: normalizeFailureKind(error),
                errorMessage: error instanceof Error ? error.message : String(error),
                completedAt: nowIso(),
            }).catch(() => undefined);
        });
        return { queued: true, runId: run.id, mode: 'in-process' };
    }
    try {
        await getIntelligenceQueue().add('sync-account', { jobType: 'sync-account', ...input, runId: run.id }, {
            jobId: `account-intelligence-${input.socialAccountId}-${run.id}`,
            removeOnComplete: true,
            removeOnFail: { age: 24 * 60 * 60, count: 200 },
            attempts: 1,
        });
    }
    catch (error) {
        await (0, socialAccountIntelligence_1.updateSocialAccountSyncRun)(client, run.id, {
            status: 'failed',
            normalizedFailureKind: 'queue_unavailable',
            errorMessage: error instanceof Error ? error.message : String(error),
            completedAt: nowIso(),
        }).catch(() => undefined);
        throw error;
    }
    (0, observability_1.logOperationalEvent)('Connected account intelligence sync queued', {
        userId: input.userId,
        socialAccountId: input.socialAccountId,
        platform: account.platform,
        queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
        syncRunId: run.id,
        triggerSource: input.triggerSource,
    });
    (0, exports.startSocialAccountIntelligenceWorker)();
    return { queued: true, runId: run.id, mode: 'queue' };
};
exports.enqueueSocialAccountIntelligenceSync = enqueueSocialAccountIntelligenceSync;
const processSweep = async (job) => {
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const dueProfiles = await (0, socialAccountIntelligence_1.listDueSocialAccountIntelligenceProfiles)(client, 100);
    let queued = 0;
    let skipped = 0;
    for (const profile of dueProfiles) {
        try {
            const result = await (0, exports.enqueueSocialAccountIntelligenceSync)({
                userId: profile.userId,
                socialAccountId: profile.socialAccountId,
                triggerSource: 'daily-sweep',
            });
            result.queued ? (queued += 1) : (skipped += 1);
        }
        catch (error) {
            skipped += 1;
            (0, observability_1.logFailure)('Connected account daily refresh enqueue failed', error, {
                userId: profile.userId,
                socialAccountId: profile.socialAccountId,
                platform: profile.platform,
                jobId: job.id,
            }, 'warn');
        }
    }
    (0, observability_1.logOperationalEvent)('Connected account daily refresh sweep completed', {
        queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
        dueAccounts: dueProfiles.length,
        queued,
        skipped,
    });
    return { dueAccounts: dueProfiles.length, queued, skipped };
};
const startSocialAccountIntelligenceWorker = () => {
    if (!supabase_1.isSupabaseAdminConfigured ||
        !constants_1.isMetaOAuthConfigured ||
        !redis_1.isRedisConfigured) {
        return;
    }
    if (intelligenceWorker) {
        clearWorkerIdleTimer();
        return;
    }
    intelligenceWorker = new bullmq_1.Worker(queueNames_1.QUEUE_NAMES.socialAccountIntelligence, async (job) => {
        if (job.data.jobType === 'daily-sweep') {
            return processSweep(job);
        }
        const client = (0, supabase_1.requireSupabaseAdmin)();
        return (0, exports.syncSocialAccountIntelligence)(client, {
            userId: job.data.userId,
            socialAccountId: job.data.socialAccountId,
            triggerSource: job.data.triggerSource,
            runId: job.data.runId,
        });
    }, {
        ...(0, redis_1.getBullMqConfig)('prixmoai:worker:social-account-intelligence'),
        ...(0, workerOptions_1.getLowCommandWorkerOptions)(),
        concurrency: Math.max(1, constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_JOB_CONCURRENCY),
    });
    intelligenceWorker.on('active', clearWorkerIdleTimer);
    intelligenceWorker.on('drained', scheduleWorkerIdleShutdown);
    intelligenceWorker.on('failed', (job, error) => {
        if (job?.data.jobType === 'sync-account' && job.data.runId) {
            void (0, socialAccountIntelligence_1.updateSocialAccountSyncRun)((0, supabase_1.requireSupabaseAdmin)(), job.data.runId, {
                status: 'failed',
                normalizedFailureKind: normalizeFailureKind(error),
                errorMessage: error.message,
                completedAt: nowIso(),
            }).catch(() => undefined);
        }
        (0, observability_1.logFailure)('Connected account intelligence worker failed', error, {
            jobId: job?.id ?? null,
            userId: job?.data.jobType === 'sync-account' ? job.data.userId : null,
            socialAccountId: job?.data.jobType === 'sync-account' ? job.data.socialAccountId : null,
            queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
        });
    });
    console.log('[account-intelligence] Worker started. Waiting for sync jobs.');
};
exports.startSocialAccountIntelligenceWorker = startSocialAccountIntelligenceWorker;
const ensureSocialAccountIntelligenceSweep = async () => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    await getIntelligenceQueue().add('daily-sweep', { jobType: 'daily-sweep', triggerSource: 'scheduled-sweep' }, {
        jobId: SWEEP_JOB_ID,
        repeat: {
            every: Math.max(5 * 60000, constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_SWEEP_INTERVAL_MS),
        },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60, count: 50 },
    });
    (0, exports.startSocialAccountIntelligenceWorker)();
};
exports.ensureSocialAccountIntelligenceSweep = ensureSocialAccountIntelligenceSweep;
const handleVerifiedSocialAccountConnected = async (userId, account) => {
    if (account.verificationStatus !== 'verified') {
        return account;
    }
    const platform = normalizePlatform(account.platform);
    if (!isSupportedPlatform(platform)) {
        return account;
    }
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const primary = await (0, socialAccounts_1.setPrimarySocialAccountForPlatform)(client, userId, account.platform, account.id);
    (0, observability_1.logOperationalEvent)('Connected account saved as primary', {
        userId,
        socialAccountId: primary.id,
        platform: primary.platform,
    });
    await (0, exports.enqueueSocialAccountIntelligenceSync)({
        userId,
        socialAccountId: primary.id,
        triggerSource: 'account-connected',
    }).catch((error) => {
        (0, observability_1.logFailure)('Connected account intelligence enqueue failed', error, {
            userId,
            socialAccountId: primary.id,
            platform: primary.platform,
            queue: queueNames_1.QUEUE_NAMES.socialAccountIntelligence,
        }, 'warn');
    });
    return primary;
};
exports.handleVerifiedSocialAccountConnected = handleVerifiedSocialAccountConnected;
const prepareConnectedAccountIntelligenceForGeneration = async (client, userId, platform) => {
    const normalizedPlatform = normalizePlatform(platform);
    if (!isSupportedPlatform(normalizedPlatform)) {
        return null;
    }
    const account = await (0, socialAccounts_1.getPrimarySocialAccountByUserAndPlatform)(client, userId, normalizedPlatform);
    if (!account) {
        (0, observability_1.logOperationalEvent)('Connected account intelligence not available', {
            userId,
            platform: normalizedPlatform,
            reason: 'No verified primary account is connected.',
        });
        return null;
    }
    const profile = await (0, socialAccountIntelligence_1.getSocialAccountIntelligenceProfileBySocialAccountId)(client, account.id);
    const stale = !profile?.lastSyncedAt ||
        Date.now() - new Date(profile.lastSyncedAt).getTime() >=
            constants_1.SOCIAL_ACCOUNT_INTELLIGENCE_STALE_MS;
    (0, observability_1.logOperationalEvent)('Connected account intelligence checked for generation', {
        userId,
        socialAccountId: account.id,
        platform: normalizedPlatform,
        intelligenceFound: Boolean(profile),
        stale,
    });
    if (stale) {
        void (0, exports.enqueueSocialAccountIntelligenceSync)({
            userId,
            socialAccountId: account.id,
            triggerSource: profile ? 'stale-generation-lookup' : 'missing-generation-lookup',
        }).catch((error) => {
            (0, observability_1.logFailure)('Connected account silent refresh enqueue failed', error, {
                userId,
                socialAccountId: account.id,
                platform: normalizedPlatform,
            }, 'warn');
        });
    }
    return profile;
};
exports.prepareConnectedAccountIntelligenceForGeneration = prepareConnectedAccountIntelligenceForGeneration;
