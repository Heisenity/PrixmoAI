import { HASHTAG_VARIATION_COUNT } from '../../config/constants';
import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildHashtagPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'You are an expert social media strategist.',
    `Generate exactly ${HASHTAG_VARIATION_COUNT} relevant hashtags for this product.`,
    'Mix broad discovery hashtags with niche conversion hashtags.',
    'Do not include numbering, explanations, or duplicate hashtags.',
    'Return valid JSON only in this format: {"hashtags":["#tag1","#tag2"]}',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
