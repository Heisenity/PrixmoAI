"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReelScriptPrompt = void 0;
const shared_1 = require("./shared");
const buildReelScriptPrompt = (brandProfile, productInput) => [
    'Return one 15 to 30 second reel script as JSON only.',
    'Schema: {"reelScript":{"hook":"...","body":"...","cta":"..."}}.',
    'No markdown, no prose, no extra keys.',
    'Infer the business domain only from the provided context.',
    'Use the brand/business name only when the context explicitly provides one.',
    'Keep the script practical, platform-aware, and natural.',
    'The script must include a hook, body, and CTA.',
    (0, shared_1.formatBrandContext)(brandProfile),
    (0, shared_1.formatProductContext)(productInput),
].join('\n\n');
exports.buildReelScriptPrompt = buildReelScriptPrompt;
