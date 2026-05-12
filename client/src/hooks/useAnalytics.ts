import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/axios';
import {
  SUPER_ADMIN_TESTING_TIER_EVENT,
  isSuperAdminUser,
  normalizeSuperAdminTestingTier,
  readStoredSuperAdminTestingTier,
} from '../lib/superAdmin';
import { useAuth } from './useAuth';
import type {
  AnalyticsOverview,
  AnalyticsRecord,
  PaginatedResult,
  PlanType,
} from '../types';

type AnalyticsCache = {
  overview: AnalyticsOverview | null;
  history: PaginatedResult<AnalyticsRecord> | null;
  cachedAt: string;
};

const ANALYTICS_CACHE_KEY_PREFIX = 'prixmoai.analytics.snapshot';
const ANALYTICS_CACHE_TTL_MS = 60_000;

const buildAnalyticsCacheKey = (
  userId: string,
  superAdminTestingTier?: PlanType | null
) => `${ANALYTICS_CACHE_KEY_PREFIX}:${userId}:${superAdminTestingTier ?? 'default'}`;

const isFreshCache = (cachedAt: string, ttlMs: number) => {
  const cachedTime = new Date(cachedAt).getTime();

  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= ttlMs;
};

const readAnalyticsCache = (
  userId: string,
  superAdminTestingTier?: PlanType | null
): AnalyticsCache | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(
    buildAnalyticsCacheKey(userId, superAdminTestingTier)
  );

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AnalyticsCache;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      overview: parsed.overview ?? null,
      history: parsed.history ?? null,
      cachedAt:
        typeof parsed.cachedAt === 'string'
          ? parsed.cachedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeAnalyticsCache = (
  userId: string,
  value: AnalyticsCache,
  superAdminTestingTier?: PlanType | null
) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    buildAnalyticsCacheKey(userId, superAdminTestingTier),
    JSON.stringify(value)
  );
};

export const useAnalytics = () => {
  const { token, user } = useAuth();
  const [superAdminTestingTier, setSuperAdminTestingTier] = useState<PlanType>(() =>
    readStoredSuperAdminTestingTier()
  );
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [history, setHistory] = useState<PaginatedResult<AnalyticsRecord> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overviewRef = useRef<AnalyticsOverview | null>(null);
  const historyRef = useRef<PaginatedResult<AnalyticsRecord> | null>(null);
  const hydratedCacheScopeRef = useRef<string | null>(null);
  const effectiveSuperAdminTestingTier = isSuperAdminUser(user)
    ? superAdminTestingTier
    : null;

  useEffect(() => {
    overviewRef.current = overview;
    historyRef.current = history;
  }, [history, overview]);

  useEffect(() => {
    const userId = user?.id ?? null;
    const cacheScope = userId
      ? buildAnalyticsCacheKey(userId, effectiveSuperAdminTestingTier)
      : null;

    if (!token || !userId) {
      hydratedCacheScopeRef.current = null;
      setOverview(null);
      setHistory(null);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (hydratedCacheScopeRef.current === cacheScope) {
      return;
    }

    hydratedCacheScopeRef.current = cacheScope;
    const cached = readAnalyticsCache(userId, effectiveSuperAdminTestingTier);

    setOverview(cached?.overview ?? null);
    setHistory(cached?.history ?? null);
    setError(null);
  }, [effectiveSuperAdminTestingTier, token, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncTestingTier = () => {
      setSuperAdminTestingTier(readStoredSuperAdminTestingTier());
    };

    const handleTierChange = (event: Event) => {
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

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!token || !user?.id) {
      return;
    }

    const cached = readAnalyticsCache(user.id, effectiveSuperAdminTestingTier);

    if (
      !options?.force &&
      cached?.cachedAt &&
      isFreshCache(cached.cachedAt, ANALYTICS_CACHE_TTL_MS)
    ) {
      setOverview(cached.overview);
      setHistory(cached.history);
      setError(null);
      return;
    }

    const hasSnapshot = Boolean(overviewRef.current || historyRef.current);

    if (hasSnapshot) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [nextOverview, nextHistory] = await Promise.all([
        apiRequest<AnalyticsOverview>('/api/analytics/overview', { token }),
        apiRequest<PaginatedResult<AnalyticsRecord>>('/api/analytics/history', { token }),
      ]);

      setOverview(nextOverview);
      setHistory(nextHistory);
      setError(null);
      writeAnalyticsCache(user.id, {
        overview: nextOverview,
        history: nextHistory,
        cachedAt: new Date().toISOString(),
      }, effectiveSuperAdminTestingTier);
    } catch (analyticsError) {
      setError(
        analyticsError instanceof Error
          ? analyticsError.message
          : 'Failed to load analytics'
      );
    } finally {
      if (hasSnapshot) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [effectiveSuperAdminTestingTier, token, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const handleFocus = () => {
      void refresh({ force: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh({ force: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token, refresh]);

  return {
    overview,
    history,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
};
