import { Badge } from '../ui/badge';
import type { PlanType } from '../../types';

export const CurrentPlanBadge = ({ plan }: { plan: PlanType }) => (
  <Badge className={`current-plan-badge current-plan-badge--${plan}`}>{plan.toUpperCase()}</Badge>
);
