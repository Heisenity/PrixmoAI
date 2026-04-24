"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAnalyticsSchema = void 0;
const zod_1 = require("zod");
exports.recordAnalyticsSchema = zod_1.z.object({
    scheduledPostId: zod_1.z.string().uuid().optional(),
    contentId: zod_1.z.string().uuid().optional(),
    platform: zod_1.z.string().trim().min(1).optional(),
    postExternalId: zod_1.z.string().trim().min(1).optional(),
    postType: zod_1.z.string().trim().min(1).optional(),
    caption: zod_1.z.string().trim().min(1).optional(),
    mediaUrl: zod_1.z.string().trim().min(1).optional(),
    thumbnailUrl: zod_1.z.string().trim().min(1).optional(),
    reach: zod_1.z.number().int().min(0).optional(),
    impressions: zod_1.z.number().int().min(0).optional(),
    likes: zod_1.z.number().int().min(0).optional(),
    comments: zod_1.z.number().int().min(0).optional(),
    shares: zod_1.z.number().int().min(0).optional(),
    saves: zod_1.z.number().int().min(0).optional(),
    reactions: zod_1.z.number().int().min(0).optional(),
    videoPlays: zod_1.z.number().int().min(0).optional(),
    replays: zod_1.z.number().int().min(0).optional(),
    exits: zod_1.z.number().int().min(0).optional(),
    profileVisits: zod_1.z.number().int().min(0).optional(),
    postClicks: zod_1.z.number().int().min(0).optional(),
    pageLikes: zod_1.z.number().int().min(0).optional(),
    completionRate: zod_1.z.number().min(0).max(100).nullable().optional(),
    followersAtPostTime: zod_1.z.number().int().min(0).nullable().optional(),
    engagementRate: zod_1.z.number().min(0).max(10000).nullable().optional(),
    publishedTime: zod_1.z.string().datetime().optional(),
    topComments: zod_1.z.array(zod_1.z.string().trim().min(1)).max(20).optional(),
    recordedAt: zod_1.z.string().datetime().optional(),
});
