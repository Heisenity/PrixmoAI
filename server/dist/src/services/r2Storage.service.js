"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeGeneratedVideoInR2 = exports.storeGeneratedImageInR2 = exports.storeGeneratedContentInR2 = exports.isR2GeneratedStorageConfigured = void 0;
const crypto_1 = require("crypto");
const client_s3_1 = require("@aws-sdk/client-s3");
const constants_1 = require("../config/constants");
const requestCancellation_1 = require("../lib/requestCancellation");
const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/;
let r2Client = null;
const getOptionalConfig = (value) => value.trim();
const getR2Config = () => {
    const endpoint = getOptionalConfig(constants_1.R2_S3_ENDPOINT);
    const accessKeyId = getOptionalConfig(constants_1.R2_ACCESS_KEY_ID);
    const secretAccessKey = getOptionalConfig(constants_1.R2_SECRET_ACCESS_KEY);
    const bucket = getOptionalConfig(constants_1.IMAGE_BUCKETS.generated);
    const publicBaseUrl = getOptionalConfig(constants_1.R2_PUBLIC_BASE_URL);
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
const isR2GeneratedStorageConfigured = () => Boolean(getR2Config());
exports.isR2GeneratedStorageConfigured = isR2GeneratedStorageConfigured;
const requireR2Config = () => {
    const config = getR2Config();
    if (!config) {
        throw new Error('R2 generated asset storage is not fully configured. Set R2_S3_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_GENERATED_BUCKET, and R2_PUBLIC_BASE_URL.');
    }
    return config;
};
const getR2Client = () => {
    if (!r2Client) {
        const config = requireR2Config();
        r2Client = new client_s3_1.S3Client({
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
const slugify = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
const contentTypeToExtension = (contentType) => {
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
const inferContentTypeFromUrl = (url, fallback = 'application/octet-stream') => {
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
const buildObjectKey = (kind, userId, productName, contentType) => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const extension = contentTypeToExtension(contentType);
    const slug = slugify(productName);
    return `${kind}/${userId}/${year}/${month}/${day}/${Date.now()}-${slug}-${(0, crypto_1.randomUUID)()}.${extension}`;
};
const buildPublicUrl = (baseUrl, objectKey) => `${baseUrl.replace(/\/+$/, '')}/${objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
const toCleanMetadata = (metadata) => Object.fromEntries(Object.entries(metadata)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => [key.toLowerCase(), value.trim()]));
const uploadBufferToR2 = async (kind, userId, productName, buffer, contentType, metadata, signal) => {
    const config = requireR2Config();
    const objectKey = buildObjectKey(kind, userId, productName, contentType);
    (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Generation cancelled by user.');
    try {
        await getR2Client().send(new client_s3_1.PutObjectCommand({
            Bucket: config.bucket,
            Key: objectKey,
            Body: buffer,
            ContentType: contentType,
            CacheControl: kind === 'image' || kind === 'video'
                ? 'public, max-age=31536000, immutable'
                : 'private, max-age=0, no-cache',
            Metadata: toCleanMetadata(metadata),
        }), {
            abortSignal: signal,
        });
    }
    catch (error) {
        if (signal?.aborted || (0, requestCancellation_1.isAbortError)(error)) {
            throw new requestCancellation_1.RequestCancelledError('Generation cancelled by user.');
        }
        throw new Error(error instanceof Error
            ? `Failed to upload generated ${kind} to R2: ${error.message}`
            : `Failed to upload generated ${kind} to R2`);
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
const downloadAsset = async (assetUrl, signal) => {
    const dataUrlMatch = assetUrl.match(DATA_URL_PATTERN);
    if (dataUrlMatch) {
        const [, contentType, payload] = dataUrlMatch;
        return {
            buffer: Buffer.from(payload, 'base64'),
            contentType,
        };
    }
    (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Generation cancelled by user.');
    let response;
    try {
        response = await fetch(assetUrl, {
            method: 'GET',
            redirect: 'follow',
            signal,
        });
    }
    catch (error) {
        if (signal?.aborted || (0, requestCancellation_1.isAbortError)(error)) {
            throw new requestCancellation_1.RequestCancelledError('Generation cancelled by user.');
        }
        throw new Error('Failed to download generated asset from the provider');
    }
    if (!response.ok) {
        throw new Error(`Failed to download generated asset from the provider (${response.status})`);
    }
    const headerContentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ||
        '';
    const contentType = !headerContentType || headerContentType === 'application/octet-stream'
        ? inferContentTypeFromUrl(assetUrl)
        : headerContentType;
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType,
    };
};
const storeGeneratedContentInR2 = async (input) => {
    if (!(0, exports.isR2GeneratedStorageConfigured)()) {
        return null;
    }
    const buffer = Buffer.from(JSON.stringify(input.payload, null, 2), 'utf8');
    return uploadBufferToR2('content', input.userId, input.productName, buffer, 'application/json', {
        user_id: input.userId,
        product_name: input.productName,
        asset_kind: 'content',
    }, input.signal);
};
exports.storeGeneratedContentInR2 = storeGeneratedContentInR2;
const storeGeneratedImageInR2 = async (input) => {
    if (!(0, exports.isR2GeneratedStorageConfigured)()) {
        return null;
    }
    const downloadedImage = await downloadAsset(input.imageUrl, input.signal);
    return uploadBufferToR2('image', input.userId, input.productName, downloadedImage.buffer, downloadedImage.contentType, {
        user_id: input.userId,
        product_name: input.productName,
        asset_kind: 'image',
    }, input.signal);
};
exports.storeGeneratedImageInR2 = storeGeneratedImageInR2;
const storeGeneratedVideoInR2 = async (input) => {
    if (!(0, exports.isR2GeneratedStorageConfigured)()) {
        return null;
    }
    return uploadBufferToR2('video', input.userId, input.productName, input.videoBuffer, input.contentType, {
        user_id: input.userId,
        product_name: input.productName,
        asset_kind: 'video',
    }, input.signal);
};
exports.storeGeneratedVideoInR2 = storeGeneratedVideoInR2;
