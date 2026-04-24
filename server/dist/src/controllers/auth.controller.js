"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestBrandDescription = exports.suggestIndustry = exports.getMe = exports.checkUsernameAvailability = exports.saveProfile = void 0;
const zod_1 = require("zod");
const gemini_1 = require("../ai/gemini");
const brandProfiles_1 = require("../db/queries/brandProfiles");
const brandProfileMemory_1 = require("../db/queries/brandProfileMemory");
const supabase_1 = require("../db/supabase");
const dictationLanguages_1 = require("../lib/dictationLanguages");
const username_1 = require("../lib/username");
const PROFILE_MEMORY_SNAPSHOT_KEYS = [
    'brandName',
    'fullName',
    'phoneNumber',
    'username',
    'avatarUrl',
    'country',
    'language',
    'websiteUrl',
    'logoUrl',
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'industry',
    'primaryIndustry',
    'secondaryIndustries',
    'targetAudience',
    'brandVoice',
    'description',
];
const toBrandProfileInput = (body) => ({
    brandName: body.brandName,
    fullName: body.fullName,
    phoneNumber: body.phoneNumber ?? null,
    username: body.username ? (0, username_1.normalizeUsername)(body.username) : null,
    avatarUrl: body.avatarUrl ?? null,
    country: body.country ?? null,
    language: body.language ?? null,
    websiteUrl: body.websiteUrl ?? null,
    logoUrl: body.logoUrl ?? null,
    primaryColor: body.primaryColor ?? null,
    secondaryColor: body.secondaryColor ?? null,
    accentColor: body.accentColor ?? null,
    industry: body.industry ?? null,
    primaryIndustry: body.primaryIndustry ?? null,
    secondaryIndustries: body.secondaryIndustries ?? [],
    targetAudience: body.targetAudience ?? null,
    brandVoice: body.brandVoice ?? null,
    description: body.description ?? null,
});
const toProfileMemorySnapshot = (profile) => {
    if (!profile) {
        return null;
    }
    return {
        brandName: profile.brandName,
        fullName: profile.fullName,
        phoneNumber: profile.phoneNumber,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        country: profile.country,
        language: profile.language,
        websiteUrl: profile.websiteUrl,
        logoUrl: profile.logoUrl,
        primaryColor: profile.primaryColor,
        secondaryColor: profile.secondaryColor,
        accentColor: profile.accentColor,
        industry: profile.industry,
        primaryIndustry: profile.primaryIndustry,
        secondaryIndustries: profile.secondaryIndustries,
        targetAudience: profile.targetAudience,
        brandVoice: profile.brandVoice,
        description: profile.description,
    };
};
const areSnapshotValuesEqual = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
const buildProfileFieldChanges = (previousProfile, currentProfile) => {
    const previousSnapshot = toProfileMemorySnapshot(previousProfile);
    const currentSnapshot = toProfileMemorySnapshot(currentProfile);
    const changedFields = [];
    const fieldChanges = {};
    for (const key of PROFILE_MEMORY_SNAPSHOT_KEYS) {
        const previousValue = previousSnapshot?.[key] ?? null;
        const currentValue = currentSnapshot[key] ?? null;
        if (areSnapshotValuesEqual(previousValue, currentValue)) {
            continue;
        }
        changedFields.push(key);
        fieldChanges[key] = {
            previous: previousValue,
            current: currentValue,
        };
    }
    return {
        previousSnapshot,
        currentSnapshot,
        changedFields,
        fieldChanges,
        eventType: previousSnapshot
            ? changedFields.length
                ? 'updated'
                : 'saved'
            : 'created',
    };
};
const persistBrandProfileMemoryEvent = async (request, previousProfile, currentProfile) => {
    if (!request.user?.id) {
        return;
    }
    const client = (0, supabase_1.requireUserClient)(request.accessToken);
    const { previousSnapshot, currentSnapshot, changedFields, fieldChanges, eventType } = buildProfileFieldChanges(previousProfile, currentProfile);
    await (0, brandProfileMemory_1.insertBrandProfileMemoryEvent)(client, {
        userId: request.user.id,
        brandProfileId: currentProfile.id,
        saveContext: request.body.saveContext ?? 'system',
        eventType,
        changedFields,
        previousSnapshot,
        currentSnapshot,
        fieldChanges,
    });
};
const industrySuggestionResponseSchema = zod_1.z.object({
    primaryIndustry: zod_1.z.string().trim().min(1),
    secondaryIndustries: zod_1.z.array(zod_1.z.string().trim().min(1)).max(3).default([]),
    reasoning: zod_1.z.string().trim().min(1),
    signals: zod_1.z.array(zod_1.z.string().trim().min(1)).max(8).default([]),
});
const brandDescriptionSuggestionResponseSchema = zod_1.z.object({
    description: zod_1.z.string().trim().min(80).max(500),
});
const usernameSuggestionResponseSchema = zod_1.z.object({
    suggestions: zod_1.z.array(zod_1.z.string().trim().min(3)).min(2).max(8),
});
const normalizeText = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9+/&.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tokenize = (value) => Array.from(new Set(normalizeText(value)
    .split(/[\s/&.+-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)));
const countTokenHits = (text, tokens) => tokens.reduce((score, token) => score +
    (text.includes(` ${token} `) || text.startsWith(`${token} `) || text.endsWith(` ${token}`) || text === token
        ? 1
        : 0), 0);
const sanitizeSecondaryIndustries = (primaryIndustry, secondaryIndustries) => {
    const normalizedPrimary = primaryIndustry.trim().toLowerCase();
    const seen = new Set();
    return secondaryIndustries
        .map((entry) => entry.trim())
        .filter(Boolean)
        .filter((entry) => entry.toLowerCase() !== normalizedPrimary)
        .filter((entry) => {
        const normalizedEntry = entry.toLowerCase();
        if (seen.has(normalizedEntry)) {
            return false;
        }
        seen.add(normalizedEntry);
        return true;
    })
        .slice(0, 3);
};
const buildIndustrySuggestionPrompt = (input) => {
    const categories = Array.from(new Set(input.catalog.map((entry) => entry.category.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
    const catalogText = input.catalog
        .map((entry) => `- ${entry.category} :: ${entry.label}${entry.tags?.length ? ` [tags: ${entry.tags.join(', ')}]` : ''}`)
        .join('\n');
    return [
        'You assign the most relevant brand industry profile from an allowed catalog.',
        'Use the business problem statement as the primary signal, then strengthen it with brand details, website clues, description, and optional social links, bios, or posts.',
        'Pick one primary industry category from the allowed category list below.',
        'Pick up to 3 secondary industry labels from the allowed catalog labels that best support that primary choice.',
        'If no existing category fits strongly enough, create a short specific custom industry name based on the business details and use that as the primary industry.',
        'When you use a custom primary industry, it should behave like selecting Other and writing the industry name on behalf of the user.',
        'Avoid unrelated industries. Prefer precision over breadth.',
        'Follow this process internally: analyze the problem being solved, extract keywords, match industry signals, score likely fits, then return the top result.',
        'Do not require social links. They are optional supporting context only.',
        '',
        `Allowed primary categories: ${categories.join(', ')}`,
        '',
        'Allowed industry catalog:',
        catalogText,
        '',
        'Brand signals:',
        `- Brand name: ${input.brandName}`,
        `- Username: ${input.username?.trim() || 'not provided'}`,
        `- Brand description: ${input.description?.trim() || 'not provided'}`,
        `- Website: ${input.websiteUrl?.trim() || 'not provided'}`,
        `- Business problem solved: ${input.suggestionText.trim()}`,
        `- Social links / bios / post text: ${input.socialContext?.trim() || 'not provided'}`,
        '',
        'Return JSON only in this exact shape:',
        '{',
        '  "primaryIndustry": "Allowed category label or a short custom other-industry name",',
        '  "secondaryIndustries": ["Allowed catalog label"],',
        '  "reasoning": "Short explanation grounded in the signals",',
        '  "signals": ["keyword or signal", "keyword or signal"]',
        '}',
    ].join('\n');
};
const buildFallbackIndustrySuggestion = (input) => {
    const problemText = input.suggestionText.trim();
    const socialContext = input.socialContext?.trim() ?? '';
    const combinedText = normalizeText([
        problemText,
        input.brandName,
        input.username ?? '',
        input.description ?? '',
        input.websiteUrl ?? '',
        socialContext,
    ].join(' '));
    const paddedText = ` ${combinedText} `;
    const normalizedProblemText = normalizeText(problemText);
    const normalizedSocialContext = normalizeText(socialContext);
    const normalizedBrandName = normalizeText(input.brandName);
    const normalizedDescription = normalizeText(input.description ?? '');
    const normalizedWebsite = normalizeText(input.websiteUrl ?? '');
    const scored = input.catalog
        .map((entry) => {
        const normalizedLabel = normalizeText(entry.label);
        const normalizedCategory = normalizeText(entry.category);
        const labelTokens = tokenize(entry.label);
        const categoryTokens = tokenize(entry.category);
        const tagTokens = (entry.tags ?? []).flatMap(tokenize);
        let score = 0;
        if (normalizedProblemText.includes(normalizedLabel)) {
            score += 20;
        }
        if (normalizedProblemText.includes(normalizedCategory)) {
            score += 9;
        }
        if (normalizedBrandName.includes(normalizedLabel)) {
            score += 7;
        }
        if (normalizedBrandName.includes(normalizedCategory)) {
            score += 4;
        }
        if (normalizedDescription.includes(normalizedLabel)) {
            score += 6;
        }
        if (normalizedDescription.includes(normalizedCategory)) {
            score += 3;
        }
        if (normalizedWebsite.includes(normalizedLabel)) {
            score += 5;
        }
        if (normalizedWebsite.includes(normalizedCategory)) {
            score += 3;
        }
        if (normalizedSocialContext.includes(normalizedLabel)) {
            score += 4;
        }
        if (normalizedSocialContext.includes(normalizedCategory)) {
            score += 2;
        }
        score += countTokenHits(` ${normalizedProblemText} `, labelTokens) * 5;
        score += countTokenHits(` ${normalizedProblemText} `, categoryTokens) * 4;
        score += countTokenHits(` ${normalizedProblemText} `, tagTokens) * 4;
        score += countTokenHits(` ${normalizedBrandName} `, labelTokens) * 2;
        score += countTokenHits(` ${normalizedBrandName} `, categoryTokens) * 1;
        score += countTokenHits(` ${normalizedDescription} `, labelTokens) * 2;
        score += countTokenHits(` ${normalizedDescription} `, tagTokens) * 2;
        score += countTokenHits(` ${normalizedWebsite} `, labelTokens) * 2;
        score += countTokenHits(` ${normalizedWebsite} `, tagTokens) * 2;
        score += countTokenHits(` ${normalizedSocialContext} `, labelTokens) * 2;
        score += countTokenHits(` ${normalizedSocialContext} `, tagTokens) * 2;
        score += countTokenHits(paddedText, labelTokens);
        score += countTokenHits(paddedText, categoryTokens);
        return {
            ...entry,
            score,
            matchedSignals: Array.from(new Set([...labelTokens, ...categoryTokens, ...tagTokens].filter((token) => paddedText.includes(` ${token} `)))),
        };
    })
        .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
    const scoredCategories = Array.from(scored.reduce((map, entry) => {
        const current = map.get(entry.category) ?? {
            category: entry.category,
            score: 0,
            matchedSignals: new Set(),
        };
        current.score += entry.score;
        entry.matchedSignals.forEach((signal) => current.matchedSignals.add(signal));
        map.set(entry.category, current);
        return map;
    }, new Map()).values())
        .map((entry) => ({
        ...entry,
        matchedSignals: Array.from(entry.matchedSignals),
    }))
        .sort((left, right) => right.score - left.score || left.category.localeCompare(right.category));
    const fallbackPrimaryCategory = scoredCategories.find((entry) => entry.score > 0) ??
        scoredCategories[0] ?? {
        category: 'Personal Brand',
        score: 0,
        matchedSignals: [],
    };
    const fallbackCustomPrimary = problemText ||
        input.description?.trim() ||
        socialContext
            .replace(/https?:\/\/\S+/gi, ' ')
            .replace(/\s+/g, ' ')
            .split(/[.|,;\n]/)
            .map((entry) => entry.trim())
            .find(Boolean) ||
        '';
    const normalizedCustomPrimary = fallbackCustomPrimary
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
        .slice(0, 48)
        .trim();
    const shouldUseCustomPrimary = Boolean(normalizedCustomPrimary) &&
        fallbackPrimaryCategory.score <= 2;
    const secondaryIndustries = sanitizeSecondaryIndustries(shouldUseCustomPrimary
        ? normalizedCustomPrimary
        : fallbackPrimaryCategory.category, scored
        .filter((entry) => entry.category === fallbackPrimaryCategory.category)
        .filter((entry) => entry.score > 0 &&
        entry.matchedSignals.some((signal) => fallbackPrimaryCategory.matchedSignals.includes(signal)))
        .slice(0, 3)
        .map((entry) => entry.label));
    return {
        primaryIndustry: shouldUseCustomPrimary && normalizedCustomPrimary
            ? normalizedCustomPrimary
            : fallbackPrimaryCategory.category,
        secondaryIndustries,
        reasoning: shouldUseCustomPrimary
            ? 'Suggested a custom other-industry name from the business summary because no exact catalog label matched strongly enough.'
            : 'Suggested from the strongest overlap between the business problem, brand details, website clues, and optional social context.',
        signals: fallbackPrimaryCategory.matchedSignals.slice(0, 6) ??
            tokenize(problemText).slice(0, 6),
        source: 'fallback',
    };
};
const buildIndustrySuggestionLogPayload = (input, requestContext) => ({
    requestContext,
    brandName: input.brandName,
    username: input.username ?? null,
    description: input.description ?? null,
    websiteUrl: input.websiteUrl ?? null,
    socialContext: input.socialContext ?? null,
    suggestionText: input.suggestionText,
    catalogSize: input.catalog.length,
});
const sanitizeGeneratedBrandDescription = (value) => value
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .trim()
    .slice(0, 500)
    .trim();
const buildConsoleTextSummary = (value, previewLength = 72) => {
    const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
    if (!normalized) {
        return {
            present: false,
            chars: 0,
            preview: null,
        };
    }
    return {
        present: true,
        chars: normalized.length,
        preview: normalized.length > previewLength
            ? `${normalized.slice(0, previewLength).trimEnd()}...`
            : normalized,
    };
};
const summarizeIndustrySuggestionInputForConsole = (input) => ({
    brandName: input.brandName,
    username: input.username?.trim() || null,
    websiteUrl: input.websiteUrl?.trim() || null,
    description: buildConsoleTextSummary(input.description, 88),
    businessProblem: buildConsoleTextSummary(input.suggestionText, 88),
    socialContext: buildConsoleTextSummary(input.socialContext, 88),
    catalogSize: input.catalog.length,
});
const summarizeBrandDescriptionInputForConsole = (input) => ({
    brandName: input.brandName,
    username: input.username?.trim() || null,
    websiteUrl: input.websiteUrl?.trim() || null,
    industry: input.industry.trim(),
    primaryIndustry: input.primaryIndustry.trim(),
    secondaryIndustries: input.secondaryIndustries,
    secondaryCount: input.secondaryIndustries.length,
    targetAudience: buildConsoleTextSummary(input.targetAudience, 72),
    brandVoice: input.brandVoice.trim(),
    socialContext: buildConsoleTextSummary(input.socialContext, 88),
    existingDescription: buildConsoleTextSummary(input.existingDescription, 88),
    shortInput: buildConsoleTextSummary(input.shortInput, 88),
    language: input.language,
});
const slugifyUsernameSeed = (value) => (0, username_1.normalizeUsername)(value
    .replace(/[&+/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
const buildUsernameSuggestionPrompt = ({ desiredUsername, brandName, fullName, emailLocalPart, }) => [
    'You create high-quality username suggestions for a product onboarding flow.',
    'Return 8 candidates inspired by the brand name and email local part.',
    'Prioritize clean, brand-first handles that feel professional and easy to remember.',
    'Only use lowercase letters, numbers, dots, and underscores.',
    'Do not use @ symbols, spaces, emojis, hashtags, or punctuation outside dots and underscores.',
    'Keep each candidate between 3 and 30 characters.',
    'Avoid duplicates, awkward random strings, and long numeric tails unless needed.',
    '',
    'Brand context:',
    `- Desired username: ${desiredUsername}`,
    `- Brand name: ${brandName}`,
    `- Full name: ${fullName?.trim() || 'not provided'}`,
    `- Email local part: ${emailLocalPart?.trim() || 'not provided'}`,
    '',
    'Return JSON only in this exact shape:',
    '{',
    '  "suggestions": ["brandname", "brandname.studio"]',
    '}',
].join('\n');
const buildDeterministicUsernameCandidates = ({ desiredUsername, brandName, fullName, emailLocalPart, }) => {
    const brandSeed = slugifyUsernameSeed(brandName);
    const desiredSeed = slugifyUsernameSeed(desiredUsername);
    const emailSeed = slugifyUsernameSeed(emailLocalPart ?? '');
    const fullNameSeed = slugifyUsernameSeed(fullName ?? '');
    const seeds = Array.from(new Set([brandSeed, desiredSeed, emailSeed, fullNameSeed].filter(Boolean)));
    const candidates = new Set();
    const suffixes = ['hq', 'official', 'studio', 'labs', 'co', 'team', 'ai'];
    for (const seed of seeds) {
        if ((0, username_1.isValidNormalizedUsername)(seed)) {
            candidates.add(seed);
        }
        for (const suffix of suffixes) {
            const underscoreVariant = (0, username_1.normalizeUsername)(`${seed}_${suffix}`);
            const dotVariant = (0, username_1.normalizeUsername)(`${seed}.${suffix}`);
            const joinedVariant = (0, username_1.normalizeUsername)(`${seed}${suffix}`);
            if ((0, username_1.isValidNormalizedUsername)(underscoreVariant)) {
                candidates.add(underscoreVariant);
            }
            if ((0, username_1.isValidNormalizedUsername)(dotVariant)) {
                candidates.add(dotVariant);
            }
            if ((0, username_1.isValidNormalizedUsername)(joinedVariant)) {
                candidates.add(joinedVariant);
            }
        }
    }
    if (brandSeed && emailSeed) {
        for (const candidate of [
            (0, username_1.normalizeUsername)(`${brandSeed}_${emailSeed}`),
            (0, username_1.normalizeUsername)(`${brandSeed}.${emailSeed}`),
            (0, username_1.normalizeUsername)(`${emailSeed}_${brandSeed}`),
            (0, username_1.normalizeUsername)(`${brandSeed}${emailSeed}`),
        ]) {
            if ((0, username_1.isValidNormalizedUsername)(candidate)) {
                candidates.add(candidate);
            }
        }
    }
    return Array.from(candidates);
};
const filterAvailableUsernames = async (candidates, desiredUsername) => {
    const adminClient = (0, supabase_1.requireSupabaseAdmin)();
    const normalizedCandidates = Array.from(new Set(candidates
        .map((entry) => (0, username_1.normalizeUsername)(entry))
        .filter((entry) => (0, username_1.isValidNormalizedUsername)(entry) && entry !== desiredUsername)));
    const takenUsernames = await (0, brandProfiles_1.listTakenUsernames)(adminClient, normalizedCandidates);
    return normalizedCandidates.filter((candidate) => !takenUsernames.has(candidate));
};
const buildUsernameSuggestions = async ({ desiredUsername, brandName, fullName, emailLocalPart, }) => {
    let provider = 'fallback';
    let aiCandidates = [];
    console.info('[auth] username suggestion started', {
        desiredUsername,
        brandName,
        fullName: fullName?.trim() || null,
        emailLocalPart: emailLocalPart?.trim() || null,
    });
    try {
        const aiSuggestion = await (0, gemini_1.generateStructuredDataWithGroqFallback)(buildUsernameSuggestionPrompt({
            desiredUsername,
            brandName,
            fullName,
            emailLocalPart,
        }), usernameSuggestionResponseSchema, 'username-suggestion');
        provider = aiSuggestion.provider;
        aiCandidates = aiSuggestion.data.suggestions;
        console.info('[auth] username suggestion ai candidates ready', {
            desiredUsername,
            provider,
            candidateCount: aiCandidates.length,
            candidates: aiCandidates.slice(0, 5),
        });
    }
    catch (error) {
        console.warn('[auth] username suggestion fell back to deterministic mode', {
            desiredUsername,
            error: error instanceof gemini_1.ContentGenerationProvidersExhaustedError
                ? error.failures
                : error instanceof Error
                    ? error.message
                    : String(error),
        });
    }
    const deterministicCandidates = buildDeterministicUsernameCandidates({
        desiredUsername,
        brandName,
        fullName,
        emailLocalPart,
    });
    const initialAvailable = await filterAvailableUsernames([...aiCandidates, ...deterministicCandidates], desiredUsername);
    if (initialAvailable.length >= 2) {
        console.info('[auth] username suggestion finalized', {
            desiredUsername,
            provider,
            availableCount: initialAvailable.length,
            selectedSuggestions: initialAvailable.slice(0, 2),
        });
        return {
            suggestions: initialAvailable.slice(0, 2),
            provider,
        };
    }
    const fallbackBases = Array.from(new Set([
        slugifyUsernameSeed(brandName),
        slugifyUsernameSeed(emailLocalPart ?? ''),
        slugifyUsernameSeed(desiredUsername),
    ].filter(Boolean)));
    const extendedCandidates = [...initialAvailable];
    for (let suffix = 1; suffix <= 999 && extendedCandidates.length < 2; suffix += 1) {
        const numericBatch = fallbackBases
            .flatMap((base) => [
            (0, username_1.normalizeUsername)(`${base}${suffix}`),
            (0, username_1.normalizeUsername)(`${base}_${suffix}`),
            (0, username_1.normalizeUsername)(`${base}.${suffix}`),
        ])
            .filter(username_1.isValidNormalizedUsername);
        const availableBatch = await filterAvailableUsernames(numericBatch, desiredUsername);
        for (const candidate of availableBatch) {
            if (!extendedCandidates.includes(candidate)) {
                extendedCandidates.push(candidate);
            }
            if (extendedCandidates.length >= 2) {
                break;
            }
        }
    }
    console.info('[auth] username suggestion finalized', {
        desiredUsername,
        provider: initialAvailable.length ? provider : 'fallback',
        availableCount: extendedCandidates.length,
        selectedSuggestions: extendedCandidates.slice(0, 2),
    });
    return {
        suggestions: extendedCandidates.slice(0, 2),
        provider: initialAvailable.length ? provider : 'fallback',
    };
};
const getUsernameAvailability = async ({ accessToken, desiredUsername, brandName, fullName, userId, email, requestContext = 'system', }) => {
    const normalizedUsername = (0, username_1.normalizeUsername)(desiredUsername);
    const emailLocalPart = (0, username_1.getEmailLocalPart)(email);
    console.info('[auth] username availability started', {
        userId,
        requestContext,
        desiredUsername,
        normalizedUsername,
        brandName: brandName?.trim() || null,
        fullName: fullName?.trim() || null,
        emailLocalPart: emailLocalPart?.trim() || null,
    });
    const persistResult = async ({ isAvailable, message, suggestions, provider, errorMessage, }) => {
        try {
            await persistUsernameRecommendationEvent({
                accessToken,
                userId,
                requestContext,
                desiredUsername,
                normalizedUsername,
                brandName,
                fullName,
                emailLocalPart,
                isAvailable,
                provider,
                suggestions,
                errorMessage: errorMessage ?? null,
            });
        }
        catch (logError) {
            console.warn('[auth] failed to persist username recommendation log', {
                userId,
                requestContext,
                normalizedUsername,
                error: logError instanceof Error ? logError.message : String(logError),
            });
        }
        return {
            normalizedUsername,
            isAvailable,
            message,
            suggestions,
            provider,
        };
    };
    if (!(0, username_1.isValidNormalizedUsername)(normalizedUsername)) {
        return persistResult({
            isAvailable: false,
            message: 'Use 3-30 letters, numbers, dots, or underscores in the username.',
            suggestions: [],
            provider: null,
        });
    }
    const adminClient = (0, supabase_1.requireSupabaseAdmin)();
    const existingOwner = await (0, brandProfiles_1.getBrandProfileOwnerByUsername)(adminClient, normalizedUsername);
    if (!existingOwner || existingOwner.userId === userId) {
        return persistResult({
            isAvailable: true,
            message: 'Username available.',
            suggestions: [],
            provider: null,
        });
    }
    const suggestionBundle = await buildUsernameSuggestions({
        desiredUsername: normalizedUsername,
        brandName: brandName?.trim() || normalizedUsername,
        fullName,
        emailLocalPart,
    });
    return persistResult({
        isAvailable: false,
        message: 'Username exists',
        suggestions: suggestionBundle.suggestions,
        provider: suggestionBundle.provider,
    });
};
const isUsernameConflictError = (error) => error instanceof Error &&
    /duplicate key value|unique constraint|brand_profiles_username_unique_idx|username/i.test(error.message);
const buildBrandDescriptionSuggestionPrompt = (input) => {
    const languageLabel = dictationLanguages_1.DICTATION_LANGUAGE_LABELS[input.language] ?? 'English';
    const secondaryIndustries = input.secondaryIndustries?.length
        ? input.secondaryIndustries.join(', ')
        : 'not provided';
    return [
        'You write polished, production-ready brand descriptions for business profiles.',
        `Write the final description in ${languageLabel}.`,
        'Use the short brand note as the primary source, then strengthen it with the supporting brand context.',
        'Keep the result specific, credible, and ready to save into a product profile.',
        'Do not invent numbers, awards, certifications, years in business, locations, pricing, or guarantees unless they are explicitly provided.',
        'Avoid bullet points, hashtags, emojis, and quotation marks.',
        'Write 2 to 4 sentences and keep the final description between 180 and 500 characters.',
        'The description should explain what the brand offers, who it helps, and how it should feel.',
        'Reflect the brand voice and align the wording to the primary and secondary industries.',
        '',
        'Brand context:',
        `- Brand name: ${input.brandName}`,
        `- Full name: ${input.fullName?.trim() || 'not provided'}`,
        `- Username: ${input.username?.trim() || 'not provided'}`,
        `- Website: ${input.websiteUrl?.trim() || 'not provided'}`,
        `- Industry: ${input.industry?.trim() || 'not provided'}`,
        `- Primary industry: ${input.primaryIndustry?.trim() || 'not provided'}`,
        `- Secondary industries: ${secondaryIndustries}`,
        `- Target audience: ${input.targetAudience?.trim() || 'not provided'}`,
        `- Brand voice: ${input.brandVoice?.trim() || 'not provided'}`,
        `- Social media links / bios / posts: ${input.socialContext?.trim() || 'not provided'}`,
        `- Existing description: ${input.existingDescription?.trim() || 'not provided'}`,
        `- Short brand note: ${input.shortInput.trim()}`,
        '',
        'Return JSON only in this exact shape:',
        '{',
        '  "description": "Production-ready brand description"',
        '}',
    ].join('\n');
};
const persistIndustrySuggestionEvent = async ({ accessToken, userId, requestContext, requestBody, status, provider, responsePayload, errorMessage, }) => {
    const client = (0, supabase_1.requireUserClient)(accessToken);
    const currentProfile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, userId);
    await (0, brandProfileMemory_1.insertIndustrySuggestionLog)(client, {
        userId,
        brandProfileId: currentProfile?.id ?? null,
        requestContext,
        status,
        provider,
        requestPayload: buildIndustrySuggestionLogPayload(requestBody, requestContext),
        responsePayload: responsePayload ?? null,
        errorMessage: errorMessage ?? null,
    });
};
const buildBrandDescriptionSuggestionLogPayload = (input, requestContext) => ({
    requestContext,
    brandName: input.brandName,
    fullName: input.fullName ?? null,
    username: input.username ?? null,
    websiteUrl: input.websiteUrl ?? null,
    industry: input.industry,
    primaryIndustry: input.primaryIndustry,
    secondaryIndustries: input.secondaryIndustries,
    targetAudience: input.targetAudience ?? null,
    brandVoice: input.brandVoice,
    socialContext: input.socialContext ?? null,
    existingDescription: input.existingDescription ?? null,
    shortInput: input.shortInput,
    language: input.language,
});
const persistBrandDescriptionSuggestionEvent = async ({ accessToken, userId, requestContext, requestBody, status, provider, responsePayload, errorMessage, }) => {
    const client = (0, supabase_1.requireUserClient)(accessToken);
    const currentProfile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, userId);
    await (0, brandProfileMemory_1.insertBrandDescriptionSuggestionLog)(client, {
        userId,
        brandProfileId: currentProfile?.id ?? null,
        requestContext,
        status,
        provider,
        requestPayload: buildBrandDescriptionSuggestionLogPayload(requestBody, requestContext),
        responsePayload: responsePayload ?? null,
        errorMessage: errorMessage ?? null,
    });
};
const persistUsernameRecommendationEvent = async ({ accessToken, userId, requestContext, desiredUsername, normalizedUsername, brandName, fullName, emailLocalPart, isAvailable, provider, suggestions, errorMessage, }) => {
    const client = (0, supabase_1.requireUserClient)(accessToken);
    const currentProfile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, userId);
    await (0, brandProfileMemory_1.insertUsernameRecommendationLog)(client, {
        userId,
        brandProfileId: currentProfile?.id ?? null,
        requestContext,
        status: errorMessage ? 'error' : 'success',
        desiredUsername,
        normalizedUsername,
        isAvailable,
        provider,
        requestPayload: {
            requestContext,
            desiredUsername,
            brandName: brandName ?? null,
            fullName: fullName ?? null,
            emailLocalPart: emailLocalPart ?? null,
        },
        responsePayload: errorMessage
            ? null
            : {
                normalizedUsername,
                isAvailable,
                suggestions,
                provider: provider ?? null,
            },
        errorMessage: errorMessage ?? null,
    });
};
const saveProfile = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const usernameAvailability = await getUsernameAvailability({
            accessToken: req.accessToken,
            desiredUsername: req.body.username,
            brandName: req.body.brandName,
            fullName: req.body.fullName,
            userId: req.user.id,
            email: req.user.email,
            requestContext: req.body.saveContext ?? 'system',
        });
        if (!usernameAvailability.isAvailable) {
            return res.status(409).json({
                status: 'fail',
                message: usernameAvailability.message,
                data: usernameAvailability,
            });
        }
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const previousProfile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, req.user.id);
        const profile = await (0, brandProfiles_1.upsertBrandProfile)(client, req.user.id, toBrandProfileInput(req.body));
        await persistBrandProfileMemoryEvent(req, previousProfile, profile);
        return res.status(200).json({
            status: 'success',
            message: 'Brand profile saved successfully',
            profile,
        });
    }
    catch (error) {
        if (isUsernameConflictError(error)) {
            const usernameAvailability = await getUsernameAvailability({
                accessToken: req.accessToken,
                desiredUsername: req.body.username,
                brandName: req.body.brandName,
                fullName: req.body.fullName,
                userId: req.user.id,
                email: req.user.email,
                requestContext: req.body.saveContext ?? 'system',
            });
            return res.status(409).json({
                status: 'fail',
                message: 'Username exists',
                data: usernameAvailability,
            });
        }
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to save brand profile',
        });
    }
};
exports.saveProfile = saveProfile;
const checkUsernameAvailability = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const availability = await getUsernameAvailability({
            accessToken: req.accessToken,
            desiredUsername: req.body.desiredUsername,
            brandName: req.body.brandName,
            fullName: req.body.fullName,
            userId: req.user.id,
            email: req.user.email,
            requestContext: req.body.requestContext ?? 'settings',
        });
        console.info('[auth] username availability checked', {
            userId: req.user.id,
            username: availability.normalizedUsername,
            isAvailable: availability.isAvailable,
            provider: availability.provider,
            suggestionCount: availability.suggestions.length,
        });
        if (!availability.isAvailable) {
            return res.status(409).json({
                status: 'fail',
                message: availability.message,
                data: availability,
            });
        }
        return res.status(200).json({
            status: 'success',
            data: availability,
        });
    }
    catch (error) {
        try {
            await persistUsernameRecommendationEvent({
                accessToken: req.accessToken,
                userId: req.user.id,
                requestContext: req.body.requestContext ?? 'settings',
                desiredUsername: req.body.desiredUsername,
                normalizedUsername: (0, username_1.normalizeUsername)(req.body.desiredUsername),
                brandName: req.body.brandName,
                fullName: req.body.fullName,
                emailLocalPart: (0, username_1.getEmailLocalPart)(req.user.email),
                isAvailable: false,
                provider: null,
                suggestions: [],
                errorMessage: error instanceof Error ? error.message : String(error),
            });
        }
        catch (logError) {
            console.warn('[auth] failed to persist username recommendation error log', {
                userId: req.user.id,
                requestContext: req.body.requestContext ?? 'settings',
                error: logError instanceof Error ? logError.message : String(logError),
            });
        }
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to check username availability',
        });
    }
};
exports.checkUsernameAvailability = checkUsernameAvailability;
const getMe = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const client = (0, supabase_1.requireUserClient)(req.accessToken);
        const profile = await (0, brandProfiles_1.getBrandProfileByUserId)(client, req.user.id);
        return res.status(200).json({
            status: 'success',
            user: req.user,
            profile,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load current user',
        });
    }
};
exports.getMe = getMe;
const suggestIndustry = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const requestContext = req.body.requestContext ?? 'settings';
    console.info('[auth] industry suggestion started', {
        userId: req.user.id,
        requestContext,
        input: summarizeIndustrySuggestionInputForConsole(req.body),
    });
    try {
        const aiSuggestion = await (0, gemini_1.generateStructuredDataWithFallback)(buildIndustrySuggestionPrompt(req.body), industrySuggestionResponseSchema, 'industry-suggestion');
        const primaryIndustry = aiSuggestion.data.primaryIndustry.trim();
        const secondaryIndustries = sanitizeSecondaryIndustries(primaryIndustry, aiSuggestion.data.secondaryIndustries);
        const responsePayload = {
            primaryIndustry,
            secondaryIndustries,
            reasoning: aiSuggestion.data.reasoning,
            signals: aiSuggestion.data.signals,
            source: 'ai',
        };
        console.info('[auth] industry suggestion request succeeded', {
            userId: req.user.id,
            requestContext,
            provider: aiSuggestion.provider,
            primaryIndustry,
            secondaryCount: secondaryIndustries.length,
            secondaryIndustries,
            reasoning: responsePayload.reasoning,
            signals: responsePayload.signals,
        });
        try {
            await persistIndustrySuggestionEvent({
                accessToken: req.accessToken,
                userId: req.user.id,
                requestContext,
                requestBody: req.body,
                status: 'success',
                provider: aiSuggestion.provider,
                responsePayload,
            });
        }
        catch (logError) {
            console.warn('[auth] failed to persist industry suggestion log', {
                userId: req.user.id,
                requestContext,
                error: logError instanceof Error ? logError.message : String(logError),
            });
        }
        return res.status(200).json({
            status: 'success',
            data: responsePayload,
        });
    }
    catch (error) {
        const fallbackSuggestion = buildFallbackIndustrySuggestion(req.body);
        console.warn('[auth] industry suggestion fell back to heuristic scoring', {
            userId: req.user.id,
            requestContext,
            selectedPrimaryIndustry: fallbackSuggestion.primaryIndustry,
            secondaryIndustries: fallbackSuggestion.secondaryIndustries,
            signals: fallbackSuggestion.signals,
            error: error instanceof gemini_1.ContentGenerationProvidersExhaustedError
                ? error.failures
                : error instanceof Error
                    ? error.message
                    : String(error),
        });
        try {
            await persistIndustrySuggestionEvent({
                accessToken: req.accessToken,
                userId: req.user.id,
                requestContext,
                requestBody: req.body,
                status: 'fallback',
                provider: 'fallback',
                responsePayload: fallbackSuggestion,
                errorMessage: error instanceof gemini_1.ContentGenerationProvidersExhaustedError
                    ? JSON.stringify(error.failures)
                    : error instanceof Error
                        ? error.message
                        : String(error),
            });
        }
        catch (logError) {
            console.warn('[auth] failed to persist industry suggestion log', {
                userId: req.user.id,
                requestContext,
                error: logError instanceof Error ? logError.message : String(logError),
            });
        }
        return res.status(200).json({
            status: 'success',
            data: fallbackSuggestion,
        });
    }
};
exports.suggestIndustry = suggestIndustry;
const suggestBrandDescription = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    const requestContext = req.body.requestContext ?? 'settings';
    console.info('[auth] brand description suggestion started', {
        userId: req.user.id,
        requestContext,
        input: summarizeBrandDescriptionInputForConsole(req.body),
    });
    try {
        const aiSuggestion = await (0, gemini_1.generateStructuredDataWithGroqFallback)(buildBrandDescriptionSuggestionPrompt(req.body), brandDescriptionSuggestionResponseSchema, 'brand-description-suggestion');
        const description = sanitizeGeneratedBrandDescription(aiSuggestion.data.description);
        console.info('[auth] brand description suggestion succeeded', {
            userId: req.user.id,
            requestContext,
            language: req.body.language,
            provider: aiSuggestion.provider,
            descriptionChars: description.length,
            descriptionPreview: description.length > 120
                ? `${description.slice(0, 120).trimEnd()}...`
                : description,
        });
        try {
            await persistBrandDescriptionSuggestionEvent({
                accessToken: req.accessToken,
                userId: req.user.id,
                requestContext,
                requestBody: req.body,
                status: 'success',
                provider: aiSuggestion.provider,
                responsePayload: {
                    description,
                    provider: aiSuggestion.provider,
                    language: req.body.language,
                },
            });
        }
        catch (logError) {
            console.warn('[auth] failed to persist brand description suggestion log', {
                userId: req.user.id,
                requestContext,
                error: logError instanceof Error ? logError.message : String(logError),
            });
        }
        return res.status(200).json({
            status: 'success',
            data: {
                description,
                provider: aiSuggestion.provider,
                language: req.body.language,
            },
        });
    }
    catch (error) {
        console.error('[auth] brand description suggestion failed', {
            userId: req.user.id,
            requestContext,
            language: req.body.language,
            error: error instanceof gemini_1.ContentGenerationProvidersExhaustedError
                ? error.failures
                : error instanceof Error
                    ? error.message
                    : String(error),
        });
        try {
            await persistBrandDescriptionSuggestionEvent({
                accessToken: req.accessToken,
                userId: req.user.id,
                requestContext,
                requestBody: req.body,
                status: 'error',
                provider: null,
                errorMessage: error instanceof gemini_1.ContentGenerationProvidersExhaustedError
                    ? JSON.stringify(error.failures)
                    : error instanceof Error
                        ? error.message
                        : String(error),
            });
        }
        catch (logError) {
            console.warn('[auth] failed to persist brand description suggestion log', {
                userId: req.user.id,
                requestContext,
                error: logError instanceof Error ? logError.message : String(logError),
            });
        }
        return res.status(502).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to generate a brand description right now.',
        });
    }
};
exports.suggestBrandDescription = suggestBrandDescription;
