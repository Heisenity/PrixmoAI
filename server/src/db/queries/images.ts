import type {
  CreateGeneratedImageInput,
  GeneratedImage,
  PaginatedResult,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';

type GeneratedImageRow = {
  id: string;
  user_id: string;
  content_id: string | null;
  source_image_url: string | null;
  generated_image_url: string;
  background_style: string | null;
  prompt: string | null;
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
  sourceImageUrl: row.source_image_url,
  generatedImageUrl: row.generated_image_url,
  backgroundStyle: row.background_style,
  prompt: row.prompt,
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
      source_image_url: input.sourceImageUrl ?? null,
      generated_image_url: input.generatedImageUrl,
      background_style: input.backgroundStyle ?? null,
      prompt: input.prompt ?? null,
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
