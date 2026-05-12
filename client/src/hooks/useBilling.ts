import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { PRIXMOAI_USAGE_REFRESH_EVENT } from '../lib/usageEvents';
import { useAuth } from './useAuth';
import {
  SUPER_ADMIN_TESTING_TIER_EVENT,
  isSuperAdminUser,
  normalizeSuperAdminTestingTier,
  readStoredSuperAdminTestingTier,
} from '../lib/superAdmin';
import type { BillingCatalogResponse, PlanType, Subscription } from '../types';

type CheckoutResponse = {
  subscription: Subscription;
  checkoutUrl: string | null;
};

type BillingCache = {
  catalog: BillingCatalogResponse | null;
  subscription: Subscription | null;
  cachedAt: string;
};

const BILLING_CACHE_KEY_PREFIX = 'prixmoai.billing.snapshot';
const BILLING_CACHE_TTL_MS = 2 * 60_000;

const buildBillingCacheKey = (
  userId: string,
  superAdminTestingTier?: PlanType | null
) =>
  `${BILLING_CACHE_KEY_PREFIX}:${userId}:${superAdminTestingTier ?? 'default'}`;

const isFreshCache = (cachedAt: string, ttlMs: number) => {
  const cachedTime = new Date(cachedAt).getTime();

  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= ttlMs;
};

const readBillingCache = (
  userId: string,
  superAdminTestingTier?: PlanType | null
): BillingCache | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(
    buildBillingCacheKey(userId, superAdminTestingTier)
  );

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as BillingCache;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      catalog: parsed.catalog ?? null,
      subscription: parsed.subscription ?? null,
      cachedAt:
        typeof parsed.cachedAt === 'string'
          ? parsed.cachedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeBillingCache = (
  userId: string,
  value: BillingCache,
  superAdminTestingTier?: PlanType | null
) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    buildBillingCacheKey(userId, superAdminTestingTier),
    JSON.stringify(value)
  );
};

export const useBilling = () => {
  const { token, user } = useAuth();
  const [superAdminTestingTier, setSuperAdminTestingTier] = useState<PlanType>(() =>
    readStoredSuperAdminTestingTier()
  );
  const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveSuperAdminTestingTier = isSuperAdminUser(user)
    ? superAdminTestingTier
    : null;

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!token || !user?.id) {
      return;
    }

    const cached = readBillingCache(user.id, effectiveSuperAdminTestingTier);

    if (
      !options?.force &&
      cached?.cachedAt &&
      isFreshCache(cached.cachedAt, BILLING_CACHE_TTL_MS)
    ) {
      setCatalog(cached.catalog);
      setSubscription(cached.subscription);
      setError(null);
      return;
    }

    setIsLoading(true);

    try {
      const [nextCatalog, nextSubscription] = await Promise.all([
        apiRequest<BillingCatalogResponse>('/api/billing/plans', { token }),
        apiRequest<Subscription>('/api/billing/subscription', { token }),
      ]);

      setCatalog(nextCatalog);
      setSubscription(nextSubscription);
      setError(null);
      writeBillingCache(user.id, {
        catalog: nextCatalog,
        subscription: nextSubscription,
        cachedAt: new Date().toISOString(),
      }, effectiveSuperAdminTestingTier);
    } catch (billingError) {
      setError(
        billingError instanceof Error ? billingError.message : 'Failed to load billing'
      );
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSuperAdminTestingTier, token, user?.id]);

  useEffect(() => {
    const userId = user?.id ?? null;

    if (!token || !userId) {
      setCatalog(null);
      setSubscription(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const cached = readBillingCache(userId, effectiveSuperAdminTestingTier);

    setCatalog(cached?.catalog ?? null);
    setSubscription(cached?.subscription ?? null);
    setError(null);
  }, [effectiveSuperAdminTestingTier, token, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncTestingTier = () => {
      setSuperAdminTestingTier(readStoredSuperAdminTestingTier());
    };

    const handleTierChange = (
      event: Event
    ) => {
      const customEvent = event as CustomEvent<PlanType | undefined>;
      setSuperAdminTestingTier(
        normalizeSuperAdminTestingTier(customEvent.detail ?? null)
      );
    };

    window.addEventListener(SUPER_ADMIN_TESTING_TIER_EVENT, handleTierChange);
    window.addEventListener('storage', syncTestingTier);

    return () => {
      window.removeEventListener(
        SUPER_ADMIN_TESTING_TIER_EVENT,
        handleTierChange
      );
      window.removeEventListener('storage', syncTestingTier);
    };
  }, []);

  const syncSubscription = useCallback(
    async (subscriptionId?: string | null) => {
      if (!token || !subscriptionId || !user?.id) {
        return null;
      }

      try {
        const nextSubscription = await apiRequest<Subscription>('/api/billing/sync', {
          method: 'POST',
          token,
          body: { subscriptionId },
        });

        setSubscription(nextSubscription);
        setError(null);
        writeBillingCache(user.id, {
          catalog,
          subscription: nextSubscription,
          cachedAt: new Date().toISOString(),
        }, effectiveSuperAdminTestingTier);
        return nextSubscription;
      } catch {
        return null;
      }
    },
    [catalog, effectiveSuperAdminTestingTier, token, user?.id]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const existingSubscriptionId =
      subscription?.razorpaySubscriptionId ??
      catalog?.currentSubscription.razorpaySubscriptionId ??
      null;

    const revalidateBillingState = async () => {
      await syncSubscription(existingSubscriptionId);
      await refresh({ force: true });
    };

    const handleFocus = () => {
      void revalidateBillingState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void revalidateBillingState();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    token,
    subscription?.razorpaySubscriptionId,
    catalog?.currentSubscription.razorpaySubscriptionId,
    syncSubscription,
    refresh,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !token) {
      return;
    }

    const handleUsageRefresh = () => {
      void refresh({ force: true });
    };

    window.addEventListener(PRIXMOAI_USAGE_REFRESH_EVENT, handleUsageRefresh);

    return () => {
      window.removeEventListener(
        PRIXMOAI_USAGE_REFRESH_EVENT,
        handleUsageRefresh
      );
    };
  }, [refresh, token]);

  const startCheckout = async (plan: Exclude<PlanType, 'free'>) => {
    if (!token) {
      throw new Error('Sign in again to continue.');
    }

    setError(null);
    setIsCheckingOut(true);

    try {
      const result = await apiRequest<CheckoutResponse>('/api/billing/checkout', {
        method: 'POST',
        token,
        body: { plan },
      });

      await refresh({ force: true });

      if (result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error ? checkoutError.message : 'Failed to start checkout';
      setError(message);
      throw new Error(message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  return {
    catalog,
    subscription,
    isLoading,
    isCheckingOut,
    error,
    refresh,
    startCheckout,
  };
};
