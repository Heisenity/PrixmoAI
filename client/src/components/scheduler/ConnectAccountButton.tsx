import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '../ui/button';

export const ConnectAccountButton = ({
  disabled,
  label = 'Connect account',
  icon,
}: {
  disabled?: boolean;
  label?: string;
  icon?: ReactNode;
}) => (
  <Button type="submit" size="lg" disabled={disabled}>
    {icon || <Link2 size={16} />}
    {label}
  </Button>
);
