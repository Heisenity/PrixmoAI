import type { Job, QueueEvents } from 'bullmq';
import {
  JOB_CANCELLATION_TTL_MS,
  JOB_RUNTIME_TTL_MS,
} from '../config/constants';
import {
  RequestCancelledError,
  throwIfRequestCancelled,
} from '../lib/requestCancellation';
import { buildRedisKey, getRedisClient } from '../lib/redis';
import type { QueueName } from '../queues/queueNames';

export type JobLifecycleStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JobRuntimeSnapshot = {
  jobId: string;
  userId?: string | null;
  queue: QueueName | string;
  status: JobLifecycleStatus;
  progress: number;
  currentProvider?: string | null;
  message?: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

const getJobStateKey = (jobId: string) => buildRedisKey('job', 'state', jobId);
const getJobCancelKey = (jobId: string) =>
  buildRedisKey('job', 'cancelled', jobId);

const ACTIVE_JOB_RUNTIME_TTL_MS = Math.min(JOB_RUNTIME_TTL_MS, 30 * 60_000);
const FAILED_JOB_RUNTIME_TTL_MS = Math.min(JOB_RUNTIME_TTL_MS, 2 * 60 * 60_000);
const localJobAbortControllers = new Map<string, AbortController>();

const withJobStateTtl = async (jobId: string, ttlMs = ACTIVE_JOB_RUNTIME_TTL_MS) => {
  await getRedisClient().pexpire(getJobStateKey(jobId), ttlMs);
};

const dropJobRuntimeState = async (jobId: string) => {
  await getRedisClient().del(getJobStateKey(jobId), getJobCancelKey(jobId));
};

export const setJobQueued = async (
  jobId: string,
  queue: QueueName | string,
  message?: string,
  userId?: string
) => {
  const now = new Date().toISOString();
  await getRedisClient().hset(getJobStateKey(jobId), {
    jobId,
    userId: userId ?? '',
    queue,
    status: 'queued',
    progress: '0',
    currentProvider: '',
    message: message ?? '',
    retryCount: '0',
    createdAt: now,
    updatedAt: now,
  });
  await withJobStateTtl(jobId);
};

export const updateJobRuntime = async (
  jobId: string,
  updates: Partial<Omit<JobRuntimeSnapshot, 'jobId' | 'createdAt' | 'queue'>> & {
    queue?: QueueName | string;
  }
) => {
  const payload: Record<string, string> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.queue !== undefined) {
    payload.queue = updates.queue;
  }

  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  if (updates.progress !== undefined) {
    payload.progress = String(updates.progress);
  }

  if (updates.currentProvider !== undefined) {
    payload.currentProvider = updates.currentProvider ?? '';
  }

  if (updates.message !== undefined) {
    payload.message = updates.message ?? '';
  }

  if (updates.retryCount !== undefined) {
    payload.retryCount = String(updates.retryCount);
  }

  await getRedisClient().hset(getJobStateKey(jobId), payload);
  await withJobStateTtl(jobId);
};

export const setJobProcessing = async (
  jobId: string,
  retryCount: number,
  message?: string
) =>
  updateJobRuntime(jobId, {
    status: 'processing',
    retryCount,
    ...(message ? { message } : {}),
  });

export const setJobFailed = async (jobId: string, message?: string) =>
  (async () => {
    await updateJobRuntime(jobId, {
      status: 'failed',
      ...(message ? { message } : {}),
    });
    await withJobStateTtl(jobId, FAILED_JOB_RUNTIME_TTL_MS);
  })();

export const setJobCompleted = async (_jobId: string, _message?: string) => {
  await dropJobRuntimeState(_jobId);
};

export const setJobCancelled = async (_jobId: string, _message?: string) => {
  await dropJobRuntimeState(_jobId);
};

export const getJobRuntimeSnapshot = async (
  jobId: string
): Promise<JobRuntimeSnapshot | null> => {
  const snapshot = await getRedisClient().hgetall(getJobStateKey(jobId));

  if (!snapshot || !Object.keys(snapshot).length) {
    return null;
  }

  return {
    jobId: snapshot.jobId || jobId,
    userId: snapshot.userId || null,
    queue: snapshot.queue || 'unknown',
    status: (snapshot.status as JobLifecycleStatus) || 'queued',
    progress: Number(snapshot.progress || 0),
    currentProvider: snapshot.currentProvider || null,
    message: snapshot.message || null,
    retryCount: Number(snapshot.retryCount || 0),
    createdAt: snapshot.createdAt || new Date().toISOString(),
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
  };
};

export const requestJobCancellation = async (jobId: string) => {
  await getRedisClient().set(
    getJobCancelKey(jobId),
    '1',
    'PX',
    JOB_CANCELLATION_TTL_MS
  );
  localJobAbortControllers.get(jobId)?.abort();
};

export const clearJobCancellation = async (jobId: string) => {
  await getRedisClient().del(getJobCancelKey(jobId));
};

export const createLocalJobCancellationSignal = (jobId: string) => {
  const controller = new AbortController();
  localJobAbortControllers.set(jobId, controller);

  return {
    signal: controller.signal,
    cleanup: () => {
      const current = localJobAbortControllers.get(jobId);

      if (current === controller) {
        localJobAbortControllers.delete(jobId);
      }
    },
  };
};

export const waitForQueueJobResult = async <T>(
  job: Job,
  queueEvents: QueueEvents,
  signal?: AbortSignal
): Promise<T> => {
  const completionPromise = job.waitUntilFinished(queueEvents) as Promise<T>;

  if (!signal) {
    return completionPromise;
  }

  throwIfRequestCancelled(signal);

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener('abort', handleAbort);
    };

    const settleResolve = (value: T) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const handleAbort = () => {
      void (async () => {
        try {
          await requestJobCancellation(job.id!);
          const state = await job.getState();

          if (
            state === 'waiting' ||
            state === 'delayed' ||
            state === 'prioritized'
          ) {
            await job.remove();
          }
        } catch {
          // Best effort only; the worker also observes cancellation through Redis.
        } finally {
          settleReject(
            new RequestCancelledError(
              'Generation cancelled by user before completion.'
            )
          );
        }
      })();
    };

    signal.addEventListener('abort', handleAbort, {
      once: true,
    });

    completionPromise.then(settleResolve).catch(settleReject);
  });
};
