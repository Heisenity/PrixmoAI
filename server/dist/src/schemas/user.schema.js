"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authProfileSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
exports.createUserSchema = zod_1.z.object({
    email: zod_1.z.email({ error: 'Invalid email format' }),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    username: zod_1.z.string().optional(),
});
exports.authProfileSchema = zod_1.z.object({
    fullName: zod_1.z.string().trim().min(1, 'Full name is required'),
    phoneNumber: zod_1.z
        .string()
        .trim()
        .regex(/^[0-9+()\-\s]{10,20}$/, 'Enter a valid phone number'),
    username: zod_1.z
        .string()
        .trim()
        .min(3, 'Username must be at least 3 characters')
        .optional(),
    avatarUrl: zod_1.z.url({ error: 'Invalid avatar URL' }).optional(),
    industry: zod_1.z.string().trim().min(1, 'Industry must not be empty').optional(),
    targetAudience: zod_1.z
        .string()
        .trim()
        .min(1, 'Target audience must not be empty')
        .optional(),
    brandVoice: zod_1.z
        .string()
        .trim()
        .min(1, 'Brand voice must not be empty')
        .optional(),
    description: zod_1.z
        .string()
        .trim()
        .max(500, 'Description must be 500 characters or fewer')
        .optional(),
});
