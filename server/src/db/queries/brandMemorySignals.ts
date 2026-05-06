import type {
  BrandMemoryFeedbackEvent,
  BrandMemoryGenerationLog,
  BrandPlatformMemorySnapshot,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type BrandMemoryFeedbackEventRow = {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  source_table: string;
  source_id: string;
  source_key: string;
  memory_type: string;
  event_type: string;
  platform: string | null;
  content_id: string | null;
  generated_image_id: string | null;
  scheduled_post_id: string | null;
  scheduled_item_id: string | null;
  accepted_feedback_event_id: string | null;
  used_for_scheduler: boolean | null;
  used_same_caption_for_scheduler: boolean | null;
  intensity: number | null;
  was_ai_recommended: boolean | null;
  weight_delta: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type BrandMemoryGenerationLogRow = {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  task_type: string;
  request_context: string | null;
  provider: string | null;
  rerank_provider: string | null;
  fallback_used: boolean | null;
  retrieval_strategy: string | null;
  query_text: string;
  selected_platform: string | null;
  selected_goal: string | null;
  retrieved_memories: Record<string, unknown>[] | null;
  selected_memories: Record<string, unknown>[] | null;
  analytics_context: Record<string, unknown> | null;
  evaluation_summary: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type BrandPlatformMemorySnapshotRow = {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  platform: string;
  snapshot_type: string;
  summary_text: string;
  metrics: Record<string, unknown> | null;
  top_posts: Record<string, unknown>[] | null;
  signals: Record<string, unknown> | null;
  source_window_start: string | null;
  source_window_end: string | null;
  created_at: string;
  updated_at: string;
};

const toBrandMemoryFeedbackEvent = (
  row: BrandMemoryFeedbackEventRow
): BrandMemoryFeedbackEvent => ({
  id: row.id,
  userId: row.user_id,
  brandProfileId: row.brand_profile_id,
  sourceTable: row.source_table,
  sourceId: row.source_id,
  sourceKey: row.source_key,
  memoryType: row.memory_type,
  eventType: row.event_type as BrandMemoryFeedbackEvent['eventType'],
  platform: row.platform,
  contentId: row.content_id,
  generatedImageId: row.generated_image_id,
  scheduledPostId: row.scheduled_post_id,
  scheduledItemId: row.scheduled_item_id,
  acceptedFeedbackEventId: row.accepted_feedback_event_id,
  usedForScheduler: row.used_for_scheduler,
  usedSameCaptionForScheduler: row.used_same_caption_for_scheduler,
  intensity: typeof row.intensity === 'number' ? row.intensity : 1,
  wasAiRecommended: row.was_ai_recommended === true,
  weightDelta: typeof row.weight_delta === 'number' ? row.weight_delta : null,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

const toBrandMemoryGenerationLog = (
  row: BrandMemoryGenerationLogRow
): BrandMemoryGenerationLog => ({
  id: row.id,
  userId: row.user_id,
  brandProfileId: row.brand_profile_id,
  taskType: row.task_type,
  requestContext: row.request_context,
  provider: row.provider,
  rerankProvider: row.rerank_provider,
  fallbackUsed: row.fallback_used === true,
  retrievalStrategy: row.retrieval_strategy,
  queryText: row.query_text,
  selectedPlatform: row.selected_platform,
  selectedGoal: row.selected_goal,
  retrievedMemories: row.retrieved_memories ?? [],
  selectedMemories: row.selected_memories ?? [],
  analyticsContext: row.analytics_context ?? {},
  evaluationSummary: row.evaluation_summary ?? {},
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

const toBrandPlatformMemorySnapshot = (
  row: BrandPlatformMemorySnapshotRow
): BrandPlatformMemorySnapshot => ({
  id: row.id,
  userId: row.user_id,
  brandProfileId: row.brand_profile_id,
  platform: row.platform,
  snapshotType: row.snapshot_type,
  summaryText: row.summary_text,
  metrics: row.metrics ?? {},
  topPosts: row.top_posts ?? [],
  signals: row.signals ?? {},
  sourceWindowStart: row.source_window_start,
  sourceWindowEnd: row.source_window_end,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createBrandMemoryFeedbackEvent = async (
  client: AppSupabaseClient,
  input: {
    userId: string;
    brandProfileId?: string | null;
    sourceTable: string;
    sourceId: string;
    sourceKey?: string | null;
    memoryType: string;
    eventType: string;
    platform?: string | null;
    contentId?: string | null;
    generatedImageId?: string | null;
    scheduledPostId?: string | null;
    scheduledItemId?: string | null;
    acceptedFeedbackEventId?: string | null;
    usedForScheduler?: boolean | null;
    usedSameCaptionForScheduler?: boolean | null;
    intensity?: number;
    wasAiRecommended?: boolean;
    weightDelta?: number | null;
    metadata?: Record<string, unknown>;
  }
) => {
  const { data, error } = await client
    .from('brand_memory_feedback_events')
    .insert({
      user_id: input.userId,
      brand_profile_id: input.brandProfileId ?? null,
      source_table: input.sourceTable,
      source_id: input.sourceId,
      source_key: input.sourceKey ?? 'primary',
      memory_type: input.memoryType,
      event_type: input.eventType,
      platform: input.platform ?? null,
      content_id: input.contentId ?? null,
      generated_image_id: input.generatedImageId ?? null,
      scheduled_post_id: input.scheduledPostId ?? null,
      scheduled_item_id: input.scheduledItemId ?? null,
      accepted_feedback_event_id: input.acceptedFeedbackEventId ?? null,
      used_for_scheduler: input.usedForScheduler ?? null,
      used_same_caption_for_scheduler: input.usedSameCaptionForScheduler ?? null,
      intensity: input.intensity ?? 1,
      was_ai_recommended: input.wasAiRecommended ?? false,
      weight_delta: input.weightDelta ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create brand memory feedback event');
  }

  return toBrandMemoryFeedbackEvent(data as BrandMemoryFeedbackEventRow);
};

export const createBrandMemoryGenerationLog = async (
  client: AppSupabaseClient,
  input: {
    userId: string;
    brandProfileId?: string | null;
    taskType: string;
    requestContext?: string | null;
    provider?: string | null;
    rerankProvider?: string | null;
    fallbackUsed?: boolean;
    retrievalStrategy?: string | null;
    queryText: string;
    selectedPlatform?: string | null;
    selectedGoal?: string | null;
    retrievedMemories?: Record<string, unknown>[];
    selectedMemories?: Record<string, unknown>[];
    analyticsContext?: Record<string, unknown>;
    evaluationSummary?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
) => {
  const { data, error } = await client
    .from('brand_memory_generation_logs')
    .insert({
      user_id: input.userId,
      brand_profile_id: input.brandProfileId ?? null,
      task_type: input.taskType,
      request_context: input.requestContext ?? null,
      provider: input.provider ?? null,
      rerank_provider: input.rerankProvider ?? null,
      fallback_used: input.fallbackUsed ?? false,
      retrieval_strategy: input.retrievalStrategy ?? null,
      query_text: input.queryText,
      selected_platform: input.selectedPlatform ?? null,
      selected_goal: input.selectedGoal ?? null,
      retrieved_memories: input.retrievedMemories ?? [],
      selected_memories: input.selectedMemories ?? [],
      analytics_context: input.analyticsContext ?? {},
      evaluation_summary: input.evaluationSummary ?? {},
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create brand memory generation log');
  }

  return toBrandMemoryGenerationLog(data as BrandMemoryGenerationLogRow);
};

export const upsertBrandPlatformMemorySnapshot = async (
  client: AppSupabaseClient,
  input: {
    userId: string;
    brandProfileId?: string | null;
    platform: string;
    snapshotType?: string;
    summaryText: string;
    metrics?: Record<string, unknown>;
    topPosts?: Record<string, unknown>[];
    signals?: Record<string, unknown>;
    sourceWindowStart?: string | null;
    sourceWindowEnd?: string | null;
  }
) => {
  const { data, error } = await client
    .from('brand_platform_memory_snapshots')
    .upsert(
      {
        user_id: input.userId,
        brand_profile_id: input.brandProfileId ?? null,
        platform: input.platform,
        snapshot_type: input.snapshotType ?? 'performance',
        summary_text: input.summaryText,
        metrics: input.metrics ?? {},
        top_posts: input.topPosts ?? [],
        signals: input.signals ?? {},
        source_window_start: input.sourceWindowStart ?? null,
        source_window_end: input.sourceWindowEnd ?? null,
      },
      {
        onConflict: 'user_id,platform,snapshot_type',
      }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to upsert brand platform memory snapshot');
  }

  return toBrandPlatformMemorySnapshot(data as BrandPlatformMemorySnapshotRow);
};

export const getBrandPlatformMemorySnapshotsByUser = async (
  client: AppSupabaseClient,
  userId: string
) => {
  const { data, error } = await client
    .from('brand_platform_memory_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch brand platform memory snapshots');
  }

  return (data ?? []).map((row) =>
    toBrandPlatformMemorySnapshot(row as BrandPlatformMemorySnapshotRow)
  );
};
