"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateScheduledPostStatusSchema = exports.updateScheduledPostSchema = exports.createScheduledPostSchema = exports.updateSocialAccountSchema = exports.finalizeMetaFacebookPagesSchema = exports.startMetaOAuthSchema = exports.createSocialAccountSchema = void 0;
const zod_1 = require("zod");
const socialPlatformSchema = zod_1.z.enum(['instagram', 'facebook', 'linkedin', 'x']);
const metaOAuthPlatformSchema = zod_1.z.enum(['instagram', 'facebook']);
const optionalNullableString = zod_1.z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional();
const optionalNonEmptyString = zod_1.z.string().trim().min(1).optional();
const metadataSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional();
exports.createSocialAccountSchema = zod_1.z
    .object({
    platform: socialPlatformSchema,
    accountId: optionalNonEmptyString,
    profileUrl: zod_1.z.url({ error: 'Please enter a valid profile URL' }).optional(),
    accessToken: optionalNullableString,
    refreshToken: optionalNullableString,
    tokenExpiresAt: zod_1.z.string().datetime().nullable().optional(),
    metadata: metadataSchema,
})
    .refine((value) => Boolean(value.accountId || value.profileUrl), {
    message: 'Add a profile URL or a profile ID',
    path: ['accountId'],
});
exports.startMetaOAuthSchema = zod_1.z
    .object({
    platform: metaOAuthPlatformSchema,
    accountId: optionalNonEmptyString,
    profileUrl: zod_1.z.url({ error: 'Please enter a valid profile URL' }).optional(),
});
exports.finalizeMetaFacebookPagesSchema = zod_1.z.object({
    selectionId: zod_1.z.string().uuid('Invalid selection ID'),
    pageIds: zod_1.z
        .array(zod_1.z.string().trim().min(1, 'Select a Facebook Page'))
        .min(1, 'Select at least one Facebook Page'),
});
exports.updateSocialAccountSchema = zod_1.z
    .object({
    platform: socialPlatformSchema.optional(),
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
