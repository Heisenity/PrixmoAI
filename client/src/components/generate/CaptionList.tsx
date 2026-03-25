import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { CaptionVariant } from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';
import { CaptionCard } from './CaptionCard';

export const CaptionList = ({ captions }: { captions: CaptionVariant[] }) => {
  const [isCopied, setIsCopied] = useState(false);

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
    window.setTimeout(() => setIsCopied(false), 1800);
  };

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
          />
        ))}
      </div>
    </div>
  );
};
