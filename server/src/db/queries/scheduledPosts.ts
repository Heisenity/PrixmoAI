import type {
  CreateScheduledPostInput,
  PaginatedResult,
  ScheduledPost,
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
  scheduled_for: string;
  status: ScheduledPostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaginationOptions = {
  page?: number;
  limit?: number;
};

export type UpdateScheduledPostInput = Partial<CreateScheduledPostInput> & {
  status?: ScheduledPostStatus;
  publishedAt?: string | null;
};

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;

const toScheduledPost = (row: ScheduledPostRow): ScheduledPost => ({
  id: row.id,
  userId: row.user_id,
  socialAccountId: row.social_account_id,
  contentId: row.content_id,
  generatedImageId: row.generated_image_id,
  platform: row.platform,
  caption: row.caption,
  mediaUrl: row.media_url,
  scheduledFor: row.scheduled_for,
  status: row.status,
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createScheduledPost = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateScheduledPostInput
): Promise<ScheduledPost> => {
  const { data, error } = await client
    .from('scheduled_posts')
    .insert({
      user_id: userId,
      social_account_id: input.socialAccountId,
      content_id: input.contentId ?? null,
      generated_image_id: input.generatedImageId ?? null,
      platform: input.platform ?? null,
      caption: input.caption ?? null,
      media_url: input.mediaUrl ?? null,
      scheduled_for: input.scheduledFor,
      status: input.status ?? 'pending',
    })
    .select('*')
    .single();

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
    scheduled_for: input.scheduledFor,
    status: input.status,
    published_at: input.publishedAt,
  });

  const { data, error } = await client
    .from('scheduled_posts')
    .update(payload)
    .eq('id', scheduledPostId)
    .eq('user_id', userId)
    .select('*')
    .single();

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
