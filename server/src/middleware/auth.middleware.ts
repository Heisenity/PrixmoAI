import { User } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabase';

type AuthenticatedRequest = Request & {
  user?: User;
};

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response, 
  next: NextFunction
) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase is not configured',
      message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env',
    });
  }

  // 1. Get the token from the Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. Verify the token with Supabase
    // This is more secure than just decoding the JWT locally
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // 3. Attach user to the request object
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};
