import { CAPTION_VARIATION_COUNT } from '../../config/constants';
import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildCaptionPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    `Return exactly ${CAPTION_VARIATION_COUNT} caption variations as JSON only.`,
    'Schema: {"captions":[{"hook":"...","mainCopy":"...","shortCaption":"...","cta":"..."}]}.',
    'No markdown, no prose, no extra keys.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Adapt tone to the selected audience, platform, and brand voice.',
    'Keep the copy modern, specific, reusable, and non-repetitive.',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
