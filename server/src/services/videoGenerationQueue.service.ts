import { randomUUID } from 'crypto';
import {
  type JobsOptions,
  Queue,
  QueueEvents,
  Worker,
  type Job,
} from 'bullmq';
import { GENERATION_WORKER_IDLE_SHUTDOWN_MS } from '../config/constants';
import { getBullMqConfig, isRedisConfigured } from '../lib/redis';
import { RequestCancelledError } from '../lib/requestCancellation';
import { QUEUE_NAMES } from '../queues/queueNames';
import { getLowCommandWorkerOptions } from '../queues/workerOptions';
import {
  clearJobCancellation,
  createLocalJobCancellationSignal,
  setJobCancelled,
  setJobCompleted,
  setJobFailed,
  setJobProcessing,
  setJobQueued,
  updateJobRuntime,
  waitForQueueJobResult,
} from './jobRuntime.service';

export type VideoGenerationJobData = {
  userId: string;
  prompt: string;
  sourceAssetUrls?: string[];
  metadata?: Record<string, unknown>;
};

export type VideoGenerationResult = {
  videoUrl: string;
  provider: string;
  promptUsed: string;
  contentType?: string | null;
};

type VideoGenerationProcessor = (
  job: Job<VideoGenerationJobData, VideoGenerationResult>,
  signal?: AbortSignal
) => Promise<VideoGenerationResult>;

let videoQueue: Queue<VideoGenerationJobData, VideoGenerationResult> | null = null;
let videoWorker: Worker<VideoGenerationJobData, VideoGenerationResult> | null = null;
let videoWorkerIdleTimer: NodeJS.Timeout | null = null;

const getVideoQueue = () => {
  if (!videoQueue) {
    videoQueue = new Queue<VideoGenerationJobData, VideoGenerationResult>(
      QUEUE_NAMES.videoGenerate,
      getBullMqConfig('prixmoai:queue:video')
    );
  }

  return videoQueue;
};

const createVideoQueueEvents = () =>
  new QueueEvents(
    QUEUE_NAMES.videoGenerate,
    getBullMqConfig('prixmoai:events:video')
  );

const clearVideoWorkerIdleTimer = () => {
  if (!videoWorkerIdleTimer) {
    return;
  }

  clearTimeout(videoWorkerIdleTimer);
  videoWorkerIdleTimer = null;
};

const scheduleVideoWorkerIdleShutdown = () => {
  if (GENERATION_WORKER_IDLE_SHUTDOWN_MS <= 0 || !videoWorker) {
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
      console.error(
        `[video-generation] ${
          error instanceof Error
            ? error.message
            : 'Failed to close idle video worker.'
        }`
      );
    });
  }, GENERATION_WORKER_IDLE_SHUTDOWN_MS);
  videoWorkerIdleTimer.unref?.();
};

export const startVideoGenerationWorker = (
  processor: VideoGenerationProcessor,
  concurrency = 1
) => {
  if (!isRedisConfigured) {
    return;
  }

  if (videoWorker) {
    clearVideoWorkerIdleTimer();
    return;
  }

  videoWorker = new Worker<VideoGenerationJobData, VideoGenerationResult>(
    QUEUE_NAMES.videoGenerate,
    async (job) => {
      const { signal, cleanup } = createLocalJobCancellationSignal(job.id!);

      try {
        await setJobProcessing(job.id!, job.attemptsMade, 'Generating video asset.');
        await updateJobRuntime(job.id!, {
          progress: 10,
          message: 'Starting video generation.',
        });
        await job.updateProgress(10);

        const result = await processor(job, signal);

        await updateJobRuntime(job.id!, {
          progress: 100,
          message: 'Video generation completed.',
        });
        await job.updateProgress(100);
        await setJobCompleted(job.id!, 'Video generation completed.');
        return result;
      } catch (error) {
        if (error instanceof RequestCancelledError) {
          await setJobCancelled(job.id!, 'Video generation cancelled.');
          throw error;
        }

        await setJobFailed(
          job.id!,
          error instanceof Error ? error.message : 'Video generation failed.'
        );
        throw error;
      } finally {
        cleanup();
        await clearJobCancellation(job.id!);
      }
    },
    {
      ...getBullMqConfig('prixmoai:worker:video'),
      ...getLowCommandWorkerOptions(),
      concurrency,
    }
  );

  videoWorker.on('active', clearVideoWorkerIdleTimer);
  videoWorker.on('drained', scheduleVideoWorkerIdleShutdown);
};

export const enqueueVideoGenerationJob = async (
  data: VideoGenerationJobData,
  options: JobsOptions = {},
  signal?: AbortSignal
) => {
  if (!isRedisConfigured) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before generating videos.'
    );
  }

  const queue = getVideoQueue();
  const queueEvents = createVideoQueueEvents();

  try {
    const job = await queue.add(
      'generate',
      data,
      {
        jobId: `video-${randomUUID()}`,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: true,
        removeOnFail: {
          age: 60 * 60,
          count: 100,
        },
        ...options,
      }
    );

    await setJobQueued(
      job.id!,
      QUEUE_NAMES.videoGenerate,
      'Queued for video generation.',
      data.userId
    );

    const result = await waitForQueueJobResult<VideoGenerationResult>(
      job,
      queueEvents,
      signal
    );

    return {
      jobId: job.id!,
      result,
    };
  } finally {
    await queueEvents.close().catch(() => undefined);
  }
};
