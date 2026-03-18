import { User } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { generateCaption } from '../ai/gemini';
import { GenerateContentInput } from '../schemas/content.schema';

type AuthenticatedRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<P, ResBody, ReqBody, ReqQuery> & {
  user?: User;
};

type BrandProfileRecord = {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type GeneratedContentRecord = {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  prompt: string;
  caption: string;
  type: string | null;
  tone: string | null;
  platform: string | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_HISTORY_PAGE = 1;
const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 100;

const toGeneratedContentResponse = (
  record: Record<string, unknown>
): GeneratedContentRecord => ({
  id: String(record.id ?? ''),
  user_id: String(record.user_id ?? ''),
  brand_profile_id:
    typeof record.brand_profile_id === 'string' ? record.brand_profile_id : null,
  prompt: String(record.prompt ?? ''),
  caption: String(record.caption ?? ''),
  type: typeof record.type === 'string' ? record.type : null,
  tone: typeof record.tone === 'string' ? record.tone : null,
  platform: typeof record.platform === 'string' ? record.platform : null,
  created_at: String(record.created_at ?? ''),
  updated_at: String(record.updated_at ?? ''),
});

const buildBrandContext = (profile: BrandProfileRecord | null) => {
  if (!profile) {
    return null;
  }

  return {
    fullName: profile.full_name,
    username: profile.username,
    avatarUrl: profile.avatar_url,
  };
};

export const generateContent = async (
  req: AuthenticatedRequest<{}, unknown, GenerateContentInput>,
  res: Response
) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const { prompt, platform, tone, type } = req.body;

  const { data: brandProfile, error: brandProfileError } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (brandProfileError) {
    return res.status(500).json({
      status: 'error',
      message: brandProfileError.message || 'Failed to fetch brand profile',
    });
  }

  try {
    const caption = await generateCaption({
      prompt,
      type: type ?? null,
      tone: tone ?? null,
      platform: platform ?? null,
      brandProfile: buildBrandContext(
        (brandProfile as BrandProfileRecord | null) ?? null
      ),
    });

    const payload = {
      user_id: req.user.id,
      brand_profile_id:
        brandProfile && typeof brandProfile.id === 'string'
          ? brandProfile.id
          : null,
      prompt,
      caption,
      type: type ?? null,
      tone: tone ?? null,
      platform: platform ?? null,
    };

    const { data: generatedContent, error: insertError } = await supabase
      .from('generated_content')
      .insert(payload)
      .select('*')
      .single();

    if (insertError) {
      return res.status(500).json({
        status: 'error',
        message: insertError.message || 'Failed to save generated content',
      });
    }

    return res.status(201).json({
      status: 'success',
      generatedContent: toGeneratedContentResponse(
        generatedContent as Record<string, unknown>
      ),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to generate content',
    });
  }
};

const parsePositiveInteger = (
  value: unknown,
  fallback: number,
  max?: number
) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  if (max) {
    return Math.min(parsed, max);
  }

  return parsed;
};

export const getHistory = async (req: AuthenticatedRequest, res: Response) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const page = parsePositiveInteger(
    req.query.page,
    DEFAULT_HISTORY_PAGE
  );
  const limit = parsePositiveInteger(
    req.query.limit,
    DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('generated_content')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch content history',
    });
  }

  const total = count ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return res.status(200).json({
    status: 'success',
    content: (data ?? []).map((item) =>
      toGeneratedContentResponse(item as Record<string, unknown>)
    ),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
};

export const deleteContent = async (req: AuthenticatedRequest, res: Response) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const { id } = req.params;

  const { data: existingContent, error: fetchError } = await supabase
    .from('generated_content')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).json({
      status: 'error',
      message: fetchError.message || 'Failed to fetch content item',
    });
  }

  if (!existingContent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Content not found',
    });
  }

  if (existingContent.user_id !== req.user.id) {
    return res.status(403).json({
      status: 'fail',
      message: 'Forbidden',
    });
  }

  const { error: deleteError } = await supabase
    .from('generated_content')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (deleteError) {
    return res.status(500).json({
      status: 'error',
      message: deleteError.message || 'Failed to delete content',
    });
  }

  return res.status(200).json({
    status: 'success',
    message: 'Content deleted successfully',
  });
};

export const getContentHistory = getHistory;
