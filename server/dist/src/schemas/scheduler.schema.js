"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateScheduledPostStatusSchema = exports.updateScheduledPostSchema = exports.createScheduledPostSchema = exports.updateSocialAccountSchema = exports.createSocialAccountSchema = void 0;
const zod_1 = require("zod");
const optionalNullableString = zod_1.z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional();
const metadataSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional();
exports.createSocialAccountSchema = zod_1.z.object({
    platform: zod_1.z.string().trim().min(1, 'Platform is required'),
    accountId: zod_1.z.string().trim().min(1, 'Account ID is required'),
    accountName: optionalNullableString,
    accessToken: optionalNullableString,
    refreshToken: optionalNullableString,
    tokenExpiresAt: zod_1.z.string().datetime().nullable().optional(),
    metadata: metadataSchema,
});
exports.updateSocialAccountSchema = zod_1.z
    .object({
    platform: zod_1.z.string().trim().min(1).optional(),
    accountId: zod_1.z.string().trim().min(1).optional(),
    accountName: optionalNullableString,
    accessToken: optionalNullableString,
    refreshToken: optionalNullableString,
    tokenExpiresAt: zod_1.z.string().datetime().nullable().optional(),
    metadata: metadataSchema,
})
    .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
});
exports.createScheduledPostSchema = zod_1.z.object({
    socialAccountId: zod_1.z.string().uuid('Invalid social account ID'),
    contentId: zod_1.z.string().uuid('Invalid content ID').nullable().optional(),
    generatedImageId: zod_1.z.string().uuid('Invalid generated image ID').nullable().optional(),
    platform: zod_1.z.string().trim().min(1).optional(),
    caption: optionalNullableString,
    mediaUrl: zod_1.z.url({ error: 'Invalid media URL' }).nullable().optional(),
    scheduledFor: zod_1.z.string().datetime('Invalid scheduled time'),
    status: zod_1.z
        .enum(['pending', 'scheduled', 'published', 'failed', 'cancelled'])
        .optional(),
});
exports.updateScheduledPostSchema = zod_1.z
    .object({
    socialAccountId: zod_1.z.string().uuid('Invalid social account ID').optional(),
    contentId: zod_1.z.string().uuid('Invalid content ID').nullable().optional(),
    generatedImageId: zod_1.z
        .string()
        .uuid('Invalid generated image ID')
        .nullable()
        .optional(),
    platform: zod_1.z.string().trim().min(1).nullable().optional(),
    caption: optionalNullableString,
    mediaUrl: zod_1.z.url({ error: 'Invalid media URL' }).nullable().optional(),
    scheduledFor: zod_1.z.string().datetime('Invalid scheduled time').optional(),
    status: zod_1.z
        .enum(['pending', 'scheduled', 'published', 'failed', 'cancelled'])
        .optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
});
exports.updateScheduledPostStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['pending', 'scheduled', 'published', 'failed', 'cancelled']),
    publishedAt: zod_1.z.string().datetime().nullable().optional(),
});
