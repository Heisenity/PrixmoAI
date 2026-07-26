import { createHash, timingSafeEqual } from 'crypto';
import { CRON_SECRET } from '../config/constants';

const hashSecret = (value: string) => createHash('sha256').update(value).digest();

export const isAuthorizedCronHeader = (
  authorizationHeader: string | undefined,
  expectedSecret = CRON_SECRET
) => {
  const [scheme, token] = (authorizationHeader || '').split(/\s+/, 2);
  const normalizedToken = token?.trim();
  const normalizedExpectedSecret = expectedSecret.trim();

  if (scheme !== 'Bearer' || !normalizedToken || !normalizedExpectedSecret) {
    return false;
  }

  return timingSafeEqual(
    hashSecret(normalizedToken),
    hashSecret(normalizedExpectedSecret)
  );
};
