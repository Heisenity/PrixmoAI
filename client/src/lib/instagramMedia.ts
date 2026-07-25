import type { SchedulerMediaType } from '../types';

export const INSTAGRAM_FEED_MIN_RATIO = 0.8;
export const INSTAGRAM_FEED_MAX_RATIO = 1.91;
export const INSTAGRAM_REELS_TARGET_RATIO = 9 / 16;
const INSTAGRAM_REELS_TOLERANCE = 0.08;
const MEDIA_METADATA_TIMEOUT_MS = 20_000;
const SCHEDULER_ALLOWED_MEDIA_BY_MIME = {
  'image/jpeg': { mediaType: 'image', extension: 'jpg' },
  'image/png': { mediaType: 'image', extension: 'png' },
  'image/webp': { mediaType: 'image', extension: 'webp' },
  'video/mp4': { mediaType: 'video', extension: 'mp4' },
  'video/quicktime': { mediaType: 'video', extension: 'mov' },
} as const satisfies Record<
  string,
  { mediaType: SchedulerMediaType; extension: string }
>;
const SCHEDULER_ALLOWED_MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
} as const;

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

export type NormalizedSchedulerMediaFile = {
  file: File;
  mediaType: SchedulerMediaType;
  contentType: keyof typeof SCHEDULER_ALLOWED_MEDIA_BY_MIME;
  extension: string | null;
  wasMimeTypeInferred: boolean;
};

const getFileExtension = (fileName: string) => {
  const match = /\.([^.]+)$/.exec(fileName.trim().toLowerCase());
  return match?.[1] ?? null;
};

export const normalizeSchedulerMediaFile = (file: File): NormalizedSchedulerMediaFile => {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.trim().toLowerCase();
  const mimeDescriptor =
    SCHEDULER_ALLOWED_MEDIA_BY_MIME[
      mimeType as keyof typeof SCHEDULER_ALLOWED_MEDIA_BY_MIME
    ];
  const extensionMimeType = extension
    ? SCHEDULER_ALLOWED_MIME_BY_EXTENSION[
        extension as keyof typeof SCHEDULER_ALLOWED_MIME_BY_EXTENSION
      ]
    : null;

  if (mimeType) {
    if (!mimeDescriptor) {
      throw new Error('Only JPG, PNG, WEBP, MP4, and MOV media are supported.');
    }

    if (
      extensionMimeType &&
      extensionMimeType !== mimeType
    ) {
      throw new Error('The file extension does not match the selected media type.');
    }

    return {
      file,
      mediaType: mimeDescriptor.mediaType,
      contentType: mimeType as keyof typeof SCHEDULER_ALLOWED_MEDIA_BY_MIME,
      extension,
      wasMimeTypeInferred: false,
    };
  }

  if (!extensionMimeType) {
    throw new Error('Only JPG, PNG, WEBP, MP4, and MOV media are supported.');
  }

  const inferredFile = new File([file], file.name, {
    type: extensionMimeType,
    lastModified: file.lastModified,
  });

  return {
    file: inferredFile,
    mediaType: SCHEDULER_ALLOWED_MEDIA_BY_MIME[extensionMimeType].mediaType,
    contentType: extensionMimeType,
    extension,
    wasMimeTypeInferred: true,
  };
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
    if (/^https?:/i.test(src)) {
      image.crossOrigin = 'anonymous';
    }
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

const withTimeout = <T>(promise: Promise<T>, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), MEDIA_METADATA_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
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
  if (typeof createImageBitmap === 'function') {
    const bitmap = await withTimeout(
      createImageBitmap(blob),
      'Media preview timed out while reading image dimensions.'
    );

    try {
      return {
        width: bitmap.width,
        height: bitmap.height,
        aspectRatio: bitmap.width / bitmap.height,
        durationSeconds: null,
      };
    } finally {
      bitmap.close();
    }
  }

  const blobUrl = createBlobUrl(blob);

  try {
    const image = await withTimeout(
      loadImage(blobUrl),
      'Media preview timed out while reading image dimensions.'
    );
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
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Media preview timed out while reading video dimensions.'));
    }, MEDIA_METADATA_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      revokeBlobUrl(blobUrl);
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;

      cleanup();

      if (!width || !height) {
        reject(new Error('Failed to read video dimensions.'));
        return;
      }

      resolve({
        width,
        height,
        aspectRatio: width / height,
        durationSeconds,
      });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to read video dimensions.'));
    };

    video.src = blobUrl;
  });

export const fetchMediaBlob = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });

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
    const image = await withTimeout(
      loadImage(imageUrl),
      'Media preview timed out while preparing the Instagram image.'
    );
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

    const processedBlob = await withTimeout(
      canvasToBlob(canvas, 'image/jpeg', 0.92),
      'Media preview timed out while preparing the Instagram image.'
    );

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
