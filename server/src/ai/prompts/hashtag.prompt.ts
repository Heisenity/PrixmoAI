import { HASHTAG_VARIATION_COUNT } from '../../config/constants';
import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildHashtagPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'You are an expert social media strategist for many industries.',
    `Generate exactly ${HASHTAG_VARIATION_COUNT} relevant hashtags for this product.`,
    'Infer the business domain from the product description, keywords, platform, and brand profile. Do not assume fashion or any other niche unless the input supports it.',
    'Mix broad discovery hashtags with niche conversion hashtags based on the actual product, audience, and inferred industry.',
    'Do not include numbering, explanations, or duplicate hashtags.',
    'Keep the list platform-appropriate, audience-aware, and non-generic.',
    'Return valid JSON only in this format: {"hashtags":["#tag1","#tag2"]}',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
