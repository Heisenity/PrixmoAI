"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRazorpayWebhook = exports.cancelBillingSubscriptionController = exports.syncBillingSubscription = exports.createBillingCheckout = exports.getCurrentBillingSubscription = exports.getBillingPlanCatalog = void 0;
const constants_1 = require("../config/constants");
const subscriptions_1 = require("../db/queries/subscriptions");
const supabase_1 = require("../db/supabase");
const razorpay_service_1 = require("../services/razorpay.service");
const runtimeCache_service_1 = require("../services/runtimeCache.service");
const getDefaultFreeSubscription = (userId) => ({
    id: 'free-plan-local',
    userId,
    plan: 'free',
    status: 'active',
    monthlyLimit: constants_1.PLAN_LIMITS.free,
    currentPeriodEnd: null,
    razorpayCustomerId: null,
    razorpaySubscriptionId: null,
    metadata: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
});
const getAuthenticatedClient = (req) => {
    if (!req.user?.id) {
        return null;
    }
    return (0, supabase_1.requireUserClient)(req.accessToken);
};
const extractWebhookSubscription = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const record = payload;
    const payloadRecord = record.payload;
    const subscriptionRecord = payloadRecord?.subscription;
    const entity = subscriptionRecord?.entity;
    return entity && typeof entity === 'object'
        ? entity
        : null;
};
const getBillingPlanCatalog = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = getAuthenticatedClient(req);
        if (!client) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized',
            });
        }
        const data = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildBillingPlansCacheKey)(userId), async () => {
            const currentSubscription = (await (0, subscriptions_1.getCurrentSubscriptionByUserId)(client, userId)) ??
                getDefaultFreeSubscription(userId);
            return {
                currentSubscription,
                plans: (0, razorpay_service_1.getBillingPlans)(),
            };
        });
        return res.status(200).json({
            status: 'success',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch billing plans',
        });
    }
};
exports.getBillingPlanCatalog = getBillingPlanCatalog;
const getCurrentBillingSubscription = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = getAuthenticatedClient(req);
        if (!client) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized',
            });
        }
        const subscription = await (0, runtimeCache_service_1.getOrSetJsonCache)((0, runtimeCache_service_1.buildBillingSubscriptionCacheKey)(userId), async () => (await (0, subscriptions_1.getCurrentSubscriptionByUserId)(client, userId)) ??
            getDefaultFreeSubscription(userId));
        return res.status(200).json({
            status: 'success',
            data: subscription,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to fetch current subscription',
        });
    }
};
exports.getCurrentBillingSubscription = getCurrentBillingSubscription;
const createBillingCheckout = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = getAuthenticatedClient(req);
        if (!client) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized',
            });
        }
        const existingSubscription = await (0, subscriptions_1.getCurrentSubscriptionByUserId)(client, userId);
        if (existingSubscription &&
            existingSubscription.plan === req.body.plan &&
            (existingSubscription.status === 'active' ||
                existingSubscription.status === 'trialing')) {
            return res.status(400).json({
                status: 'fail',
                message: `You already have an active ${req.body.plan} subscription`,
            });
        }
        const checkout = await (0, razorpay_service_1.createHostedSubscriptionCheckout)({
            userId,
            plan: req.body.plan,
            email: req.user.email ?? null,
            totalCount: req.body.totalCount,
            quantity: req.body.quantity,
            startAt: req.body.startAt,
            expireBy: req.body.expireBy,
        });
        const localSubscription = await (0, subscriptions_1.upsertSubscription)(client, (0, razorpay_service_1.toSubscriptionUpsertPayload)(userId, checkout, req.body.plan));
        await (0, runtimeCache_service_1.invalidateBillingRuntimeCache)(userId);
        return res.status(200).json({
            status: 'success',
            message: 'Billing checkout created successfully',
            data: {
                subscription: localSubscription,
                checkoutUrl: checkout.short_url ?? null,
                razorpaySubscriptionId: checkout.id,
                plan: constants_1.BILLING_PLAN_CATALOG[req.body.plan],
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to create billing checkout',
        });
    }
};
exports.createBillingCheckout = createBillingCheckout;
const syncBillingSubscription = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = getAuthenticatedClient(req);
        if (!client) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized',
            });
        }
        const currentSubscription = await (0, subscriptions_1.getCurrentSubscriptionByUserId)(client, userId);
        const subscriptionId = req.body.subscriptionId ?? currentSubscription?.razorpaySubscriptionId;
        if (!subscriptionId) {
            return res.status(400).json({
                status: 'fail',
                message: 'No Razorpay subscription ID available to sync',
            });
        }
        const remoteSubscription = await (0, razorpay_service_1.fetchRazorpaySubscription)(subscriptionId);
        const fallbackPlan = currentSubscription?.plan ?? 'free';
        const localSubscription = await (0, subscriptions_1.upsertSubscription)(client, (0, razorpay_service_1.toSubscriptionUpsertPayload)(userId, remoteSubscription, fallbackPlan));
        await (0, runtimeCache_service_1.invalidateBillingRuntimeCache)(userId);
        return res.status(200).json({
            status: 'success',
            message: 'Subscription synced successfully',
            data: {
                subscription: localSubscription,
                razorpayStatus: remoteSubscription.status ?? null,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to sync subscription',
        });
    }
};
exports.syncBillingSubscription = syncBillingSubscription;
const cancelBillingSubscriptionController = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const userId = req.user.id;
        const client = getAuthenticatedClient(req);
        if (!client) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized',
            });
        }
        const currentSubscription = await (0, subscriptions_1.getCurrentSubscriptionByUserId)(client, userId);
        if (!currentSubscription?.razorpaySubscriptionId) {
            return res.status(400).json({
                status: 'fail',
                message: 'No paid subscription found to cancel',
            });
        }
        const remoteSubscription = await (0, razorpay_service_1.cancelRazorpaySubscription)(currentSubscription.razorpaySubscriptionId, req.body.cancelAtCycleEnd ?? true);
        const localSubscription = await (0, subscriptions_1.upsertSubscription)(client, (0, razorpay_service_1.toSubscriptionUpsertPayload)(userId, remoteSubscription, currentSubscription.plan));
        await (0, runtimeCache_service_1.invalidateBillingRuntimeCache)(userId);
        return res.status(200).json({
            status: 'success',
            message: 'Subscription cancelled successfully',
            data: localSubscription,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to cancel subscription',
        });
    }
};
exports.cancelBillingSubscriptionController = cancelBillingSubscriptionController;
const handleRazorpayWebhook = async (req, res) => {
    try {
        const rawBody = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(JSON.stringify(req.body ?? {}));
        const isValid = (0, razorpay_service_1.verifyRazorpayWebhookSignature)(rawBody, req.headers['x-razorpay-signature']);
        if (!isValid) {
            return res.status(401).json({
                status: 'fail',
                message: 'Invalid webhook signature',
            });
        }
        const payload = JSON.parse(rawBody.toString('utf8'));
        const entity = extractWebhookSubscription(payload);
        if (!entity) {
            return res.status(200).json({
                status: 'success',
                message: 'Webhook received without subscription payload',
            });
        }
        const notes = entity.notes;
        const userId = typeof notes?.userId === 'string' && notes.userId.trim()
            ? notes.userId
            : null;
        if (!userId) {
            return res.status(400).json({
                status: 'fail',
                message: 'Webhook subscription payload is missing notes.userId',
            });
        }
        const adminClient = (0, supabase_1.requireSupabaseAdmin)();
        const subscriptionEntity = entity;
        const fallbackPlan = typeof notes?.plan === 'string' &&
            (notes.plan === 'free' || notes.plan === 'basic' || notes.plan === 'pro')
            ? notes.plan
            : (0, razorpay_service_1.inferPlanFromRazorpayData)(subscriptionEntity, 'free');
        const localSubscription = await (0, subscriptions_1.upsertSubscription)(adminClient, (0, razorpay_service_1.toSubscriptionUpsertPayload)(userId, subscriptionEntity, fallbackPlan));
        await (0, runtimeCache_service_1.invalidateBillingRuntimeCache)(userId);
        return res.status(200).json({
            status: 'success',
            message: 'Webhook processed successfully',
            data: {
                subscriptionId: localSubscription.id,
                razorpaySubscriptionId: localSubscription.razorpaySubscriptionId,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to process Razorpay webhook',
        });
    }
};
exports.handleRazorpayWebhook = handleRazorpayWebhook;
