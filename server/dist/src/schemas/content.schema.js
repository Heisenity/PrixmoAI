"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContentSchema = void 0;
const zod_1 = require("zod");
exports.generateContentSchema = zod_1.z.object({
    productName: zod_1.z.string().trim().min(1, 'Product name is required'),
    productDescription: zod_1.z.string().trim().min(1).optional(),
    productImageUrl: zod_1.z.url({ error: 'Invalid product image URL' }).optional(),
    platform: zod_1.z.string().trim().min(1).optional(),
    goal: zod_1.z.string().trim().min(1).optional(),
    tone: zod_1.z.string().trim().min(1).optional(),
    audience: zod_1.z.string().trim().min(1).optional(),
    keywords: zod_1.z.array(zod_1.z.string().trim().min(1)).max(20).optional(),
});
