import type { PropsWithChildren, ReactNode } from 'react';
import { APP_NAME } from '../../lib/constants';

export const AuthLayout = ({
  title,
  eyebrow,
  aside,
  children,
}: PropsWithChildren<{
  title: string;
  eyebrow: string;
  aside?: ReactNode;
}>) => (
  <div className="auth-shell">
    <aside className="auth-shell__aside">
      <p className="section-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="auth-shell__copy">
        Build faster content systems, AI image pipelines, scheduling, and measurement
        from one memory-driven workspace.
      </p>
      <div className="auth-shell__mark">{APP_NAME}</div>
      {aside}
    </aside>
    <main className="auth-shell__form">{children}</main>
  </div>
);
