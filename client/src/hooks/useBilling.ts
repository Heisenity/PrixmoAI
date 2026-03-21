import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/axios';
import { useAuth } from './useAuth';
import type { BillingCatalogResponse, PlanType, Subscription } from '../types';

type CheckoutResponse = {
  subscription: Subscription;
  checkoutUrl: string | null;
};

export const useBilling = () => {
  const { token } = useAuth();
  const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);

    try {
      const [nextCatalog, nextSubscription] = await Promise.all([
        apiRequest<BillingCatalogResponse>('/api/billing/plans', { token }),
        apiRequest<Subscription>('/api/billing/subscription', { token }),
      ]);

      setCatalog(nextCatalog);
      setSubscription(nextSubscription);
      setError(null);
    } catch (billingError) {
      setError(
        billingError instanceof Error ? billingError.message : 'Failed to load billing'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const startCheckout = async (plan: Exclude<PlanType, 'free'>) => {
    if (!token) {
      throw new Error('Sign in again to continue.');
    }

    setError(null);
    setIsCheckingOut(true);

    try {
      const result = await apiRequest<CheckoutResponse>('/api/billing/checkout', {
        method: 'POST',
        token,
        body: { plan },
      });

      await refresh();

      if (result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error ? checkoutError.message : 'Failed to start checkout';
      setError(message);
      throw new Error(message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  return {
    catalog,
    subscription,
    isLoading,
    isCheckingOut,
    error,
    refresh,
    startCheckout,
  };
};
