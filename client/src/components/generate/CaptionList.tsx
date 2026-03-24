import type { CaptionVariant } from '../../types';
import { CaptionCard } from './CaptionCard';

export const CaptionList = ({ captions }: { captions: CaptionVariant[] }) => (
  <div className="caption-list">
    {captions.map((caption, index) => (
      <CaptionCard
        key={`${index}-${caption.hook.slice(0, 24)}`}
        caption={caption}
        index={index}
      />
    ))}
  </div>
);
