import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildReelScriptPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'You are an expert short-form video script writer for brands across different industries.',
    'Write a 15 to 30 second short-form video script in detail for this product or offering.',
    'Infer the business domain from the product description, keywords, audience, platform, and brand profile. Do not assume fashion or any other niche unless the input supports it.',
    'Use the brand/business name only if this generation context provides one. Otherwise do not invent a brand name and do not use the workspace owner personal name in the script.',
    'Adapt the script tone to the platform, audience, and brand voice dynamically from the context which user has provided in the input.',
    'The script must have a strong hook, a detailed professional body, and a direct call to action.',
    'If video content is less naturally relevant, still provide a usable script that sounds natural as a professional scriptwriter written it adn it must feels practical and non-forced.',
    'Return valid JSON only in this format: {"reelScript":{"hook":"...","body":"...","cta":"..."}}',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
