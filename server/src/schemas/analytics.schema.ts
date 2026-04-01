import { z } from 'zod';

export const recordAnalyticsSchema = z.object({
  scheduledPostId: z.string().uuid().optional(),
  contentId: z.string().uuid().optional(),
  platform: z.string().trim().min(1).optional(),
  postExternalId: z.string().trim().min(1).optional(),
  postType: z.string().trim().min(1).optional(),
  caption: z.string().trim().min(1).optional(),
  mediaUrl: z.string().trim().min(1).optional(),
  thumbnailUrl: z.string().trim().min(1).optional(),
  reach: z.number().int().min(0).optional(),
  impressions: z.number().int().min(0).optional(),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
  saves: z.number().int().min(0).optional(),
  reactions: z.number().int().min(0).optional(),
  videoPlays: z.number().int().min(0).optional(),
  replays: z.number().int().min(0).optional(),
  exits: z.number().int().min(0).optional(),
  profileVisits: z.number().int().min(0).optional(),
  postClicks: z.number().int().min(0).optional(),
  pageLikes: z.number().int().min(0).optional(),
  completionRate: z.number().min(0).max(100).nullable().optional(),
  followersAtPostTime: z.number().int().min(0).nullable().optional(),
  engagementRate: z.number().min(0).max(10000).nullable().optional(),
  publishedTime: z.string().datetime().optional(),
  topComments: z.array(z.string().trim().min(1)).max(20).optional(),
  recordedAt: z.string().datetime().optional(),
});

export type RecordAnalyticsInput = z.infer<typeof recordAnalyticsSchema>;
