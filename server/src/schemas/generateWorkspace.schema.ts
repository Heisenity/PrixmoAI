import { z } from 'zod';
import { generateContentSchema } from './content.schema';
import { generateImageSchema } from './image.schema';

export const createGenerateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  type: z.enum(['copy', 'image', 'mixed']).optional(),
});

export const updateGenerateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.isArchived !== undefined,
    'At least one field is required'
  );

export const generateConversationCopySchema = generateContentSchema.extend({
  conversationId: z.string().uuid().optional(),
});

export const generateConversationImageSchema = generateImageSchema.extend({
  conversationId: z.string().uuid().optional(),
});

export type CreateGenerateConversationInput = z.infer<
  typeof createGenerateConversationSchema
>;
export type UpdateGenerateConversationInput = z.infer<
  typeof updateGenerateConversationSchema
>;
export type GenerateConversationCopyInput = z.infer<
  typeof generateConversationCopySchema
>;
export type GenerateConversationImageInput = z.infer<
  typeof generateConversationImageSchema
>;
