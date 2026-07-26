import { createHash, timingSafeEqual } from 'crypto';
import { CRON_SECRET } from '../config/constants';

const hashSecret = (value: string) => createHash('sha256').update(value).digest();

export const isAuthorizedCronHeader = (
  authorizationHeader: string | undefined,
  expectedSecret = CRON_SECRET
) => {
  const [scheme, token] = (authorizationHeader || '').split(/\s+/, 2);

  if (scheme !== 'Bearer' || !token || !expectedSecret) {
    return false;
  }

  return timingSafeEqual(hashSecret(token), hashSecret(expectedSecret));
};
