import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { generateContentPack } from '../ai/gemini';
import { generateProductImage } from '../ai/imageGen';
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
  saveGeneratedContent,
  trackContentGenerationUsage,
} from '../db/queries/content';
import {
  saveGeneratedImage,
  trackImageGenerationUsage,
} from '../db/queries/images';
import { requireUserClient } from '../db/supabase';
import type {
  CreateGenerateConversationInput,
  GenerateConversationCopyInput,
  GenerateConversationImageInput,
  UpdateGenerateConversationInput,
} from '../schemas/generateWorkspace.schema';
import type { GenerateConversation, GenerateConversationType } from '../types';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
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

const resolveConversationType = (
  currentType: GenerateConversationType | null,
  nextType: Exclude<GenerateConversationType, 'mixed'>
): GenerateConversationType => {
  if (!currentType || currentType === nextType) {
    return nextType;
  }

  return 'mixed';
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

  try {
    const client = requireUserClient(req.accessToken);
    const existingConversation = await ensureConversation(
      client,
      req.user.id,
      req.body.conversationId
    );
    const brandProfile = await getBrandProfileByUserId(client, req.user.id);
    const contentPack = await generateContentPack(brandProfile, req.body);
    const userPromptSummary = buildCopyPromptSummary(req.body);

    const conversation =
      existingConversation ??
      (await createGenerateConversation(client, req.user.id, {
        title: deriveConversationTitle([
          req.body.productName,
          req.body.productDescription,
          req.body.audience,
        ]),
        type: 'copy',
        lastMessagePreview: userPromptSummary,
      }));

    const content = await saveGeneratedContent(client, req.user.id, {
      ...req.body,
      conversationId: conversation.id,
      brandProfileId: brandProfile?.id ?? null,
      ...contentPack,
    });

    const userMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'user',
      messageType: 'text',
      content: userPromptSummary,
      metadata: {
        mode: 'copy',
        input: req.body,
      },
    });

    const assistantMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'assistant',
      messageType: 'copy',
      content: buildAssistantCopySummary(req.body.productName),
      metadata: {
        mode: 'copy',
        contentId: content.id,
      },
      generationId: content.id,
    });

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
        {
          assetType: 'script',
          payload: {
            reelScript: content.reelScript,
          },
        },
      ],
    });

    await updateGenerateConversation(client, req.user.id, conversation.id, {
      lastMessagePreview: userMessage.content,
      type: resolveConversationType(conversation.type, 'copy'),
      isArchived: false,
    });

    await trackContentGenerationUsage(client, req.user.id, {
      contentId: content.id,
      conversationId: conversation.id,
      provider: 'gemini',
      brandProfileId: brandProfile?.id ?? null,
      platform: req.body.platform ?? null,
      goal: req.body.goal ?? null,
      tone: req.body.tone ?? null,
      audience: req.body.audience ?? null,
      productName: req.body.productName,
      productDescription: req.body.productDescription ?? null,
      keywords: req.body.keywords ?? [],
    });

    const thread = await getGenerateConversationThread(
      client,
      req.user.id,
      conversation.id
    );

    return res.status(200).json({
      status: 'success',
      message: 'Content generated successfully',
      data: thread,
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

  try {
    const client = requireUserClient(req.accessToken);
    const existingConversation = await ensureConversation(
      client,
      req.user.id,
      req.body.conversationId
    );
    const brandProfile = await getBrandProfileByUserId(client, req.user.id);
    const result = await generateProductImage(brandProfile, req.body);
    const userPromptSummary = buildImagePromptSummary(req.body);

    const conversation: GenerateConversation =
      existingConversation ??
      (await createGenerateConversation(client, req.user.id, {
        title: deriveConversationTitle([
          req.body.productName,
          req.body.productDescription,
          req.body.prompt,
        ]),
        type: 'image',
        lastMessagePreview: userPromptSummary,
      }));

    const image = await saveGeneratedImage(client, req.user.id, {
      contentId: req.body.contentId ?? null,
      conversationId: conversation.id,
      sourceImageUrl: req.body.sourceImageUrl ?? null,
      generatedImageUrl: result.imageUrl,
      backgroundStyle: req.body.backgroundStyle ?? null,
      prompt: result.promptUsed,
    });

    const userMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'user',
      messageType: 'text',
      content: userPromptSummary,
      metadata: {
        mode: 'image',
        input: req.body,
      },
    });

    const assistantMessage = await createGenerateMessage(client, req.user.id, {
      conversationId: conversation.id,
      role: 'assistant',
      messageType: 'image',
      content: buildAssistantImageSummary(req.body.productName),
      metadata: {
        mode: 'image',
        provider: result.provider,
        imageId: image.id,
      },
      generationId: image.id,
    });

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
            sourceImageUrl: req.body.sourceImageUrl ?? null,
            backgroundStyle: req.body.backgroundStyle ?? null,
          },
        },
      ],
    });

    await updateGenerateConversation(client, req.user.id, conversation.id, {
      lastMessagePreview: userMessage.content,
      type: resolveConversationType(conversation.type, 'image'),
      isArchived: false,
    });

    await trackImageGenerationUsage(client, req.user.id, {
      imageId: image.id,
      conversationId: conversation.id,
      provider: result.provider,
      brandProfileId: brandProfile?.id ?? null,
      contentId: req.body.contentId ?? null,
      productName: req.body.productName,
      productDescription: req.body.productDescription ?? null,
      backgroundStyle: req.body.backgroundStyle ?? null,
      prompt: result.promptUsed,
      sourceImageUrl: req.body.sourceImageUrl ?? null,
    });

    const thread = await getGenerateConversationThread(
      client,
      req.user.id,
      conversation.id
    );

    return res.status(200).json({
      status: 'success',
      message: `Image generated successfully using ${result.provider}`,
      data: thread,
    });
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to generate image',
    });
  }
};
