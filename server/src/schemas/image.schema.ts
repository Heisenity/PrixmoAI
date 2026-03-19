import { z } from 'zod';

export const generateImageSchema = z.object({
  contentId: z.string().uuid().optional(),
  sourceImageUrl: z.url({ error: 'Invalid source image URL' }).optional(),
  productName: z.string().trim().min(1, 'Product name is required'),
  productDescription: z.string().trim().min(1).optional(),
  backgroundStyle: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).optional(),
  negativePrompt: z.string().trim().min(1).optional(),
  width: z.number().int().min(256).max(1024).optional(),
  height: z.number().int().min(256).max(1024).optional(),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;
