"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageRuntimePolicyMiddleware = exports.imagePlanLimitMiddleware = exports.planLimitMiddleware = void 0;
const content_1 = require("../db/queries/content");
const images_1 = require("../db/queries/images");
const subscriptions_1 = require("../db/queries/subscriptions");
const supabase_1 = require("../db/supabase");
const constants_1 = require("../config/constants");
const imageRuntimePolicy_service_1 = require("../services/imageRuntimePolicy.service");
const enforceFeatureLimit = async (req, res, next, featureKey, limitReachedMessage, getUsageCount) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const [featureLimit, usageCount] = await Promise.all([
            (0, subscriptions_1.getFeatureLimit)(client, req.user.id, featureKey),
            getUsageCount(client, req.user.id),
        ]);
        if (featureLimit !== null && usageCount >= featureLimit) {
            return res.status(403).json({
                status: 'fail',
                message: limitReachedMessage,
                data: {
                    usageCount,
                    featureLimit,
                    usageWindow: 'day',
                },
            });
        }
        return next();
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to validate plan limit',
        });
    }
};
const planLimitMiddleware = async (req, res, next) => enforceFeatureLimit(req, res, next, constants_1.FEATURE_KEYS.contentGeneration, 'Daily content generation limit reached for your plan', content_1.getContentDailyUsageCount);
exports.planLimitMiddleware = planLimitMiddleware;
const imagePlanLimitMiddleware = async (req, res, next) => enforceFeatureLimit(req, res, next, constants_1.FEATURE_KEYS.imageGeneration, 'Daily image generation limit reached for your plan', images_1.getImageDailyUsageCount);
exports.imagePlanLimitMiddleware = imagePlanLimitMiddleware;
const imageRuntimePolicyMiddleware = async (req, res, next) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const [subscription, usageCount] = await Promise.all([
            (0, subscriptions_1.getCurrentSubscriptionByUserId)(client, req.user.id),
            (0, images_1.getImageDailyUsageCount)(client, req.user.id),
        ]);
        const plan = subscription?.plan ?? 'free';
        const runtimePolicy = (0, imageRuntimePolicy_service_1.resolveImageRuntimePolicy)(plan, usageCount);
        const rateLimitResult = (0, imageRuntimePolicy_service_1.checkImageRateLimit)(req.user.id, runtimePolicy);
        if (!rateLimitResult.allowed) {
            res.setHeader('Retry-After', String(rateLimitResult.retryAfterSeconds));
            return res.status(429).json({
                status: 'fail',
                message: plan === 'free'
                    ? `Too many image generations right now. Your Free plan allows ${runtimePolicy.requestsPerMinute} image requests per minute. Please wait ${rateLimitResult.retryAfterSeconds}s and try again.`
                    : plan === 'basic'
                        ? `Too many image generations right now. Your Basic plan allows ${runtimePolicy.requestsPerMinute} image requests per minute. Please wait ${rateLimitResult.retryAfterSeconds}s and try again.`
                        : `Too many image generations right now. Your Pro plan allows ${runtimePolicy.requestsPerMinute} image requests per minute. Please wait ${rateLimitResult.retryAfterSeconds}s and try again.`,
                data: {
                    plan,
                    requestsPerMinute: runtimePolicy.requestsPerMinute,
                    retryAfterSeconds: rateLimitResult.retryAfterSeconds,
                },
            });
        }
        req.imageRuntimePolicy = {
            ...runtimePolicy,
            throttleDelayMs: rateLimitResult.throttleDelayMs,
            burstRequestCount: rateLimitResult.burstRequestCount,
        };
        return next();
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to resolve image runtime policy',
        });
    }
};
exports.imageRuntimePolicyMiddleware = imageRuntimePolicyMiddleware;
