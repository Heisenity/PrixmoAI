export type DictationLanguageOption = {
  value: string;
  label: string;
};

export const DICTATION_LANGUAGE_OPTIONS: DictationLanguageOption[] = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'Bengali' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ur', label: 'Urdu' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'kn', label: 'Kannada' },
  { value: 'pa', label: 'Punjabi' },
];

export const SUPPORTED_DICTATION_LANGUAGE_VALUES = DICTATION_LANGUAGE_OPTIONS.map(
  (option) => option.value
);

export const SUPPORTED_DICTATION_LANGUAGE_HINTS = new Set(
  SUPPORTED_DICTATION_LANGUAGE_VALUES
);
