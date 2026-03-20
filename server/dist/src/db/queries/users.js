"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentPlan = exports.updatePlan = exports.getUserById = void 0;
const supabase_1 = require("../supabase");
const subscriptions_1 = require("./subscriptions");
const getUserById = async (userId) => {
    const adminClient = (0, supabase_1.requireSupabaseAdmin)();
    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (error) {
        throw new Error(error.message || 'Failed to fetch user');
    }
    return data.user;
};
exports.getUserById = getUserById;
const updatePlan = async (userId, input) => {
    const adminClient = (0, supabase_1.requireSupabaseAdmin)();
    return (0, subscriptions_1.upsertSubscription)(adminClient, {
        userId,
        ...input,
    });
};
exports.updatePlan = updatePlan;
const getCurrentPlan = async (userId) => {
    const adminClient = (0, supabase_1.requireSupabaseAdmin)();
    const subscription = await (0, subscriptions_1.getCurrentSubscriptionByUserId)(adminClient, userId);
    return subscription?.plan ?? 'free';
};
exports.getCurrentPlan = getCurrentPlan;
