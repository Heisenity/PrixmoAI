import type { HTMLAttributes, PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    glow?: boolean;
  }
>;

export const Card = ({ children, className, glow = false, ...props }: CardProps) => (
  <div className={cn('surface-card', glow && 'surface-card--glow', className)} {...props}>
    {children}
  </div>
);
