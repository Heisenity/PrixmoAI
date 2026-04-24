"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueVideoGenerationJob = exports.startVideoGenerationWorker = void 0;
const crypto_1 = require("crypto");
const bullmq_1 = require("bullmq");
const constants_1 = require("../config/constants");
const redis_1 = require("../lib/redis");
const requestCancellation_1 = require("../lib/requestCancellation");
const queueNames_1 = require("../queues/queueNames");
const workerOptions_1 = require("../queues/workerOptions");
const jobRuntime_service_1 = require("./jobRuntime.service");
let videoQueue = null;
let videoWorker = null;
let videoWorkerIdleTimer = null;
const getVideoQueue = () => {
    if (!videoQueue) {
        videoQueue = new bullmq_1.Queue(queueNames_1.QUEUE_NAMES.videoGenerate, (0, redis_1.getBullMqConfig)('prixmoai:queue:video'));
    }
    return videoQueue;
};
const createVideoQueueEvents = () => new bullmq_1.QueueEvents(queueNames_1.QUEUE_NAMES.videoGenerate, (0, redis_1.getBullMqConfig)('prixmoai:events:video'));
const clearVideoWorkerIdleTimer = () => {
    if (!videoWorkerIdleTimer) {
        return;
    }
    clearTimeout(videoWorkerIdleTimer);
    videoWorkerIdleTimer = null;
};
const scheduleVideoWorkerIdleShutdown = () => {
    if (constants_1.GENERATION_WORKER_IDLE_SHUTDOWN_MS <= 0 || !videoWorker) {
        return;
    }
    clearVideoWorkerIdleTimer();
    const workerToClose = videoWorker;
    videoWorkerIdleTimer = setTimeout(() => {
        if (videoWorker !== workerToClose) {
            return;
        }
        videoWorker = null;
        void workerToClose.close().catch((error) => {
            console.error(`[video-generation] ${error instanceof Error
                ? error.message
                : 'Failed to close idle video worker.'}`);
        });
    }, constants_1.GENERATION_WORKER_IDLE_SHUTDOWN_MS);
    videoWorkerIdleTimer.unref?.();
};
const startVideoGenerationWorker = (processor, concurrency = 1) => {
    if (!redis_1.isRedisConfigured) {
        return;
    }
    if (videoWorker) {
        clearVideoWorkerIdleTimer();
        return;
    }
    videoWorker = new bullmq_1.Worker(queueNames_1.QUEUE_NAMES.videoGenerate, async (job) => {
        const { signal, cleanup } = (0, jobRuntime_service_1.createLocalJobCancellationSignal)(job.id);
        try {
            await (0, jobRuntime_service_1.setJobProcessing)(job.id, job.attemptsMade, 'Generating video asset.');
            await (0, jobRuntime_service_1.updateJobRuntime)(job.id, {
                progress: 10,
                message: 'Starting video generation.',
            });
            await job.updateProgress(10);
            const result = await processor(job, signal);
            await (0, jobRuntime_service_1.updateJobRuntime)(job.id, {
                progress: 100,
                message: 'Video generation completed.',
            });
            await job.updateProgress(100);
            await (0, jobRuntime_service_1.setJobCompleted)(job.id, 'Video generation completed.');
            return result;
        }
        catch (error) {
            if (error instanceof requestCancellation_1.RequestCancelledError) {
                await (0, jobRuntime_service_1.setJobCancelled)(job.id, 'Video generation cancelled.');
                throw error;
            }
            await (0, jobRuntime_service_1.setJobFailed)(job.id, error instanceof Error ? error.message : 'Video generation failed.');
            throw error;
        }
        finally {
            cleanup();
            await (0, jobRuntime_service_1.clearJobCancellation)(job.id);
        }
    }, {
        ...(0, redis_1.getBullMqConfig)('prixmoai:worker:video'),
        ...(0, workerOptions_1.getLowCommandWorkerOptions)(),
        concurrency,
    });
    videoWorker.on('active', clearVideoWorkerIdleTimer);
    videoWorker.on('drained', scheduleVideoWorkerIdleShutdown);
};
exports.startVideoGenerationWorker = startVideoGenerationWorker;
const enqueueVideoGenerationJob = async (data, options = {}, signal) => {
    if (!redis_1.isRedisConfigured) {
        throw new Error('Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before generating videos.');
    }
    const queue = getVideoQueue();
    const queueEvents = createVideoQueueEvents();
    try {
        const job = await queue.add('generate', data, {
            jobId: `video-${(0, crypto_1.randomUUID)()}`,
            attempts: 2,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: {
                age: 60 * 60,
                count: 100,
            },
            ...options,
        });
        await (0, jobRuntime_service_1.setJobQueued)(job.id, queueNames_1.QUEUE_NAMES.videoGenerate, 'Queued for video generation.', data.userId);
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
exports.enqueueVideoGenerationJob = enqueueVideoGenerationJob;
