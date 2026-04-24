import { z } from 'zod';
import { SUPPORTED_DICTATION_LANGUAGE_VALUES } from '../lib/dictationLanguages';
import { isValidNormalizedUsername, normalizeUsername } from '../lib/username';

const usernameFieldSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be 30 characters or fewer')
  .refine(
    (value) => isValidNormalizedUsername(normalizeUsername(value)),
    'Use 3-30 letters, numbers, dots, or underscores in the username'
  );

export const createUserSchema = z.object({
  email: z.email({ error: 'Invalid email format' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const authProfileSchema = z.object({
  brandName: z.string().trim().min(1, 'Brand name is required'),
  fullName: z.string().trim().min(1, 'Full name is required'),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9+()\-\s]{10,20}$/, 'Enter a valid phone number'),
  username: usernameFieldSchema,
  avatarUrl: z.url({ error: 'Invalid avatar URL' }).optional(),
  country: z.string().trim().min(1, 'Country must not be empty').optional(),
  language: z.string().trim().min(1, 'Language must not be empty').optional(),
  websiteUrl: z.url({ error: 'Invalid website URL' }).optional(),
  logoUrl: z.url({ error: 'Invalid logo URL' }).optional(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a hex color like #1F2937')
    .optional(),
  secondaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Secondary color must be a hex color like #F59E0B')
    .optional(),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Accent color must be a hex color like #10B981')
    .optional(),
  industry: z.string().trim().min(1, 'Industry must not be empty').optional(),
  primaryIndustry: z
    .string()
    .trim()
    .min(1, 'Primary industry must not be empty')
    .optional(),
  secondaryIndustries: z
    .array(z.string().trim().min(1, 'Secondary industry must not be empty'))
    .max(3, 'Choose up to 3 secondary industries')
    .optional(),
  targetAudience: z
    .string()
    .trim()
    .min(1, 'Target audience must not be empty')
    .optional(),
  brandVoice: z
    .string()
    .trim()
    .min(1, 'Brand voice must not be empty')
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer')
    .optional(),
  saveContext: z.enum(['onboarding', 'settings', 'system']).optional(),
});

export type AuthProfileInput = z.infer<typeof authProfileSchema>;

export const industrySuggestionSchema = z.object({
  brandName: z.string().trim().min(1, 'Brand name is required'),
  username: z.string().trim().optional(),
  description: z.string().trim().optional(),
  websiteUrl: z.url({ error: 'Invalid website URL' }).optional(),
  socialContext: z.string().trim().optional(),
  suggestionText: z
    .string()
    .trim()
    .min(1, 'Tell PrixmoAI what problem your business solves'),
  requestContext: z.enum(['onboarding', 'settings', 'system']).optional(),
  catalog: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Industry label is required'),
        category: z.string().trim().min(1, 'Industry category is required'),
        tags: z.array(z.string().trim().min(1)).max(16).optional(),
      })
    )
    .min(1, 'Industry catalog is required')
    .max(250, 'Industry catalog is too large'),
});

export type IndustrySuggestionInput = z.infer<typeof industrySuggestionSchema>;

export const usernameAvailabilitySchema = z.object({
  desiredUsername: usernameFieldSchema,
  brandName: z.string().trim().optional(),
  fullName: z.string().trim().optional(),
  requestContext: z.enum(['onboarding', 'settings', 'system']).optional(),
});

export type UsernameAvailabilityInput = z.infer<typeof usernameAvailabilitySchema>;

export const brandDescriptionSuggestionSchema = z.object({
  brandName: z.string().trim().min(1, 'Brand name is required'),
  fullName: z.string().trim().optional(),
  username: z.string().trim().optional(),
  websiteUrl: z.url({ error: 'Invalid website URL' }).optional(),
  industry: z.string().trim().min(1, 'Industry summary is required'),
  primaryIndustry: z.string().trim().min(1, 'Primary industry is required'),
  secondaryIndustries: z
    .array(z.string().trim().min(1, 'Secondary industry must not be empty'))
    .min(1, 'Add at least one secondary industry')
    .max(5, 'Choose up to 5 secondary industries'),
  targetAudience: z.string().trim().optional(),
  brandVoice: z.string().trim().min(1, 'Brand voice is required'),
  socialContext: z.string().trim().optional(),
  existingDescription: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer')
    .optional(),
  shortInput: z
    .string()
    .trim()
    .min(1, 'Add a short brand note first')
    .max(1600, 'Short brand note must stay under 1600 characters'),
  language: z.enum(SUPPORTED_DICTATION_LANGUAGE_VALUES, {
    message: 'Selected dictation language is not supported.',
  }),
  requestContext: z.enum(['onboarding', 'settings', 'system']).optional(),
});

export type BrandDescriptionSuggestionInput = z.infer<
  typeof brandDescriptionSuggestionSchema
>;
