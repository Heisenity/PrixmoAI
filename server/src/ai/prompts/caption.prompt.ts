import { CAPTION_VARIATION_COUNT } from '../../config/constants';
import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildCaptionPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'You are an expert creative strategist for brands across any industry.',
    `Generate exactly ${CAPTION_VARIATION_COUNT} distinct structured copy variations for this product or offering.`,
    'Do not assume the product category or industry. Infer the domain only from the provided product description, keywords, audience, platform, and brand profile.',
    'Do not inject fashion-related language, ecommerce language, or any niche-specific terminology unless the user input clearly supports it.',
    'Use the brand/business name only if this generation context provides one. Otherwise do not invent a brand name and do not use the workspace owner personal name in the copy.',
    'Adapt the writing style to the selected tone, audience, platform, and brand voice.',
    'Make the output platform-appropriate: for example, shorter and sharper for Instagram, more professional and context-rich for LinkedIn, and natural across other platforms.',
    'Each variation must include: hook, mainCopy, shortCaption, and cta.',
    'Keep all copy modern, natural, reusable, non-generic, and non-repetitive.',
    'Return valid JSON only in this format: {"captions":[{"hook":"...","mainCopy":"...","shortCaption":"...","cta":"..."}]}',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
