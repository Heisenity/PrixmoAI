import { Card } from '../ui/card';
import { formatCompactNumber } from '../../lib/utils';

export const UsageMeter = ({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit: number | null;
}) => {
  const ratio = limit ? Math.min(100, (value / limit) * 100) : 12;

  return (
    <Card className="usage-meter">
      <div className="usage-meter__header">
        <span>{label}</span>
        <strong>
          {formatCompactNumber(value)}
          {limit ? ` / ${formatCompactNumber(limit)}` : ''}
        </strong>
      </div>
      <div className="usage-meter__track">
        <div className="usage-meter__fill" style={{ width: `${ratio}%` }} />
      </div>
    </Card>
  );
};
