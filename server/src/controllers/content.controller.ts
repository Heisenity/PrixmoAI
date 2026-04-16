import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import {
  ContentGenerationProvidersExhaustedError,
  generateContentPackWithFallback,
  hasMeaningfulReelScript,
} from '../ai/gemini';
import { FEATURE_KEYS } from '../config/constants';
import { getBrandProfileByUserId } from '../db/queries/brandProfiles';
import {
  deleteGeneratedContent,
  getReelScriptDailyUsageCount,
  getGeneratedContentById,
  getGeneratedContentHistory,
  saveGeneratedContent,
  trackContentGenerationUsage,
  trackReelScriptGenerationUsage,
} from '../db/queries/content';
import { getCurrentSubscriptionByUserId, getPlanFeatureLimit } from '../db/queries/subscriptions';
import { requireUserClient } from '../db/supabase';
import type { GenerateContentInput } from '../schemas/content.schema';
import type { BrandProfile } from '../types';

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

const logGenerationFailure = (
  scope: 'content' | 'workspace-copy',
  userId: string,
  error: unknown
) => {
  if (error instanceof ContentGenerationProvidersExhaustedError) {
    console.error(`[${scope}] All content generation providers failed`, {
      userId,
      failures: error.failures,
    });
    return;
  }

  console.error(`[${scope}] Content generation failed`, {
    userId,
    error: error instanceof Error ? error.message : error,
  });
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
    const [brandProfile, subscription, reelScriptUsageCount] = await Promise.all([
      getBrandProfileByUserId(client, req.user.id),
      getCurrentSubscriptionByUserId(client, req.user.id),
      getReelScriptDailyUsageCount(client, req.user.id),
    ]);
    const generationInput = {
      ...req.body,
      ...resolveBrandPreference(brandProfile, req.body.useBrandName),
    };
    const plan = subscription?.plan ?? 'free';
    const reelScriptLimit = getPlanFeatureLimit(
      plan,
      FEATURE_KEYS.reelScriptGeneration
    );
    const includeReelScript =
      reelScriptLimit === null || reelScriptUsageCount < reelScriptLimit;
    const { contentPack, provider } = await generateContentPackWithFallback(
      brandProfile,
      generationInput,
      {
        includeReelScript,
      }
    );
    const hasReelScript = hasMeaningfulReelScript(contentPack.reelScript);
    const content = await saveGeneratedContent(client, req.user.id, {
      ...generationInput,
      brandProfileId: brandProfile?.id ?? null,
      ...contentPack,
    });

    await trackContentGenerationUsage(client, req.user.id, {
      contentId: content.id,
      provider,
      brandProfileId: brandProfile?.id ?? null,
      platform: generationInput.platform ?? null,
      goal: generationInput.goal ?? null,
      tone: generationInput.tone ?? null,
      audience: generationInput.audience ?? null,
      productName: generationInput.productName,
      productDescription: generationInput.productDescription ?? null,
      keywords: generationInput.keywords ?? [],
      reelScriptIncluded: hasReelScript,
    }, `content-generation:${content.id}`);

    if (hasReelScript) {
      await trackReelScriptGenerationUsage(client, req.user.id, {
        contentId: content.id,
        provider,
        brandProfileId: brandProfile?.id ?? null,
        platform: generationInput.platform ?? null,
        goal: generationInput.goal ?? null,
        tone: generationInput.tone ?? null,
        audience: generationInput.audience ?? null,
        productName: generationInput.productName,
      }, `reel-script-generation:${content.id}`);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Content generated successfully',
      data: content,
    });
  } catch (error) {
    logGenerationFailure('content', req.user?.id ?? 'unknown-user', error);
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof ContentGenerationProvidersExhaustedError
          ? error.message
          : error instanceof Error
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
