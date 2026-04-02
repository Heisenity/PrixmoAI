import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/axios';
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

export const useAnalyticsDashboard = (filters: AnalyticsDashboardFilters) => {
  const { token } = useAuth();
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

      if (options?.setAsCurrent !== false) {
        setDashboard(nextDashboard);
        setLastUpdatedTime(new Date().toISOString());
        setError(null);
      }

      return nextDashboard;
    },
    [resolveFilters, token]
  );

  const getCachedDashboard = useCallback(
    (overrides?: Partial<AnalyticsDashboardFilters>) =>
      cacheRef.current[buildDashboardCacheKey(resolveFilters(overrides))] ?? null,
    [resolveFilters]
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

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
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
    [fetchDashboard, token]
  );

  useEffect(() => {
    if (!token) {
      setDashboard(null);
      setError(null);
      return;
    }

    const cachedDashboard = getCachedDashboard();

    if (cachedDashboard) {
      setDashboard(cachedDashboard);
      setError(null);
      return;
    }

    let isCancelled = false;

    setIsLoading(true);

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
  }, [fetchDashboard, getCachedDashboard, token]);

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
