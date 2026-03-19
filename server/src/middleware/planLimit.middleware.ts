import { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { getContentMonthlyUsageCount } from '../db/queries/content';
import { getFeatureMonthlyLimit } from '../db/queries/subscriptions';
import { requireUserClient } from '../db/supabase';
import { FEATURE_KEYS } from '../config/constants';

type AuthenticatedRequest = Request & {
  user?: User;
  accessToken?: string;
};

export const planLimitMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const [monthlyLimit, usageCount] = await Promise.all([
      getFeatureMonthlyLimit(client, req.user.id, FEATURE_KEYS.contentGeneration),
      getContentMonthlyUsageCount(client, req.user.id),
    ]);

    if (monthlyLimit !== null && usageCount >= monthlyLimit) {
      return res.status(403).json({
        status: 'fail',
        message: 'Monthly content generation limit reached for your plan',
        data: {
          usageCount,
          monthlyLimit,
        },
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to validate plan limit',
    });
  }
};
