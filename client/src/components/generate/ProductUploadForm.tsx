import type { FormHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';

type ProductUploadFormProps = PropsWithChildren<
  FormHTMLAttributes<HTMLFormElement> & {
    eyebrow: string;
    title: string;
    description: string;
    submitLabel: string;
    footer?: ReactNode;
    busy?: boolean;
  }
>;

export const ProductUploadForm = ({
  eyebrow,
  title,
  description,
  submitLabel,
  footer,
  busy,
  children,
  ...props
}: ProductUploadFormProps) => (
  <Card className="generator-form">
    <div className="generator-form__header">
      <p className="section-eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <form className="form-grid" {...props}>
      {children}
      <div className="field field--full generator-form__footer">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Working...' : submitLabel}
        </Button>
        {footer}
      </div>
    </form>
  </Card>
);
