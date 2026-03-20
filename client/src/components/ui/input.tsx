import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export const Input = ({ label, hint, className, id, ...props }: InputProps) => (
  <label className="field">
    {label ? <span className="field__label">{label}</span> : null}
    <input id={id} className={cn('field__control', className)} {...props} />
    {hint ? <span className="field__hint">{hint}</span> : null}
  </label>
);
