import { z } from 'zod';

export const recordAnalyticsSchema = z.object({
  scheduledPostId: z.string().uuid().optional(),
  contentId: z.string().uuid().optional(),
  platform: z.string().trim().min(1).optional(),
  postExternalId: z.string().trim().min(1).optional(),
  reach: z.number().int().min(0).optional(),
  impressions: z.number().int().min(0).optional(),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
  saves: z.number().int().min(0).optional(),
  engagementRate: z.number().min(0).max(10000).nullable().optional(),
  recordedAt: z.string().datetime().optional(),
});

export type RecordAnalyticsInput = z.infer<typeof recordAnalyticsSchema>;
