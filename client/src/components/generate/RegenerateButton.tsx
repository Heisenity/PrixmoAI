import { RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';

export const RegenerateButton = ({
  onClick,
  disabled,
  size = 'md',
}: {
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) => (
  <Button
    type="button"
    variant="secondary"
    size={size}
    onClick={onClick}
    disabled={disabled}
  >
    <RotateCcw size={16} />
    Regenerate
  </Button>
);
