import { Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../lib/constants';
import { Card } from '../ui/card';
import type { GeneratedImage as GeneratedImageRecord } from '../../types';

export const GeneratedImage = ({
  image,
  showWatermark = false,
}: {
  image: GeneratedImageRecord;
  showWatermark?: boolean;
}) => {
  const { token } = useAuth();
  const [watermarkedAssetUrl, setWatermarkedAssetUrl] = useState<string | null>(null);
  const [isPreparingWatermark, setIsPreparingWatermark] = useState(false);

  useEffect(() => {
    let nextObjectUrl: string | null = null;
    const controller = new AbortController();

    if (!showWatermark || !token) {
      setWatermarkedAssetUrl(null);
      setIsPreparingWatermark(false);
      return () => undefined;
    }

    setIsPreparingWatermark(true);
    setWatermarkedAssetUrl(null);

    void (async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/images/${image.id}/watermarked`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error('Unable to prepare the watermarked image.');
        }

        const blob = await response.blob();
        nextObjectUrl = URL.createObjectURL(blob);
        setWatermarkedAssetUrl(nextObjectUrl);
      } catch {
        if (!controller.signal.aborted) {
          setWatermarkedAssetUrl(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsPreparingWatermark(false);
        }
      }
    })();

    return () => {
      controller.abort();

      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [image.id, showWatermark, token]);

  const previewUrl =
    showWatermark && watermarkedAssetUrl
      ? watermarkedAssetUrl
      : image.generatedImageUrl;
  const actionUrl =
    showWatermark && watermarkedAssetUrl
      ? watermarkedAssetUrl
      : !showWatermark
        ? image.generatedImageUrl
        : null;

  return (
    <Card className="generated-image-card">
      <div className="generated-image-card__header">
        <div>
          <p className="section-eyebrow">Generated image</p>
          <h3>Image ready</h3>
        </div>
        <div className="generated-image-card__actions">
          {actionUrl ? (
            <>
              <a
                className="generated-image-card__action"
                href={actionUrl}
                download={
                  showWatermark ? `prixmoai-watermarked-${image.id}.svg` : undefined
                }
                target="_blank"
                rel="noreferrer"
                aria-label="Download generated image"
                title="Download image"
              >
                <Download size={16} />
              </a>
              <a
                className="generated-image-card__action"
                href={actionUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open generated image"
                title="Open image"
              >
                <ExternalLink size={16} />
              </a>
            </>
          ) : (
            <>
              <button
                type="button"
                className="generated-image-card__action generated-image-card__action--disabled"
                disabled
                aria-label="Preparing watermarked image"
                title={
                  isPreparingWatermark
                    ? 'Preparing watermarked image'
                    : 'Watermarked image unavailable'
                }
              >
                <Download size={16} />
              </button>
              <button
                type="button"
                className="generated-image-card__action generated-image-card__action--disabled"
                disabled
                aria-label="Preparing watermarked image"
                title={
                  isPreparingWatermark
                    ? 'Preparing watermarked image'
                    : 'Watermarked image unavailable'
                }
              >
                <ExternalLink size={16} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="generated-image-card__media">
        {showWatermark && !watermarkedAssetUrl ? (
          <span className="generated-image-card__watermark">PRIXMOAI</span>
        ) : null}
        <img src={previewUrl} alt="Generated visual preview" />
      </div>
    </Card>
  );
};
