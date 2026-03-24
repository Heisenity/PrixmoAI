import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildReelScriptPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'You are an expert short-form video script writer for brands across different industries.',
    'Write a 15 to 30 second short-form video script for this product or offering.',
    'Infer the business domain from the product description, keywords, audience, platform, and brand profile. Do not assume fashion or any other niche unless the input supports it.',
    'Adapt the script tone to the platform, audience, and brand voice.',
    'The script must have a strong hook, a concise body, and a direct call to action.',
    'If video content is less naturally relevant, still provide a usable short-form script that feels practical and non-forced.',
    'Return valid JSON only in this format: {"reelScript":{"hook":"...","body":"...","cta":"..."}}',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
