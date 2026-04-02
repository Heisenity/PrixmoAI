import dotenv from 'dotenv';
import type { BillingPlan, PlanType } from '../types';

dotenv.config();

export const APP_PORT = Number(process.env.PORT || 5000);
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
export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
export const SCHEDULER_PUBLISHER_POLL_MS = Number(
  process.env.SCHEDULER_PUBLISHER_POLL_MS || 30_000
);
export const SCHEDULER_PUBLISHER_BATCH_SIZE = Number(
  process.env.SCHEDULER_PUBLISHER_BATCH_SIZE || 10
);
export const ANALYTICS_SYNC_POLL_MS = Number(
  process.env.ANALYTICS_SYNC_POLL_MS || 15 * 60_000
);
export const ANALYTICS_SYNC_BATCH_SIZE = Number(
  process.env.ANALYTICS_SYNC_BATCH_SIZE || 10
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
