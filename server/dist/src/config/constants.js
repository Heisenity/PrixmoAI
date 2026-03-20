"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBSCRIPTION_STATUSES = exports.SCHEDULED_POST_STATUSES = exports.IMAGE_BUCKETS = exports.BILLING_PLAN_CATALOG = exports.PLAN_LIMITS = exports.FEATURE_KEYS = exports.HASHTAG_VARIATION_COUNT = exports.CAPTION_VARIATION_COUNT = exports.DEFAULT_GEMINI_MODEL = exports.APP_PORT = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.APP_PORT = Number(process.env.PORT || 5000);
exports.DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
exports.CAPTION_VARIATION_COUNT = 3;
exports.HASHTAG_VARIATION_COUNT = 15;
exports.FEATURE_KEYS = {
    contentGeneration: 'content_generation',
    imageGeneration: 'image_generation',
};
exports.PLAN_LIMITS = {
    free: 8,
    basic: 30,
    pro: null,
};
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
