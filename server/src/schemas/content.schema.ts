//content generation request flow
import { z } from "zod";

export const contentGenerationSchema = z.object({
  topic: z.string().min(3, "Topic must be at least 3 characters"),
  platform: z.string().min(1, "Platform is required"),
  tone: z.string().min(1, "Tone is required"),
  format: z.string().min(1, "Format is required"),
  length: z.string().optional(),
});

export type ContentGenerationInput = z.infer<typeof contentGenerationSchema>;

//delete content history flow
export const deleteContentHistorySchema = z.object({
  id: z.string().min(1, "Content ID is required"),
});