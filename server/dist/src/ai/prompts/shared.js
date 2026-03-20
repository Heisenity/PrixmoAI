"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatProductContext = exports.formatBrandContext = void 0;
const formatList = (items) => items && items.length > 0 ? items.join(', ') : 'none provided';
const formatBrandContext = (brandProfile) => {
    if (!brandProfile) {
        return 'Brand profile: none available. Create content that is modern, clear, and suitable for ecommerce.';
    }
    return [
        'Brand profile context:',
        `- Brand name: ${brandProfile.fullName}`,
        `- Username: ${brandProfile.username ?? 'not provided'}`,
        `- Industry: ${brandProfile.industry ?? 'not provided'}`,
        `- Target audience: ${brandProfile.targetAudience ?? 'not provided'}`,
        `- Brand voice: ${brandProfile.brandVoice ?? 'not provided'}`,
        `- Description: ${brandProfile.description ?? 'not provided'}`,
    ].join('\n');
};
exports.formatBrandContext = formatBrandContext;
const formatProductContext = (productInput) => [
    'Product context:',
    `- Product name: ${productInput.productName}`,
    `- Product description: ${productInput.productDescription ?? 'not provided'}`,
    `- Product image URL: ${productInput.productImageUrl ?? 'not provided'}`,
    `- Platform: ${productInput.platform ?? 'not provided'}`,
    `- Goal: ${productInput.goal ?? 'not provided'}`,
    `- Tone: ${productInput.tone ?? 'not provided'}`,
    `- Audience: ${productInput.audience ?? 'not provided'}`,
    `- Keywords: ${formatList(productInput.keywords)}`,
].join('\n');
exports.formatProductContext = formatProductContext;
