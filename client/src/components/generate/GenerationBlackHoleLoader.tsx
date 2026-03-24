import { BlackHoleCanvas } from '../home/BlackHoleCanvas';
import { cn } from '../../lib/utils';

export const GenerationBlackHoleLoader = ({
  label,
  className,
}: {
  label: string;
  className?: string;
}) => (
  <div className={cn('generation-blackhole-loader', className)}>
    <div className="generation-blackhole-loader__visual" aria-hidden="true">
      <BlackHoleCanvas
        className="generation-blackhole-loader__canvas"
        particleCount={18}
      />
    </div>
    <div className="generation-blackhole-loader__copy">
      <strong>PrixmoAI is generating</strong>
      <span>{label}</span>
    </div>
  </div>
);
