import { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { getContentDailyUsageCount } from '../db/queries/content';
import { getImageDailyUsageCount } from '../db/queries/images';
import {
  getFeatureLimit,
  getCurrentSubscriptionByUserId,
} from '../db/queries/subscriptions';
import { requireUserClient } from '../db/supabase';
import {
  FEATURE_KEYS,
  type FeatureKey,
} from '../config/constants';
import {
  checkImageRateLimit,
  resolveImageRuntimePolicy,
  type ImageRuntimePolicy,
} from '../services/imageRuntimePolicy.service';

export type AuthenticatedRequest = Request & {
  user?: User;
  accessToken?: string;
  imageRuntimePolicy?: ImageRuntimePolicy;
  imageRateLimitReservation?: number;
};

const enforceFeatureLimit = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  featureKey: FeatureKey,
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
    const [featureLimit, usageCount] = await Promise.all([
      getFeatureLimit(client, req.user.id, featureKey),
      getUsageCount(client, req.user.id),
    ]);

    if (featureLimit !== null && usageCount >= featureLimit) {
      return res.status(403).json({
        status: 'fail',
        message: limitReachedMessage,
        data: {
          usageCount,
          featureLimit,
          usageWindow: 'day',
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
    'Daily content generation limit reached for your plan',
    getContentDailyUsageCount
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
    'Daily image generation limit reached for your plan',
    getImageDailyUsageCount
  );

export const imageRuntimePolicyMiddleware = async (
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
    const [subscription, usageCount] = await Promise.all([
      getCurrentSubscriptionByUserId(client, req.user.id),
      getImageDailyUsageCount(client, req.user.id),
    ]);

    const plan = subscription?.plan ?? 'free';
    const runtimePolicy = resolveImageRuntimePolicy(plan, usageCount);
    const rateLimitResult = checkImageRateLimit(
      req.user.id,
      runtimePolicy
    );

    if (!rateLimitResult.allowed) {
      res.setHeader('Retry-After', String(rateLimitResult.retryAfterSeconds));

      return res.status(429).json({
        status: 'fail',
        message:
          plan === 'free'
            ? `Too many image generations right now. Your Free plan allows ${runtimePolicy.requestsPerMinute} image requests per minute. Please wait ${rateLimitResult.retryAfterSeconds}s and try again.`
            : plan === 'basic'
              ? `Too many image generations right now. Your Basic plan allows ${runtimePolicy.requestsPerMinute} image requests per minute. Please wait ${rateLimitResult.retryAfterSeconds}s and try again.`
              : `Too many image generations right now. Your Pro plan allows ${runtimePolicy.requestsPerMinute} image requests per minute. Please wait ${rateLimitResult.retryAfterSeconds}s and try again.`,
        data: {
          plan,
          requestsPerMinute: runtimePolicy.requestsPerMinute,
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
      });
    }

    req.imageRuntimePolicy = {
      ...runtimePolicy,
      throttleDelayMs: rateLimitResult.throttleDelayMs,
      burstRequestCount: rateLimitResult.burstRequestCount,
    };
    req.imageRateLimitReservation = rateLimitResult.reservationTimestamp;
    return next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to resolve image runtime policy',
    });
  }
};
