import { Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PLAN_FEATURES } from '../../lib/constants';
import { formatCurrency } from '../../lib/utils';
import type { BillingPlan, PlanType } from '../../types';

export const PlanCard = ({
  plan,
  currentPlan,
  onCheckout,
}: {
  plan: BillingPlan;
  currentPlan: PlanType;
  onCheckout: (plan: Exclude<PlanType, 'free'>) => void;
}) => {
  const features = [
    ...PLAN_FEATURES[plan.id],
    `${plan.period[0].toUpperCase()}${plan.period.slice(1)} billing cadence`,
    plan.checkoutEnabled
      ? 'Checkout flow available'
      : plan.id === 'free'
        ? 'Included by default'
        : 'Checkout activates once Razorpay is connected',
  ];

  return (
    <Card className={`plan-card plan-card--${plan.id}`}>
      <div className="plan-card__header">
        <div>
          <p className="section-eyebrow">{plan.displayName}</p>
          <div className="plan-card__price">
            <h3>{formatCurrency(plan.amountInPaise, plan.currency)}</h3>
            <span>/ month</span>
          </div>
        </div>
        {currentPlan === plan.id ? <span className="status-pill">Current</span> : null}
      </div>
      <p>{plan.description}</p>
      <ul className="plan-card__list">
        {features.map((feature) => (
          <li key={feature}>
            <Check size={14} />
            <span>{feature}</span>
          </li>
        ))}
        <li>
          <Check size={14} />
          <span>Monthly limit: {plan.monthlyLimit ?? 'Unlimited'}</span>
        </li>
      </ul>
      {plan.id === 'free' ? (
        <Button variant={currentPlan === 'free' ? 'secondary' : 'ghost'} disabled>
          {currentPlan === 'free' ? 'Current plan' : 'Included'}
        </Button>
      ) : (
        <Button
          variant={currentPlan === plan.id ? 'secondary' : 'primary'}
          disabled={!plan.checkoutEnabled}
          onClick={() => onCheckout(plan.id as Exclude<PlanType, 'free'>)}
        >
          {currentPlan === plan.id ? 'Current plan' : `Choose ${plan.displayName}`}
        </Button>
      )}
    </Card>
  );
};
