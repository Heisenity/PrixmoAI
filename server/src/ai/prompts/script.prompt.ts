import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildReelScriptPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'Return one 15 to 30 second reel script as JSON only.',
    'Schema: {"reelScript":{"hook":"...","body":"...","cta":"..."}}.',
    'No markdown, no prose, no extra keys.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Keep the script practical, platform-aware, and natural.',
    'The script must include a hook, body, and CTA.',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
