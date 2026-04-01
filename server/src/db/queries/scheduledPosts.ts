import type {
  CreateScheduledPostInput,
  PaginatedResult,
  ScheduledPost,
  SchedulerMediaType,
  ScheduledPostStatus,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type ScheduledPostRow = {
  id: string;
  user_id: string;
  social_account_id: string;
  content_id: string | null;
  generated_image_id: string | null;
  platform: string | null;
  caption: string | null;
  media_url: string | null;
  media_type: SchedulerMediaType | null;
  scheduled_for: string;
  status: ScheduledPostStatus;
  external_post_id: string | null;
  publish_attempted_at: string | null;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaginationOptions = {
  page?: number;
  limit?: number;
};

const SCHEDULED_POST_ACTION_BUFFER_MS = 4_000;
const SCHEDULED_POST_ACTION_BLOCKED_REASON =
  'Post is being prepared for publishing';

export type UpdateScheduledPostInput = Partial<CreateScheduledPostInput> & {
  status?: ScheduledPostStatus;
  publishedAt?: string | null;
};

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;

const isMissingMediaTypeColumnError = (message: string | null | undefined) => {
  const normalized = (message || '').toLowerCase();

  return (
    normalized.includes('media_type') &&
    (normalized.includes('column') ||
      normalized.includes('schema cache') ||
      normalized.includes('does not exist') ||
      normalized.includes('could not find'))
  );
};

const getScheduledPostActionState = (
  row: Pick<ScheduledPostRow, 'scheduled_for' | 'status'>
) => {
  const isPendingOrScheduled =
    row.status === 'pending' || row.status === 'scheduled';
  const scheduledAtMs = new Date(row.scheduled_for).getTime();
  const isWithinBuffer =
    Number.isFinite(scheduledAtMs) &&
    Date.now() >= scheduledAtMs - SCHEDULED_POST_ACTION_BUFFER_MS;
  const canMutate = isPendingOrScheduled && !isWithinBuffer;

  return {
    canEdit: canMutate,
    canCancel: canMutate,
    actionBlockedReason:
      isPendingOrScheduled && isWithinBuffer
        ? SCHEDULED_POST_ACTION_BLOCKED_REASON
        : null,
  };
};

const inferMediaTypeFromUrl = (value: string | null | undefined): SchedulerMediaType | null => {
  const normalized = (value || '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('.mp4') ||
    normalized.includes('.mov') ||
    normalized.includes('video/')
  ) {
    return 'video';
  }

  if (
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.png') ||
    normalized.includes('.webp') ||
    normalized.includes('image/')
  ) {
    return 'image';
  }

  return null;
};

const toScheduledPost = (row: ScheduledPostRow): ScheduledPost => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  contentId: row.content_id,
  generatedImageId: row.generated_image_id,
  platform: row.platform,
  caption: row.caption,
  mediaUrl: row.media_url,
  mediaType: row.media_type ?? inferMediaTypeFromUrl(row.media_url),
  scheduledFor: row.scheduled_for,
  status: row.status,
  externalPostId: row.external_post_id,
  publishAttemptedAt: row.publish_attempted_at,
  lastError: row.last_error,
  publishedAt: row.published_at,
  ...getScheduledPostActionState(row),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export {
  SCHEDULED_POST_ACTION_BLOCKED_REASON,
  SCHEDULED_POST_ACTION_BUFFER_MS,
};

export const createScheduledPost = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateScheduledPostInput
): Promise<ScheduledPost> => {
  const insertScheduledPost = async (includeMediaType: boolean) =>
    await client
      .from('scheduled_posts')
      .insert({
        user_id: userId,
        social_account_id: input.socialAccountId,
        content_id: input.contentId ?? null,
        generated_image_id: input.generatedImageId ?? null,
        platform: input.platform ?? null,
        caption: input.caption ?? null,
        media_url: input.mediaUrl ?? null,
        ...(includeMediaType ? { media_type: input.mediaType ?? null } : {}),
        scheduled_for: input.scheduledFor,
        status: input.status ?? 'scheduled',
        external_post_id: input.externalPostId ?? null,
        publish_attempted_at: input.publishAttemptedAt ?? null,
        last_error: input.lastError ?? null,
      })
      .select('*')
      .single();

  let { data, error } = await insertScheduledPost(true);

  if (error && isMissingMediaTypeColumnError(error.message)) {
    ({ data, error } = await insertScheduledPost(false));
  }

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create scheduled post');
  }

  return toScheduledPost(data as ScheduledPostRow);
};

export const getScheduledPostsByUser = async (
  client: AppSupabaseClient,
  userId: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<ScheduledPost>> => {
  const page =
    Number.isFinite(options.page) && options.page && options.page > 0
      ? options.page
      : 1;
  const limit =
    Number.isFinite(options.limit) && options.limit && options.limit > 0
      ? options.limit
      : 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await client
    .from('scheduled_posts')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('scheduled_for', { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error(error.message || 'Failed to fetch scheduled posts');
  }

  const total = count ?? 0;

  return {
    items: (data ?? []).map((row) => toScheduledPost(row as ScheduledPostRow)),
    page,
    limit,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
};

export const getScheduledPostById = async (
  client: AppSupabaseClient,
  userId: string,
  scheduledPostId: string
): Promise<ScheduledPost | null> => {
  const { data, error } = await client
    .from('scheduled_posts')
    .select('*')
    .eq('id', scheduledPostId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch scheduled post');
  }

  return data ? toScheduledPost(data as ScheduledPostRow) : null;
};

export const getDueScheduledPosts = async (
  client: AppSupabaseClient,
  limit = 10
): Promise<ScheduledPost[]> => {
  const { data, error } = await client
    .from('scheduled_posts')
    .select('*')
    .in('status', ['pending', 'scheduled'])
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to fetch due scheduled posts');
  }

  return (data ?? []).map((row) => toScheduledPost(row as ScheduledPostRow));
};

export const updateScheduledPost = async (
  client: AppSupabaseClient,
  userId: string,
  scheduledPostId: string,
  input: UpdateScheduledPostInput
): Promise<ScheduledPost> => {
  const payload = compactObject({
    social_account_id: input.socialAccountId,
    content_id: input.contentId,
    generated_image_id: input.generatedImageId,
    platform: input.platform,
    caption: input.caption,
    media_url: input.mediaUrl,
    media_type: input.mediaType,
    scheduled_for: input.scheduledFor,
    status: input.status,
    external_post_id: input.externalPostId,
    publish_attempted_at: input.publishAttemptedAt,
    last_error: input.lastError,
    published_at: input.publishedAt,
  });

  const updateScheduledPostRow = async (nextPayload: Partial<typeof payload>) =>
    await client
      .from('scheduled_posts')
      .update(nextPayload)
      .eq('id', scheduledPostId)
      .eq('user_id', userId)
      .select('*')
      .single();

  let { data, error } = await updateScheduledPostRow(payload);

  if (error && isMissingMediaTypeColumnError(error.message) && 'media_type' in payload) {
    const { media_type: _ignored, ...legacyPayload } = payload;
    ({ data, error } = await updateScheduledPostRow(legacyPayload));
  }

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update scheduled post');
  }

  return toScheduledPost(data as ScheduledPostRow);
};

export const updateScheduledPostStatus = async (
  client: AppSupabaseClient,
  userId: string,
  scheduledPostId: string,
  status: ScheduledPostStatus,
  publishedAt?: string | null
): Promise<ScheduledPost> =>
  updateScheduledPost(client, userId, scheduledPostId, {
    status,
    publishedAt,
  });

export const deleteScheduledPost = async (
  client: AppSupabaseClient,
  userId: string,
  scheduledPostId: string
): Promise<void> => {
  const { error } = await client
    .from('scheduled_posts')
    .delete()
    .eq('id', scheduledPostId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to delete scheduled post');
  }
};
