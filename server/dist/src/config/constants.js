"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEATURE_KEYS = exports.HASHTAG_VARIATION_COUNT = exports.CAPTION_VARIATION_COUNT = exports.isMetaInstagramOAuthConfigured = exports.isMetaFacebookOAuthConfigured = exports.isMetaOAuthConfigured = exports.ANALYTICS_SYNC_LOOKBACK_DAYS = exports.META_OAUTH_STATE_TTL_MS = exports.META_INSTAGRAM_OAUTH_SCOPES = exports.META_FACEBOOK_OAUTH_SCOPES = exports.META_OAUTH_DEBUG = exports.META_OAUTH_STATE_SECRET = exports.META_OAUTH_CONFIG_ID = exports.META_REDIRECT_URI = exports.META_INSTAGRAM_REDIRECT_URI = exports.META_FACEBOOK_REDIRECT_URI = exports.META_INSTAGRAM_APP_SECRET = exports.META_INSTAGRAM_APP_ID = exports.META_FACEBOOK_APP_SECRET = exports.META_FACEBOOK_APP_ID = exports.META_GRAPH_VERSION = exports.TRANSCRIPTION_MAX_AUDIO_BYTES = exports.GROQ_TRANSCRIPTION_TIMEOUT_MS = exports.GROQ_TRANSCRIPTION_MODEL = exports.GROQ_MAX_GENERATION_TIMEOUT_MS = exports.GROQ_STREAM_IDLE_TIMEOUT_MS = exports.GROQ_FIRST_TOKEN_TIMEOUT_MS = exports.GROQ_GENERATION_TIMEOUT_MS = exports.GEMINI_FALLBACK_GRACE_MS = exports.GEMINI_GENERATION_TIMEOUT_MS = exports.DEFAULT_GROQ_MODEL = exports.DEFAULT_GEMINI_MODEL = exports.JOB_CANCELLATION_TTL_MS = exports.JOB_RUNTIME_TTL_MS = exports.BULLMQ_WORKER_STALLED_INTERVAL_MS = exports.BULLMQ_WORKER_DRAIN_DELAY_SECONDS = exports.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS = exports.GENERATION_WORKER_IDLE_SHUTDOWN_MS = exports.START_BACKGROUND_WORKERS_ON_BOOT = exports.START_GENERATION_WORKERS_ON_BOOT = exports.LOW_REDIS_COMMAND_MODE = exports.BULLMQ_PREFIX = exports.REDIS_TLS = exports.REDIS_KEY_PREFIX = exports.REDIS_TOKEN = exports.REDIS_URL = exports.CLIENT_APP_URL = exports.SERVER_PUBLIC_URL = exports.NODE_ENV = exports.APP_PORT = void 0;
exports.SUBSCRIPTION_STATUSES = exports.SCHEDULED_POST_STATUSES = exports.SUPABASE_SOURCE_IMAGE_BUCKET = exports.R2_PUBLIC_BASE_URL = exports.R2_S3_ENDPOINT = exports.R2_SECRET_ACCESS_KEY = exports.R2_ACCESS_KEY_ID = exports.R2_ACCOUNT_ID = exports.IMAGE_BUCKETS = exports.BILLING_PLAN_CATALOG = exports.ANALYTICS_SYNC_JOB_CONCURRENCY = exports.SCHEDULER_PUBLISH_JOB_CONCURRENCY = exports.IMAGE_PROVIDER_OPEN_MS = exports.IMAGE_PROVIDER_FAILURE_THRESHOLD = exports.CONTENT_GENERATION_JOB_BACKOFF_MS = exports.CONTENT_GENERATION_JOB_ATTEMPTS = exports.CONTENT_GENERATION_JOB_CONCURRENCY = exports.IMAGE_GENERATION_JOB_BACKOFF_MS = exports.IMAGE_GENERATION_JOB_ATTEMPTS = exports.IMAGE_QUEUE_CONCURRENCY = exports.FREE_IMAGE_STANDARD_SPEED_DAILY_THRESHOLD = exports.FREE_IMAGE_NORMAL_QUEUE_DAILY_THRESHOLD = exports.IMAGE_RUNTIME_POLICIES = exports.PLAN_FEATURE_LIMITS = exports.PLAN_LIMITS = exports.IMAGE_SPEED_TIERS = exports.IMAGE_QUEUE_TIERS = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.APP_PORT = Number(process.env.PORT || 5000);
exports.NODE_ENV = process.env.NODE_ENV || 'development';
const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
const readBoolean = (value, fallback) => {
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
exports.SERVER_PUBLIC_URL = trimTrailingSlash(process.env.SERVER_PUBLIC_URL || `http://localhost:${exports.APP_PORT}`);
exports.CLIENT_APP_URL = trimTrailingSlash(process.env.CLIENT_APP_URL || 'http://localhost:5173');
exports.REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || '';
exports.REDIS_TOKEN = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_TOKEN || '';
exports.REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'prixmoai';
exports.REDIS_TLS = readBoolean(process.env.REDIS_TLS, exports.REDIS_URL.includes('upstash.io'));
exports.BULLMQ_PREFIX = process.env.BULLMQ_PREFIX || `${exports.REDIS_KEY_PREFIX}:bullmq`;
exports.LOW_REDIS_COMMAND_MODE = readBoolean(process.env.LOW_REDIS_COMMAND_MODE, exports.NODE_ENV !== 'production');
exports.START_GENERATION_WORKERS_ON_BOOT = readBoolean(process.env.START_GENERATION_WORKERS_ON_BOOT, !exports.LOW_REDIS_COMMAND_MODE && exports.NODE_ENV === 'production');
exports.START_BACKGROUND_WORKERS_ON_BOOT = readBoolean(process.env.START_BACKGROUND_WORKERS_ON_BOOT, !exports.LOW_REDIS_COMMAND_MODE && exports.NODE_ENV === 'production');
exports.GENERATION_WORKER_IDLE_SHUTDOWN_MS = Number(process.env.GENERATION_WORKER_IDLE_SHUTDOWN_MS ||
    (exports.LOW_REDIS_COMMAND_MODE ? 15000 : 0));
exports.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS = Number(process.env.ANALYTICS_WORKER_IDLE_SHUTDOWN_MS ||
    (exports.LOW_REDIS_COMMAND_MODE ? 15000 : 0));
exports.BULLMQ_WORKER_DRAIN_DELAY_SECONDS = Number(process.env.BULLMQ_WORKER_DRAIN_DELAY_SECONDS ||
    (exports.LOW_REDIS_COMMAND_MODE ? 60 : 5));
exports.BULLMQ_WORKER_STALLED_INTERVAL_MS = Number(process.env.BULLMQ_WORKER_STALLED_INTERVAL_MS ||
    (exports.LOW_REDIS_COMMAND_MODE ? 5 * 60000 : 30000));
exports.JOB_RUNTIME_TTL_MS = Number(process.env.JOB_RUNTIME_TTL_MS || 24 * 60 * 60000);
exports.JOB_CANCELLATION_TTL_MS = Number(process.env.JOB_CANCELLATION_TTL_MS || 30 * 60000);
exports.DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
exports.DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
exports.GEMINI_GENERATION_TIMEOUT_MS = Number(process.env.GEMINI_GENERATION_TIMEOUT_MS || 25000);
exports.GEMINI_FALLBACK_GRACE_MS = Number(process.env.GEMINI_FALLBACK_GRACE_MS || 9000);
exports.GROQ_GENERATION_TIMEOUT_MS = Number(process.env.GROQ_GENERATION_TIMEOUT_MS || 18000);
exports.GROQ_FIRST_TOKEN_TIMEOUT_MS = Number(process.env.GROQ_FIRST_TOKEN_TIMEOUT_MS || 12000);
exports.GROQ_STREAM_IDLE_TIMEOUT_MS = Number(process.env.GROQ_STREAM_IDLE_TIMEOUT_MS || 15000);
exports.GROQ_MAX_GENERATION_TIMEOUT_MS = Number(process.env.GROQ_MAX_GENERATION_TIMEOUT_MS || 90000);
exports.GROQ_TRANSCRIPTION_MODEL = process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3';
exports.GROQ_TRANSCRIPTION_TIMEOUT_MS = Number(process.env.GROQ_TRANSCRIPTION_TIMEOUT_MS || 5 * 60000);
exports.TRANSCRIPTION_MAX_AUDIO_BYTES = Number(process.env.TRANSCRIPTION_MAX_AUDIO_BYTES || 50 * 1024 * 1024);
exports.META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
exports.META_FACEBOOK_APP_ID = process.env.META_FACEBOOK_APP_ID || process.env.META_APP_ID || '';
exports.META_FACEBOOK_APP_SECRET = process.env.META_FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || '';
exports.META_INSTAGRAM_APP_ID = process.env.META_INSTAGRAM_APP_ID || '';
exports.META_INSTAGRAM_APP_SECRET = process.env.META_INSTAGRAM_APP_SECRET || '';
const DEFAULT_META_REDIRECT_URI = process.env.META_REDIRECT_URI ||
    `${exports.SERVER_PUBLIC_URL}/api/scheduler/oauth/meta/callback`;
exports.META_FACEBOOK_REDIRECT_URI = process.env.META_FACEBOOK_REDIRECT_URI || DEFAULT_META_REDIRECT_URI;
exports.META_INSTAGRAM_REDIRECT_URI = process.env.META_INSTAGRAM_REDIRECT_URI || DEFAULT_META_REDIRECT_URI;
exports.META_REDIRECT_URI = DEFAULT_META_REDIRECT_URI;
exports.META_OAUTH_CONFIG_ID = process.env.META_OAUTH_CONFIG_ID || process.env.META_CONFIG_ID || '';
exports.META_OAUTH_STATE_SECRET = process.env.META_OAUTH_STATE_SECRET || '';
exports.META_OAUTH_DEBUG = readBoolean(process.env.META_OAUTH_DEBUG, (process.env.NODE_ENV || 'development') !== 'production');
const toScopeList = (value, fallback) => (value || fallback.join(','))
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
exports.META_FACEBOOK_OAUTH_SCOPES = toScopeList(process.env.META_FACEBOOK_OAUTH_SCOPES, ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']);
exports.META_INSTAGRAM_OAUTH_SCOPES = toScopeList(process.env.META_INSTAGRAM_OAUTH_SCOPES, [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
    'instagram_business_manage_insights',
]);
exports.META_OAUTH_STATE_TTL_MS = Number(process.env.META_OAUTH_STATE_TTL_MS || 10 * 60000);
exports.ANALYTICS_SYNC_LOOKBACK_DAYS = Number(process.env.ANALYTICS_SYNC_LOOKBACK_DAYS || 30);
exports.isMetaOAuthConfigured = Boolean(exports.META_OAUTH_STATE_SECRET &&
    ((exports.META_FACEBOOK_APP_ID && exports.META_FACEBOOK_APP_SECRET) ||
        (exports.META_INSTAGRAM_APP_ID && exports.META_INSTAGRAM_APP_SECRET)));
exports.isMetaFacebookOAuthConfigured = Boolean(exports.META_FACEBOOK_APP_ID &&
    exports.META_FACEBOOK_APP_SECRET &&
    exports.META_OAUTH_STATE_SECRET);
exports.isMetaInstagramOAuthConfigured = Boolean(exports.META_INSTAGRAM_APP_ID &&
    exports.META_INSTAGRAM_APP_SECRET &&
    exports.META_OAUTH_STATE_SECRET);
exports.CAPTION_VARIATION_COUNT = 3;
exports.HASHTAG_VARIATION_COUNT = 15;
exports.FEATURE_KEYS = {
    contentGeneration: 'content_generation',
    imageGeneration: 'image_generation',
    reelScriptGeneration: 'reel_script_generation',
    socialAccountConnection: 'social_account_connection',
};
exports.IMAGE_QUEUE_TIERS = ['priority', 'normal', 'slow'];
exports.IMAGE_SPEED_TIERS = ['fast', 'standard', 'slow'];
exports.PLAN_LIMITS = {
    free: 20,
    basic: 150,
    pro: null,
};
exports.PLAN_FEATURE_LIMITS = {
    free: {
        [exports.FEATURE_KEYS.contentGeneration]: 15,
        [exports.FEATURE_KEYS.imageGeneration]: 5,
        [exports.FEATURE_KEYS.reelScriptGeneration]: 4,
        [exports.FEATURE_KEYS.socialAccountConnection]: 1,
    },
    basic: {
        [exports.FEATURE_KEYS.contentGeneration]: 25,
        [exports.FEATURE_KEYS.imageGeneration]: 15,
        [exports.FEATURE_KEYS.reelScriptGeneration]: 15,
        [exports.FEATURE_KEYS.socialAccountConnection]: 2,
    },
    pro: {
        [exports.FEATURE_KEYS.contentGeneration]: 60,
        [exports.FEATURE_KEYS.imageGeneration]: 35,
        [exports.FEATURE_KEYS.reelScriptGeneration]: 30,
        [exports.FEATURE_KEYS.socialAccountConnection]: 5,
    },
};
exports.IMAGE_RUNTIME_POLICIES = {
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
        burstWindowMs: 10 * 60000,
        throttleDelayMsAfterBurst: 3000,
    },
    pro: {
        requestsPerMinute: 10,
        defaultQueueTier: 'priority',
        defaultSpeedTier: 'fast',
        burstLimit: 15,
        burstWindowMs: 10 * 60000,
        throttleDelayMsAfterBurst: 1000,
    },
};
exports.FREE_IMAGE_NORMAL_QUEUE_DAILY_THRESHOLD = 3;
exports.FREE_IMAGE_STANDARD_SPEED_DAILY_THRESHOLD = 2;
exports.IMAGE_QUEUE_CONCURRENCY = 2;
exports.IMAGE_GENERATION_JOB_ATTEMPTS = Number(process.env.IMAGE_GENERATION_JOB_ATTEMPTS || 2);
exports.IMAGE_GENERATION_JOB_BACKOFF_MS = Number(process.env.IMAGE_GENERATION_JOB_BACKOFF_MS || 2000);
exports.CONTENT_GENERATION_JOB_CONCURRENCY = Number(process.env.CONTENT_GENERATION_JOB_CONCURRENCY || 4);
exports.CONTENT_GENERATION_JOB_ATTEMPTS = Number(process.env.CONTENT_GENERATION_JOB_ATTEMPTS || 2);
exports.CONTENT_GENERATION_JOB_BACKOFF_MS = Number(process.env.CONTENT_GENERATION_JOB_BACKOFF_MS || 1500);
exports.IMAGE_PROVIDER_FAILURE_THRESHOLD = Number(process.env.IMAGE_PROVIDER_FAILURE_THRESHOLD || 3);
exports.IMAGE_PROVIDER_OPEN_MS = Number(process.env.IMAGE_PROVIDER_OPEN_MS || 60000);
exports.SCHEDULER_PUBLISH_JOB_CONCURRENCY = Number(process.env.SCHEDULER_PUBLISH_JOB_CONCURRENCY || 4);
exports.ANALYTICS_SYNC_JOB_CONCURRENCY = Number(process.env.ANALYTICS_SYNC_JOB_CONCURRENCY || 4);
exports.BILLING_PLAN_CATALOG = {
    free: {
        id: 'free',
        displayName: 'Free',
        description: 'Starter plan for trying content and image generation',
        amountInPaise: 0,
        currency: 'INR',
        interval: 1,
        period: 'monthly',
        monthlyLimit: exports.PLAN_LIMITS.free,
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
        monthlyLimit: exports.PLAN_LIMITS.basic,
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
        monthlyLimit: exports.PLAN_LIMITS.pro,
        isFree: false,
        checkoutEnabled: Boolean(process.env.RAZORPAY_PLAN_ID_PRO),
    },
};
exports.IMAGE_BUCKETS = {
    originals: process.env.R2_ORIGINALS_BUCKET || 'product-originals',
    generated: process.env.R2_GENERATED_BUCKET || 'generated-images',
};
exports.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
exports.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
exports.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
exports.R2_S3_ENDPOINT = trimTrailingSlash(process.env.R2_S3_ENDPOINT ||
    (exports.R2_ACCOUNT_ID
        ? `https://${exports.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : ''));
exports.R2_PUBLIC_BASE_URL = trimTrailingSlash(process.env.R2_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_DEV_URL ||
    '');
exports.SUPABASE_SOURCE_IMAGE_BUCKET = process.env.SUPABASE_SOURCE_IMAGE_BUCKET || 'source-images';
exports.SCHEDULED_POST_STATUSES = [
    'pending',
    'scheduled',
    'published',
    'failed',
    'cancelled',
];
exports.SUBSCRIPTION_STATUSES = [
    'trialing',
    'active',
    'past_due',
    'cancelled',
    'expired',
];
