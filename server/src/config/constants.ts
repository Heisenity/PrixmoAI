import dotenv from 'dotenv';
import type { BillingPlan, PlanType } from '../types';

dotenv.config();

export const APP_PORT = Number(process.env.PORT || 5000);
export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const CAPTION_VARIATION_COUNT = 3;
export const HASHTAG_VARIATION_COUNT = 15;

export const FEATURE_KEYS = {
  contentGeneration: 'content_generation',
  imageGeneration: 'image_generation',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const PLAN_LIMITS: Record<PlanType, number | null> = {
  free: 8,
  basic: 30,
  pro: null,
};

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
