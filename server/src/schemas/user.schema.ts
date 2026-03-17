import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email({ error: 'Invalid email format' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const authProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  username: z.string().min(3, 'Username must be at least 3 characters').optional(),
  avatarUrl: z.url({ error: 'Invalid avatar URL' }).optional(),
});

export type AuthProfileInput = z.infer<typeof authProfileSchema>;
