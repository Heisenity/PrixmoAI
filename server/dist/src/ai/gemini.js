"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContentPack = exports.generateReelScript = exports.generateHashtags = exports.generateCaptions = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
const constants_1 = require("../config/constants");
const caption_prompt_1 = require("./prompts/caption.prompt");
const hashtag_prompt_1 = require("./prompts/hashtag.prompt");
const script_prompt_1 = require("./prompts/script.prompt");
dotenv_1.default.config();
const captionVariantSchema = zod_1.z
    .object({
    hook: zod_1.z.string().trim().min(1),
    mainCopy: zod_1.z.string().trim().min(1),
    shortCaption: zod_1.z.string().trim().min(1).optional(),
    Caption: zod_1.z.string().trim().min(1).optional(),
    cta: zod_1.z.string().trim().min(1),
})
    .transform((value) => ({
    hook: value.hook,
    mainCopy: value.mainCopy,
    shortCaption: value.shortCaption ?? value.Caption ?? '',
    cta: value.cta,
}));
const captionResponseSchema = zod_1.z.object({
    captions: zod_1.z
        .array(captionVariantSchema)
        .min(constants_1.CAPTION_VARIATION_COUNT),
});
const hashtagResponseSchema = zod_1.z.object({
    hashtags: zod_1.z.array(zod_1.z.string().trim().min(1)).min(constants_1.HASHTAG_VARIATION_COUNT),
});
const reelScriptSchema = zod_1.z.object({
    hook: zod_1.z.string().trim().min(1),
    body: zod_1.z.string().trim().min(1),
    cta: zod_1.z.string().trim().min(1),
});
const reelScriptResponseSchema = zod_1.z.object({
    reelScript: reelScriptSchema,
});
const extractJson = (rawText) => {
    const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : rawText.trim();
    try {
        return JSON.parse(candidate);
    }
    catch {
        const firstBrace = candidate.indexOf('{');
        const lastBrace = candidate.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
        }
        throw new Error('Gemini did not return valid JSON');
    }
};
const callGemini = async (prompt) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${constants_1.DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Gemini request failed');
    }
    const data = (await response.json());
    const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('\n')
        .trim();
    if (!text) {
        throw new Error('Gemini returned an empty response');
    }
    return text;
};
const generateStructuredResponse = async (prompt, schema) => {
    const rawText = await callGemini(prompt);
    const parsedJson = extractJson(rawText);
    return schema.parse(parsedJson);
};
const normalizeHashtag = (value) => {
    const cleaned = value.trim().replace(/\s+/g, '');
    if (!cleaned) {
        return cleaned;
    }
    return cleaned.startsWith('#')
        ? cleaned.toLowerCase()
        : `#${cleaned.toLowerCase()}`;
};
const EMPTY_REEL_SCRIPT = {
    hook: '',
    body: '',
    cta: '',
};
const generateCaptions = async (brandProfile, productInput) => {
    const response = await generateStructuredResponse((0, caption_prompt_1.buildCaptionPrompt)(brandProfile, productInput), captionResponseSchema);
    const captions = response.captions
        .map((caption) => ({
        hook: caption.hook.trim(),
        mainCopy: caption.mainCopy.trim(),
        shortCaption: caption.shortCaption.trim(),
        cta: caption.cta.trim(),
    }))
        .filter((caption) => caption.hook &&
        caption.mainCopy &&
        caption.shortCaption &&
        caption.cta)
        .slice(0, constants_1.CAPTION_VARIATION_COUNT);
    if (captions.length < constants_1.CAPTION_VARIATION_COUNT) {
        throw new Error('Gemini did not return enough caption options');
    }
    return captions;
};
exports.generateCaptions = generateCaptions;
const generateHashtags = async (brandProfile, productInput) => {
    const response = await generateStructuredResponse((0, hashtag_prompt_1.buildHashtagPrompt)(brandProfile, productInput), hashtagResponseSchema);
    const hashtags = Array.from(new Set(response.hashtags.map(normalizeHashtag).filter(Boolean))).slice(0, constants_1.HASHTAG_VARIATION_COUNT);
    if (hashtags.length < constants_1.HASHTAG_VARIATION_COUNT) {
        throw new Error('Gemini did not return enough hashtag options');
    }
    return hashtags;
};
exports.generateHashtags = generateHashtags;
const generateReelScript = async (brandProfile, productInput) => {
    const response = await generateStructuredResponse((0, script_prompt_1.buildReelScriptPrompt)(brandProfile, productInput), reelScriptResponseSchema);
    return response.reelScript;
};
exports.generateReelScript = generateReelScript;
const generateContentPack = async (brandProfile, productInput, options = {}) => {
    const includeReelScript = options.includeReelScript ?? true;
    const [captions, hashtags, reelScript] = await Promise.all([
        (0, exports.generateCaptions)(brandProfile, productInput),
        (0, exports.generateHashtags)(brandProfile, productInput),
        includeReelScript
            ? (0, exports.generateReelScript)(brandProfile, productInput)
            : Promise.resolve(EMPTY_REEL_SCRIPT),
    ]);
    return {
        captions,
        hashtags,
        reelScript,
    };
};
exports.generateContentPack = generateContentPack;
