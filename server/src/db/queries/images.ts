import { FEATURE_KEYS } from '../../config/constants';
import type {
  CreateGeneratedImageInput,
  GeneratedImage,
  PaginatedResult,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';
import {
  getDailyUsageCount,
  getMonthlyUsageCount,
  recordUsageEvent,
} from './subscriptions';

type GeneratedImageRow = {
  id: string;
  user_id: string;
  content_id: string | null;
  conversation_id: string | null;
  source_image_url: string | null;
  generated_image_url: string;
  background_style: string | null;
  prompt: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_object_key: string | null;
  storage_public_url: string | null;
  storage_content_type: string | null;
  storage_size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

type PaginationOptions = {
  page?: number;
  limit?: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const toGeneratedImage = (row: GeneratedImageRow): GeneratedImage => ({
  id: row.id,
  userId: row.user_id,
  contentId: row.content_id,
  conversationId: row.conversation_id,
  sourceImageUrl: row.source_image_url,
  generatedImageUrl: row.generated_image_url,
  backgroundStyle: row.background_style,
  prompt: row.prompt,
  storageProvider: row.storage_provider,
  storageBucket: row.storage_bucket,
  storageObjectKey: row.storage_object_key,
  storagePublicUrl: row.storage_public_url,
  storageContentType: row.storage_content_type,
  storageSizeBytes:
    typeof row.storage_size_bytes === 'number' ? row.storage_size_bytes : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const saveGeneratedImage = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateGeneratedImageInput
): Promise<GeneratedImage> => {
  const { data, error } = await client
    .from('generated_images')
    .insert({
      user_id: userId,
      content_id: input.contentId ?? null,
      conversation_id: input.conversationId ?? null,
      source_image_url: input.sourceImageUrl ?? null,
      generated_image_url: input.generatedImageUrl,
      background_style: input.backgroundStyle ?? null,
      prompt: input.prompt ?? null,
      storage_provider: input.storageProvider ?? null,
      storage_bucket: input.storageBucket ?? null,
      storage_object_key: input.storageObjectKey ?? null,
      storage_public_url: input.storagePublicUrl ?? null,
      storage_content_type: input.storageContentType ?? null,
      storage_size_bytes: input.storageSizeBytes ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save generated image');
  }

  return toGeneratedImage(data as GeneratedImageRow);
};

export const getGeneratedImageById = async (
  client: AppSupabaseClient,
  userId: string,
  imageId: string
): Promise<GeneratedImage | null> => {
  const { data, error } = await client
    .from('generated_images')
    .select('*')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch image');
  }

  return data ? toGeneratedImage(data as GeneratedImageRow) : null;
};

export const getGeneratedImageHistory = async (
  client: AppSupabaseClient,
  userId: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<GeneratedImage>> => {
  const page =
    Number.isFinite(options.page) && options.page && options.page > 0
      ? options.page
      : DEFAULT_PAGE;
  const limit =
    Number.isFinite(options.limit) && options.limit && options.limit > 0
      ? options.limit
      : DEFAULT_LIMIT;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await client
    .from('generated_images')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message || 'Failed to fetch image history');
  }

  const total = count ?? 0;

  return {
    items: (data ?? []).map((row) => toGeneratedImage(row as GeneratedImageRow)),
    page,
    limit,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
};

export const deleteGeneratedImage = async (
  client: AppSupabaseClient,
  userId: string,
  imageId: string
): Promise<void> => {
  const { error } = await client
    .from('generated_images')
    .delete()
    .eq('id', imageId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to delete generated image');
  }
};

export const getImageMonthlyUsageCount = async (
  client: AppSupabaseClient,
  userId: string
): Promise<number> =>
  getMonthlyUsageCount(client, userId, FEATURE_KEYS.imageGeneration);

export const getImageDailyUsageCount = async (
  client: AppSupabaseClient,
  userId: string
): Promise<number> =>
  getDailyUsageCount(client, userId, FEATURE_KEYS.imageGeneration);

export const trackImageGenerationUsage = async (
  client: AppSupabaseClient,
  userId: string,
  metadata: Record<string, unknown> = {},
  idempotencyKey?: string
) =>
  recordUsageEvent(
    client,
    userId,
    FEATURE_KEYS.imageGeneration,
    metadata,
    idempotencyKey
  );
