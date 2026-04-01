import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type { AnalyticsDashboard, AnalyticsPlatformScope } from '../types';

type AnalyticsDashboardFilters = {
  preset: '7d' | '14d' | '28d' | '30d' | 'custom';
  platform: AnalyticsPlatformScope;
  start?: string;
  end?: string;
};

export const useAnalyticsDashboard = (filters: AnalyticsDashboardFilters) => {
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (options?: { sync?: boolean }) => {
    if (!token) {
      return;
    }

    setIsLoading(true);

    try {
      if (options?.sync) {
        await apiRequest<{ postsSynced: number }>('/api/analytics/sync', {
          method: 'POST',
          token,
        });
      }

      const nextDashboard = await apiRequest<AnalyticsDashboard>('/api/analytics/dashboard', {
        token,
        query: {
          preset: filters.preset,
          platform: filters.platform,
          start: filters.preset === 'custom' ? filters.start : undefined,
          end: filters.preset === 'custom' ? filters.end : undefined,
        },
      });

      setDashboard(nextDashboard);
      setError(null);
    } catch (dashboardError) {
      setError(
        dashboardError instanceof Error
          ? dashboardError.message
          : 'Failed to load analytics dashboard'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, filters.preset, filters.platform, filters.start, filters.end]);

  return {
    dashboard,
    isLoading,
    error,
    refresh,
  };
};
