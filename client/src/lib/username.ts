const USERNAME_MIN_LENGTH = 3;
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

export const isValidUsernameInput = (value: string) =>
  isValidNormalizedUsername(normalizeUsername(value));

export const USERNAME_RULE_HINT = `Use ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} lowercase letters, numbers, dots, or underscores.`;
