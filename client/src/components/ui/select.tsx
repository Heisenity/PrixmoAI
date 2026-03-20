import type { PropsWithChildren, SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type SelectProps = PropsWithChildren<
  SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
  }
>;

export const Select = ({
  children,
  className,
  label,
  ...props
}: SelectProps) => (
  <label className="field">
    {label ? <span className="field__label">{label}</span> : null}
    <select className={cn('field__control field__control--select', className)} {...props}>
      {children}
    </select>
  </label>
);
