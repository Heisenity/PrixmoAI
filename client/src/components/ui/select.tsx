import { useId } from 'react';
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
  id,
  label,
  ...props
}: SelectProps) => {
  const fallbackId = useId();
  const selectId = id ?? fallbackId;

  return (
    <label className="field" htmlFor={selectId}>
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
      <select
        id={selectId}
        className={cn('field__control field__control--select', className)}
        {...props}
      >
        {children}
      </select>
    </label>
  );
};
