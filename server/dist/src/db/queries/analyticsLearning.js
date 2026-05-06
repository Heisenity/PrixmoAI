"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertAnalyticsLearningPostSignal = exports.listAnalyticsLearningProfilesByUser = exports.upsertAnalyticsLearningProfile = exports.updateAnalyticsLearningRun = exports.createAnalyticsLearningRun = void 0;
const toStringArray = (value) => Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toNumberRecord = (value) => Object.fromEntries(Object.entries(isRecord(value) ? value : {}).map(([key, rawValue]) => [
    key,
    typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
            ? Number(rawValue) || 0
            : 0,
]));
const toPattern = (value) => ({
    dimension: typeof value.dimension === 'string' ? value.dimension : 'general',
    label: typeof value.label === 'string' ? value.label : 'General',
    sampleSize: typeof value.sampleSize === 'number'
        ? value.sampleSize
        : typeof value.sample_size === 'number'
            ? value.sample_size
            : 0,
    averagePerformanceScore: typeof value.averagePerformanceScore === 'number'
        ? value.averagePerformanceScore
        : typeof value.average_performance_score === 'number'
            ? value.average_performance_score
            : 0,
    lift: typeof value.lift === 'number'
        ? value.lift
        : typeof value.relative_lift === 'number'
            ? value.relative_lift
            : 0,
    supportingMetrics: toNumberRecord(isRecord(value.supportingMetrics)
        ? value.supportingMetrics
        : isRecord(value.supporting_metrics)
            ? value.supporting_metrics
            : {}),
    explanation: typeof value.explanation === 'string' ? value.explanation : '',
});
const toAnalyticsLearningProfile = (row) => ({
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
const toAnalyticsLearningPostSignal = (row) => ({
    id: row.id,
    userId: row.user_id,
    analyticsId: row.analytics_id,
    contentId: row.content_id,
    scheduledPostId: row.scheduled_post_id,
    platform: row.platform,
    sourcePostKey: row.source_post_key,
    performanceScore: typeof row.performance_score === 'number' ? row.performance_score : 0,
    outcomeLabel: row.outcome_label === 'winning' ||
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
const toAnalyticsLearningRun = (row) => ({
    id: row.id,
    userId: row.user_id,
    triggerSource: row.trigger_source,
    platforms: toStringArray(row.platforms),
    status: row.status === 'running' || row.status === 'completed' || row.status === 'failed'
        ? row.status
        : 'running',
    postsAnalyzed: typeof row.posts_analyzed === 'number' ? row.posts_analyzed : 0,
    profilesUpdated: typeof row.profiles_updated === 'number' ? row.profiles_updated : 0,
    summary: row.summary ?? {},
    errorMessage: row.error_message,
    sourceWindowStart: row.source_window_start,
    sourceWindowEnd: row.source_window_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const createAnalyticsLearningRun = async (client, input) => {
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
    return toAnalyticsLearningRun(data);
};
exports.createAnalyticsLearningRun = createAnalyticsLearningRun;
const updateAnalyticsLearningRun = async (client, input) => {
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
    return toAnalyticsLearningRun(data);
};
exports.updateAnalyticsLearningRun = updateAnalyticsLearningRun;
const upsertAnalyticsLearningProfile = async (client, input) => {
    const { data, error } = await client
        .from('analytics_learning_profiles')
        .upsert({
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
    }, {
        onConflict: 'user_id,platform,profile_type',
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to upsert analytics learning profile');
    }
    return toAnalyticsLearningProfile(data);
};
exports.upsertAnalyticsLearningProfile = upsertAnalyticsLearningProfile;
const listAnalyticsLearningProfilesByUser = async (client, userId, options = {}) => {
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
    return (data ?? []).map((row) => toAnalyticsLearningProfile(row));
};
exports.listAnalyticsLearningProfilesByUser = listAnalyticsLearningProfilesByUser;
const upsertAnalyticsLearningPostSignal = async (client, input) => {
    const { data, error } = await client
        .from('analytics_learning_post_signals')
        .upsert({
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
    }, {
        onConflict: 'user_id,analytics_id',
    })
        .select('*')
        .single();
    if (error || !data) {
        throw new Error(error?.message || 'Failed to upsert analytics learning post signal');
    }
    return toAnalyticsLearningPostSignal(data);
};
exports.upsertAnalyticsLearningPostSignal = upsertAnalyticsLearningPostSignal;
