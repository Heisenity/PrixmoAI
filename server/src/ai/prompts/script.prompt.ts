import type { BrandProfile, ProductInput } from '../../types';
import { formatBrandContext, formatProductContext } from './shared';

export const buildReelScriptPrompt = (
  brandProfile: BrandProfile | null,
  productInput: ProductInput
): string =>
  [
    'You are an expert short-form video script writer.',
    'Write a 15 to 30 second reel script for this product.',
    'The script must have a strong hook, a concise body, and a direct call to action.',
    'Return valid JSON only in this format: {"reelScript":{"hook":"...","body":"...","cta":"..."}}',
    formatBrandContext(brandProfile),
    formatProductContext(productInput),
  ].join('\n\n');
