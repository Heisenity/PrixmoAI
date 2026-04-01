"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSourceImage = void 0;
const path_1 = __importDefault(require("path"));
const constants_1 = require("../config/constants");
const supabase_1 = require("../db/supabase");
const MAX_SOURCE_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_SOURCE_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);
const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
const sanitizeFileName = (fileName) => fileName
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'source-image';
const extensionForMimeType = (contentType) => {
    switch (contentType) {
        case 'image/png':
            return 'png';
        case 'image/webp':
            return 'webp';
        case 'image/jpeg':
        default:
            return 'jpg';
    }
};
const parseImageDataUrl = (dataUrl) => {
    const match = dataUrl.match(DATA_URL_PATTERN);
    if (!match) {
        throw new Error('Upload payload is not a valid image data URL');
    }
    const [, contentType, base64Payload] = match;
    if (!ALLOWED_SOURCE_IMAGE_TYPES.has(contentType)) {
        throw new Error('Only JPG, PNG, and WEBP images are supported');
    }
    const fileBuffer = Buffer.from(base64Payload, 'base64');
    if (!fileBuffer.byteLength) {
        throw new Error('Uploaded image is empty');
    }
    if (fileBuffer.byteLength > MAX_SOURCE_IMAGE_BYTES) {
        throw new Error('Uploaded image must be 6MB or smaller');
    }
    return {
        contentType,
        fileBuffer,
    };
};
const ensureSourceImageBucket = async () => {
    const supabaseAdmin = (0, supabase_1.requireSupabaseAdmin)();
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
        throw new Error(error.message || 'Failed to inspect storage buckets');
    }
    const bucketExists = (buckets ?? []).some((bucket) => bucket.name === constants_1.SUPABASE_SOURCE_IMAGE_BUCKET);
    if (bucketExists) {
        return;
    }
    const { error: createError } = await supabaseAdmin.storage.createBucket(constants_1.SUPABASE_SOURCE_IMAGE_BUCKET, {
        public: true,
        allowedMimeTypes: Array.from(ALLOWED_SOURCE_IMAGE_TYPES),
        fileSizeLimit: MAX_SOURCE_IMAGE_BYTES,
    });
    if (createError &&
        !/already exists/i.test(createError.message || '')) {
        throw new Error(createError.message || 'Failed to create source image storage bucket');
    }
};
const uploadSourceImage = async (userId, input) => {
    const normalizedContentType = input.contentType.trim().toLowerCase();
    if (!ALLOWED_SOURCE_IMAGE_TYPES.has(normalizedContentType)) {
        throw new Error('Only JPG, PNG, and WEBP images are supported');
    }
    const { contentType, fileBuffer } = parseImageDataUrl(input.dataUrl.trim());
    await ensureSourceImageBucket();
    const supabaseAdmin = (0, supabase_1.requireSupabaseAdmin)();
    const fileExtension = extensionForMimeType(contentType);
    const normalizedName = sanitizeFileName(path_1.default.basename(input.fileName));
    const storagePath = `${userId}/source-${Date.now()}-${normalizedName}.${fileExtension}`;
    const { error: uploadError } = await supabaseAdmin.storage
        .from(constants_1.SUPABASE_SOURCE_IMAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false,
        cacheControl: '3600',
    });
    if (uploadError) {
        throw new Error(uploadError.message || 'Failed to upload source image to storage');
    }
    const { data: { publicUrl }, } = supabaseAdmin.storage
        .from(constants_1.SUPABASE_SOURCE_IMAGE_BUCKET)
        .getPublicUrl(storagePath);
    if (!publicUrl) {
        throw new Error('Failed to generate a public URL for the source image');
    }
    return {
        bucket: constants_1.SUPABASE_SOURCE_IMAGE_BUCKET,
        path: storagePath,
        publicUrl,
    };
};
exports.uploadSourceImage = uploadSourceImage;
