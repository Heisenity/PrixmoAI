import { z } from 'zod';

const socialPlatformSchema = z.enum(['instagram', 'facebook', 'linkedin', 'x']);
const metaOAuthPlatformSchema = z.enum(['instagram', 'facebook']);
const schedulerMediaTypeSchema = z.enum(['image', 'video']);
const scheduleBatchStatusSchema = z.enum([
  'draft',
  'queued',
  'partial',
  'completed',
  'failed',
]);
const scheduledItemStatusSchema = z.enum([
  'pending',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
]);
const mediaAssetSourceTypeSchema = z.enum(['upload', 'url', 'generated']);

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

export const createMediaAssetSchema = z.object({
  sourceType: mediaAssetSourceTypeSchema,
  mediaType: schedulerMediaTypeSchema,
  originalUrl: z.url({ error: 'Invalid original media URL' }).nullable().optional(),
  storageUrl: z.url({ error: 'Invalid storage media URL' }),
  thumbnailUrl: z.url({ error: 'Invalid thumbnail URL' }).nullable().optional(),
  filename: optionalNullableString,
  mimeType: optionalNullableString,
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  contentId: z.string().uuid('Invalid content ID').nullable().optional(),
  generatedImageId: z.string().uuid('Invalid generated image ID').nullable().optional(),
  metadata: metadataSchema,
});

export const createScheduleBatchSchema = z.object({
  batchName: optionalNullableString,
  status: scheduleBatchStatusSchema.optional(),
});

export const createScheduledItemSchema = z.object({
  mediaAssetId: z.string().uuid('Invalid media asset ID'),
  socialAccountId: z.string().uuid('Invalid social account ID'),
  platform: socialPlatformSchema,
  accountId: z.string().trim().min(1, 'Account ID is required'),
  caption: optionalNullableString,
  scheduledAt: z.string().datetime('Invalid scheduled time'),
  status: scheduledItemStatusSchema.optional(),
});

export const addBatchItemsSchema = z.object({
  items: z.array(createScheduledItemSchema).min(1, 'Add at least one scheduled item'),
});

export const updateScheduledItemSchema = z
  .object({
    mediaAssetId: z.string().uuid('Invalid media asset ID').optional(),
    socialAccountId: z.string().uuid('Invalid social account ID').optional(),
    platform: socialPlatformSchema.optional(),
    accountId: z.string().trim().min(1).optional(),
    caption: optionalNullableString,
    scheduledAt: z.string().datetime('Invalid scheduled time').optional(),
    status: scheduledItemStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const listScheduledItemsSchema = z.object({
  page: z.string().trim().optional(),
  limit: z.string().trim().optional(),
  status: scheduledItemStatusSchema.optional(),
});

export const listScheduleBatchesSchema = z.object({
  page: z.string().trim().optional(),
  limit: z.string().trim().optional(),
  status: scheduleBatchStatusSchema.optional(),
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
export type CreateMediaAssetBody = z.infer<typeof createMediaAssetSchema>;
export type CreateScheduleBatchBody = z.infer<typeof createScheduleBatchSchema>;
export type CreateScheduledItemBody = z.infer<typeof createScheduledItemSchema>;
export type AddBatchItemsBody = z.infer<typeof addBatchItemsSchema>;
export type UpdateScheduledItemBody = z.infer<typeof updateScheduledItemSchema>;
export type ListScheduledItemsQuery = z.infer<typeof listScheduledItemsSchema>;
export type ListScheduleBatchesQuery = z.infer<typeof listScheduleBatchesSchema>;
