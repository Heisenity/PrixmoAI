"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyUsageCount = exports.getMonthlyUsageCount = exports.recordUsageEvent = exports.getFeatureLimit = exports.getFeatureMonthlyLimit = exports.getCurrentSubscriptionByUserId = exports.upsertSubscription = exports.getPlanFeatureLimit = exports.getPlanMonthlyLimit = void 0;
const constants_1 = require("../../config/constants");
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
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
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
};
const toSubscription = (row) => ({
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
const toUsageTrackingEvent = (row) => ({
    id: row.id,
    userId: row.user_id,
    featureKey: row.feature_key,
    usedAt: row.used_at,
    metadata: toRecord(row.metadata),
});
const getPlanMonthlyLimit = (plan) => constants_1.PLAN_LIMITS[plan];
exports.getPlanMonthlyLimit = getPlanMonthlyLimit;
const getPlanFeatureLimit = (plan, featureKey) => constants_1.PLAN_FEATURE_LIMITS[plan][featureKey];
exports.getPlanFeatureLimit = getPlanFeatureLimit;
const upsertSubscription = async (client, input) => {
    const { data, error } = await client
        .from('subscriptions')
        .upsert({
        user_id: input.userId,
        plan: input.plan,
        status: input.status ?? 'active',
        monthly_limit: input.monthlyLimit === undefined
            ? (0, exports.getPlanMonthlyLimit)(input.plan)
            : input.monthlyLimit,
        current_period_end: input.currentPeriodEnd ?? null,
        razorpay_customer_id: input.razorpayCustomerId ?? null,
        razorpay_subscription_id: input.razorpaySubscriptionId ?? null,
        metadata: input.metadata ?? {},
    }, { onConflict: 'user_id' })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to save subscription');
    }
    return toSubscription(data);
};
exports.upsertSubscription = upsertSubscription;
const getCurrentSubscriptionByUserId = async (client, userId) => {
    const { data, error } = await client
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message || 'Failed to fetch subscription');
    }
    return data ? toSubscription(data) : null;
};
exports.getCurrentSubscriptionByUserId = getCurrentSubscriptionByUserId;
const getFeatureMonthlyLimit = async (client, userId, featureKey = constants_1.FEATURE_KEYS.contentGeneration) => {
    const subscription = await (0, exports.getCurrentSubscriptionByUserId)(client, userId);
    const plan = subscription?.plan ?? 'free';
    return (0, exports.getPlanFeatureLimit)(plan, featureKey);
};
exports.getFeatureMonthlyLimit = getFeatureMonthlyLimit;
exports.getFeatureLimit = exports.getFeatureMonthlyLimit;
const recordUsageEvent = async (client, userId, featureKey, metadata = {}) => {
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
    return toUsageTrackingEvent(data);
};
exports.recordUsageEvent = recordUsageEvent;
const getUsageCountForWindow = async (client, userId, featureKey, window) => {
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
const getMonthlyUsageCount = async (client, userId, featureKey) => getUsageCountForWindow(client, userId, featureKey, 'month');
exports.getMonthlyUsageCount = getMonthlyUsageCount;
const getDailyUsageCount = async (client, userId, featureKey) => getUsageCountForWindow(client, userId, featureKey, 'day');
exports.getDailyUsageCount = getDailyUsageCount;
