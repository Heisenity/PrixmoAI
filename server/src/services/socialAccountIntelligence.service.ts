import { createHash } from 'crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { z } from 'zod';
import {
  ANALYTICS_WORKER_IDLE_SHUTDOWN_MS,
  DEFAULT_GEMINI_MODEL,
  META_GRAPH_VERSION,
  SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT,
  SOCIAL_ACCOUNT_INTELLIGENCE_JOB_CONCURRENCY,
  SOCIAL_ACCOUNT_INTELLIGENCE_STALE_MS,
  SOCIAL_ACCOUNT_INTELLIGENCE_SWEEP_INTERVAL_MS,
  SOCIAL_ACCOUNT_INTELLIGENCE_VISUAL_SAMPLE_LIMIT,
  isMetaOAuthConfigured,
} from '../config/constants';
import {
  createSocialAccountPostInsight,
  createSocialAccountProfileSnapshot,
  createSocialAccountSyncRun,
  findActiveSocialAccountSyncRun,
  getSocialAccountIntelligenceProfileBySocialAccountId,
  listDueSocialAccountIntelligenceProfiles,
  listRecentSocialAccountPosts,
  updateSocialAccountSyncRun,
  upsertSocialAccountIntelligenceProfile,
  upsertSocialAccountPostRaw,
} from '../db/queries/socialAccountIntelligence';
import {
  getPrimarySocialAccountByUserAndPlatform,
  getSocialAccountById,
  setPrimarySocialAccountForPlatform,
} from '../db/queries/socialAccounts';
import {
  isSupabaseAdminConfigured,
  requireSupabaseAdmin,
  type AppSupabaseClient,
} from '../db/supabase';
import { logFailure, logOperationalEvent, recordFailureSpikeSignal } from '../lib/observability';
import { getBullMqConfig, isRedisConfigured } from '../lib/redis';
import { isRetryableError, retryWithBackoff } from '../lib/retry';
import { QUEUE_NAMES } from '../queues/queueNames';
import { getLowCommandWorkerOptions } from '../queues/workerOptions';
import type {
  SocialAccount,
  SocialAccountIntelligenceProfile,
  SocialAccountPostRaw,
  SocialPlatform,
  UpsertSocialAccountPostRawInput,
} from '../types';
import { syncConnectedAccountIntelligenceSemanticMemory } from './brandMemory.service';

type AccountIntelligenceJobData =
  | {
      jobType: 'sync-account';
      userId: string;
      socialAccountId: string;
      triggerSource: string;
      force?: boolean;
      runId: string;
    }
  | {
      jobType: 'daily-sweep';
      triggerSource: string;
    };

type MetaProfilePayload = {
  username: string | null;
  displayName: string | null;
  biography: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  rawPayload: Record<string, unknown>;
};

type MetaPostPayload = UpsertSocialAccountPostRawInput;

type MetaErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
  };
};

type MetaInsightItem = {
  name?: string;
  value?: unknown;
  values?: Array<{ value?: unknown }>;
  total_value?: unknown;
};

type VisualDna = {
  composition?: string;
  background?: string;
  colorMood?: string;
  framing?: string;
  textUsage?: string;
  consistency?: string;
  source?: string;
};

type DerivedIntelligence = {
  summaryText: string;
  accountTone: string | null;
  mainThemes: string[];
  repeatedKeywords: string[];
  hookStyles: string[];
  ctaStyles: string[];
  captionLengthPattern: string | null;
  emojiStyle: string | null;
  hashtagBehavior: string | null;
  postingCadence: Record<string, unknown>;
  formatMix: Record<string, unknown>;
  bestPatterns: Array<Record<string, unknown>>;
  weakPatterns: Array<Record<string, unknown>>;
  visualDna: VisualDna;
  performanceContext: Record<string, unknown>;
};

class AccountIntelligenceMetaError extends Error {
  readonly statusCode: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: {
      statusCode: number;
      code?: number;
      subcode?: number;
      retryAfterMs?: number;
    }
  ) {
    super(message);
    this.name = 'AccountIntelligenceMetaError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.subcode = options.subcode;
    this.retryAfterMs = options.retryAfterMs;
  }
}

const GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com';
const SWEEP_JOB_ID = 'social-account-intelligence-hourly-sweep';
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being',
  'between', 'both', 'brand', 'could', 'from', 'have', 'into', 'just', 'more',
  'most', 'only', 'other', 'over', 'post', 'posts', 'some', 'than', 'that',
  'their', 'there', 'these', 'they', 'this', 'through', 'very', 'what', 'when',
  'where', 'which', 'while', 'with', 'your', 'youre',
]);

let intelligenceQueue: Queue<AccountIntelligenceJobData> | null = null;
let intelligenceWorker: Worker<AccountIntelligenceJobData> | null = null;
let intelligenceWorkerIdleTimer: NodeJS.Timeout | null = null;
const syncRetryCounts = new Map<string, number>();

const nowIso = () => new Date().toISOString();
const nextRefreshIso = () =>
  new Date(Date.now() + SOCIAL_ACCOUNT_INTELLIGENCE_STALE_MS).toISOString();

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const asNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return asNumber(value);
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const hashText = (value: string | null | undefined) =>
  value ? createHash('sha256').update(value).digest('hex') : null;

const extractInstagramShortcode = (permalink: string | null) => {
  if (!permalink) {
    return null;
  }

  const match = permalink.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
  return match?.[1] ?? null;
};

const normalizePlatform = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? '';

const isSupportedPlatform = (
  value: string
): value is Extract<SocialPlatform, 'instagram' | 'facebook'> =>
  value === 'instagram' || value === 'facebook';

const normalizeFormat = (
  platform: string,
  mediaType: string | null,
  mediaProductType: string | null,
  attachments: unknown
) => {
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

const getMetaApiMode = (account: SocialAccount) =>
  asString(account.metadata.instagramApiMode) === 'instagram_login'
    ? 'instagram'
    : 'facebook';

const buildMetaUrl = (
  account: SocialAccount,
  path: string,
  params: Record<string, string>
) => {
  const base =
    account.platform === 'instagram' && getMetaApiMode(account) === 'instagram'
      ? INSTAGRAM_GRAPH_BASE_URL
      : GRAPH_BASE_URL;
  const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);

  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  if (account.accessToken) {
    url.searchParams.set('access_token', account.accessToken);
  }
  return url;
};

const fetchMetaJson = async <T>(
  account: SocialAccount,
  path: string,
  params: Record<string, string>
): Promise<T> => {
  if (!account.accessToken) {
    throw new AccountIntelligenceMetaError(
      'The connected account no longer has a usable access token.',
      { statusCode: 401 }
    );
  }

  return retryWithBackoff(
    async () => {
      const response = await fetch(buildMetaUrl(account, path, params), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as MetaErrorPayload & T;

      if (!response.ok || body.error) {
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        throw new AccountIntelligenceMetaError(
          body.error?.message || `Meta request failed with status ${response.status}.`,
          {
            statusCode: response.status,
            code: body.error?.code,
            subcode: body.error?.error_subcode,
            retryAfterMs: Number.isFinite(retryAfterSeconds)
              ? retryAfterSeconds * 1000
              : undefined,
          }
        );
      }

      return body as T;
    },
    {
      attempts: 4,
      baseDelayMs: 750,
      maxDelayMs: 8_000,
      shouldRetry: (error) => isRetryableError(error),
      onRetry: ({ error, attempt, nextDelayMs }) => {
        syncRetryCounts.set(
          account.id,
          (syncRetryCounts.get(account.id) ?? 0) + 1
        );
        logOperationalEvent(
          'Connected account sync retrying',
          {
            userId: account.userId,
            socialAccountId: account.id,
            platform: account.platform,
            provider: 'meta',
            retryAttempt: attempt,
            nextDelayMs,
            reason: error instanceof Error ? error.message : String(error),
          },
          'warn'
        );
      },
    }
  );
};

const getInstagramObjectId = (account: SocialAccount) =>
  asString(account.metadata.metaInstagramAccountId) || account.accountId;

const getFacebookPageId = (account: SocialAccount) =>
  asString(account.metadata.metaPageId) || account.accountId;

const fetchInstagramProfile = async (
  account: SocialAccount
): Promise<MetaProfilePayload> => {
  const objectId =
    getMetaApiMode(account) === 'instagram' ? 'me' : getInstagramObjectId(account);
  const payload = await fetchMetaJson<Record<string, unknown>>(
    account,
    objectId,
    {
      fields:
        'id,user_id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,account_type',
    }
  );

  return {
    username: asString(payload.username),
    displayName: asString(payload.name) || account.accountName,
    biography: asString(payload.biography),
    profilePictureUrl:
      asString(payload.profile_picture_url) ||
      asString(account.metadata.metaInstagramProfilePictureUrl),
    followersCount: nullableNumber(payload.followers_count),
    followsCount: nullableNumber(payload.follows_count),
    mediaCount: nullableNumber(payload.media_count),
    rawPayload: payload,
  };
};

const fetchFacebookProfile = async (
  account: SocialAccount
): Promise<MetaProfilePayload> => {
  const payload = await fetchMetaJson<Record<string, unknown>>(
    account,
    getFacebookPageId(account),
    {
      fields:
        'id,name,username,about,description,link,picture.type(large),followers_count,fan_count',
    }
  );
  const picture = toRecord(toRecord(payload.picture).data);

  return {
    username: asString(payload.username),
    displayName: asString(payload.name) || account.accountName,
    biography: asString(payload.about) || asString(payload.description),
    profilePictureUrl: asString(picture.url),
    followersCount:
      nullableNumber(payload.followers_count) ?? nullableNumber(payload.fan_count),
    followsCount: null,
    mediaCount: null,
    rawPayload: payload,
  };
};

const buildRawPost = (
  account: SocialAccount,
  row: Record<string, unknown>
): MetaPostPayload | null => {
  const externalPostId = asString(row.id);
  if (!externalPostId) {
    return null;
  }

  const platform = normalizePlatform(account.platform);
  const captionText = asString(row.caption) || asString(row.message);
  const permalink = asString(row.permalink) || asString(row.permalink_url);
  const mediaType = asString(row.media_type) || asString(row.type);
  const mediaProductType = asString(row.media_product_type);
  const mediaUrl =
    asString(row.media_url) ||
    asString(toRecord(toRecord(row.full_picture).data).url) ||
    asString(row.full_picture);
  const thumbnailUrl = asString(row.thumbnail_url);
  const likeCount = asNumber(row.like_count);
  const commentsCount =
    asNumber(row.comments_count) ||
    asNumber(toRecord(row.comments).summary && toRecord(toRecord(row.comments).summary).total_count);
  const reactionCount =
    asNumber(row.reactions_count) ||
    asNumber(toRecord(toRecord(row.reactions).summary).total_count);
  const shareCount =
    asNumber(row.shares_count) || asNumber(toRecord(row.shares).count);
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
    mediaFingerprint: hashText(
      [externalPostId, mediaUrl, thumbnailUrl, mediaType].filter(Boolean).join('|')
    ),
    mediaType,
    mediaProductType,
    normalizedFormat: normalizeFormat(
      platform,
      mediaType,
      mediaProductType,
      row.attachments
    ),
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

const extractInsightValue = (item: MetaInsightItem) => {
  const firstValue = item.values?.find(
    (entry) => entry?.value !== undefined
  )?.value;

  if (firstValue !== undefined) {
    return firstValue;
  }
  if (item.value !== undefined) {
    return item.value;
  }

  const totalValue = toRecord(item.total_value);
  return totalValue.value ?? item.total_value;
};

const sumNumericRecord = (value: unknown): number =>
  Object.values(toRecord(value)).reduce<number>(
    (total, entry) => total + asNumber(entry),
    0
  );

const fetchPostInsightSnapshot = async (
  account: SocialAccount,
  post: MetaPostPayload
): Promise<MetaPostPayload> => {
  const metrics =
    account.platform === 'instagram'
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
    const payload = await fetchMetaJson<{ data?: MetaInsightItem[] }>(
      account,
      `${post.externalPostId}/insights`,
      { metric: metrics.join(',') }
    );
    const values = Object.fromEntries(
      (payload.data ?? [])
        .map((item) => [
          asString(item.name),
          extractInsightValue(item),
        ] as const)
        .filter((entry): entry is [string, unknown] => Boolean(entry[0]))
    );
    const actionBreakdown = toRecord(values.post_activity_by_action_type);
    const totalInteractions = asNumber(values.total_interactions);
    const explicitSaves =
      asNumber(values.saved) ||
      asNumber(actionBreakdown.save) ||
      asNumber(actionBreakdown.saved);
    const explicitShares =
      asNumber(values.shares) ||
      asNumber(actionBreakdown.share) ||
      asNumber(actionBreakdown.shares);
    const hasExplicitSaves =
      values.saved !== undefined ||
      actionBreakdown.save !== undefined ||
      actionBreakdown.saved !== undefined;
    const hasExplicitShares =
      values.shares !== undefined ||
      actionBreakdown.share !== undefined ||
      actionBreakdown.shares !== undefined;
    const resolvedSaves =
      explicitSaves ||
      (!hasExplicitSaves && hasExplicitShares
        ? Math.max(
            0,
            totalInteractions -
              asNumber(post.likeCount) -
              asNumber(post.commentsCount) -
              explicitShares
          )
        : 0);
    const reactionCount =
      sumNumericRecord(values.post_reactions_by_type_total) ||
      post.reactionCount;

    return {
      ...post,
      likeCount:
        asNumber(actionBreakdown.like) ||
        asNumber(actionBreakdown.likes) ||
        post.likeCount,
      saveCount: resolvedSaves || post.saveCount,
      shareCount: explicitShares || post.shareCount,
      reactionCount,
      impressionsCount:
        asNumber(values.impressions) ||
        asNumber(values.post_impressions) ||
        post.impressionsCount,
      reachCount:
        asNumber(values.reach) ||
        asNumber(values.post_impressions_unique) ||
        post.reachCount,
      videoViewsCount:
        asNumber(values.video_views) ||
        asNumber(values.plays) ||
        asNumber(values.post_video_views) ||
        post.videoViewsCount,
      rawPayload: {
        ...post.rawPayload,
        accountIntelligenceInsights: payload,
      },
    };
  } catch (error) {
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

const enrichPostsWithInsights = async (
  account: SocialAccount,
  posts: MetaPostPayload[]
) => {
  const enriched: MetaPostPayload[] = [];
  const concurrency = 2;

  for (let index = 0; index < posts.length; index += concurrency) {
    const batch = posts.slice(index, index + concurrency);
    enriched.push(
      ...(await Promise.all(
        batch.map((post) => fetchPostInsightSnapshot(account, post))
      ))
    );
  }

  return enriched;
};

const fetchInstagramPosts = async (
  account: SocialAccount
): Promise<MetaPostPayload[]> => {
  const objectId =
    getMetaApiMode(account) === 'instagram' ? 'me' : getInstagramObjectId(account);
  const payload = await fetchMetaJson<{
    data?: Array<Record<string, unknown>>;
  }>(account, `${objectId}/media`, {
    fields:
      'id,caption,timestamp,media_type,media_product_type,media_url,thumbnail_url,permalink,like_count,comments_count',
    limit: String(Math.max(1, SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT)),
  });

  return (payload.data ?? [])
    .map((row) => buildRawPost(account, row))
    .filter((row): row is MetaPostPayload => Boolean(row));
};

const fetchFacebookPosts = async (
  account: SocialAccount
): Promise<MetaPostPayload[]> => {
  const payload = await fetchMetaJson<{
    data?: Array<Record<string, unknown>>;
  }>(account, `${getFacebookPageId(account)}/posts`, {
    fields:
      'id,message,created_time,permalink_url,full_picture,attachments,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)',
    limit: String(Math.max(1, SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT)),
  });

  return (payload.data ?? [])
    .map((row) => buildRawPost(account, row))
    .filter((row): row is MetaPostPayload => Boolean(row));
};

const selectPostsForIncrementalSync = (
  posts: MetaPostPayload[],
  existingProfile: SocialAccountIntelligenceProfile | null
) => {
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
  const recentMetricsRefresh = posts.slice(
    0,
    Math.min(8, SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT)
  );
  const selectedById = new Map<string, MetaPostPayload>();

  [...newPosts, ...recentMetricsRefresh].forEach((post) => {
    selectedById.set(post.externalPostId, post);
  });

  return [...selectedById.values()];
};

const getWordCounts = (captions: string[]) => {
  const counts = new Map<string, number>();
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

const inferHookStyles = (captions: string[]) => {
  const styles = new Map<string, number>();
  captions.forEach((caption) => {
    const opening = caption.trim().split(/\n|[.!?]/)[0]?.trim() ?? '';
    const style =
      opening.includes('?')
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

const inferCtaStyles = (captions: string[]) => {
  const counts = new Map<string, number>();
  captions.forEach((caption) => {
    const normalized = caption.toLowerCase();
    const matches = [
      [/\b(comment|tell us|reply)\b/, 'comment invitation'],
      [/\b(save|bookmark)\b/, 'save prompt'],
      [/\b(share|send this)\b/, 'share prompt'],
      [/\b(shop|buy|order|link in bio|dm us)\b/, 'conversion CTA'],
      [/\b(follow|stay tuned)\b/, 'follow CTA'],
    ] as const;
    const match = matches.find(([pattern]) => pattern.test(normalized));
    const style = match?.[1] ?? 'soft or no CTA';
    counts.set(style, (counts.get(style) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([style]) => style);
};

const scorePost = (post: SocialAccountPostRaw) => {
  const denominator = Math.max(post.reachCount || post.impressionsCount, 1);
  const likeOrReactionSignal =
    post.platform === 'facebook'
      ? Math.max(post.reactionCount, post.likeCount)
      : post.likeCount;
  const weightedResponse =
    likeOrReactionSignal +
    post.commentsCount * 2 +
    post.saveCount * 3 +
    post.shareCount * 4;
  return weightedResponse / denominator;
};

const buildFallbackVisualDna = (posts: SocialAccountPostRaw[]): VisualDna => {
  const visualPosts = posts.filter((post) => post.mediaUrl || post.thumbnailUrl);
  const formats = new Map<string, number>();
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
    consistency:
      visualPosts.length >= 6
        ? 'There is enough recent media to guide visual consistency.'
        : 'Visual consistency is still forming.',
    source: 'stored media metadata',
  };
};

const visualDnaSchema = z.object({
  composition: z.string().max(180),
  background: z.string().max(180),
  colorMood: z.string().max(180),
  framing: z.string().max(180),
  textUsage: z.string().max(180),
  consistency: z.string().max(180),
});

const analyzeVisualDna = async (
  posts: SocialAccountPostRaw[]
): Promise<{ visualDna: VisualDna; assetsAnalyzed: number }> => {
  const apiKey = process.env.GEMINI_API_KEY;
  const candidates = posts
    .map((post) => post.thumbnailUrl || post.mediaUrl)
    .filter((value): value is string => Boolean(value))
    .slice(0, Math.min(SOCIAL_ACCOUNT_INTELLIGENCE_VISUAL_SAMPLE_LIMIT, 8));

  if (!apiKey || !candidates.length) {
    return {
      visualDna: buildFallbackVisualDna(posts),
      assetsAnalyzed: 0,
    };
  }

  const inlineParts: Array<Record<string, unknown>> = [];
  for (const imageUrl of candidates) {
    try {
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(8_000),
      });
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (
        !response.ok ||
        !contentType?.startsWith('image/') ||
        contentLength > 3 * 1024 * 1024
      ) {
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
    } catch {
      // Public Meta media URLs can expire between fetch and analysis.
    }
  }

  if (!inlineParts.length) {
    return {
      visualDna: buildFallbackVisualDna(posts),
      assetsAnalyzed: 0,
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
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
    }
  );

  if (!response.ok) {
    throw new Error(`Visual analysis failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
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

const deriveIntelligence = async (
  profile: MetaProfilePayload,
  posts: SocialAccountPostRaw[]
): Promise<{ intelligence: DerivedIntelligence; visualAssetsAnalyzed: number }> => {
  const captions = posts
    .map((post) => post.captionText?.trim())
    .filter((caption): caption is string => Boolean(caption));
  const repeatedKeywords = getWordCounts(captions);
  const hookStyles = inferHookStyles(captions);
  const ctaStyles = inferCtaStyles(captions);
  const captionLengths = captions.map((caption) => caption.length);
  const averageCaptionLength = captionLengths.length
    ? captionLengths.reduce((total, value) => total + value, 0) / captionLengths.length
    : 0;
  const captionLengthPattern =
    averageCaptionLength === 0
      ? null
      : averageCaptionLength < 140
        ? 'short'
        : averageCaptionLength < 500
          ? 'medium'
          : 'long';
  const emojiCount = captions.reduce(
    (total, caption) =>
      total + (caption.match(/\p{Extended_Pictographic}/gu)?.length ?? 0),
    0
  );
  const hashtagCount = captions.reduce(
    (total, caption) => total + (caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0),
    0
  );
  const formatMix = posts.reduce<Record<string, number>>((result, post) => {
    const format = post.normalizedFormat ?? 'other';
    result[format] = (result[format] ?? 0) + 1;
    return result;
  }, {});
  const publishDays = posts.reduce<Record<string, number>>((result, post) => {
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
  const sortedByPerformance = [...posts].sort(
    (left, right) => scorePost(right) - scorePost(left)
  );
  const positivePosts = sortedByPerformance.filter((post) => scorePost(post) > 0);
  const bestPatterns = positivePosts.slice(0, 3).map((post) => ({
    format: post.normalizedFormat ?? 'other',
    hook: inferHookStyles(post.captionText ? [post.captionText] : [])[0] ?? 'not detected',
    responseScore: Number(scorePost(post).toFixed(6)),
    postId: post.externalPostId,
  }));
  const bestPostIds = new Set(bestPatterns.map((pattern) => pattern.postId));
  const weakPatterns =
    positivePosts.length >= 4
      ? positivePosts
          .slice()
          .reverse()
          .filter((post) => !bestPostIds.has(post.externalPostId))
          .slice(0, 3)
          .map((post) => ({
            format: post.normalizedFormat ?? 'other',
            hook:
              inferHookStyles(post.captionText ? [post.captionText] : [])[0] ??
              'not detected',
            responseScore: Number(scorePost(post).toFixed(6)),
            postId: post.externalPostId,
          }))
      : [];
  const { visualDna, assetsAnalyzed } = await analyzeVisualDna(posts).catch(
    (error) => {
      console.warn('[account-intelligence] visual analysis skipped', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        visualDna: buildFallbackVisualDna(posts),
        assetsAnalyzed: 0,
      };
    }
  );
  const accountTone =
    hookStyles.includes('educational')
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
      emojiStyle:
        captions.length === 0
          ? null
          : emojiCount / captions.length >= 3
            ? 'emoji-rich'
            : emojiCount > 0
              ? 'light emoji use'
              : 'minimal emoji use',
      hashtagBehavior:
        captions.length === 0
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
        averageResponseScore:
          posts.length > 0
            ? Number(
                (
                  posts.reduce((total, post) => total + scorePost(post), 0) /
                  posts.length
                ).toFixed(6)
              )
            : 0,
        followersCount: profile.followersCount,
        mediaCount: profile.mediaCount,
      },
    },
    visualAssetsAnalyzed: assetsAnalyzed,
  };
};

const normalizeFailureKind = (error: unknown) => {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 401) return 'authentication_expired';
  if (statusCode === 403) return 'permission_missing';
  if (statusCode === 429) return 'rate_limited';
  if (typeof statusCode === 'number' && statusCode >= 500) return 'meta_unavailable';
  if (isRetryableError(error)) return 'temporary_network_failure';
  return 'unexpected_failure';
};

const loadAccountForSync = async (
  client: AppSupabaseClient,
  userId: string,
  socialAccountId: string
) => {
  const account = await getSocialAccountById(client, userId, socialAccountId);
  if (!account || account.verificationStatus !== 'verified') {
    throw new Error('The connected account is missing or is no longer verified.');
  }
  const platform = normalizePlatform(account.platform);
  if (!isSupportedPlatform(platform)) {
    throw new Error('Connected account intelligence only supports Instagram and Facebook.');
  }
  return account;
};

export const syncSocialAccountIntelligence = async (
  client: AppSupabaseClient,
  input: {
    userId: string;
    socialAccountId: string;
    triggerSource: string;
    runId?: string;
  }
) => {
  const account = await loadAccountForSync(
    client,
    input.userId,
    input.socialAccountId
  );
  const existingProfile =
    await getSocialAccountIntelligenceProfileBySocialAccountId(
      client,
      account.id
    );
  const run =
    input.runId
      ? await updateSocialAccountSyncRun(client, input.runId, {
          status: 'running',
          startedAt: nowIso(),
          checkpointPostId: existingProfile?.lastPostId ?? null,
          checkpointPostedAt: existingProfile?.lastPostTimestamp ?? null,
        })
      : await createSocialAccountSyncRun(client, {
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
  logOperationalEvent('Connected account intelligence sync started', {
    userId: account.userId,
    socialAccountId: account.id,
    platform: account.platform,
    queue: QUEUE_NAMES.socialAccountIntelligence,
    syncRunId: run.id,
    triggerSource: input.triggerSource,
  });

  try {
    const profile =
      account.platform === 'instagram'
        ? await fetchInstagramProfile(account)
        : await fetchFacebookProfile(account);
    const fetchedPostCandidates =
      account.platform === 'instagram'
        ? await fetchInstagramPosts(account)
        : await fetchFacebookPosts(account);
    const fetchedPostsWithoutInsights = selectPostsForIncrementalSync(
      fetchedPostCandidates,
      existingProfile
    );
    const fetchedPosts = await enrichPostsWithInsights(
      account,
      fetchedPostsWithoutInsights
    );
    await createSocialAccountProfileSnapshot(client, {
      userId: account.userId,
      socialAccountId: account.id,
      syncRunId: run.id,
      platform: account.platform,
      ...profile,
      fetchedAt: nowIso(),
    });

    const storedPosts: SocialAccountPostRaw[] = [];
    let insightRowsCount = 0;
    for (const post of fetchedPosts) {
      const storedPost = await upsertSocialAccountPostRaw(client, post);
      storedPosts.push(storedPost);
      await createSocialAccountPostInsight(client, {
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

    const recentPosts = await listRecentSocialAccountPosts(
      client,
      account.id,
      SOCIAL_ACCOUNT_INTELLIGENCE_INITIAL_POST_LIMIT
    );
    const { intelligence, visualAssetsAnalyzed } = await deriveIntelligence(
      profile,
      recentPosts
    );
    const newestPost = recentPosts[0] ?? null;
    const oldestPost = recentPosts[recentPosts.length - 1] ?? null;
    const syncedAt = nowIso();
    const intelligenceProfile = await upsertSocialAccountIntelligenceProfile(
      client,
      {
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
      }
    );

    await syncConnectedAccountIntelligenceSemanticMemory(
      client,
      intelligenceProfile
    ).catch((error: unknown) => {
      logFailure('Connected account memory indexing failed', error, {
        userId: account.userId,
        socialAccountId: account.id,
        platform: account.platform,
      }, 'warn');
    });

    await updateSocialAccountSyncRun(client, run.id, {
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

    logOperationalEvent('Connected account intelligence sync completed', {
      userId: account.userId,
      socialAccountId: account.id,
      platform: account.platform,
      queue: QUEUE_NAMES.socialAccountIntelligence,
      syncRunId: run.id,
      fetchedPostCandidates: fetchedPostCandidates.length,
      refreshedPosts: fetchedPosts.length,
      storedPosts: recentPosts.length,
      visualAssetsAnalyzed,
    });

    return intelligenceProfile;
  } catch (error) {
    const failureKind = normalizeFailureKind(error);
    await updateSocialAccountSyncRun(client, run.id, {
      status: 'failed',
      normalizedFailureKind: failureKind,
      errorMessage: error instanceof Error ? error.message : String(error),
      retryCount: syncRetryCounts.get(account.id) ?? 0,
      completedAt: nowIso(),
    }).catch(() => undefined);
    logFailure('Connected account intelligence sync failed', error, {
      userId: account.userId,
      socialAccountId: account.id,
      platform: account.platform,
      queue: QUEUE_NAMES.socialAccountIntelligence,
      syncRunId: run.id,
      failureKind,
    });
    recordFailureSpikeSignal('connected_account_intelligence_sync_failed', {
      queue: QUEUE_NAMES.socialAccountIntelligence,
      provider: 'meta',
      platform: account.platform,
    });
    throw error;
  } finally {
    syncRetryCounts.delete(account.id);
  }
};

const getIntelligenceQueue = () => {
  if (!intelligenceQueue) {
    intelligenceQueue = new Queue<AccountIntelligenceJobData>(
      QUEUE_NAMES.socialAccountIntelligence,
      getBullMqConfig('prixmoai:queue:social-account-intelligence')
    );
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
  if (ANALYTICS_WORKER_IDLE_SHUTDOWN_MS <= 0 || !intelligenceWorker) {
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
  }, ANALYTICS_WORKER_IDLE_SHUTDOWN_MS);
  intelligenceWorkerIdleTimer.unref?.();
};

export const enqueueSocialAccountIntelligenceSync = async (input: {
  userId: string;
  socialAccountId: string;
  triggerSource: string;
  force?: boolean;
}) => {
  const client = requireSupabaseAdmin();
  const activeRun = await findActiveSocialAccountSyncRun(
    client,
    input.socialAccountId
  );
  if (activeRun && !input.force) {
    logOperationalEvent('Connected account intelligence sync skipped', {
      userId: input.userId,
      socialAccountId: input.socialAccountId,
      queue: QUEUE_NAMES.socialAccountIntelligence,
      reason: 'A sync is already queued or running.',
      syncRunId: activeRun.id,
    });
    return { queued: false, runId: activeRun.id };
  }

  const account = await loadAccountForSync(
    client,
    input.userId,
    input.socialAccountId
  );
  let run;
  let createdRun = true;
  try {
    run = await createSocialAccountSyncRun(client, {
      userId: input.userId,
      socialAccountId: input.socialAccountId,
      platform: account.platform,
      triggerSource: input.triggerSource,
      status: 'queued',
    });
  } catch (error) {
    const concurrentRun = await findActiveSocialAccountSyncRun(
      client,
      input.socialAccountId
    );
    if (!concurrentRun) {
      throw error;
    }
    run = concurrentRun;
    createdRun = false;
  }

  if (!createdRun) {
    logOperationalEvent('Connected account intelligence sync skipped', {
      userId: input.userId,
      socialAccountId: input.socialAccountId,
      queue: QUEUE_NAMES.socialAccountIntelligence,
      reason: 'Another request queued this account first.',
      syncRunId: run.id,
    });
    return { queued: false, runId: run.id };
  }

  if (!isRedisConfigured) {
    void syncSocialAccountIntelligence(client, {
      ...input,
      runId: run.id,
    }).catch(async (error) => {
      await updateSocialAccountSyncRun(client, run.id, {
        status: 'failed',
        normalizedFailureKind: normalizeFailureKind(error),
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: nowIso(),
      }).catch(() => undefined);
    });
    return { queued: true, runId: run.id, mode: 'in-process' as const };
  }

  try {
    await getIntelligenceQueue().add(
      'sync-account',
      { jobType: 'sync-account', ...input, runId: run.id },
      {
        jobId: `account-intelligence-${input.socialAccountId}-${run.id}`,
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60, count: 200 },
        attempts: 1,
      }
    );
  } catch (error) {
    await updateSocialAccountSyncRun(client, run.id, {
      status: 'failed',
      normalizedFailureKind: 'queue_unavailable',
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: nowIso(),
    }).catch(() => undefined);
    throw error;
  }
  logOperationalEvent('Connected account intelligence sync queued', {
    userId: input.userId,
    socialAccountId: input.socialAccountId,
    platform: account.platform,
    queue: QUEUE_NAMES.socialAccountIntelligence,
    syncRunId: run.id,
    triggerSource: input.triggerSource,
  });
  startSocialAccountIntelligenceWorker();
  return { queued: true, runId: run.id, mode: 'queue' as const };
};

const processSweep = async (job: Job<AccountIntelligenceJobData>) => {
  const client = requireSupabaseAdmin();
  const dueProfiles = await listDueSocialAccountIntelligenceProfiles(client, 100);
  let queued = 0;
  let skipped = 0;
  for (const profile of dueProfiles) {
    try {
      const result = await enqueueSocialAccountIntelligenceSync({
        userId: profile.userId,
        socialAccountId: profile.socialAccountId,
        triggerSource: 'daily-sweep',
      });
      result.queued ? (queued += 1) : (skipped += 1);
    } catch (error) {
      skipped += 1;
      logFailure('Connected account daily refresh enqueue failed', error, {
        userId: profile.userId,
        socialAccountId: profile.socialAccountId,
        platform: profile.platform,
        jobId: job.id,
      }, 'warn');
    }
  }
  logOperationalEvent('Connected account daily refresh sweep completed', {
    queue: QUEUE_NAMES.socialAccountIntelligence,
    dueAccounts: dueProfiles.length,
    queued,
    skipped,
  });
  return { dueAccounts: dueProfiles.length, queued, skipped };
};

export const startSocialAccountIntelligenceWorker = () => {
  if (
    !isSupabaseAdminConfigured ||
    !isMetaOAuthConfigured ||
    !isRedisConfigured
  ) {
    return;
  }
  if (intelligenceWorker) {
    clearWorkerIdleTimer();
    return;
  }

  intelligenceWorker = new Worker<AccountIntelligenceJobData>(
    QUEUE_NAMES.socialAccountIntelligence,
    async (job) => {
      if (job.data.jobType === 'daily-sweep') {
        return processSweep(job);
      }
      const client = requireSupabaseAdmin();
      return syncSocialAccountIntelligence(client, {
        userId: job.data.userId,
        socialAccountId: job.data.socialAccountId,
        triggerSource: job.data.triggerSource,
        runId: job.data.runId,
      });
    },
    {
      ...getBullMqConfig('prixmoai:worker:social-account-intelligence'),
      ...getLowCommandWorkerOptions(),
      concurrency: Math.max(1, SOCIAL_ACCOUNT_INTELLIGENCE_JOB_CONCURRENCY),
    }
  );
  intelligenceWorker.on('active', clearWorkerIdleTimer);
  intelligenceWorker.on('drained', scheduleWorkerIdleShutdown);
  intelligenceWorker.on('failed', (job, error) => {
    if (job?.data.jobType === 'sync-account' && job.data.runId) {
      void updateSocialAccountSyncRun(
        requireSupabaseAdmin(),
        job.data.runId,
        {
          status: 'failed',
          normalizedFailureKind: normalizeFailureKind(error),
          errorMessage: error.message,
          completedAt: nowIso(),
        }
      ).catch(() => undefined);
    }
    logFailure('Connected account intelligence worker failed', error, {
      jobId: job?.id ?? null,
      userId:
        job?.data.jobType === 'sync-account' ? job.data.userId : null,
      socialAccountId:
        job?.data.jobType === 'sync-account' ? job.data.socialAccountId : null,
      queue: QUEUE_NAMES.socialAccountIntelligence,
    });
  });
  console.log('[account-intelligence] Worker started. Waiting for sync jobs.');
};

export const ensureSocialAccountIntelligenceSweep = async () => {
  if (!isRedisConfigured) {
    return;
  }
  await getIntelligenceQueue().add(
    'daily-sweep',
    { jobType: 'daily-sweep', triggerSource: 'scheduled-sweep' },
    {
      jobId: SWEEP_JOB_ID,
      repeat: {
        every: Math.max(5 * 60_000, SOCIAL_ACCOUNT_INTELLIGENCE_SWEEP_INTERVAL_MS),
      },
      removeOnComplete: true,
      removeOnFail: { age: 24 * 60 * 60, count: 50 },
    }
  );
  startSocialAccountIntelligenceWorker();
};

export const handleVerifiedSocialAccountConnected = async (
  userId: string,
  account: SocialAccount
) => {
  if (account.verificationStatus !== 'verified') {
    return account;
  }
  const platform = normalizePlatform(account.platform);
  if (!isSupportedPlatform(platform)) {
    return account;
  }
  const client = requireSupabaseAdmin();
  const primary = await setPrimarySocialAccountForPlatform(
    client,
    userId,
    account.platform,
    account.id
  );
  logOperationalEvent('Connected account saved as primary', {
    userId,
    socialAccountId: primary.id,
    platform: primary.platform,
  });
  await enqueueSocialAccountIntelligenceSync({
    userId,
    socialAccountId: primary.id,
    triggerSource: 'account-connected',
  }).catch((error) => {
    logFailure('Connected account intelligence enqueue failed', error, {
      userId,
      socialAccountId: primary.id,
      platform: primary.platform,
      queue: QUEUE_NAMES.socialAccountIntelligence,
    }, 'warn');
  });
  return primary;
};

export const prepareConnectedAccountIntelligenceForGeneration = async (
  client: AppSupabaseClient,
  userId: string,
  platform: string | null | undefined
): Promise<SocialAccountIntelligenceProfile | null> => {
  const normalizedPlatform = normalizePlatform(platform);
  if (!isSupportedPlatform(normalizedPlatform)) {
    return null;
  }
  const account = await getPrimarySocialAccountByUserAndPlatform(
    client,
    userId,
    normalizedPlatform
  );
  if (!account) {
    logOperationalEvent('Connected account intelligence not available', {
      userId,
      platform: normalizedPlatform,
      reason: 'No verified primary account is connected.',
    });
    return null;
  }
  const profile = await getSocialAccountIntelligenceProfileBySocialAccountId(
    client,
    account.id
  );
  const stale =
    !profile?.lastSyncedAt ||
    Date.now() - new Date(profile.lastSyncedAt).getTime() >=
      SOCIAL_ACCOUNT_INTELLIGENCE_STALE_MS;
  logOperationalEvent('Connected account intelligence checked for generation', {
    userId,
    socialAccountId: account.id,
    platform: normalizedPlatform,
    intelligenceFound: Boolean(profile),
    stale,
  });
  if (stale) {
    void enqueueSocialAccountIntelligenceSync({
      userId,
      socialAccountId: account.id,
      triggerSource: profile ? 'stale-generation-lookup' : 'missing-generation-lookup',
    }).catch((error) => {
      logFailure('Connected account silent refresh enqueue failed', error, {
        userId,
        socialAccountId: account.id,
        platform: normalizedPlatform,
      }, 'warn');
    });
  }
  return profile;
};
