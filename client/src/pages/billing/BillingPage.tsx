import { CurrentPlanBadge } from '../../components/billing/CurrentPlanBadge';
import { PlanCard } from '../../components/billing/PlanCard';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { Card } from '../../components/ui/card';
import { useBilling } from '../../hooks/useBilling';
import { formatDateTime } from '../../lib/utils';

export const BillingPage = () => {
  const { catalog, subscription, error, startCheckout } = useBilling();

  return (
    <div className="page-stack">
      <ErrorMessage message={error} />

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
        ) : null}
      </Card>

      <div className="pricing-grid">
        {catalog?.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentPlan={catalog.currentSubscription.plan}
            onCheckout={(selectedPlan) => {
              void startCheckout(selectedPlan);
            }}
          />
        ))}
      </div>
    </div>
  );
};
