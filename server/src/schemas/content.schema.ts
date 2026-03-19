import { z } from 'zod';

export const generateContentSchema = z.object({
  productName: z.string().trim().min(1, 'Product name is required'),
  productDescription: z.string().trim().min(1).optional(),
  productImageUrl: z.url({ error: 'Invalid product image URL' }).optional(),
  platform: z.string().trim().min(1).optional(),
  goal: z.string().trim().min(1).optional(),
  tone: z.string().trim().min(1).optional(),
  audience: z.string().trim().min(1).optional(),
  keywords: z.array(z.string().trim().min(1)).max(20).optional(),
});

export type GenerateContentInput = z.infer<typeof generateContentSchema>;
