import { User } from '@supabase/supabase-js';
import { NextFunction, Request, Response } from 'express';
import { supabase } from '../db/supabase';

type PlanLimitValue = number | null | undefined;

type PlanRecord = {
  plan: string | null;
  limit: PlanLimitValue;
};

type PlanLimitOptions = {
  usageType?: string;
  usageTable?: string;
  usageDateColumn?: string;
  usageUserColumn?: string;
  usageTypeColumn?: string;
  subscriptionTable?: string;
  subscriptionUserColumn?: string;
  subscriptionPlanColumn?: string;
  subscriptionStatusColumn?: string;
  subscriptionLimitColumn?: string;
  subscriptionFeaturesColumn?: string;
  subscriptionCreatedAtColumn?: string;
  activeStatuses?: string[];
  userPlanMetadataKeys?: string[];
  userLimitMetadataKeys?: string[];
  userFeaturesMetadataKeys?: string[];
  onMissingLimit?: 'allow' | 'deny';
};

type AuthenticatedRequest = Request & {
  user?: User;
};

const DEFAULT_OPTIONS: Required<PlanLimitOptions> = {
  usageType: '',
  usageTable: 'usage_tracking',
  usageDateColumn: 'created_at',
  usageUserColumn: 'user_id',
  usageTypeColumn: 'usage_type',
  subscriptionTable: 'subscriptions',
  subscriptionUserColumn: 'user_id',
  subscriptionPlanColumn: 'plan',
  subscriptionStatusColumn: 'status',
  subscriptionLimitColumn: 'monthly_limit',
  subscriptionFeaturesColumn: 'features',
  subscriptionCreatedAtColumn: 'created_at',
  activeStatuses: ['active', 'trialing'],
  userPlanMetadataKeys: ['plan', 'plan_name', 'subscription_plan'],
  userLimitMetadataKeys: ['monthly_limit', 'plan_limit'],
  userFeaturesMetadataKeys: ['plan_limits', 'limits', 'features'],
  onMissingLimit: 'allow',
};

const normalizePlan = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toLimitValue = (value: unknown): PlanLimitValue => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return undefined;
    }

    if (normalized === 'unlimited') {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const getCurrentMonthWindow = () => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  return { monthStart, nextMonthStart };
};

const getFeatureLimitFromRecord = (
  record: Record<string, unknown>,
  featureKey: string,
  featuresColumn: string,
  limitColumn: string
): PlanLimitValue => {
  const directLimitKeys = [
    featureKey,
    `${featureKey}_limit`,
    `${featureKey}_monthly_limit`,
  ];

  for (const key of directLimitKeys) {
    const directValue = toLimitValue(record[key]);
    if (directValue !== undefined) {
      return directValue;
    }
  }

  const features = toRecord(record[featuresColumn]);
  if (features) {
    for (const key of directLimitKeys) {
      const featureValue = toLimitValue(features[key]);
      if (featureValue !== undefined) {
        return featureValue;
      }
    }

    const nestedFeature = toRecord(features[featureKey]);
    if (nestedFeature) {
      const nestedLimit =
        toLimitValue(nestedFeature.limit) ??
        toLimitValue(nestedFeature.monthly_limit) ??
        toLimitValue(nestedFeature.monthlyLimit);

      if (nestedLimit !== undefined) {
        return nestedLimit;
      }
    }
  }

  return toLimitValue(record[limitColumn]);
};

const getPlanFromMetadata = (
  req: AuthenticatedRequest,
  featureKey: string,
  options: Required<PlanLimitOptions>
): PlanRecord => {
  const metadataSources = [req.user?.app_metadata, req.user?.user_metadata];

  for (const metadataSource of metadataSources) {
    const metadata = toRecord(metadataSource);
    if (!metadata) {
      continue;
    }

    let plan: string | null = null;
    for (const key of options.userPlanMetadataKeys) {
      plan = normalizePlan(metadata[key]);
      if (plan) {
        break;
      }
    }

    for (const key of options.userFeaturesMetadataKeys) {
      const features = toRecord(metadata[key]);
      if (!features) {
        continue;
      }

      const featureLimit = getFeatureLimitFromRecord(
        features,
        featureKey,
        key,
        options.subscriptionLimitColumn
      );

      if (featureLimit !== undefined) {
        return { plan, limit: featureLimit };
      }
    }

    for (const key of options.userLimitMetadataKeys) {
      const limit = toLimitValue(metadata[key]);
      if (limit !== undefined) {
        return { plan, limit };
      }
    }

    if (plan) {
      return { plan, limit: undefined };
    }
  }

  return { plan: null, limit: undefined };
};

const getSubscriptionPlan = async (
  req: AuthenticatedRequest,
  featureKey: string,
  options: Required<PlanLimitOptions>
): Promise<PlanRecord | null> => {
  if (!supabase || !req.user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from(options.subscriptionTable)
    .select('*')
    .eq(options.subscriptionUserColumn, req.user.id)
    .in(options.subscriptionStatusColumn, options.activeStatuses)
    .order(options.subscriptionCreatedAtColumn, { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const record = data as Record<string, unknown>;

  return {
    plan: normalizePlan(record[options.subscriptionPlanColumn]),
    limit: getFeatureLimitFromRecord(
      record,
      featureKey,
      options.subscriptionFeaturesColumn,
      options.subscriptionLimitColumn
    ),
  };
};

const getMonthlyUsageCount = async (
  req: AuthenticatedRequest,
  featureKey: string,
  options: Required<PlanLimitOptions>
): Promise<number> => {
  if (!supabase || !req.user?.id) {
    return 0;
  }

  const { monthStart, nextMonthStart } = getCurrentMonthWindow();
  const usageType = options.usageType || featureKey;

  let query = supabase
    .from(options.usageTable)
    .select('*', { count: 'exact', head: true })
    .eq(options.usageUserColumn, req.user.id)
    .gte(options.usageDateColumn, monthStart.toISOString())
    .lt(options.usageDateColumn, nextMonthStart.toISOString());

  if (usageType) {
    query = query.eq(options.usageTypeColumn, usageType);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to fetch usage count');
  }

  return count ?? 0;
};

export const planLimitMiddleware = (
  featureKey: string,
  customOptions: PlanLimitOptions = {}
) => {
  const options = {
    ...DEFAULT_OPTIONS,
    ...customOptions,
  };

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!supabase) {
      return res.status(503).json({
        status: 'error',
        message: 'Supabase is not configured',
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    try {
      const [subscriptionPlan, metadataPlan, currentUsage] = await Promise.all([
        getSubscriptionPlan(req, featureKey, options),
        Promise.resolve(getPlanFromMetadata(req, featureKey, options)),
        getMonthlyUsageCount(req, featureKey, options),
      ]);

      const resolvedPlan = subscriptionPlan?.plan ?? metadataPlan.plan;
      const resolvedLimit =
        subscriptionPlan?.limit !== undefined
          ? subscriptionPlan.limit
          : metadataPlan.limit;

      if (resolvedLimit === undefined) {
        if (options.onMissingLimit === 'allow') {
          return next();
        }

        return res.status(403).json({
          status: 'fail',
          message: 'No plan limit configured for this feature',
          limit: {
            feature: featureKey,
            plan: resolvedPlan,
            currentUsage,
            monthlyLimit: null,
            remaining: null,
            resetsAt: getCurrentMonthWindow().nextMonthStart.toISOString(),
          },
        });
      }

      if (resolvedLimit === null || currentUsage < resolvedLimit) {
        return next();
      }

      return res.status(403).json({
        status: 'fail',
        message: 'Plan limit exceeded',
        limit: {
          feature: featureKey,
          plan: resolvedPlan,
          currentUsage,
          monthlyLimit: resolvedLimit,
          remaining: Math.max(resolvedLimit - currentUsage, 0),
          resetsAt: getCurrentMonthWindow().nextMonthStart.toISOString(),
        },
      });
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
};

export type { PlanLimitOptions };
