"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAdminPermission = exports.resolveAdminAccessForUser = exports.getPermissionsForRole = exports.ALL_ADMIN_PERMISSIONS = exports.ADMIN_PERMISSIONS = void 0;
const supabase_1 = require("../db/supabase");
const superAdmin_1 = require("./superAdmin");
exports.ADMIN_PERMISSIONS = {
    systemHealthView: 'system_health:view',
    failedJobsView: 'failed_jobs:view',
    socialHealthView: 'social_health:view',
    analyticsHealthView: 'analytics_health:view',
    queueView: 'queue:view',
    alertsView: 'alerts:view',
    userDebugView: 'user_debug:view',
    adminAccessManage: 'admin_access:manage',
    safeActionsRun: 'safe_actions:run',
};
exports.ALL_ADMIN_PERMISSIONS = Object.values(exports.ADMIN_PERMISSIONS);
const ROLE_PERMISSIONS = {
    admin2: exports.ALL_ADMIN_PERMISSIONS,
    support: [
        exports.ADMIN_PERMISSIONS.systemHealthView,
        exports.ADMIN_PERMISSIONS.failedJobsView,
        exports.ADMIN_PERMISSIONS.socialHealthView,
        exports.ADMIN_PERMISSIONS.queueView,
        exports.ADMIN_PERMISSIONS.alertsView,
        exports.ADMIN_PERMISSIONS.userDebugView,
        exports.ADMIN_PERMISSIONS.safeActionsRun,
    ],
    analytics: [
        exports.ADMIN_PERMISSIONS.systemHealthView,
        exports.ADMIN_PERMISSIONS.analyticsHealthView,
        exports.ADMIN_PERMISSIONS.alertsView,
        exports.ADMIN_PERMISSIONS.userDebugView,
    ],
    readonly: [
        exports.ADMIN_PERMISSIONS.systemHealthView,
        exports.ADMIN_PERMISSIONS.failedJobsView,
        exports.ADMIN_PERMISSIONS.socialHealthView,
        exports.ADMIN_PERMISSIONS.analyticsHealthView,
        exports.ADMIN_PERMISSIONS.queueView,
        exports.ADMIN_PERMISSIONS.alertsView,
        exports.ADMIN_PERMISSIONS.userDebugView,
    ],
    custom: [],
};
const normalizeEmail = (email) => email?.trim().toLowerCase() ?? '';
const normalizePermissions = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    const allowed = new Set(exports.ALL_ADMIN_PERMISSIONS);
    return [...new Set(value)]
        .filter((item) => typeof item === 'string' && allowed.has(item));
};
const getPermissionsForRole = (role, permissions) => role === 'custom'
    ? normalizePermissions(permissions)
    : ROLE_PERMISSIONS[role] ?? [];
exports.getPermissionsForRole = getPermissionsForRole;
const resolveAdminAccessForUser = async (user) => {
    if (!user?.email) {
        return {
            isAdmin: false,
            isOwner: false,
            role: null,
            permissions: [],
            grantId: null,
        };
    }
    if ((0, superAdmin_1.isSuperAdminUser)(user)) {
        return {
            isAdmin: true,
            isOwner: true,
            role: 'owner',
            permissions: exports.ALL_ADMIN_PERMISSIONS,
            grantId: null,
        };
    }
    const email = normalizeEmail(user.email);
    const client = (0, supabase_1.requireSupabaseAdmin)();
    const { data, error } = await client
        .from('admin_access_grants')
        .select('id, role, permissions, expires_at, revoked_at')
        .eq('email', email)
        .is('revoked_at', null)
        .maybeSingle();
    const expiresAt = typeof data?.expires_at === 'string' ? new Date(data.expires_at).getTime() : NaN;
    const hasExpired = Number.isFinite(expiresAt) && expiresAt <= Date.now();
    if (error || !data || hasExpired) {
        return {
            isAdmin: false,
            isOwner: false,
            role: null,
            permissions: [],
            grantId: null,
        };
    }
    const role = (data.role || 'custom');
    return {
        isAdmin: true,
        isOwner: false,
        role,
        permissions: (0, exports.getPermissionsForRole)(role, data.permissions),
        grantId: data.id,
    };
};
exports.resolveAdminAccessForUser = resolveAdminAccessForUser;
const hasAdminPermission = (access, permission) => access.permissions.includes(permission);
exports.hasAdminPermission = hasAdminPermission;
