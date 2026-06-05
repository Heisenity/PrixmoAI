import type { User } from '@supabase/supabase-js';
import { requireSupabaseAdmin } from '../db/supabase';
import { isSuperAdminUser } from './superAdmin';

export const ADMIN_PERMISSIONS = {
  systemHealthView: 'system_health:view',
  failedJobsView: 'failed_jobs:view',
  socialHealthView: 'social_health:view',
  analyticsHealthView: 'analytics_health:view',
  queueView: 'queue:view',
  alertsView: 'alerts:view',
  userDebugView: 'user_debug:view',
  adminAccessManage: 'admin_access:manage',
  safeActionsRun: 'safe_actions:run',
} as const;

export type AdminPermission =
  (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export const ALL_ADMIN_PERMISSIONS = Object.values(ADMIN_PERMISSIONS);

export type AdminRole =
  | 'owner'
  | 'admin2'
  | 'support'
  | 'analytics'
  | 'readonly'
  | 'custom';

const ROLE_PERMISSIONS: Record<Exclude<AdminRole, 'owner'>, AdminPermission[]> = {
  admin2: ALL_ADMIN_PERMISSIONS,
  support: [
    ADMIN_PERMISSIONS.systemHealthView,
    ADMIN_PERMISSIONS.failedJobsView,
    ADMIN_PERMISSIONS.socialHealthView,
    ADMIN_PERMISSIONS.queueView,
    ADMIN_PERMISSIONS.alertsView,
    ADMIN_PERMISSIONS.userDebugView,
    ADMIN_PERMISSIONS.safeActionsRun,
  ],
  analytics: [
    ADMIN_PERMISSIONS.systemHealthView,
    ADMIN_PERMISSIONS.analyticsHealthView,
    ADMIN_PERMISSIONS.alertsView,
    ADMIN_PERMISSIONS.userDebugView,
  ],
  readonly: [
    ADMIN_PERMISSIONS.systemHealthView,
    ADMIN_PERMISSIONS.failedJobsView,
    ADMIN_PERMISSIONS.socialHealthView,
    ADMIN_PERMISSIONS.analyticsHealthView,
    ADMIN_PERMISSIONS.queueView,
    ADMIN_PERMISSIONS.alertsView,
    ADMIN_PERMISSIONS.userDebugView,
  ],
  custom: [],
};

export type AdminAccessContext = {
  isAdmin: boolean;
  isOwner: boolean;
  role: AdminRole | null;
  permissions: AdminPermission[];
  grantId: string | null;
};

const normalizeEmail = (email?: string | null) =>
  email?.trim().toLowerCase() ?? '';

const normalizePermissions = (value: unknown): AdminPermission[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set(ALL_ADMIN_PERMISSIONS);
  return [...new Set(value)]
    .filter((item): item is AdminPermission =>
      typeof item === 'string' && allowed.has(item as AdminPermission)
    );
};

export const getPermissionsForRole = (
  role: Exclude<AdminRole, 'owner'>,
  permissions: unknown
) =>
  role === 'custom'
    ? normalizePermissions(permissions)
    : ROLE_PERMISSIONS[role] ?? [];

export const resolveAdminAccessForUser = async (
  user?: Pick<User, 'id' | 'email'> | null
): Promise<AdminAccessContext> => {
  if (!user?.email) {
    return {
      isAdmin: false,
      isOwner: false,
      role: null,
      permissions: [],
      grantId: null,
    };
  }

  if (isSuperAdminUser(user)) {
    return {
      isAdmin: true,
      isOwner: true,
      role: 'owner',
      permissions: ALL_ADMIN_PERMISSIONS,
      grantId: null,
    };
  }

  const email = normalizeEmail(user.email);
  const client = requireSupabaseAdmin();
  const { data, error } = await client
    .from('admin_access_grants')
    .select('id, role, permissions, expires_at, revoked_at')
    .eq('email', email)
    .is('revoked_at', null)
    .maybeSingle();

  const expiresAt =
    typeof data?.expires_at === 'string' ? new Date(data.expires_at).getTime() : NaN;
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

  const role = (data.role || 'custom') as Exclude<AdminRole, 'owner'>;

  return {
    isAdmin: true,
    isOwner: false,
    role,
    permissions: getPermissionsForRole(role, data.permissions),
    grantId: data.id,
  };
};

export const hasAdminPermission = (
  access: AdminAccessContext,
  permission: AdminPermission
) => access.permissions.includes(permission);
