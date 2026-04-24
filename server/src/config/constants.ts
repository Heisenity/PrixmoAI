import dotenv from 'dotenv';
import type { BillingPlan, PlanType } from '../types';

dotenv.config();

export const APP_PORT = Number(process.env.PORT || 5000);
export const NODE_ENV = process.env.NODE_ENV || 'development';
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const readBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

export const SERVER_PUBLIC_URL = trimTrailingSlash(
  process.env.SERVER_PUBLIC_URL || `http://localhost:${APP_PORT}`
);
export const CLIENT_APP_URL = trimTrailingSlash(
  process.env.CLIENT_APP_URL || 'http://localhost:5173'
);
export const REDIS_URL =
  process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || '';
export const REDIS_TOKEN =
  process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_TOKEN || '';
export const REDIS_KEY_PREFIX =
  process.env.REDIS_KEY_PREFIX || 'prixmoai';
export const REDIS_TLS = readBoolean(
  process.env.REDIS_TLS,
  REDIS_URL.includes('upstash.io')
);
export const BULLMQ_PREFIX =
  process.env.BULLMQ_PREFIX || `${REDIS_KEY_PREFIX}:bullmq`;
export const LOW_REDIS_COMMAND_MODE = readBoolean(
  process.env.LOW_REDIS_COMMAND_MODE,
  NODE_ENV !== 'production'
);
export const START_GENERATION_WORKERS_ON_BOOT = readBoolean(
  process.env.START_GENERATION_WORKERS_ON_BOOT,
  !LOW_REDIS_COMMAND_MODE && NODE_ENV === 'production'
);
export const START_BACKGROUND_WORKERS_ON_BOOT = readBoolean(
  process.env.START_BACKGROUND_WORKERS_ON_BOOT,
  !LOW_REDIS_COMMAND_MODE && NODE_ENV === 'production'
);
export const GENERATION_WORKER_IDLE_SHUTDOWN_MS = Number(
  process.env.GENERATION_WORKER_IDLE_SHUTDOWN_MS ||
    (LOW_REDIS_COMMAND_MODE ? 15_000 : 0)
);
export const ANALYTICS_WORKER_IDLE_SHUTDOWN_MS = Number(
  process.env.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS ||
    (LOW_REDIS_COMMAND_MODE ? 15_000 : 0)
);
export const BULLMQ_WORKER_DRAIN_DELAY_SECONDS = Number(
  process.env.BULLMQ_WORKER_DRAIN_DELAY_SECONDS ||
    (LOW_REDIS_COMMAND_MODE ? 60 : 5)
);
export const BULLMQ_WORKER_STALLED_INTERVAL_MS = Number(
  process.env.BULLMQ_WORKER_STALLED_INTERVAL_MS ||
    (LOW_REDIS_COMMAND_MODE ? 5 * 60_000 : 30_000)
);
export const JOB_RUNTIME_TTL_MS = Number(
  process.env.JOB_RUNTIME_TTL_MS || 24 * 60 * 60_000
);
export const JOB_CANCELLATION_TTL_MS = Number(
  process.env.JOB_CANCELLATION_TTL_MS || 30 * 60_000
);
export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const DEFAULT_GROQ_MODEL =
  process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
export const GEMINI_GENERATION_TIMEOUT_MS = Number(
  process.env.GEMINI_GENERATION_TIMEOUT_MS || 25_000
);
export const GEMINI_FALLBACK_GRACE_MS = Number(
  process.env.GEMINI_FALLBACK_GRACE_MS || 9_000
);
export const GROQ_GENERATION_TIMEOUT_MS = Number(
  process.env.GROQ_GENERATION_TIMEOUT_MS || 18_000
);
export const GROQ_FIRST_TOKEN_TIMEOUT_MS = Number(
  process.env.GROQ_FIRST_TOKEN_TIMEOUT_MS || 12_000
);
export const GROQ_STREAM_IDLE_TIMEOUT_MS = Number(
  process.env.GROQ_STREAM_IDLE_TIMEOUT_MS || 15_000
);
export const GROQ_MAX_GENERATION_TIMEOUT_MS = Number(
  process.env.GROQ_MAX_GENERATION_TIMEOUT_MS || 90_000
);
export const GROQ_TRANSCRIPTION_MODEL =
  process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3';
export const GROQ_TRANSCRIPTION_TIMEOUT_MS = Number(
  process.env.GROQ_TRANSCRIPTION_TIMEOUT_MS || 5 * 60_000
);
export const TRANSCRIPTION_MAX_AUDIO_BYTES = Number(
  process.env.TRANSCRIPTION_MAX_AUDIO_BYTES || 50 * 1024 * 1024
);
export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
export const META_FACEBOOK_APP_ID =
  process.env.META_FACEBOOK_APP_ID || process.env.META_APP_ID || '';
export const META_FACEBOOK_APP_SECRET =
  process.env.META_FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || '';
export const META_INSTAGRAM_APP_ID = process.env.META_INSTAGRAM_APP_ID || '';
export const META_INSTAGRAM_APP_SECRET =
  process.env.META_INSTAGRAM_APP_SECRET || '';
const DEFAULT_META_REDIRECT_URI =
  process.env.META_REDIRECT_URI ||
  `${SERVER_PUBLIC_URL}/api/scheduler/oauth/meta/callback`;
export const META_FACEBOOK_REDIRECT_URI =
  process.env.META_FACEBOOK_REDIRECT_URI || DEFAULT_META_REDIRECT_URI;
export const META_INSTAGRAM_REDIRECT_URI =
  process.env.META_INSTAGRAM_REDIRECT_URI || DEFAULT_META_REDIRECT_URI;
export const META_REDIRECT_URI = DEFAULT_META_REDIRECT_URI;
export const META_OAUTH_CONFIG_ID =
  process.env.META_OAUTH_CONFIG_ID || process.env.META_CONFIG_ID || '';
export const META_OAUTH_STATE_SECRET = process.env.META_OAUTH_STATE_SECRET || '';
export const META_OAUTH_DEBUG = readBoolean(
  process.env.META_OAUTH_DEBUG,
  (process.env.NODE_ENV || 'development') !== 'production'
);
const toScopeList = (value: string | undefined, fallback: string[]) =>
  (value || fallback.join(','))
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

export const META_FACEBOOK_OAUTH_SCOPES = toScopeList(
  process.env.META_FACEBOOK_OAUTH_SCOPES,
  ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
);

export const META_INSTAGRAM_OAUTH_SCOPES = toScopeList(
  process.env.META_INSTAGRAM_OAUTH_SCOPES,
  [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
    'instagram_business_manage_insights',
  ]
);
export const META_OAUTH_STATE_TTL_MS = Number(
  process.env.META_OAUTH_STATE_TTL_MS || 10 * 60_000
);
export const ANALYTICS_SYNC_LOOKBACK_DAYS = Number(
  process.env.ANALYTICS_SYNC_LOOKBACK_DAYS || 30
);
export const isMetaOAuthConfigured = Boolean(
  META_OAUTH_STATE_SECRET &&
    ((META_FACEBOOK_APP_ID && META_FACEBOOK_APP_SECRET) ||
      (META_INSTAGRAM_APP_ID && META_INSTAGRAM_APP_SECRET))
);
export const isMetaFacebookOAuthConfigured = Boolean(
  META_FACEBOOK_APP_ID &&
    META_FACEBOOK_APP_SECRET &&
    META_OAUTH_STATE_SECRET
);
export const isMetaInstagramOAuthConfigured = Boolean(
  META_INSTAGRAM_APP_ID &&
    META_INSTAGRAM_APP_SECRET &&
    META_OAUTH_STATE_SECRET
);

export const CAPTION_VARIATION_COUNT = 3;
export const HASHTAG_VARIATION_COUNT = 15;

export const FEATURE_KEYS = {
  contentGeneration: 'content_generation',
  imageGeneration: 'image_generation',
  reelScriptGeneration: 'reel_script_generation',
  socialAccountConnection: 'social_account_connection',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];
export const IMAGE_QUEUE_TIERS = ['priority', 'normal', 'slow'] as const;
export type ImageQueueTier = (typeof IMAGE_QUEUE_TIERS)[number];

export const IMAGE_SPEED_TIERS = ['fast', 'standard', 'slow'] as const;
export type ImageSpeedTier = (typeof IMAGE_SPEED_TIERS)[number];

export const PLAN_LIMITS: Record<PlanType, number | null> = {
  free: 20,
  basic: 150,
  pro: null,
};

export const PLAN_FEATURE_LIMITS: Record<
  PlanType,
  Record<FeatureKey, number | null>
> = {
  free: {
    [FEATURE_KEYS.contentGeneration]: 15,
    [FEATURE_KEYS.imageGeneration]: 5,
    [FEATURE_KEYS.reelScriptGeneration]: 4,
    [FEATURE_KEYS.socialAccountConnection]: 1,
  },
  basic: {
    [FEATURE_KEYS.contentGeneration]: 25,
    [FEATURE_KEYS.imageGeneration]: 15,
    [FEATURE_KEYS.reelScriptGeneration]: 15,
    [FEATURE_KEYS.socialAccountConnection]: 2,
  },
  pro: {
    [FEATURE_KEYS.contentGeneration]: 60,
    [FEATURE_KEYS.imageGeneration]: 35,
    [FEATURE_KEYS.reelScriptGeneration]: 30,
    [FEATURE_KEYS.socialAccountConnection]: 5,
  },
};

export const IMAGE_RUNTIME_POLICIES: Record<
  PlanType,
  {
    requestsPerMinute: number | null;
    defaultQueueTier: ImageQueueTier;
    defaultSpeedTier: ImageSpeedTier;
    burstLimit: number | null;
    burstWindowMs: number | null;
    throttleDelayMsAfterBurst: number;
  }
> = {
  free: {
    requestsPerMinute: 2,
    defaultQueueTier: 'slow',
    defaultSpeedTier: 'slow',
    burstLimit: null,
    burstWindowMs: null,
    throttleDelayMsAfterBurst: 0,
  },
  basic: {
    requestsPerMinute: 4,
    defaultQueueTier: 'normal',
    defaultSpeedTier: 'standard',
    burstLimit: 6,
    burstWindowMs: 10 * 60_000,
    throttleDelayMsAfterBurst: 3_000,
  },
  pro: {
    requestsPerMinute: 10,
    defaultQueueTier: 'priority',
    defaultSpeedTier: 'fast',
    burstLimit: 15,
    burstWindowMs: 10 * 60_000,
    throttleDelayMsAfterBurst: 1_000,
  },
};

export const FREE_IMAGE_NORMAL_QUEUE_DAILY_THRESHOLD = 3;
export const FREE_IMAGE_STANDARD_SPEED_DAILY_THRESHOLD = 2;
export const IMAGE_QUEUE_CONCURRENCY = 2;
export const IMAGE_GENERATION_JOB_ATTEMPTS = Number(
  process.env.IMAGE_GENERATION_JOB_ATTEMPTS || 2
);
export const IMAGE_GENERATION_JOB_BACKOFF_MS = Number(
  process.env.IMAGE_GENERATION_JOB_BACKOFF_MS || 2_000
);
export const CONTENT_GENERATION_JOB_CONCURRENCY = Number(
  process.env.CONTENT_GENERATION_JOB_CONCURRENCY || 4
);
export const CONTENT_GENERATION_JOB_ATTEMPTS = Number(
  process.env.CONTENT_GENERATION_JOB_ATTEMPTS || 2
);
export const CONTENT_GENERATION_JOB_BACKOFF_MS = Number(
  process.env.CONTENT_GENERATION_JOB_BACKOFF_MS || 1_500
);
export const IMAGE_PROVIDER_FAILURE_THRESHOLD = Number(
  process.env.IMAGE_PROVIDER_FAILURE_THRESHOLD || 3
);
export const IMAGE_PROVIDER_OPEN_MS = Number(
  process.env.IMAGE_PROVIDER_OPEN_MS || 60_000
);
export const SCHEDULER_PUBLISH_JOB_CONCURRENCY = Number(
  process.env.SCHEDULER_PUBLISH_JOB_CONCURRENCY || 4
);
export const ANALYTICS_SYNC_JOB_CONCURRENCY = Number(
  process.env.ANALYTICS_SYNC_JOB_CONCURRENCY || 4
);

export const BILLING_PLAN_CATALOG: Record<PlanType, BillingPlan> = {
  free: {
    id: 'free',
    displayName: 'Free',
    description: 'Starter plan for trying content and image generation',
    amountInPaise: 0,
    currency: 'INR',
    interval: 1,
    period: 'monthly',
    monthlyLimit: PLAN_LIMITS.free,
    isFree: true,
    checkoutEnabled: false,
  },
  basic: {
    id: 'basic',
    displayName: 'Basic',
    description: 'Monthly plan for growing creators and small brands',
    amountInPaise: Number(process.env.RAZORPAY_BASIC_PRICE_PAISE || 49900),
    currency: 'INR',
    interval: 1,
    period: 'monthly',
    monthlyLimit: PLAN_LIMITS.basic,
    isFree: false,
    checkoutEnabled: Boolean(process.env.RAZORPAY_PLAN_ID_BASIC),
  },
  pro: {
    id: 'pro',
    displayName: 'Pro',
    description: 'Advanced monthly plan for teams and higher usage',
    amountInPaise: Number(process.env.RAZORPAY_PRO_PRICE_PAISE || 149900),
    currency: 'INR',
    interval: 1,
    period: 'monthly',
    monthlyLimit: PLAN_LIMITS.pro,
    isFree: false,
    checkoutEnabled: Boolean(process.env.RAZORPAY_PLAN_ID_PRO),
  },
};

export const IMAGE_BUCKETS = {
  originals: process.env.R2_ORIGINALS_BUCKET || 'product-originals',
  generated: process.env.R2_GENERATED_BUCKET || 'generated-images',
} as const;

export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
export const R2_S3_ENDPOINT = trimTrailingSlash(
  process.env.R2_S3_ENDPOINT ||
    (R2_ACCOUNT_ID
      ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : '')
);
export const R2_PUBLIC_BASE_URL = trimTrailingSlash(
  process.env.R2_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_DEV_URL ||
    ''
);

export const SUPABASE_SOURCE_IMAGE_BUCKET =
  process.env.SUPABASE_SOURCE_IMAGE_BUCKET || 'source-images';

export const SCHEDULED_POST_STATUSES = [
  'pending',
  'scheduled',
  'published',
  'failed',
  'cancelled',
] as const;

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
] as const;
