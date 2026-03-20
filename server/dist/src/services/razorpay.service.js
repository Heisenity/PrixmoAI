"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSubscriptionUpsertPayload = exports.verifyRazorpayWebhookSignature = exports.cancelRazorpaySubscription = exports.fetchRazorpaySubscription = exports.createHostedSubscriptionCheckout = exports.inferPlanFromRazorpayData = exports.mapRazorpayStatusToInternalStatus = exports.getBillingPlans = void 0;
const crypto_1 = require("crypto");
const constants_1 = require("../config/constants");
const RAZORPAY_BASE_URL = process.env.RAZORPAY_BASE_URL || 'https://api.razorpay.com/v1';
const getRazorpayCredentials = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }
    return {
        keyId,
        keySecret,
    };
};
const getRazorpayPlanId = (plan) => {
    const mapping = {
        basic: process.env.RAZORPAY_PLAN_ID_BASIC,
        pro: process.env.RAZORPAY_PLAN_ID_PRO,
    };
    const planId = mapping[plan];
    if (!planId) {
        throw new Error(`Razorpay plan ID is not configured for ${plan}. Set RAZORPAY_PLAN_ID_${plan.toUpperCase()}.`);
    }
    return planId;
};
const toUnixTimestamp = (value) => {
    if (!value) {
        return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid billing date provided');
    }
    return Math.floor(date.getTime() / 1000);
};
const getErrorMessage = (payload, fallback) => {
    if (!payload || typeof payload !== 'object') {
        return fallback;
    }
    const record = payload;
    if (record.error && typeof record.error === 'object') {
        const errorRecord = record.error;
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
const razorpayRequest = async (path, init = {}, fallbackErrorMessage) => {
    const { keyId, keySecret } = getRazorpayCredentials();
    const response = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers ?? {}),
        },
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok || !payload) {
        throw new Error(getErrorMessage(payload, fallbackErrorMessage));
    }
    return payload;
};
const getBillingPlans = () => Object.values(constants_1.BILLING_PLAN_CATALOG);
exports.getBillingPlans = getBillingPlans;
const mapRazorpayStatusToInternalStatus = (razorpayStatus) => {
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
exports.mapRazorpayStatusToInternalStatus = mapRazorpayStatusToInternalStatus;
const inferPlanFromRazorpayData = (subscription, fallbackPlan = 'free') => {
    const notesPlan = typeof subscription.notes?.plan === 'string'
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
exports.inferPlanFromRazorpayData = inferPlanFromRazorpayData;
const createHostedSubscriptionCheckout = async (input) => {
    const planId = getRazorpayPlanId(input.plan);
    const totalCount = input.totalCount ?? 120;
    const quantity = input.quantity ?? 1;
    return razorpayRequest('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
            plan_id: planId,
            total_count: totalCount,
            quantity,
            customer_notify: 1,
            notify_info: input.email || input.phone
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
    }, 'Failed to create Razorpay subscription checkout');
};
exports.createHostedSubscriptionCheckout = createHostedSubscriptionCheckout;
const fetchRazorpaySubscription = async (subscriptionId) => razorpayRequest(`/subscriptions/${subscriptionId}`, { method: 'GET' }, 'Failed to fetch Razorpay subscription');
exports.fetchRazorpaySubscription = fetchRazorpaySubscription;
const cancelRazorpaySubscription = async (subscriptionId, cancelAtCycleEnd = true) => razorpayRequest(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
        cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
    }),
}, 'Failed to cancel Razorpay subscription');
exports.cancelRazorpaySubscription = cancelRazorpaySubscription;
const verifyRazorpayWebhookSignature = (rawBody, signature) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error('Razorpay webhook is not configured. Set RAZORPAY_WEBHOOK_SECRET.');
    }
    if (!signature || Array.isArray(signature)) {
        return false;
    }
    const expectedSignature = (0, crypto_1.createHmac)('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(expectedBuffer, providedBuffer);
};
exports.verifyRazorpayWebhookSignature = verifyRazorpayWebhookSignature;
const toSubscriptionUpsertPayload = (userId, subscription, fallbackPlan = 'free') => {
    const plan = (0, exports.inferPlanFromRazorpayData)(subscription, fallbackPlan);
    return {
        userId,
        plan,
        status: (0, exports.mapRazorpayStatusToInternalStatus)(subscription.status),
        monthlyLimit: constants_1.PLAN_LIMITS[plan],
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
exports.toSubscriptionUpsertPayload = toSubscriptionUpsertPayload;
