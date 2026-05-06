"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrandPlatformMemorySnapshotsByUser = exports.upsertBrandPlatformMemorySnapshot = exports.createBrandMemoryGenerationLog = exports.createBrandMemoryFeedbackEvent = void 0;
const toBrandMemoryFeedbackEvent = (row) => ({
    id: row.id,
    userId: row.user_id,
    brandProfileId: row.brand_profile_id,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    sourceKey: row.source_key,
    memoryType: row.memory_type,
    eventType: row.event_type,
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
const toBrandMemoryGenerationLog = (row) => ({
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
const toBrandPlatformMemorySnapshot = (row) => ({
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
const createBrandMemoryFeedbackEvent = async (client, input) => {
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
    return toBrandMemoryFeedbackEvent(data);
};
exports.createBrandMemoryFeedbackEvent = createBrandMemoryFeedbackEvent;
const createBrandMemoryGenerationLog = async (client, input) => {
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
    return toBrandMemoryGenerationLog(data);
};
exports.createBrandMemoryGenerationLog = createBrandMemoryGenerationLog;
const upsertBrandPlatformMemorySnapshot = async (client, input) => {
    const { data, error } = await client
        .from('brand_platform_memory_snapshots')
        .upsert({
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
    }, {
        onConflict: 'user_id,platform,snapshot_type',
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to upsert brand platform memory snapshot');
    }
    return toBrandPlatformMemorySnapshot(data);
};
exports.upsertBrandPlatformMemorySnapshot = upsertBrandPlatformMemorySnapshot;
const getBrandPlatformMemorySnapshotsByUser = async (client, userId) => {
    const { data, error } = await client
        .from('brand_platform_memory_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
    if (error) {
        throw new Error(error.message || 'Failed to fetch brand platform memory snapshots');
    }
    return (data ?? []).map((row) => toBrandPlatformMemorySnapshot(row));
};
exports.getBrandPlatformMemorySnapshotsByUser = getBrandPlatformMemorySnapshotsByUser;
