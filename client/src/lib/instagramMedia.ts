import type { SchedulerMediaType } from '../types';

export const INSTAGRAM_FEED_MIN_RATIO = 0.8;
export const INSTAGRAM_FEED_MAX_RATIO = 1.91;
export const INSTAGRAM_REELS_TARGET_RATIO = 9 / 16;
const INSTAGRAM_REELS_TOLERANCE = 0.08;

export type MediaDimensions = {
  width: number;
  height: number;
  aspectRatio: number;
  durationSeconds: number | null;
};

export type InstagramAspectValidation = {
  valid: boolean;
  ratio: number;
  reason: 'too_tall' | 'too_wide' | null;
};

export type InstagramPreparedImage = {
  file: File;
  width: number;
  height: number;
  aspectRatio: number;
  adjusted: boolean;
  originalWidth: number;
  originalHeight: number;
  originalAspectRatio: number;
  adjustmentMode: 'fit' | null;
  warning: string | null;
};

const createBlobUrl = (blob: Blob) => URL.createObjectURL(blob);

const revokeBlobUrl = (blobUrl: string) => {
  try {
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Ignore cleanup failures in the browser.
  }
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to read image dimensions.'));
    image.src = src;
  });

const drawContainedImage = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
) => {
  const scale = Math.min(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (targetWidth - width) / 2;
  const y = (targetHeight - height) / 2;

  ctx.drawImage(image, x, y, width, height);
};

const drawCoveredImage = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
) => {
  const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (targetWidth - width) / 2;
  const y = (targetHeight - height) / 2;

  ctx.drawImage(image, x, y, width, height);
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to prepare Instagram-compatible image.'));
          return;
        }

        resolve(blob);
      },
      type,
      quality
    );
  });

export const validateInstagramAspectRatio = (
  width: number,
  height: number
): InstagramAspectValidation => {
  const ratio = width / height;

  if (ratio >= INSTAGRAM_FEED_MIN_RATIO && ratio <= INSTAGRAM_FEED_MAX_RATIO) {
    return {
      valid: true,
      ratio,
      reason: null,
    };
  }

  return {
    valid: false,
    ratio,
    reason: ratio < INSTAGRAM_FEED_MIN_RATIO ? 'too_tall' : 'too_wide',
  };
};

export const isInstagramVideoRatioSupported = (width: number, height: number) => {
  const ratio = width / height;
  const feedValid = ratio >= INSTAGRAM_FEED_MIN_RATIO && ratio <= INSTAGRAM_FEED_MAX_RATIO;
  const reelsValid = Math.abs(ratio - INSTAGRAM_REELS_TARGET_RATIO) <= INSTAGRAM_REELS_TOLERANCE;

  return {
    valid: feedValid || reelsValid,
    ratio,
    message:
      feedValid || reelsValid
        ? null
        : 'Instagram videos should use a feed-safe aspect ratio between 4:5 and 1.91:1, or a reel-safe ratio close to 9:16.',
  };
};

export const readImageDimensionsFromBlob = async (blob: Blob): Promise<MediaDimensions> => {
  const blobUrl = createBlobUrl(blob);

  try {
    const image = await loadImage(blobUrl);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      aspectRatio: image.naturalWidth / image.naturalHeight,
      durationSeconds: null,
    };
  } finally {
    revokeBlobUrl(blobUrl);
  }
};

export const readVideoDimensionsFromBlob = async (blob: Blob): Promise<MediaDimensions> =>
  await new Promise((resolve, reject) => {
    const blobUrl = createBlobUrl(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      revokeBlobUrl(blobUrl);
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;

      cleanup();

      if (!width || !height) {
        reject(new Error('Failed to read video dimensions.'));
        return;
      }

      resolve({
        width,
        height,
        aspectRatio: width / height,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to read video dimensions.'));
    };

    video.src = blobUrl;
  });

export const fetchMediaBlob = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Unable to load media for Instagram validation.');
  }

  return await response.blob();
};

export const prepareInstagramCompatibleImage = async (
  blob: Blob,
  fileName: string,
  mimeType = 'image/jpeg'
): Promise<InstagramPreparedImage> => {
  const original = await readImageDimensionsFromBlob(blob);
  const validation = validateInstagramAspectRatio(original.width, original.height);

  if (validation.valid) {
    return {
      file: new File([blob], fileName, {
        type: mimeType || blob.type || 'image/jpeg',
      }),
      width: original.width,
      height: original.height,
      aspectRatio: original.aspectRatio,
      adjusted: false,
      originalWidth: original.width,
      originalHeight: original.height,
      originalAspectRatio: original.aspectRatio,
      adjustmentMode: null,
      warning: null,
    };
  }

  const imageUrl = createBlobUrl(blob);

  try {
    const image = await loadImage(imageUrl);
    const targetWidth = 1080;
    const targetHeight =
      validation.reason === 'too_tall' ? 1350 : Math.round(targetWidth / INSTAGRAM_FEED_MAX_RATIO);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to prepare Instagram-compatible image.');
    }

    ctx.save();
    ctx.filter = 'blur(36px) brightness(0.72)';
    drawCoveredImage(ctx, image, targetWidth, targetHeight);
    ctx.restore();

    ctx.fillStyle = 'rgba(6, 10, 16, 0.18)';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    drawContainedImage(ctx, image, targetWidth, targetHeight);

    const processedBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);

    return {
      file: new File([processedBlob], fileName.replace(/\.[^.]+$/, '') + '-instagram-fit.jpg', {
        type: 'image/jpeg',
      }),
      width: targetWidth,
      height: targetHeight,
      aspectRatio: targetWidth / targetHeight,
      adjusted: true,
      originalWidth: original.width,
      originalHeight: original.height,
      originalAspectRatio: original.aspectRatio,
      adjustmentMode: 'fit',
      warning:
        'This image was automatically fitted for Instagram so it publishes without aspect-ratio errors.',
    };
  } finally {
    revokeBlobUrl(imageUrl);
  }
};

export const getMediaDimensions = async (
  blob: Blob,
  mediaType: SchedulerMediaType
): Promise<MediaDimensions> => {
  if (mediaType === 'video') {
    return await readVideoDimensionsFromBlob(blob);
  }

  return await readImageDimensionsFromBlob(blob);
};
