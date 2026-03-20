"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAnalyticsSchema = void 0;
const zod_1 = require("zod");
exports.recordAnalyticsSchema = zod_1.z.object({
    scheduledPostId: zod_1.z.string().uuid().optional(),
    contentId: zod_1.z.string().uuid().optional(),
    platform: zod_1.z.string().trim().min(1).optional(),
    postExternalId: zod_1.z.string().trim().min(1).optional(),
    reach: zod_1.z.number().int().min(0).optional(),
    impressions: zod_1.z.number().int().min(0).optional(),
    likes: zod_1.z.number().int().min(0).optional(),
    comments: zod_1.z.number().int().min(0).optional(),
    shares: zod_1.z.number().int().min(0).optional(),
    saves: zod_1.z.number().int().min(0).optional(),
    engagementRate: zod_1.z.number().min(0).max(10000).nullable().optional(),
    recordedAt: zod_1.z.string().datetime().optional(),
});
