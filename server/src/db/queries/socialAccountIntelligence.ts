import type {
  CreateSocialAccountPostInsightInput,
  CreateSocialAccountProfileSnapshotInput,
  CreateSocialAccountSyncRunInput,
  SocialAccountIntelligenceProfile,
  SocialAccountPostInsight,
  SocialAccountPostRaw,
  SocialAccountProfileSnapshot,
  SocialAccountSyncRun,
  UpdateSocialAccountSyncRunInput,
  UpsertSocialAccountIntelligenceProfileInput,
  UpsertSocialAccountPostRawInput,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';
import {
  loadArchivePayloadFromR2,
  parseArchiveObjectKey,
} from '../../services/r2Storage.service';

type JsonRecord = Record<string, unknown>;
type JsonRecordArray = Array<Record<string, unknown>>;

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const toRecordArray = (value: unknown): JsonRecordArray =>
  Array.isArray(value)
    ? value.filter(
        (item): item is JsonRecord =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
    : [];

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;

const hydrateArchivedSocialAccountPosts = async (rows: Array<Record<string, any>>) => {
  const archivedRows = rows.filter(
    (row) => row.raw_payload_archived_at && typeof row.raw_payload_archive_key === 'string'
  );

  if (!archivedRows.length) {
    return rows;
  }

  const archivedPayloadEntries = await Promise.all(
    archivedRows.map(async (row) => {
      const objectKey = parseArchiveObjectKey(row.raw_payload_archive_key);

      if (!objectKey) {
        return null;
      }

      try {
        return [row.id, await loadArchivePayloadFromR2({ objectKey })] as const;
      } catch {
        return null;
      }
    })
  );

  const archivedPayloadMap = new Map(
    archivedPayloadEntries.filter(
      (entry): entry is readonly [string, unknown] => Boolean(entry)
    )
  );

  return rows.map((row) => {
    const archivedPayload = archivedPayloadMap.get(row.id);

    if (!archivedPayload) {
      return row;
    }

    return {
      ...row,
      raw_payload: toRecord(toRecord(archivedPayload).rawPayload),
    };
  });
};

const toSyncRun = (row: Record<string, any>): SocialAccountSyncRun => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  platform: row.platform,
  jobType: row.job_type,
  triggerSource: row.trigger_source,
  status: row.status,
  checkpointPostId: row.checkpoint_post_id,
  checkpointPostedAt: row.checkpoint_posted_at,
  lastSyncedAt: row.last_synced_at,
  nextRefreshAt: row.next_refresh_at,
  fetchedPostsCount: row.fetched_posts_count ?? 0,
  upsertedPostsCount: row.upserted_posts_count ?? 0,
  insightRowsCount: row.insight_rows_count ?? 0,
  visualAssetsAnalyzed: row.visual_assets_analyzed ?? 0,
  retryCount: row.retry_count ?? 0,
  normalizedFailureKind: row.normalized_failure_kind,
  errorMessage: row.error_message,
  rawSummary: toRecord(row.raw_summary),
  startedAt: row.started_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toProfileSnapshot = (
  row: Record<string, any>
): SocialAccountProfileSnapshot => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  syncRunId: row.sync_run_id,
  platform: row.platform,
  username: row.username,
  displayName: row.display_name,
  biography: row.biography,
  profilePictureUrl: row.profile_picture_url,
  followersCount: row.followers_count,
  followsCount: row.follows_count,
  mediaCount: row.media_count,
  rawPayload: toRecord(row.raw_payload),
  fetchedAt: row.fetched_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPostRaw = (row: Record<string, any>): SocialAccountPostRaw => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  platform: row.platform,
  externalPostId: row.external_post_id,
  shortcode: row.shortcode,
  permalink: row.permalink,
  captionText: row.caption_text,
  captionHash: row.caption_hash,
  mediaFingerprint: row.media_fingerprint,
  mediaType: row.media_type,
  mediaProductType: row.media_product_type,
  normalizedFormat: row.normalized_format,
  postedAt: row.posted_at,
  mediaUrl: row.media_url,
  thumbnailUrl: row.thumbnail_url,
  likeCount: row.like_count ?? 0,
  commentsCount: row.comments_count ?? 0,
  shareCount: row.share_count ?? 0,
  saveCount: row.save_count ?? 0,
  reactionCount: row.reaction_count ?? 0,
  impressionsCount: row.impressions_count ?? 0,
  reachCount: row.reach_count ?? 0,
  videoViewsCount: row.video_views_count ?? 0,
  rawPayload: toRecord(row.raw_payload),
  lastMetricsSyncedAt: row.last_metrics_synced_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPostInsight = (
  row: Record<string, any>
): SocialAccountPostInsight => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  socialAccountPostRawId: row.social_account_post_raw_id,
  syncRunId: row.sync_run_id,
  platform: row.platform,
  likeCount: row.like_count ?? 0,
  commentsCount: row.comments_count ?? 0,
  shareCount: row.share_count ?? 0,
  saveCount: row.save_count ?? 0,
  reactionCount: row.reaction_count ?? 0,
  impressionsCount: row.impressions_count ?? 0,
  reachCount: row.reach_count ?? 0,
  videoViewsCount: row.video_views_count ?? 0,
  metrics: toRecord(row.metrics),
  rawPayload: toRecord(row.raw_payload),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toIntelligenceProfile = (
  row: Record<string, any>
): SocialAccountIntelligenceProfile => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  platform: row.platform,
  summaryText: row.summary_text,
  accountTone: row.account_tone,
  mainThemes: toStringArray(row.main_themes),
  repeatedKeywords: toStringArray(row.repeated_keywords),
  hookStyles: toStringArray(row.hook_styles),
  ctaStyles: toStringArray(row.cta_styles),
  captionLengthPattern: row.caption_length_pattern,
  emojiStyle: row.emoji_style,
  hashtagBehavior: row.hashtag_behavior,
  postingCadence: toRecord(row.posting_cadence),
  formatMix: toRecord(row.format_mix),
  bestPatterns: toRecordArray(row.best_patterns),
  weakPatterns: toRecordArray(row.weak_patterns),
  visualDna: toRecord(row.visual_dna),
  performanceContext: toRecord(row.performance_context),
  summaryPayload: toRecord(row.summary_payload),
  sourcePostCount: row.source_post_count ?? 0,
  lastPostId: row.last_post_id,
  lastPostTimestamp: row.last_post_timestamp,
  lastSyncedAt: row.last_synced_at,
  nextRefreshAt: row.next_refresh_at,
  sourceWindowStart: row.source_window_start,
  sourceWindowEnd: row.source_window_end,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createSocialAccountSyncRun = async (
  client: AppSupabaseClient,
  input: CreateSocialAccountSyncRunInput
): Promise<SocialAccountSyncRun> => {
  const { data, error } = await client
    .from('social_account_sync_runs')
    .insert({
      user_id: input.userId,
      social_account_id: input.socialAccountId,
      platform: input.platform,
      job_type: input.jobType ?? 'sync-account',
      trigger_source: input.triggerSource ?? 'manual',
      status: input.status ?? 'queued',
      checkpoint_post_id: input.checkpointPostId ?? null,
      checkpoint_posted_at: input.checkpointPostedAt ?? null,
      last_synced_at: input.lastSyncedAt ?? null,
      next_refresh_at: input.nextRefreshAt ?? null,
      fetched_posts_count: input.fetchedPostsCount ?? 0,
      upserted_posts_count: input.upsertedPostsCount ?? 0,
      insight_rows_count: input.insightRowsCount ?? 0,
      visual_assets_analyzed: input.visualAssetsAnalyzed ?? 0,
      retry_count: input.retryCount ?? 0,
      normalized_failure_kind: input.normalizedFailureKind ?? null,
      error_message: input.errorMessage ?? null,
      raw_summary: input.rawSummary ?? {},
      started_at: input.startedAt ?? null,
      completed_at: input.completedAt ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create social account sync run');
  }

  return toSyncRun(data);
};

export const updateSocialAccountSyncRun = async (
  client: AppSupabaseClient,
  runId: string,
  input: UpdateSocialAccountSyncRunInput
): Promise<SocialAccountSyncRun> => {
  const payload = compactObject({
    status: input.status,
    checkpoint_post_id: input.checkpointPostId,
    checkpoint_posted_at: input.checkpointPostedAt,
    last_synced_at: input.lastSyncedAt,
    next_refresh_at: input.nextRefreshAt,
    fetched_posts_count: input.fetchedPostsCount,
    upserted_posts_count: input.upsertedPostsCount,
    insight_rows_count: input.insightRowsCount,
    visual_assets_analyzed: input.visualAssetsAnalyzed,
    retry_count: input.retryCount,
    normalized_failure_kind: input.normalizedFailureKind,
    error_message: input.errorMessage,
    raw_summary: input.rawSummary,
    started_at: input.startedAt,
    completed_at: input.completedAt,
  });
  const { data, error } = await client
    .from('social_account_sync_runs')
    .update(payload)
    .eq('id', runId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update social account sync run');
  }

  return toSyncRun(data);
};

export const findActiveSocialAccountSyncRun = async (
  client: AppSupabaseClient,
  socialAccountId: string
): Promise<SocialAccountSyncRun | null> => {
  const { data, error } = await client
    .from('social_account_sync_runs')
    .select('*')
    .eq('social_account_id', socialAccountId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check active social account sync');
  }

  return data ? toSyncRun(data) : null;
};

export const createSocialAccountProfileSnapshot = async (
  client: AppSupabaseClient,
  input: CreateSocialAccountProfileSnapshotInput
): Promise<SocialAccountProfileSnapshot> => {
  const { data, error } = await client
    .from('social_account_profile_snapshots')
    .insert({
      user_id: input.userId,
      social_account_id: input.socialAccountId,
      sync_run_id: input.syncRunId ?? null,
      platform: input.platform,
      username: input.username ?? null,
      display_name: input.displayName ?? null,
      biography: input.biography ?? null,
      profile_picture_url: input.profilePictureUrl ?? null,
      followers_count: input.followersCount ?? null,
      follows_count: input.followsCount ?? null,
      media_count: input.mediaCount ?? null,
      raw_payload: input.rawPayload ?? {},
      fetched_at: input.fetchedAt ?? new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save social account profile snapshot');
  }

  return toProfileSnapshot(data);
};

export const upsertSocialAccountPostRaw = async (
  client: AppSupabaseClient,
  input: UpsertSocialAccountPostRawInput
): Promise<SocialAccountPostRaw> => {
  const { data, error } = await client
    .from('social_account_posts_raw')
    .upsert(
      {
        user_id: input.userId,
        social_account_id: input.socialAccountId,
        platform: input.platform,
        external_post_id: input.externalPostId,
        shortcode: input.shortcode ?? null,
        permalink: input.permalink ?? null,
        caption_text: input.captionText ?? null,
        caption_hash: input.captionHash ?? null,
        media_fingerprint: input.mediaFingerprint ?? null,
        media_type: input.mediaType ?? null,
        media_product_type: input.mediaProductType ?? null,
        normalized_format: input.normalizedFormat ?? null,
        posted_at: input.postedAt ?? null,
        media_url: input.mediaUrl ?? null,
        thumbnail_url: input.thumbnailUrl ?? null,
        like_count: input.likeCount ?? 0,
        comments_count: input.commentsCount ?? 0,
        share_count: input.shareCount ?? 0,
        save_count: input.saveCount ?? 0,
        reaction_count: input.reactionCount ?? 0,
        impressions_count: input.impressionsCount ?? 0,
        reach_count: input.reachCount ?? 0,
        video_views_count: input.videoViewsCount ?? 0,
        raw_payload: input.rawPayload ?? {},
        raw_payload_archived_at: null,
        raw_payload_archive_manifest_id: null,
        raw_payload_archive_key: null,
        last_metrics_synced_at:
          input.lastMetricsSyncedAt ?? new Date().toISOString(),
      },
      { onConflict: 'user_id,social_account_id,external_post_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to upsert social account post');
  }

  return toPostRaw(data);
};

export const createSocialAccountPostInsight = async (
  client: AppSupabaseClient,
  input: CreateSocialAccountPostInsightInput
): Promise<SocialAccountPostInsight> => {
  const { data, error } = await client
    .from('social_account_post_insights')
    .upsert(
      {
        user_id: input.userId,
        social_account_id: input.socialAccountId,
        social_account_post_raw_id: input.socialAccountPostRawId,
        sync_run_id: input.syncRunId,
        platform: input.platform,
        like_count: input.likeCount ?? 0,
        comments_count: input.commentsCount ?? 0,
        share_count: input.shareCount ?? 0,
        save_count: input.saveCount ?? 0,
        reaction_count: input.reactionCount ?? 0,
        impressions_count: input.impressionsCount ?? 0,
        reach_count: input.reachCount ?? 0,
        video_views_count: input.videoViewsCount ?? 0,
        metrics: input.metrics ?? {},
        raw_payload: input.rawPayload ?? {},
        payload_archived_at: null,
        payload_archive_manifest_id: null,
        payload_archive_key: null,
      },
      { onConflict: 'social_account_post_raw_id,sync_run_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save social account post insight');
  }

  return toPostInsight(data);
};

export const upsertSocialAccountIntelligenceProfile = async (
  client: AppSupabaseClient,
  input: UpsertSocialAccountIntelligenceProfileInput
): Promise<SocialAccountIntelligenceProfile> => {
  const { data, error } = await client
    .from('social_account_intelligence_profiles')
    .upsert(
      {
        user_id: input.userId,
        social_account_id: input.socialAccountId,
        platform: input.platform,
        summary_text: input.summaryText,
        account_tone: input.accountTone ?? null,
        main_themes: input.mainThemes ?? [],
        repeated_keywords: input.repeatedKeywords ?? [],
        hook_styles: input.hookStyles ?? [],
        cta_styles: input.ctaStyles ?? [],
        caption_length_pattern: input.captionLengthPattern ?? null,
        emoji_style: input.emojiStyle ?? null,
        hashtag_behavior: input.hashtagBehavior ?? null,
        posting_cadence: input.postingCadence ?? {},
        format_mix: input.formatMix ?? {},
        best_patterns: input.bestPatterns ?? [],
        weak_patterns: input.weakPatterns ?? [],
        visual_dna: input.visualDna ?? {},
        performance_context: input.performanceContext ?? {},
        summary_payload: input.summaryPayload ?? {},
        source_post_count: input.sourcePostCount ?? 0,
        last_post_id: input.lastPostId ?? null,
        last_post_timestamp: input.lastPostTimestamp ?? null,
        last_synced_at: input.lastSyncedAt ?? null,
        next_refresh_at: input.nextRefreshAt ?? null,
        source_window_start: input.sourceWindowStart ?? null,
        source_window_end: input.sourceWindowEnd ?? null,
      },
      { onConflict: 'social_account_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      error?.message || 'Failed to save social account intelligence profile'
    );
  }

  return toIntelligenceProfile(data);
};

export const getSocialAccountIntelligenceProfileBySocialAccountId = async (
  client: AppSupabaseClient,
  socialAccountId: string
): Promise<SocialAccountIntelligenceProfile | null> => {
  const { data, error } = await client
    .from('social_account_intelligence_profiles')
    .select('*')
    .eq('social_account_id', socialAccountId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch social account intelligence');
  }

  return data ? toIntelligenceProfile(data) : null;
};

export const listDueSocialAccountIntelligenceProfiles = async (
  client: AppSupabaseClient,
  limit = 50
): Promise<SocialAccountIntelligenceProfile[]> => {
  const { data, error } = await client
    .from('social_account_intelligence_profiles')
    .select('*')
    .lte('next_refresh_at', new Date().toISOString())
    .order('next_refresh_at', { ascending: true })
    .limit(Math.max(1, limit));

  if (error) {
    throw new Error(error.message || 'Failed to fetch due intelligence profiles');
  }

  return (data ?? []).map(toIntelligenceProfile);
};

export const listRecentSocialAccountPosts = async (
  client: AppSupabaseClient,
  socialAccountId: string,
  limit = 50
): Promise<SocialAccountPostRaw[]> => {
  const { data, error } = await client
    .from('social_account_posts_raw')
    .select('*')
    .eq('social_account_id', socialAccountId)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(Math.max(1, limit));

  if (error) {
    throw new Error(error.message || 'Failed to fetch stored social account posts');
  }

  const hydratedRows = await hydrateArchivedSocialAccountPosts(
    (data ?? []) as Array<Record<string, any>>
  );

  return hydratedRows.map(toPostRaw);
};
