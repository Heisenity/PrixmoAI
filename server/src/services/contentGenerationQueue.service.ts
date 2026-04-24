import { randomUUID } from 'crypto';
import {
  type JobsOptions,
  Queue,
  QueueEvents,
  Worker,
} from 'bullmq';
import {
  generateContentPackWithFallback,
  type GeneratedContentPackWithProvider,
} from '../ai/gemini';
import {
  CONTENT_GENERATION_JOB_ATTEMPTS,
  CONTENT_GENERATION_JOB_BACKOFF_MS,
  CONTENT_GENERATION_JOB_CONCURRENCY,
  GENERATION_WORKER_IDLE_SHUTDOWN_MS,
} from '../config/constants';
import { getBullMqConfig, isRedisConfigured } from '../lib/redis';
import { RequestCancelledError } from '../lib/requestCancellation';
import { QUEUE_NAMES } from '../queues/queueNames';
import { getLowCommandWorkerOptions } from '../queues/workerOptions';
import type { GenerateContentInput } from '../schemas/content.schema';
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

type ResolvedGenerateContentInput = GenerateContentInput & {
  brandName?: string | null;
};

type ContentGenerationJobData = {
  userId: string;
  brandProfile: BrandProfile | null;
  input: ResolvedGenerateContentInput;
  includeReelScript: boolean;
};

let contentQueue:
  | Queue<ContentGenerationJobData, GeneratedContentPackWithProvider>
  | null = null;
let contentWorker:
  | Worker<ContentGenerationJobData, GeneratedContentPackWithProvider>
  | null = null;
let contentWorkerIdleTimer: NodeJS.Timeout | null = null;

const getContentQueue = () => {
  if (!contentQueue) {
    contentQueue = new Queue<ContentGenerationJobData, GeneratedContentPackWithProvider>(
      QUEUE_NAMES.contentGenerate,
      getBullMqConfig('prixmoai:queue:content')
    );
  }

  return contentQueue;
};

const createContentQueueEvents = () =>
  new QueueEvents(
    QUEUE_NAMES.contentGenerate,
    getBullMqConfig('prixmoai:events:content')
  );

const clearContentWorkerIdleTimer = () => {
  if (!contentWorkerIdleTimer) {
    return;
  }

  clearTimeout(contentWorkerIdleTimer);
  contentWorkerIdleTimer = null;
};

const scheduleContentWorkerIdleShutdown = () => {
  if (GENERATION_WORKER_IDLE_SHUTDOWN_MS <= 0 || !contentWorker) {
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
      console.error(
        `[content-generation] ${
          error instanceof Error
            ? error.message
            : 'Failed to close idle content worker.'
        }`
      );
    });
  }, GENERATION_WORKER_IDLE_SHUTDOWN_MS);
  contentWorkerIdleTimer.unref?.();
};

const getContentJobOptions = (): JobsOptions => ({
  attempts: CONTENT_GENERATION_JOB_ATTEMPTS,
  backoff: {
    type: 'exponential',
    delay: CONTENT_GENERATION_JOB_BACKOFF_MS,
  },
  removeOnComplete: true,
  removeOnFail: {
    age: 60 * 60,
    count: 100,
  },
});

export const startContentGenerationWorker = () => {
  if (!isRedisConfigured) {
    return;
  }

  if (contentWorker) {
    clearContentWorkerIdleTimer();
    return;
  }

  contentWorker = new Worker<
    ContentGenerationJobData,
    GeneratedContentPackWithProvider
  >(
    QUEUE_NAMES.contentGenerate,
    async (job) => {
      const { signal, cleanup } = createLocalJobCancellationSignal(job.id!);

      try {
        await setJobProcessing(
          job.id!,
          job.attemptsMade,
          'Generating content pack.'
        );
        await job.updateProgress(10);
        await updateJobRuntime(job.id!, {
          progress: 10,
          message: 'Preparing content generation.',
        });

        const result = await generateContentPackWithFallback(
          job.data.brandProfile,
          job.data.input,
          {
            includeReelScript: job.data.includeReelScript,
            signal,
            onProviderChange: async (provider) => {
              await updateJobRuntime(job.id!, {
                currentProvider: provider,
                progress: 45,
                message: `Generating with ${provider}.`,
              });
              await job.updateProgress(45);
            },
          }
        );

        await job.updateProgress(100);
        await setJobCompleted(job.id!, 'Content generation completed.');
        return result;
      } catch (error) {
        if (error instanceof RequestCancelledError) {
          await setJobCancelled(job.id!, 'Content generation cancelled.');
          throw error;
        }

        await setJobFailed(
          job.id!,
          error instanceof Error ? error.message : 'Content generation failed.'
        );
        throw error;
      } finally {
        cleanup();
        await clearJobCancellation(job.id!);
      }
    },
    {
      ...getBullMqConfig('prixmoai:worker:content'),
      ...getLowCommandWorkerOptions(),
      concurrency: CONTENT_GENERATION_JOB_CONCURRENCY,
    }
  );

  contentWorker.on('active', clearContentWorkerIdleTimer);
  contentWorker.on('drained', scheduleContentWorkerIdleShutdown);
};

export const enqueueContentGenerationJob = async (
  data: ContentGenerationJobData,
  signal?: AbortSignal
) => {
  if (!isRedisConfigured) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL (or UPSTASH_REDIS_URL) before generating content.'
    );
  }

  startContentGenerationWorker();
  const queue = getContentQueue();
  const queueEvents = createContentQueueEvents();

  try {
    const job = await queue.add(
      'generate',
      data,
      {
        jobId: `content-${randomUUID()}`,
        ...getContentJobOptions(),
      }
    );

    console.info('[content-generation] job queued', {
      jobId: job.id,
      userId: data.userId,
      productName: data.input.productName,
      includeReelScript: data.includeReelScript,
    });

    await setJobQueued(
      job.id!,
      QUEUE_NAMES.contentGenerate,
      'Queued for generation.',
      data.userId
    );

    const result = await waitForQueueJobResult<GeneratedContentPackWithProvider>(
      job,
      queueEvents,
      signal
    );

    console.info('[content-generation] job completed', {
      jobId: job.id,
      userId: data.userId,
      provider: result.provider,
      hasReelScript:
        Boolean(result.contentPack.reelScript.hook.trim()) &&
        Boolean(result.contentPack.reelScript.body.trim()) &&
        Boolean(result.contentPack.reelScript.cta.trim()),
    });

    return {
      jobId: job.id!,
      result,
    };
  } finally {
    await queueEvents.close().catch(() => undefined);
  }
};
