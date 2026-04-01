import { Image as ImageIcon, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { SchedulerMediaType } from '../../types';

export const MediaThumbnail = ({
  src,
  alt,
  mediaType,
  size = 'md',
  className,
}: {
  src?: string | null;
  alt: string;
  mediaType?: SchedulerMediaType | null;
  size?: 'sm' | 'md';
  className?: string;
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  return (
    <div
      className={cn(
        'media-thumbnail',
        mediaType === 'video' && 'media-thumbnail--video',
        size === 'sm' ? 'media-thumbnail--sm' : 'media-thumbnail--md',
        className
      )}
      aria-hidden={!src || hasError}
    >
      {src && mediaType && !hasError ? (
        mediaType === 'video' ? (
          <>
            <video src={src} muted playsInline preload="metadata" onError={() => setHasError(true)} />
            <span className="media-thumbnail__badge" aria-hidden="true">
              <Play size={12} fill="currentColor" />
            </span>
          </>
        ) : (
          <>
            <img src={src} alt={alt} onError={() => setHasError(true)} />
            <span className="media-thumbnail__badge" aria-hidden="true">
              <ImageIcon size={12} />
            </span>
          </>
        )
      ) : (
        <ImageIcon size={16} />
      )}
    </div>
  );
};
