import {
  ANALYTICS_SYNC_BATCH_SIZE,
  ANALYTICS_SYNC_LOOKBACK_DAYS,
  ANALYTICS_SYNC_POLL_MS,
  META_GRAPH_VERSION,
  META_OAUTH_DEBUG,
  isMetaOAuthConfigured,
} from '../config/constants';
import {
  saveAnalyticsAudienceSnapshot,
  saveAnalyticsData,
} from '../db/queries/analytics';
import {
  isSupabaseAdminConfigured,
  requireSupabaseAdmin,
  type AppSupabaseClient,
} from '../db/supabase';
import type {
  AnalyticsAudienceBreakdownItem,
  CreateAnalyticsAudienceSnapshotInput,
  CreateAnalyticsInput,
  SchedulerMediaType,
} from '../types';

type SyncSocialAccountRow = {
  id: string;
  user_id: string;
  platform: string;
  account_id: string;
  account_name: string | null;
  profile_url: string | null;
  oauth_provider: string | null;
  verification_status: string;
  verified_at: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown> | null;
  connected_at: string;
  created_at: string;
  updated_at: string;
};

type SyncScheduledPostRow = {
  id: string;
  user_id: string;
  social_account_id: string;
  content_id: string | null;
  platform: string | null;
  caption: string | null;
  media_url: string | null;
  media_type?: SchedulerMediaType | null;
  status: string;
  external_post_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type SyncSocialAccount = {
  id: string;
  userId: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  profileUrl: string | null;
  oauthProvider: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
};

type SyncScheduledPost = {
  id: string;
  userId: string;
  socialAccountId: string;
  contentId: string | null;
  platform: string | null;
  caption: string | null;
  mediaUrl: string | null;
  mediaType: SchedulerMediaType | null;
  status: string;
  externalPostId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type GraphInsightResponse = {
  data?: Array<{
    name?: string;
    value?: unknown;
    total_value?: unknown;
    values?: Array<{
      value?: unknown;
      end_time?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type GraphInsightItem = NonNullable<GraphInsightResponse['data']>[number];

type AnalyticsSyncSummary = {
  postsDiscovered: number;
  postsSynced: number;
  audienceSnapshotsSynced: number;
  accountsScanned: number;
  errors: string[];
};

type SyncAnalyticsOptions = {
  lookbackDays?: number;
  postIds?: string[];
  socialAccountIds?: string[];
};

const GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com';
const SYNC_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

let syncHandle: NodeJS.Timeout | null = null;
let isSyncTickRunning = false;

const inferMediaTypeFromUrl = (
  value: string | null | undefined
): SchedulerMediaType | null => {
  const normalized = (value || '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('.mp4') ||
    normalized.includes('.mov') ||
    normalized.includes('video/')
  ) {
    return 'video';
  }

  if (
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.png') ||
    normalized.includes('.webp') ||
    normalized.includes('image/')
  ) {
    return 'image';
  }

  return null;
};

const normalizePlatform = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'instagram' || normalized === 'facebook' ? normalized : null;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const readMetadata = (value: unknown) => toRecord(value);

const toSyncSocialAccount = (row: SyncSocialAccountRow): SyncSocialAccount => ({
  id: row.id,
  userId: row.user_id,
  platform: row.platform,
  accountId: row.account_id,
  accountName: row.account_name,
  profileUrl: row.profile_url,
  oauthProvider: row.oauth_provider,
  verificationStatus: row.verification_status,
  verifiedAt: row.verified_at,
  accessToken: row.access_token,
  refreshToken: row.refresh_token,
  tokenExpiresAt: row.token_expires_at,
  metadata: readMetadata(row.metadata),
});

const toSyncScheduledPost = (row: SyncScheduledPostRow): SyncScheduledPost => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  contentId: row.content_id,
  platform: row.platform,
  caption: row.caption,
  mediaUrl: row.media_url,
  mediaType: row.media_type ?? inferMediaTypeFromUrl(row.media_url),
  status: row.status,
  externalPostId: row.external_post_id,
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const sumRecordValues = (value: unknown): number =>
  Object.values(toRecord(value)).reduce<number>(
    (total, entry) => total + toNumber(entry),
    0
  );

const toTopCommentList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          const record = toRecord(entry);
          if (typeof record.message === 'string' && record.message.trim()) {
            return record.message.trim();
          }
          if (typeof record.text === 'string' && record.text.trim()) {
            return record.text.trim();
          }
          return null;
        })
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 5)
    : [];

const toBreakdownItems = (value: unknown): AnalyticsAudienceBreakdownItem[] =>
  Object.entries(toRecord(value))
    .map(([label, rawValue]) => ({
      label,
      value: toNumber(rawValue),
    }))
    .filter((entry) => entry.label.trim().length > 0 && entry.value > 0)
    .sort((left, right) => right.value - left.value);

const splitAgeGenderBreakdown = (value: unknown) => {
  const ageMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  const combinedMap = new Map<string, number>();

  for (const [rawKey, rawValue] of Object.entries(toRecord(value))) {
    const key = rawKey.trim();
    const numericValue = toNumber(rawValue);

    if (!key || numericValue <= 0) {
      continue;
    }

    combinedMap.set(key, (combinedMap.get(key) ?? 0) + numericValue);

    const match = key.match(/^([A-Za-z]+)[._](.+)$/);
    if (!match) {
      continue;
    }

    const genderCode = match[1].toUpperCase();
    const ageLabel = match[2].replace(/_/g, ' ').trim();
    const genderLabel =
      genderCode === 'F'
        ? 'Women'
        : genderCode === 'M'
          ? 'Men'
          : genderCode === 'U'
            ? 'Unknown'
            : genderCode;

    ageMap.set(ageLabel, (ageMap.get(ageLabel) ?? 0) + numericValue);
    genderMap.set(genderLabel, (genderMap.get(genderLabel) ?? 0) + numericValue);
  }

  const toItems = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([label, numericValue]) => ({ label, value: numericValue }))
      .sort((left, right) => right.value - left.value);

  return {
    ageDistribution: toItems(ageMap),
    genderDistribution: toItems(genderMap),
    combined: toItems(combinedMap),
  };
};

const expandHoursAcrossDays = (hours: number[]) =>
  Object.fromEntries(
    SYNC_DAY_LABELS.flatMap((day) =>
      hours.map((value, hour) => [`${day}-${hour}`, value] as const)
    )
  );

const normalizeDayLabel = (value: string) => {
  const normalized = value.trim().slice(0, 3).toLowerCase();
  const match = SYNC_DAY_LABELS.find(
    (label) => label.toLowerCase() === normalized
  );

  return match ?? null;
};

const toActiveHoursMap = (value: unknown): Record<string, number> => {
  if (Array.isArray(value)) {
    const normalizedHours = value.map((entry) => toNumber(entry));
    return normalizedHours.length === 24 ? expandHoursAcrossDays(normalizedHours) : {};
  }

  const record = toRecord(value);
  const entries = Object.entries(record);

  if (!entries.length) {
    return {};
  }

  const firstEntryValue = entries[0]?.[1];

  if (Array.isArray(firstEntryValue)) {
    return Object.fromEntries(
      entries.flatMap(([rawDay, rawHours]) => {
        const day = normalizeDayLabel(rawDay);
        if (!day || !Array.isArray(rawHours)) {
          return [];
        }

        return rawHours.map((entry, hour) => [`${day}-${hour}`, toNumber(entry)] as const);
      })
    );
  }

  const looksHourly = entries.every(([key]) => /^\d{1,2}$/.test(key));
  if (looksHourly) {
    const hours = Array.from({ length: 24 }, (_, hour) =>
      toNumber(record[String(hour)] ?? record[String(hour).padStart(2, '0')])
    );
    return expandHoursAcrossDays(hours);
  }

  return Object.fromEntries(
    entries.map(([key, rawValue]) => [key, toNumber(rawValue)])
  );
};

const toIsoString = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const buildQueryString = (
  params: Record<string, string | number | boolean | undefined | null>
) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    search.set(key, String(value));
  }

  return search;
};

const fetchGraphJson = async <T>(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null>
) => {
  const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path}`);
  const search = buildQueryString(params);
  const serialized = search.toString();

  if (serialized) {
    url.search = serialized;
  }

  const response = await fetch(url);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };

  if (!response.ok || payload.error?.message) {
    throw new Error(payload.error?.message || 'Meta analytics request failed.');
  }

  return payload as T;
};

const metaGraphFetch = <T>(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>
) => fetchGraphJson<T>(GRAPH_BASE_URL, path, params);

const instagramGraphFetch = <T>(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>
) => fetchGraphJson<T>(INSTAGRAM_GRAPH_BASE_URL, path, params);

const extractGraphInsightValue = (insight: GraphInsightItem | null) => {
  if (!insight) {
    return undefined;
  }

  const values = Array.isArray(insight.values) ? insight.values : [];
  const firstDefinedValue = values.find((entry) => entry?.value !== undefined)?.value;

  if (firstDefinedValue !== undefined) {
    return firstDefinedValue;
  }

  if (insight.value !== undefined) {
    return insight.value;
  }

  const totalValue = toRecord(insight.total_value);

  if (totalValue.value !== undefined) {
    return totalValue.value;
  }

  if (insight.total_value !== undefined) {
    return insight.total_value;
  }

  return undefined;
};

const fetchInsightMetrics = async (
  fetcher: <T>(
    path: string,
    params: Record<string, string | number | boolean | undefined | null>
  ) => Promise<T>,
  path: string,
  accessToken: string,
  metrics: string[],
  extraParams: Record<string, string | number | boolean | undefined | null> = {}
) => {
  const values: Record<string, unknown> = {};
  const rawResponses: Partial<Record<string, GraphInsightResponse>> = {};
  const errors: Partial<Record<string, string>> = {};

  for (const metric of metrics) {
    try {
      const response = await fetcher<GraphInsightResponse>(`${path}/insights`, {
        access_token: accessToken,
        metric,
        ...extraParams,
      });
      rawResponses[metric] = response;
      const insight = Array.isArray(response.data) ? response.data[0] : null;
      const latestValue = extractGraphInsightValue(insight);

      if (latestValue !== undefined) {
        values[metric] = latestValue;
      }
    } catch (error) {
      errors[metric] =
        error instanceof Error ? error.message : 'Meta analytics request failed.';
      continue;
    }
  }

  return {
    values,
    rawResponses,
    errors,
  };
};

const getInstagramFetcher = (account: SyncSocialAccount) => {
  const metadata = readMetadata(account.metadata);
  const loginType =
    typeof metadata.instagramLoginType === 'string'
      ? metadata.instagramLoginType
      : 'facebook_login';

  return loginType === 'instagram_business_login'
    ? instagramGraphFetch
    : metaGraphFetch;
};

const isDirectInstagramLogin = (account: SyncSocialAccount) => {
  const metadata = readMetadata(account.metadata);
  return metadata.instagramLoginType === 'instagram_business_login';
};

const getInstagramAnalyticsAccessToken = (account: SyncSocialAccount) => {
  const metadata = readMetadata(account.metadata);
  const loginType =
    typeof metadata.instagramLoginType === 'string'
      ? metadata.instagramLoginType
      : 'facebook_login';

  if (loginType === 'instagram_business_login') {
    return account.accessToken;
  }

  return account.refreshToken || account.accessToken;
};

const getAlternateInstagramFetcher = (
  account: SyncSocialAccount,
  primaryFetcher: typeof metaGraphFetch | typeof instagramGraphFetch
) =>
  isDirectInstagramLogin(account)
    ? null
    : primaryFetcher === instagramGraphFetch
      ? metaGraphFetch
      : instagramGraphFetch;

const getInstagramPostType = (
  mediaType: string | null | undefined,
  mediaProductType: string | null | undefined,
  fallbackMediaType: SchedulerMediaType | null
) => {
  const normalizedMediaType = mediaType?.trim().toUpperCase() || '';
  const normalizedProductType = mediaProductType?.trim().toUpperCase() || '';

  if (normalizedProductType === 'REELS' || normalizedMediaType === 'VIDEO') {
    return normalizedProductType === 'REELS' ? 'reel' : 'video';
  }

  if (normalizedMediaType === 'CAROUSEL_ALBUM') {
    return 'carousel';
  }

  if (normalizedMediaType === 'IMAGE' || fallbackMediaType === 'image') {
    return 'image';
  }

  return fallbackMediaType === 'video' ? 'video' : 'post';
};

const buildFallbackAnalyticsPayload = (
  account: SyncSocialAccount,
  post: SyncScheduledPost,
  nowIso: string
): CreateAnalyticsInput => ({
  scheduledPostId: post.id,
  contentId: post.contentId,
  platform: normalizePlatform(post.platform) ?? normalizePlatform(account.platform) ?? account.platform,
  postExternalId: post.externalPostId,
  postType:
    post.mediaType === 'video'
      ? normalizePlatform(account.platform) === 'instagram'
        ? 'reel'
        : 'video'
      : post.mediaType === 'image'
        ? 'image'
        : 'post',
  caption: post.caption,
  mediaUrl: post.mediaUrl,
  thumbnailUrl: post.mediaUrl,
  reach: 0,
  impressions: 0,
  likes: 0,
  comments: 0,
  saves: 0,
  shares: 0,
  reactions: 0,
  videoPlays: 0,
  replays: 0,
  exits: 0,
  profileVisits: 0,
  postClicks: 0,
  pageLikes: 0,
  completionRate: null,
  followersAtPostTime: null,
  engagementRate: null,
  publishedTime: post.publishedAt,
  topComments: [],
  recordedAt: nowIso,
});

const fetchInstagramPostAnalytics = async (
  account: SyncSocialAccount,
  post: SyncScheduledPost
): Promise<CreateAnalyticsInput> => {
  const metadata = readMetadata(account.metadata);
  const instagramAccountId =
    typeof metadata.metaInstagramAccountId === 'string'
      ? metadata.metaInstagramAccountId
      : null;
  const mediaId = post.externalPostId;
  const primaryFetcher = getInstagramFetcher(account);
  const fallbackFetcher = getAlternateInstagramFetcher(account, primaryFetcher);
  const analyticsAccessToken = getInstagramAnalyticsAccessToken(account);

  if (!instagramAccountId || !analyticsAccessToken || !mediaId) {
    return buildFallbackAnalyticsPayload(account, post, new Date().toISOString());
  }

  const media = await primaryFetcher<Record<string, unknown>>(`/${mediaId}`, {
    access_token: analyticsAccessToken,
    fields:
      'id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,like_count,comments_count',
  });
  const requestedInsightMetrics = [
    'impressions',
    'reach',
    'saved',
    'shares',
    'video_views',
    'plays',
    'replays',
    'exits',
    'total_interactions',
  ];
  const {
    values: primaryInsights,
    rawResponses: primaryInsightPayloads,
    errors: primaryInsightErrors,
  } = await fetchInsightMetrics(
    primaryFetcher,
    `/${mediaId}`,
    analyticsAccessToken,
    requestedInsightMetrics
  );
  const missingInsightMetrics = requestedInsightMetrics.filter(
    (metric) =>
      primaryInsights[metric] === undefined &&
      primaryInsightPayloads[metric] === undefined
  );
  const {
    values: fallbackInsights,
    rawResponses: fallbackInsightPayloads,
    errors: fallbackInsightErrors,
  } =
    missingInsightMetrics.length > 0 && fallbackFetcher
      ? await fetchInsightMetrics(
          fallbackFetcher,
          `/${mediaId}`,
          analyticsAccessToken,
          missingInsightMetrics
        )
      : { values: {}, rawResponses: {}, errors: {} };
  const insights = {
    ...primaryInsights,
    ...fallbackInsights,
  };
  const insightPayloads = {
    ...primaryInsightPayloads,
    ...fallbackInsightPayloads,
  };
  const insightErrors = {
    ...primaryInsightErrors,
    ...fallbackInsightErrors,
  };

  let topComments: string[] = [];

  try {
    const comments = await primaryFetcher<{ data?: unknown[] }>(`/${mediaId}/comments`, {
      access_token: analyticsAccessToken,
      fields: 'text,like_count,timestamp',
      limit: 5,
    });
    topComments = toTopCommentList(comments.data);
  } catch {
    topComments = [];
  }

  const likes = toNumber(media.like_count);
  const comments = toNumber(media.comments_count);
  const instagramPostType = getInstagramPostType(
    typeof media.media_type === 'string' ? media.media_type : null,
    typeof media.media_product_type === 'string' ? media.media_product_type : null,
    post.mediaType
  );
  const saves = toNumber(insights.saved);
  const shares = toNumber(insights.shares);
  const reach = toNumber(insights.reach);
  const totalInteractions = toNumber(insights.total_interactions);
  const hasSavedMetric =
    insights.saved !== undefined || insightPayloads.saved !== undefined;
  const hasShareMetric =
    insights.shares !== undefined || insightPayloads.shares !== undefined;
  const savedMetricUnavailable = !hasSavedMetric || insightErrors.saved !== undefined;
  const shareMetricUnavailable = !hasShareMetric || insightErrors.shares !== undefined;

  const derivedSaves =
    totalInteractions > 0 && savedMetricUnavailable && !shareMetricUnavailable
      ? Math.max(0, totalInteractions - likes - comments - shares)
      : 0;
  const shouldUseDerivedSaves = saves === 0 && derivedSaves > 0;
  const resolvedSaves = shouldUseDerivedSaves ? derivedSaves : saves;

  const derivedShares =
    totalInteractions > 0 && shareMetricUnavailable && !savedMetricUnavailable
      ? Math.max(0, totalInteractions - likes - comments - resolvedSaves)
      : 0;
  const shouldUseDerivedShares = shares === 0 && derivedShares > 0;
  const resolvedShares = shouldUseDerivedShares ? derivedShares : shares;
  const unresolvedInteractionGap = Math.max(
    0,
    totalInteractions - likes - comments - resolvedSaves - resolvedShares
  );
  const engagements = likes + comments + resolvedSaves + resolvedShares;

  if (
    META_OAUTH_DEBUG &&
    (instagramPostType === 'image' || instagramPostType === 'reel') &&
    resolvedSaves === 0
  ) {
    console.warn(
      `[analytics-sync] Instagram saves returned 0 for eligible media ${mediaId}`,
      {
        postId: post.id,
        platform: account.platform,
        mediaType: typeof media.media_type === 'string' ? media.media_type : null,
        mediaProductType:
          typeof media.media_product_type === 'string'
            ? media.media_product_type
            : null,
        insights,
        insightErrors,
        sharesInsightPayload: insightPayloads.shares ?? null,
        savedInsightPayload: insightPayloads.saved ?? null,
        totalInteractions,
        derivedSaves,
      }
    );
  }

  if (
    META_OAUTH_DEBUG &&
    shouldUseDerivedSaves
  ) {
    console.warn(
      `[analytics-sync] Instagram saves derived from total interactions for media ${mediaId}`,
      {
        postId: post.id,
        platform: account.platform,
        likes,
        comments,
        shares: resolvedShares,
        totalInteractions,
        derivedSaves,
        savedInsightPayload: insightPayloads.saved ?? null,
        savedInsightError: insightErrors.saved ?? null,
      }
    );
  }

  if (
    META_OAUTH_DEBUG &&
    (instagramPostType === 'image' || instagramPostType === 'reel') &&
    resolvedShares === 0
  ) {
    console.warn(
      `[analytics-sync] Instagram shares returned 0 for eligible media ${mediaId}`,
      {
        postId: post.id,
        platform: account.platform,
        mediaType: typeof media.media_type === 'string' ? media.media_type : null,
        mediaProductType:
          typeof media.media_product_type === 'string'
            ? media.media_product_type
            : null,
        insights,
        insightErrors,
        sharesInsightPayload: insightPayloads.shares ?? null,
        totalInteractions,
        derivedShares,
        unresolvedInteractionGap,
      }
    );
  }

  if (META_OAUTH_DEBUG && shouldUseDerivedShares) {
    console.warn(
      `[analytics-sync] Instagram shares derived from total interactions for media ${mediaId}`,
      {
        postId: post.id,
        platform: account.platform,
        likes,
        comments,
        saves: resolvedSaves,
        totalInteractions,
        derivedShares,
        sharesInsightPayload: insightPayloads.shares ?? null,
        sharesInsightError: insightErrors.shares ?? null,
      }
    );
  }

  if (
    META_OAUTH_DEBUG &&
    totalInteractions > 0 &&
    unresolvedInteractionGap > 0
  ) {
    console.warn(
      `[analytics-sync] Instagram total interactions did not reconcile cleanly for media ${mediaId}`,
      {
        postId: post.id,
        platform: account.platform,
        likes,
        comments,
        saves: resolvedSaves,
        shares: resolvedShares,
        totalInteractions,
        unresolvedInteractionGap,
        savedInsightPayload: insightPayloads.saved ?? null,
        sharesInsightPayload: insightPayloads.shares ?? null,
        insightErrors,
      }
    );
  }

  return {
    scheduledPostId: post.id,
    contentId: post.contentId,
    platform: 'instagram',
    postExternalId: String(media.id ?? mediaId),
    postType: instagramPostType,
    caption:
      typeof media.caption === 'string' && media.caption.trim()
        ? media.caption
        : post.caption,
    mediaUrl:
      typeof media.media_url === 'string' && media.media_url.trim()
        ? media.media_url
        : post.mediaUrl,
    thumbnailUrl:
      typeof media.thumbnail_url === 'string' && media.thumbnail_url.trim()
        ? media.thumbnail_url
        : typeof media.media_url === 'string' && media.media_url.trim()
          ? media.media_url
          : post.mediaUrl,
    reach,
    impressions: toNumber(insights.impressions),
    likes,
    comments,
    shares: resolvedShares,
    saves: resolvedSaves,
    reactions: 0,
    videoPlays: toNumber(insights.video_views ?? insights.plays),
    replays: toNumber(insights.replays),
    exits: toNumber(insights.exits),
    profileVisits: 0,
    postClicks: 0,
    pageLikes: 0,
    completionRate: null,
    followersAtPostTime: null,
    engagementRate:
      reach > 0 ? Number(((engagements / reach) * 100).toFixed(2)) : null,
    publishedTime: toIsoString(media.timestamp) ?? post.publishedAt,
    topComments,
    recordedAt: new Date().toISOString(),
  };
};

const extractFacebookAttachmentMedia = (value: unknown) => {
  const attachments = Array.isArray((toRecord(value).data))
    ? (toRecord(value).data as unknown[])
    : [];
  const firstAttachment = toRecord(attachments[0]);
  const media = toRecord(firstAttachment.media);
  const image = toRecord(media.image);
  const target = toRecord(firstAttachment.target);

  return {
    type:
      typeof firstAttachment.media_type === 'string'
        ? firstAttachment.media_type
        : typeof firstAttachment.type === 'string'
          ? firstAttachment.type
          : null,
    mediaUrl:
      typeof media.source === 'string'
        ? media.source
        : typeof image.src === 'string'
          ? image.src
          : typeof firstAttachment.unshimmed_url === 'string'
            ? firstAttachment.unshimmed_url
            : typeof firstAttachment.url === 'string'
              ? firstAttachment.url
              : null,
    thumbnailUrl:
      typeof image.src === 'string'
        ? image.src
        : typeof firstAttachment.picture === 'string'
          ? firstAttachment.picture
          : null,
    targetId:
      typeof target.id === 'string' ? target.id : null,
  };
};

const fetchFacebookPostAnalytics = async (
  account: SyncSocialAccount,
  post: SyncScheduledPost
): Promise<CreateAnalyticsInput> => {
  if (!account.accessToken || !post.externalPostId) {
    return buildFallbackAnalyticsPayload(account, post, new Date().toISOString());
  }

  if (post.mediaType === 'video') {
    const video = await metaGraphFetch<Record<string, unknown>>(`/${post.externalPostId}`, {
      access_token: account.accessToken,
      fields:
        'id,description,created_time,picture,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
    });
    const { values: insights } = await fetchInsightMetrics(
      metaGraphFetch,
      `/${post.externalPostId}`,
      account.accessToken,
      [
        'total_video_impressions',
        'total_video_impressions_unique',
        'total_video_views',
      ]
    );

    let topComments: string[] = [];
    try {
      const comments = await metaGraphFetch<{ data?: unknown[] }>(
        `/${post.externalPostId}/comments`,
        {
          access_token: account.accessToken,
          fields: 'message,like_count,created_time',
          limit: 5,
        }
      );
      topComments = toTopCommentList(comments.data);
    } catch {
      topComments = [];
    }

    const reactions = toNumber(
      toRecord(toRecord(video.reactions).summary).total_count
    );
    const comments = toNumber(
      toRecord(toRecord(video.comments).summary).total_count
    );
    const reach = toNumber(insights.total_video_impressions_unique);
    let shares = 0;

    try {
      const videoShareSnapshot = await metaGraphFetch<Record<string, unknown>>(
        `/${post.externalPostId}`,
        {
          access_token: account.accessToken,
          fields: 'shares',
        }
      );
      shares = toNumber(toRecord(videoShareSnapshot.shares).count);
    } catch {
      shares = 0;
    }

    return {
      scheduledPostId: post.id,
      contentId: post.contentId,
      platform: 'facebook',
      postExternalId: post.externalPostId,
      postType: 'video',
      caption:
        typeof video.description === 'string' && video.description.trim()
          ? video.description
          : post.caption,
      mediaUrl: post.mediaUrl,
      thumbnailUrl:
        typeof video.picture === 'string' && video.picture.trim()
          ? video.picture
          : post.mediaUrl,
      reach,
      impressions: toNumber(insights.total_video_impressions),
      likes: 0,
      comments,
      saves: 0,
      shares,
      reactions,
      videoPlays: toNumber(insights.total_video_views),
      replays: 0,
      exits: 0,
      profileVisits: 0,
      postClicks: 0,
      pageLikes: 0,
      completionRate: null,
      followersAtPostTime: null,
      engagementRate:
        reach > 0 ? Number((((comments + shares + reactions) / reach) * 100).toFixed(2)) : null,
      publishedTime: toIsoString(video.created_time) ?? post.publishedAt,
      topComments,
      recordedAt: new Date().toISOString(),
    };
  }

  const feedPost = await metaGraphFetch<Record<string, unknown>>(`/${post.externalPostId}`, {
    access_token: account.accessToken,
    fields:
      'id,message,created_time,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),attachments{media,target,url,unshimmed_url,media_type,type}',
  });
  const { values: insights } = await fetchInsightMetrics(
    metaGraphFetch,
    `/${post.externalPostId}`,
    account.accessToken,
    [
      'post_impressions',
      'post_impressions_unique',
      'post_clicks',
      'post_reactions_by_type_total',
      'post_activity_by_action_type',
      'post_video_views',
    ]
  );

  let topComments: string[] = [];
  try {
    const comments = await metaGraphFetch<{ data?: unknown[] }>(
      `/${post.externalPostId}/comments`,
      {
        access_token: account.accessToken,
        fields: 'message,like_count,created_time',
        limit: 5,
      }
    );
    topComments = toTopCommentList(comments.data);
  } catch {
    topComments = [];
  }

  const attachmentMedia = extractFacebookAttachmentMedia(feedPost.attachments);
  const actionBreakdown = toRecord(insights.post_activity_by_action_type);
  const reactionsByType = toRecord(insights.post_reactions_by_type_total);
  const likes =
    toNumber(actionBreakdown.like) ||
    toNumber(actionBreakdown.likes) ||
    0;
  const comments = toNumber(
    toRecord(toRecord(feedPost.comments).summary).total_count
  );
  const reactions =
    sumRecordValues(reactionsByType) ||
    toNumber(toRecord(toRecord(feedPost.reactions).summary).total_count);
  const shares =
    toNumber(toRecord(feedPost.shares).count) ||
    toNumber(actionBreakdown.share) ||
    toNumber(actionBreakdown.shares);
  const saves = toNumber(actionBreakdown.save) || toNumber(actionBreakdown.saved);
  const reach = toNumber(insights.post_impressions_unique);
  const engagements = likes + comments + saves + shares + reactions;

  return {
    scheduledPostId: post.id,
    contentId: post.contentId,
    platform: 'facebook',
    postExternalId: post.externalPostId,
    postType:
      attachmentMedia.type?.toLowerCase().includes('video')
        ? 'video'
        : 'image',
    caption:
      typeof feedPost.message === 'string' && feedPost.message.trim()
        ? feedPost.message
        : post.caption,
    mediaUrl:
      attachmentMedia.mediaUrl ||
      (typeof feedPost.full_picture === 'string' ? feedPost.full_picture : post.mediaUrl),
    thumbnailUrl:
      attachmentMedia.thumbnailUrl ||
      (typeof feedPost.full_picture === 'string' ? feedPost.full_picture : post.mediaUrl),
    reach,
    impressions: toNumber(insights.post_impressions),
    likes,
    comments,
    saves,
    shares,
    reactions,
    videoPlays: toNumber(insights.post_video_views),
    replays: 0,
    exits: 0,
    profileVisits: 0,
    postClicks: toNumber(insights.post_clicks),
    pageLikes: 0,
    completionRate: null,
    followersAtPostTime: null,
    engagementRate:
      reach > 0 ? Number(((engagements / reach) * 100).toFixed(2)) : null,
    publishedTime: toIsoString(feedPost.created_time) ?? post.publishedAt,
    topComments,
    recordedAt: new Date().toISOString(),
  };
};

const fetchMetaPostAnalytics = async (
  account: SyncSocialAccount,
  post: SyncScheduledPost
) => {
  const platform = normalizePlatform(post.platform) ?? normalizePlatform(account.platform);

  if (platform === 'instagram') {
    return fetchInstagramPostAnalytics(account, post);
  }

  if (platform === 'facebook') {
    return fetchFacebookPostAnalytics(account, post);
  }

  return buildFallbackAnalyticsPayload(account, post, new Date().toISOString());
};

const fetchInstagramAudienceSnapshot = async (
  account: SyncSocialAccount
): Promise<CreateAnalyticsAudienceSnapshotInput | null> => {
  const metadata = readMetadata(account.metadata);
  const instagramAccountId =
    typeof metadata.metaInstagramAccountId === 'string'
      ? metadata.metaInstagramAccountId
      : null;
  const fetcher = getInstagramFetcher(account);
  const analyticsAccessToken = getInstagramAnalyticsAccessToken(account);

  if (!instagramAccountId || !analyticsAccessToken) {
    return null;
  }

  const profile = await fetcher<Record<string, unknown>>(`/${instagramAccountId}`, {
    access_token: analyticsAccessToken,
    fields: 'id,followers_count,media_count',
  });
  const { values: dayInsights } = await fetchInsightMetrics(
    fetcher,
    `/${instagramAccountId}`,
    analyticsAccessToken,
    ['follower_count', 'impressions', 'reach', 'profile_views'],
    { period: 'day' }
  );
  const { values: lifetimeInsights } = await fetchInsightMetrics(
    fetcher,
    `/${instagramAccountId}`,
    analyticsAccessToken,
    ['audience_gender_age', 'audience_city', 'online_followers'],
    { period: 'lifetime' }
  );

  const ageGender = splitAgeGenderBreakdown(dayInsights.audience_gender_age ?? lifetimeInsights.audience_gender_age);

  return {
    socialAccountId: account.id,
    platform: 'instagram',
    followers:
      toNumber(dayInsights.follower_count) || toNumber(profile.followers_count),
    impressions: toNumber(dayInsights.impressions),
    reach: toNumber(dayInsights.reach),
    profileVisits: toNumber(dayInsights.profile_views),
    pageLikes: 0,
    ageDistribution: ageGender.ageDistribution,
    genderDistribution: ageGender.genderDistribution,
    topLocations: toBreakdownItems(dayInsights.audience_city ?? lifetimeInsights.audience_city).slice(0, 8),
    activeHours: toActiveHoursMap(dayInsights.online_followers ?? lifetimeInsights.online_followers),
    recordedAt: new Date().toISOString(),
  };
};

const fetchFacebookAudienceSnapshot = async (
  account: SyncSocialAccount
): Promise<CreateAnalyticsAudienceSnapshotInput | null> => {
  const metadata = readMetadata(account.metadata);
  const pageId =
    typeof metadata.metaPageId === 'string' ? metadata.metaPageId : null;

  if (!pageId || !account.accessToken) {
    return null;
  }

  const page = await metaGraphFetch<Record<string, unknown>>(`/${pageId}`, {
    access_token: account.accessToken,
    fields: 'id,followers_count,fan_count',
  });
  const { values: pageInsights } = await fetchInsightMetrics(
    metaGraphFetch,
    `/${pageId}`,
    account.accessToken,
    [
      'page_impressions',
      'page_impressions_unique',
      'page_views_total',
      'page_fans',
      'page_fans_city',
      'page_fans_gender_age',
      'page_fans_online_per_day',
    ],
    { period: 'day' }
  );
  const ageGender = splitAgeGenderBreakdown(pageInsights.page_fans_gender_age);

  return {
    socialAccountId: account.id,
    platform: 'facebook',
    followers:
      toNumber(page.followers_count) || toNumber(pageInsights.page_fans),
    impressions: toNumber(pageInsights.page_impressions),
    reach: toNumber(pageInsights.page_impressions_unique),
    profileVisits: toNumber(pageInsights.page_views_total),
    pageLikes: toNumber(page.fan_count) || toNumber(pageInsights.page_fans),
    ageDistribution: ageGender.ageDistribution,
    genderDistribution: ageGender.genderDistribution,
    topLocations: toBreakdownItems(pageInsights.page_fans_city).slice(0, 8),
    activeHours: toActiveHoursMap(pageInsights.page_fans_online_per_day),
    recordedAt: new Date().toISOString(),
  };
};

const fetchMetaAudienceSnapshot = async (account: SyncSocialAccount) => {
  const platform = normalizePlatform(account.platform);

  if (platform === 'instagram') {
    return fetchInstagramAudienceSnapshot(account);
  }

  if (platform === 'facebook') {
    return fetchFacebookAudienceSnapshot(account);
  }

  return null;
};

export const syncAnalyticsForUser = async (
  client: AppSupabaseClient,
  userId: string,
  options: SyncAnalyticsOptions = {}
): Promise<AnalyticsSyncSummary> => {
  const lookbackDays = options.lookbackDays ?? ANALYTICS_SYNC_LOOKBACK_DAYS;
  const publishedSince = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const [accountsResult, postsResult] = await Promise.all([
    client
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('oauth_provider', 'meta')
      .eq('verification_status', 'verified')
      .in('platform', ['instagram', 'facebook']),
    client
      .from('scheduled_posts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'published')
      .not('external_post_id', 'is', null)
      .gte('published_at', publishedSince)
      .order('published_at', { ascending: false }),
  ]);

  if (accountsResult.error) {
    throw new Error(accountsResult.error.message || 'Failed to load Meta accounts for analytics sync');
  }

  if (postsResult.error) {
    throw new Error(postsResult.error.message || 'Failed to load published posts for analytics sync');
  }

  const socialAccounts = (accountsResult.data ?? [])
    .map((row) => toSyncSocialAccount(row as SyncSocialAccountRow))
    .filter((account) =>
      options.socialAccountIds?.length ? options.socialAccountIds.includes(account.id) : true
    );
  const socialAccountById = new Map(socialAccounts.map((account) => [account.id, account]));
  const posts = (postsResult.data ?? [])
    .map((row) => toSyncScheduledPost(row as SyncScheduledPostRow))
    .filter((post) =>
      options.postIds?.length ? options.postIds.includes(post.id) : true
    )
    .filter((post) => socialAccountById.has(post.socialAccountId));

  const summary: AnalyticsSyncSummary = {
    postsDiscovered: posts.length,
    postsSynced: 0,
    audienceSnapshotsSynced: 0,
    accountsScanned: socialAccounts.length,
    errors: [],
  };

  for (const post of posts) {
    const account = socialAccountById.get(post.socialAccountId);

    if (!account) {
      continue;
    }

    try {
      const analyticsPayload = await fetchMetaPostAnalytics(account, post);
      await saveAnalyticsData(client, userId, analyticsPayload);
      summary.postsSynced += 1;
    } catch (error) {
      summary.errors.push(
        `Post ${post.id}: ${
          error instanceof Error ? error.message : 'Analytics sync failed.'
        }`
      );
    }
  }

  for (const account of socialAccounts) {
    try {
      const snapshot = await fetchMetaAudienceSnapshot(account);

      if (!snapshot) {
        continue;
      }

      const savedSnapshot = await saveAnalyticsAudienceSnapshot(client, userId, snapshot);
      if (savedSnapshot) {
        summary.audienceSnapshotsSynced += 1;
      }
    } catch (error) {
      summary.errors.push(
        `Audience ${account.id}: ${
          error instanceof Error ? error.message : 'Audience analytics sync failed.'
        }`
      );
    }
  }

  return summary;
};

const tickAnalyticsSyncWorker = async () => {
  if (isSyncTickRunning || !isSupabaseAdminConfigured) {
    return;
  }

  isSyncTickRunning = true;

  try {
    const client = requireSupabaseAdmin();
    const publishedSince = new Date(
      Date.now() - ANALYTICS_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data, error } = await client
      .from('scheduled_posts')
      .select('user_id')
      .eq('status', 'published')
      .gte('published_at', publishedSince)
      .order('published_at', { ascending: false })
      .limit(ANALYTICS_SYNC_BATCH_SIZE * 8);

    if (error) {
      throw new Error(error.message || 'Failed to load users for analytics sync');
    }

    const userIds = [
      ...new Set(
        (data ?? [])
          .map((row) => toRecord(row).user_id)
          .filter((value): value is string => typeof value === 'string')
      ),
    ].slice(0, ANALYTICS_SYNC_BATCH_SIZE);

    for (const userId of userIds) {
      try {
        await syncAnalyticsForUser(client, userId);
      } catch (error) {
        console.error(
          `[analytics-sync] ${userId}: ${
            error instanceof Error ? error.message : 'Worker sync failed.'
          }`
        );
      }
    }
  } catch (error) {
    console.error(
      `[analytics-sync] ${
        error instanceof Error ? error.message : 'Worker tick failed.'
      }`
    );
  } finally {
    isSyncTickRunning = false;
  }
};

export const startAnalyticsSyncWorker = () => {
  if (syncHandle || !isSupabaseAdminConfigured || !isMetaOAuthConfigured) {
    return;
  }

  syncHandle = setInterval(() => {
    void tickAnalyticsSyncWorker();
  }, ANALYTICS_SYNC_POLL_MS);

  void tickAnalyticsSyncWorker();
  console.log(
    `[analytics-sync] Worker started. Polling every ${ANALYTICS_SYNC_POLL_MS}ms.`
  );
};
