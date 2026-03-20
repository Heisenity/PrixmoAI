import { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { getContentMonthlyUsageCount } from '../db/queries/content';
import { getImageMonthlyUsageCount } from '../db/queries/images';
import { getFeatureMonthlyLimit } from '../db/queries/subscriptions';
import { requireUserClient } from '../db/supabase';
import { FEATURE_KEYS } from '../config/constants';

type AuthenticatedRequest = Request & {
  user?: User;
  accessToken?: string;
};

const enforceFeatureLimit = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  featureKey: string,
  limitReachedMessage: string,
  getUsageCount: (client: ReturnType<typeof requireUserClient>, userId: string) => Promise<number>
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
      getFeatureMonthlyLimit(client, req.user.id, featureKey),
      getUsageCount(client, req.user.id),
    ]);

    if (monthlyLimit !== null && usageCount >= monthlyLimit) {
      return res.status(403).json({
        status: 'fail',
        message: limitReachedMessage,
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

export const planLimitMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) =>
  enforceFeatureLimit(
    req,
    res,
    next,
    FEATURE_KEYS.contentGeneration,
    'Monthly content generation limit reached for your plan',
    getContentMonthlyUsageCount
  );

export const imagePlanLimitMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) =>
  enforceFeatureLimit(
    req,
    res,
    next,
    FEATURE_KEYS.imageGeneration,
    'Monthly image generation limit reached for your plan',
    getImageMonthlyUsageCount
  );
