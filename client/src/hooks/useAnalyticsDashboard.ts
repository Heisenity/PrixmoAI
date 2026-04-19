import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/axios';
import {
  isBrowserCacheFresh,
  readBrowserCache,
  writeBrowserCache,
} from '../lib/browserCache';
import { useAuth } from './useAuth';
import type { AnalyticsDashboard, AnalyticsPlatformScope } from '../types';

type AnalyticsDashboardFilters = {
  preset: '7d' | '14d' | '28d' | '30d' | 'custom';
  platform: AnalyticsPlatformScope;
  start?: string;
  end?: string;
};

const buildDashboardCacheKey = (filters: AnalyticsDashboardFilters) =>
  [filters.preset, filters.platform, filters.start || '', filters.end || ''].join('::');

const ANALYTICS_DASHBOARD_CACHE_KEY_PREFIX = 'prixmoai.analytics.dashboard';
const ANALYTICS_DASHBOARD_CACHE_TTL_MS = 2 * 60_000;

const buildStoredDashboardCacheKey = (
  userId: string,
  filters: AnalyticsDashboardFilters
) => `${ANALYTICS_DASHBOARD_CACHE_KEY_PREFIX}:${userId}:${buildDashboardCacheKey(filters)}`;

export const useAnalyticsDashboard = (filters: AnalyticsDashboardFilters) => {
  const { token, user } = useAuth();
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, AnalyticsDashboard>>({});

  const resolveFilters = useCallback(
    (overrides?: Partial<AnalyticsDashboardFilters>): AnalyticsDashboardFilters => ({
      ...filters,
      ...overrides,
    }),
    [filters]
  );

  const fetchDashboard = useCallback(
    async (
      overrides?: Partial<AnalyticsDashboardFilters>,
      options?: { cacheBust?: boolean; setAsCurrent?: boolean }
    ) => {
      if (!token) {
        return null;
      }

      const nextFilters = resolveFilters(overrides);
      const nextDashboard = await apiRequest<AnalyticsDashboard>('/api/analytics/dashboard', {
        token,
        query: {
          preset: nextFilters.preset,
          platform: nextFilters.platform,
          start: nextFilters.preset === 'custom' ? nextFilters.start : undefined,
          end: nextFilters.preset === 'custom' ? nextFilters.end : undefined,
          _ts: options?.cacheBust ? Date.now() : undefined,
        },
      });

      cacheRef.current[buildDashboardCacheKey(nextFilters)] = nextDashboard;

      if (user?.id) {
        writeBrowserCache(
          buildStoredDashboardCacheKey(user.id, nextFilters),
          nextDashboard
        );
      }

      if (options?.setAsCurrent !== false) {
        setDashboard(nextDashboard);
        setLastUpdatedTime(new Date().toISOString());
        setError(null);
      }

      return nextDashboard;
    },
    [resolveFilters, token, user?.id]
  );

  const getCachedDashboardEntry = useCallback(
    (overrides?: Partial<AnalyticsDashboardFilters>) => {
      const nextFilters = resolveFilters(overrides);
      const memoryValue = cacheRef.current[buildDashboardCacheKey(nextFilters)];

      if (memoryValue) {
        return {
          value: memoryValue,
          cachedAt: new Date().toISOString(),
        };
      }

      if (!user?.id) {
        return null;
      }

      return readBrowserCache<AnalyticsDashboard>(
        buildStoredDashboardCacheKey(user.id, nextFilters)
      );
    },
    [resolveFilters, user?.id]
  );

  const getCachedDashboard = useCallback(
    (overrides?: Partial<AnalyticsDashboardFilters>) =>
      getCachedDashboardEntry(overrides)?.value ?? null,
    [getCachedDashboardEntry]
  );

  const previewDashboard = useCallback(
    async (overrides: Partial<AnalyticsDashboardFilters>) =>
      fetchDashboard(overrides, { cacheBust: true, setAsCurrent: false }),
    [fetchDashboard]
  );

  const refresh = useCallback(
    async (options?: { sync?: boolean }) => {
      if (!token) {
        return;
      }

      const isManualRefresh = Boolean(options?.sync);
      const cachedEntry = getCachedDashboardEntry();

      if (
        !isManualRefresh &&
        cachedEntry?.cachedAt &&
        isBrowserCacheFresh(cachedEntry.cachedAt, ANALYTICS_DASHBOARD_CACHE_TTL_MS)
      ) {
        setDashboard(cachedEntry.value);
        setError(null);
        return;
      }

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else if (!cachedEntry?.value) {
        setIsLoading(true);
      } else {
        setDashboard(cachedEntry.value);
      }

      try {
        if (isManualRefresh) {
          void apiRequest<{ postsSynced: number }>('/api/analytics/sync', {
            method: 'POST',
            token,
          })
            .then(() => fetchDashboard(undefined, { cacheBust: true }))
            .catch((syncError) => {
              setError(
                syncError instanceof Error
                  ? syncError.message
                  : 'Failed to sync analytics dashboard'
              );
            });
        }

        await fetchDashboard(undefined, { cacheBust: isManualRefresh });
      } catch (dashboardError) {
        setError(
          dashboardError instanceof Error
            ? dashboardError.message
            : 'Failed to load analytics dashboard'
        );
      } finally {
        if (isManualRefresh) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [fetchDashboard, getCachedDashboardEntry, token]
  );

  useEffect(() => {
    if (!token) {
      setDashboard(null);
      setError(null);
      return;
    }

    const cachedEntry = getCachedDashboardEntry();
    const cachedDashboard = cachedEntry?.value ?? null;

    if (cachedDashboard) {
      setDashboard(cachedDashboard);
      setError(null);

      if (
        cachedEntry?.cachedAt &&
        isBrowserCacheFresh(cachedEntry.cachedAt, ANALYTICS_DASHBOARD_CACHE_TTL_MS)
      ) {
        return;
      }
    }

    let isCancelled = false;

    setIsLoading(!cachedDashboard);

    void fetchDashboard()
      .catch((dashboardError) => {
        if (isCancelled) {
          return;
        }

        setError(
          dashboardError instanceof Error
            ? dashboardError.message
            : 'Failed to load analytics dashboard'
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [fetchDashboard, getCachedDashboardEntry, token]);

  const displayedLastUpdatedTime = useMemo(
    () => lastUpdatedTime ?? dashboard?.lastUpdatedAt ?? null,
    [dashboard?.lastUpdatedAt, lastUpdatedTime]
  );

  return {
    dashboard,
    isLoading,
    isRefreshing,
    lastUpdatedTime: displayedLastUpdatedTime,
    error,
    refresh,
    previewDashboard,
    getCachedDashboard,
  };
};
