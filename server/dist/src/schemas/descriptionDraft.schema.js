"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDescriptionDraftSchema = exports.upsertDescriptionDraftSchema = exports.listDescriptionDraftsSchema = void 0;
const zod_1 = require("zod");
const dictationLanguages_1 = require("../lib/dictationLanguages");
const draftScopeSchema = zod_1.z
    .string()
    .trim()
    .min(1, 'Draft scope is required.')
    .max(120, 'Draft scope must stay under 120 characters.');
const draftLanguageSchema = zod_1.z.enum(dictationLanguages_1.SUPPORTED_DICTATION_LANGUAGE_VALUES, {
    message: 'Selected draft language is not supported.',
});
exports.listDescriptionDraftsSchema = zod_1.z.object({
    scope: draftScopeSchema,
});
exports.upsertDescriptionDraftSchema = zod_1.z.object({
    scope: draftScopeSchema,
    language: draftLanguageSchema,
    text: zod_1.z
        .string()
        .trim()
        .min(1, 'Draft text is required.')
        .max(12000, 'Draft text must stay under 12000 characters.'),
});
exports.deleteDescriptionDraftSchema = zod_1.z.object({
    scope: draftScopeSchema,
    language: draftLanguageSchema,
});
