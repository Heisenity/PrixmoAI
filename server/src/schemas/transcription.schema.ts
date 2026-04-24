import { z } from 'zod';
import { SUPPORTED_DICTATION_LANGUAGE_VALUES } from '../lib/dictationLanguages';

const optionalTrimmedString = (message?: string) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    message
      ? z.string().trim().min(1, message).optional()
      : z.string().trim().min(1).optional()
  );

const isSupportedAudioMimeType = (value: string) =>
  [
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/ogg',
    'audio/ogg;codecs=opus',
  ].includes(value.trim().toLowerCase());

export const transcribeAudioSchema = z.object({
  audioBase64: z
    .string()
    .trim()
    .min(1, 'Audio payload is required')
    .regex(/^[a-zA-Z0-9+/=]+$/, 'Audio payload must be valid base64'),
  mimeType: z
    .string()
    .trim()
    .min(1, 'Audio format is required')
    .refine(isSupportedAudioMimeType, 'That audio format is not supported right now.'),
  languageHint: optionalTrimmedString(),
  previousContext: optionalTrimmedString().refine(
    (value) => !value || value.length <= 320,
    'Context must stay under 320 characters.'
  ),
  stage: z.enum(['stream', 'final']).optional(),
});

export const transcribeAudioSchemaRefined = transcribeAudioSchema.refine(
  (value) =>
    !value.languageHint ||
    SUPPORTED_DICTATION_LANGUAGE_VALUES.includes(
      value.languageHint.trim().toLowerCase() as (typeof SUPPORTED_DICTATION_LANGUAGE_VALUES)[number]
    ),
  {
    message: 'Selected dictation language is not supported.',
    path: ['languageHint'],
  }
);

export type TranscribeAudioInput = z.infer<typeof transcribeAudioSchemaRefined>;
