import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { CaptionVariant } from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';
import { CaptionCard } from './CaptionCard';

export const CaptionList = ({
  captions,
  onFeedback,
  onReuse,
  feedbackResetKey,
  onRegenerateAllRejected,
  isRegeneratingAllRejected = false,
}: {
  captions: CaptionVariant[];
  onFeedback?: (
    sourceKey: string,
    eventType: 'accepted' | 'rejected',
    caption: CaptionVariant,
    index: number
  ) => void | Promise<void>;
  onReuse?: (sourceKey: string) => void | Promise<void>;
  feedbackResetKey?: string | null;
  onRegenerateAllRejected?: () => void | Promise<void>;
  isRegeneratingAllRejected?: boolean;
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [feedbackStateByKey, setFeedbackStateByKey] = useState<
    Record<string, 'accepted' | 'rejected'>
  >({});
  const reuseLoggedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!feedbackResetKey) {
      return;
    }

    setFeedbackStateByKey((current) => {
      if (!(feedbackResetKey in current)) {
        return current;
      }

      const next = { ...current };
      delete next[feedbackResetKey];
      return next;
    });
  }, [feedbackResetKey]);

  const getSourceKey = (index: number) => `caption-${index + 1}`;

  const handleCopyAll = async () => {
    const didCopy = await copyTextToClipboard(
      captions
        .map(
          (caption, index) =>
            [
              `Variation ${index + 1}`,
              `Hook: ${caption.hook}`,
              `Main copy: ${caption.mainCopy}`,
              `Short caption: ${caption.shortCaption}`,
              `CTA: ${caption.cta}`,
            ].join('\n')
        )
        .join('\n\n')
    );

    if (!didCopy) {
      return;
    }

    setIsCopied(true);
    captions.forEach((_, index) => {
      const sourceKey = getSourceKey(index);

      if (reuseLoggedKeysRef.current.has(sourceKey)) {
        return;
      }

      reuseLoggedKeysRef.current.add(sourceKey);
      void onReuse?.(sourceKey);
    });
    window.setTimeout(() => setIsCopied(false), 1800);
  };

  const handleFeedback = async (
    sourceKey: string,
    eventType: 'accepted' | 'rejected',
    caption: CaptionVariant,
    index: number
  ) => {
    if (feedbackStateByKey[sourceKey] === eventType) {
      return;
    }

    setFeedbackStateByKey((current) => {
      if (current[sourceKey] === eventType) {
        return current;
      }

      const next =
        eventType === 'accepted'
          ? Object.fromEntries(
              Object.entries(current).filter(([, state]) => state === 'rejected')
            )
          : { ...current };

      return {
        ...next,
        [sourceKey]: eventType,
      };
    });

    await onFeedback?.(sourceKey, eventType, caption, index);
  };

  const handleReuse = async (sourceKey: string) => {
    if (reuseLoggedKeysRef.current.has(sourceKey)) {
      return;
    }

    reuseLoggedKeysRef.current.add(sourceKey);
    await onReuse?.(sourceKey);
  };

  const handleUndo = (sourceKey: string) => {
    setFeedbackStateByKey((current) => {
      if (!(sourceKey in current)) {
        return current;
      }

      const next = { ...current };
      delete next[sourceKey];
      return next;
    });
  };

  const isAllRejected =
    captions.length > 0 &&
    captions.every(
      (_, index) => feedbackStateByKey[getSourceKey(index)] === 'rejected'
    );

  return (
    <div className="caption-list-block">
      <div className="caption-list-block__header">
        <div>
          <p className="section-eyebrow">Copy pack</p>
          <h3>Caption variations</h3>
        </div>
        <button
          type="button"
          className="asset-copy-button"
          onClick={() => void handleCopyAll()}
          aria-label="Copy all caption variations"
        >
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
          {isCopied ? 'Copied' : 'Copy all'}
        </button>
      </div>
      <div className="caption-list">
        {captions.map((caption, index) => (
          <CaptionCard
            key={`${index}-${caption.hook.slice(0, 24)}`}
            caption={caption}
            index={index}
            feedbackState={feedbackStateByKey[getSourceKey(index)] ?? null}
            onAccept={() =>
              void handleFeedback(getSourceKey(index), 'accepted', caption, index)
            }
            onReject={() =>
              void handleFeedback(getSourceKey(index), 'rejected', caption, index)
            }
            onUndo={() => handleUndo(getSourceKey(index))}
            onCopy={() => void handleReuse(getSourceKey(index))}
          />
        ))}
      </div>
      {isAllRejected ? (
        <div className="caption-list__recovery">
          <div className="caption-list__recovery-copy">
            <strong>All variations were rejected</strong>
            <span>Regenerate a stronger set with fresher hooks and clearer fit.</span>
          </div>
          <button
            type="button"
            className="caption-feedback-button caption-feedback-button--accepted"
            onClick={() => void onRegenerateAllRejected?.()}
            disabled={isRegeneratingAllRejected}
          >
            {isRegeneratingAllRejected ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      ) : null}
    </div>
  );
};
