import { Request, Response, NextFunction } from 'express';
import type { User } from '@supabase/supabase-js';
import { supabaseAuth } from '../db/supabase';

type AuthenticatedRequest = Request & {
  user?: User;
  accessToken?: string;
};

const isUnverifiedEmailAuthUser = (user: User | null | undefined) => {
  if (!user) {
    return false;
  }

  const provider = ((user.app_metadata?.provider as string | undefined) ?? 'email')
    .trim()
    .toLowerCase();

  return Boolean(user.email) && provider === 'email' && !user.email_confirmed_at;
};

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!supabaseAuth) {
    return res.status(503).json({
      status: 'error',
      error: 'Supabase is not configured',
      message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env',
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'fail',
      error: 'No token provided',
    });
  }

  const token = authHeader.split(' ')[1];
  req.accessToken = token;

  try {
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        status: 'fail',
        error: 'Invalid or expired token',
      });
    }

    if (isUnverifiedEmailAuthUser(user)) {
      return res.status(403).json({
        status: 'fail',
        error: 'Email verification required',
        message: 'Verify your email code first, then come back and unlock the workspace.',
      });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({
      status: 'fail',
      error: 'Authentication failed',
    });
  }
};
