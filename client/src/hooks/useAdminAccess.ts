import { useEffect, useState } from 'react';
import { ApiRequestError, apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';

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
  const { token } = useAuth();
  const [access, setAccess] = useState<AdminAccessSummary | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  useEffect(() => {
    let isMounted = true;

    if (!token) {
      setAccess(null);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);
    apiRequest<AdminAccessSummary>('/api/admin-health/access/me', { token })
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
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  return {
    access,
    isAdmin: Boolean(access?.isAdmin),
    isLoading,
    hasPermission: (permission: string) =>
      Boolean(access?.permissions.includes(permission)),
  };
};
