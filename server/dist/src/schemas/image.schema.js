"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSourceImageSchema = exports.generateImageSchema = void 0;
const zod_1 = require("zod");
const optionalTrimmedString = (message) => zod_1.z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, message
    ? zod_1.z.string().trim().min(1, message).optional()
    : zod_1.z.string().trim().min(1).optional());
const optionalTrimmedUrl = (message) => zod_1.z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, zod_1.z.string().trim().url(message).optional());
exports.generateImageSchema = zod_1.z.object({
    contentId: zod_1.z.string().uuid().optional(),
    sourceImageUrl: optionalTrimmedUrl('Please enter a valid source image URL'),
    useBrandName: zod_1.z.boolean().optional(),
    productName: zod_1.z.string().trim().min(1, 'Product name is required'),
    productDescription: optionalTrimmedString(),
    backgroundStyle: optionalTrimmedString(),
    prompt: optionalTrimmedString(),
    negativePrompt: optionalTrimmedString(),
    width: zod_1.z.number().int().min(256).max(1024).optional(),
    height: zod_1.z.number().int().min(256).max(1024).optional(),
});
exports.uploadSourceImageSchema = zod_1.z.object({
    fileName: zod_1.z.string().trim().min(1, 'File name is required'),
    contentType: zod_1.z
        .string()
        .trim()
        .refine((value) => ['image/jpeg', 'image/png', 'image/webp'].includes(value), 'Only JPG, PNG, and WEBP images are supported'),
    dataUrl: zod_1.z
        .string()
        .trim()
        .regex(/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/, 'Upload payload must be a valid base64 image'),
});
