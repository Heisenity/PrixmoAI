import { FEATURE_KEYS } from '../../config/constants';
import type {
  CaptionVariant,
  CreateGeneratedContentInput,
  GeneratedContent,
  PaginatedResult,
  ReelScript,
} from '../../types';
import type { AppSupabaseClient } from '../supabase';
import {
  getMonthlyUsageCount,
  recordUsageEvent,
} from './subscriptions';

type GeneratedContentRow = {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  conversation_id: string | null;
  product_name: string;
  product_description: string | null;
  product_image_url: string | null;
  platform: string | null;
  goal: string | null;
  tone: string | null;
  audience: string | null;
  keywords: unknown;
  captions: unknown;
  hashtags: unknown;
  reel_script: unknown;
  created_at: string;
  updated_at: string;
};

type PaginationOptions = {
  page?: number;
  limit?: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const toCaptionVariants = (value: unknown): CaptionVariant[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): CaptionVariant | null => {
      if (typeof entry === 'string') {
        const normalized = entry.trim();

        if (!normalized) {
          return null;
        }

        return {
          hook: normalized,
          mainCopy: normalized,
          shortCaption: normalized,
          cta: 'Learn more.',
        };
      }

      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const hook = typeof record.hook === 'string' ? record.hook.trim() : '';
      const mainCopy =
        typeof record.mainCopy === 'string' ? record.mainCopy.trim() : '';
      const shortCaption =
        typeof record.shortCaption === 'string'
          ? record.shortCaption.trim()
          : '';
      const cta = typeof record.cta === 'string' ? record.cta.trim() : '';

      if (!hook || !mainCopy || !shortCaption || !cta) {
        return null;
      }

      return {
        hook,
        mainCopy,
        shortCaption,
        cta,
      };
    })
    .filter((entry): entry is CaptionVariant => Boolean(entry));
};

const toReelScript = (value: unknown): ReelScript => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      hook: '',
      body: '',
      cta: '',
    };
  }

  const record = value as Record<string, unknown>;

  return {
    hook: typeof record.hook === 'string' ? record.hook : '',
    body: typeof record.body === 'string' ? record.body : '',
    cta: typeof record.cta === 'string' ? record.cta : '',
  };
};

const toGeneratedContent = (row: GeneratedContentRow): GeneratedContent => ({
  id: row.id,
  userId: row.user_id,
  brandProfileId: row.brand_profile_id,
  conversationId: row.conversation_id,
  productName: row.product_name,
  productDescription: row.product_description,
  productImageUrl: row.product_image_url,
  platform: row.platform,
  goal: row.goal,
  tone: row.tone,
  audience: row.audience,
  keywords: toStringArray(row.keywords),
  captions: toCaptionVariants(row.captions),
  hashtags: toStringArray(row.hashtags),
  reelScript: toReelScript(row.reel_script),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizePage = (page?: number) =>
  Number.isFinite(page) && page && page > 0 ? page : DEFAULT_PAGE;

const normalizeLimit = (limit?: number) =>
  Number.isFinite(limit) && limit && limit > 0 ? limit : DEFAULT_LIMIT;

export const saveGeneratedContent = async (
  client: AppSupabaseClient,
  userId: string,
  input: CreateGeneratedContentInput
): Promise<GeneratedContent> => {
  const { data, error } = await client
    .from('generated_content')
    .insert({
      user_id: userId,
      brand_profile_id: input.brandProfileId ?? null,
      conversation_id: input.conversationId ?? null,
      product_name: input.productName,
      product_description: input.productDescription ?? null,
      product_image_url: input.productImageUrl ?? null,
      platform: input.platform ?? null,
      goal: input.goal ?? null,
      tone: input.tone ?? null,
      audience: input.audience ?? null,
      keywords: input.keywords ?? [],
      captions: input.captions,
      hashtags: input.hashtags,
      reel_script: input.reelScript,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save generated content');
  }

  return toGeneratedContent(data as GeneratedContentRow);
};

export const getGeneratedContentById = async (
  client: AppSupabaseClient,
  userId: string,
  contentId: string
): Promise<GeneratedContent | null> => {
  const { data, error } = await client
    .from('generated_content')
    .select('*')
    .eq('id', contentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch content item');
  }

  return data ? toGeneratedContent(data as GeneratedContentRow) : null;
};

export const getGeneratedContentHistory = async (
  client: AppSupabaseClient,
  userId: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<GeneratedContent>> => {
  const page = normalizePage(options.page);
  const limit = normalizeLimit(options.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await client
    .from('generated_content')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message || 'Failed to fetch content history');
  }

  const total = count ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    items: (data ?? []).map((row) =>
      toGeneratedContent(row as GeneratedContentRow)
    ),
    page,
    limit,
    total,
    totalPages,
  };
};

export const deleteGeneratedContent = async (
  client: AppSupabaseClient,
  userId: string,
  contentId: string
): Promise<void> => {
  const { error } = await client
    .from('generated_content')
    .delete()
    .eq('id', contentId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to delete content');
  }
};

export const getContentMonthlyUsageCount = async (
  client: AppSupabaseClient,
  userId: string
): Promise<number> =>
  getMonthlyUsageCount(client, userId, FEATURE_KEYS.contentGeneration);

export const trackContentGenerationUsage = async (
  client: AppSupabaseClient,
  userId: string,
  metadata: Record<string, unknown> = {}
) =>
  recordUsageEvent(client, userId, FEATURE_KEYS.contentGeneration, metadata);
