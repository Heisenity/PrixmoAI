const USERNAME_MAX_LENGTH = 30;

export const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, USERNAME_MAX_LENGTH);

export const isValidNormalizedUsername = (value: string) =>
  /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/.test(value);

export const getEmailLocalPart = (email?: string | null) =>
  (email ?? '').split('@')[0]?.trim() ?? '';
