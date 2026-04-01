import path from 'path';
import { SUPABASE_SOURCE_IMAGE_BUCKET } from '../config/constants';
import type { SchedulerMediaType } from '../types';
import { requireSupabaseAdmin } from '../db/supabase';

const MAX_SOURCE_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_SOURCE_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_SOURCE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_SOURCE_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
const ALLOWED_SOURCE_MEDIA_TYPES = new Set([
  ...ALLOWED_SOURCE_IMAGE_TYPES,
  ...ALLOWED_SOURCE_VIDEO_TYPES,
]);

const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/;
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
const IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi;
const HTML_ATTRIBUTE_PATTERN =
  /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

type UploadSourceImageInput = {
  fileName: string;
  contentType: string;
  dataUrl: string;
};

type UploadedSourceImage = {
  bucket: string;
  path: string;
  publicUrl: string;
  mediaType: SchedulerMediaType;
  contentType: string;
};

type UploadSourceImageBufferInput = {
  fileName: string;
  contentType: string;
  fileBuffer: Buffer;
};

const sanitizeFileName = (fileName: string) =>
  fileName
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'source-media';

const extensionForMimeType = (contentType: string) => {
  switch (contentType) {
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
};

const inferMediaTypeFromContentType = (contentType: string): SchedulerMediaType =>
  ALLOWED_SOURCE_VIDEO_TYPES.has(contentType) ? 'video' : 'image';

const getMaxBytesForContentType = (contentType: string) =>
  inferMediaTypeFromContentType(contentType) === 'video'
    ? MAX_SOURCE_VIDEO_BYTES
    : MAX_SOURCE_IMAGE_BYTES;

const getSizeValidationMessage = (contentType: string) =>
  inferMediaTypeFromContentType(contentType) === 'video'
    ? 'Uploaded video must be 50MB or smaller'
    : 'Uploaded image must be 6MB or smaller';

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const parseHtmlAttributes = (tag: string) => {
  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;

  HTML_ATTRIBUTE_PATTERN.lastIndex = 0;

  while ((match = HTML_ATTRIBUTE_PATTERN.exec(tag))) {
    const [, rawKey, , doubleQuoted, singleQuoted, unquoted] = match;
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
    attributes[rawKey.toLowerCase()] = decodeHtmlEntities(value.trim());
  }

  return attributes;
};

const toAbsoluteUrl = (candidate: string, baseUrl: string) => {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
};

const extractEmbeddedMediaUrlFromPageUrl = (pageUrl: string) => {
  try {
    const url = new URL(pageUrl);
    const candidateKeys = [
      'imgurl',
      'mediaurl',
      'media',
      'image',
      'image_url',
      'video',
      'video_url',
      'src',
      'url',
      'u',
    ];

    for (const key of candidateKeys) {
      const value = url.searchParams.get(key)?.trim();

      if (!value) {
        continue;
      }

      const resolved = toAbsoluteUrl(value, pageUrl);

      if (resolved && resolved !== pageUrl) {
        return resolved;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const extractPreviewMediaUrlFromHtml = (
  html: string,
  pageUrl: string
): string | null => {
  const matches = html.match(META_TAG_PATTERN) ?? [];
  const linkMatches = html.match(LINK_TAG_PATTERN) ?? [];
  const imageMatches = html.match(IMAGE_TAG_PATTERN) ?? [];
  let ogImage: string | null = null;
  let ogVideo: string | null = null;
  let twitterImage: string | null = null;
  let linkedImage: string | null = null;
  let inlineImage: string | null = null;

  for (const tag of matches) {
    const attributes = parseHtmlAttributes(tag);
    const key = (attributes.property || attributes.name || '').trim().toLowerCase();
    const content = attributes.content?.trim();

    if (!key || !content) {
      continue;
    }

    const resolved = toAbsoluteUrl(content, pageUrl);

    if (!resolved) {
      continue;
    }

    if (!ogVideo && (key === 'og:video' || key === 'og:video:url' || key === 'og:video:secure_url')) {
      ogVideo = resolved;
      continue;
    }

    if (!ogImage && (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url')) {
      ogImage = resolved;
      continue;
    }

    if (!twitterImage && key === 'twitter:image') {
      twitterImage = resolved;
    }
  }

  for (const tag of linkMatches) {
    const attributes = parseHtmlAttributes(tag);
    const rel = (attributes.rel || '').trim().toLowerCase();
    const href = attributes.href?.trim();

    if (!href || (rel !== 'image_src' && rel !== 'preload')) {
      continue;
    }

    if (rel === 'preload' && (attributes.as || '').trim().toLowerCase() !== 'image') {
      continue;
    }

    const resolved = toAbsoluteUrl(href, pageUrl);

    if (resolved) {
      linkedImage = resolved;
      break;
    }
  }

  for (const tag of imageMatches) {
    const attributes = parseHtmlAttributes(tag);
    const src = attributes.src?.trim() || attributes['data-src']?.trim();

    if (!src) {
      continue;
    }

    const resolved = toAbsoluteUrl(src, pageUrl);

    if (resolved) {
      inlineImage = resolved;
      break;
    }
  }

  return ogVideo || ogImage || twitterImage || linkedImage || inlineImage;
};

const assertAllowedMediaType = (contentType: string) => {
  const normalizedContentType = contentType.trim().toLowerCase();

  if (!ALLOWED_SOURCE_MEDIA_TYPES.has(normalizedContentType)) {
    throw new Error('Only JPG, PNG, WEBP, MP4, and MOV media are supported');
  }

  return normalizedContentType;
};

const parseMediaDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(DATA_URL_PATTERN);

  if (!match) {
    throw new Error('Upload payload is not a valid media data URL');
  }

  const [, contentType, base64Payload] = match;
  const normalizedContentType = assertAllowedMediaType(contentType);
  const fileBuffer = Buffer.from(base64Payload, 'base64');

  if (!fileBuffer.byteLength) {
    throw new Error('Uploaded media is empty');
  }

  if (fileBuffer.byteLength > getMaxBytesForContentType(normalizedContentType)) {
    throw new Error(getSizeValidationMessage(normalizedContentType));
  }

  return {
    contentType: normalizedContentType,
    fileBuffer,
  };
};

const uploadSourceImageBuffer = async (
  userId: string,
  input: UploadSourceImageBufferInput
): Promise<UploadedSourceImage> => {
  const contentType = assertAllowedMediaType(input.contentType);
  const mediaType = inferMediaTypeFromContentType(contentType);

  if (!input.fileBuffer.byteLength) {
    throw new Error('Uploaded media is empty');
  }

  if (input.fileBuffer.byteLength > getMaxBytesForContentType(contentType)) {
    throw new Error(getSizeValidationMessage(contentType));
  }

  await ensureSourceImageBucket();

  const supabaseAdmin = requireSupabaseAdmin();
  const fileExtension = extensionForMimeType(contentType);
  const normalizedName = sanitizeFileName(path.basename(input.fileName));
  const storagePath = `${userId}/source-${Date.now()}-${normalizedName}.${fileExtension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(SUPABASE_SOURCE_IMAGE_BUCKET)
    .upload(storagePath, input.fileBuffer, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload source media to storage');
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage
    .from(SUPABASE_SOURCE_IMAGE_BUCKET)
    .getPublicUrl(storagePath);

  if (!publicUrl) {
    throw new Error('Failed to generate a public URL for the source media');
  }

  return {
    bucket: SUPABASE_SOURCE_IMAGE_BUCKET,
    path: storagePath,
    publicUrl,
    mediaType,
    contentType,
  };
};

const inferRemoteFileName = (sourceUrl: string, contentType: string) => {
  try {
    const parsed = new URL(sourceUrl);
    const pathname = parsed.pathname.split('/').pop() || '';

    if (pathname.trim()) {
      return pathname;
    }
  } catch {
    // Fall back to mime-based naming.
  }

  return `external-media.${extensionForMimeType(contentType)}`;
};

const ensureSourceImageBucket = async () => {
  const supabaseAdmin = requireSupabaseAdmin();
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();

  if (error) {
    throw new Error(error.message || 'Failed to inspect storage buckets');
  }

  const bucketExists = (buckets ?? []).some(
    (bucket) => bucket.name === SUPABASE_SOURCE_IMAGE_BUCKET
  );

  if (bucketExists) {
    const { error: updateError } = await supabaseAdmin.storage.updateBucket(
      SUPABASE_SOURCE_IMAGE_BUCKET,
      {
        public: true,
        allowedMimeTypes: Array.from(ALLOWED_SOURCE_MEDIA_TYPES),
        fileSizeLimit: MAX_SOURCE_VIDEO_BYTES,
      }
    );

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update source media storage bucket');
    }

    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(
    SUPABASE_SOURCE_IMAGE_BUCKET,
    {
      public: true,
      allowedMimeTypes: Array.from(ALLOWED_SOURCE_MEDIA_TYPES),
      fileSizeLimit: MAX_SOURCE_VIDEO_BYTES,
    }
  );

  if (createError && !/already exists/i.test(createError.message || '')) {
    throw new Error(
      createError.message || 'Failed to create source media storage bucket'
    );
  }
};

export const uploadSourceImage = async (
  userId: string,
  input: UploadSourceImageInput
): Promise<UploadedSourceImage> => {
  assertAllowedMediaType(input.contentType);
  const { contentType, fileBuffer } = parseMediaDataUrl(input.dataUrl.trim());

  return uploadSourceImageBuffer(userId, {
    fileName: input.fileName,
    contentType,
    fileBuffer,
  });
};

export const importExternalSourceImage = async (
  userId: string,
  sourceUrl: string
): Promise<UploadedSourceImage> => {
  const importFromUrl = async (
    url: string,
    depth: number
  ): Promise<UploadedSourceImage> => {
    if (depth > 2) {
      throw new Error('No preview available for this link');
    }

    const embeddedMediaUrl = extractEmbeddedMediaUrlFromPageUrl(url);

    if (embeddedMediaUrl && embeddedMediaUrl !== url) {
      return importFromUrl(embeddedMediaUrl, depth + 1);
    }

    let response: globalThis.Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'image/*,video/*,text/html;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        },
      });
    } catch {
      throw new Error('Unable to download media from the provided URL');
    }

    if (!response.ok) {
      throw new Error('Unable to download media from the provided URL');
    }

    const contentTypeHeader = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim();

    if (contentTypeHeader?.startsWith('text/html')) {
      const html = await response.text();
      const previewMediaUrl = extractPreviewMediaUrlFromHtml(html, response.url || url);

      if (!previewMediaUrl) {
        throw new Error('No preview available for this link');
      }

      return importFromUrl(previewMediaUrl, depth + 1);
    }

    if (
      !contentTypeHeader ||
      (!contentTypeHeader.startsWith('image/') &&
        !contentTypeHeader.startsWith('video/'))
    ) {
      throw new Error('Invalid media URL');
    }

    const contentType = assertAllowedMediaType(contentTypeHeader);
    const declaredLength = Number.parseInt(response.headers.get('content-length') || '', 10);

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > getMaxBytesForContentType(contentType)
    ) {
      throw new Error(getSizeValidationMessage(contentType));
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());

    return uploadSourceImageBuffer(userId, {
      fileName: inferRemoteFileName(response.url || url, contentType),
      contentType,
      fileBuffer,
    });
  };

  return importFromUrl(sourceUrl, 0);
};
