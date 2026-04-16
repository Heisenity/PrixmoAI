import type { PropsWithChildren, ReactNode } from 'react';
import { APP_NAME } from '../../lib/constants';

export const AuthLayout = ({
  title,
  eyebrow,
  description,
  highlights = [],
  aside,
  background,
  hideIntro = false,
  showBrandMark = true,
  children,
}: PropsWithChildren<{
  title: string;
  eyebrow: string;
  description?: string;
  highlights?: string[];
  aside?: ReactNode;
  background?: ReactNode;
  hideIntro?: boolean;
  showBrandMark?: boolean;
}>) => (
  <div className={`auth-shell${hideIntro ? ' auth-shell--intro-hidden' : ''}`}>
    {background}
    <div className="auth-shell__ambient auth-shell__ambient--one" />
    <div className="auth-shell__ambient auth-shell__ambient--two" />
    {!hideIntro || showBrandMark || aside ? (
      <aside className="auth-shell__aside">
        {!hideIntro ? (
          <>
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
          </>
        ) : null}
        {showBrandMark ? <div className="auth-shell__mark">{APP_NAME}</div> : null}
        {aside}
      </aside>
    ) : null}
    <main className={`auth-shell__form${hideIntro ? ' auth-shell__form--solo' : ''}`}>
      {children}
    </main>
  </div>
);
