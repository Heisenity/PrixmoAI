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
    '5 caption generations each month',
    '3 product image generations each month',
    'Hashtag generator included',
    'Reel script generator included',
    'Post scheduling not included',
    'Analytics not included',
  ],
  basic: [
    '30 caption generations each month',
    '15 product image generations each month',
    'Hashtag generator included',
    'Reel script generator included',
    'Schedule 1 social account',
    'Basic analytics',
  ],
  pro: [
    'Unlimited caption generations',
    '40 product image generations each month',
    'Hashtag generator included',
    'Reel script generator included',
    'Schedule 3 social accounts',
    'Full analytics dashboard',
    'Priority support',
  ],
};
