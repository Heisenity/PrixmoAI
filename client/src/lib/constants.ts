import type { HomeMetric, PlanType } from '../types';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const APP_NAME = 'PrixmoAI';

export const PRIMARY_NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'How it Works', href: '#how-it-works' },
] as const;

export const APP_NAV_ITEMS = [
  { label: 'Dashboard', href: '/app/dashboard' },
  { label: 'Generate', href: '/app/generate' },
  { label: 'Analytics', href: '/app/analytics' },
  { label: 'Scheduler', href: '/app/scheduler' },
  { label: 'Billing', href: '/app/billing' },
  { label: 'Settings', href: '/app/settings' },
] as const;

export const CONTENT_PLATFORM_OPTIONS = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'Pinterest',
  'X',
] as const;

export const CONTENT_TONE_OPTIONS = [
  'Refined and modern',
  'Trendy and persuasive',
  'Playful and warm',
  'Luxury and editorial',
  'Bold and minimal',
] as const;

export const CONTENT_GOAL_OPTIONS = [
  'Drive product discovery and clicks',
  'Boost engagement',
  'Increase saves and shares',
  'Promote a launch',
  'Build brand recall',
] as const;

export const BRAND_VOICE_OPTIONS = [
  'Professional',
  'Authoritative',
  'Corporate',
  'Formal',
  'Informative',
  'Educational',
  'Analytical',
  'Technical',
  'Friendly',
  'Conversational',
  'Approachable',
  'Warm',
  'Empathetic',
  'Supportive',
  'Reassuring',
  'Community-driven',
  'Inspirational',
  'Motivational',
  'Empowering',
  'Passionate',
  'Storytelling',
  'Persuasive',
  'Emotional',
  'Heartfelt',
  'Playful',
  'Humorous',
  'Witty',
  'Quirky',
  'Fun-loving',
  'Entertaining',
  'Luxury',
  'Sophisticated',
  'Elegant',
  'Exclusive',
  'Bold',
  'Confident',
  'Aggressive',
  'Edgy',
  'Minimalist',
  'Innovative / Futuristic',
] as const;

export const IMAGE_BACKGROUND_OPTIONS = [
  'Clean studio background',
  'Soft luxury shadow set',
  'Editorial marble surface',
  'Muted gradient backdrop',
  'Minimal industrial texture',
] as const;

export const HOME_METRICS: HomeMetric[] = [
  { label: 'Weekly creative throughput', value: 67, suffix: '%' },
  { label: 'Hours reclaimed per month', value: 30, suffix: 'h' },
  { label: 'AI-supported brand systems', value: 120, suffix: '+' },
];

export const PLAN_ACCENTS: Record<PlanType, string> = {
  free: 'var(--tone-silver)',
  basic: 'var(--tone-ice)',
  pro: 'var(--tone-aurora)',
};

export const PLAN_FEATURES: Record<PlanType, string[]> = {
  free: [
    '15 AI captions for engagement / day',
    '5 product image generations / day',
    'Watermarked images',
    'Trending Hashtag generator',
    '4 Reel script generator / day',
    'Schedule 1 account',
    'Analytics not included',
  ],
  basic: [
    '25 AI captions for engagement / day',
    '15 product image generations / day',
    'No watermark',
    'Trending Hashtag generator',
    '15 Reel script generator / day',
    'Schedule 2 social account',
    'Basic analytics',
  ],
  pro: [
    '60 AI captions for engagement / day',
    '35 high-speed image generations / day',
    'Trending Hashtag generator',
    '30 Reel scripts / day',
    'Schedule 5 social accounts',
    'Advanced analytics dashboard',
    'Caption keyword optimizer',
    'Priority support',
  ],
};

export const PLAN_DASHBOARD_DETAILS: Record<
  PlanType,
  {
    contentLimit: number | null;
    contentLimitLabel?: string;
    contentMeterLabel: string;
    imageLimit: number | null;
    imageLimitLabel?: string;
    imageMeterLabel: string;
    usageWindowLabel: string;
    planAllowanceSummary: string;
    highlights: string[];
  }
> = {
  free: {
    contentLimit: 15,
    contentMeterLabel: 'Content generations today',
    imageLimit: 5,
    imageMeterLabel: 'Image generations today',
    usageWindowLabel: 'today',
    planAllowanceSummary: '15 content / day • 5 images / day',
    highlights: [
      '15 AI captions for engagement / day',
      '5 product image generations / day',
      'Schedule 1 account',
    ],
  },
  basic: {
    contentLimit: 25,
    contentMeterLabel: 'Content generations today',
    imageLimit: 15,
    imageMeterLabel: 'Image generations today',
    usageWindowLabel: 'today',
    planAllowanceSummary: '25 content / day • 15 images / day',
    highlights: [
      '25 AI captions for engagement / day',
      '15 product image generations / day',
      'Schedule 2 social accounts',
    ],
  },
  pro: {
    contentLimit: 60,
    contentMeterLabel: 'Content generations today',
    imageLimit: 35,
    imageMeterLabel: 'Image generations today',
    usageWindowLabel: 'today',
    planAllowanceSummary: '60 content / day • 35 images / day',
    highlights: [
      '60 AI captions for engagement / day',
      '35 high-speed image generations / day',
      'Schedule 5 social accounts',
    ],
  },
};
