"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContentSchema = void 0;
const zod_1 = require("zod");
const optionalTrimmedString = (message) => zod_1.z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, message
    ? zod_1.z.string().trim().min(1, message).optional()
    : zod_1.z.string().trim().min(1).optional());
const optionalTrimmedUrl = (message) => zod_1.z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, zod_1.z.string().trim().url(message).optional());
exports.generateContentSchema = zod_1.z.object({
    useBrandName: zod_1.z.boolean().optional(),
    productName: zod_1.z.string().trim().min(1, 'Product name is required'),
    productDescription: optionalTrimmedString(),
    productImageUrl: optionalTrimmedUrl('Please enter a valid product image URL'),
    platform: optionalTrimmedString(),
    goal: optionalTrimmedString(),
    tone: optionalTrimmedString(),
    audience: optionalTrimmedString(),
    keywords: zod_1.z.array(zod_1.z.string().trim().min(1)).max(20).optional(),
});
