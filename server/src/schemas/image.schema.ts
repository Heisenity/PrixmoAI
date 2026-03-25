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

export const generateImageSchema = z.object({
  contentId: z.string().uuid().optional(),
  sourceImageUrl: optionalTrimmedUrl('Please enter a valid source image URL'),
  useBrandName: z.boolean().optional(),
  productName: z.string().trim().min(1, 'Product name is required'),
  productDescription: optionalTrimmedString(),
  backgroundStyle: optionalTrimmedString(),
  prompt: optionalTrimmedString(),
  negativePrompt: optionalTrimmedString(),
  width: z.number().int().min(256).max(1024).optional(),
  height: z.number().int().min(256).max(1024).optional(),
});

export const uploadSourceImageSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required'),
  contentType: z
    .string()
    .trim()
    .refine(
      (value) => ['image/jpeg', 'image/png', 'image/webp'].includes(value),
      'Only JPG, PNG, and WEBP images are supported'
    ),
  dataUrl: z
    .string()
    .trim()
    .regex(
      /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/,
      'Upload payload must be a valid base64 image'
    ),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;
export type UploadSourceImageInput = z.infer<typeof uploadSourceImageSchema>;
