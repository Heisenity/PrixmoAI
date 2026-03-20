import { z } from 'zod';

const optionalNullableString = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional();

const metadataSchema = z.record(z.string(), z.unknown()).optional();

export const createSocialAccountSchema = z.object({
  platform: z.string().trim().min(1, 'Platform is required'),
  accountId: z.string().trim().min(1, 'Account ID is required'),
  accountName: optionalNullableString,
  accessToken: optionalNullableString,
  refreshToken: optionalNullableString,
  tokenExpiresAt: z.string().datetime().nullable().optional(),
  metadata: metadataSchema,
});

export const updateSocialAccountSchema = z
  .object({
    platform: z.string().trim().min(1).optional(),
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
export type UpdateSocialAccountBody = z.infer<typeof updateSocialAccountSchema>;
export type CreateScheduledPostBody = z.infer<typeof createScheduledPostSchema>;
export type UpdateScheduledPostBody = z.infer<typeof updateScheduledPostSchema>;
export type UpdateScheduledPostStatusBody = z.infer<
  typeof updateScheduledPostStatusSchema
>;
