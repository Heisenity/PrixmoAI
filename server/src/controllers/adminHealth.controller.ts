import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import type { AdminAccessContext } from '../lib/adminAccess';
import {
  getAdminAccessSummary,
  getAdminHealthOverview,
  getAdminUserDebugSnapshot,
  listAdminAccessGrants,
  revokeAdminAccessGrant,
  runAdminSafeAction,
  upsertAdminAccessGrant,
} from '../services/adminHealth.service';
import type {
  AdminGrantInput,
  AdminSafeActionInput,
  AdminUserDebugQuery,
} from '../schemas/adminHealth.schema';

type AdminRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  adminAccess?: AdminAccessContext;
};

const getActorUserId = (req: AdminRequest) => {
  if (!req.user?.id) {
    throw new Error('Unauthorized');
  }

  return req.user.id;
};

export const getMyAdminAccess = async (req: AdminRequest, res: Response) => {
  if (!req.user?.id || !req.adminAccess) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  return res.status(200).json({
    status: 'success',
    data: await getAdminAccessSummary(req.user, req.adminAccess),
  });
};

export const getAdminHealth = async (_req: AdminRequest, res: Response) => {
  try {
    const data = await getAdminHealthOverview();

    return res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to load admin system health.',
    });
  }
};

export const getAdminGrants = async (_req: AdminRequest, res: Response) => {
  try {
    const data = await listAdminAccessGrants();

    return res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to load admin access grants.',
    });
  }
};

export const saveAdminGrant = async (
  req: AdminRequest<{}, unknown, AdminGrantInput>,
  res: Response
) => {
  try {
    const data = await upsertAdminAccessGrant(getActorUserId(req), req.body);

    return res.status(200).json({
      status: 'success',
      message: 'Admin access saved.',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to save admin access.',
    });
  }
};

export const deleteAdminGrant = async (
  req: AdminRequest<{ grantId: string }>,
  res: Response
) => {
  try {
    const data = await revokeAdminAccessGrant(
      getActorUserId(req),
      req.params.grantId
    );

    return res.status(200).json({
      status: 'success',
      message: 'Admin access revoked.',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to revoke admin access.',
    });
  }
};

export const runAdminAction = async (
  req: AdminRequest<{}, unknown, AdminSafeActionInput>,
  res: Response
) => {
  try {
    const data = await runAdminSafeAction(getActorUserId(req), req.body);

    return res.status(200).json({
      status: 'success',
      message: 'Admin action completed.',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Admin action failed.',
    });
  }
};

export const getUserDebug = async (
  req: AdminRequest<{}, unknown, unknown, AdminUserDebugQuery>,
  res: Response
) => {
  try {
    const data = await getAdminUserDebugSnapshot(req.query.query);

    if (!data) {
      return res.status(404).json({
        status: 'fail',
        message: 'No user found for that email or user ID.',
      });
    }

    return res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to load user debug snapshot.',
    });
  }
};
