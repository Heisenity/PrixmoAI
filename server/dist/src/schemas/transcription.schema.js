"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeAudioSchemaRefined = exports.transcribeAudioSchema = void 0;
const zod_1 = require("zod");
const dictationLanguages_1 = require("../lib/dictationLanguages");
const optionalTrimmedString = (message) => zod_1.z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, message
    ? zod_1.z.string().trim().min(1, message).optional()
    : zod_1.z.string().trim().min(1).optional());
const isSupportedAudioMimeType = (value) => [
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
exports.transcribeAudioSchema = zod_1.z.object({
    audioBase64: zod_1.z
        .string()
        .trim()
        .min(1, 'Audio payload is required')
        .regex(/^[a-zA-Z0-9+/=]+$/, 'Audio payload must be valid base64'),
    mimeType: zod_1.z
        .string()
        .trim()
        .min(1, 'Audio format is required')
        .refine(isSupportedAudioMimeType, 'That audio format is not supported right now.'),
    languageHint: optionalTrimmedString(),
    previousContext: optionalTrimmedString().refine((value) => !value || value.length <= 320, 'Context must stay under 320 characters.'),
    stage: zod_1.z.enum(['stream', 'final']).optional(),
});
exports.transcribeAudioSchemaRefined = exports.transcribeAudioSchema.refine((value) => !value.languageHint ||
    dictationLanguages_1.SUPPORTED_DICTATION_LANGUAGE_VALUES.includes(value.languageHint.trim().toLowerCase()), {
    message: 'Selected dictation language is not supported.',
    path: ['languageHint'],
});
