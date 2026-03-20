import { Card } from '../ui/card';

export const StatsCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) => (
  <Card className="stats-card">
    <p>{label}</p>
    <strong>{value}</strong>
    <span>{hint}</span>
  </Card>
);
