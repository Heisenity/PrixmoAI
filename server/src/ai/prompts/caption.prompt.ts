import { CAPTION_VARIATION_COUNT } from '../../config/constants';
import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildCaptionPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'You are an expert social media copywriter for ecommerce brands.',
    `Generate exactly ${CAPTION_VARIATION_COUNT} distinct captions for this product.`,
    'Each caption should feel natural, persuasive, and ready to post.',
    'Avoid repeating the same opening line across captions.',
    'Return valid JSON only in this format: {"captions":["caption 1","caption 2","caption 3"]}',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
