import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Card } from '../ui/card';
import type { CaptionVariant } from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';

export const CaptionCard = ({
  caption,
  index,
}: {
  caption: CaptionVariant;
  index: number;
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyCard = async () => {
    const didCopy = await copyTextToClipboard(
      [
        `Variation ${index + 1}`,
        `Hook: ${caption.hook}`,
        `Main copy: ${caption.mainCopy}`,
        `Short caption: ${caption.shortCaption}`,
        `CTA: ${caption.cta}`,
      ].join('\n')
    );

    if (!didCopy) {
      return;
    }

    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1800);
  };

  return (
    <Card className="caption-card">
      <div className="caption-card__header">
        <span>{`Variation ${index + 1}`}</span>
        <button
          type="button"
          className="asset-copy-button asset-copy-button--subtle"
          onClick={() => void handleCopyCard()}
          aria-label={`Copy variation ${index + 1}`}
        >
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
          {isCopied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="caption-card__section">
        <small>Hook</small>
        <strong>{caption.hook}</strong>
      </div>
      <div className="caption-card__section">
        <small>Main copy</small>
        <p>{caption.mainCopy}</p>
      </div>
      <div className="caption-card__section">
        <small>Short caption</small>
        <p>{caption.shortCaption}</p>
      </div>
      <div className="caption-card__section">
        <small>CTA</small>
        <p>{caption.cta}</p>
      </div>
    </Card>
  );
};
