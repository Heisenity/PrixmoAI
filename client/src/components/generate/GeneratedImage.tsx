import { Download, ExternalLink, X, ZoomIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../lib/constants';
import { Card } from '../ui/card';
import type {
  GeneratedImage as GeneratedImageRecord,
  SchedulerGeneratedMediaIntent,
} from '../../types';
import {
  createRasterImageFileFromUrl,
  downloadRasterImageFromBlob,
  downloadRasterImageFromUrl,
} from '../../lib/generatedImageExport';
import { formatDateTime } from '../../lib/utils';
import { ScheduleGeneratedImageAction } from './ScheduleGeneratedImageAction';

export const GeneratedImage = ({
  image,
  showWatermark = false,
  scheduleIntent = null,
}: {
  image: GeneratedImageRecord;
  showWatermark?: boolean;
  scheduleIntent?: SchedulerGeneratedMediaIntent | null;
}) => {
  const { token } = useAuth();
  const [watermarkedAssetUrl, setWatermarkedAssetUrl] = useState<string | null>(null);
  const [isPreparingWatermark, setIsPreparingWatermark] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fetchServerWatermarkedImage = async (signal?: AbortSignal) => {
    if (!token) {
      throw new Error('Sign in again to download the watermarked image.');
    }

    const response = await fetch(`${API_BASE_URL}/api/images/${image.id}/watermarked`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal,
    });

    if (!response.ok) {
      throw new Error('Unable to prepare the watermarked image.');
    }

    return response.blob();
  };

  useEffect(() => {
    let nextObjectUrl: string | null = null;
    const controller = new AbortController();

    if (!showWatermark) {
      setWatermarkedAssetUrl(null);
      setIsPreparingWatermark(false);
      return () => undefined;
    }

    setIsPreparingWatermark(true);
    setWatermarkedAssetUrl(null);

    void (async () => {
      try {
        const file = await createRasterImageFileFromUrl({
          sourceUrl: image.generatedImageUrl,
          fileName: `prixmoai-watermarked-${image.id}.png`,
          watermark: true,
          signal: controller.signal,
        });
        nextObjectUrl = URL.createObjectURL(file);
        setWatermarkedAssetUrl(nextObjectUrl);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        try {
          const serverWatermarkedBlob = await fetchServerWatermarkedImage(
            controller.signal
          );
          nextObjectUrl = URL.createObjectURL(serverWatermarkedBlob);
          setWatermarkedAssetUrl(nextObjectUrl);
        } catch {
          if (!controller.signal.aborted) {
            setWatermarkedAssetUrl(null);
          }
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
  }, [image.generatedImageUrl, image.id, showWatermark, token]);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isPreviewOpen]);

  const previewUrl =
    showWatermark && watermarkedAssetUrl
      ? watermarkedAssetUrl
      : image.generatedImageUrl;
  const isDownloadDisabled = isDownloadingImage || (showWatermark && !token);
  const handleDownload = async () => {
    if (isDownloadDisabled) {
      return;
    }

    setIsDownloadingImage(true);

    try {
      await downloadRasterImageFromUrl({
        sourceUrl: image.generatedImageUrl,
        fileName: showWatermark
          ? `prixmoai-watermarked-${image.id}.png`
          : `prixmoai-generated-${image.id}.png`,
        watermark: showWatermark,
      });
    } catch {
      if (!showWatermark) {
        return;
      }

      try {
        const serverWatermarkedBlob = await fetchServerWatermarkedImage();
        await downloadRasterImageFromBlob({
          sourceBlob: serverWatermarkedBlob,
          fileName: `prixmoai-watermarked-${image.id}.png`,
          watermark: false,
        });
      } catch {
        // Keep the UI calm; the user can try again if the source image is temporarily unreachable.
      }
    } finally {
      setIsDownloadingImage(false);
    }
  };
  const handleOpenImage = () => {
    if (showWatermark) {
      if (watermarkedAssetUrl) {
        window.open(watermarkedAssetUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      setIsPreviewOpen(true);
      return;
    }

    window.open(image.generatedImageUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
    <Card className="generated-image-card">
      <div className="generated-image-card__header">
        <div>
          <p className="section-eyebrow">Generated image</p>
          <h3>Image ready</h3>
          <span className="generated-image-card__timestamp">
            {formatDateTime(image.createdAt)}
          </span>
        </div>
        <div className="generated-image-card__actions">
          {scheduleIntent ? (
            <ScheduleGeneratedImageAction intent={scheduleIntent} />
          ) : null}
          <button
            type="button"
            className="generated-image-card__action"
            onClick={() => setIsPreviewOpen(true)}
            aria-label="Preview generated image"
            title="Preview image"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className="generated-image-card__action"
            onClick={() => {
              void handleDownload();
            }}
            disabled={isDownloadDisabled}
            aria-label="Download generated image"
            title={
              showWatermark
                ? isPreparingWatermark
                  ? 'Download PNG with PrixmoAI watermark'
                  : 'Download PNG with PrixmoAI watermark'
                : 'Download PNG image'
            }
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="generated-image-card__action"
            onClick={handleOpenImage}
            aria-label="Open generated image"
            title={
              showWatermark && !watermarkedAssetUrl
                ? 'Preview watermarked image'
                : 'Open image'
            }
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
      <div className="generated-image-card__media">
        {showWatermark && !watermarkedAssetUrl ? (
          <span className="generated-image-card__watermark">PRIXMOAI</span>
        ) : null}
        <img src={previewUrl} alt="Generated visual preview" />
      </div>
    </Card>
    {isPreviewOpen ? (
      <div
        className="generated-image-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Generated image preview"
      >
        <button
          type="button"
          className="generated-image-lightbox__backdrop"
          onClick={() => setIsPreviewOpen(false)}
          aria-label="Close image preview"
        />
        <div className="generated-image-lightbox__panel">
          <div className="generated-image-lightbox__header">
            <div>
              <p className="section-eyebrow">Review image</p>
              <h3>{image.prompt?.trim() ? 'Generated visual' : 'Image preview'}</h3>
            </div>
            <button
              type="button"
              className="generated-image-card__action"
              onClick={() => setIsPreviewOpen(false)}
              aria-label="Close image preview"
            >
              <X size={16} />
            </button>
          </div>
          <div className="generated-image-lightbox__media">
            {showWatermark && !watermarkedAssetUrl ? (
              <span className="generated-image-card__watermark">PRIXMOAI</span>
            ) : null}
            <img src={previewUrl} alt="Generated visual preview" />
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
};
