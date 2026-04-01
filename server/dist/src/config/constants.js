"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBSCRIPTION_STATUSES = exports.SCHEDULED_POST_STATUSES = exports.SUPABASE_SOURCE_IMAGE_BUCKET = exports.IMAGE_BUCKETS = exports.BILLING_PLAN_CATALOG = exports.IMAGE_QUEUE_CONCURRENCY = exports.FREE_IMAGE_STANDARD_SPEED_DAILY_THRESHOLD = exports.FREE_IMAGE_NORMAL_QUEUE_DAILY_THRESHOLD = exports.IMAGE_RUNTIME_POLICIES = exports.PLAN_FEATURE_LIMITS = exports.PLAN_LIMITS = exports.IMAGE_SPEED_TIERS = exports.IMAGE_QUEUE_TIERS = exports.FEATURE_KEYS = exports.HASHTAG_VARIATION_COUNT = exports.CAPTION_VARIATION_COUNT = exports.isMetaInstagramOAuthConfigured = exports.isMetaFacebookOAuthConfigured = exports.isMetaOAuthConfigured = exports.SCHEDULER_PUBLISHER_BATCH_SIZE = exports.SCHEDULER_PUBLISHER_POLL_MS = exports.META_OAUTH_STATE_TTL_MS = exports.META_INSTAGRAM_OAUTH_SCOPES = exports.META_FACEBOOK_OAUTH_SCOPES = exports.META_OAUTH_STATE_SECRET = exports.META_OAUTH_CONFIG_ID = exports.META_REDIRECT_URI = exports.META_INSTAGRAM_APP_SECRET = exports.META_INSTAGRAM_APP_ID = exports.META_FACEBOOK_APP_SECRET = exports.META_FACEBOOK_APP_ID = exports.META_GRAPH_VERSION = exports.DEFAULT_GEMINI_MODEL = exports.CLIENT_APP_URL = exports.SERVER_PUBLIC_URL = exports.APP_PORT = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.APP_PORT = Number(process.env.PORT || 5000);
const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
exports.SERVER_PUBLIC_URL = trimTrailingSlash(process.env.SERVER_PUBLIC_URL || `http://localhost:${exports.APP_PORT}`);
exports.CLIENT_APP_URL = trimTrailingSlash(process.env.CLIENT_APP_URL || 'http://localhost:5173');
exports.DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
exports.META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
exports.META_FACEBOOK_APP_ID = process.env.META_FACEBOOK_APP_ID || process.env.META_APP_ID || '';
exports.META_FACEBOOK_APP_SECRET = process.env.META_FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || '';
exports.META_INSTAGRAM_APP_ID = process.env.META_INSTAGRAM_APP_ID || exports.META_FACEBOOK_APP_ID;
exports.META_INSTAGRAM_APP_SECRET = process.env.META_INSTAGRAM_APP_SECRET || exports.META_FACEBOOK_APP_SECRET;
exports.META_REDIRECT_URI = process.env.META_REDIRECT_URI ||
    `${exports.SERVER_PUBLIC_URL}/api/scheduler/oauth/meta/callback`;
exports.META_OAUTH_CONFIG_ID = process.env.META_OAUTH_CONFIG_ID || process.env.META_CONFIG_ID || '';
exports.META_OAUTH_STATE_SECRET = process.env.META_OAUTH_STATE_SECRET || '';
const toScopeList = (value, fallback) => (value || fallback.join(','))
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
exports.META_FACEBOOK_OAUTH_SCOPES = toScopeList(process.env.META_FACEBOOK_OAUTH_SCOPES, ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']);
exports.META_INSTAGRAM_OAUTH_SCOPES = toScopeList(process.env.META_INSTAGRAM_OAUTH_SCOPES, [
    'instagram_business_basic',
    'instagram_business_content_publish',
]);
exports.META_OAUTH_STATE_TTL_MS = Number(process.env.META_OAUTH_STATE_TTL_MS || 10 * 60000);
exports.SCHEDULER_PUBLISHER_POLL_MS = Number(process.env.SCHEDULER_PUBLISHER_POLL_MS || 30000);
exports.SCHEDULER_PUBLISHER_BATCH_SIZE = Number(process.env.SCHEDULER_PUBLISHER_BATCH_SIZE || 10);
exports.isMetaOAuthConfigured = Boolean(exports.META_OAUTH_STATE_SECRET &&
    ((exports.META_FACEBOOK_APP_ID && exports.META_FACEBOOK_APP_SECRET) ||
        (exports.META_INSTAGRAM_APP_ID && exports.META_INSTAGRAM_APP_SECRET)));
exports.isMetaFacebookOAuthConfigured = Boolean(exports.META_FACEBOOK_APP_ID &&
    exports.META_FACEBOOK_APP_SECRET &&
    exports.META_OAUTH_STATE_SECRET);
exports.isMetaInstagramOAuthConfigured = Boolean(((exports.META_INSTAGRAM_APP_ID && exports.META_INSTAGRAM_APP_SECRET) ||
    (exports.META_FACEBOOK_APP_ID && exports.META_FACEBOOK_APP_SECRET)) &&
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
