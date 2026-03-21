import type { PropsWithChildren, ReactNode } from 'react';
import { APP_NAME } from '../../lib/constants';

export const AuthLayout = ({
  title,
  eyebrow,
  description,
  highlights = [],
  aside,
  children,
}: PropsWithChildren<{
  title: string;
  eyebrow: string;
  description?: string;
  highlights?: string[];
  aside?: ReactNode;
}>) => (
  <div className="auth-shell">
    <div className="auth-shell__ambient auth-shell__ambient--one" />
    <div className="auth-shell__ambient auth-shell__ambient--two" />
    <aside className="auth-shell__aside">
      <p className="section-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="auth-shell__copy">
        {description ||
          'Build faster content systems, AI image pipelines, scheduling, and measurement from one memory-driven workspace.'}
      </p>
      {highlights.length ? (
        <div className="auth-shell__highlights">
          {highlights.map((item) => (
            <span key={item} className="auth-shell__highlight">
              {item}
            </span>
          ))}
        </div>
      ) : null}
      <div className="auth-shell__mark">{APP_NAME}</div>
      {aside}
    </aside>
    <main className="auth-shell__form">{children}</main>
  </div>
);
