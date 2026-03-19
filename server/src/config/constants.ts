import dotenv from 'dotenv';
import type { PlanType } from '../types';

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

export const IMAGE_BUCKETS = {
  originals: process.env.R2_ORIGINALS_BUCKET || 'product-originals',
  generated: process.env.R2_GENERATED_BUCKET || 'generated-images',
} as const;

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
