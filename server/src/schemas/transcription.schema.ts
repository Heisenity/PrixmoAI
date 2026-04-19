import { z } from 'zod';

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
});

export type TranscribeAudioInput = z.infer<typeof transcribeAudioSchema>;
