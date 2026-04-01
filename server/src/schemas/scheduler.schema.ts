import { z } from 'zod';

const socialPlatformSchema = z.enum(['instagram', 'facebook', 'linkedin', 'x']);
const metaOAuthPlatformSchema = z.enum(['instagram', 'facebook']);
const schedulerMediaTypeSchema = z.enum(['image', 'video']);

const optionalNullableString = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional();

const optionalNonEmptyString = z.string().trim().min(1).optional();
const metadataSchema = z.record(z.string(), z.unknown()).optional();

export const createSocialAccountSchema = z
  .object({
    platform: socialPlatformSchema,
    accountId: optionalNonEmptyString,
    profileUrl: z.url({ error: 'Please enter a valid profile URL' }).optional(),
    accessToken: optionalNullableString,
    refreshToken: optionalNullableString,
    tokenExpiresAt: z.string().datetime().nullable().optional(),
    metadata: metadataSchema,
  })
  .refine((value) => Boolean(value.accountId || value.profileUrl), {
    message: 'Add a profile URL or a profile ID',
    path: ['accountId'],
  });

export const startMetaOAuthSchema = z
  .object({
    platform: metaOAuthPlatformSchema,
    accountId: optionalNonEmptyString,
    profileUrl: z.url({ error: 'Please enter a valid profile URL' }).optional(),
  });

export const finalizeMetaFacebookPagesSchema = z.object({
  selectionId: z.string().uuid('Invalid selection ID'),
  pageIds: z
    .array(z.string().trim().min(1, 'Select a Facebook Page'))
    .min(1, 'Select at least one Facebook Page'),
});

export const updateSocialAccountSchema = z
  .object({
    platform: socialPlatformSchema.optional(),
    accountId: z.string().trim().min(1).optional(),
    accountName: optionalNullableString,
    accessToken: optionalNullableString,
    refreshToken: optionalNullableString,
    tokenExpiresAt: z.string().datetime().nullable().optional(),
    metadata: metadataSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const createScheduledPostSchema = z.object({
  socialAccountId: z.string().uuid('Invalid social account ID'),
  contentId: z.string().uuid('Invalid content ID').nullable().optional(),
  generatedImageId: z.string().uuid('Invalid generated image ID').nullable().optional(),
  platform: z.string().trim().min(1).optional(),
  caption: optionalNullableString,
  mediaUrl: z.url({ error: 'Invalid media URL' }).nullable().optional(),
  mediaType: schedulerMediaTypeSchema.nullable().optional(),
  scheduledFor: z.string().datetime('Invalid scheduled time'),
  status: z
    .enum(['pending', 'scheduled', 'published', 'failed', 'cancelled'])
    .optional(),
});

export const updateScheduledPostSchema = z
  .object({
    socialAccountId: z.string().uuid('Invalid social account ID').optional(),
    contentId: z.string().uuid('Invalid content ID').nullable().optional(),
    generatedImageId: z
      .string()
      .uuid('Invalid generated image ID')
      .nullable()
      .optional(),
    platform: z.string().trim().min(1).nullable().optional(),
    caption: optionalNullableString,
    mediaUrl: z.url({ error: 'Invalid media URL' }).nullable().optional(),
    mediaType: schedulerMediaTypeSchema.nullable().optional(),
    scheduledFor: z.string().datetime('Invalid scheduled time').optional(),
    status: z
      .enum(['pending', 'scheduled', 'published', 'failed', 'cancelled'])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const updateScheduledPostStatusSchema = z.object({
  status: z.enum(['pending', 'scheduled', 'published', 'failed', 'cancelled']),
  publishedAt: z.string().datetime().nullable().optional(),
});

export type CreateSocialAccountBody = z.infer<typeof createSocialAccountSchema>;
export type StartMetaOAuthBody = z.infer<typeof startMetaOAuthSchema>;
export type FinalizeMetaFacebookPagesBody = z.infer<
  typeof finalizeMetaFacebookPagesSchema
>;
export type UpdateSocialAccountBody = z.infer<typeof updateSocialAccountSchema>;
export type CreateScheduledPostBody = z.infer<typeof createScheduledPostSchema>;
export type UpdateScheduledPostBody = z.infer<typeof updateScheduledPostSchema>;
export type UpdateScheduledPostStatusBody = z.infer<
  typeof updateScheduledPostStatusSchema
>;
