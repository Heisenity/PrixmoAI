import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import {
  ContentGenerationProvidersExhaustedError,
  generateContentPackWithFallback,
  hasMeaningfulReelScript,
} from '../ai/gemini';
import {
  ImageGenerationProvidersExhaustedError,
  generateProductImage,
} from '../ai/imageGen';
import { FEATURE_KEYS } from '../config/constants';
import { getBrandProfileByUserId } from '../db/queries/brandProfiles';
import {
  createGenerateConversation,
  createGeneratedAssets,
  createGenerateMessage,
  getGenerateConversationById,
  getGenerateConversationThread,
  listGenerateConversations,
  softDeleteGenerateConversation,
  updateGenerateConversation,
} from '../db/queries/generateWorkspace';
import {
  getReelScriptDailyUsageCount,
  saveGeneratedContent,
  trackContentGenerationUsage,
  trackReelScriptGenerationUsage,
} from '../db/queries/content';
import {
  saveGeneratedImage,
  trackImageGenerationUsage,
} from '../db/queries/images';
import { getCurrentSubscriptionByUserId, getPlanFeatureLimit } from '../db/queries/subscriptions';
import { requireUserClient } from '../db/supabase';
import type {
  CreateGenerateConversationInput,
  GenerateConversationCopyInput,
  GenerateConversationImageInput,
  UpdateGenerateConversationInput,
} from '../schemas/generateWorkspace.schema';
import {
  enqueueImageGeneration,
  releaseImageRateLimitReservation,
  resolveImageRuntimePolicy,
} from '../services/imageRuntimePolicy.service';
import type {
  BrandProfile,
  GenerateConversation,
  GenerateConversationType,
} from '../types';
import {
  createRequestCancellation,
  isRequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
  imageRuntimePolicy?: ReturnType<typeof resolveImageRuntimePolicy>;
  imageRateLimitReservation?: number;
};

const trimText = (value: string, maxLength = 120) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
};

const deriveConversationTitle = (candidates: Array<string | null | undefined>) => {
  const source = candidates.find((value) => typeof value === 'string' && value.trim());
  return source ? trimText(source, 64) : 'New chat';
};

const buildCopyPromptSummary = (input: GenerateConversationCopyInput) => {
  const fragments = [
    `Create copy for "${input.productName}"`,
    input.platform ? `for ${input.platform}` : null,
    input.goal ? `with the goal "${input.goal}"` : null,
  ].filter(Boolean);

  const description = input.productDescription
    ? trimText(input.productDescription, 180)
    : null;

  return description
    ? `${fragments.join(' ')}. ${description}`
    : `${fragments.join(' ')}.`;
};

const buildImagePromptSummary = (input: GenerateConversationImageInput) => {
  const fragments = [
    `Generate an image for "${input.productName}"`,
    input.sourceImageUrl ? 'Reference image attached' : null,
    input.backgroundStyle ? `Background: ${input.backgroundStyle}` : null,
  ].filter(Boolean);
  const description = input.productDescription
    ? trimText(input.productDescription, 140)
    : null;

  return description
    ? `${fragments.join(' ')}. ${description}`
    : `${fragments.join(' ')}.`;
};

const buildAssistantCopySummary = (productName: string) =>
  `Generated a copy pack for ${productName}.`;

const buildAssistantImageSummary = (productName: string) =>
  `Generated an image for ${productName}.`;

const logWorkspaceCopyFailure = (userId: string, error: unknown) => {
  if (error instanceof ContentGenerationProvidersExhaustedError) {
    console.error('[workspace-copy] All content generation providers failed', {
      userId,
      failures: error.failures,
    });
    return;
  }

  console.error('[workspace-copy] Content generation failed', {
    userId,
    error: error instanceof Error ? error.message : error,
  });
};

const logWorkspaceImageFailure = (userId: string, error: unknown) => {
  if (error instanceof ImageGenerationProvidersExhaustedError) {
    console.error('[workspace-image] All image generation providers failed', {
      userId,
      failures: error.failures,
    });
    return;
  }

  console.error('[workspace-image] Image generation failed', {
    userId,
    error: error instanceof Error ? error.message : error,
  });
};

const resolveConversationType = (
  currentType: GenerateConversationType | null,
  nextType: Exclude<GenerateConversationType, 'mixed'>
): GenerateConversationType => {
  if (!currentType || currentType === nextType) {
    return nextType;
  }

  return 'mixed';
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

const ensureConversation = async (
  client: ReturnType<typeof requireUserClient>,
  userId: string,
  conversationId?: string
) => {
  if (!conversationId) {
    return null;
  }

  const conversation = await getGenerateConversationById(
    client,
    userId,
    conversationId
  );

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  return conversation;
};

export const listWorkspaceConversations = async (
  req: AuthenticatedRequest,
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
    const conversations = await listGenerateConversations(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      data: conversations,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch conversations',
    });
  }
};

export const createWorkspaceConversation = async (
  req: AuthenticatedRequest<{}, unknown, CreateGenerateConversationInput>,
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
    const conversation = await createGenerateConversation(client, req.user.id, {
      title: trimText(req.body.title?.trim() || 'New chat', 64),
      type: req.body.type ?? 'mixed',
    });

    return res.status(201).json({
      status: 'success',
      message: 'Conversation created successfully',
      data: conversation,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to create conversation',
    });
  }
};

export const getWorkspaceConversationThread = async (
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
    const thread = await getGenerateConversationThread(
      client,
      req.user.id,
      req.params.id
    );

    if (!thread) {
      return res.status(404).json({
        status: 'fail',
        message: 'Conversation not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: thread,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch conversation thread',
    });
  }
};

export const updateWorkspaceConversation = async (
  req: AuthenticatedRequest<{ id: string }, unknown, UpdateGenerateConversationInput>,
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
    const existingConversation = await getGenerateConversationById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingConversation) {
      return res.status(404).json({
        status: 'fail',
        message: 'Conversation not found',
      });
    }

    const conversation = await updateGenerateConversation(
      client,
      req.user.id,
      req.params.id,
      {
        title:
          req.body.title !== undefined
            ? trimText(req.body.title, 64)
            : undefined,
        isArchived: req.body.isArchived,
      }
    );

    return res.status(200).json({
      status: 'success',
      message: 'Conversation updated successfully',
      data: conversation,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to update conversation',
    });
  }
};

export const deleteWorkspaceConversation = async (
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
    const existingConversation = await getGenerateConversationById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingConversation) {
      return res.status(404).json({
        status: 'fail',
        message: 'Conversation not found',
      });
    }

    await softDeleteGenerateConversation(client, req.user.id, req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Conversation deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to delete conversation',
    });
  }
};

export const generateWorkspaceCopy = async (
  req: AuthenticatedRequest<{}, unknown, GenerateConversationCopyInput>,
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
    console.info('[workspace-copy] Generate content request started', {
      userId: req.user.id,
      productName: req.body.productName,
      conversationId: req.body.conversationId ?? null,
      platform: req.body.platform ?? null,
      goal: req.body.goal ?? null,
    });

    const client = requireUserClient(req.accessToken);
    const existingConversation = await ensureConversation(
      client,
      req.user.id,
      req.body.conversationId
    );
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
        signal: cancellation.signal,
      }
    );
    const hasReelScript = hasMeaningfulReelScript(contentPack.reelScript);
    const userPromptSummary = buildCopyPromptSummary(generationInput);
    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );

    const conversation =
      existingConversation ??
      (await createGenerateConversation(client, req.user.id, {
        title: deriveConversationTitle([
          generationInput.productName,
          generationInput.productDescription,
          generationInput.audience,
        ]),
        type: 'copy',
        lastMessagePreview: userPromptSummary,
      }));

    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );
    const content = await saveGeneratedContent(client, req.user.id, {
      ...generationInput,
      conversationId: conversation.id,
      brandProfileId: brandProfile?.id ?? null,
      ...contentPack,
    });

    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );
    const userMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'user',
      messageType: 'text',
      content: userPromptSummary,
      metadata: {
        mode: 'copy',
        input: generationInput,
      },
    });

    const assistantMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'assistant',
      messageType: 'copy',
      content: buildAssistantCopySummary(generationInput.productName),
      metadata: {
        mode: 'copy',
        contentId: content.id,
      },
      generationId: content.id,
    });

    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );
    await createGeneratedAssets(client, req.user.id, {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      assets: [
        {
          assetType: 'copy',
          payload: {
            captions: content.captions,
            platform: content.platform,
            goal: content.goal,
            tone: content.tone,
            audience: content.audience,
          },
        },
        {
          assetType: 'hashtags',
          payload: {
            hashtags: content.hashtags,
          },
        },
        ...(hasReelScript
          ? [
              {
                assetType: 'script' as const,
                payload: {
                  reelScript: content.reelScript,
                },
              },
            ]
          : []),
      ],
    });

    await updateGenerateConversation(client, req.user.id, conversation.id, {
      lastMessagePreview: userMessage.content,
      type: resolveConversationType(conversation.type, 'copy'),
      isArchived: false,
    });

    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );
    await trackContentGenerationUsage(client, req.user.id, {
      contentId: content.id,
      conversationId: conversation.id,
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
        conversationId: conversation.id,
        provider,
        brandProfileId: brandProfile?.id ?? null,
        platform: generationInput.platform ?? null,
        goal: generationInput.goal ?? null,
        tone: generationInput.tone ?? null,
        audience: generationInput.audience ?? null,
        productName: generationInput.productName,
      }, `reel-script-generation:${content.id}`);
    }

    const thread = await getGenerateConversationThread(
      client,
      req.user.id,
      conversation.id
    );

    console.info('[workspace-copy] Generate content request succeeded', {
      userId: req.user.id,
      conversationId: conversation.id,
      contentId: content.id,
      provider,
      hasReelScript,
    });

    return res.status(200).json({
      status: 'success',
      message: 'Content generated successfully',
      data: thread,
    });
  } catch (error) {
    if (isRequestCancelledError(error)) {
      console.info('[workspace-copy] Generate content request cancelled', {
        userId: req.user?.id ?? 'unknown-user',
        conversationId: req.body.conversationId ?? null,
      });
      return;
    }

    logWorkspaceCopyFailure(req.user?.id ?? 'unknown-user', error);
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

export const generateWorkspaceImage = async (
  req: AuthenticatedRequest<{}, unknown, GenerateConversationImageInput>,
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
    console.info('[workspace-image] Generate image request started', {
      userId: req.user.id,
      productName: req.body.productName,
      conversationId: req.body.conversationId ?? null,
      contentId: req.body.contentId ?? null,
    });

    const client = requireUserClient(req.accessToken);
    const existingConversation = await ensureConversation(
      client,
      req.user.id,
      req.body.conversationId
    );
    const brandProfile = await getBrandProfileByUserId(client, req.user.id);
    const generationInput = {
      ...req.body,
      ...resolveBrandPreference(brandProfile, req.body.useBrandName),
    };
    const runtimePolicy =
      req.imageRuntimePolicy ?? resolveImageRuntimePolicy('free', 0);
    const result = await enqueueImageGeneration(
      runtimePolicy,
      () =>
        generateProductImage(brandProfile, generationInput, {
          signal: cancellation.signal,
        }),
      cancellation.signal
    );
    const userPromptSummary = buildImagePromptSummary(generationInput);
    throwIfRequestCancelled(
      cancellation.signal,
      'Image generation cancelled by user.'
    );

    const conversation: GenerateConversation =
      existingConversation ??
      (await createGenerateConversation(client, req.user.id, {
        title: deriveConversationTitle([
          generationInput.productName,
          generationInput.productDescription,
          generationInput.prompt,
        ]),
        type: 'image',
        lastMessagePreview: userPromptSummary,
      }));

    throwIfRequestCancelled(
      cancellation.signal,
      'Image generation cancelled by user.'
    );
    const image = await saveGeneratedImage(client, req.user.id, {
      contentId: generationInput.contentId ?? null,
      conversationId: conversation.id,
      sourceImageUrl: generationInput.sourceImageUrl ?? null,
      generatedImageUrl: result.imageUrl,
      backgroundStyle: generationInput.backgroundStyle ?? null,
      prompt: result.promptUsed,
    });

    throwIfRequestCancelled(
      cancellation.signal,
      'Image generation cancelled by user.'
    );
    const userMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'user',
      messageType: 'text',
      content: userPromptSummary,
      metadata: {
        mode: 'image',
        input: generationInput,
      },
    });

    const assistantMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'assistant',
      messageType: 'image',
      content: buildAssistantImageSummary(generationInput.productName),
      metadata: {
        mode: 'image',
        provider: result.provider,
        imageId: image.id,
      },
      generationId: image.id,
    });

    throwIfRequestCancelled(
      cancellation.signal,
      'Image generation cancelled by user.'
    );
    await createGeneratedAssets(client, req.user.id, {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      assets: [
        {
          assetType: 'image',
          payload: {
            image: {
              ...image,
              provider: result.provider,
            },
          },
        },
        {
          assetType: 'prompt',
          payload: {
            promptUsed: result.promptUsed,
            sourceImageUrl: generationInput.sourceImageUrl ?? null,
            backgroundStyle: generationInput.backgroundStyle ?? null,
          },
        },
      ],
    });

    await updateGenerateConversation(client, req.user.id, conversation.id, {
      lastMessagePreview: userMessage.content,
      type: resolveConversationType(conversation.type, 'image'),
      isArchived: false,
    });

    throwIfRequestCancelled(
      cancellation.signal,
      'Image generation cancelled by user.'
    );
    await trackImageGenerationUsage(client, req.user.id, {
      imageId: image.id,
      conversationId: conversation.id,
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
    }, `image-generation:${image.id}`);

    res.setHeader('X-PrixmoAI-Queue-Tier', runtimePolicy.queueTier);
    res.setHeader('X-PrixmoAI-Speed-Tier', runtimePolicy.speedTier);
    res.setHeader(
      'X-PrixmoAI-Throttle-Delay-Ms',
      String(runtimePolicy.throttleDelayMs)
    );

    const thread = await getGenerateConversationThread(
      client,
      req.user.id,
      conversation.id
    );

    console.info('[workspace-image] Generate image request succeeded', {
      userId: req.user.id,
      conversationId: conversation.id,
      imageId: image.id,
      provider: result.provider,
    });

    return res.status(200).json({
      status: 'success',
      message: `Image generated successfully using ${result.provider}`,
      data: thread,
      meta: {
        runtime: runtimePolicy,
      },
    });
  } catch (error) {
    if (isRequestCancelledError(error)) {
      releaseImageRateLimitReservation(
        req.user?.id ?? '',
        req.imageRateLimitReservation
      );
      req.imageRateLimitReservation = undefined;
      console.info('[workspace-image] Image generation request cancelled', {
        userId: req.user?.id ?? 'unknown-user',
        conversationId: req.body.conversationId ?? null,
      });
      return;
    }

    logWorkspaceImageFailure(req.user?.id ?? 'unknown-user', error);
    return res.status(502).json({
      status: 'error',
      message:
        error instanceof ImageGenerationProvidersExhaustedError
          ? error.message
          : error instanceof Error
          ? error.message
          : 'Failed to generate image',
    });
  } finally {
    cancellation.cleanup();
  }
};
