import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { generateContentPack } from '../ai/gemini';
import { getBrandProfileByUserId } from '../db/queries/brandProfiles';
import {
  deleteGeneratedContent,
  getGeneratedContentById,
  getGeneratedContentHistory,
  saveGeneratedContent,
  trackContentGenerationUsage,
} from '../db/queries/content';
import { requireUserClient } from '../db/supabase';
import type { GenerateContentInput } from '../schemas/content.schema';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const generateContent = async (
  req: AuthenticatedRequest<{}, unknown, GenerateContentInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const brandProfile = await getBrandProfileByUserId(client, req.user.id);

    const contentPack = await generateContentPack(brandProfile, req.body);
    const content = await saveGeneratedContent(client, req.user.id, {
      ...req.body,
      brandProfileId: brandProfile?.id ?? null,
      ...contentPack,
    });

    await trackContentGenerationUsage(client, req.user.id, {
      contentId: content.id,
      platform: req.body.platform ?? null,
      productName: req.body.productName,
    });

    return res.status(200).json({
      status: 'success',
      message: 'Content generated successfully',
      data: content,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to generate content',
    });
  }
};

export const getContentHistory = async (
  req: AuthenticatedRequest<
    {},
    unknown,
    unknown,
    { page?: string; limit?: string }
  >,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const history = await getGeneratedContentHistory(client, req.user.id, {
      page,
      limit,
    });

    return res.status(200).json({
      status: 'success',
      data: history,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch content history',
    });
  }
};

export const deleteContent = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const existingContent = await getGeneratedContentById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingContent) {
      return res.status(404).json({
        status: 'fail',
        message: 'Content item not found',
      });
    }

    await deleteGeneratedContent(client, req.user.id, req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Content deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to delete content',
    });
  }
};
