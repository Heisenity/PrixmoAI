import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { generateProductImage } from '../ai/imageGen';
import { getBrandProfileByUserId } from '../db/queries/brandProfiles';
import {
  getGeneratedImageById,
  getGeneratedImageHistory,
  saveGeneratedImage,
  trackImageGenerationUsage,
} from '../db/queries/images';
import { requireUserClient } from '../db/supabase';
import type {
  GenerateImageInput,
  ImportSourceImageUrlInput,
  ResolveSourceImageUrlInput,
  UploadSourceImageInput,
} from '../schemas/image.schema';
import {
  enqueueImageGeneration,
  resolveImageRuntimePolicy,
} from '../services/imageRuntimePolicy.service';
import {
  importExternalSourceImage,
  resolveExternalSourceImage,
  uploadSourceImage as uploadSourceImageToStorage,
} from '../services/storage.service';
import type { BrandProfile } from '../types';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
  imageRuntimePolicy?: ReturnType<typeof resolveImageRuntimePolicy>;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveBrandPreference = (
  brandProfile: BrandProfile | null,
  useBrandName?: boolean
) => {
  const shouldUseBrandName =
    useBrandName ?? Boolean(brandProfile?.brandName?.trim());

  if (!shouldUseBrandName) {
    return {
      brandName: null,
      useBrandName: false,
    };
  }

  const brandName = brandProfile?.brandName?.trim();

  if (!brandName) {
    throw new Error(
      'Add your brand name in Settings > Brand memory, or turn off Use brand name.'
    );
  }

  return {
    brandName,
    useBrandName: true,
  };
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const inferImageMimeType = (contentType: string | null, sourceUrl: string) => {
  if (contentType) {
    const normalized = contentType.split(';')[0]?.trim().toLowerCase();

    if (normalized.startsWith('image/')) {
      return normalized;
    }
  }

  const pathname = sourceUrl.toLowerCase();

  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (pathname.endsWith('.webp')) {
    return 'image/webp';
  }

  if (pathname.endsWith('.gif')) {
    return 'image/gif';
  }

  return 'image/png';
};

const buildWatermarkedSvg = (embeddedImageUrl: string) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="prixmoai-watermark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070a10" stop-opacity="0.92" />
      <stop offset="100%" stop-color="#070a10" stop-opacity="0.78" />
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="#090c12" />
  <image href="${embeddedImageUrl}" x="0" y="0" width="1200" height="1200" preserveAspectRatio="xMidYMid meet" />
  <g transform="translate(0 0)">
    <rect x="844" y="44" width="304" height="84" rx="30" fill="url(#prixmoai-watermark-gradient)" stroke="#ffffff" stroke-opacity="0.14" />
    <text
      x="1102"
      y="96"
      fill="#ffffff"
      fill-opacity="0.96"
      font-size="34"
      font-family="Arial, Helvetica, sans-serif"
      font-weight="700"
      letter-spacing="6"
      text-anchor="end"
    >
      PRIXMOAI
    </text>
  </g>
</svg>`;

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
    const brandProfile = await getBrandProfileByUserId(client, req.user.id);
    const generationInput = {
      ...req.body,
      ...resolveBrandPreference(brandProfile, req.body.useBrandName),
    };
    const runtimePolicy =
      req.imageRuntimePolicy ?? resolveImageRuntimePolicy('free', 0);
    const result = await enqueueImageGeneration(runtimePolicy, () =>
      generateProductImage(brandProfile, generationInput)
    );
    const image = await saveGeneratedImage(client, req.user.id, {
      contentId: generationInput.contentId ?? null,
      sourceImageUrl: generationInput.sourceImageUrl ?? null,
      generatedImageUrl: result.imageUrl,
      backgroundStyle: generationInput.backgroundStyle ?? null,
      prompt: result.promptUsed,
    });

    await trackImageGenerationUsage(client, req.user.id, {
      imageId: image.id,
      provider: result.provider,
      brandProfileId: brandProfile?.id ?? null,
      contentId: generationInput.contentId ?? null,
      productName: generationInput.productName,
      productDescription: generationInput.productDescription ?? null,
      backgroundStyle: generationInput.backgroundStyle ?? null,
      prompt: result.promptUsed,
      sourceImageUrl: generationInput.sourceImageUrl ?? null,
      queueTier: runtimePolicy.queueTier,
      speedTier: runtimePolicy.speedTier,
      throttleDelayMs: runtimePolicy.throttleDelayMs,
      dailyUsageCountBeforeRequest: runtimePolicy.usageCount,
    });

    res.setHeader('X-PrixmoAI-Queue-Tier', runtimePolicy.queueTier);
    res.setHeader('X-PrixmoAI-Speed-Tier', runtimePolicy.speedTier);
    res.setHeader(
      'X-PrixmoAI-Throttle-Delay-Ms',
      String(runtimePolicy.throttleDelayMs)
    );

    return res.status(200).json({
      status: 'success',
      message: `Image generated successfully using ${result.provider}`,
      data: {
        ...image,
        provider: result.provider,
      },
      meta: {
        runtime: runtimePolicy,
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

export const getWatermarkedImage = async (
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
    const image = await getGeneratedImageById(client, req.user.id, req.params.id);

    if (!image) {
      return res.status(404).json({
        status: 'fail',
        message: 'Generated image not found',
      });
    }

    const upstreamResponse = await fetch(image.generatedImageUrl);

    if (!upstreamResponse.ok) {
      throw new Error('Unable to fetch the original generated image');
    }

    const mimeType = inferImageMimeType(
      upstreamResponse.headers.get('content-type'),
      image.generatedImageUrl
    );
    const binary = await upstreamResponse.arrayBuffer();
    const base64 = Buffer.from(binary).toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const svg = buildWatermarkedSvg(escapeXml(dataUrl));

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="prixmoai-watermarked-${image.id}.svg"`
    );

    return res.status(200).send(svg);
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to prepare watermarked image',
    });
  }
};

export const uploadSourceImage = async (
  req: AuthenticatedRequest<{}, unknown, UploadSourceImageInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const uploadedSourceImage = await uploadSourceImageToStorage(
      req.user.id,
      req.body
    );

    return res.status(200).json({
      status: 'success',
      message: 'Source media uploaded successfully',
      data: {
        sourceImageUrl: uploadedSourceImage.publicUrl,
        bucket: uploadedSourceImage.bucket,
        path: uploadedSourceImage.path,
        mediaType: uploadedSourceImage.mediaType,
        contentType: uploadedSourceImage.contentType,
      },
    });
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to upload source media',
    });
  }
};

export const importSourceImageUrl = async (
  req: AuthenticatedRequest<{}, unknown, ImportSourceImageUrlInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const uploadedSourceImage = await importExternalSourceImage(
      req.user.id,
      req.body.url
    );

    return res.status(200).json({
      status: 'success',
      message: 'Source media imported successfully',
      data: {
        sourceImageUrl: uploadedSourceImage.publicUrl,
        bucket: uploadedSourceImage.bucket,
        path: uploadedSourceImage.path,
        mediaType: uploadedSourceImage.mediaType,
        contentType: uploadedSourceImage.contentType,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to import source media';

    return res.status(
      message === 'Invalid media URL' || message === 'No preview available for this link'
        ? 400
        : 502
    ).json({
      status: 'error',
      message,
    });
  }
};

export const resolveSourceImageUrl = async (
  req: AuthenticatedRequest<{}, unknown, ResolveSourceImageUrlInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const resolvedSourceImage = await resolveExternalSourceImage(req.body.url);

    return res.status(200).json({
      status: 'success',
      message: 'Source media resolved successfully',
      data: resolvedSourceImage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to resolve source media';

    return res.status(
      message === 'Invalid media URL' || message === 'No preview available for this link'
        ? 400
        : 502
    ).json({
      status: 'error',
      message,
    });
  }
};
