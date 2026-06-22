import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import {
  ContentGenerationProvidersExhaustedError,
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
import { recordBrandMemoryFeedback } from '../services/brandMemory.service';
import { getCurrentSubscriptionByUserId, getPlanFeatureLimit } from '../db/queries/subscriptions';
import { requireUserClient } from '../db/supabase';
import type {
  ContentFeedbackInput,
  GenerateContentInput,
  RecommendScheduleCaptionInput,
} from '../schemas/content.schema';
import type { BrandProfile } from '../types';
import {
  createRequestCancellation,
  isRequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';
import { buildGeneratedContentFilePayload } from '../lib/generatedAssetPayloads';
import { storeGeneratedContentInR2 } from '../services/r2Storage.service';
import { enqueueContentGenerationJob } from '../services/contentGenerationQueue.service';
import { invalidateAnalyticsRuntimeCache } from '../services/runtimeCache.service';
import {
  getRelevantMemoriesForContentGeneration,
  syncGeneratedContentSemanticMemory,
} from '../services/brandMemory.service';
import { recommendCaptionForScheduling } from '../services/contentRecommendation.service';
import { prepareConnectedAccountIntelligenceForGeneration } from '../services/socialAccountIntelligence.service';

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

  const cancellation = createRequestCancellation(req, res);

  try {
    console.info('[content-controller] Generate content request started', {
      userId: req.user.id,
      productName: req.body.productName,
      platform: req.body.platform ?? null,
      goal: req.body.goal ?? null,
    });

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
    let brandMemories = [] as Awaited<
      ReturnType<typeof getRelevantMemoriesForContentGeneration>
    >;

    await prepareConnectedAccountIntelligenceForGeneration(
      client,
      req.user.id,
      generationInput.platform
    ).catch((memoryError) => {
      console.warn('[content-controller] connected account intelligence lookup failed', {
        userId: req.user?.id,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    });

    try {
      brandMemories = await getRelevantMemoriesForContentGeneration(
        client,
        req.user.id,
        brandProfile,
        generationInput
      );
    } catch (memoryError) {
      console.warn('[content-controller] failed to retrieve semantic brand memory', {
        userId: req.user.id,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    }

    const plan = subscription?.plan ?? 'free';
    const reelScriptLimit = getPlanFeatureLimit(
      plan,
      FEATURE_KEYS.reelScriptGeneration
    );
    const includeReelScript =
      reelScriptLimit === null || reelScriptUsageCount < reelScriptLimit;
    const {
      jobId,
      result: { contentPack, provider },
    } = await enqueueContentGenerationJob(
      {
        userId: req.user.id,
        brandProfile,
        brandMemories,
        input: generationInput,
        includeReelScript,
      },
      cancellation.signal
    );
    const hasReelScript = hasMeaningfulReelScript(contentPack.reelScript);
    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );
    const storedContentAsset = await storeGeneratedContentInR2({
      userId: req.user.id,
      productName: generationInput.productName,
      payload: buildGeneratedContentFilePayload({
        userId: req.user.id,
        provider,
        brandProfileId: brandProfile?.id ?? null,
        productInput: generationInput,
        contentPack,
        reelScriptIncluded: hasReelScript,
      }),
      signal: cancellation.signal,
    });
    const content = await saveGeneratedContent(client, req.user.id, {
      ...generationInput,
      brandProfileId: brandProfile?.id ?? null,
      storageProvider: storedContentAsset?.provider ?? null,
      storageBucket: storedContentAsset?.bucket ?? null,
      storageObjectKey: storedContentAsset?.objectKey ?? null,
      storagePublicUrl: storedContentAsset?.publicUrl ?? null,
      storageContentType: storedContentAsset?.contentType ?? null,
      storageSizeBytes: storedContentAsset?.sizeBytes ?? null,
      ...contentPack,
    });

    try {
      await syncGeneratedContentSemanticMemory(client, req.user.id, content);
    } catch (memoryError) {
      console.warn('[content-controller] failed to index generated content memory', {
        userId: req.user.id,
        contentId: content.id,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    }

    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );
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
      throwIfRequestCancelled(
        cancellation.signal,
        'Content generation cancelled by user.'
      );
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
    await invalidateAnalyticsRuntimeCache(req.user.id);

    console.info('[content-controller] Generate content request succeeded', {
      userId: req.user.id,
      contentId: content.id,
      provider,
      hasReelScript,
    });

    return res.status(200).json({
      status: 'success',
      message: 'Content generated successfully',
      data: content,
      meta: {
        jobId,
      },
    });
  } catch (error) {
    if (isRequestCancelledError(error)) {
      console.info('[content-controller] Generate content request cancelled', {
        userId: req.user?.id ?? 'unknown-user',
      });
      return;
    }

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
  } finally {
    cancellation.cleanup();
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

export const submitContentFeedback = async (
  req: AuthenticatedRequest<{}, unknown, ContentFeedbackInput>,
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
    const feedbackEvent = await recordBrandMemoryFeedback(client, {
      userId: req.user.id,
      brandProfileId: brandProfile?.id ?? null,
      sourceTable: req.body.sourceTable,
      sourceId: req.body.sourceId,
      sourceKey: req.body.sourceKey ?? 'primary',
      memoryType: req.body.memoryType,
      eventType: req.body.eventType,
      platform: req.body.platform ?? null,
      contentId: req.body.contentId ?? null,
      generatedImageId: req.body.generatedImageId ?? null,
      scheduledPostId: req.body.scheduledPostId ?? null,
      scheduledItemId: req.body.scheduledItemId ?? null,
      intensity: req.body.intensity ?? 1,
      wasAiRecommended: req.body.wasAiRecommended ?? false,
      metadata: req.body.metadata ?? {},
    });

    return res.status(200).json({
      status: 'success',
      message: 'Feedback recorded successfully',
      data: feedbackEvent,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to record memory feedback',
    });
  }
};

export const recommendScheduleCaption = async (
  req: AuthenticatedRequest<{ id: string }, unknown, RecommendScheduleCaptionInput>,
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
    const [brandProfile, content] = await Promise.all([
      getBrandProfileByUserId(client, req.user.id),
      getGeneratedContentById(client, req.user.id, req.params.id),
    ]);

    if (!content) {
      return res.status(404).json({
        status: 'fail',
        message: 'Content item not found',
      });
    }

    const recommendation = await recommendCaptionForScheduling(client, {
      userId: req.user.id,
      brandProfile,
      content,
      requestContext: req.body.requestContext ?? 'scheduler',
    });

    return res.status(200).json({
      status: 'success',
      data: recommendation,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to recommend a caption for scheduling',
    });
  }
};
