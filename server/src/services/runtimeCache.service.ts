import { buildRedisKey } from '../lib/redis';

export const getOrSetJsonCache = async <T>(
  _key: string,
  compute: () => Promise<T>
): Promise<T> => compute();

export const deleteRuntimeCacheKey = async (_key: string) => {};

export const deleteRuntimeCacheByPrefix = async (
  ..._parts: Array<string | number>
) => {};

export const buildRuntimeCacheKey = (...parts: Array<string | number>) =>
  buildRedisKey('cache', ...parts);

export const buildAnalyticsOverviewCacheKey = (userId: string) =>
  buildRuntimeCacheKey('analytics', userId, 'overview');

export const buildAnalyticsDashboardCacheKey = (
  userId: string,
  filters: {
    preset?: string;
    start?: string;
    end?: string;
    platform?: string;
  }
) =>
  buildRuntimeCacheKey(
    'analytics',
    userId,
    'dashboard',
    filters.preset || 'none',
    filters.start || 'none',
    filters.end || 'none',
    filters.platform || 'all'
  );

export const buildAnalyticsSummaryCacheKey = (userId: string) =>
  buildRuntimeCacheKey('analytics', userId, 'summary');

export const buildAnalyticsWeeklyComparisonCacheKey = (userId: string) =>
  buildRuntimeCacheKey('analytics', userId, 'weekly-comparison');

export const buildAnalyticsBestPostCacheKey = (userId: string) =>
  buildRuntimeCacheKey('analytics', userId, 'best-post');

export const buildAnalyticsHistoryCacheKey = (
  userId: string,
  filters: {
    page: number;
    limit: number;
    start?: string;
    end?: string;
  }
) =>
  buildRuntimeCacheKey(
    'analytics',
    userId,
    'history',
    filters.page,
    filters.limit,
    filters.start || 'none',
    filters.end || 'none'
  );

export const invalidateAnalyticsRuntimeCache = async (userId: string) =>
  deleteRuntimeCacheByPrefix('analytics', userId);

export const buildBillingPlansCacheKey = (userId: string) =>
  buildRuntimeCacheKey('billing', userId, 'plans');

export const buildBillingSubscriptionCacheKey = (userId: string) =>
  buildRuntimeCacheKey('billing', userId, 'subscription');

export const invalidateBillingRuntimeCache = async (userId: string) =>
  deleteRuntimeCacheByPrefix('billing', userId);
