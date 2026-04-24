export const SUPPORTED_DICTATION_LANGUAGE_VALUES = [
  'en',
  'bn',
  'hi',
  'ur',
  'ta',
  'te',
  'ml',
  'kn',
  'pa',
] as const;

export const DICTATION_LANGUAGE_LABELS: Record<
  (typeof SUPPORTED_DICTATION_LANGUAGE_VALUES)[number],
  string
> = {
  en: 'English',
  bn: 'Bengali',
  hi: 'Hindi',
  ur: 'Urdu',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  pa: 'Punjabi',
};
