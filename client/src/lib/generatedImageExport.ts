const RASTER_IMAGE_TYPE = 'image/png';

const sanitizeRasterFileName = (value: string, fallback = 'prixmoai-image') => {
  const withoutExtension = value
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${withoutExtension || fallback}.png`;
};

const loadImageFromBlob = (blob: Blob, signal?: AbortSignal) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      signal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Image loading was cancelled.', 'AbortError'));
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('PrixmoAI could not read this image for export.'));
    };

    signal?.addEventListener('abort', handleAbort);
    image.src = objectUrl;
  });

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
};

const drawPrixmoAiWatermark = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  const smallestSide = Math.max(1, Math.min(width, height));
  const fontSize = Math.max(18, Math.round(smallestSide * 0.045));
  const label = 'PRIXMOAI';
  const padding = Math.max(16, Math.round(fontSize * 0.9));
  const radius = Math.max(16, Math.round(fontSize * 0.85));

  context.save();
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  context.textBaseline = 'middle';

  const metrics = context.measureText(label);
  const boxWidth = Math.ceil(metrics.width + padding * 2);
  const boxHeight = Math.ceil(fontSize + padding * 1.2);
  const x = Math.max(padding, width - boxWidth - padding);
  const y = Math.max(padding, height - boxHeight - padding);

  drawRoundedRect(context, x, y, boxWidth, boxHeight, radius);
  context.fillStyle = 'rgba(5, 12, 24, 0.68)';
  context.fill();
  context.lineWidth = Math.max(1, Math.round(fontSize * 0.05));
  context.strokeStyle = 'rgba(255, 255, 255, 0.52)';
  context.stroke();
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.fillText(label, x + padding, y + boxHeight / 2);
  context.restore();
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PrixmoAI could not prepare the PNG file.'));
        return;
      }

      resolve(blob);
    }, RASTER_IMAGE_TYPE);
  });

export const createRasterImageFileFromBlob = async ({
  sourceBlob,
  fileName,
  watermark = false,
  signal,
}: {
  sourceBlob: Blob;
  fileName: string;
  watermark?: boolean;
  signal?: AbortSignal;
}) => {
  const image = await loadImageFromBlob(sourceBlob, signal);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error('PrixmoAI could not read the generated image size.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('PrixmoAI could not prepare the image canvas.');
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  if (watermark) {
    drawPrixmoAiWatermark(context, width, height);
  }

  const pngBlob = await canvasToPngBlob(canvas);

  return new File([pngBlob], sanitizeRasterFileName(fileName), {
    type: RASTER_IMAGE_TYPE,
    lastModified: Date.now(),
  });
};

export const createRasterImageFileFromUrl = async ({
  sourceUrl,
  fileName,
  watermark = false,
  signal,
}: {
  sourceUrl: string;
  fileName: string;
  watermark?: boolean;
  signal?: AbortSignal;
}) => {
  const response = await fetch(sourceUrl, { signal });

  if (!response.ok) {
    throw new Error('PrixmoAI could not download this image for export.');
  }

  return createRasterImageFileFromBlob({
    sourceBlob: await response.blob(),
    fileName,
    watermark,
    signal,
  });
};

export const downloadRasterImageFromUrl = async ({
  sourceUrl,
  fileName,
  watermark = false,
}: {
  sourceUrl: string;
  fileName: string;
  watermark?: boolean;
}) => {
  const file = await createRasterImageFileFromUrl({
    sourceUrl,
    fileName,
    watermark,
  });
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};

export const downloadRasterImageFile = (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};

export const downloadRasterImageFromBlob = async ({
  sourceBlob,
  fileName,
  watermark = false,
}: {
  sourceBlob: Blob;
  fileName: string;
  watermark?: boolean;
}) => {
  const file = await createRasterImageFileFromBlob({
    sourceBlob,
    fileName,
    watermark,
  });

  downloadRasterImageFile(file);
};
