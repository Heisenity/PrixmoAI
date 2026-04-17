import { Check, CircleX } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PLAN_CARD_DISPLAY } from '../../lib/constants';
import { cn } from '../../lib/utils';
import type { BillingPlan, PlanType } from '../../types';

export const PlanCard = ({
  plan,
  currentPlan,
  isCheckingOut,
  onCheckout,
}: {
  plan: BillingPlan;
  currentPlan: PlanType;
  isCheckingOut?: boolean;
  onCheckout: (plan: Exclude<PlanType, 'free'>) => void;
}) => {
  const display = PLAN_CARD_DISPLAY[plan.id];
  const isCurrentPlan = currentPlan === plan.id;
  const ctaLabel = isCheckingOut ? 'Opening checkout...' : display.cta;

  return (
    <Card glow={plan.id !== 'free'} className={cn('plan-card', `plan-card--${plan.id}`)}>
      <div className="plan-card__top">
        <div>
          <p className="plan-card__label">{display.name}</p>
          <div className="plan-card__price">
            <h3>{display.price}</h3>
            <span>{display.cadence}</span>
          </div>
        </div>
        {display.badge ? <span className="plan-card__badge">{display.badge}</span> : null}
      </div>

      <p className="plan-card__description">{display.description}</p>

      <ul className="plan-card__list">
        {display.features.map((feature) => (
          <li
            key={feature.label}
            className={cn(!feature.included && 'plan-card__feature--excluded')}
          >
            {feature.included ? (
              <Check size={15} className="plan-card__icon plan-card__icon--ok" />
            ) : (
              <CircleX size={15} className="plan-card__icon plan-card__icon--no" />
            )}
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>

      {plan.id === 'free' ? (
        <Button
          variant="secondary"
          size="lg"
          className="plan-card__cta"
          disabled
        >
          {display.cta}
        </Button>
      ) : (
        <Button
          variant={plan.id === 'basic' ? 'primary' : 'secondary'}
          size="lg"
          className="plan-card__cta"
          disabled={!plan.checkoutEnabled || isCheckingOut || isCurrentPlan}
          onClick={() => onCheckout(plan.id as Exclude<PlanType, 'free'>)}
        >
          {ctaLabel}
        </Button>
      )}
    </Card>
  );
};
