import { Card } from '../ui/card';
import { formatCompactNumber } from '../../lib/utils';

export const UsageMeter = ({
  label,
  value,
  limit,
  limitLabel,
}: {
  label: string;
  value: number;
  limit: number | null;
  limitLabel?: string;
}) => {
  const ratio = limit ? Math.min(100, (value / limit) * 100) : Math.min(100, value > 0 ? 16 : 10);
  const resolvedLimitLabel =
    limitLabel ?? (limit !== null ? formatCompactNumber(limit) : null);

  return (
    <Card className="usage-meter">
      <div className="usage-meter__header">
        <span>{label}</span>
        <strong>
          {formatCompactNumber(value)}
          {resolvedLimitLabel ? ` / ${resolvedLimitLabel}` : ''}
        </strong>
      </div>
      <div className="usage-meter__track">
        <div className="usage-meter__fill" style={{ width: `${ratio}%` }} />
      </div>
    </Card>
  );
};
