import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const ErrorMessage = ({
  message,
  title,
  variant = 'inline',
  onDismiss,
}: {
  message?: string | null;
  title?: string;
  variant?: 'inline' | 'toast';
  onDismiss?: (() => void) | null;
}) =>
  message ? (
    <div
      className={cn(
        'message',
        'message--error',
        variant === 'toast' && 'message--toast'
      )}
      role="alert"
      aria-live="polite"
    >
      {variant === 'toast' ? (
        <>
          <div className="message__toast-copy">
            <strong>{title || 'Something went wrong'}</strong>
            <span>{message}</span>
          </div>
          {onDismiss ? (
            <button
              type="button"
              className="message__dismiss"
              onClick={onDismiss}
              aria-label="Dismiss message"
            >
              <X size={16} />
            </button>
          ) : null}
        </>
      ) : (
        message
      )}
    </div>
  ) : null;
