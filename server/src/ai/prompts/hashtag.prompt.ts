import { HASHTAG_VARIATION_COUNT } from '../../config/constants';
import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildHashtagPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    `Return exactly ${HASHTAG_VARIATION_COUNT} hashtags as JSON only.`,
    'Schema: {"hashtags":["#tag1","#tag2"]}.',
    'No markdown, no prose, no numbering, no duplicate hashtags.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Mix broad discovery hashtags with niche conversion hashtags that match the product, audience, and platform.',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
