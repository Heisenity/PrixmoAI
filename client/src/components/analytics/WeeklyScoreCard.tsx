import { memo } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '../ui/card';
import type { WeeklyAnalyticsComparison } from '../../types';

export const WeeklyScoreCard = memo(({
  comparison,
}: {
  comparison: WeeklyAnalyticsComparison;
}) => {
  const Icon =
    comparison.direction === 'up'
      ? ArrowUpRight
      : comparison.direction === 'down'
        ? ArrowDownRight
        : Minus;

  return (
    <Card className="weekly-card">
      <div className="weekly-card__header">
        <p>This week vs last week</p>
        <Icon size={18} />
      </div>
      <strong>{comparison.percentageChange.toFixed(1)}%</strong>
      <span>
        {comparison.currentWeek} current / {comparison.previousWeek} previous
      </span>
    </Card>
  );
});
