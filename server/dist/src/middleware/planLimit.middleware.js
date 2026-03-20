"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imagePlanLimitMiddleware = exports.planLimitMiddleware = void 0;
const content_1 = require("../db/queries/content");
const images_1 = require("../db/queries/images");
const subscriptions_1 = require("../db/queries/subscriptions");
const supabase_1 = require("../db/supabase");
const constants_1 = require("../config/constants");
const enforceFeatureLimit = async (req, res, next, featureKey, limitReachedMessage, getUsageCount) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const [monthlyLimit, usageCount] = await Promise.all([
            (0, subscriptions_1.getFeatureMonthlyLimit)(client, req.user.id, featureKey),
            getUsageCount(client, req.user.id),
        ]);
        if (monthlyLimit !== null && usageCount >= monthlyLimit) {
            return res.status(403).json({
                status: 'fail',
                message: limitReachedMessage,
                data: {
                    usageCount,
                    monthlyLimit,
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
const planLimitMiddleware = async (req, res, next) => enforceFeatureLimit(req, res, next, constants_1.FEATURE_KEYS.contentGeneration, 'Monthly content generation limit reached for your plan', content_1.getContentMonthlyUsageCount);
exports.planLimitMiddleware = planLimitMiddleware;
const imagePlanLimitMiddleware = async (req, res, next) => enforceFeatureLimit(req, res, next, constants_1.FEATURE_KEYS.imageGeneration, 'Monthly image generation limit reached for your plan', images_1.getImageMonthlyUsageCount);
exports.imagePlanLimitMiddleware = imagePlanLimitMiddleware;
