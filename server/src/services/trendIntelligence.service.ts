import { randomUUID } from 'crypto';
import {
  APIFY_API_BASE_URL,
  APIFY_RESULT_LIMIT,
  APIFY_TIMEOUT_MS,
  TAVILY_SEARCH_API_BASE_URL,
  TAVILY_SEARCH_QUERY_LIMIT,
  TAVILY_SEARCH_RESULT_LIMIT,
  TAVILY_SEARCH_TIMEOUT_MS,
  TREND_RESEARCH_CACHE_TTL_MS,
  TREND_RESEARCH_MAX_CANDIDATES,
  TREND_RESEARCH_MAX_INSIGHTS,
} from '../config/constants';
import {
  RequestCancelledError,
  isAbortError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';
import type {
  BrandMemoryMatch,
  BrandProfile,
  ProductInput,
  RealtimeTrendInsight,
  RealtimeTrendIntelligence,
  RealtimeTrendResearchPurpose,
  TrendSignalCandidate,
  TrendSignalReason,
  TrendSignalSource,
} from '../types';

type TrendResearchArgs = {
  purpose: RealtimeTrendResearchPurpose;
  userId: string;
  brandProfile: BrandProfile | null;
  productInput: ProductInput;
  brandMemories?: BrandMemoryMatch[];
  signal?: AbortSignal;
};

type CacheEntry = {
  expiresAt: number;
  value: RealtimeTrendIntelligence;
};

type ApifyConfig = {
  kind: 'task' | 'actor';
  id: string;
  platform: string;
};

type ResearchSourceDiagnostics = {
  used: boolean;
  resultsCount: number;
  reasonIfSkipped: string | null;
};

type TokenWeight = {
  token: string;
  weight: number;
};

const trendResearchCache = new Map<string, CacheEntry>();
const MAX_MEMORY_SNIPPETS = 4;
const MAX_QUERY_TOKENS = 18;

const PLATFORM_ALIASES: Record<string, string> = {
  instagram: 'instagram',
  ig: 'instagram',
  facebook: 'facebook',
  fb: 'facebook',
  linkedin: 'linkedin',
  'linked in': 'linkedin',
  x: 'x',
  twitter: 'x',
  reddit: 'reddit',
  youtube: 'youtube',
  yt: 'youtube',
  tiktok: 'tiktok',
};

const DEFAULT_HALF_LIFE_HOURS = 72;
const PLATFORM_HALF_LIFE_HOURS: Record<string, number> = {
  instagram: 72,
  facebook: 84,
  linkedin: 96,
  x: 20,
  reddit: 30,
  youtube: 168,
  tiktok: 36,
};

const BANNED_CONTENT_PATTERNS = [
  /\bnsfw\b/i,
  /\bsex(?:ual)?\b/i,
  /\bporn\b/i,
  /\bfetish\b/i,
  /\bnude\b/i,
  /\bviolence\b/i,
  /\bhate\b/i,
  /\bslur\b/i,
  /\bracist\b/i,
  /\breligion\b/i,
  /\bpolitic(?:s|al)\b/i,
];

const SPAM_PATTERNS = [
  /\bfree\s+money\b/i,
  /\bguaranteed\b/i,
  /\bdouble\s+your\b/i,
  /\bfollow\s+for\s+follow\b/i,
  /\btelegram\b/i,
  /\bcrypto\s+giveaway\b/i,
  /(.)\1{6,}/,
];

const VIRAL_LANGUAGE_PATTERNS = [
  /\bhow to\b/i,
  /\bwhy\b/i,
  /\bmistake(?:s)?\b/i,
  /\bsecret(?:s)?\b/i,
  /\bresults?\b/i,
  /\bbefore\b/i,
  /\bafter\b/i,
  /\blaunch\b/i,
  /\bbehind the scenes\b/i,
  /\bchecklist\b/i,
  /\bframework\b/i,
];

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'this',
  'to',
  'with',
  'your',
]);

const normalizePlatform = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return PLATFORM_ALIASES[normalized] ?? normalized;
};

const normalizeText = (value: string) =>
  value.replace(/\s+/g, ' ').trim();

const clampText = (value: string, maxChars: number) => {
  const normalized = normalizeText(value);
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[#/|()[\],.:;!?'"`~_*+-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 2 &&
        !STOPWORDS.has(token) &&
        /[a-z0-9]/i.test(token)
    );

const unique = <T>(values: T[]) => Array.from(new Set(values));

const dedupeStrings = (values: string[]) =>
  unique(values.map((value) => normalizeText(value)).filter(Boolean));

const extractHashtags = (value: string): string[] =>
  unique(
    (value.match(/#[\p{L}\p{N}_][\p{L}\p{N}_-]*/gu) ?? []).map((tag) =>
      tag.toLowerCase()
    )
  );

const safeNumber = (value: unknown) =>
  typeof value === 'number'
    ? value
    : typeof value === 'string'
    ? Number.parseFloat(value.replace(/,/g, ''))
    : NaN;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const softScore = (value: number, pivot: number) =>
  value > 0 ? value / (value + Math.max(1, pivot)) : 0;

const hoursBetween = (date: Date, now = Date.now()) =>
  Math.max(0, (now - date.getTime()) / (1000 * 60 * 60));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const pickString = (
  record: Record<string, unknown>,
  keys: string[]
): string | null => {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const pickNumber = (
  record: Record<string, unknown>,
  keys: string[]
): number => {
  for (const key of keys) {
    const value = safeNumber(record[key]);

    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return 0;
};

const pickStringArray = (
  record: Record<string, unknown>,
  keys: string[]
): string[] => {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      const strings = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (strings.length) {
        return strings;
      }
    }
  }

  return [];
};

const buildApifyRowPreview = (payload: unknown) => {
  if (!Array.isArray(payload) || payload.length === 0) {
    return {
      rowCount: Array.isArray(payload) ? 0 : null,
      firstRowKeys: [] as string[],
      firstRowSample: null as Record<string, unknown> | null,
    };
  }

  const firstRow = payload[0];

  if (!isRecord(firstRow)) {
    return {
      rowCount: payload.length,
      firstRowKeys: [] as string[],
      firstRowSample: null as Record<string, unknown> | null,
    };
  }

  const keys = Object.keys(firstRow).slice(0, 20);
  const sample: Record<string, unknown> = {};

  for (const key of keys.slice(0, 8)) {
    const value = firstRow[key];

    if (typeof value === 'string') {
      sample[key] = clampText(value, 120);
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sample[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      sample[key] = {
        type: 'array',
        length: value.length,
      };
      continue;
    }

    if (isRecord(value)) {
      sample[key] = {
        type: 'object',
        keys: Object.keys(value).slice(0, 8),
      };
      continue;
    }

    sample[key] = typeof value;
  }

  return {
    rowCount: payload.length,
    firstRowKeys: keys,
    firstRowSample: sample,
  };
};

const parsePublishedAt = (record: Record<string, unknown>): string | null => {
  const raw = pickString(record, [
    'publishedAt',
    'published_at',
    'createdAt',
    'created_at',
    'timestamp',
    'time',
    'date',
  ]);

  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildTokenWeights = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  brandMemories: BrandMemoryMatch[] | undefined
): TokenWeight[] => {
  const weightedTokens: TokenWeight[] = [];

  const pushWeightedTokens = (text: string | null | undefined, weight: number) => {
    if (!text) {
      return;
    }

    for (const token of tokenize(text)) {
      weightedTokens.push({
        token,
        weight,
      });
    }
  };

  pushWeightedTokens(productInput.productName, 3);
  pushWeightedTokens(productInput.productDescription, 2.6);
  pushWeightedTokens(productInput.goal, 2.4);
  pushWeightedTokens(productInput.audience, 2.2);
  pushWeightedTokens(productInput.tone, 2.1);
  pushWeightedTokens(brandProfile?.brandName, 2.3);
  pushWeightedTokens(brandProfile?.primaryIndustry, 2);
  pushWeightedTokens(brandProfile?.industry, 1.8);
  pushWeightedTokens(brandProfile?.targetAudience, 1.7);
  pushWeightedTokens(brandProfile?.brandVoice, 1.7);

  for (const keyword of productInput.keywords ?? []) {
    pushWeightedTokens(keyword, 2.5);
  }

  for (const memory of brandMemories?.slice(0, MAX_MEMORY_SNIPPETS) ?? []) {
    pushWeightedTokens(memory.contentText, 1.25);
  }

  const merged = new Map<string, number>();

  for (const entry of weightedTokens) {
    merged.set(entry.token, (merged.get(entry.token) ?? 0) + entry.weight);
  }

  return Array.from(merged.entries())
    .map(([token, weight]) => ({ token, weight }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, MAX_QUERY_TOKENS);
};

const buildSearchQueries = (
  purpose: RealtimeTrendResearchPurpose,
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  brandMemories?: BrandMemoryMatch[]
) => {
  const platform = normalizePlatform(productInput.platform) ?? 'social';
  const topTokens = buildTokenWeights(brandProfile, productInput, brandMemories)
    .slice(0, 8)
    .map((entry) => entry.token);
  const goal = productInput.goal?.trim() || 'engagement';
  const audience = productInput.audience?.trim() || brandProfile?.targetAudience?.trim() || '';
  const industry =
    brandProfile?.primaryIndustry?.trim() ||
    brandProfile?.industry?.trim() ||
    '';
  const purposeLabel =
    purpose === 'image-generation'
      ? 'visual campaign'
      : purpose === 'hashtag-generation'
      ? 'hashtags'
      : purpose === 'reel-script-generation'
      ? 'short-form video'
      : 'captions';

  const queries = dedupeStrings([
    `${productInput.productName} ${platform} ${goal} ${topTokens.slice(0, 4).join(' ')}`,
    `${industry} ${platform} trending ${purposeLabel} ${topTokens.slice(0, 5).join(' ')}`,
    `${productInput.productName} ${platform} ${audience} viral ${goal} ${purposeLabel}`,
  ]);

  return queries.slice(0, TAVILY_SEARCH_QUERY_LIMIT);
};

const buildCacheKey = (
  purpose: RealtimeTrendResearchPurpose,
  userId: string,
  productInput: ProductInput,
  queries: string[]
) =>
  JSON.stringify({
    purpose,
    userId,
    productName: productInput.productName,
    platform: normalizePlatform(productInput.platform),
    goal: productInput.goal ?? null,
    tone: productInput.tone ?? null,
    audience: productInput.audience ?? null,
    keywords: productInput.keywords ?? [],
    queries,
  });

const createTimeoutSignal = (timeoutMs: number, baseSignal?: AbortSignal) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const handleAbort = () => controller.abort();
  baseSignal?.addEventListener('abort', handleAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      baseSignal?.removeEventListener('abort', handleAbort);
    },
  };
};

const fetchJson = async <T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> => {
  throwIfRequestCancelled(signal);
  const timeout = createTimeoutSignal(timeoutMs, signal);

  try {
    const response = await fetch(url, {
      ...init,
      signal: timeout.signal,
    });
    const payload = (await response.json().catch(() => null)) as T | null;

    if (!response.ok) {
      throw new Error(
        `Request failed (${response.status}): ${
          isRecord(payload) && isRecord(payload.error)
            ? String(payload.error.message ?? response.statusText)
            : response.statusText
        }`
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof RequestCancelledError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw error instanceof Error ? error : new Error('Request failed');
  } finally {
    timeout.cleanup();
  }
};

const computeTopicMatchScore = (text: string, tokenWeights: TokenWeight[]) => {
  const tokens = new Set(tokenize(text));
  let matchedWeight = 0;
  const totalWeight = tokenWeights.reduce((sum, entry) => sum + entry.weight, 0);

  for (const entry of tokenWeights) {
    if (tokens.has(entry.token)) {
      matchedWeight += entry.weight;
    }
  }

  return totalWeight > 0 ? clamp01(matchedWeight / totalWeight) : 0;
};

const computeFreshnessScore = (
  platform: string | null,
  publishedAt: string | null
) => {
  if (!publishedAt) {
    return 0.35;
  }

  const date = new Date(publishedAt);

  if (Number.isNaN(date.getTime())) {
    return 0.35;
  }

  const ageHours = hoursBetween(date);
  const halfLife = PLATFORM_HALF_LIFE_HOURS[platform ?? ''] ?? DEFAULT_HALF_LIFE_HOURS;
  return clamp01(Math.exp((-1 * ageHours) / halfLife));
};

const computeShareRatioScore = (shares: number, views: number, likes: number) => {
  if (shares <= 0) {
    return 0;
  }

  const denominator = Math.max(views, likes, 1);
  return clamp01(softScore(shares / denominator, 0.03));
};

const computeCommentIntensityScore = (comments: number, likes: number, views: number) => {
  if (comments <= 0) {
    return 0;
  }

  const denominator = Math.max(likes, views * 0.25, 1);
  return clamp01(softScore(comments / denominator, 0.08));
};

const computeCreatorStreakScore = (
  followers: number,
  likes: number,
  comments: number,
  shares: number,
  views: number
) => {
  if (followers <= 0 && views <= 0) {
    return 0.2;
  }

  const engaged = likes + comments * 1.2 + shares * 1.5;
  const reach = Math.max(followers, views, 1);
  return clamp01(softScore(engaged / reach, 0.04));
};

const computeSentimentBoostScore = (text: string) => {
  const normalized = text.toLowerCase();
  let score = 0;

  for (const pattern of VIRAL_LANGUAGE_PATTERNS) {
    if (pattern.test(normalized)) {
      score += 0.14;
    }
  }

  if ((normalized.match(/[!?]/g) ?? []).length >= 2) {
    score += 0.08;
  }

  if (/\bvs\b|\btruth\b|\bmyth\b|\bworth it\b/i.test(normalized)) {
    score += 0.06;
  }

  return clamp01(score);
};

const computeQualityScore = (
  source: TrendSignalSource,
  text: string,
  url: string | null
) => {
  const normalized = normalizeText(text);

  const minimumLength = source === 'social' ? 8 : 18;

  if (normalized.length < minimumLength) {
    return 0;
  }

  for (const pattern of BANNED_CONTENT_PATTERNS) {
    if (pattern.test(normalized)) {
      return 0;
    }
  }

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(normalized)) {
      return 0.05;
    }
  }

  const uppercaseRatio =
    normalized.length > 0
      ? (normalized.match(/[A-Z]/g) ?? []).length / normalized.length
      : 0;
  const urlPenalty = url && /bit\.ly|t\.co|buff\.ly/i.test(url) ? 0.08 : 0;
  const repetitionPenalty = /(.)\1{4,}/.test(normalized) ? 0.2 : 0;
  const emojiPenalty = (normalized.match(/[\p{Emoji_Presentation}]/gu) ?? []).length > 8 ? 0.12 : 0;

  return clamp01(
    0.88 -
      uppercaseRatio * 0.6 -
      urlPenalty -
      repetitionPenalty -
      emojiPenalty +
      (source === 'social' && normalized.length < 18 ? 0.06 : 0)
  );
};

const computeViralScore = (
  source: TrendSignalSource,
  topicMatchScore: number,
  freshnessScore: number,
  shareRatioScore: number,
  commentIntensityScore: number,
  creatorStreakScore: number,
  sentimentBoostScore: number,
  qualityScore: number
) =>
  clamp01(
    topicMatchScore * 0.27 +
      freshnessScore * 0.19 +
      shareRatioScore * 0.16 +
      commentIntensityScore * 0.11 +
      creatorStreakScore * 0.1 +
      sentimentBoostScore * 0.06 +
      qualityScore * 0.11 +
      (source === 'social' ? 0.04 : 0)
  );

const buildReasons = (scores: Array<[string, number]>): TrendSignalReason[] =>
  scores
    .filter(([, value]) => value > 0.22)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label, weight]) => ({
      label,
      weight: Number(weight.toFixed(3)),
    }));

const normalizeCandidate = ({
  source,
  platform,
  title,
  text,
  url,
  authorName,
  hashtags,
  publishedAt,
  metrics,
  tokenWeights,
}: {
  source: TrendSignalSource;
  platform: string | null;
  title: string | null;
  text: string;
  url: string | null;
  authorName: string | null;
  hashtags: string[];
  publishedAt: string | null;
  metrics: TrendSignalCandidate['metrics'];
  tokenWeights: TokenWeight[];
}): TrendSignalCandidate | null => {
  const normalizedText = normalizeText(text);
  const qualityScore = computeQualityScore(
    source,
    [title, normalizedText].filter(Boolean).join(' '),
    url
  );

  if (qualityScore <= 0.12) {
    return null;
  }

  const topicMatchScore = computeTopicMatchScore(
    [title, normalizedText, hashtags.join(' ')].filter(Boolean).join(' '),
    tokenWeights
  );
  const freshnessScore = computeFreshnessScore(platform, publishedAt);
  const shareRatioScore = computeShareRatioScore(
    metrics.shares,
    metrics.views,
    metrics.likes
  );
  const commentIntensityScore = computeCommentIntensityScore(
    metrics.comments,
    metrics.likes,
    metrics.views
  );
  const creatorStreakScore = computeCreatorStreakScore(
    metrics.followers,
    metrics.likes,
    metrics.comments,
    metrics.shares,
    metrics.views
  );
  const sentimentBoostScore = computeSentimentBoostScore(
    [title, normalizedText].filter(Boolean).join(' ')
  );
  const viralScore = computeViralScore(
    source,
    topicMatchScore,
    freshnessScore,
    shareRatioScore,
    commentIntensityScore,
    creatorStreakScore,
    sentimentBoostScore,
    qualityScore
  );
  const ageHours =
    publishedAt && !Number.isNaN(new Date(publishedAt).getTime())
      ? Number(hoursBetween(new Date(publishedAt)).toFixed(2))
      : null;

  return {
    id: randomUUID(),
    source,
    platform,
    title,
    text: normalizedText,
    url,
    authorName,
    hashtags,
    publishedAt,
    ageHours,
    metrics,
    topicMatchScore: Number(topicMatchScore.toFixed(3)),
    freshnessScore: Number(freshnessScore.toFixed(3)),
    shareRatioScore: Number(shareRatioScore.toFixed(3)),
    commentIntensityScore: Number(commentIntensityScore.toFixed(3)),
    creatorStreakScore: Number(creatorStreakScore.toFixed(3)),
    sentimentBoostScore: Number(sentimentBoostScore.toFixed(3)),
    qualityScore: Number(qualityScore.toFixed(3)),
    viralScore: Number(viralScore.toFixed(3)),
    reasons: buildReasons([
      ['topic match', topicMatchScore],
      ['freshness', freshnessScore],
      ['share ratio', shareRatioScore],
      ['comment intensity', commentIntensityScore],
      ['creator momentum', creatorStreakScore],
      ['audience spark', sentimentBoostScore],
      ['quality filter', qualityScore],
    ]),
  };
};

const parseTavilyCandidates = (
  payload: unknown,
  tokenWeights: TokenWeight[]
): TrendSignalCandidate[] => {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results
    .map((entry): TrendSignalCandidate | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const title = pickString(entry, ['title']);
      const description = pickString(entry, ['content', 'description', 'snippet']);
      const url = pickString(entry, ['url']);
      const publishedAtRaw = pickString(entry, [
        'published_date',
        'publishedAt',
        'published_at',
        'date',
      ]);
      const parsedAge = publishedAtRaw ? new Date(publishedAtRaw) : null;

      return normalizeCandidate({
        source: 'web',
        platform: null,
        title,
        text: [title, description].filter(Boolean).join('. '),
        url,
        authorName: pickString(entry, ['profile', 'author']),
        hashtags: extractHashtags([title, description].filter(Boolean).join(' ')),
        publishedAt:
          parsedAge && !Number.isNaN(parsedAge.getTime())
            ? parsedAge.toISOString()
            : null,
        metrics: {
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
          followers: 0,
        },
        tokenWeights,
      });
    })
    .filter((entry): entry is TrendSignalCandidate => Boolean(entry));
};

const readApifyConfig = (platform: string | null): ApifyConfig | null => {
  const normalized = normalizePlatform(platform);

  if (!normalized) {
    return null;
  }

  const envKeyBase = normalized.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const taskId = process.env[`APIFY_${envKeyBase}_TASK_ID`]?.trim();
  const actorId = process.env[`APIFY_${envKeyBase}_ACTOR_ID`]?.trim();

  if (taskId) {
    return {
      kind: 'task',
      id: taskId,
      platform: normalized,
    };
  }

  if (actorId) {
    return {
      kind: 'actor',
      id: actorId,
      platform: normalized,
    };
  }

  return null;
};

const readApifyPlatformSecret = (
  platform: string | null,
  suffix: string
): string | null => {
  const normalized = normalizePlatform(platform);

  if (!normalized) {
    return null;
  }

  const envKeyBase = normalized.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const value = process.env[`APIFY_${envKeyBase}_${suffix}`]?.trim();
  return value || null;
};

const parseApifySecretValue = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const buildApifyEndpoint = (config: ApifyConfig, token: string) =>
  config.kind === 'task'
    ? `${APIFY_API_BASE_URL}/v2/actor-tasks/${config.id}/run-sync-get-dataset-items?token=${encodeURIComponent(
        token
      )}&format=json&clean=true`
    : `${APIFY_API_BASE_URL}/v2/acts/${config.id}/run-sync-get-dataset-items?token=${encodeURIComponent(
        token
      )}&format=json&clean=true`;

const buildApifyInput = (
  purpose: RealtimeTrendResearchPurpose,
  platform: string,
  queries: string[],
  brandProfile: BrandProfile | null,
  productInput: ProductInput
) => {
  const normalizedPlatform = normalizePlatform(platform) ?? platform;
  const brandName = productInput.brandName ?? brandProfile?.brandName ?? null;
  const websiteHandle = (() => {
    if (!brandProfile?.websiteUrl) {
      return null;
    }

    try {
      return new URL(brandProfile.websiteUrl).hostname
        .replace(/^www\./i, '')
        .split('.')[0];
    } catch {
      return null;
    }
  })();
  const baseInput = {
    platform,
    purpose,
    query: queries[0] ?? productInput.productName,
    queries,
    searchTerms: queries,
    keyword: productInput.productName,
    keywords: productInput.keywords ?? [],
    hashtagQuery: queries[queries.length - 1] ?? productInput.productName,
    productName: productInput.productName,
    productDescription: productInput.productDescription ?? null,
    audience: productInput.audience ?? brandProfile?.targetAudience ?? null,
    goal: productInput.goal ?? null,
    tone: productInput.tone ?? brandProfile?.brandVoice ?? null,
    brandName,
    industry: brandProfile?.primaryIndustry ?? brandProfile?.industry ?? null,
    resultsLimit: APIFY_RESULT_LIMIT,
    maxItems: APIFY_RESULT_LIMIT,
    maxResults: APIFY_RESULT_LIMIT,
    maxPosts: APIFY_RESULT_LIMIT,
    maxRequestRetries: 1,
  };

  if (normalizedPlatform !== 'facebook') {
    if (normalizedPlatform !== 'linkedin') {
      return baseInput;
    }

    const linkedinCookie = readApifyPlatformSecret(normalizedPlatform, 'COOKIE');
    const linkedinProxyRaw = readApifyPlatformSecret(normalizedPlatform, 'PROXY');
    const linkedinProxy = parseApifySecretValue(linkedinProxyRaw);

    return {
      ...baseInput,
      ...(linkedinCookie ? { cookie: linkedinCookie } : {}),
      ...(linkedinProxy ? { proxy: linkedinProxy } : {}),
    };
  }

  const usernameCandidates = dedupeStrings(
    [
      brandProfile?.username,
      productInput.brandName,
      brandProfile?.brandName,
      brandProfile?.fullName,
      websiteHandle,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .flatMap((value) => {
        const normalized = value.trim();
        const handle = normalized
          .replace(/^@+/, '')
          .replace(/^https?:\/\/(www\.)?facebook\.com\//i, '')
          .replace(/[/?#].*$/, '')
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9._-]/gi, '');

        return handle ? [handle] : [];
      })
  ).slice(0, 4);

  const searchQueries = dedupeStrings(
    [
      ...queries,
      brandName,
      productInput.productName,
      brandProfile?.primaryIndustry,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ).slice(0, 6);

  const startUrls = dedupeStrings([
    ...usernameCandidates.map((handle) => `https://www.facebook.com/${handle}`),
    ...searchQueries.map(
      (query) =>
        `https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`
    ),
  ]).map((url) => ({ url }));

  return {
    ...baseInput,
    startUrls,
  };
};

const parseApifyCandidates = (
  payload: unknown,
  platform: string,
  tokenWeights: TokenWeight[]
): TrendSignalCandidate[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((entry): TrendSignalCandidate | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const title = pickString(entry, ['title', 'headline', 'name']);
      const text = pickString(entry, [
        'text',
        'caption',
        'description',
        'content',
        'fullText',
        'body',
        'message',
      ]);

      if (!text && !title) {
        return null;
      }

      const hashtags = unique([
        ...extractHashtags([title, text].filter(Boolean).join(' ')),
        ...pickStringArray(entry, ['hashtags', 'hashTags', 'tags']).flatMap(extractHashtags),
      ]);

      return normalizeCandidate({
        source: 'social',
        platform,
        title,
        text: [title, text].filter(Boolean).join('. '),
        url: pickString(entry, [
          'url',
          'postUrl',
          'post_url',
          'link',
          'permalink',
        ]),
        authorName: pickString(entry, [
          'authorName',
          'username',
          'ownerUsername',
          'author',
          'channelName',
          'screenName',
        ]),
        hashtags,
        publishedAt: parsePublishedAt(entry),
        metrics: {
          likes: pickNumber(entry, ['likes', 'likeCount', 'likesCount']),
          comments: pickNumber(entry, ['comments', 'commentCount', 'commentsCount']),
          shares: pickNumber(entry, ['shares', 'shareCount', 'retweetCount', 'repostsCount']),
          views: pickNumber(entry, ['views', 'viewCount', 'playCount', 'videoViewCount']),
          followers: pickNumber(entry, ['followers', 'followersCount', 'subscriberCount']),
        },
        tokenWeights,
      });
    })
    .filter((entry): entry is TrendSignalCandidate => Boolean(entry));
};

const dedupeCandidates = (candidates: TrendSignalCandidate[]) => {
  const seen = new Set<string>();
  const uniqueCandidates: TrendSignalCandidate[] = [];
  let filteredOutCount = 0;

  for (const candidate of candidates) {
    const key = [
      candidate.platform ?? 'any',
      candidate.url ?? '',
      normalizeText(`${candidate.title ?? ''} ${candidate.text}`).toLowerCase(),
    ]
      .join('|')
      .trim();

    if (seen.has(key)) {
      filteredOutCount += 1;
      continue;
    }

    seen.add(key);
    uniqueCandidates.push(candidate);
  }

  return {
    uniqueCandidates,
    filteredOutCount,
  };
};

const buildInsights = (candidates: TrendSignalCandidate[]): RealtimeTrendInsight[] =>
  candidates.slice(0, TREND_RESEARCH_MAX_INSIGHTS).map((candidate) => ({
    headline:
      candidate.title ??
      clampText(candidate.text.split(/(?<=[.!?])\s+/)[0] ?? candidate.text, 90),
    explanation:
      candidate.reasons.length > 0
        ? `Strong because ${candidate.reasons
            .map((reason) => reason.label)
            .slice(0, 3)
            .join(', ')}.`
        : 'Strong because it closely matches the topic and current audience behavior.',
    platform: candidate.platform,
    source: candidate.source,
    viralScore: candidate.viralScore,
    reasons: candidate.reasons,
    referenceUrl: candidate.url,
  }));

const buildTopHashtags = (candidates: TrendSignalCandidate[]) => {
  const weighted = new Map<string, number>();

  for (const candidate of candidates) {
    for (const hashtag of candidate.hashtags) {
      weighted.set(
        hashtag,
        (weighted.get(hashtag) ?? 0) + candidate.viralScore + candidate.topicMatchScore
      );
    }
  }

  return Array.from(weighted.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([hashtag]) => hashtag);
};

const buildSummary = (
  purpose: RealtimeTrendResearchPurpose,
  candidates: TrendSignalCandidate[],
  topHashtags: string[]
) => {
  if (!candidates.length) {
    return `No live trend signals were strong enough to use for ${purpose}.`;
  }

  const platforms = unique(
    candidates.map((candidate) => candidate.platform).filter(Boolean) as string[]
  );
  const strongestReasons = unique(
    candidates.flatMap((candidate) => candidate.reasons.map((reason) => reason.label))
  ).slice(0, 4);

  return [
    `Live trend analysis found ${candidates.length} high-signal items.`,
    platforms.length ? `Strongest platforms: ${platforms.join(', ')}.` : null,
    strongestReasons.length
      ? `Recurring viral drivers: ${strongestReasons.join(', ')}.`
      : null,
    topHashtags.length
      ? `Fresh hashtags worth considering: ${topHashtags.slice(0, 6).join(', ')}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
};

const fetchTavilyTrendSignals = async (
  queries: string[],
  tokenWeights: TokenWeight[],
  signal?: AbortSignal
) => {
  const apiKey = process.env.TAVILY_API_KEY?.trim();

  if (!apiKey) {
    return [] as TrendSignalCandidate[];
  }

  const responses = await Promise.all(
    queries.map(async (query) => {
      const payload = await fetchJson<unknown>(
        `${TAVILY_SEARCH_API_BASE_URL}/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            topic: 'general',
            search_depth: 'advanced',
            max_results: TAVILY_SEARCH_RESULT_LIMIT,
            include_answer: false,
            include_raw_content: false,
            include_images: false,
            include_favicon: false,
            time_range: 'week',
          }),
        },
        TAVILY_SEARCH_TIMEOUT_MS,
        signal
      );

      return parseTavilyCandidates(payload, tokenWeights);
    })
  );

  return responses.flat();
};

const fetchApifyTrendSignals = async (
  purpose: RealtimeTrendResearchPurpose,
  platform: string | null,
  queries: string[],
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  tokenWeights: TokenWeight[],
  signal?: AbortSignal
) => {
  const token = process.env.APIFY_API_TOKEN?.trim();
  const config = readApifyConfig(platform);

  if (!token || !config) {
    return {
      platform: normalizePlatform(platform),
      candidates: [] as TrendSignalCandidate[],
    };
  }

  const payload = await fetchJson<unknown>(
    buildApifyEndpoint(config, token),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildApifyInput(purpose, config.platform, queries, brandProfile, productInput)
      ),
    },
    APIFY_TIMEOUT_MS,
    signal
  );

  const diagnostics = buildApifyRowPreview(payload);
  const candidates = parseApifyCandidates(payload, config.platform, tokenWeights);

  console.info('[trend-intelligence] apify payload preview', {
    purpose,
    platform: config.platform,
    actorKind: config.kind,
    actorOrTaskId: config.id,
    rowCount: diagnostics.rowCount,
    parsedCandidates: candidates.length,
    firstRowKeys: diagnostics.firstRowKeys,
    firstRowSample: diagnostics.firstRowSample,
  });

  return {
    platform: config.platform,
    candidates,
  };
};

export const collectRealtimeTrendIntelligence = async ({
  purpose,
  userId,
  brandProfile,
  productInput,
  brandMemories,
  signal,
}: TrendResearchArgs): Promise<RealtimeTrendIntelligence | null> => {
  throwIfRequestCancelled(signal);
  const queries = buildSearchQueries(
    purpose,
    brandProfile,
    productInput,
    brandMemories
  );
  const cacheKey = buildCacheKey(purpose, userId, productInput, queries);
  const cached = trendResearchCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const selectedPlatform = normalizePlatform(productInput.platform);
  const tokenWeights = buildTokenWeights(
    brandProfile,
    productInput,
    brandMemories
  );

  if (!queries.length || !tokenWeights.length) {
    return null;
  }

  console.info('[trend-intelligence] research started', {
    userId,
    purpose,
    platform: selectedPlatform,
    goal: productInput.goal ?? null,
    queries,
  });

  let webCandidates: TrendSignalCandidate[] = [];
  let socialCandidates: TrendSignalCandidate[] = [];
  let scrapedPlatform: string | null = null;
  const apifyDisabledForPlatform = selectedPlatform === 'linkedin';
  const apifyConfig = readApifyConfig(selectedPlatform);
  const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();
  const apifyToken = process.env.APIFY_API_TOKEN?.trim();
  const tavilyDiagnostics: ResearchSourceDiagnostics = {
    used: Boolean(tavilyApiKey),
    resultsCount: 0,
    reasonIfSkipped: tavilyApiKey ? null : 'missing_tavily_api_key',
  };
  const apifyDiagnostics: ResearchSourceDiagnostics = {
    used: apifyDisabledForPlatform ? false : Boolean(apifyToken && apifyConfig),
    resultsCount: 0,
    reasonIfSkipped: apifyDisabledForPlatform
      ? 'linkedin_uses_web_memory_analytics_mode'
      : apifyToken
      ? apifyConfig
        ? null
        : selectedPlatform
        ? `missing_apify_config_for_${selectedPlatform}`
        : 'missing_selected_platform'
      : 'missing_apify_api_token',
  };

  try {
    const [nextWebCandidates, apifyResult] = await Promise.all([
      fetchTavilyTrendSignals(queries, tokenWeights, signal).catch((error) => {
        tavilyDiagnostics.used = false;
        tavilyDiagnostics.reasonIfSkipped = `request_failed:${
          error instanceof Error ? error.message : String(error)
        }`;
        console.warn('[trend-intelligence] tavily search failed', {
          userId,
          purpose,
          error: error instanceof Error ? error.message : String(error),
        });
        return [] as TrendSignalCandidate[];
      }),
      apifyDisabledForPlatform
        ? Promise.resolve({
            platform: selectedPlatform,
            candidates: [] as TrendSignalCandidate[],
          })
        : fetchApifyTrendSignals(
            purpose,
            selectedPlatform,
            queries,
            brandProfile,
            productInput,
            tokenWeights,
            signal
          ).catch((error) => {
            apifyDiagnostics.used = false;
            apifyDiagnostics.reasonIfSkipped = `request_failed:${
              error instanceof Error ? error.message : String(error)
            }`;
            console.warn('[trend-intelligence] apify scrape failed', {
              userId,
              purpose,
              platform: selectedPlatform,
              error: error instanceof Error ? error.message : String(error),
            });
            return {
              platform: selectedPlatform,
              candidates: [] as TrendSignalCandidate[],
            };
          }),
    ]);

    webCandidates = nextWebCandidates;
    socialCandidates = apifyResult.candidates;
    scrapedPlatform = apifyResult.platform;
    tavilyDiagnostics.resultsCount = webCandidates.length;
    apifyDiagnostics.resultsCount = socialCandidates.length;
  } catch (error) {
    if (error instanceof RequestCancelledError) {
      throw error;
    }
  }

  const sortedCandidates = [...socialCandidates, ...webCandidates]
    .sort((left, right) => {
      if (right.viralScore !== left.viralScore) {
        return right.viralScore - left.viralScore;
      }

      if ((right.topicMatchScore ?? 0) !== (left.topicMatchScore ?? 0)) {
        return (right.topicMatchScore ?? 0) - (left.topicMatchScore ?? 0);
      }

      return (right.freshnessScore ?? 0) - (left.freshnessScore ?? 0);
    });
  const { uniqueCandidates, filteredOutCount } = dedupeCandidates(sortedCandidates);
  const topCandidates = uniqueCandidates.slice(0, TREND_RESEARCH_MAX_CANDIDATES);

  if (!topCandidates.length) {
    console.info('[trend-intelligence] research completed', {
      userId,
      purpose,
      platform: selectedPlatform,
      tavily_used: tavilyDiagnostics.used,
      tavily_results_count: tavilyDiagnostics.resultsCount,
      tavily_reason_if_skipped: tavilyDiagnostics.reasonIfSkipped,
      apify_used: apifyDiagnostics.used,
      apify_results_count: apifyDiagnostics.resultsCount,
      apify_reason_if_skipped: apifyDiagnostics.reasonIfSkipped,
      webCandidates: webCandidates.length,
      socialCandidates: socialCandidates.length,
      selectedCandidates: 0,
      filteredOutCount,
    });
    return null;
  }

  const topHashtags = buildTopHashtags(topCandidates);
  const intelligence: RealtimeTrendIntelligence = {
    purpose,
    generatedAt: new Date().toISOString(),
    queryText: queries[0] ?? productInput.productName,
    selectedPlatform,
    selectedGoal: productInput.goal ?? null,
    searchQueries: queries,
    scrapedPlatforms: scrapedPlatform ? [scrapedPlatform] : [],
    summary: buildSummary(purpose, topCandidates, topHashtags),
    topHashtags,
    insights: buildInsights(topCandidates),
    topCandidates,
    filteredOutCount,
  };

  trendResearchCache.set(cacheKey, {
    expiresAt: Date.now() + TREND_RESEARCH_CACHE_TTL_MS,
    value: intelligence,
  });

  console.info('[trend-intelligence] research completed', {
    userId,
    purpose,
    platform: selectedPlatform,
    tavily_used: tavilyDiagnostics.used,
    tavily_results_count: tavilyDiagnostics.resultsCount,
    tavily_reason_if_skipped: tavilyDiagnostics.reasonIfSkipped,
    apify_used: apifyDiagnostics.used,
    apify_results_count: apifyDiagnostics.resultsCount,
    apify_reason_if_skipped: apifyDiagnostics.reasonIfSkipped,
    webCandidates: webCandidates.length,
    socialCandidates: socialCandidates.length,
    selectedCandidates: topCandidates.length,
    topHashtags: topHashtags.slice(0, 5),
  });

  return intelligence;
};
