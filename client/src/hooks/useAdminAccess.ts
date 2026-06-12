import { useEffect, useState } from 'react';
import { ApiRequestError, apiRequest } from '../lib/axios';
import { isSuperAdminUser } from '../lib/superAdmin';
import { useAuth } from './useAuth';

const ADMIN_PERMISSIONS = [
  'system_health:view',
  'failed_jobs:view',
  'social_health:view',
  'analytics_health:view',
  'queue:view',
  'alerts:view',
  'user_debug:view',
  'admin_access:manage',
  'safe_actions:run',
];

export type AdminAccessSummary = {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  role: string | null;
  permissions: string[];
  allPermissions: string[];
};

export const useAdminAccess = () => {
  const { getAccessToken, token, user } = useAuth();
  const [access, setAccess] = useState<AdminAccessSummary | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  const buildLocalOwnerAccess = (): AdminAccessSummary | null => {
    if (!user || !isSuperAdminUser(user)) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email ?? null,
      isAdmin: true,
      isOwner: true,
      role: 'owner',
      permissions: ADMIN_PERMISSIONS,
      allPermissions: ADMIN_PERMISSIONS,
    };
  };

  useEffect(() => {
    let isMounted = true;
    const localOwnerAccess = buildLocalOwnerAccess();

    if (localOwnerAccess) {
      setAccess(localOwnerAccess);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    if (!token) {
      setAccess(null);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);
    getAccessToken()
      .then((freshToken) => {
        if (!freshToken) {
          throw new ApiRequestError('No token provided', { status: 401 });
        }

        return apiRequest<AdminAccessSummary>('/api/admin-health/access/me', {
          token: freshToken,
        }).catch(async (error) => {
          if (!(error instanceof ApiRequestError) || error.status !== 401) {
            throw error;
          }

          const refreshedToken = await getAccessToken({ forceRefresh: true });

          if (!refreshedToken) {
            throw error;
          }

          return apiRequest<AdminAccessSummary>('/api/admin-health/access/me', {
            token: refreshedToken,
          });
        });
      })
      .then((data) => {
        if (isMounted) {
          setAccess(data);
        }
      })
      .catch((error) => {
        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          if (isMounted) {
            setAccess(null);
          }
          return;
        }

        console.warn('[admin-access] failed to resolve admin access', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (isMounted) {
          setAccess(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [getAccessToken, token, user]);

  return {
    access,
    isAdmin: Boolean(access?.isAdmin),
    isLoading,
    hasPermission: (permission: string) =>
      Boolean(access?.permissions.includes(permission)),
  };
};
