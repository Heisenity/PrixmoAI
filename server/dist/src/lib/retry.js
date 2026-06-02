"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryWithBackoff = exports.isRetryableError = void 0;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 350;
const DEFAULT_MAX_DELAY_MS = 4000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const wait = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(new Error('Request cancelled.'));
        return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Request cancelled.'));
    }, { once: true });
});
const getErrorMessage = (error) => error instanceof Error ? error.message : String(error);
const isRetryableError = (error) => {
    const candidate = error;
    if (typeof candidate?.statusCode === 'number' &&
        RETRYABLE_STATUS_CODES.has(candidate.statusCode)) {
        return true;
    }
    const message = getErrorMessage(error);
    return /fetch failed|network|timeout|timed out|econnreset|econnrefused|enotfound|socket hang up|temporarily unavailable/i.test(message);
};
exports.isRetryableError = isRetryableError;
const computeDelayMs = (error, attempt, baseDelayMs, maxDelayMs) => {
    const retryAfterMs = error?.retryAfterMs;
    if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)) {
        return Math.min(maxDelayMs, Math.max(0, retryAfterMs));
    }
    const exponentialDelay = baseDelayMs * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.floor(Math.random() * Math.min(250, baseDelayMs));
    return Math.min(maxDelayMs, exponentialDelay + jitter);
};
const retryWithBackoff = async (operation, options = {}) => {
    const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
    const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
    const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
    const shouldRetry = options.shouldRetry ?? exports.isRetryableError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (options.signal?.aborted) {
            throw new Error('Request cancelled.');
        }
        try {
            return await operation();
        }
        catch (error) {
            const isLastAttempt = attempt >= attempts;
            if (isLastAttempt || !shouldRetry(error, attempt)) {
                throw error;
            }
            const nextDelayMs = computeDelayMs(error, attempt, baseDelayMs, maxDelayMs);
            await options.onRetry?.({ error, attempt, nextDelayMs });
            await wait(nextDelayMs, options.signal);
        }
    }
    return await operation();
};
exports.retryWithBackoff = retryWithBackoff;
