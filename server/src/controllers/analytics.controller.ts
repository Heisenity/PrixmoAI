import { User } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import { supabase } from '../db/supabase';

type AuthenticatedRequest = Request & {
  user?: User;
};

type AnalyticsRow = {
  id?: string | null;
  user_id?: string | null;
  content_id?: string | null;
  generated_content_id?: string | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares?: number | null;
  saves?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

type MonthlyStats = {
  reach: number;
  likes: number;
  comments: number;
};

const getCurrentMonthWindow = () => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  return { monthStart, nextMonthStart };
};

const getCurrentWeekWindow = () => {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const daysSinceMonday = (currentDay + 6) % 7;
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday)
  );
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

  return { weekStart, nextWeekStart };
};

const getPreviousWeekWindow = () => {
  const { weekStart } = getCurrentWeekWindow();
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

  return {
    previousWeekStart,
    previousWeekEnd: weekStart,
  };
};

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const getEngagementScore = (record: AnalyticsRow) =>
  toNumber(record.likes) +
  toNumber(record.comments) +
  toNumber(record.shares) +
  toNumber(record.saves);

export const getStats = async (req: AuthenticatedRequest, res: Response) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const { monthStart, nextMonthStart } = getCurrentMonthWindow();

  const [analyticsResult, postsResult] = await Promise.all([
    supabase
      .from('analytics')
      .select('reach, likes, comments')
      .eq('user_id', req.user.id)
      .gte('created_at', monthStart.toISOString())
      .lt('created_at', nextMonthStart.toISOString()),
    supabase
      .from('generated_content')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .gte('created_at', monthStart.toISOString())
      .lt('created_at', nextMonthStart.toISOString()),
  ]);

  if (analyticsResult.error) {
    return res.status(500).json({
      status: 'error',
      message: analyticsResult.error.message || 'Failed to fetch analytics stats',
    });
  }

  if (postsResult.error) {
    return res.status(500).json({
      status: 'error',
      message: postsResult.error.message || 'Failed to fetch monthly post count',
    });
  }

  const totals =
    (analyticsResult.data as AnalyticsRow[] | null)?.reduce<MonthlyStats>(
      (accumulator, item) => {
      accumulator.reach += toNumber(item.reach);
      accumulator.likes += toNumber(item.likes);
      accumulator.comments += toNumber(item.comments);
      return accumulator;
      },
      {
        reach: 0,
        likes: 0,
        comments: 0,
      }
    ) ?? {
      reach: 0,
      likes: 0,
      comments: 0,
    };

  return res.status(200).json({
    status: 'success',
    stats: {
      ...totals,
      posts: postsResult.count ?? 0,
    },
    period: {
      start: monthStart.toISOString(),
      end: nextMonthStart.toISOString(),
    },
  });
};

export const getBestPost = async (_req: AuthenticatedRequest, res: Response) => {
  const req = _req;

  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const { weekStart, nextWeekStart } = getCurrentWeekWindow();

  const { data: analyticsRows, error } = await supabase
    .from('analytics')
    .select('*')
    .eq('user_id', req.user.id)
    .gte('created_at', weekStart.toISOString())
    .lt('created_at', nextWeekStart.toISOString());

  if (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch weekly analytics',
    });
  }

  const bestPost =
    (analyticsRows as AnalyticsRow[] | null)?.reduce<AnalyticsRow | null>(
      (currentBest, item) => {
        if (!currentBest) {
          return item;
        }

        return getEngagementScore(item) > getEngagementScore(currentBest)
          ? item
          : currentBest;
      },
      null
    ) ?? null;

  if (!bestPost) {
    return res.status(200).json({
      status: 'success',
      bestPost: null,
      period: {
        start: weekStart.toISOString(),
        end: nextWeekStart.toISOString(),
      },
    });
  }

  const contentId =
    typeof bestPost.generated_content_id === 'string'
      ? bestPost.generated_content_id
      : typeof bestPost.content_id === 'string'
        ? bestPost.content_id
        : null;

  let content: Record<string, unknown> | null = null;

  if (contentId) {
    const { data: contentRow } = await supabase
      .from('generated_content')
      .select('*')
      .eq('id', contentId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    content = (contentRow as Record<string, unknown> | null) ?? null;
  }

  return res.status(200).json({
    status: 'success',
    bestPost: {
      analytics: {
        ...bestPost,
        engagementScore: getEngagementScore(bestPost),
      },
      content,
    },
    period: {
      start: weekStart.toISOString(),
      end: nextWeekStart.toISOString(),
    },
  });
};

export const getWeeklyScore = async (req: AuthenticatedRequest, res: Response) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const { weekStart, nextWeekStart } = getCurrentWeekWindow();
  const { previousWeekStart, previousWeekEnd } = getPreviousWeekWindow();

  const [thisWeekResult, lastWeekResult] = await Promise.all([
    supabase
      .from('analytics')
      .select('likes, comments, shares, saves')
      .eq('user_id', req.user.id)
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', nextWeekStart.toISOString()),
    supabase
      .from('analytics')
      .select('likes, comments, shares, saves')
      .eq('user_id', req.user.id)
      .gte('created_at', previousWeekStart.toISOString())
      .lt('created_at', previousWeekEnd.toISOString()),
  ]);

  if (thisWeekResult.error) {
    return res.status(500).json({
      status: 'error',
      message: thisWeekResult.error.message || 'Failed to fetch this week analytics',
    });
  }

  if (lastWeekResult.error) {
    return res.status(500).json({
      status: 'error',
      message: lastWeekResult.error.message || 'Failed to fetch last week analytics',
    });
  }

  const thisWeekScore =
    (thisWeekResult.data as AnalyticsRow[] | null)?.reduce(
      (total, item) => total + getEngagementScore(item),
      0
    ) ?? 0;

  const lastWeekScore =
    (lastWeekResult.data as AnalyticsRow[] | null)?.reduce(
      (total, item) => total + getEngagementScore(item),
      0
    ) ?? 0;

  let percentageChange = 0;
  let direction: 'up' | 'down' | 'flat' = 'flat';

  if (lastWeekScore === 0) {
    percentageChange = thisWeekScore > 0 ? 100 : 0;
  } else {
    percentageChange = Number(
      (((thisWeekScore - lastWeekScore) / lastWeekScore) * 100).toFixed(2)
    );
  }

  if (thisWeekScore > lastWeekScore) {
    direction = 'up';
  } else if (thisWeekScore < lastWeekScore) {
    direction = 'down';
  }

  return res.status(200).json({
    status: 'success',
    weeklyScore: {
      currentWeek: thisWeekScore,
      previousWeek: lastWeekScore,
      percentageChange,
      direction,
    },
    periods: {
      currentWeek: {
        start: weekStart.toISOString(),
        end: nextWeekStart.toISOString(),
      },
      previousWeek: {
        start: previousWeekStart.toISOString(),
        end: previousWeekEnd.toISOString(),
      },
    },
  });
};
