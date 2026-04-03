import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
};

export const Input = ({ label, hint, error, className, id, ...props }: InputProps) => {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  return (
    <label className="field" htmlFor={inputId}>
      {label ? (
        <span className="field__label-row">
          <span className="field__label">{label}</span>
          {props.required ? (
            <>
              <span className="field__required" aria-hidden="true">
                ✦
              </span>
              <span className="sr-only">Required field</span>
            </>
          ) : null}
        </span>
      ) : null}
      <input
        id={inputId}
        className={cn('field__control', error && 'field__control--invalid', className)}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
};
