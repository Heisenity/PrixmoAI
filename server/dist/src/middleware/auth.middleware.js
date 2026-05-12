"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const supabase_1 = require("../db/supabase");
const superAdmin_1 = require("../lib/superAdmin");
const requestContext_1 = require("../lib/requestContext");
const isUnverifiedEmailAuthUser = (user) => {
    if (!user) {
        return false;
    }
    const provider = (user.app_metadata?.provider ?? 'email')
        .trim()
        .toLowerCase();
    return Boolean(user.email) && provider === 'email' && !user.email_confirmed_at;
};
const authMiddleware = async (req, res, next) => {
    if (!supabase_1.supabaseAuth) {
        return res.status(503).json({
            status: 'error',
            error: 'Supabase is not configured',
            message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env',
        });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'fail',
            error: 'No token provided',
        });
    }
    const token = authHeader.split(' ')[1];
    req.accessToken = token;
    try {
        const { data: { user }, error, } = await supabase_1.supabaseAuth.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({
                status: 'fail',
                error: 'Invalid or expired token',
            });
        }
        if (isUnverifiedEmailAuthUser(user)) {
            return res.status(403).json({
                status: 'fail',
                error: 'Email verification required',
                message: 'Verify your email code first, then come back and unlock the workspace.',
            });
        }
        const isSuperAdminAccount = (0, superAdmin_1.isSuperAdminUser)(user);
        const superAdminTestingPlan = isSuperAdminAccount
            ? (0, superAdmin_1.normalizeSuperAdminTestingPlan)(req.headers[(0, superAdmin_1.getSuperAdminTestingPlanHeaderName)()])
            : null;
        (0, requestContext_1.setAuthenticatedRequestContext)({
            authenticatedUserId: user.id,
            isSuperAdminRequest: isSuperAdminAccount,
            superAdminTestPlan: superAdminTestingPlan,
        });
        req.user = user;
        req.superAdminTestingPlan = superAdminTestingPlan;
        return next();
    }
    catch (_error) {
        return res.status(401).json({
            status: 'fail',
            error: 'Authentication failed',
        });
    }
};
exports.authMiddleware = authMiddleware;
