import { z } from 'zod';

const optionalTrimmedString = (message?: string) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    message
      ? z.string().trim().min(1, message).optional()
      : z.string().trim().min(1).optional()
  );

const optionalTrimmedUrl = (message: string) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().url(message).optional()
  );

export const generateContentSchema = z.object({
  productName: z.string().trim().min(1, 'Product name is required'),
  productDescription: optionalTrimmedString(),
  productImageUrl: optionalTrimmedUrl('Please enter a valid product image URL'),
  platform: optionalTrimmedString(),
  goal: optionalTrimmedString(),
  tone: optionalTrimmedString(),
  audience: optionalTrimmedString(),
  keywords: z.array(z.string().trim().min(1)).max(20).optional(),
});

export type GenerateContentInput = z.infer<typeof generateContentSchema>;
