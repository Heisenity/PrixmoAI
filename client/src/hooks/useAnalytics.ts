import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type { AnalyticsOverview, AnalyticsRecord, PaginatedResult } from '../types';

export const useAnalytics = () => {
  const { token } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [history, setHistory] = useState<PaginatedResult<AnalyticsRecord> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);

    try {
      const [nextOverview, nextHistory] = await Promise.all([
        apiRequest<AnalyticsOverview>('/api/analytics/overview', { token }),
        apiRequest<PaginatedResult<AnalyticsRecord>>('/api/analytics/history', { token }),
      ]);

      setOverview(nextOverview);
      setHistory(nextHistory);
      setError(null);
    } catch (analyticsError) {
      setError(
        analyticsError instanceof Error
          ? analyticsError.message
          : 'Failed to load analytics'
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const handleFocus = () => {
      void refresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
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
    error,
    refresh,
  };
};
