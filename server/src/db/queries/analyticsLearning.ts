import type {
  AnalyticsLearningPattern,
  AnalyticsLearningPostSignal,
  AnalyticsLearningProfile,
  AnalyticsLearningRun,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type AnalyticsLearningPatternRow = Record<string, unknown>;

type AnalyticsLearningProfileRow = {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  platform: string;
  profile_type: string;
  summary_text: string;
  recommendation_text: string | null;
  metrics: Record<string, unknown> | null;
  patterns: AnalyticsLearningPatternRow[] | null;
  weak_patterns: AnalyticsLearningPatternRow[] | null;
  top_content_ids: unknown;
  analytics_context: Record<string, unknown> | null;
  source_window_start: string | null;
  source_window_end: string | null;
  last_analyzed_at: string;
  created_at: string;
  updated_at: string;
};

type AnalyticsLearningPostSignalRow = {
  id: string;
  user_id: string;
  analytics_id: string;
  content_id: string | null;
  scheduled_post_id: string | null;
  platform: string;
  source_post_key: string;
  performance_score: number | null;
  outcome_label: string;
  format_type: string | null;
  caption_length_bucket: string | null;
  hook_style: string | null;
  cta_style: string | null;
  hashtag_bucket: string | null;
  topic_tags: unknown;
  metrics: Record<string, unknown> | null;
  strategy: Record<string, unknown> | null;
  user_feedback: Record<string, unknown> | null;
  published_time: string | null;
  created_at: string;
  updated_at: string;
};

type AnalyticsLearningRunRow = {
  id: string;
  user_id: string;
  trigger_source: string;
  platforms: unknown;
  status: string;
  posts_analyzed: number | null;
  profiles_updated: number | null;
  summary: Record<string, unknown> | null;
  error_message: string | null;
  source_window_start: string | null;
  source_window_end: string | null;
  created_at: string;
  updated_at: string;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNumberRecord = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(isRecord(value) ? value : {}).map(([key, rawValue]) => [
      key,
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
          ? Number(rawValue) || 0
          : 0,
    ])
  );

const toPattern = (value: AnalyticsLearningPatternRow): AnalyticsLearningPattern => ({
  dimension: typeof value.dimension === 'string' ? value.dimension : 'general',
  label: typeof value.label === 'string' ? value.label : 'General',
  sampleSize:
    typeof value.sampleSize === 'number'
      ? value.sampleSize
      : typeof value.sample_size === 'number'
        ? value.sample_size
        : 0,
  averagePerformanceScore:
    typeof value.averagePerformanceScore === 'number'
      ? value.averagePerformanceScore
      : typeof value.average_performance_score === 'number'
        ? value.average_performance_score
        : 0,
  lift:
    typeof value.lift === 'number'
      ? value.lift
      : typeof value.relative_lift === 'number'
        ? value.relative_lift
        : 0,
  supportingMetrics: toNumberRecord(
    isRecord(value.supportingMetrics)
      ? value.supportingMetrics
      : isRecord(value.supporting_metrics)
        ? value.supporting_metrics
        : {}
  ),
  explanation: typeof value.explanation === 'string' ? value.explanation : '',
});

const toAnalyticsLearningProfile = (
  row: AnalyticsLearningProfileRow
): AnalyticsLearningProfile => ({
  id: row.id,
  userId: row.user_id,
  brandProfileId: row.brand_profile_id,
  platform: row.platform,
  profileType: row.profile_type,
  summaryText: row.summary_text,
  recommendationText: row.recommendation_text,
  metrics: row.metrics ?? {},
  patterns: Array.isArray(row.patterns) ? row.patterns.map(toPattern) : [],
  weakPatterns: Array.isArray(row.weak_patterns)
    ? row.weak_patterns.map(toPattern)
    : [],
  topContentIds: toStringArray(row.top_content_ids),
  analyticsContext: row.analytics_context ?? {},
  sourceWindowStart: row.source_window_start,
  sourceWindowEnd: row.source_window_end,
  lastAnalyzedAt: row.last_analyzed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAnalyticsLearningPostSignal = (
  row: AnalyticsLearningPostSignalRow
): AnalyticsLearningPostSignal => ({
  id: row.id,
  userId: row.user_id,
  analyticsId: row.analytics_id,
  contentId: row.content_id,
  scheduledPostId: row.scheduled_post_id,
  platform: row.platform,
  sourcePostKey: row.source_post_key,
  performanceScore:
    typeof row.performance_score === 'number' ? row.performance_score : 0,
  outcomeLabel:
    row.outcome_label === 'winning' ||
    row.outcome_label === 'solid' ||
    row.outcome_label === 'neutral' ||
    row.outcome_label === 'weak'
      ? row.outcome_label
      : 'neutral',
  formatType: row.format_type,
  captionLengthBucket: row.caption_length_bucket,
  hookStyle: row.hook_style,
  ctaStyle: row.cta_style,
  hashtagBucket: row.hashtag_bucket,
  topicTags: toStringArray(row.topic_tags),
  metrics: row.metrics ?? {},
  strategy: row.strategy ?? {},
  userFeedback: row.user_feedback ?? {},
  publishedTime: row.published_time,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAnalyticsLearningRun = (row: AnalyticsLearningRunRow): AnalyticsLearningRun => ({
  id: row.id,
  userId: row.user_id,
  triggerSource: row.trigger_source,
  platforms: toStringArray(row.platforms),
  status:
    row.status === 'running' || row.status === 'completed' || row.status === 'failed'
      ? row.status
      : 'running',
  postsAnalyzed: typeof row.posts_analyzed === 'number' ? row.posts_analyzed : 0,
  profilesUpdated:
    typeof row.profiles_updated === 'number' ? row.profiles_updated : 0,
  summary: row.summary ?? {},
  errorMessage: row.error_message,
  sourceWindowStart: row.source_window_start,
  sourceWindowEnd: row.source_window_end,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createAnalyticsLearningRun = async (
  client: AppSupabaseClient,
  input: {
    userId: string;
    triggerSource: string;
    platforms?: string[];
    sourceWindowStart?: string | null;
    sourceWindowEnd?: string | null;
    summary?: Record<string, unknown>;
  }
) => {
  const { data, error } = await client
    .from('analytics_learning_runs')
    .insert({
      user_id: input.userId,
      trigger_source: input.triggerSource,
      platforms: input.platforms ?? [],
      source_window_start: input.sourceWindowStart ?? null,
      source_window_end: input.sourceWindowEnd ?? null,
      summary: input.summary ?? {},
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create analytics learning run');
  }

  return toAnalyticsLearningRun(data as AnalyticsLearningRunRow);
};

export const updateAnalyticsLearningRun = async (
  client: AppSupabaseClient,
  input: {
    id: string;
    userId: string;
    status?: AnalyticsLearningRun['status'];
    postsAnalyzed?: number;
    profilesUpdated?: number;
    summary?: Record<string, unknown>;
    errorMessage?: string | null;
  }
) => {
  const { data, error } = await client
    .from('analytics_learning_runs')
    .update({
      status: input.status,
      posts_analyzed: input.postsAnalyzed,
      profiles_updated: input.profilesUpdated,
      summary: input.summary,
      error_message: input.errorMessage,
    })
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update analytics learning run');
  }

  return toAnalyticsLearningRun(data as AnalyticsLearningRunRow);
};

export const upsertAnalyticsLearningProfile = async (
  client: AppSupabaseClient,
  input: {
    userId: string;
    brandProfileId?: string | null;
    platform: string;
    profileType?: string;
    summaryText: string;
    recommendationText?: string | null;
    metrics?: Record<string, unknown>;
    patterns?: AnalyticsLearningPattern[];
    weakPatterns?: AnalyticsLearningPattern[];
    topContentIds?: string[];
    analyticsContext?: Record<string, unknown>;
    sourceWindowStart?: string | null;
    sourceWindowEnd?: string | null;
    lastAnalyzedAt?: string;
  }
) => {
  const { data, error } = await client
    .from('analytics_learning_profiles')
    .upsert(
      {
        user_id: input.userId,
        brand_profile_id: input.brandProfileId ?? null,
        platform: input.platform,
        profile_type: input.profileType ?? 'content-performance',
        summary_text: input.summaryText,
        recommendation_text: input.recommendationText ?? null,
        metrics: input.metrics ?? {},
        patterns: input.patterns ?? [],
        weak_patterns: input.weakPatterns ?? [],
        top_content_ids: input.topContentIds ?? [],
        analytics_context: input.analyticsContext ?? {},
        source_window_start: input.sourceWindowStart ?? null,
        source_window_end: input.sourceWindowEnd ?? null,
        last_analyzed_at: input.lastAnalyzedAt ?? new Date().toISOString(),
      },
      {
        onConflict: 'user_id,platform,profile_type',
      }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to upsert analytics learning profile');
  }

  return toAnalyticsLearningProfile(data as AnalyticsLearningProfileRow);
};

export const listAnalyticsLearningProfilesByUser = async (
  client: AppSupabaseClient,
  userId: string,
  options: {
    platform?: string | null;
    profileType?: string | null;
  } = {}
) => {
  let query = client
    .from('analytics_learning_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (options.platform) {
    query = query.eq('platform', options.platform);
  }

  if (options.profileType) {
    query = query.eq('profile_type', options.profileType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to fetch analytics learning profiles');
  }

  return (data ?? []).map((row) =>
    toAnalyticsLearningProfile(row as AnalyticsLearningProfileRow)
  );
};

export const upsertAnalyticsLearningPostSignal = async (
  client: AppSupabaseClient,
  input: {
    userId: string;
    analyticsId: string;
    contentId?: string | null;
    scheduledPostId?: string | null;
    platform: string;
    sourcePostKey: string;
    performanceScore: number;
    outcomeLabel: AnalyticsLearningPostSignal['outcomeLabel'];
    formatType?: string | null;
    captionLengthBucket?: string | null;
    hookStyle?: string | null;
    ctaStyle?: string | null;
    hashtagBucket?: string | null;
    topicTags?: string[];
    metrics?: Record<string, unknown>;
    strategy?: Record<string, unknown>;
    userFeedback?: Record<string, unknown>;
    publishedTime?: string | null;
  }
) => {
  const { data, error } = await client
    .from('analytics_learning_post_signals')
    .upsert(
      {
        user_id: input.userId,
        analytics_id: input.analyticsId,
        content_id: input.contentId ?? null,
        scheduled_post_id: input.scheduledPostId ?? null,
        platform: input.platform,
        source_post_key: input.sourcePostKey,
        performance_score: input.performanceScore,
        outcome_label: input.outcomeLabel,
        format_type: input.formatType ?? null,
        caption_length_bucket: input.captionLengthBucket ?? null,
        hook_style: input.hookStyle ?? null,
        cta_style: input.ctaStyle ?? null,
        hashtag_bucket: input.hashtagBucket ?? null,
        topic_tags: input.topicTags ?? [],
        metrics: input.metrics ?? {},
        strategy: input.strategy ?? {},
        user_feedback: input.userFeedback ?? {},
        published_time: input.publishedTime ?? null,
      },
      {
        onConflict: 'user_id,analytics_id',
      }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to upsert analytics learning post signal');
  }

  return toAnalyticsLearningPostSignal(data as AnalyticsLearningPostSignalRow);
};
