import { CAPTION_VARIATION_COUNT } from '../../config/constants';
import type {
  BrandMemoryMatch,
  BrandProfile,
  ProductInput,
  RealtimeTrendIntelligence,
} from '../../types';
import {
  formatBrandContext,
  formatProductContext,
  formatTrendIntelligence,
} from './shared';

export const buildCaptionPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  brandMemories?: BrandMemoryMatch[],
  trendIntelligence?: RealtimeTrendIntelligence | null
): string =>
  [
    `Return exactly ${CAPTION_VARIATION_COUNT} caption variations as JSON only.`,
    'Schema: {"captions":[{"hook":"...","mainCopy":"...","shortCaption":"...","cta":"..."}]}.',
    'No markdown, no prose, no extra keys.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Adapt tone to the selected audience, platform, and brand voice.',
    'Keep the copy modern, specific, reusable, and non-repetitive.',
    'Use the live trend intelligence to understand what is working now, then create original copy aligned to the user goal.',
    'Make the 3 variations meaningfully distinct in hook, pacing, and CTA while staying on-brand.',
    'Do not include slang, sexual content, hate, politics, religion, or spam-style phrasing.',
    formatBrandContext(brandProfile, brandMemories),
    formatProductContext(productInput),
    formatTrendIntelligence(trendIntelligence),
  ].join('\n\n');
