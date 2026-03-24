import { forwardRef } from 'react';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    glow?: boolean;
  }
>;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, glow = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('surface-card', glow && 'surface-card--glow', className)}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = 'Card';
