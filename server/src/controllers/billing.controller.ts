import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { BILLING_PLAN_CATALOG, PLAN_LIMITS } from '../config/constants';
import {
  getCurrentSubscriptionByUserId,
  upsertSubscription,
} from '../db/queries/subscriptions';
import { requireSupabaseAdmin, requireUserClient } from '../db/supabase';
import type {
  CancelSubscriptionInput,
  CreateBillingCheckoutInput,
  SyncSubscriptionInput,
} from '../schemas/billing.schema';
import {
  cancelRazorpaySubscription,
  createHostedSubscriptionCheckout,
  fetchRazorpaySubscription,
  getBillingPlans,
  inferPlanFromRazorpayData,
  type RazorpaySubscription,
  toSubscriptionUpsertPayload,
  verifyRazorpayWebhookSignature,
} from '../services/razorpay.service';
import type { PlanType } from '../types';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const getDefaultFreeSubscription = (userId: string) => ({
  id: 'free-plan-local',
  userId,
  plan: 'free' as PlanType,
  status: 'active' as const,
  monthlyLimit: PLAN_LIMITS.free,
  currentPeriodEnd: null,
  razorpayCustomerId: null,
  razorpaySubscriptionId: null,
  metadata: {},
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

const getAuthenticatedClient = (req: AuthenticatedRequest) => {
  if (!req.user?.id) {
    return null;
  }

  return requireUserClient(req.accessToken);
};

const extractWebhookSubscription = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const payloadRecord = record.payload as Record<string, unknown> | undefined;
  const subscriptionRecord = payloadRecord?.subscription as
    | Record<string, unknown>
    | undefined;
  const entity = subscriptionRecord?.entity;

  return entity && typeof entity === 'object'
    ? (entity as Record<string, unknown>)
    : null;
};

export const getBillingPlanCatalog = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = getAuthenticatedClient(req);

    if (!client) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    const currentSubscription =
      (await getCurrentSubscriptionByUserId(client, req.user.id)) ??
      getDefaultFreeSubscription(req.user.id);

    return res.status(200).json({
      status: 'success',
      data: {
        currentSubscription,
        plans: getBillingPlans(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to fetch billing plans',
    });
  }
};

export const getCurrentBillingSubscription = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = getAuthenticatedClient(req);

    if (!client) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    const subscription =
      (await getCurrentSubscriptionByUserId(client, req.user.id)) ??
      getDefaultFreeSubscription(req.user.id);

    return res.status(200).json({
      status: 'success',
      data: subscription,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch current subscription',
    });
  }
};

export const createBillingCheckout = async (
  req: AuthenticatedRequest<{}, unknown, CreateBillingCheckoutInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = getAuthenticatedClient(req);

    if (!client) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    const existingSubscription = await getCurrentSubscriptionByUserId(
      client,
      req.user.id
    );

    if (
      existingSubscription &&
      existingSubscription.plan === req.body.plan &&
      (existingSubscription.status === 'active' ||
        existingSubscription.status === 'trialing')
    ) {
      return res.status(400).json({
        status: 'fail',
        message: `You already have an active ${req.body.plan} subscription`,
      });
    }

    const checkout = await createHostedSubscriptionCheckout({
      userId: req.user.id,
      plan: req.body.plan,
      email: req.user.email ?? null,
      totalCount: req.body.totalCount,
      quantity: req.body.quantity,
      startAt: req.body.startAt,
      expireBy: req.body.expireBy,
    });

    const localSubscription = await upsertSubscription(
      client,
      toSubscriptionUpsertPayload(req.user.id, checkout, req.body.plan)
    );

    return res.status(200).json({
      status: 'success',
      message: 'Billing checkout created successfully',
      data: {
        subscription: localSubscription,
        checkoutUrl: checkout.short_url ?? null,
        razorpaySubscriptionId: checkout.id,
        plan: BILLING_PLAN_CATALOG[req.body.plan],
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to create billing checkout',
    });
  }
};

export const syncBillingSubscription = async (
  req: AuthenticatedRequest<{}, unknown, SyncSubscriptionInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = getAuthenticatedClient(req);

    if (!client) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    const currentSubscription = await getCurrentSubscriptionByUserId(
      client,
      req.user.id
    );
    const subscriptionId =
      req.body.subscriptionId ?? currentSubscription?.razorpaySubscriptionId;

    if (!subscriptionId) {
      return res.status(400).json({
        status: 'fail',
        message: 'No Razorpay subscription ID available to sync',
      });
    }

    const remoteSubscription = await fetchRazorpaySubscription(subscriptionId);
    const fallbackPlan = currentSubscription?.plan ?? 'free';
    const localSubscription = await upsertSubscription(
      client,
      toSubscriptionUpsertPayload(req.user.id, remoteSubscription, fallbackPlan)
    );

    return res.status(200).json({
      status: 'success',
      message: 'Subscription synced successfully',
      data: {
        subscription: localSubscription,
        razorpayStatus: remoteSubscription.status ?? null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to sync subscription',
    });
  }
};

export const cancelBillingSubscriptionController = async (
  req: AuthenticatedRequest<{}, unknown, CancelSubscriptionInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = getAuthenticatedClient(req);

    if (!client) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    const currentSubscription = await getCurrentSubscriptionByUserId(
      client,
      req.user.id
    );

    if (!currentSubscription?.razorpaySubscriptionId) {
      return res.status(400).json({
        status: 'fail',
        message: 'No paid subscription found to cancel',
      });
    }

    const remoteSubscription = await cancelRazorpaySubscription(
      currentSubscription.razorpaySubscriptionId,
      req.body.cancelAtCycleEnd ?? true
    );

    const localSubscription = await upsertSubscription(
      client,
      toSubscriptionUpsertPayload(
        req.user.id,
        remoteSubscription,
        currentSubscription.plan
      )
    );

    return res.status(200).json({
      status: 'success',
      message: 'Subscription cancelled successfully',
      data: localSubscription,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to cancel subscription',
    });
  }
};

export const handleRazorpayWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? {}));

    const isValid = verifyRazorpayWebhookSignature(
      rawBody,
      req.headers['x-razorpay-signature']
    );

    if (!isValid) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid webhook signature',
      });
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    const entity = extractWebhookSubscription(payload);

    if (!entity) {
      return res.status(200).json({
        status: 'success',
        message: 'Webhook received without subscription payload',
      });
    }

    const notes = entity.notes as Record<string, unknown> | undefined;
    const userId =
      typeof notes?.userId === 'string' && notes.userId.trim()
        ? notes.userId
        : null;

    if (!userId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Webhook subscription payload is missing notes.userId',
      });
    }

    const adminClient = requireSupabaseAdmin();
    const subscriptionEntity = entity as unknown as RazorpaySubscription;
    const fallbackPlan =
      typeof notes?.plan === 'string' &&
      (notes.plan === 'free' || notes.plan === 'basic' || notes.plan === 'pro')
        ? (notes.plan as PlanType)
        : inferPlanFromRazorpayData(subscriptionEntity, 'free');

    const localSubscription = await upsertSubscription(
      adminClient,
      toSubscriptionUpsertPayload(userId, subscriptionEntity, fallbackPlan)
    );

    return res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully',
      data: {
        subscriptionId: localSubscription.id,
        razorpaySubscriptionId: localSubscription.razorpaySubscriptionId,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to process Razorpay webhook',
    });
  }
};
