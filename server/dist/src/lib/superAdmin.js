"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureConfiguredSuperAdminAccount = exports.isSuperAdminUserId = exports.buildSuperAdminSubscription = exports.getEffectiveSuperAdminPlan = exports.getSuperAdminTestingPlanHeaderName = exports.normalizeSuperAdminTestingPlan = exports.isSuperAdminUser = exports.isSuperAdminEmail = exports.getPrimarySuperAdminEmail = void 0;
const constants_1 = require("../config/constants");
const supabase_1 = require("../db/supabase");
const subscriptions_1 = require("../db/queries/subscriptions");
const requestContext_1 = require("./requestContext");
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'computerbro1234@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'prixmoAI99';
const SUPER_ADMIN_TESTING_PLAN_HEADER_NAME = 'x-prixmoai-super-admin-plan';
const SUPER_ADMIN_TESTING_PLANS = ['free', 'basic', 'pro'];
const SUPER_ADMIN_USER_CACHE_TTL_MS = 10 * 60000;
const superAdminUserCache = new Map();
const getCachedSuperAdminUser = (userId) => {
    const cached = superAdminUserCache.get(userId);
    if (!cached) {
        return null;
    }
    if (Date.now() - cached.checkedAt > SUPER_ADMIN_USER_CACHE_TTL_MS) {
        superAdminUserCache.delete(userId);
        return null;
    }
    return cached.value;
};
const setCachedSuperAdminUser = (userId, value) => {
    superAdminUserCache.set(userId, {
        value,
        checkedAt: Date.now(),
    });
};
const getPrimarySuperAdminEmail = () => SUPER_ADMIN_EMAILS[0] ?? null;
exports.getPrimarySuperAdminEmail = getPrimarySuperAdminEmail;
const isSuperAdminEmail = (email) => Boolean(email && SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase()));
exports.isSuperAdminEmail = isSuperAdminEmail;
const isSuperAdminUser = (user) => (0, exports.isSuperAdminEmail)(user?.email);
exports.isSuperAdminUser = isSuperAdminUser;
const normalizeSuperAdminTestingPlan = (value) => {
    const normalizedValue = Array.isArray(value) ? value[0] : value;
    if (!normalizedValue) {
        return null;
    }
    const normalizedPlan = normalizedValue.trim().toLowerCase();
    return SUPER_ADMIN_TESTING_PLANS.includes(normalizedPlan)
        ? normalizedPlan
        : null;
};
exports.normalizeSuperAdminTestingPlan = normalizeSuperAdminTestingPlan;
const getSuperAdminTestingPlanHeaderName = () => SUPER_ADMIN_TESTING_PLAN_HEADER_NAME;
exports.getSuperAdminTestingPlanHeaderName = getSuperAdminTestingPlanHeaderName;
const getEffectiveSuperAdminPlan = () => (0, requestContext_1.getCurrentRequestSuperAdminTestPlan)() ?? 'pro';
exports.getEffectiveSuperAdminPlan = getEffectiveSuperAdminPlan;
const buildSuperAdminSubscription = (userId, plan = (0, exports.getEffectiveSuperAdminPlan)()) => {
    const now = new Date().toISOString();
    return {
        id: `super-admin-${userId}`,
        userId,
        plan,
        status: 'active',
        monthlyLimit: constants_1.PLAN_LIMITS[plan],
        currentPeriodEnd: null,
        razorpayCustomerId: null,
        razorpaySubscriptionId: null,
        metadata: {
            source: 'super-admin-override',
            superAdmin: true,
            allPlansAccessible: true,
            testingPlan: plan,
        },
        createdAt: now,
        updatedAt: now,
    };
};
exports.buildSuperAdminSubscription = buildSuperAdminSubscription;
const isSuperAdminUserId = async (userId) => {
    const cached = getCachedSuperAdminUser(userId);
    if (cached !== null) {
        return cached;
    }
    if (!supabase_1.isSupabaseAdminConfigured) {
        return false;
    }
    try {
        const admin = (0, supabase_1.requireSupabaseAdmin)();
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error) {
            throw error;
        }
        const result = (0, exports.isSuperAdminEmail)(data.user?.email ?? null);
        setCachedSuperAdminUser(userId, result);
        return result;
    }
    catch {
        return false;
    }
};
exports.isSuperAdminUserId = isSuperAdminUserId;
const findUserByEmail = async (email) => {
    const admin = (0, supabase_1.requireSupabaseAdmin)();
    for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({
            page,
            perPage: 200,
        });
        if (error) {
            throw error;
        }
        const match = data.users.find((user) => user.email?.trim().toLowerCase() === email) ?? null;
        if (match) {
            return match;
        }
        if (data.users.length < 200) {
            break;
        }
    }
    return null;
};
const ensureConfiguredSuperAdminAccount = async () => {
    const email = (0, exports.getPrimarySuperAdminEmail)();
    if (!email || !supabase_1.isSupabaseAdminConfigured) {
        return null;
    }
    const admin = (0, supabase_1.requireSupabaseAdmin)();
    const existingUser = await findUserByEmail(email);
    let userId = existingUser?.id ?? null;
    if (existingUser) {
        const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
            password: SUPER_ADMIN_PASSWORD,
            email_confirm: true,
            app_metadata: {
                ...(existingUser.app_metadata ?? {}),
                super_admin: true,
            },
            user_metadata: {
                ...(existingUser.user_metadata ?? {}),
                full_name: typeof existingUser.user_metadata?.full_name === 'string' &&
                    existingUser.user_metadata.full_name.trim()
                    ? existingUser.user_metadata.full_name
                    : 'PrixmoAI Super Admin',
            },
        });
        if (error) {
            throw error;
        }
    }
    else {
        const { data, error } = await admin.auth.admin.createUser({
            email,
            password: SUPER_ADMIN_PASSWORD,
            email_confirm: true,
            app_metadata: {
                provider: 'email',
                super_admin: true,
            },
            user_metadata: {
                full_name: 'PrixmoAI Super Admin',
            },
        });
        if (error || !data.user) {
            throw error ?? new Error('Failed to create super admin user');
        }
        userId = data.user.id;
    }
    if (userId) {
        await (0, subscriptions_1.upsertSubscription)(admin, {
            userId,
            plan: 'pro',
            status: 'active',
            monthlyLimit: null,
            metadata: {
                superAdmin: true,
                source: 'super-admin-bootstrap',
                allPlansAccessible: true,
            },
        });
        setCachedSuperAdminUser(userId, true);
    }
    return {
        email,
        userId,
    };
};
exports.ensureConfiguredSuperAdminAccount = ensureConfiguredSuperAdminAccount;
