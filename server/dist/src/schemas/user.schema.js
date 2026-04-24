"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.brandDescriptionSuggestionSchema = exports.usernameAvailabilitySchema = exports.industrySuggestionSchema = exports.authProfileSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
const dictationLanguages_1 = require("../lib/dictationLanguages");
const username_1 = require("../lib/username");
const usernameFieldSchema = zod_1.z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .refine((value) => (0, username_1.isValidNormalizedUsername)((0, username_1.normalizeUsername)(value)), 'Use 3-30 letters, numbers, dots, or underscores in the username');
exports.createUserSchema = zod_1.z.object({
    email: zod_1.z.email({ error: 'Invalid email format' }),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    username: zod_1.z.string().optional(),
});
exports.authProfileSchema = zod_1.z.object({
    brandName: zod_1.z.string().trim().min(1, 'Brand name is required'),
    fullName: zod_1.z.string().trim().min(1, 'Full name is required'),
    phoneNumber: zod_1.z
        .string()
        .trim()
        .regex(/^[0-9+()\-\s]{10,20}$/, 'Enter a valid phone number'),
    username: usernameFieldSchema,
    avatarUrl: zod_1.z.url({ error: 'Invalid avatar URL' }).optional(),
    country: zod_1.z.string().trim().min(1, 'Country must not be empty').optional(),
    language: zod_1.z.string().trim().min(1, 'Language must not be empty').optional(),
    websiteUrl: zod_1.z.url({ error: 'Invalid website URL' }).optional(),
    logoUrl: zod_1.z.url({ error: 'Invalid logo URL' }).optional(),
    primaryColor: zod_1.z
        .string()
        .trim()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a hex color like #1F2937')
        .optional(),
    secondaryColor: zod_1.z
        .string()
        .trim()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Secondary color must be a hex color like #F59E0B')
        .optional(),
    accentColor: zod_1.z
        .string()
        .trim()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Accent color must be a hex color like #10B981')
        .optional(),
    industry: zod_1.z.string().trim().min(1, 'Industry must not be empty').optional(),
    primaryIndustry: zod_1.z
        .string()
        .trim()
        .min(1, 'Primary industry must not be empty')
        .optional(),
    secondaryIndustries: zod_1.z
        .array(zod_1.z.string().trim().min(1, 'Secondary industry must not be empty'))
        .max(3, 'Choose up to 3 secondary industries')
        .optional(),
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
    saveContext: zod_1.z.enum(['onboarding', 'settings', 'system']).optional(),
});
exports.industrySuggestionSchema = zod_1.z.object({
    brandName: zod_1.z.string().trim().min(1, 'Brand name is required'),
    username: zod_1.z.string().trim().optional(),
    description: zod_1.z.string().trim().optional(),
    websiteUrl: zod_1.z.url({ error: 'Invalid website URL' }).optional(),
    socialContext: zod_1.z.string().trim().optional(),
    suggestionText: zod_1.z
        .string()
        .trim()
        .min(1, 'Tell PrixmoAI what problem your business solves'),
    requestContext: zod_1.z.enum(['onboarding', 'settings', 'system']).optional(),
    catalog: zod_1.z
        .array(zod_1.z.object({
        label: zod_1.z.string().trim().min(1, 'Industry label is required'),
        category: zod_1.z.string().trim().min(1, 'Industry category is required'),
        tags: zod_1.z.array(zod_1.z.string().trim().min(1)).max(16).optional(),
    }))
        .min(1, 'Industry catalog is required')
        .max(250, 'Industry catalog is too large'),
});
exports.usernameAvailabilitySchema = zod_1.z.object({
    desiredUsername: usernameFieldSchema,
    brandName: zod_1.z.string().trim().optional(),
    fullName: zod_1.z.string().trim().optional(),
    requestContext: zod_1.z.enum(['onboarding', 'settings', 'system']).optional(),
});
exports.brandDescriptionSuggestionSchema = zod_1.z.object({
    brandName: zod_1.z.string().trim().min(1, 'Brand name is required'),
    fullName: zod_1.z.string().trim().optional(),
    username: zod_1.z.string().trim().optional(),
    websiteUrl: zod_1.z.url({ error: 'Invalid website URL' }).optional(),
    industry: zod_1.z.string().trim().min(1, 'Industry summary is required'),
    primaryIndustry: zod_1.z.string().trim().min(1, 'Primary industry is required'),
    secondaryIndustries: zod_1.z
        .array(zod_1.z.string().trim().min(1, 'Secondary industry must not be empty'))
        .min(1, 'Add at least one secondary industry')
        .max(5, 'Choose up to 5 secondary industries'),
    targetAudience: zod_1.z.string().trim().optional(),
    brandVoice: zod_1.z.string().trim().min(1, 'Brand voice is required'),
    socialContext: zod_1.z.string().trim().optional(),
    existingDescription: zod_1.z
        .string()
        .trim()
        .max(500, 'Description must be 500 characters or fewer')
        .optional(),
    shortInput: zod_1.z
        .string()
        .trim()
        .min(1, 'Add a short brand note first')
        .max(1600, 'Short brand note must stay under 1600 characters'),
    language: zod_1.z.enum(dictationLanguages_1.SUPPORTED_DICTATION_LANGUAGE_VALUES, {
        message: 'Selected dictation language is not supported.',
    }),
    requestContext: zod_1.z.enum(['onboarding', 'settings', 'system']).optional(),
});
