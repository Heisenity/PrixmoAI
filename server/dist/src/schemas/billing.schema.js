"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncSubscriptionSchema = exports.cancelSubscriptionSchema = exports.createBillingCheckoutSchema = void 0;
const zod_1 = require("zod");
exports.createBillingCheckoutSchema = zod_1.z.object({
    plan: zod_1.z.enum(['basic', 'pro']),
    totalCount: zod_1.z.number().int().min(1).max(240).optional(),
    quantity: zod_1.z.number().int().min(1).max(10).optional(),
    startAt: zod_1.z.string().datetime().optional(),
    expireBy: zod_1.z.string().datetime().optional(),
});
exports.cancelSubscriptionSchema = zod_1.z.object({
    cancelAtCycleEnd: zod_1.z.boolean().optional(),
});
exports.syncSubscriptionSchema = zod_1.z.object({
    subscriptionId: zod_1.z.string().trim().min(1).optional(),
});
