"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHashtagPrompt = void 0;
const constants_1 = require("../../config/constants");
const shared_1 = require("./shared");
const buildHashtagPrompt = (brandProfile, productInput) => [
    'You are an expert social media strategist for many industries.',
    `Generate exactly ${constants_1.HASHTAG_VARIATION_COUNT} relevant hashtags for this product.`,
    'Infer the business domain from the product description, keywords, platform, and brand profile. Do not assume fashion or any other niche unless the input supports it.',
    'Use the brand/business name only if this generation context provides one. Otherwise do not invent a brand name and do not use the workspace owner personal name in branded hashtags.',
    'Mix broad discovery hashtags with niche conversion hashtags based on the actual product, audience, and inferred industry.',
    'Do not include numbering, explanations, or duplicate hashtags.',
    'Keep the list platform-appropriate, audience-aware, and non-generic.',
    'Return valid JSON only in this format: {"hashtags":["#tag1","#tag2"]}',
    (0, shared_1.formatBrandContext)(brandProfile),
    (0, shared_1.formatProductContext)(productInput),
].join('\n\n');
exports.buildHashtagPrompt = buildHashtagPrompt;
