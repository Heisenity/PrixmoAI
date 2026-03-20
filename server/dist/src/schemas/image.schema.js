"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImageSchema = void 0;
const zod_1 = require("zod");
exports.generateImageSchema = zod_1.z.object({
    contentId: zod_1.z.string().uuid().optional(),
    sourceImageUrl: zod_1.z.url({ error: 'Invalid source image URL' }).optional(),
    productName: zod_1.z.string().trim().min(1, 'Product name is required'),
    productDescription: zod_1.z.string().trim().min(1).optional(),
    backgroundStyle: zod_1.z.string().trim().min(1).optional(),
    prompt: zod_1.z.string().trim().min(1).optional(),
    negativePrompt: zod_1.z.string().trim().min(1).optional(),
    width: zod_1.z.number().int().min(256).max(1024).optional(),
    height: zod_1.z.number().int().min(256).max(1024).optional(),
});
