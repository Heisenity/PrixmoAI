import { Link2 } from 'lucide-react';
import { Button } from '../ui/button';

export const ConnectAccountButton = ({ disabled }: { disabled?: boolean }) => (
  <Button type="submit" size="lg" disabled={disabled}>
    <Link2 size={16} />
    Connect account
  </Button>
);
