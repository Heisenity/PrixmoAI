import {
  FEATURE_KEYS,
  PLAN_FEATURE_LIMITS,
  PLAN_LIMITS,
  type FeatureKey,
} from '../../config/constants';
import type {
  CreateSubscriptionInput,
  PlanType,
  Subscription,
  UsageTrackingEvent,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type SubscriptionRow = {
  id: string;
  user_id: string;
  plan: PlanType;
  status: Subscription['status'];
  monthly_limit: number | null;
  current_period_end: string | null;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type UsageTrackingRow = {
  id: string;
  user_id: string;
  feature_key: string;
  used_at: string;
  metadata: Record<string, unknown> | null;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getMonthWindow = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const getDayWindow = () => {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const toSubscription = (row: SubscriptionRow): Subscription => ({
  id: row.id,
  userId: row.user_id,
  plan: row.plan,
  status: row.status,
  monthlyLimit: row.monthly_limit,
  currentPeriodEnd: row.current_period_end,
  razorpayCustomerId: row.razorpay_customer_id,
  razorpaySubscriptionId: row.razorpay_subscription_id,
  metadata: toRecord(row.metadata),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toUsageTrackingEvent = (row: UsageTrackingRow): UsageTrackingEvent => ({
  id: row.id,
  userId: row.user_id,
  featureKey: row.feature_key,
  usedAt: row.used_at,
  metadata: toRecord(row.metadata),
});

export const getPlanMonthlyLimit = (plan: PlanType): number | null =>
  PLAN_LIMITS[plan];

export const getPlanFeatureLimit = (
  plan: PlanType,
  featureKey: FeatureKey
): number | null => PLAN_FEATURE_LIMITS[plan][featureKey];

export const upsertSubscription = async (
  client: AppSupabaseClient,
  input: CreateSubscriptionInput
): Promise<Subscription> => {
  const { data, error } = await client
    .from('subscriptions')
    .upsert(
      {
        user_id: input.userId,
        plan: input.plan,
        status: input.status ?? 'active',
        monthly_limit:
          input.monthlyLimit === undefined
            ? getPlanMonthlyLimit(input.plan)
            : input.monthlyLimit,
        current_period_end: input.currentPeriodEnd ?? null,
        razorpay_customer_id: input.razorpayCustomerId ?? null,
        razorpay_subscription_id: input.razorpaySubscriptionId ?? null,
        metadata: input.metadata ?? {},
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save subscription');
  }

  return toSubscription(data as SubscriptionRow);
};

export const getCurrentSubscriptionByUserId = async (
  client: AppSupabaseClient,
  userId: string
): Promise<Subscription | null> => {
  const { data, error } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch subscription');
  }

  return data ? toSubscription(data as SubscriptionRow) : null;
};

export const getFeatureMonthlyLimit = async (
  client: AppSupabaseClient,
  userId: string,
  featureKey: FeatureKey = FEATURE_KEYS.contentGeneration
): Promise<number | null> => {
  const subscription = await getCurrentSubscriptionByUserId(client, userId);
  const plan = subscription?.plan ?? 'free';

  return getPlanFeatureLimit(plan, featureKey);
};

export const getFeatureLimit = getFeatureMonthlyLimit;

export const recordUsageEvent = async (
  client: AppSupabaseClient,
  userId: string,
  featureKey: string,
  metadata: Record<string, unknown> = {}
): Promise<UsageTrackingEvent> => {
  const { data, error } = await client
    .from('usage_tracking')
    .insert({
      user_id: userId,
      feature_key: featureKey,
      metadata,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to record usage');
  }

  return toUsageTrackingEvent(data as UsageTrackingRow);
};

const getUsageCountForWindow = async (
  client: AppSupabaseClient,
  userId: string,
  featureKey: string,
  window: 'day' | 'month'
): Promise<number> => {
  const { start, end } = window === 'day' ? getDayWindow() : getMonthWindow();
  const { count, error } = await client
    .from('usage_tracking')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature_key', featureKey)
    .gte('used_at', start)
    .lt('used_at', end);

  if (error) {
    throw new Error(error.message || 'Failed to fetch usage count');
  }

  return count ?? 0;
};

export const getMonthlyUsageCount = async (
  client: AppSupabaseClient,
  userId: string,
  featureKey: string
): Promise<number> => getUsageCountForWindow(client, userId, featureKey, 'month');

export const getDailyUsageCount = async (
  client: AppSupabaseClient,
  userId: string,
  featureKey: string
): Promise<number> => getUsageCountForWindow(client, userId, featureKey, 'day');
