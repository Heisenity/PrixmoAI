"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCaptionPrompt = void 0;
const constants_1 = require("../../config/constants");
const shared_1 = require("./shared");
const buildCaptionPrompt = (brandProfile, productInput) => [
    'You are an expert social media copywriter for ecommerce brands.',
    `Generate exactly ${constants_1.CAPTION_VARIATION_COUNT} distinct captions for this product.`,
    'Each caption should feel natural, persuasive, and ready to post.',
    'Avoid repeating the same opening line across captions.',
    'Return valid JSON only in this format: {"captions":["caption 1","caption 2","caption 3"]}',
    (0, shared_1.formatBrandContext)(brandProfile),
    (0, shared_1.formatProductContext)(productInput),
].join('\n\n');
exports.buildCaptionPrompt = buildCaptionPrompt;
