import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '../../lib/clipboard';

export const HashtagDisplay = ({ hashtags }: { hashtags: string[] }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyHashtags = async () => {
    const didCopy = await copyTextToClipboard(hashtags.join(' '));

    if (!didCopy) {
      return;
    }

    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1800);
  };

  return (
    <div className="asset-block">
      <div className="asset-block__header">
        <div>
          <p className="section-eyebrow">Hashtags</p>
          <h3>Ready to post</h3>
        </div>
        <button
          type="button"
          className="asset-copy-button"
          onClick={() => void handleCopyHashtags()}
          aria-label="Copy hashtags"
        >
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
          {isCopied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="hashtag-cloud">
        {hashtags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
};
