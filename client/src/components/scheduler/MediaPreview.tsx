import { Image as ImageIcon, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { SchedulerMediaType } from '../../types';

export const MediaPreview = ({
  src,
  alt,
  mediaType,
  className,
}: {
  src?: string | null;
  alt: string;
  mediaType?: SchedulerMediaType | null;
  className?: string;
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const placeholderMessage = src && !mediaType
    ? 'No preview available for this link'
    : 'Preview unavailable';

  return (
    <div className={cn('media-preview', className)}>
      {src && mediaType && !hasError ? (
        mediaType === 'video' ? (
          <video
            src={src}
            controls
            playsInline
            preload="metadata"
            onError={() => setHasError(true)}
          />
        ) : (
          <img src={src} alt={alt} onError={() => setHasError(true)} />
        )
      ) : (
        <div className="media-preview__placeholder" role="img" aria-label={`${alt} unavailable`}>
          {mediaType === 'video' ? <Play size={18} /> : <ImageIcon size={18} />}
          <span>{placeholderMessage}</span>
        </div>
      )}
    </div>
  );
};
