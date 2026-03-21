import { CurrentPlanBadge } from '../../components/billing/CurrentPlanBadge';
import { PlanCard } from '../../components/billing/PlanCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Card } from '../../components/ui/card';
import { useBilling } from '../../hooks/useBilling';
import { formatDateTime } from '../../lib/utils';

export const BillingPage = () => {
  const { catalog, subscription, error, isLoading, isCheckingOut, startCheckout } =
    useBilling();

  if (isLoading && !catalog) {
    return (
      <Card className="dashboard-panel">
        <div className="screen-center">
          <LoadingSpinner label="Loading billing" />
        </div>
      </Card>
    );
  }

  return (
    <div className="page-stack">
      <ErrorMessage message={error} />

      <Card className="app-hero-card">
        <div className="app-hero-card__copy">
          <p className="section-eyebrow">Plan control</p>
          <h2>Keep pricing and upgrade logic ready before launch day.</h2>
          <p>
            Free, Basic, and Pro are already surfaced here so you can validate the
            in-product billing experience before live Razorpay activation.
          </p>
        </div>
        <div className="app-hero-card__stats">
          <div className="app-hero-card__metric">
            <span>Current plan</span>
            <strong>{subscription?.plan || catalog?.currentSubscription.plan || 'free'}</strong>
            <small>Workspace entitlement</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Subscription status</span>
            <strong>{subscription?.status || 'not started'}</strong>
            <small>Trialing, active, or pending checkout</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Checkout</span>
            <strong>{isCheckingOut ? 'Launching' : 'Ready'}</strong>
            <small>Opens a hosted flow when available</small>
          </div>
        </div>
      </Card>

      <Card className="dashboard-panel">
        <div className="dashboard-panel__header">
          <div>
            <p className="section-eyebrow">Current subscription</p>
            <h3>Subscription state</h3>
          </div>
          {subscription ? <CurrentPlanBadge plan={subscription.plan} /> : null}
        </div>
        {subscription ? (
          <div className="stack-list">
            <div className="stack-list__item">
              <strong>Status</strong>
              <span>{subscription.status}</span>
            </div>
            <div className="stack-list__item">
              <strong>Monthly limit</strong>
              <span>{subscription.monthlyLimit ?? 'Unlimited'}</span>
            </div>
            <div className="stack-list__item">
              <strong>Current period end</strong>
              <span>{formatDateTime(subscription.currentPeriodEnd)}</span>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No active subscription yet"
            description="You are most likely on the free plan right now. Pricing cards below are ready for test and live checkout later."
          />
        )}
      </Card>

      {catalog?.plans.length ? (
        <>
          <div className="pricing-grid">
            {catalog.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentPlan={subscription?.plan || catalog.currentSubscription.plan}
                isCheckingOut={isCheckingOut}
                onCheckout={(selectedPlan) => {
                  void startCheckout(selectedPlan);
                }}
              />
            ))}
          </div>

          <Card className="dashboard-panel billing-note-panel">
            <div className="dashboard-panel__header">
              <div>
                <p className="section-eyebrow">Launch note</p>
                <h3>What happens next when Razorpay is ready</h3>
              </div>
            </div>
            <div className="stack-list">
              <div className="stack-list__item">
                <strong>Plan IDs plug in directly</strong>
                <span>Basic and Pro already map cleanly to the billing flow and plan catalog.</span>
              </div>
              <div className="stack-list__item">
                <strong>Hosted checkout opens from here</strong>
                <span>The UI is ready to launch the checkout URL as soon as live configuration exists.</span>
              </div>
              <div className="stack-list__item">
                <strong>Subscription state refreshes back into the workspace</strong>
                <span>Current plan, limits, and status all come from the same billing layer.</span>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <EmptyState
          title="Billing catalog unavailable"
          description="Plans are not loading yet. Once the backend plan catalog responds, this page will populate immediately."
        />
      )}
    </div>
  );
};
