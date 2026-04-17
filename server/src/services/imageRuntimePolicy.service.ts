import {
  FREE_IMAGE_NORMAL_QUEUE_DAILY_THRESHOLD,
  FREE_IMAGE_STANDARD_SPEED_DAILY_THRESHOLD,
  IMAGE_QUEUE_CONCURRENCY,
  IMAGE_RUNTIME_POLICIES,
  type ImageQueueTier,
  type ImageSpeedTier,
} from '../config/constants';
import type { PlanType } from '../types';
import {
  RequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';

export type ImageRuntimePolicy = {
  plan: PlanType;
  queueTier: ImageQueueTier;
  speedTier: ImageSpeedTier;
  throttleDelayMs: number;
  throttleDelayMsAfterBurst: number;
  requestsPerMinute: number | null;
  burstLimit: number | null;
  burstWindowMs: number | null;
  burstRequestCount: number | null;
  usageCount: number;
};

type QueueJob<T> = {
  queueTier: ImageQueueTier;
  throttleDelayMs: number;
  signal?: AbortSignal;
  started: boolean;
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const queueBuckets: Record<ImageQueueTier, QueueJob<any>[]> = {
  priority: [],
  normal: [],
  slow: [],
};

let activeImageJobs = 0;

const wait = (delayMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestCancelledError('Image generation cancelled by user.'));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      clearTimeout(timeout);
      reject(new RequestCancelledError('Image generation cancelled by user.'));
    };

    signal?.addEventListener('abort', handleAbort, {
      once: true,
    });
  });

const getNextJob = () =>
  queueBuckets.priority.shift() ??
  queueBuckets.normal.shift() ??
  queueBuckets.slow.shift() ??
  null;

const pumpQueue = () => {
  while (activeImageJobs < IMAGE_QUEUE_CONCURRENCY) {
    const nextJob = getNextJob();

    if (!nextJob) {
      return;
    }

    activeImageJobs += 1;

    void (async () => {
      try {
        if (nextJob.signal?.aborted) {
          throw new RequestCancelledError('Image generation cancelled by user.');
        }

        nextJob.started = true;

        if (nextJob.throttleDelayMs > 0) {
          await wait(nextJob.throttleDelayMs, nextJob.signal);
        }

        throwIfRequestCancelled(
          nextJob.signal,
          'Image generation cancelled by user.'
        );
        const result = await nextJob.run();
        nextJob.resolve(result);
      } catch (error) {
        nextJob.reject(error);
      } finally {
        activeImageJobs = Math.max(0, activeImageJobs - 1);
        pumpQueue();
      }
    })();
  }
};

export const enqueueImageGeneration = <T>(
  policy: Pick<ImageRuntimePolicy, 'queueTier' | 'throttleDelayMs'>,
  run: () => Promise<T>,
  signal?: AbortSignal
) =>
  new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestCancelledError('Image generation cancelled by user.'));
      return;
    }

    let settled = false;
    let job: QueueJob<T>;

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
    };

    const settleResolve = (value: T | PromiseLike<T>) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (reason?: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(reason);
    };

    const removeQueuedJob = () => {
      const bucket = queueBuckets[policy.queueTier];
      const jobIndex = bucket.indexOf(job as QueueJob<any>);

      if (jobIndex !== -1) {
        bucket.splice(jobIndex, 1);
      }
    };

    const handleAbort = () => {
      if (job.started) {
        return;
      }

      removeQueuedJob();
      settleReject(new RequestCancelledError('Image generation cancelled by user.'));
    };

    job = {
      queueTier: policy.queueTier,
      throttleDelayMs: policy.throttleDelayMs,
      signal,
      started: false,
      run,
      resolve: settleResolve,
      reject: settleReject,
    };

    signal?.addEventListener('abort', handleAbort, {
      once: true,
    });
    queueBuckets[policy.queueTier].push(job);

    pumpQueue();
  });

export const resolveImageRuntimePolicy = (
  plan: PlanType,
  usageCount: number
): ImageRuntimePolicy => {
  const basePolicy = IMAGE_RUNTIME_POLICIES[plan];

  if (plan === 'free') {
    return {
      plan,
      queueTier:
        usageCount < FREE_IMAGE_NORMAL_QUEUE_DAILY_THRESHOLD
          ? 'normal'
          : 'slow',
      speedTier:
        usageCount < FREE_IMAGE_STANDARD_SPEED_DAILY_THRESHOLD
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

type RateLimitWindowResult =
  | {
      allowed: true;
      remaining: number | null;
      throttleDelayMs: number;
      burstRequestCount: number | null;
      reservationTimestamp: number;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
      remaining: 0;
      throttleDelayMs: number;
      burstRequestCount: number | null;
    };

const requestWindows = new Map<string, number[]>();
const ONE_MINUTE_MS = 60_000;

export const checkImageRateLimit = (
  userId: string,
  policy: Pick<
    ImageRuntimePolicy,
    | 'requestsPerMinute'
    | 'burstLimit'
    | 'burstWindowMs'
    | 'throttleDelayMsAfterBurst'
  >
): RateLimitWindowResult => {
  const now = Date.now();
  const windowStart = now - ONE_MINUTE_MS;
  const key = `image:${userId}`;
  const maxWindowMs = Math.max(ONE_MINUTE_MS, policy.burstWindowMs ?? 0);
  const activeRequests =
    requestWindows.get(key)?.filter((timestamp) => timestamp > now - maxWindowMs) ?? [];
  const activeMinuteRequests = activeRequests.filter(
    (timestamp) => timestamp > windowStart
  );

  if (
    policy.requestsPerMinute !== null &&
    activeMinuteRequests.length >= policy.requestsPerMinute
  ) {
    const oldestRequest = activeMinuteRequests[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestRequest + ONE_MINUTE_MS - now) / 1000)
    );

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

  const burstRequestCount =
    policy.burstWindowMs === null
      ? null
      : activeRequests.filter(
          (timestamp) => timestamp > now - policy.burstWindowMs!
        ).length;
  const throttleDelayMs =
    policy.burstLimit !== null &&
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
      reservationTimestamp: now,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, policy.requestsPerMinute - activeMinuteRequests.length - 1),
    throttleDelayMs,
    burstRequestCount,
    reservationTimestamp: now,
  };
};

export const releaseImageRateLimitReservation = (
  userId: string,
  reservationTimestamp: number | null | undefined
) => {
  if (!reservationTimestamp) {
    return;
  }

  const key = `image:${userId}`;
  const activeRequests = requestWindows.get(key);

  if (!activeRequests?.length) {
    return;
  }

  const reservationIndex = activeRequests.indexOf(reservationTimestamp);

  if (reservationIndex === -1) {
    return;
  }

  activeRequests.splice(reservationIndex, 1);

  if (activeRequests.length) {
    requestWindows.set(key, activeRequests);
    return;
  }

  requestWindows.delete(key);
};
