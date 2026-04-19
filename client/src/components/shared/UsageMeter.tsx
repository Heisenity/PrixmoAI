import { Card } from '../ui/card';
import { formatCompactNumber } from '../../lib/utils';

export const UsageMeter = ({
  label,
  value,
  limit,
  limitLabel,
}: {
  label: string;
  value: number | null;
  limit: number | null;
  limitLabel?: string;
}) => {
  const hasValue = value !== null;
  const ratio = !hasValue
    ? 0
    : limit
      ? Math.min(100, (value / limit) * 100)
      : Math.min(100, value > 0 ? 16 : 10);
  const resolvedLimitLabel =
    limitLabel ?? (limit !== null ? formatCompactNumber(limit) : null);

  return (
    <Card className={`usage-meter ${!hasValue ? 'usage-meter--pending' : ''}`}>
      <div className="usage-meter__header">
        <span>{label}</span>
        <strong>
          {hasValue ? formatCompactNumber(value) : '—'}
          {resolvedLimitLabel ? ` / ${resolvedLimitLabel}` : ''}
        </strong>
      </div>
      <div className="usage-meter__track">
        <div className="usage-meter__fill" style={{ width: `${ratio}%` }} />
      </div>
    </Card>
  );
};
