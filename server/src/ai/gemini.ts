import dotenv from 'dotenv';
import { z } from 'zod';
import {
  CAPTION_VARIATION_COUNT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  GEMINI_GENERATION_TIMEOUT_MS,
  GROQ_GENERATION_TIMEOUT_MS,
  HASHTAG_VARIATION_COUNT,
} from '../config/constants';
import type {
  BrandProfile,
  CaptionVariant,
  GeneratedContentPack,
  ProductInput,
  ReelScript,
} from '../types';
import { buildCaptionPrompt } from './prompts/caption.prompt';
import { buildHashtagPrompt } from './prompts/hashtag.prompt';
import { buildReelScriptPrompt } from './prompts/script.prompt';

dotenv.config();

type GenerationProvider = 'gemini' | 'groq';

type GeminiPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

type GroqMessage = {
  content?: string | null;
};

type GroqChoice = {
  message?: GroqMessage | null;
};

type GroqResponse = {
  choices?: GroqChoice[];
};

type GenerationRequestOptions = {
  includeReelScript?: boolean;
};

type GeneratedContentPackWithProvider = {
  contentPack: GeneratedContentPack;
  provider: GenerationProvider;
};

type ProviderFailure = {
  provider: GenerationProvider;
  message: string;
};

const CONTENT_GENERATION_RETRY_MESSAGE =
  'We couldn’t complete your request right now. Please try again in a moment.';

export class ContentGenerationProvidersExhaustedError extends Error {
  readonly failures: ProviderFailure[];

  constructor(failures: ProviderFailure[]) {
    super(CONTENT_GENERATION_RETRY_MESSAGE);
    this.name = 'ContentGenerationProvidersExhaustedError';
    this.failures = failures;
  }
}

const PROVIDER_TIMEOUTS: Record<GenerationProvider, number> = {
  gemini: GEMINI_GENERATION_TIMEOUT_MS,
  groq: GROQ_GENERATION_TIMEOUT_MS,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractTextValue = (value: unknown, depth = 0): string => {
  if (depth > 4) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => extractTextValue(entry, depth + 1))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  if (!isRecord(value)) {
    return '';
  }

  const preferredKeys = ['text', 'value', 'content', 'copy', 'message', 'script'];

  for (const key of preferredKeys) {
    const normalized = extractTextValue(value[key], depth + 1);

    if (normalized) {
      return normalized;
    }
  }

  const combined = Object.values(value)
    .map((entry) => extractTextValue(entry, depth + 1))
    .filter(Boolean)
    .join(' ')
    .trim();

  return combined;
};

const requiredTextSchema = z.preprocess(
  (value) => extractTextValue(value),
  z.string().trim().min(1)
);

const optionalTextSchema = z.preprocess(
  (value) => {
    const normalized = extractTextValue(value);
    return normalized || undefined;
  },
  z.string().trim().min(1).optional()
);

const captionVariantSchema = z
  .object({
    hook: requiredTextSchema,
    mainCopy: requiredTextSchema,
    shortCaption: optionalTextSchema,
    Caption: optionalTextSchema,
    cta: requiredTextSchema,
  })
  .transform((value) => ({
    hook: value.hook,
    mainCopy: value.mainCopy,
    shortCaption: value.shortCaption ?? value.Caption ?? '',
    cta: value.cta,
  }));

const captionResponseSchema = z.object({
  captions: z.array(captionVariantSchema).min(CAPTION_VARIATION_COUNT),
});

const hashtagResponseSchema = z.object({
  hashtags: z.array(requiredTextSchema).min(HASHTAG_VARIATION_COUNT),
});

const reelScriptSchema = z.object({
  hook: requiredTextSchema,
  body: requiredTextSchema,
  cta: requiredTextSchema,
});

const reelScriptResponseSchema = z.preprocess(
  (value) => {
    if (!isRecord(value)) {
      return value;
    }

    if (isRecord(value.reelScript)) {
      return value;
    }

    const alternate =
      value.script ?? value.reel_script ?? value.reel ?? value.videoScript;

    return isRecord(alternate)
      ? {
          ...value,
          reelScript: alternate,
        }
      : value;
  },
  z.object({
    reelScript: reelScriptSchema,
  })
);

const EMPTY_REEL_SCRIPT: ReelScript = {
  hook: '',
  body: '',
  cta: '',
};

const extractJson = (rawText: string): unknown => {
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : rawText.trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('Provider did not return valid JSON');
  }
};

const toProviderErrorMessage = (
  provider: GenerationProvider,
  responseText: string,
  status: number
) => {
  const compactText = responseText.trim().replace(/\s+/g, ' ').slice(0, 280);

  if (compactText) {
    return `${provider} request failed (${status}): ${compactText}`;
  }

  return `${provider} request failed (${status})`;
};

const withTimeout = async <T>(
  provider: GenerationProvider,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUTS[provider]);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${provider} request timed out`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const callGemini = async (
  prompt: string,
  signal: AbortSignal
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(
      toProviderErrorMessage('gemini', await response.text(), response.status)
    );
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('gemini returned an empty response');
  }

  return text;
};

const callGroq = async (prompt: string, signal: AbortSignal): Promise<string> => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_GROQ_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      toProviderErrorMessage('groq', await response.text(), response.status)
    );
  }

  const data = (await response.json()) as GroqResponse;
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error('groq returned an empty response');
  }

  return text;
};

const callProvider = async (
  provider: GenerationProvider,
  prompt: string
): Promise<string> =>
  withTimeout(provider, (signal) =>
    provider === 'gemini'
      ? callGemini(prompt, signal)
      : callGroq(prompt, signal)
  );

const generateStructuredResponseWithProvider = async <T>(
  provider: GenerationProvider,
  prompt: string,
  schema: z.ZodType<T>
): Promise<T> => {
  const rawText = await callProvider(provider, prompt);
  const parsedJson = extractJson(rawText);
  const result = schema.safeParse(parsedJson);

  if (result.success) {
    return result.data;
  }

  const firstIssue = result.error.issues[0];
  const fieldPath = firstIssue?.path.join('.') || 'response';

  throw new Error(
    `${provider} returned an unexpected ${fieldPath} format. Please try again.`
  );
};

const normalizeHashtag = (value: string): string => {
  const cleaned = value.trim().replace(/\s+/g, '');

  if (!cleaned) {
    return cleaned;
  }

  return cleaned.startsWith('#')
    ? cleaned.toLowerCase()
    : `#${cleaned.toLowerCase()}`;
};

const generateCaptionsWithProvider = async (
  provider: GenerationProvider,
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<CaptionVariant[]> => {
  const response = await generateStructuredResponseWithProvider(
    provider,
    buildCaptionPrompt(brandProfile, productInput),
    captionResponseSchema
  );

  const captions = response.captions
    .map((caption) => ({
      hook: caption.hook.trim(),
      mainCopy: caption.mainCopy.trim(),
      shortCaption: caption.shortCaption.trim(),
      cta: caption.cta.trim(),
    }))
    .filter(
      (caption) =>
        caption.hook &&
        caption.mainCopy &&
        caption.shortCaption &&
        caption.cta
    )
    .slice(0, CAPTION_VARIATION_COUNT);

  if (captions.length < CAPTION_VARIATION_COUNT) {
    throw new Error(`${provider} did not return enough caption options`);
  }

  return captions;
};

const generateHashtagsWithProvider = async (
  provider: GenerationProvider,
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<string[]> => {
  const response = await generateStructuredResponseWithProvider(
    provider,
    buildHashtagPrompt(brandProfile, productInput),
    hashtagResponseSchema
  );

  const hashtags = Array.from(
    new Set(response.hashtags.map(normalizeHashtag).filter(Boolean))
  ).slice(0, HASHTAG_VARIATION_COUNT);

  if (hashtags.length < HASHTAG_VARIATION_COUNT) {
    throw new Error(`${provider} did not return enough hashtag options`);
  }

  return hashtags;
};

const generateReelScriptWithProvider = async (
  provider: GenerationProvider,
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<ReelScript> => {
  const response = await generateStructuredResponseWithProvider(
    provider,
    buildReelScriptPrompt(brandProfile, productInput),
    reelScriptResponseSchema
  );

  return response.reelScript;
};

const generateContentPackWithProvider = async (
  provider: GenerationProvider,
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  options: GenerationRequestOptions = {}
): Promise<GeneratedContentPack> => {
  const includeReelScript = options.includeReelScript ?? true;
  const [captions, hashtags] = await Promise.all([
    generateCaptionsWithProvider(provider, brandProfile, productInput),
    generateHashtagsWithProvider(provider, brandProfile, productInput),
  ]);
  let reelScript = EMPTY_REEL_SCRIPT;

  if (includeReelScript) {
    try {
      reelScript = await generateReelScriptWithProvider(
        provider,
        brandProfile,
        productInput
      );
    } catch (error) {
      console.warn(
        `[content-generation] ${provider} reel script generation failed; continuing with captions and hashtags only.`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    captions,
    hashtags,
    reelScript,
  };
};

export const generateCaptions = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<CaptionVariant[]> =>
  generateCaptionsWithProvider('gemini', brandProfile, productInput);

export const generateHashtags = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<string[]> =>
  generateHashtagsWithProvider('gemini', brandProfile, productInput);

export const generateReelScript = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<ReelScript> =>
  generateReelScriptWithProvider('gemini', brandProfile, productInput);

export const hasMeaningfulReelScript = (script: ReelScript): boolean =>
  Boolean(script.hook.trim() && script.body.trim() && script.cta.trim());

export const generateContentPackWithFallback = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  options: GenerationRequestOptions = {}
): Promise<GeneratedContentPackWithProvider> => {
  const failures: ProviderFailure[] = [];

  try {
    const contentPack = await generateContentPackWithProvider(
      'gemini',
      brandProfile,
      productInput,
      options
    );

    return {
      contentPack,
      provider: 'gemini',
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'gemini request failed';
    failures.push({
      provider: 'gemini',
      message,
    });
    console.warn(
      '[content-generation] Gemini failed; falling back to Groq.',
      message
    );
  }

  try {
    const contentPack = await generateContentPackWithProvider(
      'groq',
      brandProfile,
      productInput,
      options
    );

    return {
      contentPack,
      provider: 'groq',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'groq request failed';
    failures.push({
      provider: 'groq',
      message,
    });

    throw new ContentGenerationProvidersExhaustedError(failures);
  }
};

export const generateContentPack = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  options: GenerationRequestOptions = {}
): Promise<GeneratedContentPack> => {
  const result = await generateContentPackWithFallback(
    brandProfile,
    productInput,
    options
  );

  return result.contentPack;
};
