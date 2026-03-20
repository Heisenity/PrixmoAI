import { CaptionCard } from './CaptionCard';

export const CaptionList = ({ captions }: { captions: string[] }) => (
  <div className="caption-list">
    {captions.map((caption, index) => (
      <CaptionCard key={`${index}-${caption.slice(0, 24)}`} caption={caption} index={index} />
    ))}
  </div>
);
