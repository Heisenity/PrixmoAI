export type IndustryCatalogEntry = {
  id: string;
  label: string;
  categoryId: string;
  categoryLabel: string;
  tags: string[];
  isOther?: boolean;
};

type IndustryGroupDefinition = {
  id: string;
  label: string;
  tags: string[];
  relatedGroupIds?: string[];
  options: Array<{
    id: string;
    label: string;
    tags?: string[];
    isOther?: boolean;
  }>;
};

const INDUSTRY_GROUP_DEFINITIONS: IndustryGroupDefinition[] = [
  {
    id: 'retail-ecommerce',
    label: 'Retail & E-commerce',
    tags: ['retail', 'consumer', 'ecommerce', 'brand'],
    relatedGroupIds: ['personal-brand', 'marketing-advertising'],
    options: [
      { id: 'fashion-apparel', label: 'Fashion & Apparel', tags: ['fashion', 'style'] },
      { id: 'beauty-cosmetics', label: 'Beauty & Cosmetics', tags: ['beauty', 'personal-care'] },
      { id: 'jewelry-accessories', label: 'Jewelry & Accessories', tags: ['jewelry', 'accessories', 'luxury'] },
      { id: 'footwear', label: 'Footwear', tags: ['shoes', 'fashion'] },
      { id: 'electronics-gadgets', label: 'Electronics & Gadgets', tags: ['electronics', 'gadgets', 'tech'] },
      { id: 'home-decor-furniture', label: 'Home Decor & Furniture', tags: ['home', 'decor', 'furniture'] },
      { id: 'pet-products', label: 'Pet Products', tags: ['pets', 'consumer'] },
      { id: 'baby-kids-products', label: 'Baby & Kids Products', tags: ['baby', 'kids', 'family'] },
      { id: 'luxury-goods', label: 'Luxury Goods', tags: ['luxury', 'premium'] },
      { id: 'thrift-resale', label: 'Thrift / Resale', tags: ['resale', 'secondhand', 'marketplace'] },
      { id: 'ecommerce-brand', label: 'E-commerce Brand', tags: ['ecommerce', 'store', 'online'] },
      { id: 'retail-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'food-beverage',
    label: 'Food & Beverage',
    tags: ['food', 'beverage', 'hospitality', 'consumer'],
    relatedGroupIds: ['travel-hospitality', 'local-small-businesses'],
    options: [
      { id: 'restaurants', label: 'Restaurants', tags: ['restaurant', 'dining'] },
      { id: 'cafes-coffee-shops', label: 'Cafes & Coffee Shops', tags: ['cafe', 'coffee'] },
      { id: 'cloud-kitchen', label: 'Cloud Kitchen', tags: ['delivery', 'kitchen'] },
      { id: 'bakery-desserts', label: 'Bakery & Desserts', tags: ['bakery', 'dessert', 'sweets'] },
      { id: 'packaged-food-brands', label: 'Packaged Food Brands', tags: ['packaged', 'fmcg'] },
      { id: 'beverages', label: 'Beverages (Juices, Alcohol-free, etc.)', tags: ['beverages', 'drinks'] },
      { id: 'catering-services', label: 'Catering Services', tags: ['events', 'catering'] },
      { id: 'street-food-vendors', label: 'Street Food Vendors', tags: ['street-food', 'local'] },
      { id: 'food-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'health-wellness',
    label: 'Health, Fitness & Wellness',
    tags: ['health', 'wellness', 'fitness', 'care'],
    relatedGroupIds: ['beauty-personal-care-services', 'personal-brand'],
    options: [
      { id: 'gym-fitness-center', label: 'Gym / Fitness Center', tags: ['gym', 'fitness'] },
      { id: 'personal-training', label: 'Personal Training', tags: ['training', 'coach'] },
      { id: 'yoga-meditation', label: 'Yoga / Meditation', tags: ['yoga', 'meditation', 'mindfulness'] },
      { id: 'nutrition-diet', label: 'Nutrition & Diet Coaching', tags: ['nutrition', 'diet', 'coach'] },
      { id: 'supplements', label: 'Supplements', tags: ['nutrition', 'wellness', 'product'] },
      { id: 'mental-health', label: 'Mental Health Services', tags: ['mental-health', 'therapy'] },
      { id: 'physiotherapy', label: 'Physiotherapy', tags: ['physio', 'rehab'] },
      { id: 'wellness-brands', label: 'Wellness Brands', tags: ['wellness', 'brand'] },
      { id: 'health-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'beauty-personal-care-services',
    label: 'Beauty & Personal Care Services',
    tags: ['beauty', 'personal-care', 'service', 'consumer'],
    relatedGroupIds: ['retail-ecommerce', 'personal-brand'],
    options: [
      { id: 'salon', label: 'Salon', tags: ['salon', 'beauty'] },
      { id: 'spa', label: 'Spa', tags: ['spa', 'wellness'] },
      { id: 'makeup-artist', label: 'Makeup Artist', tags: ['makeup', 'beauty', 'artist'] },
      { id: 'skincare-clinic', label: 'Skincare Clinic', tags: ['skincare', 'clinic'] },
      { id: 'haircare-services', label: 'Haircare Services', tags: ['hair', 'beauty'] },
      { id: 'nail-studio', label: 'Nail Studio', tags: ['nails', 'beauty'] },
      { id: 'grooming-services', label: 'Grooming Services', tags: ['grooming', 'beauty'] },
      { id: 'beauty-services-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'education-coaching',
    label: 'Education & Coaching',
    tags: ['education', 'teaching', 'learning', 'coaching'],
    relatedGroupIds: ['personal-brand', 'technology-saas'],
    options: [
      { id: 'schools-colleges', label: 'Schools / Colleges', tags: ['school', 'college', 'education'] },
      { id: 'edtech-platforms', label: 'EdTech Platforms', tags: ['edtech', 'technology', 'learning'] },
      { id: 'coaching-institutes', label: 'Coaching Institutes', tags: ['coaching', 'training'] },
      { id: 'online-courses', label: 'Online Courses', tags: ['courses', 'digital', 'learning'] },
      { id: 'skill-development', label: 'Skill Development', tags: ['skills', 'learning'] },
      { id: 'language-training', label: 'Language Training', tags: ['language', 'training'] },
      { id: 'career-coaching', label: 'Career Coaching', tags: ['career', 'coach'] },
      { id: 'education-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'technology-saas',
    label: 'Technology & SaaS',
    tags: ['technology', 'software', 'saas', 'digital'],
    relatedGroupIds: ['marketing-advertising', 'finance-business-services'],
    options: [
      { id: 'saas-products', label: 'SaaS Products', tags: ['saas', 'software'] },
      { id: 'ai-ml-tools', label: 'AI / ML Tools', tags: ['ai', 'ml', 'automation'] },
      { id: 'web-development-agency', label: 'Web Development Agency', tags: ['web', 'development', 'agency'] },
      { id: 'mobile-app-development', label: 'Mobile App Development', tags: ['mobile', 'apps', 'development'] },
      { id: 'cybersecurity', label: 'Cybersecurity', tags: ['security', 'cybersecurity'] },
      { id: 'cloud-services', label: 'Cloud Services', tags: ['cloud', 'infrastructure'] },
      { id: 'it-services', label: 'IT Services', tags: ['it', 'services', 'support'] },
      { id: 'dev-tools', label: 'Dev Tools', tags: ['developers', 'tooling', 'software'] },
      { id: 'technology-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'finance-business-services',
    label: 'Finance & Business Services',
    tags: ['finance', 'business', 'professional-services'],
    relatedGroupIds: ['technology-saas', 'real-estate-construction'],
    options: [
      { id: 'fintech', label: 'FinTech', tags: ['fintech', 'finance', 'technology'] },
      { id: 'accounting-ca', label: 'Accounting / CA Services', tags: ['accounting', 'tax', 'finance'] },
      { id: 'investment-trading', label: 'Investment / Trading', tags: ['investment', 'trading'] },
      { id: 'insurance', label: 'Insurance', tags: ['insurance', 'finance'] },
      { id: 'loans-lending', label: 'Loans / Lending', tags: ['loans', 'lending', 'finance'] },
      { id: 'consulting', label: 'Consulting', tags: ['consulting', 'advisory'] },
      { id: 'legal-services', label: 'Legal Services', tags: ['legal', 'law'] },
      { id: 'finance-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'real-estate-construction',
    label: 'Real Estate & Construction',
    tags: ['property', 'real-estate', 'construction', 'home'],
    relatedGroupIds: ['finance-business-services', 'local-small-businesses'],
    options: [
      { id: 'real-estate-agency', label: 'Real Estate Agency', tags: ['real-estate', 'property'] },
      { id: 'property-developers', label: 'Property Developers', tags: ['developers', 'property'] },
      { id: 'interior-design', label: 'Interior Design', tags: ['interiors', 'design', 'home'] },
      { id: 'architecture', label: 'Architecture', tags: ['architecture', 'design'] },
      { id: 'home-services', label: 'Home Services', tags: ['home', 'services'] },
      { id: 'construction', label: 'Construction', tags: ['construction', 'builders'] },
      { id: 'real-estate-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'automotive',
    label: 'Automotive',
    tags: ['automotive', 'vehicles', 'mobility'],
    relatedGroupIds: ['travel-hospitality', 'local-small-businesses'],
    options: [
      { id: 'car-dealership', label: 'Car Dealership', tags: ['cars', 'dealership'] },
      { id: 'bike-dealership', label: 'Bike Dealership', tags: ['bike', 'dealership'] },
      { id: 'ev', label: 'EV (Electric Vehicles)', tags: ['ev', 'electric', 'vehicles'] },
      { id: 'car-rentals', label: 'Car Rentals', tags: ['rentals', 'mobility'] },
      { id: 'auto-services-garage', label: 'Auto Services / Garage', tags: ['garage', 'repair', 'service'] },
      { id: 'automotive-accessories', label: 'Accessories', tags: ['accessories', 'vehicles'] },
      { id: 'automotive-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'travel-hospitality',
    label: 'Travel & Hospitality',
    tags: ['travel', 'hospitality', 'tourism', 'service'],
    relatedGroupIds: ['food-beverage', 'local-small-businesses'],
    options: [
      { id: 'travel-agency', label: 'Travel Agency', tags: ['travel', 'agency'] },
      { id: 'tour-operators', label: 'Tour Operators', tags: ['tourism', 'travel'] },
      { id: 'hotels-resorts', label: 'Hotels & Resorts', tags: ['hotel', 'resort', 'hospitality'] },
      { id: 'homestays', label: 'Homestays', tags: ['stay', 'hospitality'] },
      { id: 'adventure-travel', label: 'Adventure Travel', tags: ['adventure', 'travel'] },
      { id: 'visa-services', label: 'Visa Services', tags: ['visa', 'travel'] },
      { id: 'travel-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'media-entertainment',
    label: 'Media, Content & Entertainment',
    tags: ['media', 'content', 'creator', 'entertainment'],
    relatedGroupIds: ['marketing-advertising', 'personal-brand', 'creative-design'],
    options: [
      { id: 'content-creators', label: 'Content Creators', tags: ['creator', 'content'] },
      { id: 'influencers-media', label: 'Influencers', tags: ['influencer', 'creator'] },
      { id: 'youtube-channels', label: 'YouTube Channels', tags: ['youtube', 'video'] },
      { id: 'production-house', label: 'Production House', tags: ['production', 'video'] },
      { id: 'photography-videography', label: 'Photography / Videography', tags: ['photo', 'video', 'creative'] },
      { id: 'podcasting', label: 'Podcasting', tags: ['podcast', 'audio'] },
      { id: 'ott-media', label: 'OTT / Media', tags: ['ott', 'media'] },
      { id: 'media-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'marketing-advertising',
    label: 'Marketing & Advertising',
    tags: ['marketing', 'advertising', 'growth', 'brand'],
    relatedGroupIds: ['media-entertainment', 'technology-saas', 'personal-brand'],
    options: [
      { id: 'digital-marketing-agency', label: 'Digital Marketing Agency', tags: ['digital-marketing', 'agency'] },
      { id: 'branding-agency', label: 'Branding Agency', tags: ['branding', 'brand', 'agency'] },
      { id: 'social-media-agency', label: 'Social Media Agency', tags: ['social', 'media', 'agency'] },
      { id: 'seo-services', label: 'SEO Services', tags: ['seo', 'search'] },
      { id: 'performance-marketing', label: 'Performance Marketing', tags: ['performance', 'ads', 'growth'] },
      { id: 'pr-agency', label: 'PR Agency', tags: ['pr', 'communications'] },
      { id: 'marketing-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'creative-design',
    label: 'Creative & Design',
    tags: ['creative', 'design', 'visual'],
    relatedGroupIds: ['media-entertainment', 'marketing-advertising', 'retail-ecommerce'],
    options: [
      { id: 'graphic-design', label: 'Graphic Design', tags: ['graphic', 'design'] },
      { id: 'ui-ux-design', label: 'UI/UX Design', tags: ['ui', 'ux', 'design'] },
      { id: 'fashion-design', label: 'Fashion Design', tags: ['fashion', 'design'] },
      { id: 'animation-motion', label: 'Animation / Motion Graphics', tags: ['animation', 'motion'] },
      { id: 'illustration', label: 'Illustration', tags: ['illustration', 'art'] },
      { id: 'creative-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'manufacturing-industrial',
    label: 'Manufacturing & Industrial',
    tags: ['manufacturing', 'industrial', 'b2b', 'production'],
    relatedGroupIds: ['finance-business-services'],
    options: [
      { id: 'textile-manufacturing', label: 'Textile Manufacturing', tags: ['textile', 'manufacturing'] },
      { id: 'electronics-manufacturing', label: 'Electronics Manufacturing', tags: ['electronics', 'manufacturing'] },
      { id: 'fmcg-manufacturing', label: 'FMCG Manufacturing', tags: ['fmcg', 'manufacturing'] },
      { id: 'machinery', label: 'Machinery', tags: ['machinery', 'industrial'] },
      { id: 'b2b-industrial-products', label: 'B2B Industrial Products', tags: ['b2b', 'industrial'] },
      { id: 'manufacturing-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'government-nonprofit',
    label: 'Government & Non-Profit',
    tags: ['government', 'nonprofit', 'social-impact'],
    relatedGroupIds: ['education-coaching', 'health-wellness'],
    options: [
      { id: 'ngos', label: 'NGOs', tags: ['ngo', 'nonprofit'] },
      { id: 'government-organizations', label: 'Government Organizations', tags: ['government', 'public'] },
      { id: 'social-initiatives', label: 'Social Initiatives', tags: ['social', 'impact'] },
      { id: 'charity-foundations', label: 'Charity Foundations', tags: ['charity', 'foundation'] },
      { id: 'government-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'local-small-businesses',
    label: 'Local & Small Businesses',
    tags: ['local', 'small-business', 'service', 'shop'],
    relatedGroupIds: ['retail-ecommerce', 'food-beverage', 'personal-brand'],
    options: [
      { id: 'general-store', label: 'General Store', tags: ['store', 'local'] },
      { id: 'boutique-shops', label: 'Boutique Shops', tags: ['boutique', 'retail'] },
      { id: 'repair-services', label: 'Repair Services', tags: ['repair', 'service'] },
      { id: 'freelancers-local', label: 'Freelancers', tags: ['freelance', 'service'] },
      { id: 'home-based-business', label: 'Home-based Business', tags: ['home-based', 'small-business'] },
      { id: 'local-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'gaming-web3',
    label: 'Gaming & Web3',
    tags: ['gaming', 'web3', 'digital', 'community'],
    relatedGroupIds: ['technology-saas', 'media-entertainment'],
    options: [
      { id: 'game-development', label: 'Game Development', tags: ['gaming', 'development'] },
      { id: 'esports', label: 'eSports', tags: ['gaming', 'esports'] },
      { id: 'streaming', label: 'Streaming', tags: ['streaming', 'creator'] },
      { id: 'blockchain-web3', label: 'Blockchain / Web3', tags: ['blockchain', 'web3'] },
      { id: 'nft-projects', label: 'NFT Projects', tags: ['nft', 'web3'] },
      { id: 'gaming-other', label: 'Other', isOther: true },
    ],
  },
  {
    id: 'personal-brand',
    label: 'Personal Brand',
    tags: ['personal-brand', 'creator', 'expert', 'individual'],
    relatedGroupIds: ['media-entertainment', 'marketing-advertising', 'education-coaching'],
    options: [
      { id: 'entrepreneur', label: 'Entrepreneur', tags: ['founder', 'business'] },
      { id: 'coach', label: 'Coach', tags: ['coach', 'expert'] },
      { id: 'influencer-personal', label: 'Influencer', tags: ['influencer', 'creator'] },
      { id: 'public-figure', label: 'Public Figure', tags: ['public-figure', 'personal-brand'] },
      { id: 'freelancer-personal', label: 'Freelancer', tags: ['freelancer', 'service'] },
      { id: 'personal-brand-other', label: 'Other', isOther: true },
    ],
  },
];

export const INDUSTRY_GROUPS = INDUSTRY_GROUP_DEFINITIONS.map((group) => ({
  ...group,
  options: group.options.map((option) => ({
    id: option.id,
    label: option.label,
    categoryId: group.id,
    categoryLabel: group.label,
    tags: Array.from(new Set([...(option.tags ?? []), ...group.tags])),
    isOther: option.isOther ?? false,
  })),
}));

export const INDUSTRY_OPTIONS: IndustryCatalogEntry[] = INDUSTRY_GROUPS.flatMap(
  (group) => group.options
);

const normalizeValue = (value: string) => value.trim().toLowerCase();
export const MAX_SECONDARY_INDUSTRIES = 3;

const isSearchMatch = (entry: IndustryCatalogEntry, searchTerm: string) => {
  if (!searchTerm.trim()) {
    return true;
  }

  const normalizedSearch = normalizeValue(searchTerm);
  return [
    entry.label,
    entry.categoryLabel,
    ...entry.tags,
  ].some((value) => normalizeValue(value).includes(normalizedSearch));
};

const byLabel = (left: IndustryCatalogEntry, right: IndustryCatalogEntry) =>
  left.label.localeCompare(right.label);

export const getIndustryOptionByLabel = (label: string) =>
  INDUSTRY_OPTIONS.find(
    (entry) => normalizeValue(entry.label) === normalizeValue(label)
  ) ?? null;

export const getIndustryGroupByLabel = (label: string) =>
  INDUSTRY_GROUPS.find(
    (group) => normalizeValue(group.label) === normalizeValue(label)
  ) ?? null;

export const getIndustryGroupForValue = (value: string) => {
  const directGroup = getIndustryGroupByLabel(value);

  if (directGroup) {
    return directGroup;
  }

  const option = getIndustryOptionByLabel(value);

  if (!option) {
    return null;
  }

  return INDUSTRY_GROUPS.find((group) => group.id === option.categoryId) ?? null;
};

export const isKnownIndustryLabel = (label: string) =>
  Boolean(getIndustryOptionByLabel(label));

export const isKnownPrimaryIndustryValue = (label: string) =>
  Boolean(getIndustryGroupForValue(label));

export const resolvePrimaryIndustryValue = (label: string) =>
  getIndustryGroupForValue(label)?.label ?? label.trim();

const isGroupSearchMatch = (
  group: (typeof INDUSTRY_GROUPS)[number],
  searchTerm: string
) => {
  if (!searchTerm.trim()) {
    return true;
  }

  const normalizedSearch = normalizeValue(searchTerm);

  return [
    group.label,
    ...group.tags,
    ...group.options.map((option) => option.label),
    ...group.options.flatMap((option) => option.tags),
  ].some((value) => normalizeValue(value).includes(normalizedSearch));
};

export const getPrimaryIndustryCards = (searchTerm: string) =>
  INDUSTRY_GROUPS.filter((group) => isGroupSearchMatch(group, searchTerm));

export const getPrimaryIndustryGroups = (searchTerm: string) =>
  INDUSTRY_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((entry) => isSearchMatch(entry, searchTerm)),
  })).filter((group) => group.options.length > 0);

export const normalizeSecondaryIndustries = (
  primaryIndustry: string,
  secondaryIndustries: string[]
) => {
  const normalizedPrimary = normalizeValue(primaryIndustry);
  const seen = new Set<string>();

  return secondaryIndustries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => normalizeValue(entry) !== normalizedPrimary)
    .filter((entry) => {
      const normalizedEntry = normalizeValue(entry);

      if (seen.has(normalizedEntry)) {
        return false;
      }

      seen.add(normalizedEntry);
      return true;
    })
    .slice(0, MAX_SECONDARY_INDUSTRIES);
};

export const createIndustrySummary = (
  primaryIndustry: string,
  secondaryIndustries: string[]
) => {
  const normalizedPrimary = primaryIndustry.trim();
  const normalizedSecondary = normalizeSecondaryIndustries(
    primaryIndustry,
    secondaryIndustries
  );

  if (!normalizedPrimary && normalizedSecondary.length === 0) {
    return '';
  }

  if (!normalizedSecondary.length) {
    return normalizedPrimary;
  }

  return `${normalizedPrimary} | ${normalizedSecondary.join(', ')}`;
};

export const getSecondaryIndustryGroups = (
  primaryIndustry: string,
  searchTerm: string
) => {
  const primaryGroup = getIndustryGroupForValue(primaryIndustry);

  if (!primaryGroup) {
    return INDUSTRY_GROUPS.map((group) => ({
      ...group,
      options: group.options.filter(
        (entry) => !entry.isOther && isSearchMatch(entry, searchTerm)
      ),
    })).filter((group) => group.options.length > 0);
  }

  const scoredEntries = INDUSTRY_OPTIONS.map((entry) => {
    if (entry.isOther) {
      return null;
    }

    let score = 0;

    if (entry.categoryId === primaryGroup.id) {
      score += 6;
    }

    if (primaryGroup?.relatedGroupIds?.includes(entry.categoryId)) {
      score += 2;
    }

    const sharedTagCount = entry.tags.filter((tag) =>
      primaryGroup.tags.includes(tag)
    ).length;
    score += sharedTagCount * 2;

    if (score <= 0 || !isSearchMatch(entry, searchTerm)) {
      return null;
    }

    return {
      ...entry,
      score,
    };
  }).filter(
    (
      entry
    ): entry is IndustryCatalogEntry & {
      score: number;
    } => Boolean(entry)
  );

  const entriesByGroup = INDUSTRY_GROUPS.map((group) => ({
    ...group,
    options: scoredEntries
      .filter((entry) => entry.categoryId === group.id)
      .sort((left, right) => right.score - left.score || byLabel(left, right)),
  })).filter((group) => group.options.length > 0);

  const totalEntries = entriesByGroup.reduce(
    (count, group) => count + group.options.length,
    0
  );

  if (totalEntries <= 18) {
    return entriesByGroup;
  }

  let remaining = 18;
  return entriesByGroup
    .map((group) => {
      const limitedOptions = group.options.slice(0, Math.max(1, remaining));
      remaining -= limitedOptions.length;
      return {
        ...group,
        options: limitedOptions,
      };
    })
    .filter((group) => group.options.length > 0);
};

const INDUSTRY_TAG_GUIDANCE: Record<string, string> = {
  retail: 'clear product value',
  consumer: 'buyer trust',
  ecommerce: 'conversion-ready offers',
  brand: 'recognizable brand cues',
  food: 'appetite-led visuals',
  beverage: 'taste-first storytelling',
  hospitality: 'experience-led moments',
  health: 'credible transformation stories',
  wellness: 'trust and routines',
  fitness: 'proof-driven results',
  beauty: 'before-and-after proof',
  'personal-care': 'repeatable routines',
  service: 'trust-building clarity',
  education: 'bite-size teaching',
  coaching: 'expert-led authority',
  technology: 'product clarity',
  software: 'problem-solution messaging',
  saas: 'use-case demos',
  digital: 'explain-it-simply content',
  finance: 'confidence and clarity',
  business: 'outcome-focused proof',
  property: 'high-trust visuals',
  'real-estate': 'location-led storytelling',
  construction: 'project proof',
  automotive: 'showroom-worthy visuals',
  travel: 'aspirational moments',
  tourism: 'destination-led storytelling',
  media: 'personality-led content',
  content: 'repeatable content pillars',
  creator: 'human-first storytelling',
  marketing: 'results-led case studies',
  advertising: 'performance proof',
  creative: 'visual polish',
  design: 'before-and-after moments',
  manufacturing: 'capability proof',
  industrial: 'process credibility',
  government: 'trust-led clarity',
  nonprofit: 'mission-led stories',
  local: 'community trust',
  'small-business': 'local proof',
  gaming: 'community energy',
  web3: 'credibility and community',
  'personal-brand': 'founder presence',
  expert: 'clear expertise signals',
};

export const getIndustryGuidance = (primaryIndustry: string) => {
  const industryGroup = getIndustryGroupForValue(primaryIndustry);

  if (!industryGroup) {
    return primaryIndustry.trim() ? 'Tailored to your custom industry.' : null;
  }

  return `Built for ${industryGroup.label.toLowerCase()} brands.`;
};

export const getIndustryCatalogPromptItems = () =>
  INDUSTRY_OPTIONS.filter((entry) => !entry.isOther).map((entry) => ({
    label: entry.label,
    category: entry.categoryLabel,
    tags: entry.tags,
  }));
