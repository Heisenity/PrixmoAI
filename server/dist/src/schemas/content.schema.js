"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendScheduleCaptionSchema = exports.contentFeedbackSchema = exports.generateContentSchema = void 0;
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
exports.contentFeedbackSchema = zod_1.z.object({
    sourceTable: zod_1.z.string().trim().min(1, 'Source table is required'),
    sourceId: zod_1.z.string().uuid('Invalid source ID'),
    sourceKey: zod_1.z.string().trim().min(1).nullable().optional(),
    memoryType: zod_1.z.string().trim().min(1, 'Memory type is required'),
    eventType: zod_1.z.enum([
        'accepted',
        'rejected',
        'regenerated',
        'edited',
        'scheduled',
        'reused',
        'performance_promoted',
        'performance_demoted',
        'schedule_opened',
    ]),
    platform: zod_1.z.string().trim().min(1).nullable().optional(),
    contentId: zod_1.z.string().uuid('Invalid content ID').nullable().optional(),
    generatedImageId: zod_1.z.string().uuid('Invalid generated image ID').nullable().optional(),
    scheduledPostId: zod_1.z.string().uuid('Invalid scheduled post ID').nullable().optional(),
    scheduledItemId: zod_1.z.string().uuid('Invalid scheduled item ID').nullable().optional(),
    intensity: zod_1.z.number().min(0).max(1).optional(),
    wasAiRecommended: zod_1.z.boolean().optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
exports.recommendScheduleCaptionSchema = zod_1.z.object({
    generatedImageId: zod_1.z.string().uuid('Invalid generated image ID').nullable().optional(),
    requestContext: zod_1.z.string().trim().min(1).nullable().optional(),
});
