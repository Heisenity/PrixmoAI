import type { HTMLAttributes, PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

export const Badge = ({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>>) => (
  <span className={cn('badge', className)} {...props}>
    {children}
  </span>
);
