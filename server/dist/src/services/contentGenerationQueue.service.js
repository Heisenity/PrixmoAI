"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueContentGenerationJob = exports.startContentGenerationWorker = void 0;
const crypto_1 = require("crypto");
const bullmq_1 = require("bullmq");
const gemini_1 = require("../ai/gemini");
const constants_1 = require("../config/constants");
const redis_1 = require("../lib/redis");
const requestCancellation_1 = require("../lib/requestCancellation");
const queueNames_1 = require("../queues/queueNames");
const workerOptions_1 = require("../queues/workerOptions");
const jobRuntime_service_1 = require("./jobRuntime.service");
let contentQueue = null;
let contentWorker = null;
let contentWorkerIdleTimer = null;
const getContentQueue = () => {
    if (!contentQueue) {
        contentQueue = new bullmq_1.Queue(queueNames_1.QUEUE_NAMES.contentGenerate, (0, redis_1.getBullMqConfig)('prixmoai:queue:content'));
    }
    return contentQueue;
};
const createContentQueueEvents = () => new bullmq_1.QueueEvents(queueNames_1.QUEUE_NAMES.contentGenerate, (0, redis_1.getBullMqConfig)('prixmoai:events:content'));
const clearContentWorkerIdleTimer = () => {
    if (!contentWorkerIdleTimer) {
        return;
    }
    clearTimeout(contentWorkerIdleTimer);
    contentWorkerIdleTimer = null;
};
const scheduleContentWorkerIdleShutdown = () => {
    if (constants_1.GENERATION_WORKER_IDLE_SHUTDOWN_MS <= 0 || !contentWorker) {
        return;
    }
    clearContentWorkerIdleTimer();
    const workerToClose = contentWorker;
    contentWorkerIdleTimer = setTimeout(() => {
        if (contentWorker !== workerToClose) {
            return;
        }
        contentWorker = null;
        void workerToClose.close().catch((error) => {
            console.error(`[content-generation] ${error instanceof Error
                ? error.message
                : 'Failed to close idle content worker.'}`);
        });
    }, constants_1.GENERATION_WORKER_IDLE_SHUTDOWN_MS);
    contentWorkerIdleTimer.unref?.();
};
const getContentJobOptions = () => ({
    attempts: constants_1.CONTENT_GENERATION_JOB_ATTEMPTS,
    backoff: {
        type: 'exponential',
        delay: constants_1.CONTENT_GENERATION_JOB_BACKOFF_MS,
    },
    removeOnComplete: true,
    removeOnFail: {
        age: 60 * 60,
        count: 100,
    },
});
const startContentGenerationWorker = () => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    if (contentWorker) {
        clearContentWorkerIdleTimer();
        return;
    }
    contentWorker = new bullmq_1.Worker(queueNames_1.QUEUE_NAMES.contentGenerate, async (job) => {
        const { signal, cleanup } = (0, jobRuntime_service_1.createLocalJobCancellationSignal)(job.id);
        try {
            await (0, jobRuntime_service_1.setJobProcessing)(job.id, job.attemptsMade, 'Generating content pack.');
            await job.updateProgress(10);
            await (0, jobRuntime_service_1.updateJobRuntime)(job.id, {
                progress: 10,
                message: 'Preparing content generation.',
            });
            const result = await (0, gemini_1.generateContentPackWithFallback)(job.data.brandProfile, job.data.input, {
                includeReelScript: job.data.includeReelScript,
                signal,
                onProviderChange: async (provider) => {
                    await (0, jobRuntime_service_1.updateJobRuntime)(job.id, {
                        currentProvider: provider,
                        progress: 45,
                        message: `Generating with ${provider}.`,
                    });
                    await job.updateProgress(45);
                },
            });
            await job.updateProgress(100);
            await (0, jobRuntime_service_1.setJobCompleted)(job.id, 'Content generation completed.');
            return result;
        }
        catch (error) {
            if (error instanceof requestCancellation_1.RequestCancelledError) {
                await (0, jobRuntime_service_1.setJobCancelled)(job.id, 'Content generation cancelled.');
                throw error;
            }
            await (0, jobRuntime_service_1.setJobFailed)(job.id, error instanceof Error ? error.message : 'Content generation failed.');
            throw error;
        }
        finally {
            cleanup();
            await (0, jobRuntime_service_1.clearJobCancellation)(job.id);
        }
    }, {
        ...(0, redis_1.getBullMqConfig)('prixmoai:worker:content'),
        ...(0, workerOptions_1.getLowCommandWorkerOptions)(),
        concurrency: constants_1.CONTENT_GENERATION_JOB_CONCURRENCY,
    });
    contentWorker.on('active', clearContentWorkerIdleTimer);
    contentWorker.on('drained', scheduleContentWorkerIdleShutdown);
};
exports.startContentGenerationWorker = startContentGenerationWorker;
const enqueueContentGenerationJob = async (data, signal) => {
    if (!redis_1.isRedisConfigured) {
        throw new Error('Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before generating content.');
    }
    (0, exports.startContentGenerationWorker)();
    const queue = getContentQueue();
    const queueEvents = createContentQueueEvents();
    try {
        const job = await queue.add('generate', data, {
            jobId: `content-${(0, crypto_1.randomUUID)()}`,
            ...getContentJobOptions(),
        });
        console.info('[content-generation] job queued', {
            jobId: job.id,
            userId: data.userId,
            productName: data.input.productName,
            includeReelScript: data.includeReelScript,
        });
        await (0, jobRuntime_service_1.setJobQueued)(job.id, queueNames_1.QUEUE_NAMES.contentGenerate, 'Queued for generation.', data.userId);
        const result = await (0, jobRuntime_service_1.waitForQueueJobResult)(job, queueEvents, signal);
        console.info('[content-generation] job completed', {
            jobId: job.id,
            userId: data.userId,
            provider: result.provider,
            hasReelScript: Boolean(result.contentPack.reelScript.hook.trim()) &&
                Boolean(result.contentPack.reelScript.body.trim()) &&
                Boolean(result.contentPack.reelScript.cta.trim()),
        });
        return {
            jobId: job.id,
            result,
        };
    }
    finally {
        await queueEvents.close().catch(() => undefined);
    }
};
exports.enqueueContentGenerationJob = enqueueContentGenerationJob;
