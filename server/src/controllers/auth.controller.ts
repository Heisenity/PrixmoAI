import type { User } from '@supabase/supabase-js';
import { z } from 'zod';
import { Request, Response } from 'express';
import {
  ContentGenerationProvidersExhaustedError,
  generateStructuredDataWithFallback,
  generateStructuredDataWithGroqFallback,
} from '../ai/gemini';
import { formatRetrievedBrandMemories } from '../ai/prompts/shared';
import {
  getBrandProfileByUserId,
  getBrandProfileOwnerByUsername,
  listTakenUsernames,
  upsertBrandProfile,
} from '../db/queries/brandProfiles';
import {
  insertBrandProfileMemoryEvent,
  insertBrandDescriptionSuggestionLog,
  insertIndustrySuggestionLog,
  insertUsernameRecommendationLog,
} from '../db/queries/brandProfileMemory';
import { requireSupabaseAdmin, requireUserClient } from '../db/supabase';
import {
  AuthProfileInput,
  BrandDescriptionSuggestionInput,
  IndustrySuggestionInput,
  UsernameAvailabilityInput,
} from '../schemas/user.schema';
import type {
  BrandProfile,
  BrandProfileInput,
  ProfileSaveContext,
} from '../types';
import { DICTATION_LANGUAGE_LABELS } from '../lib/dictationLanguages';
import {
  getEmailLocalPart,
  isValidNormalizedUsername,
  normalizeUsername,
} from '../lib/username';
import {
  formatSemanticReferenceChunks,
  getRelevantMemoriesForBrandDescription,
  syncBrandProfileSemanticMemory,
} from '../services/brandMemory.service';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

type BrandProfileMemorySnapshot = {
  brandName: string | null;
  fullName: string;
  phoneNumber: string | null;
  username: string | null;
  avatarUrl: string | null;
  country: string | null;
  language: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  industry: string | null;
  primaryIndustry: string | null;
  secondaryIndustries: string[];
  targetAudience: string | null;
  brandVoice: string | null;
  description: string | null;
};

const PROFILE_MEMORY_SNAPSHOT_KEYS: Array<keyof BrandProfileMemorySnapshot> = [
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

const toBrandProfileInput = (body: AuthProfileInput): BrandProfileInput => ({
  brandName: body.brandName,
  fullName: body.fullName,
  phoneNumber: body.phoneNumber ?? null,
  username: body.username ? normalizeUsername(body.username) : null,
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

const toProfileMemorySnapshot = (
  profile: BrandProfile | null
): BrandProfileMemorySnapshot | null => {
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

const areSnapshotValuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const buildProfileFieldChanges = (
  previousProfile: BrandProfile | null,
  currentProfile: BrandProfile
) => {
  const previousSnapshot = toProfileMemorySnapshot(previousProfile);
  const currentSnapshot = toProfileMemorySnapshot(currentProfile)!;
  const changedFields: string[] = [];
  const fieldChanges: Record<
    string,
    {
      previous: unknown;
      current: unknown;
    }
  > = {};

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
        ? ('updated' as const)
        : ('saved' as const)
      : ('created' as const),
  };
};

const persistBrandProfileMemoryEvent = async (
  request: AuthenticatedRequest<{}, unknown, AuthProfileInput>,
  previousProfile: BrandProfile | null,
  currentProfile: BrandProfile
) => {
  if (!request.user?.id) {
    return;
  }

  const client = requireUserClient(request.accessToken);
  const { previousSnapshot, currentSnapshot, changedFields, fieldChanges, eventType } =
    buildProfileFieldChanges(previousProfile, currentProfile);

  await insertBrandProfileMemoryEvent(client, {
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

const industrySuggestionResponseSchema = z.object({
  primaryIndustry: z.string().trim().min(1),
  secondaryIndustries: z.array(z.string().trim().min(1)).max(3).default([]),
  reasoning: z.string().trim().min(1),
  signals: z.array(z.string().trim().min(1)).max(8).default([]),
});

const brandDescriptionSuggestionResponseSchema = z.object({
  description: z.string().trim().min(80).max(500),
});

const usernameSuggestionResponseSchema = z.object({
  suggestions: z.array(z.string().trim().min(3)).min(2).max(8),
});

type UsernameAvailabilityResponse = {
  normalizedUsername: string;
  isAvailable: boolean;
  message: string;
  suggestions: string[];
  provider: 'groq' | 'gemini' | 'fallback' | null;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+/&.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string) =>
  Array.from(
    new Set(
      normalizeText(value)
        .split(/[\s/&.+-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  );

const countTokenHits = (text: string, tokens: string[]) =>
  tokens.reduce(
    (score, token) =>
      score +
      (text.includes(` ${token} `) || text.startsWith(`${token} `) || text.endsWith(` ${token}`) || text === token
        ? 1
        : 0),
    0
  );

const sanitizeSecondaryIndustries = (
  primaryIndustry: string,
  secondaryIndustries: string[]
) => {
  const normalizedPrimary = primaryIndustry.trim().toLowerCase();
  const seen = new Set<string>();

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

const buildIndustrySuggestionPrompt = (input: IndustrySuggestionInput) => {
  const categories = Array.from(
    new Set(input.catalog.map((entry) => entry.category.trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
  const catalogText = input.catalog
    .map(
      (entry) =>
        `- ${entry.category} :: ${entry.label}${
          entry.tags?.length ? ` [tags: ${entry.tags.join(', ')}]` : ''
        }`
    )
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

const buildFallbackIndustrySuggestion = (input: IndustrySuggestionInput) => {
  const problemText = input.suggestionText.trim();
  const socialContext = input.socialContext?.trim() ?? '';
  const combinedText = normalizeText(
    [
      problemText,
      input.brandName,
      input.username ?? '',
      input.description ?? '',
      input.websiteUrl ?? '',
      socialContext,
    ].join(' ')
  );
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
        matchedSignals: Array.from(
          new Set(
            [...labelTokens, ...categoryTokens, ...tagTokens].filter((token) =>
              paddedText.includes(` ${token} `)
            )
          )
        ),
      };
    })
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  const scoredCategories = Array.from(
    scored.reduce(
      (map, entry) => {
        const current = map.get(entry.category) ?? {
          category: entry.category,
          score: 0,
          matchedSignals: new Set<string>(),
        };

        current.score += entry.score;
        entry.matchedSignals.forEach((signal) => current.matchedSignals.add(signal));
        map.set(entry.category, current);
        return map;
      },
      new Map<
        string,
        {
          category: string;
          score: number;
          matchedSignals: Set<string>;
        }
      >()
    ).values()
  )
    .map((entry) => ({
      ...entry,
      matchedSignals: Array.from(entry.matchedSignals),
    }))
    .sort((left, right) => right.score - left.score || left.category.localeCompare(right.category));

  const fallbackPrimaryCategory =
    scoredCategories.find((entry) => entry.score > 0) ??
    scoredCategories[0] ?? {
      category: 'Personal Brand',
      score: 0,
      matchedSignals: [],
    };
  const fallbackCustomPrimary =
    problemText ||
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
  const shouldUseCustomPrimary =
    Boolean(normalizedCustomPrimary) &&
    fallbackPrimaryCategory.score <= 2;

  const secondaryIndustries = sanitizeSecondaryIndustries(
    shouldUseCustomPrimary
      ? normalizedCustomPrimary
      : fallbackPrimaryCategory.category,
    scored
      .filter((entry) => entry.category === fallbackPrimaryCategory.category)
      .filter(
        (entry) =>
          entry.score > 0 &&
          entry.matchedSignals.some((signal) =>
            fallbackPrimaryCategory.matchedSignals.includes(signal)
          )
      )
      .slice(0, 3)
      .map((entry) => entry.label)
  );

  return {
    primaryIndustry:
      shouldUseCustomPrimary && normalizedCustomPrimary
        ? normalizedCustomPrimary
        : fallbackPrimaryCategory.category,
    secondaryIndustries,
    reasoning:
      shouldUseCustomPrimary
        ? 'Suggested a custom other-industry name from the business summary because no exact catalog label matched strongly enough.'
        : 'Suggested from the strongest overlap between the business problem, brand details, website clues, and optional social context.',
    signals:
      fallbackPrimaryCategory.matchedSignals.slice(0, 6) ??
      tokenize(problemText).slice(0, 6),
    source: 'fallback' as const,
  };
};

const buildIndustrySuggestionLogPayload = (
  input: IndustrySuggestionInput,
  requestContext: ProfileSaveContext
) => ({
  requestContext,
  brandName: input.brandName,
  username: input.username ?? null,
  description: input.description ?? null,
  websiteUrl: input.websiteUrl ?? null,
  socialContext: input.socialContext ?? null,
  suggestionText: input.suggestionText,
  catalogSize: input.catalog.length,
});

const sanitizeGeneratedBrandDescription = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .trim()
    .slice(0, 500)
    .trim();

const slugifyUsernameSeed = (value: string) =>
  normalizeUsername(
    value
      .replace(/[&+/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

const buildUsernameSuggestionPrompt = ({
  desiredUsername,
  brandName,
  fullName,
  emailLocalPart,
}: {
  desiredUsername: string;
  brandName: string;
  fullName?: string;
  emailLocalPart?: string;
}) =>
  [
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

const buildDeterministicUsernameCandidates = ({
  desiredUsername,
  brandName,
  fullName,
  emailLocalPart,
}: {
  desiredUsername: string;
  brandName: string;
  fullName?: string;
  emailLocalPart?: string;
}) => {
  const brandSeed = slugifyUsernameSeed(brandName);
  const desiredSeed = slugifyUsernameSeed(desiredUsername);
  const emailSeed = slugifyUsernameSeed(emailLocalPart ?? '');
  const fullNameSeed = slugifyUsernameSeed(fullName ?? '');
  const seeds = Array.from(
    new Set([brandSeed, desiredSeed, emailSeed, fullNameSeed].filter(Boolean))
  );
  const candidates = new Set<string>();
  const suffixes = ['hq', 'official', 'studio', 'labs', 'co', 'team', 'ai'];

  for (const seed of seeds) {
    if (isValidNormalizedUsername(seed)) {
      candidates.add(seed);
    }

    for (const suffix of suffixes) {
      const underscoreVariant = normalizeUsername(`${seed}_${suffix}`);
      const dotVariant = normalizeUsername(`${seed}.${suffix}`);
      const joinedVariant = normalizeUsername(`${seed}${suffix}`);

      if (isValidNormalizedUsername(underscoreVariant)) {
        candidates.add(underscoreVariant);
      }

      if (isValidNormalizedUsername(dotVariant)) {
        candidates.add(dotVariant);
      }

      if (isValidNormalizedUsername(joinedVariant)) {
        candidates.add(joinedVariant);
      }
    }
  }

  if (brandSeed && emailSeed) {
    for (const candidate of [
      normalizeUsername(`${brandSeed}_${emailSeed}`),
      normalizeUsername(`${brandSeed}.${emailSeed}`),
      normalizeUsername(`${emailSeed}_${brandSeed}`),
      normalizeUsername(`${brandSeed}${emailSeed}`),
    ]) {
      if (isValidNormalizedUsername(candidate)) {
        candidates.add(candidate);
      }
    }
  }

  return Array.from(candidates);
};

const filterAvailableUsernames = async (
  candidates: string[],
  desiredUsername: string
) => {
  const adminClient = requireSupabaseAdmin();
  const normalizedCandidates = Array.from(
    new Set(
      candidates
        .map((entry) => normalizeUsername(entry))
        .filter((entry) => isValidNormalizedUsername(entry) && entry !== desiredUsername)
    )
  );
  const takenUsernames = await listTakenUsernames(adminClient, normalizedCandidates);

  return normalizedCandidates.filter((candidate) => !takenUsernames.has(candidate));
};

const buildUsernameSuggestions = async ({
  desiredUsername,
  brandName,
  fullName,
  emailLocalPart,
}: {
  desiredUsername: string;
  brandName: string;
  fullName?: string;
  emailLocalPart?: string;
}) => {
  let provider: 'groq' | 'gemini' | 'fallback' = 'fallback';
  let aiCandidates: string[] = [];

  try {
    const aiSuggestion = await generateStructuredDataWithGroqFallback(
      buildUsernameSuggestionPrompt({
        desiredUsername,
        brandName,
        fullName,
        emailLocalPart,
      }),
      usernameSuggestionResponseSchema,
      'username-suggestion'
    );

    provider = aiSuggestion.provider;
    aiCandidates = aiSuggestion.data.suggestions;
  } catch (error) {
    console.warn('[auth] username suggestion fell back to deterministic mode', {
      desiredUsername,
      error:
        error instanceof ContentGenerationProvidersExhaustedError
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
  const initialAvailable = await filterAvailableUsernames(
    [...aiCandidates, ...deterministicCandidates],
    desiredUsername
  );

  if (initialAvailable.length >= 2) {
    return {
      suggestions: initialAvailable.slice(0, 2),
      provider,
    };
  }

  const fallbackBases = Array.from(
    new Set(
      [
        slugifyUsernameSeed(brandName),
        slugifyUsernameSeed(emailLocalPart ?? ''),
        slugifyUsernameSeed(desiredUsername),
      ].filter(Boolean)
    )
  );
  const extendedCandidates = [...initialAvailable];

  for (let suffix = 1; suffix <= 999 && extendedCandidates.length < 2; suffix += 1) {
    const numericBatch = fallbackBases
      .flatMap((base) => [
        normalizeUsername(`${base}${suffix}`),
        normalizeUsername(`${base}_${suffix}`),
        normalizeUsername(`${base}.${suffix}`),
      ])
      .filter(isValidNormalizedUsername);
    const availableBatch = await filterAvailableUsernames(
      numericBatch,
      desiredUsername
    );

    for (const candidate of availableBatch) {
      if (!extendedCandidates.includes(candidate)) {
        extendedCandidates.push(candidate);
      }

      if (extendedCandidates.length >= 2) {
        break;
      }
    }
  }

  return {
    suggestions: extendedCandidates.slice(0, 2),
    provider: initialAvailable.length ? provider : 'fallback',
  };
};

const getUsernameAvailability = async ({
  accessToken,
  desiredUsername,
  brandName,
  fullName,
  userId,
  email,
  requestContext = 'system',
}: {
  accessToken?: string;
  desiredUsername: string;
  brandName?: string;
  fullName?: string;
  userId: string;
  email?: string | null;
  requestContext?: ProfileSaveContext;
}): Promise<UsernameAvailabilityResponse> => {
  const normalizedUsername = normalizeUsername(desiredUsername);
  const emailLocalPart = getEmailLocalPart(email);

  const persistResult = async ({
    isAvailable,
    message,
    suggestions,
    provider,
    errorMessage,
  }: {
    isAvailable: boolean;
    message: string;
    suggestions: string[];
    provider: UsernameAvailabilityResponse['provider'];
    errorMessage?: string | null;
  }) => {
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
    } catch (logError) {
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

  if (!isValidNormalizedUsername(normalizedUsername)) {
    return persistResult({
      isAvailable: false,
      message: 'Use 3-30 letters, numbers, dots, or underscores in the username.',
      suggestions: [],
      provider: null,
    });
  }

  const adminClient = requireSupabaseAdmin();
  const existingOwner = await getBrandProfileOwnerByUsername(adminClient, normalizedUsername);

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

const isUsernameConflictError = (error: unknown) =>
  error instanceof Error &&
  /duplicate key value|unique constraint|brand_profiles_username_unique_idx|username/i.test(
    error.message
  );

const buildBrandDescriptionSuggestionPrompt = (
  input: BrandDescriptionSuggestionInput,
  brandMemories: Parameters<typeof formatRetrievedBrandMemories>[0] = []
) => {
  const languageLabel = DICTATION_LANGUAGE_LABELS[input.language] ?? 'English';
  const secondaryIndustries = input.secondaryIndustries?.length
    ? input.secondaryIndustries.join(', ')
    : 'not provided';
  const semanticMemorySection = formatRetrievedBrandMemories(brandMemories);
  const socialContextChunks = formatSemanticReferenceChunks(
    'Social media context',
    input.socialContext,
    4
  );
  const existingDescriptionChunks = formatSemanticReferenceChunks(
    'Existing description context',
    input.existingDescription,
    3
  );

  const lines = [
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
    `- Short brand note: ${input.shortInput.trim()}`,
    '',
    'Return JSON only in this exact shape:',
    '{',
    '  "description": "Production-ready brand description"',
    '}',
  ];

  if (semanticMemorySection) {
    lines.splice(lines.length - 4, 0, '', semanticMemorySection);
  }

  if (socialContextChunks.length > 0) {
    lines.splice(lines.length - 4, 0, '', ...socialContextChunks);
  } else {
    lines.splice(lines.length - 4, 0, '', '- Social media links / bios / posts: not provided');
  }

  if (existingDescriptionChunks.length > 0) {
    lines.splice(lines.length - 4, 0, '', ...existingDescriptionChunks);
  } else {
    lines.splice(lines.length - 4, 0, '', '- Existing description: not provided');
  }

  return lines.join('\n');
};

const persistIndustrySuggestionEvent = async ({
  accessToken,
  userId,
  requestContext,
  requestBody,
  status,
  provider,
  responsePayload,
  errorMessage,
}: {
  accessToken?: string;
  userId: string;
  requestContext: ProfileSaveContext;
  requestBody: IndustrySuggestionInput;
  status: 'success' | 'fallback' | 'error';
  provider?: string | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) => {
  const client = requireUserClient(accessToken);
  const currentProfile = await getBrandProfileByUserId(client, userId);

  await insertIndustrySuggestionLog(client, {
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

const buildBrandDescriptionSuggestionLogPayload = (
  input: BrandDescriptionSuggestionInput,
  requestContext: ProfileSaveContext
) => ({
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

const persistBrandDescriptionSuggestionEvent = async ({
  accessToken,
  userId,
  requestContext,
  requestBody,
  status,
  provider,
  responsePayload,
  errorMessage,
}: {
  accessToken?: string;
  userId: string;
  requestContext: ProfileSaveContext;
  requestBody: BrandDescriptionSuggestionInput;
  status: 'success' | 'error';
  provider?: string | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) => {
  const client = requireUserClient(accessToken);
  const currentProfile = await getBrandProfileByUserId(client, userId);

  await insertBrandDescriptionSuggestionLog(client, {
    userId,
    brandProfileId: currentProfile?.id ?? null,
    requestContext,
    status,
    provider,
    requestPayload: buildBrandDescriptionSuggestionLogPayload(
      requestBody,
      requestContext
    ),
    responsePayload: responsePayload ?? null,
    errorMessage: errorMessage ?? null,
  });
};

const persistUsernameRecommendationEvent = async ({
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
  errorMessage,
}: {
  accessToken?: string;
  userId: string;
  requestContext: ProfileSaveContext;
  desiredUsername: string;
  normalizedUsername: string;
  brandName?: string;
  fullName?: string;
  emailLocalPart?: string | null;
  isAvailable: boolean;
  provider?: string | null;
  suggestions: string[];
  errorMessage?: string | null;
}) => {
  const client = requireUserClient(accessToken);
  const currentProfile = await getBrandProfileByUserId(client, userId);

  await insertUsernameRecommendationLog(client, {
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

export const saveProfile = async (
  req: AuthenticatedRequest<{}, unknown, AuthProfileInput>,
  res: Response
) => {
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

    const client = requireUserClient(req.accessToken);
    const previousProfile = await getBrandProfileByUserId(client, req.user.id);
    const profile = await upsertBrandProfile(
      client,
      req.user.id,
      toBrandProfileInput(req.body)
    );
    await persistBrandProfileMemoryEvent(req, previousProfile, profile);

    try {
      await syncBrandProfileSemanticMemory(client, req.user.id, profile);
    } catch (memoryError) {
      console.warn('[auth] failed to index brand profile semantic memory', {
        userId: req.user.id,
        profileId: profile.id,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Brand profile saved successfully',
      profile,
    });
  } catch (error) {
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
      message:
        error instanceof Error
          ? error.message
          : 'Failed to save brand profile',
    });
  }
};

export const checkUsernameAvailability = async (
  req: AuthenticatedRequest<{}, unknown, UsernameAvailabilityInput>,
  res: Response
) => {
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
  } catch (error) {
    try {
      await persistUsernameRecommendationEvent({
        accessToken: req.accessToken,
        userId: req.user.id,
        requestContext: req.body.requestContext ?? 'settings',
        desiredUsername: req.body.desiredUsername,
        normalizedUsername: normalizeUsername(req.body.desiredUsername),
        brandName: req.body.brandName,
        fullName: req.body.fullName,
        emailLocalPart: getEmailLocalPart(req.user.email),
        isAvailable: false,
        provider: null,
        suggestions: [],
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } catch (logError) {
      console.warn('[auth] failed to persist username recommendation error log', {
        userId: req.user.id,
        requestContext: req.body.requestContext ?? 'settings',
        error: logError instanceof Error ? logError.message : String(logError),
      });
    }

    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to check username availability',
    });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const profile = await getBrandProfileByUserId(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      user: req.user,
      profile,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to load current user',
    });
  }
};

export const suggestIndustry = async (
  req: AuthenticatedRequest<{}, unknown, IndustrySuggestionInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  const requestContext = req.body.requestContext ?? 'settings';

  try {
    const aiSuggestion = await generateStructuredDataWithFallback(
      buildIndustrySuggestionPrompt(req.body),
      industrySuggestionResponseSchema,
      'industry-suggestion'
    );
    const primaryIndustry = aiSuggestion.data.primaryIndustry.trim();
    const secondaryIndustries = sanitizeSecondaryIndustries(
      primaryIndustry,
      aiSuggestion.data.secondaryIndustries
    );
    const responsePayload = {
      primaryIndustry,
      secondaryIndustries,
      reasoning: aiSuggestion.data.reasoning,
      signals: aiSuggestion.data.signals,
      source: 'ai' as const,
    };

    console.info('[auth] industry suggestion request succeeded', {
      userId: req.user.id,
      requestContext,
      provider: aiSuggestion.provider,
      primaryIndustry,
      secondaryCount: secondaryIndustries.length,
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
    } catch (logError) {
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
  } catch (error) {
    const fallbackSuggestion = buildFallbackIndustrySuggestion(req.body);

    console.warn('[auth] industry suggestion fell back to heuristic scoring', {
      userId: req.user.id,
      requestContext,
      error:
        error instanceof ContentGenerationProvidersExhaustedError
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
        errorMessage:
          error instanceof ContentGenerationProvidersExhaustedError
            ? JSON.stringify(error.failures)
            : error instanceof Error
              ? error.message
              : String(error),
      });
    } catch (logError) {
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

export const suggestBrandDescription = async (
  req: AuthenticatedRequest<{}, unknown, BrandDescriptionSuggestionInput>,
  res: Response
) => {
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
    language: req.body.language,
    shortInputChars: req.body.shortInput.length,
  });

  try {
    let brandMemories = [] as Awaited<
      ReturnType<typeof getRelevantMemoriesForBrandDescription>
    >;

    try {
      const client = requireUserClient(req.accessToken);
      brandMemories = await getRelevantMemoriesForBrandDescription(
        client,
        req.user.id,
        req.body
      );
    } catch (memoryError) {
      console.warn('[auth] failed to retrieve semantic brand memory for description', {
        userId: req.user.id,
        requestContext,
        error: memoryError instanceof Error ? memoryError.message : String(memoryError),
      });
    }

    const aiSuggestion = await generateStructuredDataWithGroqFallback(
      buildBrandDescriptionSuggestionPrompt(req.body, brandMemories),
      brandDescriptionSuggestionResponseSchema,
      'brand-description-suggestion'
    );
    const description = sanitizeGeneratedBrandDescription(
      aiSuggestion.data.description
    );

    console.info('[auth] brand description suggestion succeeded', {
      userId: req.user.id,
      requestContext,
      language: req.body.language,
      provider: aiSuggestion.provider,
      descriptionChars: description.length,
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
    } catch (logError) {
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
  } catch (error) {
    console.error('[auth] brand description suggestion failed', {
      userId: req.user.id,
      requestContext,
      language: req.body.language,
      error:
        error instanceof ContentGenerationProvidersExhaustedError
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
        errorMessage:
          error instanceof ContentGenerationProvidersExhaustedError
            ? JSON.stringify(error.failures)
            : error instanceof Error
              ? error.message
              : String(error),
      });
    } catch (logError) {
      console.warn('[auth] failed to persist brand description suggestion log', {
        userId: req.user.id,
        requestContext,
        error: logError instanceof Error ? logError.message : String(logError),
      });
    }

    return res.status(502).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to generate a brand description right now.',
    });
  }
};
