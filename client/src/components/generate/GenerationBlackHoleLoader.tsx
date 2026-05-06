import { useEffect, useMemo, useState } from 'react';
import { BlackHoleCanvas } from '../home/BlackHoleCanvas';
import { cn } from '../../lib/utils';

const sanitizeGenerationStatusMessage = (message: string) =>
  message
    .replace(/\bGenerating with\s+(?:gemini|groq|pixazo|tavily|apify)\.?/giu, 'Generating your result.')
    .replace(/\bGenerated the content with\s+(?:gemini|groq)\.?/giu, 'Content is ready.')
    .replace(/\bImage generated successfully using\s+(?:gemini|groq|pixazo)\.?/giu, 'Image generated successfully.')
    .trim();

export const GenerationBlackHoleLoader = ({
  label,
  className,
  verboseMessages,
  preferLatestVerboseMessage = false,
}: {
  label: string;
  className?: string;
  verboseMessages?: string[];
  preferLatestVerboseMessage?: boolean;
}) => {
  const sanitizedVerboseMessages = useMemo(
    () =>
      verboseMessages
        ?.map((message) => sanitizeGenerationStatusMessage(message.trim()))
        .filter(Boolean) ?? [],
    [verboseMessages]
  );
  const verboseSignature = sanitizedVerboseMessages.join('||');
  const [activeVerboseIndex, setActiveVerboseIndex] = useState(0);

  useEffect(() => {
    setActiveVerboseIndex(
      preferLatestVerboseMessage
        ? Math.max(0, sanitizedVerboseMessages.length - 1)
        : 0
    );
  }, [preferLatestVerboseMessage, sanitizedVerboseMessages.length, verboseSignature]);

  useEffect(() => {
    if (preferLatestVerboseMessage || sanitizedVerboseMessages.length <= 1) {
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
  }, [preferLatestVerboseMessage, sanitizedVerboseMessages]);

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
