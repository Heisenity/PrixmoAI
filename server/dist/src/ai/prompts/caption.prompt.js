"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCaptionPrompt = void 0;
const constants_1 = require("../../config/constants");
const shared_1 = require("./shared");
const buildCaptionPrompt = (brandProfile, productInput) => [
    `Return exactly ${constants_1.CAPTION_VARIATION_COUNT} caption variations as JSON only.`,
    'Schema: {"captions":[{"hook":"...","mainCopy":"...","shortCaption":"...","cta":"..."}]}.',
    'No markdown, no prose, no extra keys.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Adapt tone to the selected audience, platform, and brand voice.',
    'Keep the copy modern, specific, reusable, and non-repetitive.',
    (0, shared_1.formatBrandContext)(brandProfile),
    (0, shared_1.formatProductContext)(productInput),
].join('\n\n');
exports.buildCaptionPrompt = buildCaptionPrompt;
