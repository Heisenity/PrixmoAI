import type { User } from '@supabase/supabase-js';
import { PLAN_LIMITS } from '../config/constants';
import { requireSupabaseAdmin, isSupabaseAdminConfigured } from '../db/supabase';
import { upsertSubscription } from '../db/queries/subscriptions';
import type { PlanType, Subscription } from '../types';
import { getCurrentRequestSuperAdminTestPlan } from './requestContext';

const SUPER_ADMIN_EMAILS = (
  process.env.SUPER_ADMIN_EMAILS || 'computerbro1234@gmail.com'
)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const SUPER_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD || 'prixmoAI99';
const SUPER_ADMIN_TESTING_PLAN_HEADER_NAME = 'x-prixmoai-super-admin-plan';
const SUPER_ADMIN_TESTING_PLANS: PlanType[] = ['free', 'basic', 'pro'];

const SUPER_ADMIN_USER_CACHE_TTL_MS = 10 * 60_000;

const superAdminUserCache = new Map<
  string,
  {
    value: boolean;
    checkedAt: number;
  }
>();

const getCachedSuperAdminUser = (userId: string) => {
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

const setCachedSuperAdminUser = (userId: string, value: boolean) => {
  superAdminUserCache.set(userId, {
    value,
    checkedAt: Date.now(),
  });
};

export const getPrimarySuperAdminEmail = () => SUPER_ADMIN_EMAILS[0] ?? null;

export const isSuperAdminEmail = (email?: string | null) =>
  Boolean(email && SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase()));

export const isSuperAdminUser = (
  user?: Pick<User, 'email'> | null
) => isSuperAdminEmail(user?.email);

export const normalizeSuperAdminTestingPlan = (
  value?: string | string[] | null
): PlanType | null => {
  const normalizedValue = Array.isArray(value) ? value[0] : value;

  if (!normalizedValue) {
    return null;
  }

  const normalizedPlan = normalizedValue.trim().toLowerCase();

  return SUPER_ADMIN_TESTING_PLANS.includes(normalizedPlan as PlanType)
    ? (normalizedPlan as PlanType)
    : null;
};

export const getSuperAdminTestingPlanHeaderName = () =>
  SUPER_ADMIN_TESTING_PLAN_HEADER_NAME;

export const getEffectiveSuperAdminPlan = (): PlanType =>
  getCurrentRequestSuperAdminTestPlan() ?? 'pro';

export const buildSuperAdminSubscription = (
  userId: string,
  plan: PlanType = getEffectiveSuperAdminPlan()
): Subscription => {
  const now = new Date().toISOString();

  return {
    id: `super-admin-${userId}`,
    userId,
    plan,
    status: 'active',
    monthlyLimit: PLAN_LIMITS[plan],
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

export const isSuperAdminUserId = async (userId: string): Promise<boolean> => {
  const cached = getCachedSuperAdminUser(userId);

  if (cached !== null) {
    return cached;
  }

  if (!isSupabaseAdminConfigured) {
    return false;
  }

  try {
    const admin = requireSupabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(userId);

    if (error) {
      throw error;
    }

    const result = isSuperAdminEmail(data.user?.email ?? null);
    setCachedSuperAdminUser(userId, result);
    return result;
  } catch {
    return false;
  }
};

const findUserByEmail = async (email: string) => {
  const admin = requireSupabaseAdmin();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const match =
      data.users.find((user) => user.email?.trim().toLowerCase() === email) ?? null;

    if (match) {
      return match;
    }

    if (data.users.length < 200) {
      break;
    }
  }

  return null;
};

export const ensureConfiguredSuperAdminAccount = async () => {
  const email = getPrimarySuperAdminEmail();

  if (!email || !isSupabaseAdminConfigured) {
    return null;
  }

  const admin = requireSupabaseAdmin();
  const existingUser = await findUserByEmail(email);
  let userId: string | null = existingUser?.id ?? null;

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
        full_name:
          typeof existingUser.user_metadata?.full_name === 'string' &&
          existingUser.user_metadata.full_name.trim()
            ? existingUser.user_metadata.full_name
            : 'PrixmoAI Super Admin',
      },
    });

    if (error) {
      throw error;
    }
  } else {
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
    await upsertSubscription(admin, {
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
