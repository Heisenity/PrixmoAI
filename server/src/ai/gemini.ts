import dotenv from 'dotenv';
import { z } from 'zod';
import {
  CAPTION_VARIATION_COUNT,
  DEFAULT_GEMINI_MODEL,
  HASHTAG_VARIATION_COUNT,
} from '../config/constants';
import type {
  BrandProfile,
  GeneratedContentPack,
  ProductInput,
  ReelScript,
} from '../types';
import { buildCaptionPrompt } from './prompts/caption.prompt';
import { buildHashtagPrompt } from './prompts/hashtag.prompt';
import { buildReelScriptPrompt } from './prompts/script.prompt';

dotenv.config();

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

const captionResponseSchema = z.object({
  captions: z.array(z.string().trim().min(1)).min(CAPTION_VARIATION_COUNT),
});

const hashtagResponseSchema = z.object({
  hashtags: z.array(z.string().trim().min(1)).min(HASHTAG_VARIATION_COUNT),
});

const reelScriptSchema = z.object({
  hook: z.string().trim().min(1),
  body: z.string().trim().min(1),
  cta: z.string().trim().min(1),
});

const reelScriptResponseSchema = z.object({
  reelScript: reelScriptSchema,
});

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

    throw new Error('Gemini did not return valid JSON');
  }
};

const callGemini = async (prompt: string): Promise<string> => {
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
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Gemini request failed');
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return text;
};

const generateStructuredResponse = async <T>(
  prompt: string,
  schema: z.ZodType<T>
): Promise<T> => {
  const rawText = await callGemini(prompt);
  const parsedJson = extractJson(rawText);

  return schema.parse(parsedJson);
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

export const generateCaptions = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<string[]> => {
  const response = await generateStructuredResponse(
    buildCaptionPrompt(brandProfile, productInput),
    captionResponseSchema
  );

  const captions = response.captions
    .map((caption) => caption.trim())
    .filter(Boolean)
    .slice(0, CAPTION_VARIATION_COUNT);

  if (captions.length < CAPTION_VARIATION_COUNT) {
    throw new Error('Gemini did not return enough caption options');
  }

  return captions;
};

export const generateHashtags = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<string[]> => {
  const response = await generateStructuredResponse(
    buildHashtagPrompt(brandProfile, productInput),
    hashtagResponseSchema
  );

  const hashtags = Array.from(
    new Set(response.hashtags.map(normalizeHashtag).filter(Boolean))
  ).slice(0, HASHTAG_VARIATION_COUNT);

  if (hashtags.length < HASHTAG_VARIATION_COUNT) {
    throw new Error('Gemini did not return enough hashtag options');
  }

  return hashtags;
};

export const generateReelScript = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<ReelScript> => {
  const response = await generateStructuredResponse(
    buildReelScriptPrompt(brandProfile, productInput),
    reelScriptResponseSchema
  );

  return response.reelScript;
};

export const generateContentPack = async (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): Promise<GeneratedContentPack> => {
  const [captions, hashtags, reelScript] = await Promise.all([
    generateCaptions(brandProfile, productInput),
    generateHashtags(brandProfile, productInput),
    generateReelScript(brandProfile, productInput),
  ]);

  return {
    captions,
    hashtags,
    reelScript,
  };
};
