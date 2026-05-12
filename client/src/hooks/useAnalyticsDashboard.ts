import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/axios';
import {
  isBrowserCacheFresh,
  readBrowserCache,
  writeBrowserCache,
} from '../lib/browserCache';
import {
  SUPER_ADMIN_TESTING_TIER_EVENT,
  isSuperAdminUser,
  normalizeSuperAdminTestingTier,
  readStoredSuperAdminTestingTier,
} from '../lib/superAdmin';
import { useAuth } from './useAuth';
import type {
  AnalyticsDashboard,
  AnalyticsPlatformScope,
  PlanType,
} from '../types';

type AnalyticsDashboardFilters = {
  preset: '7d' | '14d' | '28d' | '30d' | 'custom';
  platform: AnalyticsPlatformScope;
  start?: string;
  end?: string;
};

const buildDashboardCacheKey = (
  filters: AnalyticsDashboardFilters,
  superAdminTestingTier?: PlanType | null
) =>
  [
    superAdminTestingTier ?? 'default',
    filters.preset,
    filters.platform,
    filters.start || '',
    filters.end || '',
  ].join('::');

const ANALYTICS_DASHBOARD_CACHE_KEY_PREFIX = 'prixmoai.analytics.dashboard';
const ANALYTICS_DASHBOARD_CACHE_TTL_MS = 2 * 60_000;

const buildStoredDashboardCacheKey = (
  userId: string,
  filters: AnalyticsDashboardFilters,
  superAdminTestingTier?: PlanType | null
) =>
  `${ANALYTICS_DASHBOARD_CACHE_KEY_PREFIX}:${userId}:${buildDashboardCacheKey(
    filters,
    superAdminTestingTier
  )}`;

export const useAnalyticsDashboard = (filters: AnalyticsDashboardFilters) => {
  const { token, user } = useAuth();
  const [superAdminTestingTier, setSuperAdminTestingTier] = useState<PlanType>(() =>
    readStoredSuperAdminTestingTier()
  );
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLearningRefreshing, setIsLearningRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, AnalyticsDashboard>>({});
  const delayedLearningFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveSuperAdminTestingTier = isSuperAdminUser(user)
    ? superAdminTestingTier
    : null;

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
      options?: {
        cacheBust?: boolean;
        setAsCurrent?: boolean;
        updateLastUpdated?: boolean;
      }
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

      cacheRef.current[
        buildDashboardCacheKey(nextFilters, effectiveSuperAdminTestingTier)
      ] = nextDashboard;

      if (user?.id) {
        writeBrowserCache(
          buildStoredDashboardCacheKey(
            user.id,
            nextFilters,
            effectiveSuperAdminTestingTier
          ),
          nextDashboard
        );
      }

      if (options?.setAsCurrent !== false) {
        setDashboard(nextDashboard);
        if (options?.updateLastUpdated !== false) {
          setLastUpdatedTime(new Date().toISOString());
        }
        setError(null);
      }

      return nextDashboard;
    },
    [effectiveSuperAdminTestingTier, resolveFilters, token, user?.id]
  );

  const getCachedDashboardEntry = useCallback(
    (overrides?: Partial<AnalyticsDashboardFilters>) => {
      const nextFilters = resolveFilters(overrides);
      const memoryValue =
        cacheRef.current[
          buildDashboardCacheKey(nextFilters, effectiveSuperAdminTestingTier)
        ];

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
        buildStoredDashboardCacheKey(
          user.id,
          nextFilters,
          effectiveSuperAdminTestingTier
        )
      );
    },
    [effectiveSuperAdminTestingTier, resolveFilters, user?.id]
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

  const refresh = useCallback(
    async (options?: { sync?: boolean; learningOnly?: boolean }) => {
      if (!token) {
        return;
      }

      const isManualRefresh = Boolean(options?.sync);
      const isLearningOnlyRefresh = Boolean(options?.learningOnly);
      const nextFilters = resolveFilters();
      const cachedEntry = getCachedDashboardEntry();

      if (isLearningOnlyRefresh) {
        setIsLearningRefreshing(true);

        try {
          await apiRequest<{
            postsAnalyzed: number;
            profilesUpdated: number;
            updatedPlatforms: string[];
          }>('/api/analytics/learning/refresh', {
            method: 'POST',
            token,
            body: {
              platform: nextFilters.platform === 'all' ? undefined : nextFilters.platform,
            },
          });

          await fetchDashboard(undefined, {
            cacheBust: true,
            updateLastUpdated: false,
          });
        } catch (dashboardError) {
          setError(
            dashboardError instanceof Error
              ? dashboardError.message
              : 'Failed to refresh analytics learning'
          );
        } finally {
          setIsLearningRefreshing(false);
        }

        return;
      }

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
          await apiRequest<{ postsSynced: number }>('/api/analytics/sync', {
            method: 'POST',
            token,
            body: {
              awaitLearning: false,
            },
          });
        }

        await fetchDashboard(undefined, { cacheBust: isManualRefresh });

        if (isManualRefresh) {
          if (delayedLearningFetchRef.current) {
            clearTimeout(delayedLearningFetchRef.current);
          }

          delayedLearningFetchRef.current = setTimeout(() => {
            void fetchDashboard(undefined, {
              cacheBust: true,
              updateLastUpdated: false,
            }).finally(() => {
              delayedLearningFetchRef.current = null;
            });
          }, 2200);
        }
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
    [fetchDashboard, getCachedDashboardEntry, resolveFilters, token]
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

  useEffect(
    () => () => {
      if (delayedLearningFetchRef.current) {
        clearTimeout(delayedLearningFetchRef.current);
      }
    },
    []
  );

  const displayedLastUpdatedTime = useMemo(
    () => lastUpdatedTime ?? dashboard?.lastUpdatedAt ?? null,
    [dashboard?.lastUpdatedAt, lastUpdatedTime]
  );

  return {
    dashboard,
    isLoading,
    isRefreshing,
    isLearningRefreshing,
    lastUpdatedTime: displayedLastUpdatedTime,
    error,
    refresh,
    previewDashboard,
    getCachedDashboard,
  };
};
