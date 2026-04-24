"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBullMqConfig = exports.buildRedisKey = exports.getRedisClient = exports.createRedisConnection = exports.isRedisConfigured = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
const constants_1 = require("../config/constants");
dotenv_1.default.config();
exports.isRedisConfigured = Boolean(constants_1.REDIS_URL);
const extractRedisUrl = (input) => {
    const normalizedInput = input.trim();
    if (!normalizedInput) {
        return '';
    }
    const directMatch = normalizedInput.match(/rediss?:\/\/[^\s'"]+/i);
    return directMatch ? directMatch[0] : normalizedInput;
};
const getNormalizedRedisUrl = () => {
    const normalizedUrl = extractRedisUrl(constants_1.REDIS_URL);
    if (!normalizedUrl) {
        throw new Error('Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before starting the server.');
    }
    return normalizedUrl;
};
const buildRedisOptions = (connectionName, normalizedUrl) => {
    const url = new URL(normalizedUrl);
    const useTls = constants_1.REDIS_TLS || url.hostname.endsWith('upstash.io');
    return {
        connectionName,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
        tls: useTls ? {} : undefined,
    };
};
const createRedisConnection = (connectionName) => {
    if (!exports.isRedisConfigured) {
        throw new Error('Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before starting the server.');
    }
    const normalizedUrl = getNormalizedRedisUrl();
    return new ioredis_1.default(normalizedUrl, buildRedisOptions(connectionName, normalizedUrl));
};
exports.createRedisConnection = createRedisConnection;
const sharedRedisClients = new Map();
const getOrCreateRedisConnection = (cacheKey, connectionName) => {
    const existing = sharedRedisClients.get(cacheKey);
    if (existing) {
        return existing;
    }
    const nextClient = (0, exports.createRedisConnection)(connectionName);
    sharedRedisClients.set(cacheKey, nextClient);
    return nextClient;
};
const inferBullMqConnectionRole = (connectionName) => {
    if (connectionName.includes(':worker:')) {
        return 'worker';
    }
    if (connectionName.includes(':events:')) {
        return 'events';
    }
    return 'producer';
};
const getBullMqConnection = (connectionName, role = inferBullMqConnectionRole(connectionName)) => {
    switch (role) {
        case 'worker':
        case 'events':
            return getOrCreateRedisConnection(connectionName, connectionName);
        case 'producer':
        default:
            return getOrCreateRedisConnection('prixmoai:bullmq:producer', 'prixmoai:bullmq:producer');
    }
};
const getRedisClient = () => {
    return getOrCreateRedisConnection('prixmoai:shared-runtime', 'prixmoai:shared-runtime');
};
exports.getRedisClient = getRedisClient;
const buildRedisKey = (...parts) => [constants_1.REDIS_KEY_PREFIX, ...parts.map((part) => String(part))].join(':');
exports.buildRedisKey = buildRedisKey;
const getBullMqConfig = (connectionName) => ({
    connection: getBullMqConnection(connectionName),
    prefix: constants_1.BULLMQ_PREFIX,
});
exports.getBullMqConfig = getBullMqConfig;
