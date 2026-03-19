import type {
  AnalyticsData,
  AnalyticsSummary,
  CreateAnalyticsInput,
  WeeklyAnalyticsComparison,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type AnalyticsRow = {
  id: string;
  user_id: string;
  scheduled_post_id: string | null;
  content_id: string | null;
  platform: string | null;
  post_external_id: string | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagement_rate: number | string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
};

type DateRangeOptions = {
  start?: string;
  end?: string;
};

const toNumber = (value: unknown): number =>
  typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value) || 0
      : 0;

const getEngagementScore = (item: AnalyticsData) =>
  item.likes + item.comments + item.shares + item.saves;

const getCurrentMonthWindow = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const getCurrentWeekWindow = () => {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const daysSinceMonday = (currentDay + 6) % 7;
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday)
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const getPreviousWeekWindow = () => {
  const { start } = getCurrentWeekWindow();
  const currentStart = new Date(start);
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);

  return {
    start: previousStart.toISOString(),
    end: currentStart.toISOString(),
  };
};

const toAnalyticsData = (row: AnalyticsRow): AnalyticsData => ({
  id: row.id,
  userId: row.user_id,
  scheduledPostId: row.scheduled_post_id,
  contentId: row.content_id,
  platform: row.platform,
  postExternalId: row.post_external_id,
  reach: toNumber(row.reach),
  impressions: toNumber(row.impressions),
  likes: toNumber(row.likes),
  comments: toNumber(row.comments),
  shares: toNumber(row.shares),
  saves: toNumber(row.saves),
  engagementRate:
    row.engagement_rate === null ? null : Number(row.engagement_rate),
  recordedAt: row.recorded_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const saveAnalyticsData = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateAnalyticsInput
): Promise<AnalyticsData> => {
  const { data, error } = await client
    .from('analytics')
    .insert({
      user_id: userId,
      scheduled_post_id: input.scheduledPostId ?? null,
      content_id: input.contentId ?? null,
      platform: input.platform ?? null,
      post_external_id: input.postExternalId ?? null,
      reach: input.reach ?? 0,
      impressions: input.impressions ?? 0,
      likes: input.likes ?? 0,
      comments: input.comments ?? 0,
      shares: input.shares ?? 0,
      saves: input.saves ?? 0,
      engagement_rate: input.engagementRate ?? null,
      recorded_at: input.recordedAt ?? new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save analytics data');
  }

  return toAnalyticsData(data as AnalyticsRow);
};

export const getAnalyticsByUserId = async (
  client: AppSupabaseClient,
  userId: string,
  options: DateRangeOptions = {}
): Promise<AnalyticsData[]> => {
  let query = client
    .from('analytics')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false });

  if (options.start) {
    query = query.gte('recorded_at', options.start);
  }

  if (options.end) {
    query = query.lt('recorded_at', options.end);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to fetch analytics');
  }

  return (data ?? []).map((row) => toAnalyticsData(row as AnalyticsRow));
};

export const getAnalyticsSummary = async (
  client: AppSupabaseClient,
  userId: string
): Promise<AnalyticsSummary> => {
  const { start, end } = getCurrentMonthWindow();
  const rows = await getAnalyticsByUserId(client, userId, {
    start,
    end,
  });

  const summary = rows.reduce<AnalyticsSummary>(
    (accumulator, item) => {
      accumulator.reach += item.reach;
      accumulator.impressions += item.impressions;
      accumulator.likes += item.likes;
      accumulator.comments += item.comments;
      accumulator.shares += item.shares;
      accumulator.saves += item.saves;
      accumulator.posts += 1;
      return accumulator;
    },
    {
      reach: 0,
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      posts: 0,
      averageEngagement: 0,
    }
  );

  const totalEngagement =
    summary.likes + summary.comments + summary.shares + summary.saves;

  return {
    ...summary,
    averageEngagement:
      rows.length > 0 ? Number((totalEngagement / rows.length).toFixed(2)) : 0,
  };
};

export const getBestPerformingPostThisWeek = async (
  client: AppSupabaseClient,
  userId: string
): Promise<AnalyticsData | null> => {
  const { start, end } = getCurrentWeekWindow();
  const rows = await getAnalyticsByUserId(client, userId, {
    start,
    end,
  });

  return rows.reduce<AnalyticsData | null>((best, item) => {
    if (!best) {
      return item;
    }

    return getEngagementScore(item) > getEngagementScore(best) ? item : best;
  }, null);
};

export const getWeeklyAnalyticsComparison = async (
  client: AppSupabaseClient,
  userId: string
): Promise<WeeklyAnalyticsComparison> => {
  const currentWeek = getCurrentWeekWindow();
  const previousWeek = getPreviousWeekWindow();

  const [currentRows, previousRows] = await Promise.all([
    getAnalyticsByUserId(client, userId, currentWeek),
    getAnalyticsByUserId(client, userId, previousWeek),
  ]);

  const currentWeekScore = currentRows.reduce(
    (total, item) => total + getEngagementScore(item),
    0
  );
  const previousWeekScore = previousRows.reduce(
    (total, item) => total + getEngagementScore(item),
    0
  );

  const percentageChange =
    previousWeekScore === 0
      ? currentWeekScore > 0
        ? 100
        : 0
      : Number(
          (
            ((currentWeekScore - previousWeekScore) / previousWeekScore) *
            100
          ).toFixed(2)
        );

  return {
    currentWeek: currentWeekScore,
    previousWeek: previousWeekScore,
    percentageChange,
    direction:
      currentWeekScore > previousWeekScore
        ? 'up'
        : currentWeekScore < previousWeekScore
          ? 'down'
          : 'flat',
  };
};
