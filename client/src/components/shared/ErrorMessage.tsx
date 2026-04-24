import { X } from 'lucide-react';
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  getPlayfulErrorCode,
  getPlayfulErrorMessage,
  getPlayfulErrorTitle,
} from '../../lib/errorTone';
import { cn } from '../../lib/utils';

const activeErrorToastIds: string[] = [];
const errorToastListeners = new Set<() => void>();

const notifyErrorToastListeners = () => {
  errorToastListeners.forEach((listener) => listener());
};

const registerErrorToast = (id: string) => {
  if (!activeErrorToastIds.includes(id)) {
    activeErrorToastIds.push(id);
    notifyErrorToastListeners();
  }

  return () => {
    const nextIndex = activeErrorToastIds.indexOf(id);

    if (nextIndex >= 0) {
      activeErrorToastIds.splice(nextIndex, 1);
      notifyErrorToastListeners();
    }
  };
};

export const ErrorMessage = ({
  message,
  title,
  variant = 'toast',
  onDismiss,
  showCode = false,
  showDetails = false,
  showRawInDev = false,
}: {
  message?: string | null;
  title?: string;
  variant?: 'inline' | 'toast';
  onDismiss?: (() => void) | null;
  showCode?: boolean;
  showDetails?: boolean;
  showRawInDev?: boolean;
}) => {
  const toastId = useId();
  const [stackTick, setStackTick] = useState(0);
  const [isHidden, setIsHidden] = useState(false);
  const displayMessage = getPlayfulErrorMessage(message);
  const errorCode = getPlayfulErrorCode(message);
  const rawMessage =
    typeof message === 'string' && message.trim() ? message.trim() : null;
  const resolvedVariant = variant === 'inline' ? 'inline' : 'toast';
  const shouldShowRawMessage = Boolean(
    rawMessage &&
      rawMessage !== displayMessage &&
      (showDetails || (showRawInDev && import.meta.env.DEV))
  );
  const toastStackIndex =
    resolvedVariant === 'toast' && displayMessage
      ? Math.max(0, activeErrorToastIds.indexOf(toastId))
      : 0;

  if (showRawInDev && import.meta.env.DEV && rawMessage && rawMessage !== displayMessage) {
    console.error('[PrixmoAI auth debug]', rawMessage);
  }

  useEffect(() => {
    setIsHidden(false);
  }, [displayMessage]);

  useEffect(() => {
    if (!displayMessage || resolvedVariant !== 'toast') {
      return;
    }

    const syncStack = () => setStackTick((current) => current + 1);
    errorToastListeners.add(syncStack);
    const unregister = registerErrorToast(toastId);

    return () => {
      unregister();
      errorToastListeners.delete(syncStack);
    };
  }, [displayMessage, resolvedVariant, toastId]);

  const dismissToast = () => {
    setIsHidden(true);
    onDismiss?.();
  };

  useEffect(() => {
    if (!displayMessage || resolvedVariant !== 'toast' || isHidden) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dismissToast();
    }, 15000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [displayMessage, isHidden, resolvedVariant]);

  if (!displayMessage || isHidden) {
    return null;
  }

  const content = (
    <div
      className={cn(
        'message',
        'message--error',
        resolvedVariant === 'toast' && 'message--toast'
      )}
      role="alert"
      aria-live="polite"
      style={
        resolvedVariant === 'toast'
          ? ({
              '--message-toast-offset': `${toastStackIndex * 1.15}rem`,
              '--message-toast-stack': stackTick,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="message__body">
        {showCode && errorCode ? (
          <span className="message__error-code">Error code: {errorCode}</span>
        ) : null}
        {resolvedVariant === 'toast' ? (
          <strong className="message__title">
            {getPlayfulErrorTitle(title, message)}
          </strong>
        ) : null}
        <span className="message__copy">{displayMessage}</span>
        {shouldShowRawMessage ? (
          <span className="message__detail">Error message: {rawMessage}</span>
        ) : null}
      </div>
      {resolvedVariant === 'toast' ? (
        <button
          type="button"
          className="message__dismiss"
          onClick={dismissToast}
          aria-label="Dismiss message"
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  );

  if (resolvedVariant === 'toast' && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
};
