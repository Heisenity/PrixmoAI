import { Card } from '../ui/card';

export const CaptionCard = ({
  caption,
  index,
}: {
  caption: string;
  index: number;
}) => (
  <Card className="caption-card">
    <span>{`Variation ${index + 1}`}</span>
    <p>{caption}</p>
  </Card>
);
