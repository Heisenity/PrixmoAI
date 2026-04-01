import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import {
  getAnalyticsHistory,
  getAnalyticsSummary,
  getBestPerformingPostThisWeek,
  getDeveloperResearchEvents,
  getDeveloperResearchSummary,
  getGenerationOverview,
  getWeeklyAnalyticsComparison,
  saveAnalyticsData,
} from '../db/queries/analytics';
import { requireSupabaseAdmin, requireUserClient } from '../db/supabase';
import { getAnalyticsDashboard } from '../services/analyticsDashboard.service';
import { syncAnalyticsForUser } from '../services/analyticsSync.service';
import type { RecordAnalyticsInput } from '../schemas/analytics.schema';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseOptionalDate = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

export const recordAnalytics = async (
  req: AuthenticatedRequest<{}, unknown, RecordAnalyticsInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const analytics = await saveAnalyticsData(client, req.user.id, req.body);

    return res.status(200).json({
      status: 'success',
      message: 'Analytics recorded successfully',
      data: analytics,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to record analytics',
    });
  }
};

export const getOverview = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const [generation, performance, weeklyComparison, bestPostThisWeek] =
      await Promise.all([
        getGenerationOverview(client, req.user.id),
        getAnalyticsSummary(client, req.user.id),
        getWeeklyAnalyticsComparison(client, req.user.id),
        getBestPerformingPostThisWeek(client, req.user.id),
      ]);

    return res.status(200).json({
      status: 'success',
      data: {
        generation,
        performance,
        weeklyComparison,
        bestPostThisWeek,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch analytics overview',
    });
  }
};

export const getDashboard = async (
  req: AuthenticatedRequest<
    {},
    unknown,
    unknown,
    {
      preset?: string;
      start?: string;
      end?: string;
      platform?: string;
    }
  >,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const dashboard = await getAnalyticsDashboard(client, req.user.id, {
      preset:
        req.query.preset === '7d' ||
        req.query.preset === '14d' ||
        req.query.preset === '28d' ||
        req.query.preset === '30d' ||
        req.query.preset === 'custom'
          ? req.query.preset
          : undefined,
      start: parseOptionalDate(req.query.start),
      end: parseOptionalDate(req.query.end),
      platformScope:
        req.query.platform === 'instagram' || req.query.platform === 'facebook'
          ? req.query.platform
          : 'all',
    });

    return res.status(200).json({
      status: 'success',
      data: dashboard,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch analytics dashboard',
    });
  }
};

export const syncAnalytics = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const summary = await syncAnalyticsForUser(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      message: 'Analytics synced successfully',
      data: summary,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to sync analytics',
    });
  }
};

export const getSummary = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const summary = await getAnalyticsSummary(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      data: summary,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to fetch analytics summary',
    });
  }
};

export const getWeeklyComparison = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const comparison = await getWeeklyAnalyticsComparison(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      data: comparison,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch weekly analytics comparison',
    });
  }
};

export const getBestPost = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const bestPost = await getBestPerformingPostThisWeek(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      data: bestPost,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch best performing post',
    });
  }
};

export const getHistory = async (
  req: AuthenticatedRequest<
    {},
    unknown,
    unknown,
    { page?: string; limit?: string; start?: string; end?: string }
  >,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const history = await getAnalyticsHistory(client, req.user.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 20),
      start: parseOptionalDate(req.query.start),
      end: parseOptionalDate(req.query.end),
    });

    return res.status(200).json({
      status: 'success',
      data: history,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to fetch analytics history',
    });
  }
};

export const getInternalResearchSummary = async (
  req: Request<{}, unknown, unknown, { start?: string; end?: string }>,
  res: Response
) => {
  try {
    const adminClient = requireSupabaseAdmin();
    const summary = await getDeveloperResearchSummary(adminClient, {
      start: parseOptionalDate(req.query.start),
      end: parseOptionalDate(req.query.end),
    });

    return res.status(200).json({
      status: 'success',
      data: summary,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch developer research summary',
    });
  }
};

export const getInternalResearchEvents = async (
  req: Request<
    {},
    unknown,
    unknown,
    { page?: string; limit?: string; start?: string; end?: string; featureKey?: string }
  >,
  res: Response
) => {
  try {
    const adminClient = requireSupabaseAdmin();
    const events = await getDeveloperResearchEvents(adminClient, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 20),
      start: parseOptionalDate(req.query.start),
      end: parseOptionalDate(req.query.end),
      featureKey:
        typeof req.query.featureKey === 'string' && req.query.featureKey.trim()
          ? req.query.featureKey
          : undefined,
    });

    return res.status(200).json({
      status: 'success',
      data: events,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch developer research events',
    });
  }
};
