import { z } from 'zod';

export const authEmailSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }).transform((value) =>
    value.trim().toLowerCase()
  ),
});

export const passwordLoginSchema = authEmailSchema.extend({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be 72 characters or fewer'),
});

export const authSessionSchema = z.object({
  accessToken: z.string().trim().min(1, 'Access token is required'),
  refreshToken: z.string().trim().min(1, 'Refresh token is required').optional(),
});

export const updatePasswordSchema = authSessionSchema.extend({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be 72 characters or fewer'),
});

export type AuthEmailInput = z.infer<typeof authEmailSchema>;
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;
export type AuthSessionInput = z.infer<typeof authSessionSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
