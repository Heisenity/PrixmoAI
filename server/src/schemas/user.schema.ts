import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email({ error: 'Invalid email format' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const authProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9+()\-\s]{10,20}$/, 'Enter a valid phone number'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .optional(),
  avatarUrl: z.url({ error: 'Invalid avatar URL' }).optional(),
  industry: z.string().trim().min(1, 'Industry must not be empty').optional(),
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
});

export type AuthProfileInput = z.infer<typeof authProfileSchema>;
