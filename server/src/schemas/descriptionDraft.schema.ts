import { z } from 'zod';
import { SUPPORTED_DICTATION_LANGUAGE_VALUES } from '../lib/dictationLanguages';

const draftScopeSchema = z
  .string()
  .trim()
  .min(1, 'Draft scope is required.')
  .max(120, 'Draft scope must stay under 120 characters.');

const draftLanguageSchema = z.enum(SUPPORTED_DICTATION_LANGUAGE_VALUES, {
  message: 'Selected draft language is not supported.',
});

export const listDescriptionDraftsSchema = z.object({
  scope: draftScopeSchema,
});

export const upsertDescriptionDraftSchema = z.object({
  scope: draftScopeSchema,
  language: draftLanguageSchema,
  text: z
    .string()
    .trim()
    .min(1, 'Draft text is required.')
    .max(12000, 'Draft text must stay under 12000 characters.'),
});

export const deleteDescriptionDraftSchema = z.object({
  scope: draftScopeSchema,
  language: draftLanguageSchema,
});

export type ListDescriptionDraftsInput = z.infer<typeof listDescriptionDraftsSchema>;
export type UpsertDescriptionDraftInput = z.infer<typeof upsertDescriptionDraftSchema>;
export type DeleteDescriptionDraftInput = z.infer<typeof deleteDescriptionDraftSchema>;
