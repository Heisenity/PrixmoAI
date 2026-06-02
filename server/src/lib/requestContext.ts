import { AsyncLocalStorage } from 'node:async_hooks';
import type { PlanType } from '../types';

type RequestContext = {
  requestId: string | null;
  authenticatedUserId: string | null;
  isSuperAdminRequest: boolean;
  superAdminTestPlan: PlanType | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  callback: () => T
) => requestContextStorage.run(context, callback);

const getCurrentRequestContext = () => requestContextStorage.getStore() ?? null;

export const setAuthenticatedRequestContext = (options: {
  authenticatedUserId: string | null;
  isSuperAdminRequest: boolean;
  superAdminTestPlan: PlanType | null;
}) => {
  const context = getCurrentRequestContext();

  if (!context) {
    return;
  }

  context.authenticatedUserId = options.authenticatedUserId;
  context.isSuperAdminRequest = options.isSuperAdminRequest;
  context.superAdminTestPlan = options.superAdminTestPlan;
};

export const getAuthenticatedRequestUserId = () =>
  getCurrentRequestContext()?.authenticatedUserId ?? null;

export const isCurrentRequestSuperAdmin = () =>
  getCurrentRequestContext()?.isSuperAdminRequest === true;

export const getCurrentRequestSuperAdminTestPlan = () =>
  getCurrentRequestContext()?.superAdminTestPlan ?? null;

export const getCurrentRequestContextSnapshot = () => getCurrentRequestContext();

export { getCurrentRequestContext };
