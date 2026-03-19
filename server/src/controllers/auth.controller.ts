import type { User } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import {
  getBrandProfileByUserId,
  upsertBrandProfile,
} from '../db/queries/brandProfiles';
import { requireUserClient } from '../db/supabase';
import { AuthProfileInput } from '../schemas/user.schema';
import type { BrandProfileInput } from '../types';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const toBrandProfileInput = (body: AuthProfileInput): BrandProfileInput => ({
  fullName: body.fullName,
  username: body.username ?? null,
  avatarUrl: body.avatarUrl ?? null,
  industry: body.industry ?? null,
  targetAudience: body.targetAudience ?? null,
  brandVoice: body.brandVoice ?? null,
  description: body.description ?? null,
});

export const saveProfile = async (
  req: AuthenticatedRequest<{}, unknown, AuthProfileInput>,
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
    const profile = await upsertBrandProfile(
      client,
      req.user.id,
      toBrandProfileInput(req.body)
    );

    return res.status(200).json({
      status: 'success',
      message: 'Brand profile saved successfully',
      profile,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to save brand profile',
    });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const profile = await getBrandProfileByUserId(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      user: req.user,
      profile,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to load current user',
    });
  }
};
