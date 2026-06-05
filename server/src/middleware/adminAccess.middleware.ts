import { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import {
  type AdminAccessContext,
  type AdminPermission,
  hasAdminPermission,
  resolveAdminAccessForUser,
} from '../lib/adminAccess';

type AdminRequest = Request & {
  user?: User;
  adminAccess?: AdminAccessContext;
};

export const adminAccessMiddleware = (
  requiredPermission?: AdminPermission
) => async (req: AdminRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const access = await resolveAdminAccessForUser(req.user);

    if (!access.isAdmin) {
      return res.status(403).json({
        status: 'fail',
        message: 'Admin access is required.',
      });
    }

    if (requiredPermission && !hasAdminPermission(access, requiredPermission)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to use this admin feature.',
      });
    }

    req.adminAccess = access;
    return next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to verify admin access.',
    });
  }
};
