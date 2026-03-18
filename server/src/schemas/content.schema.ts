import { z } from 'zod';

export const generateContentSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  type: z.string().min(1, 'Content type is required').optional(),
  tone: z.string().min(1, 'Tone must not be empty').optional(),
  platform: z.string().min(1, 'Platform must not be empty').optional(),
});

export type GenerateContentInput = z.infer<typeof generateContentSchema>;
