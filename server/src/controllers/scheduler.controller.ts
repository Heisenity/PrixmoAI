import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { getGeneratedContentById } from '../db/queries/content';
import { getGeneratedImageById } from '../db/queries/images';
import {
  createScheduledPost,
  deleteScheduledPost,
  getScheduledPostById,
  getScheduledPostsByUser,
  updateScheduledPost,
  updateScheduledPostStatus,
} from '../db/queries/scheduledPosts';
import {
  createSocialAccount,
  deleteSocialAccount,
  getSocialAccountById,
  getSocialAccountsByUser,
  updateSocialAccount,
} from '../db/queries/socialAccounts';
import { requireUserClient } from '../db/supabase';
import type {
  CreateScheduledPostBody,
  CreateSocialAccountBody,
  UpdateScheduledPostBody,
  UpdateScheduledPostStatusBody,
  UpdateSocialAccountBody,
} from '../schemas/scheduler.schema';

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

const ensureFutureDate = (isoDate: string, fieldName = 'scheduledFor') => {
  const parsed = new Date(isoDate);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName} value`);
  }

  if (parsed.getTime() <= Date.now()) {
    throw new Error(`${fieldName} must be a future date`);
  }
};

const resolveScheduledPostDefaults = async (
  client: ReturnType<typeof requireUserClient>,
  userId: string,
  input: {
    socialAccountId: string;
    contentId?: string | null;
    generatedImageId?: string | null;
    platform?: string | null;
    caption?: string | null;
    mediaUrl?: string | null;
  }
) => {
  const socialAccount = await getSocialAccountById(
    client,
    userId,
    input.socialAccountId
  );

  if (!socialAccount) {
    throw new Error('Social account not found');
  }

  const content = input.contentId
    ? await getGeneratedContentById(client, userId, input.contentId)
    : null;

  if (input.contentId && !content) {
    throw new Error('Generated content item not found');
  }

  const image = input.generatedImageId
    ? await getGeneratedImageById(client, userId, input.generatedImageId)
    : null;

  if (input.generatedImageId && !image) {
    throw new Error('Generated image item not found');
  }

  return {
    socialAccount,
    content,
    image,
    platform: input.platform ?? socialAccount.platform,
    caption:
      input.caption === undefined
        ? content?.captions?.[0]?.mainCopy ?? null
        : input.caption,
    mediaUrl:
      input.mediaUrl === undefined
        ? image?.generatedImageUrl ?? null
        : input.mediaUrl,
  };
};

export const createConnectedSocialAccount = async (
  req: AuthenticatedRequest<{}, unknown, CreateSocialAccountBody>,
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
    const account = await createSocialAccount(client, req.user.id, req.body);

    return res.status(201).json({
      status: 'success',
      message: 'Social account connected successfully',
      data: account,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to connect social account',
    });
  }
};

export const listConnectedSocialAccounts = async (
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
    const accounts = await getSocialAccountsByUser(client, req.user.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 20),
    });

    return res.status(200).json({
      status: 'success',
      data: accounts,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch social accounts',
    });
  }
};

export const updateConnectedSocialAccount = async (
  req: AuthenticatedRequest<{ id: string }, unknown, UpdateSocialAccountBody>,
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
    const existingAccount = await getSocialAccountById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Social account not found',
      });
    }

    const account = await updateSocialAccount(
      client,
      req.user.id,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      status: 'success',
      message: 'Social account updated successfully',
      data: account,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to update social account',
    });
  }
};

export const removeConnectedSocialAccount = async (
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
    const existingAccount = await getSocialAccountById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Social account not found',
      });
    }

    await deleteSocialAccount(client, req.user.id, req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Social account removed successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to remove social account',
    });
  }
};

export const createPostSchedule = async (
  req: AuthenticatedRequest<{}, unknown, CreateScheduledPostBody>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    ensureFutureDate(req.body.scheduledFor);

    const client = requireUserClient(req.accessToken);
    const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
      socialAccountId: req.body.socialAccountId,
      contentId: req.body.contentId ?? null,
      generatedImageId: req.body.generatedImageId ?? null,
      platform: req.body.platform ?? null,
      caption: req.body.caption ?? null,
      mediaUrl: req.body.mediaUrl ?? null,
    });

    const scheduledPost = await createScheduledPost(client, req.user.id, {
      socialAccountId: req.body.socialAccountId,
      contentId: req.body.contentId ?? null,
      generatedImageId: req.body.generatedImageId ?? null,
      platform: resolved.platform,
      caption: resolved.caption,
      mediaUrl: resolved.mediaUrl,
      scheduledFor: req.body.scheduledFor,
      status: req.body.status ?? 'pending',
    });

    return res.status(201).json({
      status: 'success',
      message: 'Post scheduled successfully',
      data: scheduledPost,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create scheduled post';

    return res.status(
      message.includes('not found') || message.includes('must be a future')
        ? 400
        : 500
    ).json({
      status: message.includes('not found') || message.includes('must be a future')
        ? 'fail'
        : 'error',
      message,
    });
  }
};

export const listScheduledPosts = async (
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
    const scheduledPosts = await getScheduledPostsByUser(client, req.user.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 20),
    });

    return res.status(200).json({
      status: 'success',
      data: scheduledPosts,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch scheduled posts',
    });
  }
};

export const updatePostSchedule = async (
  req: AuthenticatedRequest<{ id: string }, unknown, UpdateScheduledPostBody>,
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
    const existingPost = await getScheduledPostById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingPost) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled post not found',
      });
    }

    if (req.body.scheduledFor) {
      ensureFutureDate(req.body.scheduledFor);
    }

    const resolved = await resolveScheduledPostDefaults(client, req.user.id, {
      socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
      contentId:
        req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
      generatedImageId:
        req.body.generatedImageId === undefined
          ? existingPost.generatedImageId
          : req.body.generatedImageId,
      platform: req.body.platform === undefined ? existingPost.platform : req.body.platform,
      caption: req.body.caption === undefined ? existingPost.caption : req.body.caption,
      mediaUrl: req.body.mediaUrl === undefined ? existingPost.mediaUrl : req.body.mediaUrl,
    });

    const updatedPost = await updateScheduledPost(
      client,
      req.user.id,
      req.params.id,
      {
        socialAccountId: req.body.socialAccountId ?? existingPost.socialAccountId,
        contentId:
          req.body.contentId === undefined ? existingPost.contentId : req.body.contentId,
        generatedImageId:
          req.body.generatedImageId === undefined
            ? existingPost.generatedImageId
            : req.body.generatedImageId,
        platform: resolved.platform,
        caption: resolved.caption,
        mediaUrl: resolved.mediaUrl,
        scheduledFor: req.body.scheduledFor ?? existingPost.scheduledFor,
        status: req.body.status ?? existingPost.status,
      }
    );

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled post updated successfully',
      data: updatedPost,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update scheduled post';

    return res.status(
      message.includes('not found') || message.includes('must be a future')
        ? 400
        : 500
    ).json({
      status: message.includes('not found') || message.includes('must be a future')
        ? 'fail'
        : 'error',
      message,
    });
  }
};

export const updatePostScheduleStatus = async (
  req: AuthenticatedRequest<
    { id: string },
    unknown,
    UpdateScheduledPostStatusBody
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
    const existingPost = await getScheduledPostById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingPost) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled post not found',
      });
    }

    const publishedAt =
      req.body.status === 'published'
        ? req.body.publishedAt ?? new Date().toISOString()
        : req.body.publishedAt ?? null;

    const updatedPost = await updateScheduledPostStatus(
      client,
      req.user.id,
      req.params.id,
      req.body.status,
      publishedAt
    );

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled post status updated successfully',
      data: updatedPost,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to update scheduled post status',
    });
  }
};

export const deletePostSchedule = async (
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
    const existingPost = await getScheduledPostById(
      client,
      req.user.id,
      req.params.id
    );

    if (!existingPost) {
      return res.status(404).json({
        status: 'fail',
        message: 'Scheduled post not found',
      });
    }

    await deleteScheduledPost(client, req.user.id, req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Scheduled post deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to delete scheduled post',
    });
  }
};
