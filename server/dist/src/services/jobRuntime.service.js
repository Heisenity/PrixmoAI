"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForQueueJobResult = exports.createLocalJobCancellationSignal = exports.clearJobCancellation = exports.requestJobCancellation = exports.getJobRuntimeSnapshot = exports.setJobCancelled = exports.setJobCompleted = exports.setJobFailed = exports.setJobProcessing = exports.updateJobRuntime = exports.setJobQueued = void 0;
const constants_1 = require("../config/constants");
const requestCancellation_1 = require("../lib/requestCancellation");
const redis_1 = require("../lib/redis");
const getJobStateKey = (jobId) => (0, redis_1.buildRedisKey)('job', 'state', jobId);
const getJobCancelKey = (jobId) => (0, redis_1.buildRedisKey)('job', 'cancelled', jobId);
const ACTIVE_JOB_RUNTIME_TTL_MS = Math.min(constants_1.JOB_RUNTIME_TTL_MS, 30 * 60000);
const FAILED_JOB_RUNTIME_TTL_MS = Math.min(constants_1.JOB_RUNTIME_TTL_MS, 2 * 60 * 60000);
const localJobAbortControllers = new Map();
const withJobStateTtl = async (jobId, ttlMs = ACTIVE_JOB_RUNTIME_TTL_MS) => {
    await (0, redis_1.getRedisClient)().pexpire(getJobStateKey(jobId), ttlMs);
};
const dropJobRuntimeState = async (jobId) => {
    await (0, redis_1.getRedisClient)().del(getJobStateKey(jobId), getJobCancelKey(jobId));
};
const setJobQueued = async (jobId, queue, message, userId) => {
    const now = new Date().toISOString();
    await (0, redis_1.getRedisClient)().hset(getJobStateKey(jobId), {
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
exports.setJobQueued = setJobQueued;
const updateJobRuntime = async (jobId, updates) => {
    const payload = {
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
    await (0, redis_1.getRedisClient)().hset(getJobStateKey(jobId), payload);
    await withJobStateTtl(jobId);
};
exports.updateJobRuntime = updateJobRuntime;
const setJobProcessing = async (jobId, retryCount, message) => (0, exports.updateJobRuntime)(jobId, {
    status: 'processing',
    retryCount,
    ...(message ? { message } : {}),
});
exports.setJobProcessing = setJobProcessing;
const setJobFailed = async (jobId, message) => (async () => {
    await (0, exports.updateJobRuntime)(jobId, {
        status: 'failed',
        ...(message ? { message } : {}),
    });
    await withJobStateTtl(jobId, FAILED_JOB_RUNTIME_TTL_MS);
})();
exports.setJobFailed = setJobFailed;
const setJobCompleted = async (_jobId, _message) => {
    await dropJobRuntimeState(_jobId);
};
exports.setJobCompleted = setJobCompleted;
const setJobCancelled = async (_jobId, _message) => {
    await dropJobRuntimeState(_jobId);
};
exports.setJobCancelled = setJobCancelled;
const getJobRuntimeSnapshot = async (jobId) => {
    const snapshot = await (0, redis_1.getRedisClient)().hgetall(getJobStateKey(jobId));
    if (!snapshot || !Object.keys(snapshot).length) {
        return null;
    }
    return {
        jobId: snapshot.jobId || jobId,
        userId: snapshot.userId || null,
        queue: snapshot.queue || 'unknown',
        status: snapshot.status || 'queued',
        progress: Number(snapshot.progress || 0),
        currentProvider: snapshot.currentProvider || null,
        message: snapshot.message || null,
        retryCount: Number(snapshot.retryCount || 0),
        createdAt: snapshot.createdAt || new Date().toISOString(),
        updatedAt: snapshot.updatedAt || new Date().toISOString(),
    };
};
exports.getJobRuntimeSnapshot = getJobRuntimeSnapshot;
const requestJobCancellation = async (jobId) => {
    await (0, redis_1.getRedisClient)().set(getJobCancelKey(jobId), '1', 'PX', constants_1.JOB_CANCELLATION_TTL_MS);
    localJobAbortControllers.get(jobId)?.abort();
};
exports.requestJobCancellation = requestJobCancellation;
const clearJobCancellation = async (jobId) => {
    await (0, redis_1.getRedisClient)().del(getJobCancelKey(jobId));
};
exports.clearJobCancellation = clearJobCancellation;
const createLocalJobCancellationSignal = (jobId) => {
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
exports.createLocalJobCancellationSignal = createLocalJobCancellationSignal;
const waitForQueueJobResult = async (job, queueEvents, signal) => {
    const completionPromise = job.waitUntilFinished(queueEvents);
    if (!signal) {
        return completionPromise;
    }
    (0, requestCancellation_1.throwIfRequestCancelled)(signal);
    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            signal.removeEventListener('abort', handleAbort);
        };
        const settleResolve = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(value);
        };
        const settleReject = (error) => {
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
                    await (0, exports.requestJobCancellation)(job.id);
                    const state = await job.getState();
                    if (state === 'waiting' ||
                        state === 'delayed' ||
                        state === 'prioritized') {
                        await job.remove();
                    }
                }
                catch {
                    // Best effort only; the worker also observes cancellation through Redis.
                }
                finally {
                    settleReject(new requestCancellation_1.RequestCancelledError('Generation cancelled by user before completion.'));
                }
            })();
        };
        signal.addEventListener('abort', handleAbort, {
            once: true,
        });
        completionPromise.then(settleResolve).catch(settleReject);
    });
};
exports.waitForQueueJobResult = waitForQueueJobResult;
