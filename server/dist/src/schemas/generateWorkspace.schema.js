"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConversationImageSchema = exports.generateConversationCopySchema = exports.updateGenerateConversationSchema = exports.createGenerateConversationSchema = void 0;
const zod_1 = require("zod");
const content_schema_1 = require("./content.schema");
const image_schema_1 = require("./image.schema");
exports.createGenerateConversationSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(120).optional(),
    type: zod_1.z.enum(['copy', 'image', 'mixed']).optional(),
});
exports.updateGenerateConversationSchema = zod_1.z
    .object({
    title: zod_1.z.string().trim().min(1).max(120).optional(),
    isArchived: zod_1.z.boolean().optional(),
})
    .refine((value) => value.title !== undefined || value.isArchived !== undefined, 'At least one field is required');
exports.generateConversationCopySchema = content_schema_1.generateContentSchema.extend({
    conversationId: zod_1.z.string().uuid().optional(),
});
exports.generateConversationImageSchema = image_schema_1.generateImageSchema.extend({
    conversationId: zod_1.z.string().uuid().optional(),
});
