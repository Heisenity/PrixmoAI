import { randomUUID } from 'crypto';
import {
  type JobsOptions,
  Queue,
  QueueEvents,
  Worker,
} from 'bullmq';
import {
  generateProductImage,
  type GeneratedImageResult,
} from '../ai/imageGen';
import {
  GENERATION_WORKER_IDLE_SHUTDOWN_MS,
  IMAGE_GENERATION_JOB_ATTEMPTS,
  IMAGE_GENERATION_JOB_BACKOFF_MS,
  IMAGE_QUEUE_CONCURRENCY,
  type ImageQueueTier,
} from '../config/constants';
import { getBullMqConfig, isRedisConfigured } from '../lib/redis';
import { RequestCancelledError, throwIfRequestCancelled } from '../lib/requestCancellation';
import { QUEUE_NAMES } from '../queues/queueNames';
import { getLowCommandWorkerOptions } from '../queues/workerOptions';
import type { GenerateImageInput } from '../schemas/image.schema';
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
import type { BrandProfile } from '../types';

type ResolvedGenerateImageInput = GenerateImageInput & {
  brandName?: string | null;
};

type ImageGenerationJobData = {
  userId: string;
  brandProfile: BrandProfile | null;
  input: ResolvedGenerateImageInput;
};

let imageQueue: Queue<ImageGenerationJobData, GeneratedImageResult> | null = null;
let imageWorker: Worker<ImageGenerationJobData, GeneratedImageResult> | null = null;
let imageWorkerIdleTimer: NodeJS.Timeout | null = null;

const getImageQueue = () => {
  if (!imageQueue) {
    imageQueue = new Queue<ImageGenerationJobData, GeneratedImageResult>(
      QUEUE_NAMES.imageGenerate,
      getBullMqConfig('prixmoai:queue:image')
    );
  }

  return imageQueue;
};

const createImageQueueEvents = () =>
  new QueueEvents(
    QUEUE_NAMES.imageGenerate,
    getBullMqConfig('prixmoai:events:image')
  );

const clearImageWorkerIdleTimer = () => {
  if (!imageWorkerIdleTimer) {
    return;
  }

  clearTimeout(imageWorkerIdleTimer);
  imageWorkerIdleTimer = null;
};

const scheduleImageWorkerIdleShutdown = () => {
  if (GENERATION_WORKER_IDLE_SHUTDOWN_MS <= 0 || !imageWorker) {
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
      console.error(
        `[image-generation] ${
          error instanceof Error
            ? error.message
            : 'Failed to close idle image worker.'
        }`
      );
    });
  }, GENERATION_WORKER_IDLE_SHUTDOWN_MS);
  imageWorkerIdleTimer.unref?.();
};

const queueTierToPriority = (queueTier: ImageQueueTier) => {
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

const getImageJobOptions = (
  queueTier: ImageQueueTier,
  delayMs: number
): JobsOptions => ({
  attempts: IMAGE_GENERATION_JOB_ATTEMPTS,
  backoff: {
    type: 'exponential',
    delay: IMAGE_GENERATION_JOB_BACKOFF_MS,
  },
  priority: queueTierToPriority(queueTier),
  delay: Math.max(0, delayMs),
  removeOnComplete: true,
  removeOnFail: {
    age: 60 * 60,
    count: 100,
  },
});

export const startImageGenerationWorker = () => {
  if (!isRedisConfigured) {
    return;
  }

  if (imageWorker) {
    clearImageWorkerIdleTimer();
    return;
  }

  imageWorker = new Worker<ImageGenerationJobData, GeneratedImageResult>(
    QUEUE_NAMES.imageGenerate,
    async (job) => {
      const { signal, cleanup } = createLocalJobCancellationSignal(job.id!);

      try {
        await setJobProcessing(
          job.id!,
          job.attemptsMade,
          'Generating image asset.'
        );
        await job.updateProgress(15);
        await updateJobRuntime(job.id!, {
          progress: 15,
          message: 'Starting image generation.',
        });

        const result = await generateProductImage(
          job.data.brandProfile,
          job.data.input,
          {
            signal,
            onProviderChange: async (provider) => {
              await updateJobRuntime(job.id!, {
                currentProvider: provider,
                progress: 55,
                message: `Generating with ${provider}.`,
              });
              await job.updateProgress(55);
            },
          }
        );

        await job.updateProgress(100);
        await setJobCompleted(job.id!, 'Image generation completed.');
        return result;
      } catch (error) {
        if (error instanceof RequestCancelledError) {
          await setJobCancelled(job.id!, 'Image generation cancelled.');
          throw error;
        }

        await setJobFailed(
          job.id!,
          error instanceof Error ? error.message : 'Image generation failed.'
        );
        throw error;
      } finally {
        cleanup();
        await clearJobCancellation(job.id!);
      }
    },
    {
      ...getBullMqConfig('prixmoai:worker:image'),
      ...getLowCommandWorkerOptions(),
      concurrency: IMAGE_QUEUE_CONCURRENCY,
    }
  );

  imageWorker.on('active', clearImageWorkerIdleTimer);
  imageWorker.on('drained', scheduleImageWorkerIdleShutdown);
};

export const enqueueImageGenerationJob = async (
  params: {
    runtimePolicy: {
      queueTier: ImageQueueTier;
      throttleDelayMs: number;
    };
    data: ImageGenerationJobData;
  },
  signal?: AbortSignal,
  onQueued?: (jobId: string) => void | Promise<void>
) => {
  if (!isRedisConfigured) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before generating images.'
    );
  }

  throwIfRequestCancelled(signal, 'Image generation cancelled by user.');

  startImageGenerationWorker();
  const queue = getImageQueue();
  const queueEvents = createImageQueueEvents();

  try {
    const job = await queue.add(
      'generate',
      params.data,
      {
        jobId: `image-${randomUUID()}`,
        ...getImageJobOptions(
          params.runtimePolicy.queueTier,
          params.runtimePolicy.throttleDelayMs
        ),
      }
    );

    await setJobQueued(
      job.id!,
      QUEUE_NAMES.imageGenerate,
      'Queued for image generation.',
      params.data.userId
    );
    await onQueued?.(job.id!);

    const result = await waitForQueueJobResult<GeneratedImageResult>(
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
