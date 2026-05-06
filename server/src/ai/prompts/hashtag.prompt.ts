import { HASHTAG_VARIATION_COUNT } from '../../config/constants';
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

export const buildHashtagPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput,
  brandMemories?: BrandMemoryMatch[],
  trendIntelligence?: RealtimeTrendIntelligence | null
): string =>
  [
    `Return exactly ${HASHTAG_VARIATION_COUNT} hashtags as JSON only.`,
    'Schema: {"hashtags":["#tag1","#tag2"]}.',
    'No markdown, no prose, no numbering, no duplicate hashtags.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Mix broad discovery hashtags with niche conversion hashtags that match the product, audience, and platform.',
    'Favor live, relevant tags suggested by current trend intelligence when they genuinely fit the request.',
    'Never include spammy, unsafe, sexual, hateful, political, or irrelevant hashtags.',
    formatBrandContext(brandProfile, brandMemories),
    formatProductContext(productInput),
    formatTrendIntelligence(trendIntelligence),
  ].join('\n\n');
