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
import type { BrandMemoryMatch, BrandProfile } from '../types';
import { collectRealtimeTrendIntelligence } from './trendIntelligence.service';
import { logFailure, logOperationalEvent, recordFailureSpikeSignal } from '../lib/observability';

type ResolvedGenerateContentInput = GenerateContentInput & {
  brandName?: string | null;
};

type ContentGenerationJobData = {
  userId: string;
  brandProfile: BrandProfile | null;
  brandMemories: BrandMemoryMatch[];
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

        await job.updateProgress(25);
        await updateJobRuntime(job.id!, {
          progress: 25,
          message: 'Researching live web and social trends.',
        });

        const trendIntelligence =
          await collectRealtimeTrendIntelligence({
            purpose: 'caption-generation',
            userId: job.data.userId,
            brandProfile: job.data.brandProfile,
            productInput: job.data.input,
            brandMemories: job.data.brandMemories,
            signal,
          }).catch((error) => {
            if (error instanceof RequestCancelledError) {
              throw error;
            }

            logFailure(
              'content_trend_research_failed',
              error,
              {
                jobId: job.id,
                userId: job.data.userId,
                queue: QUEUE_NAMES.contentGenerate,
              },
              'warn'
            );
            console.warn('[content-generation] live trend research failed; continuing without it.', {
              jobId: job.id,
              userId: job.data.userId,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          });

        const result = await generateContentPackWithFallback(
          job.data.brandProfile,
          job.data.input,
          {
            includeReelScript: job.data.includeReelScript,
            brandMemories: job.data.brandMemories,
            trendIntelligence,
            signal,
            onProviderChange: async (provider) => {
              await updateJobRuntime(job.id!, {
                currentProvider: provider,
                progress: 45,
                message: 'Writing the content with the latest brand and brief signals.',
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
        logFailure('content_generation_job_failed', error, {
          jobId: job.id,
          userId: job.data.userId,
          queue: QUEUE_NAMES.contentGenerate,
          provider: 'content-generation',
        });
        recordFailureSpikeSignal('content_generation_job_failed', {
          queue: QUEUE_NAMES.contentGenerate,
        });
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
  contentWorker.on('failed', (job, error) => {
    logFailure('content_generation_worker_failed', error, {
      jobId: job?.id ?? null,
      userId: job?.data.userId ?? null,
      queue: QUEUE_NAMES.contentGenerate,
    });
  });
};

export const enqueueContentGenerationJob = async (
  data: ContentGenerationJobData,
  signal?: AbortSignal,
  onQueued?: (jobId: string) => void | Promise<void>
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

    logOperationalEvent('content_generation_job_queued', {
      jobId: job.id,
      userId: data.userId,
      queue: QUEUE_NAMES.contentGenerate,
      productName: data.input.productName,
      includeReelScript: data.includeReelScript,
      brandMemoryCount: data.brandMemories.length,
    });

    await setJobQueued(
      job.id!,
      QUEUE_NAMES.contentGenerate,
      'Queued for generation.',
      data.userId
    );
    await onQueued?.(job.id!);

    const result = await waitForQueueJobResult<GeneratedContentPackWithProvider>(
      job,
      queueEvents,
      signal
    );

    logOperationalEvent('content_generation_job_completed', {
      jobId: job.id,
      userId: data.userId,
      queue: QUEUE_NAMES.contentGenerate,
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
