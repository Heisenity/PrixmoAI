"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseImageRateLimitReservation = exports.checkImageRateLimit = exports.resolveImageRuntimePolicy = void 0;
const crypto_1 = require("crypto");
const constants_1 = require("../config/constants");
const redis_1 = require("../lib/redis");
const ONE_MINUTE_MS = 60000;
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local minuteWindow = tonumber(ARGV[2])
local maxWindow = tonumber(ARGV[3])
local requestsPerMinute = tonumber(ARGV[4])
local burstWindow = tonumber(ARGV[5])
local burstLimit = tonumber(ARGV[6])
local throttleAfterBurst = tonumber(ARGV[7])
local reservationId = ARGV[8]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - maxWindow)

local minuteStart = now - minuteWindow + 1
local minuteCount = redis.call('ZCOUNT', key, minuteStart, '+inf')

if requestsPerMinute >= 0 and minuteCount >= requestsPerMinute then
  local oldest = redis.call('ZRANGEBYSCORE', key, minuteStart, '+inf', 'WITHSCORES', 'LIMIT', 0, 1)
  local retryAfter = 1

  if oldest[2] ~= nil then
    retryAfter = math.max(1, math.ceil(((tonumber(oldest[2]) + minuteWindow) - now) / 1000))
  end

  local burstCount = -1

  if burstWindow >= 0 then
    burstCount = redis.call('ZCOUNT', key, now - burstWindow + 1, '+inf')
  end

  return {0, 0, 0, burstCount, retryAfter}
end

redis.call('ZADD', key, now, reservationId)
redis.call('PEXPIRE', key, maxWindow)

local burstCount = -1
local throttleDelay = 0

if burstWindow >= 0 then
  burstCount = redis.call('ZCOUNT', key, now - burstWindow + 1, '+inf')
end

if burstLimit >= 0 and burstCount > burstLimit then
  throttleDelay = throttleAfterBurst
end

local remaining = -1

if requestsPerMinute >= 0 then
  remaining = math.max(0, requestsPerMinute - minuteCount - 1)
end

return {1, remaining, throttleDelay, burstCount, 0}
`;
const RELEASE_RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local reservationId = ARGV[1]

redis.call('ZREM', key, reservationId)

if redis.call('ZCARD', key) == 0 then
  redis.call('DEL', key)
end

return 1
`;
const getRateLimitKey = (userId) => (0, redis_1.buildRedisKey)('rate-limit', 'image', userId);
const resolveImageRuntimePolicy = (plan, usageCount) => {
    const basePolicy = constants_1.IMAGE_RUNTIME_POLICIES[plan];
    if (plan === 'free') {
        return {
            plan,
            queueTier: usageCount < constants_1.FREE_IMAGE_NORMAL_QUEUE_DAILY_THRESHOLD
                ? 'normal'
                : 'slow',
            speedTier: usageCount < constants_1.FREE_IMAGE_STANDARD_SPEED_DAILY_THRESHOLD
                ? 'standard'
                : 'slow',
            throttleDelayMs: 0,
            throttleDelayMsAfterBurst: basePolicy.throttleDelayMsAfterBurst,
            requestsPerMinute: basePolicy.requestsPerMinute,
            burstLimit: basePolicy.burstLimit,
            burstWindowMs: basePolicy.burstWindowMs,
            burstRequestCount: null,
            usageCount,
        };
    }
    return {
        plan,
        queueTier: basePolicy.defaultQueueTier,
        speedTier: basePolicy.defaultSpeedTier,
        throttleDelayMs: 0,
        throttleDelayMsAfterBurst: basePolicy.throttleDelayMsAfterBurst,
        requestsPerMinute: basePolicy.requestsPerMinute,
        burstLimit: basePolicy.burstLimit,
        burstWindowMs: basePolicy.burstWindowMs,
        burstRequestCount: null,
        usageCount,
    };
};
exports.resolveImageRuntimePolicy = resolveImageRuntimePolicy;
const checkImageRateLimit = async (userId, policy) => {
    const now = Date.now();
    const reservationId = `${now}:${(0, crypto_1.randomUUID)()}`;
    const requestsPerMinute = policy.requestsPerMinute ?? -1;
    const burstLimit = policy.burstLimit ?? -1;
    const burstWindowMs = policy.burstWindowMs ?? -1;
    const maxWindowMs = Math.max(ONE_MINUTE_MS, burstWindowMs > 0 ? burstWindowMs : 0);
    const rawResult = (await (0, redis_1.getRedisClient)().eval(RATE_LIMIT_SCRIPT, 1, getRateLimitKey(userId), String(now), String(ONE_MINUTE_MS), String(maxWindowMs), String(requestsPerMinute), String(burstWindowMs), String(burstLimit), String(policy.throttleDelayMsAfterBurst), reservationId));
    const allowed = Number(rawResult[0]) === 1;
    const remaining = Number(rawResult[1]);
    const throttleDelayMs = Number(rawResult[2]);
    const burstRequestCount = Number(rawResult[3]);
    const retryAfterSeconds = Number(rawResult[4]);
    if (!allowed) {
        return {
            allowed: false,
            retryAfterSeconds,
            remaining: 0,
            throttleDelayMs: 0,
            burstRequestCount: burstRequestCount >= 0 ? burstRequestCount : null,
        };
    }
    return {
        allowed: true,
        remaining: remaining >= 0 ? remaining : null,
        throttleDelayMs,
        burstRequestCount: burstRequestCount >= 0 ? burstRequestCount : null,
        reservationId,
    };
};
exports.checkImageRateLimit = checkImageRateLimit;
const releaseImageRateLimitReservation = async (userId, reservationId) => {
    if (!reservationId) {
        return;
    }
    await (0, redis_1.getRedisClient)().eval(RELEASE_RATE_LIMIT_SCRIPT, 1, getRateLimitKey(userId), reservationId);
};
exports.releaseImageRateLimitReservation = releaseImageRateLimitReservation;
