import type { BrandProfile, ProductInput } from '../../types';

const formatList = (items: string[] | undefined) =>
  items && items.length > 0 ? items.join(', ') : 'none provided';

export const formatBrandContext = (brandProfile: BrandProfile | null): string => {
  if (!brandProfile) {
    return [
      'Workspace profile context: none available.',
      'Do not invent a brand name. If no stored brand/business name is being used for this generation, keep the copy generic to the business and product.',
      'Never use the workspace owner personal name as the brand name.',
      'Create content that is modern, clear, reusable, professional it seems like it has been written by a professional, contnet and scriptwritter and appropriate for the inferred business domain.',
      'Do not assume ecommerce, fashion, or any other niche without support from the user inpue, and do not use any niche-specific language unless the input supports it also use user input data for inferring the business domain and content style and curate the output accordingly.',
    ].join(' ');
  }

  return [
    'Workspace profile context (style guidance only):',
    `- Stored brand/business name in brand memory: ${brandProfile.brandName ?? 'not provided'}`,
    `- Workspace owner name: ${brandProfile.fullName}`,
    `- Username: ${brandProfile.username ?? 'not provided'}`,
    `- Industry: ${brandProfile.industry ?? 'not provided'}`,
    `- Target audience: ${brandProfile.targetAudience ?? 'not provided'}`,
    `- Brand voice: ${brandProfile.brandVoice ?? 'not provided'}`,
    `- Description: ${brandProfile.description ?? 'not provided'}`,
    '- Use the stored brand/business name only when the generation context below says to use it.',
    '- Never use the workspace owner personal name as the brand/business name.',
  ].join('\n');
};

export const formatProductContext = (productInput: ProductInput): string =>
  [
    'Product context:',
    `- Use saved brand/business name: ${productInput.useBrandName ? 'yes' : 'no'}`,
    `- Brand / business name for this generation: ${productInput.brandName ?? 'not being used'}`,
    `- Product name: ${productInput.productName}`,
    `- Product description: ${productInput.productDescription ?? 'not provided'}`,
    `- Product image URL: ${productInput.productImageUrl ?? 'not provided'}`,
    `- Platform: ${productInput.platform ?? 'not provided'}`,
    `- Goal: ${productInput.goal ?? 'not provided'}`,
    `- Tone: ${productInput.tone ?? 'not provided'}`,
    `- Audience: ${productInput.audience ?? 'not provided'}`,
    `- Keywords: ${formatList(productInput.keywords)}`,
    '- Use the brand/business name only if this generation context includes one.',
    '- If no brand/business name is being used for this generation, do not invent one and do not use the workspace owner personal name as the brand name.',
    '- Important: infer the business domain from the product description, keywords, platform, audience, and brand profile.',
    '- Do not assume fashion, ecommerce, or any other industry unless it is explicitly supported by the input.',
  ].join('\n');
