import type {
  BrandMemoryMatch,
  BrandProfile,
  ProductInput,
  RealtimeTrendIntelligence,
} from '../../types';

const formatList = (items: string[] | undefined) =>
  items && items.length > 0 ? items.join(', ') : 'none provided';

const formatPlatformWritingPolicy = (platform: string | null | undefined) => {
  const normalized = platform?.trim().toLowerCase() ?? '';

  if (!normalized) {
    return null;
  }

  if (normalized === 'linkedin') {
    return [
      'Platform-specific writing policy:',
      '- Write for LinkedIn with a professional, credible, insight-led tone.',
      '- Lead with a clear business takeaway or thoughtful angle before the CTA.',
      '- Favor clarity, trust, and practical value over meme-style phrasing or hype.',
      '- Keep the copy audience-aware and polished, with concise but meaningful detail.',
      '- Use a CTA that feels consultative, useful, and appropriate for professionals.',
    ].join('\n');
  }

  if (normalized === 'instagram') {
    return [
      'Platform-specific writing policy:',
      '- Write for Instagram with strong visual language, clear hooks, and fast readability.',
      '- Keep the copy punchy, modern, and emotionally immediate without becoming generic.',
      '- Favor concise phrasing, scroll-stopping openings, and easy-to-skim rhythm.',
    ].join('\n');
  }

  if (normalized === 'facebook') {
    return [
      'Platform-specific writing policy:',
      '- Write for Facebook with accessible, conversational phrasing and clear value.',
      '- Favor engaging hooks and CTAs that encourage reactions, comments, or shares.',
      '- Balance readability with enough context to feel trustworthy and useful.',
    ].join('\n');
  }

  if (normalized === 'x') {
    return [
      'Platform-specific writing policy:',
      '- Write for X with compressed, high-signal phrasing and fast impact.',
      '- Prioritize sharp hooks, clarity, and strong point-of-view without fluff.',
      '- Keep the language concise, timely, and easy to engage with quickly.',
    ].join('\n');
  }

  return null;
};

const clampMemoryText = (value: string, maxChars = 260) => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};

export const formatRetrievedBrandMemories = (
  brandMemories: BrandMemoryMatch[] | undefined
): string | null => {
  if (!brandMemories?.length) {
    return null;
  }

  return [
    'Relevant semantic brand memory:',
    ...brandMemories.map(
      (memory, index) =>
        `- Memory ${index + 1} (${memory.memoryType}, similarity ${memory.similarity.toFixed(2)}): ${clampMemoryText(
          memory.contentText
        )}`
    ),
    '- Reuse these memories only when they clearly match the current request.',
    '- Treat them as style and strategy guidance, not as facts to copy blindly.',
  ].join('\n');
};

export const formatBrandContext = (
  brandProfile: BrandProfile | null,
  brandMemories?: BrandMemoryMatch[]
): string => {
  const semanticMemorySection = formatRetrievedBrandMemories(brandMemories);

  if (!brandProfile) {
    const lines = [
      'Workspace profile context: none available.',
      'Do not invent a brand name or use the workspace owner name as the brand.',
      'Keep the output generic to the business and product when no brand name is supplied.',
      'Infer the domain and style only from the provided generation context.',
      'Never use the workspace owner personal name as the brand name.',
    ];

    if (semanticMemorySection) {
      lines.push(semanticMemorySection);
    }

    return lines.join('\n');
  }

  const lines = [
    'Workspace profile context (style guidance only):',
    `- Stored brand/business name: ${brandProfile.brandName ?? 'not provided'}`,
    `- Workspace owner name: ${brandProfile.fullName}`,
    `- Username: ${brandProfile.username ?? 'not provided'}`,
    `- Industry: ${brandProfile.industry ?? 'not provided'}`,
    `- Audience: ${brandProfile.targetAudience ?? 'not provided'}`,
    `- Brand voice: ${brandProfile.brandVoice ?? 'not provided'}`,
    `- Description: ${brandProfile.description ?? 'not provided'}`,
    '- Use the stored brand/business name only if the generation context below says to use it.',
    '- Never use the workspace owner personal name as the brand/business name.',
  ];

  if (semanticMemorySection) {
    lines.push(semanticMemorySection);
  }

  return lines.join('\n');
};

export const formatProductContext = (productInput: ProductInput): string =>
  [
    'Product context:',
    `- Use saved brand/business name: ${productInput.useBrandName ? 'yes' : 'no'}`,
    `- Brand / business name for this generation: ${productInput.brandName ?? 'not being used'}`,
    `- Product name: ${productInput.productName}`,
    `- Product description: ${productInput.productDescription ?? 'not provided'}`,
    `- Product image URL: ${productInput.productImageUrl ?? 'not provided'}`,
    `- Platform: ${productInput.platform ?? 'not provided'}`,
    `- Goal: ${productInput.goal ?? 'not provided'}`,
    `- Tone: ${productInput.tone ?? 'not provided'}`,
    `- Audience: ${productInput.audience ?? 'not provided'}`,
    `- Keywords: ${formatList(productInput.keywords)}`,
    '- Use the brand/business name only if this generation context includes one.',
    '- Infer the business domain from the product description, keywords, platform, audience, and brand profile.',
    '- Do not assume fashion, ecommerce, or any other industry unless it is explicitly supported by the input.',
    formatPlatformWritingPolicy(productInput.platform),
  ].join('\n');

export const formatTrendIntelligence = (
  trendIntelligence: RealtimeTrendIntelligence | null | undefined
): string | null => {
  if (!trendIntelligence || trendIntelligence.topCandidates.length === 0) {
    return null;
  }

  return [
    'Fresh web and social trend intelligence (use for live relevance, never copy verbatim):',
    `- Research summary: ${trendIntelligence.summary}`,
    `- Search queries used: ${trendIntelligence.searchQueries.join(' | ')}`,
    `- Primary platform signal: ${trendIntelligence.selectedPlatform ?? 'not provided'}`,
    `- Goal signal: ${trendIntelligence.selectedGoal ?? 'not provided'}`,
    `- Fresh hashtags emerging now: ${
      trendIntelligence.topHashtags.length > 0
        ? trendIntelligence.topHashtags.join(', ')
        : 'none strong enough'
    }`,
    ...trendIntelligence.insights.slice(0, 4).map(
      (insight, index) =>
        `- Trend insight ${index + 1}: ${insight.headline} | ${insight.explanation} | source=${insight.source}${insight.platform ? `/${insight.platform}` : ''} | score=${insight.viralScore.toFixed(2)}`
    ),
    ...trendIntelligence.topCandidates.slice(0, 4).map(
      (candidate, index) =>
        `- High-signal example ${index + 1}: ${clampMemoryText(
          [candidate.title, candidate.text].filter(Boolean).join(' — '),
          220
        )} | reasons=${candidate.reasons.map((reason) => reason.label).join(', ') || 'general relevance'}`
    ),
    '- Distill the pattern behind what is performing well right now.',
    '- Do not copy creators, brands, or exact captions from these references.',
    '- Exclude slang, sexual, hateful, political, religious, or spammy phrasing from the final output.',
  ].join('\n');
};
