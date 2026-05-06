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

export const buildReelScriptPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  brandMemories?: BrandMemoryMatch[],
  trendIntelligence?: RealtimeTrendIntelligence | null
): string =>
  [
    'Return one 15 to 30 second reel script as JSON only.',
    'Schema: {"reelScript":{"hook":"...","body":"...","cta":"..."}}.',
    'No markdown, no prose, no extra keys.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Keep the script practical, platform-aware, and natural.',
    'The script must include a hook, body, and CTA.',
    'Use live trend intelligence to spot winning structure, pacing, and audience triggers without copying creators.',
    'Avoid slang, sexual content, hateful language, political framing, religious framing, and spammy hooks.',
    formatBrandContext(brandProfile, brandMemories),
    formatProductContext(productInput),
    formatTrendIntelligence(trendIntelligence),
  ].join('\n\n');
