import { randomUUID } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  IMAGE_BUCKETS,
  R2_ACCESS_KEY_ID,
  R2_PUBLIC_BASE_URL,
  R2_S3_ENDPOINT,
  R2_SECRET_ACCESS_KEY,
} from '../config/constants';
import {
  isAbortError,
  RequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';

type GeneratedAssetKind = 'content' | 'image' | 'video' | 'archive';

export type StoredGeneratedAsset = {
  provider: 'r2';
  bucket: string;
  objectKey: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
};

type StoreGeneratedContentInput = {
  userId: string;
  productName: string;
  payload: Record<string, unknown>;
  signal?: AbortSignal;
};

type StoreGeneratedImageInput = {
  userId: string;
  productName: string;
  imageUrl: string;
  signal?: AbortSignal;
};

type StoreGeneratedVideoInput = {
  userId: string;
  productName: string;
  videoBuffer: Buffer;
  contentType: string;
  signal?: AbortSignal;
};

type StoreArchivePayloadInput = {
  scope: string;
  payload: unknown;
  metadata?: Record<string, string | null | undefined>;
  signal?: AbortSignal;
};

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

type DownloadedAsset = {
  buffer: Buffer;
  contentType: string;
};

const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/;

let r2Client: S3Client | null = null;

const getOptionalConfig = (value: string) => value.trim();

const getR2Config = (): R2Config | null => {
  const endpoint = getOptionalConfig(R2_S3_ENDPOINT);
  const accessKeyId = getOptionalConfig(R2_ACCESS_KEY_ID);
  const secretAccessKey = getOptionalConfig(R2_SECRET_ACCESS_KEY);
  const bucket = getOptionalConfig(IMAGE_BUCKETS.generated);
  const publicBaseUrl = getOptionalConfig(R2_PUBLIC_BASE_URL);

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
  };
};

export const isR2GeneratedStorageConfigured = () => Boolean(getR2Config());

const requireR2Config = (): R2Config => {
  const config = getR2Config();

  if (!config) {
    throw new Error(
      'R2 generated asset storage is not fully configured. Set R2_S3_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_GENERATED_BUCKET, and R2_PUBLIC_BASE_URL.'
    );
  }

  return config;
};

const getR2Client = () => {
  if (!r2Client) {
    const config = requireR2Config();

    r2Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  return r2Client;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';

const contentTypeToExtension = (contentType: string) => {
  const normalized = contentType.toLowerCase();

  switch (normalized) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    case 'application/json':
      return 'json';
    default:
      return 'bin';
  }
};

const inferContentTypeFromUrl = (url: string, fallback = 'application/octet-stream') => {
  const normalized = url.toLowerCase();

  if (normalized.endsWith('.png')) {
    return 'image/png';
  }

  if (normalized.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalized.endsWith('.gif')) {
    return 'image/gif';
  }

  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (normalized.endsWith('.mp4')) {
    return 'video/mp4';
  }

  if (normalized.endsWith('.mov')) {
    return 'video/quicktime';
  }

  return fallback;
};

const buildObjectKey = (
  kind: GeneratedAssetKind,
  userId: string,
  productName: string,
  contentType: string
) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const extension = contentTypeToExtension(contentType);
  const slug = slugify(productName);

  return `${kind}/${userId}/${year}/${month}/${day}/${Date.now()}-${slug}-${randomUUID()}.${extension}`;
};

const buildArchiveObjectKey = (scope: string, contentType: string) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const extension = contentTypeToExtension(contentType);

  return `archive/${slugify(scope)}/${year}/${month}/${day}/${Date.now()}-${randomUUID()}.${extension}`;
};

const buildPublicUrl = (baseUrl: string, objectKey: string) =>
  `${baseUrl.replace(/\/+$/, '')}/${objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

export const parseArchiveObjectKey = (archiveKey: string | null | undefined) => {
  if (!archiveKey?.trim()) {
    return null;
  }

  const separatorIndex = archiveKey.indexOf(':');
  return separatorIndex >= 0 ? archiveKey.slice(separatorIndex + 1) : archiveKey;
};

const toCleanMetadata = (metadata: Record<string, string | null | undefined>) =>
  Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([key, value]) => [key.toLowerCase(), value!.trim()])
  );

const readObjectBodyBuffer = async (body: unknown): Promise<Buffer> => {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    return Buffer.from(
      await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
    );
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const uploadBufferToR2 = async (
  kind: GeneratedAssetKind,
  userId: string,
  productName: string,
  buffer: Buffer,
  contentType: string,
  metadata: Record<string, string | null | undefined>,
  signal?: AbortSignal
): Promise<StoredGeneratedAsset> => {
  const config = requireR2Config();
  const objectKey = buildObjectKey(kind, userId, productName, contentType);

  throwIfRequestCancelled(signal, 'Generation cancelled by user.');

  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
        CacheControl:
          kind === 'image' || kind === 'video'
            ? 'public, max-age=31536000, immutable'
            : 'private, max-age=0, no-cache',
        Metadata: toCleanMetadata(metadata),
      }),
      {
        abortSignal: signal,
      }
    );
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new RequestCancelledError('Generation cancelled by user.');
    }

    throw new Error(
      error instanceof Error
        ? `Failed to upload generated ${kind} to R2: ${error.message}`
        : `Failed to upload generated ${kind} to R2`
    );
  }

  return {
    provider: 'r2',
    bucket: config.bucket,
    objectKey,
    publicUrl: buildPublicUrl(config.publicBaseUrl, objectKey),
    contentType,
    sizeBytes: buffer.byteLength,
  };
};

const downloadAsset = async (
  assetUrl: string,
  signal?: AbortSignal
): Promise<DownloadedAsset> => {
  const dataUrlMatch = assetUrl.match(DATA_URL_PATTERN);

  if (dataUrlMatch) {
    const [, contentType, payload] = dataUrlMatch;
    return {
      buffer: Buffer.from(payload, 'base64'),
      contentType,
    };
  }

  throwIfRequestCancelled(signal, 'Generation cancelled by user.');

  let response: Response;

  try {
    response = await fetch(assetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new RequestCancelledError('Generation cancelled by user.');
    }

    throw new Error('Failed to download generated asset from the provider');
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download generated asset from the provider (${response.status})`
    );
  }

  const headerContentType =
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ||
    '';
  const contentType =
    !headerContentType || headerContentType === 'application/octet-stream'
      ? inferContentTypeFromUrl(assetUrl)
      : headerContentType;

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
};

export const storeGeneratedContentInR2 = async (
  input: StoreGeneratedContentInput
): Promise<StoredGeneratedAsset | null> => {
  if (!isR2GeneratedStorageConfigured()) {
    return null;
  }

  const buffer = Buffer.from(JSON.stringify(input.payload, null, 2), 'utf8');

  return uploadBufferToR2(
    'content',
    input.userId,
    input.productName,
    buffer,
    'application/json',
    {
      user_id: input.userId,
      product_name: input.productName,
      asset_kind: 'content',
    },
    input.signal
  );
};

export const storeGeneratedImageInR2 = async (
  input: StoreGeneratedImageInput
): Promise<StoredGeneratedAsset | null> => {
  if (!isR2GeneratedStorageConfigured()) {
    return null;
  }

  const downloadedImage = await downloadAsset(input.imageUrl, input.signal);

  return uploadBufferToR2(
    'image',
    input.userId,
    input.productName,
    downloadedImage.buffer,
    downloadedImage.contentType,
    {
      user_id: input.userId,
      product_name: input.productName,
      asset_kind: 'image',
    },
    input.signal
  );
};

export const storeGeneratedVideoInR2 = async (
  input: StoreGeneratedVideoInput
): Promise<StoredGeneratedAsset | null> => {
  if (!isR2GeneratedStorageConfigured()) {
    return null;
  }

  return uploadBufferToR2(
    'video',
    input.userId,
    input.productName,
    input.videoBuffer,
    input.contentType,
    {
      user_id: input.userId,
      product_name: input.productName,
      asset_kind: 'video',
    },
    input.signal
  );
};

export const storeArchivePayloadInR2 = async (
  input: StoreArchivePayloadInput
): Promise<StoredGeneratedAsset> => {
  const config = requireR2Config();
  const contentType = 'application/json';
  const serializedPayload = Buffer.from(JSON.stringify(input.payload), 'utf8');
  const buffer = gzipSync(serializedPayload);
  // ponytail: keep archives under the existing generated bucket; split buckets only if lifecycle rules need to diverge.
  const objectKey = buildArchiveObjectKey(input.scope, contentType);

  throwIfRequestCancelled(input.signal, 'Archive cancelled.');

  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
        ContentEncoding: 'gzip',
        CacheControl: 'private, max-age=0, no-cache',
        Metadata: toCleanMetadata({
          archive_scope: input.scope,
          archive_format: 'json',
          archive_encoding: 'gzip',
          ...(input.metadata ?? {}),
        }),
      }),
      {
        abortSignal: input.signal,
      }
    );
  } catch (error) {
    if (input.signal?.aborted || isAbortError(error)) {
      throw new RequestCancelledError('Archive cancelled.');
    }

    throw new Error(
      error instanceof Error
        ? `Failed to upload archive payload to R2: ${error.message}`
        : 'Failed to upload archive payload to R2'
    );
  }

  return {
    provider: 'r2',
    bucket: config.bucket,
    objectKey,
    publicUrl: buildPublicUrl(config.publicBaseUrl, objectKey),
    contentType,
    sizeBytes: buffer.byteLength,
  };
};

export const loadArchivePayloadFromR2 = async (input: {
  objectKey: string;
  signal?: AbortSignal;
}): Promise<unknown> => {
  throwIfRequestCancelled(input.signal, 'Archive load cancelled.');

  let response;
  try {
    response = await getR2Client().send(
      new GetObjectCommand({
        Bucket: requireR2Config().bucket,
        Key: input.objectKey,
      }),
      {
        abortSignal: input.signal,
      }
    );
  } catch (error) {
    if (input.signal?.aborted || isAbortError(error)) {
      throw new RequestCancelledError('Archive load cancelled.');
    }

    throw new Error(
      error instanceof Error
        ? `Failed to load archive payload from R2: ${error.message}`
        : 'Failed to load archive payload from R2'
    );
  }

  const responseBuffer = await readObjectBodyBuffer(response.Body);
  const bodyBuffer =
    response.ContentEncoding?.toLowerCase() === 'gzip'
      ? gunzipSync(responseBuffer)
      : responseBuffer;

  return JSON.parse(bodyBuffer.toString('utf8') || 'null');
};
