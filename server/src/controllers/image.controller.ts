import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { generateProductImage } from '../ai/imageGen';
import {
  getGeneratedImageHistory,
  saveGeneratedImage,
  trackImageGenerationUsage,
} from '../db/queries/images';
import { requireUserClient } from '../db/supabase';
import type { GenerateImageInput } from '../schemas/image.schema';

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

export const generateImage = async (
  req: AuthenticatedRequest<{}, unknown, GenerateImageInput>,
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
    const result = await generateProductImage(req.body);
    const image = await saveGeneratedImage(client, req.user.id, {
      contentId: req.body.contentId ?? null,
      sourceImageUrl: req.body.sourceImageUrl ?? null,
      generatedImageUrl: result.imageUrl,
      backgroundStyle: req.body.backgroundStyle ?? null,
      prompt: result.promptUsed,
    });

    await trackImageGenerationUsage(client, req.user.id, {
      imageId: image.id,
      provider: result.provider,
      contentId: req.body.contentId ?? null,
      productName: req.body.productName,
      productDescription: req.body.productDescription ?? null,
      backgroundStyle: req.body.backgroundStyle ?? null,
      prompt: result.promptUsed,
      sourceImageUrl: req.body.sourceImageUrl ?? null,
    });

    return res.status(200).json({
      status: 'success',
      message: `Image generated successfully using ${result.provider}`,
      data: {
        ...image,
        provider: result.provider,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate image';

    return res.status(502).json({
      status: 'error',
      message,
    });
  }
};

export const getImageHistory = async (
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
    const history = await getGeneratedImageHistory(client, req.user.id, {
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
          : 'Failed to fetch image history',
    });
  }
};
