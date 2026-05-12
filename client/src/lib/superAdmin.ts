import type { User } from '@supabase/supabase-js';
import type { PlanType } from '../types';

const SUPER_ADMIN_EMAIL = 'computerbro1234@gmail.com';
const SUPER_ADMIN_TESTING_TIER_STORAGE_KEY = 'prixmoai.superadmin.testing-tier';
const SUPER_ADMIN_TESTING_TIERS: PlanType[] = ['free', 'basic', 'pro'];
export const SUPER_ADMIN_TESTING_TIER_EVENT = 'prixmoai:super-admin-tier-change';
export const SUPER_ADMIN_TESTING_TIER_HEADER_NAME =
  'x-prixmoai-super-admin-plan';

export const isSuperAdminEmail = (email?: string | null) =>
  Boolean(email && email.trim().toLowerCase() === SUPER_ADMIN_EMAIL);

export const isSuperAdminUser = (user?: User | null) =>
  Boolean(
    user &&
      (user.app_metadata?.super_admin === true || isSuperAdminEmail(user.email))
  );

export const normalizeSuperAdminTestingTier = (value?: string | null): PlanType =>
  value && SUPER_ADMIN_TESTING_TIERS.includes(value as PlanType)
    ? (value as PlanType)
    : 'pro';

export const readStoredSuperAdminTestingTier = (): PlanType => {
  if (typeof window === 'undefined') {
    return 'pro';
  }

  return normalizeSuperAdminTestingTier(
    window.localStorage.getItem(SUPER_ADMIN_TESTING_TIER_STORAGE_KEY)
  );
};

export const writeStoredSuperAdminTestingTier = (plan: PlanType) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedPlan = normalizeSuperAdminTestingTier(plan);

  window.localStorage.setItem(
    SUPER_ADMIN_TESTING_TIER_STORAGE_KEY,
    normalizedPlan
  );
  window.dispatchEvent(
    new CustomEvent<PlanType>(SUPER_ADMIN_TESTING_TIER_EVENT, {
      detail: normalizedPlan,
    })
  );
};

export const getSuperAdminTestingRequestHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    [SUPER_ADMIN_TESTING_TIER_HEADER_NAME]: readStoredSuperAdminTestingTier(),
  };
};
