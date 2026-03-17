import { User } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { AuthProfileInput } from '../schemas/user.schema';

type AuthenticatedRequest = Request & {
  user: User;
};

const toBrandProfileResponse = (profile: Record<string, unknown> | null) => {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id ?? null,
    userId: profile.user_id ?? null,
    fullName: profile.full_name ?? null,
    username: profile.username ?? null,
    avatarUrl: profile.avatar_url ?? null,
    createdAt: profile.created_at ?? null,
    updatedAt: profile.updated_at ?? null,
  };
};

export const saveProfile = async (
  req: Request<{}, {}, AuthProfileInput>,
  res: Response
) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  const { user } = req as AuthenticatedRequest;
  const payload = {
    user_id: user.id,
    full_name: req.body.fullName,
    username: req.body.username ?? null,
    avatar_url: req.body.avatarUrl ?? null,
  };

  const { data: profile, error } = await supabase
    .from('brand_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to save brand profile',
    });
  }

  return res.status(200).json({
    status: 'success',
    message: 'Brand profile saved successfully',
    profile: toBrandProfileResponse(profile as Record<string, unknown>),
  });
};

export const getMe = async (req: Request, res: Response) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase is not configured',
    });
  }

  const { user } = req as AuthenticatedRequest;
  const { data: profile, error } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to load current user',
    });
  }

  return res.status(200).json({
    status: 'success',
    user,
    profile: toBrandProfileResponse(profile as Record<string, unknown> | null),
  });
};
