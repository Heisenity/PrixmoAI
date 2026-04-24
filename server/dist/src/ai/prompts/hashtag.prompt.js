"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHashtagPrompt = void 0;
const constants_1 = require("../../config/constants");
const shared_1 = require("./shared");
const buildHashtagPrompt = (brandProfile, productInput) => [
    `Return exactly ${constants_1.HASHTAG_VARIATION_COUNT} hashtags as JSON only.`,
    'Schema: {"hashtags":["#tag1","#tag2"]}.',
    'No markdown, no prose, no numbering, no duplicate hashtags.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Mix broad discovery hashtags with niche conversion hashtags that match the product, audience, and platform.',
    (0, shared_1.formatBrandContext)(brandProfile),
    (0, shared_1.formatProductContext)(productInput),
].join('\n\n');
exports.buildHashtagPrompt = buildHashtagPrompt;
