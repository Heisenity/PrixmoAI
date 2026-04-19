import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type { AnalyticsOverview, AnalyticsRecord, PaginatedResult } from '../types';

type AnalyticsCache = {
  overview: AnalyticsOverview | null;
  history: PaginatedResult<AnalyticsRecord> | null;
  cachedAt: string;
};

const ANALYTICS_CACHE_KEY_PREFIX = 'prixmoai.analytics.snapshot';
const ANALYTICS_CACHE_TTL_MS = 60_000;

const buildAnalyticsCacheKey = (userId: string) =>
  `${ANALYTICS_CACHE_KEY_PREFIX}:${userId}`;

const isFreshCache = (cachedAt: string, ttlMs: number) => {
  const cachedTime = new Date(cachedAt).getTime();

  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= ttlMs;
};

const readAnalyticsCache = (userId: string): AnalyticsCache | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(buildAnalyticsCacheKey(userId));

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

const writeAnalyticsCache = (userId: string, value: AnalyticsCache) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    buildAnalyticsCacheKey(userId),
    JSON.stringify(value)
  );
};

export const useAnalytics = () => {
  const { token, user } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [history, setHistory] = useState<PaginatedResult<AnalyticsRecord> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overviewRef = useRef<AnalyticsOverview | null>(null);
  const historyRef = useRef<PaginatedResult<AnalyticsRecord> | null>(null);
  const hydratedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    overviewRef.current = overview;
    historyRef.current = history;
  }, [history, overview]);

  useEffect(() => {
    const userId = user?.id ?? null;

    if (!token || !userId) {
      hydratedUserIdRef.current = null;
      setOverview(null);
      setHistory(null);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (hydratedUserIdRef.current === userId) {
      return;
    }

    hydratedUserIdRef.current = userId;
    const cached = readAnalyticsCache(userId);

    setOverview(cached?.overview ?? null);
    setHistory(cached?.history ?? null);
    setError(null);
  }, [token, user?.id]);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!token || !user?.id) {
      return;
    }

    const cached = readAnalyticsCache(user.id);

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
      });
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
  }, [token, user?.id]);

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
