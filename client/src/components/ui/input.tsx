import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { ErrorMessage } from '../shared/ErrorMessage';
import { getPlayfulErrorMessage } from '../../lib/errorTone';
import { cn } from '../../lib/utils';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
};

export const Input = ({ label, hint, error, className, id, ...props }: InputProps) => {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const displayError = getPlayfulErrorMessage(error);

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
        className={cn('field__control', displayError && 'field__control--invalid', className)}
        aria-invalid={Boolean(displayError)}
        {...props}
      />
      {displayError ? (
        <ErrorMessage message={displayError} />
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </label>
  );
};
