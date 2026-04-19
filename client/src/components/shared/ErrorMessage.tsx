import { X } from 'lucide-react';
import { getPlayfulErrorMessage, getPlayfulErrorTitle } from '../../lib/errorTone';
import { cn } from '../../lib/utils';

export const ErrorMessage = ({
  message,
  title,
  variant = 'inline',
  onDismiss,
  showRawInDev = false,
}: {
  message?: string | null;
  title?: string;
  variant?: 'inline' | 'toast';
  onDismiss?: (() => void) | null;
  showRawInDev?: boolean;
}) => {
  const displayMessage = getPlayfulErrorMessage(message);
  const rawMessage =
    typeof message === 'string' && message.trim() ? message.trim() : null;
  const shouldShowRawMessage =
    showRawInDev &&
    import.meta.env.DEV &&
    rawMessage &&
    rawMessage !== displayMessage;

  if (shouldShowRawMessage) {
    console.error('[PrixmoAI auth debug]', rawMessage);
  }

  return displayMessage ? (
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
            <strong>{getPlayfulErrorTitle(title, message)}</strong>
            <span>{displayMessage}</span>
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
        <>
          <span>{displayMessage}</span>
          {shouldShowRawMessage ? (
            <span className="message__dev-detail">Error Reason: {rawMessage}</span>
          ) : null}
        </>
      )}
    </div>
  ) : null;
};
