"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHashtagPrompt = void 0;
const constants_1 = require("../../config/constants");
const shared_1 = require("./shared");
const buildHashtagPrompt = (brandProfile, productInput) => [
    'You are an expert social media strategist.',
    `Generate exactly ${constants_1.HASHTAG_VARIATION_COUNT} relevant hashtags for this product.`,
    'Mix broad discovery hashtags with niche conversion hashtags.',
    'Do not include numbering, explanations, or duplicate hashtags.',
    'Return valid JSON only in this format: {"hashtags":["#tag1","#tag2"]}',
    (0, shared_1.formatBrandContext)(brandProfile),
    (0, shared_1.formatProductContext)(productInput),
].join('\n\n');
exports.buildHashtagPrompt = buildHashtagPrompt;
