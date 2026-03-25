import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { ReelScript as ReelScriptType } from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';
import { Card } from '../ui/card';

export const ReelScript = ({ script }: { script: ReelScriptType }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyScript = async () => {
    const didCopy = await copyTextToClipboard(
      [`Hook: ${script.hook}`, `Body: ${script.body}`, `CTA: ${script.cta}`].join(
        '\n'
      )
    );

    if (!didCopy) {
      return;
    }

    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1800);
  };

  return (
    <Card className="script-card">
      <div className="asset-block__header">
        <div>
          <p className="section-eyebrow">Reel script</p>
          <h3>Video-ready structure</h3>
        </div>
        <button
          type="button"
          className="asset-copy-button"
          onClick={() => void handleCopyScript()}
          aria-label="Copy reel script"
        >
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
          {isCopied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div>
        <p className="section-eyebrow">Hook</p>
        <h4>{script.hook}</h4>
      </div>
      <div>
        <p className="section-eyebrow">Body</p>
        <p>{script.body}</p>
      </div>
      <div>
        <p className="section-eyebrow">Call to action</p>
        <p>{script.cta}</p>
      </div>
    </Card>
  );
};
