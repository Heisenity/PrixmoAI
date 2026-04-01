"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkImageRateLimit = exports.resolveImageRuntimePolicy = exports.enqueueImageGeneration = void 0;
const constants_1 = require("../config/constants");
const queueBuckets = {
    priority: [],
    normal: [],
    slow: [],
};
let activeImageJobs = 0;
const wait = (delayMs) => new Promise((resolve) => {
    setTimeout(resolve, delayMs);
});
const getNextJob = () => queueBuckets.priority.shift() ??
    queueBuckets.normal.shift() ??
    queueBuckets.slow.shift() ??
    null;
const pumpQueue = () => {
    while (activeImageJobs < constants_1.IMAGE_QUEUE_CONCURRENCY) {
        const nextJob = getNextJob();
        if (!nextJob) {
            return;
        }
        activeImageJobs += 1;
        void (async () => {
            try {
                if (nextJob.throttleDelayMs > 0) {
                    await wait(nextJob.throttleDelayMs);
                }
                const result = await nextJob.run();
                nextJob.resolve(result);
            }
            catch (error) {
                nextJob.reject(error);
            }
            finally {
                activeImageJobs = Math.max(0, activeImageJobs - 1);
                pumpQueue();
            }
        })();
    }
};
const enqueueImageGeneration = (policy, run) => new Promise((resolve, reject) => {
    queueBuckets[policy.queueTier].push({
        queueTier: policy.queueTier,
        throttleDelayMs: policy.throttleDelayMs,
        run,
        resolve,
        reject,
    });
    pumpQueue();
});
exports.enqueueImageGeneration = enqueueImageGeneration;
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
const requestWindows = new Map();
const ONE_MINUTE_MS = 60000;
const checkImageRateLimit = (userId, policy) => {
    const now = Date.now();
    const windowStart = now - ONE_MINUTE_MS;
    const key = `image:${userId}`;
    const maxWindowMs = Math.max(ONE_MINUTE_MS, policy.burstWindowMs ?? 0);
    const activeRequests = requestWindows.get(key)?.filter((timestamp) => timestamp > now - maxWindowMs) ?? [];
    const activeMinuteRequests = activeRequests.filter((timestamp) => timestamp > windowStart);
    if (policy.requestsPerMinute !== null &&
        activeMinuteRequests.length >= policy.requestsPerMinute) {
        const oldestRequest = activeMinuteRequests[0];
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestRequest + ONE_MINUTE_MS - now) / 1000));
        requestWindows.set(key, activeRequests);
        return {
            allowed: false,
            retryAfterSeconds,
            remaining: 0,
            throttleDelayMs: 0,
            burstRequestCount: policy.burstLimit === null ? null : activeRequests.length,
        };
    }
    activeRequests.push(now);
    requestWindows.set(key, activeRequests);
    const burstRequestCount = policy.burstWindowMs === null
        ? null
        : activeRequests.filter((timestamp) => timestamp > now - policy.burstWindowMs).length;
    const throttleDelayMs = policy.burstLimit !== null &&
        burstRequestCount !== null &&
        burstRequestCount > policy.burstLimit
        ? policy.throttleDelayMsAfterBurst
        : 0;
    if (policy.requestsPerMinute === null) {
        return {
            allowed: true,
            remaining: null,
            throttleDelayMs,
            burstRequestCount,
        };
    }
    return {
        allowed: true,
        remaining: Math.max(0, policy.requestsPerMinute - activeMinuteRequests.length - 1),
        throttleDelayMs,
        burstRequestCount,
    };
};
exports.checkImageRateLimit = checkImageRateLimit;
