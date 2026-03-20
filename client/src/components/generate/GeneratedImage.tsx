import { ExternalLink } from 'lucide-react';
import { Card } from '../ui/card';
import type { GeneratedImage as GeneratedImageRecord } from '../../types';

export const GeneratedImage = ({ image }: { image: GeneratedImageRecord }) => (
  <Card className="generated-image-card">
    <div className="generated-image-card__header">
      <div>
        <p className="section-eyebrow">Generated image</p>
        <h3>{image.provider ? `Created with ${image.provider}` : 'Image ready'}</h3>
      </div>
      <a href={image.generatedImageUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={16} />
      </a>
    </div>
    <img src={image.generatedImageUrl} alt={image.prompt || image.backgroundStyle || image.id} />
    {image.prompt ? <p className="generated-image-card__prompt">{image.prompt}</p> : null}
  </Card>
);
