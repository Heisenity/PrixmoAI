import IORedis, { type RedisOptions } from 'ioredis';
import dotenv from 'dotenv';
import {
  BULLMQ_PREFIX,
  REDIS_KEY_PREFIX,
  REDIS_TLS,
  REDIS_URL,
} from '../config/constants';

dotenv.config();

export const isRedisConfigured = Boolean(REDIS_URL);

type BullMqConnectionRole = 'producer' | 'worker' | 'events';

const extractRedisUrl = (input: string) => {
  const normalizedInput = input.trim();

  if (!normalizedInput) {
    return '';
  }

  const directMatch = normalizedInput.match(/rediss?:\/\/[^\s'"]+/i);

  return directMatch ? directMatch[0] : normalizedInput;
};

const getNormalizedRedisUrl = () => {
  const normalizedUrl = extractRedisUrl(REDIS_URL);

  if (!normalizedUrl) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before starting the server.'
    );
  }

  return normalizedUrl;
};

const buildRedisOptions = (
  connectionName: string,
  normalizedUrl: string
): RedisOptions => {
  const url = new URL(normalizedUrl);
  const useTls = REDIS_TLS || url.hostname.endsWith('upstash.io');

  return {
    connectionName,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    tls: useTls ? {} : undefined,
  };
};

export const createRedisConnection = (connectionName: string) => {
  if (!isRedisConfigured) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before starting the server.'
    );
  }

  const normalizedUrl = getNormalizedRedisUrl();

  return new IORedis(
    normalizedUrl,
    buildRedisOptions(connectionName, normalizedUrl)
  );
};

const sharedRedisClients = new Map<string, IORedis>();

const getOrCreateRedisConnection = (cacheKey: string, connectionName: string) => {
  const existing = sharedRedisClients.get(cacheKey);

  if (existing) {
    return existing;
  }

  const nextClient = createRedisConnection(connectionName);
  sharedRedisClients.set(cacheKey, nextClient);
  return nextClient;
};

const inferBullMqConnectionRole = (
  connectionName: string
): BullMqConnectionRole => {
  if (connectionName.includes(':worker:')) {
    return 'worker';
  }

  if (connectionName.includes(':events:')) {
    return 'events';
  }

  return 'producer';
};

const getBullMqConnection = (
  connectionName: string,
  role = inferBullMqConnectionRole(connectionName)
) => {
  switch (role) {
    case 'worker':
    case 'events':
      return getOrCreateRedisConnection(connectionName, connectionName);
    case 'producer':
    default:
      return getOrCreateRedisConnection(
        'prixmoai:bullmq:producer',
        'prixmoai:bullmq:producer'
      );
  }
};

export const getRedisClient = () => {
  return getOrCreateRedisConnection(
    'prixmoai:shared-runtime',
    'prixmoai:shared-runtime'
  );
};

export const buildRedisKey = (...parts: Array<string | number>) =>
  [REDIS_KEY_PREFIX, ...parts.map((part) => String(part))].join(':');

export const getBullMqConfig = (connectionName: string) => ({
  connection: getBullMqConnection(connectionName),
  prefix: BULLMQ_PREFIX,
});
