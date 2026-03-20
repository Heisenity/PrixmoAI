import { createHmac, timingSafeEqual } from 'crypto';
import { BILLING_PLAN_CATALOG, PLAN_LIMITS } from '../config/constants';
import type { BillingPlan, PlanType, SubscriptionStatus } from '../types';

export type RazorpaySubscription = {
  id: string;
  plan_id?: string | null;
  status?: string | null;
  short_url?: string | null;
  customer_notify?: boolean;
  current_end?: number | null;
  auth_attempts?: number | null;
  charge_at?: number | null;
  total_count?: number | null;
  paid_count?: number | null;
  remaining_count?: number | null;
  customer_id?: string | null;
  notes?: Record<string, unknown> | null;
};

type CreateCheckoutInput = {
  userId: string;
  plan: Exclude<PlanType, 'free'>;
  email?: string | null;
  phone?: string | null;
  totalCount?: number;
  quantity?: number;
  startAt?: string | null;
  expireBy?: string | null;
};

type RazorpayResponse<T> = T & {
  error?: {
    description?: string;
    reason?: string;
    code?: string;
  };
};

const RAZORPAY_BASE_URL =
  process.env.RAZORPAY_BASE_URL || 'https://api.razorpay.com/v1';

const getRazorpayCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

  return {
    keyId,
    keySecret,
  };
};

const getRazorpayPlanId = (plan: Exclude<PlanType, 'free'>) => {
  const mapping: Record<Exclude<PlanType, 'free'>, string | undefined> = {
    basic: process.env.RAZORPAY_PLAN_ID_BASIC,
    pro: process.env.RAZORPAY_PLAN_ID_PRO,
  };

  const planId = mapping[plan];

  if (!planId) {
    throw new Error(
      `Razorpay plan ID is not configured for ${plan}. Set RAZORPAY_PLAN_ID_${plan.toUpperCase()}.`
    );
  }

  return planId;
};

const toUnixTimestamp = (value?: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid billing date provided');
  }

  return Math.floor(date.getTime() / 1000);
};

const getErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const record = payload as Record<string, unknown>;

  if (record.error && typeof record.error === 'object') {
    const errorRecord = record.error as Record<string, unknown>;
    const candidates = [
      errorRecord.description,
      errorRecord.reason,
      errorRecord.code,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }

  return fallback;
};

const razorpayRequest = async <T>(
  path: string,
  init: RequestInit = {},
  fallbackErrorMessage: string
): Promise<T> => {
  const { keyId, keySecret } = getRazorpayCredentials();
  const response = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as RazorpayResponse<T> | null;

  if (!response.ok || !payload) {
    throw new Error(getErrorMessage(payload, fallbackErrorMessage));
  }

  return payload;
};

export const getBillingPlans = (): BillingPlan[] =>
  Object.values(BILLING_PLAN_CATALOG);

export const mapRazorpayStatusToInternalStatus = (
  razorpayStatus?: string | null
): SubscriptionStatus => {
  switch ((razorpayStatus || '').toLowerCase()) {
    case 'active':
      return 'active';
    case 'completed':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
    case 'halted':
    case 'pending':
      return 'past_due';
    case 'authenticated':
    case 'created':
    default:
      return 'trialing';
  }
};

export const inferPlanFromRazorpayData = (
  subscription: RazorpaySubscription,
  fallbackPlan: PlanType = 'free'
): PlanType => {
  const notesPlan =
    typeof subscription.notes?.plan === 'string'
      ? subscription.notes.plan
      : null;

  if (notesPlan === 'basic' || notesPlan === 'pro' || notesPlan === 'free') {
    return notesPlan;
  }

  const planId = subscription.plan_id;

  if (planId && planId === process.env.RAZORPAY_PLAN_ID_BASIC) {
    return 'basic';
  }

  if (planId && planId === process.env.RAZORPAY_PLAN_ID_PRO) {
    return 'pro';
  }

  return fallbackPlan;
};

export const createHostedSubscriptionCheckout = async (
  input: CreateCheckoutInput
): Promise<RazorpaySubscription> => {
  const planId = getRazorpayPlanId(input.plan);
  const totalCount = input.totalCount ?? 120;
  const quantity = input.quantity ?? 1;

  return razorpayRequest<RazorpaySubscription>(
    '/subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        total_count: totalCount,
        quantity,
        customer_notify: 1,
        notify_info:
          input.email || input.phone
            ? {
                ...(input.email ? { notify_email: input.email } : {}),
                ...(input.phone ? { notify_phone: input.phone } : {}),
              }
            : undefined,
        start_at: toUnixTimestamp(input.startAt),
        expire_by: toUnixTimestamp(input.expireBy),
        notes: {
          userId: input.userId,
          plan: input.plan,
        },
      }),
    },
    'Failed to create Razorpay subscription checkout'
  );
};

export const fetchRazorpaySubscription = async (
  subscriptionId: string
): Promise<RazorpaySubscription> =>
  razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${subscriptionId}`,
    { method: 'GET' },
    'Failed to fetch Razorpay subscription'
  );

export const cancelRazorpaySubscription = async (
  subscriptionId: string,
  cancelAtCycleEnd = true
): Promise<RazorpaySubscription> =>
  razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
      }),
    },
    'Failed to cancel Razorpay subscription'
  );

export const verifyRazorpayWebhookSignature = (
  rawBody: Buffer,
  signature?: string | string[]
): boolean => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error(
      'Razorpay webhook is not configured. Set RAZORPAY_WEBHOOK_SECRET.'
    );
  }

  if (!signature || Array.isArray(signature)) {
    return false;
  }

  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};

export const toSubscriptionUpsertPayload = (
  userId: string,
  subscription: RazorpaySubscription,
  fallbackPlan: PlanType = 'free'
) => {
  const plan = inferPlanFromRazorpayData(subscription, fallbackPlan);

  return {
    userId,
    plan,
    status: mapRazorpayStatusToInternalStatus(subscription.status),
    monthlyLimit: PLAN_LIMITS[plan],
    currentPeriodEnd: subscription.current_end
      ? new Date(subscription.current_end * 1000).toISOString()
      : null,
    razorpayCustomerId: subscription.customer_id ?? null,
    razorpaySubscriptionId: subscription.id,
    metadata: {
      razorpayStatus: subscription.status ?? null,
      planId: subscription.plan_id ?? null,
      shortUrl: subscription.short_url ?? null,
      totalCount: subscription.total_count ?? null,
      paidCount: subscription.paid_count ?? null,
      remainingCount: subscription.remaining_count ?? null,
      authAttempts: subscription.auth_attempts ?? null,
      chargeAt: subscription.charge_at ?? null,
      notes: subscription.notes ?? {},
    },
  };
};
