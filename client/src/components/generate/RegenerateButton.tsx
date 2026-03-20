import { RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';

export const RegenerateButton = ({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Button type="button" variant="secondary" onClick={onClick} disabled={disabled}>
    <RotateCcw size={16} />
    Regenerate
  </Button>
);
