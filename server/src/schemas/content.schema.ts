import { z } from 'zod';

const optionalTrimmedString = (message?: string) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    message
      ? z.string().trim().min(1, message).optional()
      : z.string().trim().min(1).optional()
  );

const optionalTrimmedUrl = (message: string) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().url(message).optional()
  );

export const generateContentSchema = z.object({
  useBrandName: z.boolean().optional(),
  productName: z.string().trim().min(1, 'Product name is required'),
  productDescription: optionalTrimmedString(),
  productImageUrl: optionalTrimmedUrl('Please enter a valid product image URL'),
  platform: optionalTrimmedString(),
  goal: optionalTrimmedString(),
  tone: optionalTrimmedString(),
  audience: optionalTrimmedString(),
  keywords: z.array(z.string().trim().min(1)).max(20).optional(),
});

export const contentFeedbackSchema = z.object({
  sourceTable: z.string().trim().min(1, 'Source table is required'),
  sourceId: z.string().uuid('Invalid source ID'),
  sourceKey: z.string().trim().min(1).nullable().optional(),
  memoryType: z.string().trim().min(1, 'Memory type is required'),
  eventType: z.enum([
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
  platform: z.string().trim().min(1).nullable().optional(),
  contentId: z.string().uuid('Invalid content ID').nullable().optional(),
  generatedImageId: z.string().uuid('Invalid generated image ID').nullable().optional(),
  scheduledPostId: z.string().uuid('Invalid scheduled post ID').nullable().optional(),
  scheduledItemId: z.string().uuid('Invalid scheduled item ID').nullable().optional(),
  intensity: z.number().min(0).max(1).optional(),
  wasAiRecommended: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const recommendScheduleCaptionSchema = z.object({
  generatedImageId: z.string().uuid('Invalid generated image ID').nullable().optional(),
  requestContext: z.string().trim().min(1).nullable().optional(),
});

export type GenerateContentInput = z.infer<typeof generateContentSchema>;
export type ContentFeedbackInput = z.infer<typeof contentFeedbackSchema>;
export type RecommendScheduleCaptionInput = z.infer<
  typeof recommendScheduleCaptionSchema
>;
