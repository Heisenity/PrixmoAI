import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import type { PlanType } from '../../types';

export const CurrentPlanBadge = ({
  plan,
  className,
}: {
  plan: PlanType;
  className?: string;
}) => (
  <Badge className={cn(`current-plan-badge current-plan-badge--${plan}`, className)}>
    {plan.charAt(0).toUpperCase()}
    {plan.slice(1)}
  </Badge>
);
