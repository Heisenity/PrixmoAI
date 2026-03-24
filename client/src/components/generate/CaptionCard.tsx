import { Card } from '../ui/card';
import type { CaptionVariant } from '../../types';

export const CaptionCard = ({
  caption,
  index,
}: {
  caption: CaptionVariant;
  index: number;
}) => (
  <Card className="caption-card">
    <span>{`Variation ${index + 1}`}</span>
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
