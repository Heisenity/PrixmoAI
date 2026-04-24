import { useEffect, useMemo, useState } from 'react';
import { BlackHoleCanvas } from '../home/BlackHoleCanvas';
import { cn } from '../../lib/utils';

export const GenerationBlackHoleLoader = ({
  label,
  className,
  verboseMessages,
}: {
  label: string;
  className?: string;
  verboseMessages?: string[];
}) => {
  const sanitizedVerboseMessages = useMemo(
    () => verboseMessages?.map((message) => message.trim()).filter(Boolean) ?? [],
    [verboseMessages]
  );
  const verboseSignature = sanitizedVerboseMessages.join('||');
  const [activeVerboseIndex, setActiveVerboseIndex] = useState(0);

  useEffect(() => {
    setActiveVerboseIndex(0);
  }, [verboseSignature]);

  useEffect(() => {
    if (sanitizedVerboseMessages.length <= 1) {
      return;
    }

    let timeoutId: number | null = null;

    const tick = () => {
      timeoutId = window.setTimeout(() => {
        setActiveVerboseIndex((current) => (current + 1) % sanitizedVerboseMessages.length);
        tick();
      }, 1250 + Math.round(Math.random() * 650));
    };

    tick();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [sanitizedVerboseMessages]);

  const activeVerboseMessage = sanitizedVerboseMessages[activeVerboseIndex] ?? null;
  const visibleVerboseFeed = useMemo(() => {
    if (!sanitizedVerboseMessages.length) {
      return [];
    }

    return sanitizedVerboseMessages
      .map((message, index) => {
        if (index < activeVerboseIndex && index >= activeVerboseIndex - 2) {
          return {
            id: `${index}-${message}`,
            message,
            status: 'done' as const,
          };
        }

        if (index > activeVerboseIndex && index <= activeVerboseIndex + 1) {
          return {
            id: `${index}-${message}`,
            message,
            status: 'next' as const,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [activeVerboseIndex, sanitizedVerboseMessages]);

  return (
    <div className={cn('generation-blackhole-loader', className)}>
      <div className="generation-blackhole-loader__visual" aria-hidden="true">
        <BlackHoleCanvas
          className="generation-blackhole-loader__canvas"
          particleCount={18}
        />
      </div>
      <div className="generation-blackhole-loader__copy">
        <strong>PrixmoAI is generating</strong>
        <span>{label}</span>
        {activeVerboseMessage ? (
          <div className="generation-blackhole-loader__verbose" aria-live="polite">
            <div className="generation-blackhole-loader__verbose-head">
              <span className="generation-blackhole-loader__verbose-dot" aria-hidden="true" />
              <span
                key={activeVerboseMessage}
                className="generation-blackhole-loader__verbose-active-text"
              >
                {activeVerboseMessage}
              </span>
            </div>
            {visibleVerboseFeed.length > 1 ? (
              <div className="generation-blackhole-loader__verbose-feed">
                {visibleVerboseFeed.map((entry) =>
                  entry ? (
                    <div
                      key={entry.id}
                      className={cn(
                        'generation-blackhole-loader__verbose-step',
                        `generation-blackhole-loader__verbose-step--${entry.status}`
                      )}
                    >
                      <span
                        className="generation-blackhole-loader__verbose-step-dot"
                        aria-hidden="true"
                      />
                      <span>{entry.message}</span>
                    </div>
                  ) : null
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
