"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReelScriptPrompt = void 0;
const shared_1 = require("./shared");
const buildReelScriptPrompt = (brandProfile, productInput) => [
    'You are an expert short-form video script writer.',
    'Write a 15 to 30 second reel script for this product.',
    'The script must have a strong hook, a concise body, and a direct call to action.',
    'Return valid JSON only in this format: {"reelScript":{"hook":"...","body":"...","cta":"..."}}',
    (0, shared_1.formatBrandContext)(brandProfile),
    (0, shared_1.formatProductContext)(productInput),
].join('\n\n');
exports.buildReelScriptPrompt = buildReelScriptPrompt;
