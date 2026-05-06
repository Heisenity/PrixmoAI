import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import {
  ContentGenerationProvidersExhaustedError,
  hasMeaningfulReelScript,
} from '../ai/gemini';
import {
  ImageGenerationProvidersExhaustedError,
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
  getGeneratedContentById,
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
import { buildGeneratedContentFilePayload } from '../lib/generatedAssetPayloads';
import {
  storeGeneratedContentInR2,
  storeGeneratedImageInR2,
} from '../services/r2Storage.service';
import { enqueueContentGenerationJob } from '../services/contentGenerationQueue.service';
import { enqueueImageGenerationJob } from '../services/imageGenerationQueue.service';
import { getJobRuntimeSnapshot } from '../services/jobRuntime.service';
import { invalidateAnalyticsRuntimeCache } from '../services/runtimeCache.service';
import {
  getRelevantMemoriesForContentGeneration,
  getRelevantMemoriesForImageGeneration,
  syncGeneratedContentSemanticMemory,
  syncGeneratedImageSemanticMemory,
} from '../services/brandMemory.service';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
  imageRuntimePolicy?: ReturnType<typeof resolveImageRuntimePolicy>;
  imageRateLimitReservation?: string;
};

type WorkspaceGenerationProgressPhase =
  | 'preparing'
  | 'queued'
  | 'researching'
  | 'writing'
  | 'stitching'
  | 'syncing'
  | 'done';

type WorkspaceGenerationProgressPayload = {
  phase: WorkspaceGenerationProgressPhase;
  message: string;
  progress?: number;
  provider?: string | null;
};

const createWorkspaceGenerationStream = (res: Response) => {
  let closed = false;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.once('close', () => {
    closed = true;
  });

  const send = (event: string, payload: unknown) => {
    if (closed || res.writableEnded) {
      return;
    }

    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  return {
    progress: (payload: WorkspaceGenerationProgressPayload) =>
      send('progress', {
        type: 'progress',
        ...payload,
        sentAt: new Date().toISOString(),
      }),
    complete: (payload: unknown) => {
      send('complete', {
        type: 'complete',
        ...(
          payload && typeof payload === 'object'
            ? payload
            : { data: payload }
        ),
        sentAt: new Date().toISOString(),
      });
      res.end();
    },
    fail: (message: string) => {
      send('error', {
        type: 'error',
        message,
        sentAt: new Date().toISOString(),
      });
      res.end();
    },
  };
};

const resolveCopyRuntimePhase = (
  message: string | null | undefined,
  progress: number
): WorkspaceGenerationProgressPhase => {
  const normalized = (message ?? '').toLowerCase();

  if (/queued|queue/.test(normalized) || progress < 15) {
    return 'queued';
  }

  if (/research|trend|social|web/.test(normalized) || progress < 35) {
    return 'researching';
  }

  if (/provider|generating|generation|content/.test(normalized) || progress < 75) {
    return 'writing';
  }

  return 'stitching';
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
  const startedAt = Date.now();
  const progressStream =
    req.path.endsWith('/stream') || req.originalUrl.includes('/copy/stream')
      ? createWorkspaceGenerationStream(res)
      : null;
  let runtimeProgressTimer: NodeJS.Timeout | null = null;
  let runtimeProgressInFlight = false;
  let lastRuntimeProgressSignature = '';
  const emitProgress = (payload: WorkspaceGenerationProgressPayload) => {
    progressStream?.progress(payload);
  };
  const stopRuntimeProgressPolling = () => {
    if (!runtimeProgressTimer) {
      return;
    }

    clearInterval(runtimeProgressTimer);
    runtimeProgressTimer = null;
  };
  const startRuntimeProgressPolling = (jobId: string) => {
    if (!progressStream) {
      return;
    }

    const pollRuntime = async () => {
      if (runtimeProgressInFlight) {
        return;
      }

      runtimeProgressInFlight = true;

      try {
        const snapshot = await getJobRuntimeSnapshot(jobId);

        if (!snapshot) {
          return;
        }

        const signature = [
          snapshot.status,
          snapshot.progress,
          snapshot.message ?? '',
          snapshot.currentProvider ?? '',
        ].join('|');

        if (signature === lastRuntimeProgressSignature) {
          return;
        }

        lastRuntimeProgressSignature = signature;
        emitProgress({
          phase: resolveCopyRuntimePhase(snapshot.message, snapshot.progress),
          message: snapshot.message || 'PrixmoAI is working on the content pack.',
          progress: snapshot.progress,
          provider: snapshot.currentProvider ?? null,
        });
      } catch {
        // Runtime polling is best-effort; the main generation request still owns the result.
      } finally {
        runtimeProgressInFlight = false;
      }
    };

    void pollRuntime();
    runtimeProgressTimer = setInterval(() => {
      void pollRuntime();
    }, 850);
    runtimeProgressTimer.unref?.();
  };

  try {
    emitProgress({
      phase: 'preparing',
      progress: 3,
      message: 'Starting the content generation request.',
    });
    console.info('[workspace-copy] Generate content request started', {
      userId: req.user.id,
      productName: req.body.productName,
      conversationId: req.body.conversationId ?? null,
      platform: req.body.platform ?? null,
      goal: req.body.goal ?? null,
    });

    emitProgress({
      phase: 'preparing',
      progress: 8,
      message: 'Checking the active thread, brand profile, and plan access.',
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
    let brandMemories = [] as Awaited<
      ReturnType<typeof getRelevantMemoriesForContentGeneration>
    >;

    emitProgress({
      phase: 'preparing',
      progress: 16,
      message: 'Pulling brand memory and past signals for this brief.',
    });
    try {
      brandMemories = await getRelevantMemoriesForContentGeneration(
        client,
        req.user.id,
        brandProfile,
        generationInput
      );
    } catch (memoryError) {
      console.warn('[workspace-copy] failed to retrieve semantic brand memory', {
        userId: req.user.id,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    }

    emitProgress({
      phase: 'preparing',
      progress: 22,
      message: brandMemories.length
        ? `Found ${brandMemories.length} brand memory signal${brandMemories.length === 1 ? '' : 's'} to guide the copy.`
        : 'No strong brand-memory match found, so PrixmoAI is using the current brief.',
    });
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
      cancellation.signal,
      async (queuedJobId) => {
        emitProgress({
          phase: 'queued',
          progress: 28,
          message: 'Queued the generation job and started live backend tracking.',
        });
        startRuntimeProgressPolling(queuedJobId);
      }
    );
    stopRuntimeProgressPolling();
    emitProgress({
      phase: 'stitching',
      progress: 78,
      provider,
      message: 'Content is ready. Saving the result now.',
    });
    console.info('[workspace-copy] Queue job resolved', {
      userId: req.user.id,
      jobId,
      provider,
      durationMs: Date.now() - startedAt,
    });
    const hasReelScript = hasMeaningfulReelScript(contentPack.reelScript);
    const userPromptSummary = buildCopyPromptSummary(generationInput);
    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );

    emitProgress({
      phase: 'stitching',
      progress: 84,
      provider,
      message: 'Creating or updating the workspace thread.',
    });
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
    emitProgress({
      phase: 'stitching',
      progress: 88,
      provider,
      message: 'Saving the generated copy securely.',
    });
    const storedContentAsset = await storeGeneratedContentInR2({
      userId: req.user.id,
      productName: generationInput.productName,
      payload: buildGeneratedContentFilePayload({
        userId: req.user.id,
        provider,
        brandProfileId: brandProfile?.id ?? null,
        conversationId: conversation.id,
        productInput: generationInput,
        contentPack,
        reelScriptIncluded: hasReelScript,
      }),
      signal: cancellation.signal,
    });
    const content = await saveGeneratedContent(client, req.user.id, {
      ...generationInput,
      conversationId: conversation.id,
      brandProfileId: brandProfile?.id ?? null,
      storageProvider: storedContentAsset?.provider ?? null,
      storageBucket: storedContentAsset?.bucket ?? null,
      storageObjectKey: storedContentAsset?.objectKey ?? null,
      storagePublicUrl: storedContentAsset?.publicUrl ?? null,
      storageContentType: storedContentAsset?.contentType ?? null,
      storageSizeBytes: storedContentAsset?.sizeBytes ?? null,
      ...contentPack,
    });

    emitProgress({
      phase: 'syncing',
      progress: 92,
      provider,
      message: 'Updating brand memory with the new generated content.',
    });
    try {
      await syncGeneratedContentSemanticMemory(client, req.user.id, content);
    } catch (memoryError) {
      console.warn('[workspace-copy] failed to index generated content memory', {
        userId: req.user.id,
        contentId: content.id,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    }

    throwIfRequestCancelled(
      cancellation.signal,
      'Content generation cancelled by user.'
    );
    emitProgress({
      phase: 'syncing',
      progress: 95,
      provider,
      message: 'Writing the assistant response into the conversation.',
    });
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
    emitProgress({
      phase: 'syncing',
      progress: 97,
      provider,
      message: 'Attaching captions, hashtags, and script assets to the thread.',
    });
    await createGeneratedAssets(client, req.user.id, {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      assets: [
        {
          assetType: 'copy',
          payload: {
            contentId: content.id,
            productName: content.productName,
            productDescription: content.productDescription,
            captions: content.captions,
            platform: content.platform,
            goal: content.goal,
            tone: content.tone,
            audience: content.audience,
            keywords: content.keywords,
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
    emitProgress({
      phase: 'syncing',
      progress: 99,
      provider,
      message: 'Refreshing analytics and loading the final thread.',
    });
    await invalidateAnalyticsRuntimeCache(req.user.id);

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
      durationMs: Date.now() - startedAt,
    });

    const responsePayload = {
      status: 'success',
      message: 'Content generated successfully',
      data: thread,
      meta: {
        jobId,
      },
    };

    if (progressStream) {
      progressStream.complete(responsePayload);
      return;
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    stopRuntimeProgressPolling();
    if (isRequestCancelledError(error)) {
      console.info('[workspace-copy] Generate content request cancelled', {
        userId: req.user?.id ?? 'unknown-user',
        conversationId: req.body.conversationId ?? null,
      });
      return;
    }

    logWorkspaceCopyFailure(req.user?.id ?? 'unknown-user', error);
    const errorMessage =
      error instanceof ContentGenerationProvidersExhaustedError
        ? error.message
        : error instanceof Error
        ? error.message
        : 'Failed to generate content';

    if (progressStream) {
      progressStream.fail(errorMessage);
      return;
    }

    return res.status(500).json({
      status: 'error',
      message: errorMessage,
    });
  } finally {
    stopRuntimeProgressPolling();
    cancellation.cleanup();
  }
};

export const generateWorkspaceCopyStream = generateWorkspaceCopy;

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
    const [existingConversation, brandProfile, linkedContent] = await Promise.all([
      ensureConversation(client, req.user.id, req.body.conversationId),
      getBrandProfileByUserId(client, req.user.id),
      req.body.contentId
        ? getGeneratedContentById(client, req.user.id, req.body.contentId).catch(
            () => null
          )
        : Promise.resolve(null),
    ]);
    const generationInput = {
      ...req.body,
      ...resolveBrandPreference(brandProfile, req.body.useBrandName),
    };
    const memoryQueryInput = {
      brandName: generationInput.brandName ?? null,
      useBrandName: generationInput.useBrandName,
      productName: generationInput.productName,
      productDescription:
        generationInput.productDescription ??
        generationInput.prompt ??
        linkedContent?.productDescription ??
        null,
      platform: linkedContent?.platform ?? null,
      goal: linkedContent?.goal ?? null,
      tone: linkedContent?.tone ?? null,
      audience: linkedContent?.audience ?? null,
      keywords: linkedContent?.keywords ?? [],
    };
    let brandMemories = [] as Awaited<
      ReturnType<typeof getRelevantMemoriesForImageGeneration>
    >;

    try {
      brandMemories = await getRelevantMemoriesForImageGeneration(
        client,
        req.user.id,
        brandProfile,
        memoryQueryInput
      );
    } catch (memoryError) {
      console.warn('[workspace-image] failed to retrieve semantic brand memory', {
        userId: req.user.id,
        error:
          memoryError instanceof Error
            ? memoryError.message
            : String(memoryError),
      });
    }
    const runtimePolicy =
      req.imageRuntimePolicy ?? resolveImageRuntimePolicy('free', 0);
    const { jobId, result } = await enqueueImageGenerationJob(
      {
        runtimePolicy,
        data: {
          userId: req.user.id,
          brandProfile,
          brandMemories,
          contentContext: linkedContent
            ? {
                brandName: generationInput.brandName ?? null,
                useBrandName: generationInput.useBrandName,
                productName: linkedContent.productName,
                productDescription:
                  linkedContent.productDescription ?? generationInput.prompt ?? null,
                platform: linkedContent.platform ?? null,
                goal: linkedContent.goal ?? null,
                tone: linkedContent.tone ?? null,
                audience: linkedContent.audience ?? null,
                keywords: linkedContent.keywords ?? [],
              }
            : memoryQueryInput,
          input: generationInput,
        },
      },
      cancellation.signal
    );
    const userPromptSummary = buildImagePromptSummary(generationInput);
    throwIfRequestCancelled(
      cancellation.signal,
      'Image generation cancelled by user.'
    );
    const storedImageAsset = await storeGeneratedImageInR2({
      userId: req.user.id,
      productName: generationInput.productName,
      imageUrl: result.imageUrl,
      signal: cancellation.signal,
    });

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
      generatedImageUrl: storedImageAsset?.publicUrl ?? result.imageUrl,
      backgroundStyle: generationInput.backgroundStyle ?? null,
      prompt: result.promptUsed,
      storageProvider: storedImageAsset?.provider ?? null,
      storageBucket: storedImageAsset?.bucket ?? null,
      storageObjectKey: storedImageAsset?.objectKey ?? null,
      storagePublicUrl: storedImageAsset?.publicUrl ?? null,
      storageContentType: storedImageAsset?.contentType ?? null,
      storageSizeBytes: storedImageAsset?.sizeBytes ?? null,
    });

    try {
      await syncGeneratedImageSemanticMemory(client, req.user.id, image, {
        brandProfile,
        productName: generationInput.productName,
        productDescription: generationInput.productDescription ?? null,
        backgroundStyle: generationInput.backgroundStyle ?? null,
        sourceImageUrl: generationInput.sourceImageUrl ?? null,
      });
    } catch (memoryError) {
      console.warn('[workspace-image] failed to index generated image memory', {
        userId: req.user.id,
        imageId: image.id,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    }

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
    await invalidateAnalyticsRuntimeCache(req.user.id);

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
      message: 'Image generated successfully.',
      data: thread,
      meta: {
        jobId,
        runtime: runtimePolicy,
      },
    });
  } catch (error) {
    if (isRequestCancelledError(error)) {
      await releaseImageRateLimitReservation(
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
