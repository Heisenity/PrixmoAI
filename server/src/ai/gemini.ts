import dotenv from 'dotenv';
import { z } from 'zod';
import {
  CAPTION_VARIATION_COUNT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  GEMINI_GENERATION_TIMEOUT_MS,
  GROQ_FIRST_TOKEN_TIMEOUT_MS,
  GROQ_GENERATION_TIMEOUT_MS,
  GROQ_MAX_GENERATION_TIMEOUT_MS,
  GROQ_STREAM_IDLE_TIMEOUT_MS,
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
import {
  isAbortError,
  RequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';

dotenv.config();

export type GenerationProvider = 'gemini' | 'groq';

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

type GroqDelta = {
  content?: string | null;
};

type GroqChoice = {
  message?: GroqMessage | null;
  delta?: GroqDelta | null;
};

type GroqResponse = {
  choices?: GroqChoice[];
};

type GenerationRequestOptions = {
  includeReelScript?: boolean;
  signal?: AbortSignal;
  onProviderChange?: (
    provider: GenerationProvider
  ) => void | Promise<void>;
};

export type GeneratedContentPackWithProvider = {
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

const formatProviderTimeoutLabel = (timeoutMs: number) => {
  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000}s`;
  }

  return `${(timeoutMs / 1000).toFixed(1)}s`;
};

const createAdaptiveTimeoutController = (baseSignal?: AbortSignal) => {
  const controller = new AbortController();
  let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutMessage = '';

  const abortWithMessage = (message: string) => {
    timeoutMessage = message;
    controller.abort();
  };

  const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer) {
      clearTimeout(timer);
    }
  };

  const startFirstTokenTimer = () => {
    clearTimer(firstTokenTimer);
    firstTokenTimer = setTimeout(() => {
      abortWithMessage(
        `groq request timed out waiting for first token after ${formatProviderTimeoutLabel(
          GROQ_FIRST_TOKEN_TIMEOUT_MS
        )}`
      );
    }, GROQ_FIRST_TOKEN_TIMEOUT_MS);
  };

  const resetIdleTimer = () => {
    clearTimer(idleTimer);
    idleTimer = setTimeout(() => {
      abortWithMessage(
        `groq stream went idle for ${formatProviderTimeoutLabel(
          GROQ_STREAM_IDLE_TIMEOUT_MS
        )}`
      );
    }, GROQ_STREAM_IDLE_TIMEOUT_MS);
  };

  startFirstTokenTimer();
  maxTimer = setTimeout(() => {
    abortWithMessage(
      `groq request reached safety cap after ${formatProviderTimeoutLabel(
        GROQ_MAX_GENERATION_TIMEOUT_MS
      )}`
    );
  }, GROQ_MAX_GENERATION_TIMEOUT_MS);

  const handleBaseAbort = () => {
    controller.abort();
  };

  baseSignal?.addEventListener('abort', handleBaseAbort, { once: true });

  return {
    signal: controller.signal,
    hasTimedOut: () => Boolean(timeoutMessage),
    getTimeoutMessage: () => timeoutMessage,
    markFirstChunkReceived: () => {
      clearTimer(firstTokenTimer);
      firstTokenTimer = null;
      resetIdleTimer();
    },
    markChunkActivity: () => {
      if (firstTokenTimer) {
        clearTimer(firstTokenTimer);
        firstTokenTimer = null;
      }

      resetIdleTimer();
    },
    cleanup: () => {
      clearTimer(firstTokenTimer);
      clearTimer(idleTimer);
      clearTimer(maxTimer);
      baseSignal?.removeEventListener('abort', handleBaseAbort);
    },
  };
};

type AdaptiveTimeoutController = ReturnType<
  typeof createAdaptiveTimeoutController
>;

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
  operation: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal
): Promise<T> => {
  if (provider === 'groq') {
    throwIfRequestCancelled(requestSignal);
    return operation(requestSignal ?? new AbortController().signal);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUTS[provider]);
  const handleRequestAbort = () => {
    controller.abort();
  };

  requestSignal?.addEventListener('abort', handleRequestAbort, {
    once: true,
  });

  try {
    throwIfRequestCancelled(requestSignal);
    return await operation(controller.signal);
  } catch (error) {
    if (isAbortError(error)) {
      if (requestSignal?.aborted) {
        throw new RequestCancelledError();
      }

      throw new Error(
        `${provider} request timed out after ${formatProviderTimeoutLabel(
          PROVIDER_TIMEOUTS[provider]
        )}`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener('abort', handleRequestAbort);
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

const extractGroqStreamChunkText = (payload: string) => {
  const parsed = JSON.parse(payload) as GroqResponse;
  return parsed.choices?.[0]?.delta?.content ?? '';
};

const readGroqStreamText = async (
  response: Response,
  signal: AbortSignal,
  adaptiveTimeout: AdaptiveTimeoutController
) => {
  if (!response.body) {
    throw new Error('groq returned an empty response stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let combinedText = '';
  let hasReceivedFirstChunk = false;

  try {
    while (true) {
      throwIfRequestCancelled(signal);
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!hasReceivedFirstChunk) {
        adaptiveTimeout.markFirstChunkReceived();
        hasReceivedFirstChunk = true;
      } else {
        adaptiveTimeout.markChunkActivity();
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const lines = event
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith('data:')) {
            continue;
          }

          const payload = line.slice(5).trim();

          if (!payload || payload === '[DONE]') {
            continue;
          }

          combinedText += extractGroqStreamChunkText(payload);
        }
      }
    }

    const trailing = buffer.trim();

    if (trailing.startsWith('data:')) {
      const payload = trailing.slice(5).trim();

      if (payload && payload !== '[DONE]') {
        combinedText += extractGroqStreamChunkText(payload);
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      if (adaptiveTimeout.hasTimedOut()) {
        throw new Error(adaptiveTimeout.getTimeoutMessage());
      }

      if (signal.aborted) {
        throw new RequestCancelledError();
      }
    }

    throw error;
  } finally {
    reader.releaseLock();
  }

  return combinedText.trim();
};

const callGroq = async (prompt: string, signal: AbortSignal): Promise<string> => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const adaptiveTimeout = createAdaptiveTimeoutController(signal);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_GROQ_MODEL,
        temperature: 0.7,
        stream: true,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: adaptiveTimeout.signal,
    });

    if (!response.ok) {
      throw new Error(
        toProviderErrorMessage('groq', await response.text(), response.status)
      );
    }

    const text = await readGroqStreamText(response, adaptiveTimeout.signal, adaptiveTimeout);

    if (!text) {
      throw new Error('groq returned an empty response');
    }

    return text;
  } catch (error) {
    if (isAbortError(error)) {
      if (signal.aborted) {
        throw new RequestCancelledError();
      }

      if (adaptiveTimeout.hasTimedOut()) {
        throw new Error(adaptiveTimeout.getTimeoutMessage());
      }
    }

    throw error;
  } finally {
    adaptiveTimeout.cleanup();
  }
};

const callProvider = async (
  provider: GenerationProvider,
  prompt: string,
  signal?: AbortSignal
): Promise<string> =>
  withTimeout(
    provider,
    (providerSignal) =>
      provider === 'gemini'
        ? callGemini(prompt, providerSignal)
        : callGroq(prompt, providerSignal),
    signal
  );

const generateStructuredResponseWithProvider = async <T>(
  provider: GenerationProvider,
  prompt: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal
): Promise<T> => {
  throwIfRequestCancelled(signal);
  const rawText = await callProvider(provider, prompt, signal);
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
  productInput: ProductInput,
  signal?: AbortSignal
): Promise<CaptionVariant[]> => {
  const response = await generateStructuredResponseWithProvider(
    provider,
    buildCaptionPrompt(brandProfile, productInput),
    captionResponseSchema,
    signal
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
  productInput: ProductInput,
  signal?: AbortSignal
): Promise<string[]> => {
  const response = await generateStructuredResponseWithProvider(
    provider,
    buildHashtagPrompt(brandProfile, productInput),
    hashtagResponseSchema,
    signal
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
  productInput: ProductInput,
  signal?: AbortSignal
): Promise<ReelScript> => {
  const response = await generateStructuredResponseWithProvider(
    provider,
    buildReelScriptPrompt(brandProfile, productInput),
    reelScriptResponseSchema,
    signal
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
  const signal = options.signal;
  throwIfRequestCancelled(signal);
  const [captions, hashtags] = await Promise.all([
    generateCaptionsWithProvider(provider, brandProfile, productInput, signal),
    generateHashtagsWithProvider(provider, brandProfile, productInput, signal),
  ]);
  let reelScript = EMPTY_REEL_SCRIPT;

  if (includeReelScript) {
    try {
      throwIfRequestCancelled(signal);
      reelScript = await generateReelScriptWithProvider(
        provider,
        brandProfile,
        productInput,
        signal
      );
    } catch (error) {
      if (error instanceof RequestCancelledError) {
        throw error;
      }

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
  throwIfRequestCancelled(options.signal);
  console.info('[content-generation] Provider flow', {
    primary: 'gemini',
    fallback: 'groq',
  });

  try {
    await options.onProviderChange?.('gemini');
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
    if (error instanceof RequestCancelledError) {
      throw error;
    }

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
    await options.onProviderChange?.('groq');
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
    if (error instanceof RequestCancelledError) {
      throw error;
    }

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
