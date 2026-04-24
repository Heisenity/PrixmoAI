"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueImageGenerationJob = exports.startImageGenerationWorker = void 0;
const crypto_1 = require("crypto");
const bullmq_1 = require("bullmq");
const imageGen_1 = require("../ai/imageGen");
const constants_1 = require("../config/constants");
const redis_1 = require("../lib/redis");
const requestCancellation_1 = require("../lib/requestCancellation");
const queueNames_1 = require("../queues/queueNames");
const workerOptions_1 = require("../queues/workerOptions");
const jobRuntime_service_1 = require("./jobRuntime.service");
let imageQueue = null;
let imageWorker = null;
let imageWorkerIdleTimer = null;
const getImageQueue = () => {
    if (!imageQueue) {
        imageQueue = new bullmq_1.Queue(queueNames_1.QUEUE_NAMES.imageGenerate, (0, redis_1.getBullMqConfig)('prixmoai:queue:image'));
    }
    return imageQueue;
};
const createImageQueueEvents = () => new bullmq_1.QueueEvents(queueNames_1.QUEUE_NAMES.imageGenerate, (0, redis_1.getBullMqConfig)('prixmoai:events:image'));
const clearImageWorkerIdleTimer = () => {
    if (!imageWorkerIdleTimer) {
        return;
    }
    clearTimeout(imageWorkerIdleTimer);
    imageWorkerIdleTimer = null;
};
const scheduleImageWorkerIdleShutdown = () => {
    if (constants_1.GENERATION_WORKER_IDLE_SHUTDOWN_MS <= 0 || !imageWorker) {
        return;
    }
    clearImageWorkerIdleTimer();
    const workerToClose = imageWorker;
    imageWorkerIdleTimer = setTimeout(() => {
        if (imageWorker !== workerToClose) {
            return;
        }
        imageWorker = null;
        void workerToClose.close().catch((error) => {
            console.error(`[image-generation] ${error instanceof Error
                ? error.message
                : 'Failed to close idle image worker.'}`);
        });
    }, constants_1.GENERATION_WORKER_IDLE_SHUTDOWN_MS);
    imageWorkerIdleTimer.unref?.();
};
const queueTierToPriority = (queueTier) => {
    switch (queueTier) {
        case 'priority':
            return 1;
        case 'normal':
            return 5;
        case 'slow':
        default:
            return 10;
    }
};
const getImageJobOptions = (queueTier, delayMs) => ({
    attempts: constants_1.IMAGE_GENERATION_JOB_ATTEMPTS,
    backoff: {
        type: 'exponential',
        delay: constants_1.IMAGE_GENERATION_JOB_BACKOFF_MS,
    },
    priority: queueTierToPriority(queueTier),
    delay: Math.max(0, delayMs),
    removeOnComplete: true,
    removeOnFail: {
        age: 60 * 60,
        count: 100,
    },
});
const startImageGenerationWorker = () => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    if (imageWorker) {
        clearImageWorkerIdleTimer();
        return;
    }
    imageWorker = new bullmq_1.Worker(queueNames_1.QUEUE_NAMES.imageGenerate, async (job) => {
        const { signal, cleanup } = (0, jobRuntime_service_1.createLocalJobCancellationSignal)(job.id);
        try {
            await (0, jobRuntime_service_1.setJobProcessing)(job.id, job.attemptsMade, 'Generating image asset.');
            await job.updateProgress(15);
            await (0, jobRuntime_service_1.updateJobRuntime)(job.id, {
                progress: 15,
                message: 'Starting image generation.',
            });
            const result = await (0, imageGen_1.generateProductImage)(job.data.brandProfile, job.data.input, {
                signal,
                onProviderChange: async (provider) => {
                    await (0, jobRuntime_service_1.updateJobRuntime)(job.id, {
                        currentProvider: provider,
                        progress: 55,
                        message: `Generating with ${provider}.`,
                    });
                    await job.updateProgress(55);
                },
            });
            await job.updateProgress(100);
            await (0, jobRuntime_service_1.setJobCompleted)(job.id, 'Image generation completed.');
            return result;
        }
        catch (error) {
            if (error instanceof requestCancellation_1.RequestCancelledError) {
                await (0, jobRuntime_service_1.setJobCancelled)(job.id, 'Image generation cancelled.');
                throw error;
            }
            await (0, jobRuntime_service_1.setJobFailed)(job.id, error instanceof Error ? error.message : 'Image generation failed.');
            throw error;
        }
        finally {
            cleanup();
            await (0, jobRuntime_service_1.clearJobCancellation)(job.id);
        }
    }, {
        ...(0, redis_1.getBullMqConfig)('prixmoai:worker:image'),
        ...(0, workerOptions_1.getLowCommandWorkerOptions)(),
        concurrency: constants_1.IMAGE_QUEUE_CONCURRENCY,
    });
    imageWorker.on('active', clearImageWorkerIdleTimer);
    imageWorker.on('drained', scheduleImageWorkerIdleShutdown);
};
exports.startImageGenerationWorker = startImageGenerationWorker;
const enqueueImageGenerationJob = async (params, signal, onQueued) => {
    if (!redis_1.isRedisConfigured) {
        throw new Error('Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before generating images.');
    }
    (0, requestCancellation_1.throwIfRequestCancelled)(signal, 'Image generation cancelled by user.');
    (0, exports.startImageGenerationWorker)();
    const queue = getImageQueue();
    const queueEvents = createImageQueueEvents();
    try {
        const job = await queue.add('generate', params.data, {
            jobId: `image-${(0, crypto_1.randomUUID)()}`,
            ...getImageJobOptions(params.runtimePolicy.queueTier, params.runtimePolicy.throttleDelayMs),
        });
        await (0, jobRuntime_service_1.setJobQueued)(job.id, queueNames_1.QUEUE_NAMES.imageGenerate, 'Queued for image generation.', params.data.userId);
        await onQueued?.(job.id);
        const result = await (0, jobRuntime_service_1.waitForQueueJobResult)(job, queueEvents, signal);
        return {
            jobId: job.id,
            result,
        };
    }
    finally {
        await queueEvents.close().catch(() => undefined);
    }
};
exports.enqueueImageGenerationJob = enqueueImageGenerationJob;
