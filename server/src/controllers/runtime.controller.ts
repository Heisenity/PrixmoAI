import { Job, Queue } from 'bullmq';
import { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { getBullMqConfig } from '../lib/redis';
import { getJobRuntimeSnapshot, requestJobCancellation } from '../services/jobRuntime.service';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const runtimeQueues = new Map<string, Queue>();

const getRuntimeQueue = (queueName: string) => {
  const existingQueue = runtimeQueues.get(queueName);

  if (existingQueue) {
    return existingQueue;
  }

  const nextQueue = new Queue(
    queueName,
    getBullMqConfig(`prixmoai:runtime:${queueName}`)
  );
  runtimeQueues.set(queueName, nextQueue);
  return nextQueue;
};

const cancelPendingQueueJob = async (jobId: string, queueName: string) => {
  const queue = getRuntimeQueue(queueName);
  const job = await Job.fromId(queue, jobId);

  if (!job) {
    return;
  }

  const state = await job.getState();

  if (
    state === 'waiting' ||
    state === 'delayed' ||
    state === 'prioritized'
  ) {
    await job.remove();
  }
};

export const getJobRuntime = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const snapshot = await getJobRuntimeSnapshot(req.params.id);

    if (!snapshot || snapshot.userId !== req.user.id) {
      return res.status(404).json({
        status: 'fail',
        message: 'Job not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: snapshot,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to fetch job status',
    });
  }
};

export const cancelJobRuntime = async (
  req: AuthenticatedRequest<{ id: string }>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const snapshot = await getJobRuntimeSnapshot(req.params.id);

    if (!snapshot || snapshot.userId !== req.user.id) {
      return res.status(404).json({
        status: 'fail',
        message: 'Job not found',
      });
    }

    if (
      snapshot.status === 'completed' ||
      snapshot.status === 'failed' ||
      snapshot.status === 'cancelled'
    ) {
      return res.status(200).json({
        status: 'success',
        message: 'Job is already finished',
        data: snapshot,
      });
    }

    await requestJobCancellation(req.params.id);
    await cancelPendingQueueJob(req.params.id, snapshot.queue);
    const nextSnapshot = await getJobRuntimeSnapshot(req.params.id);

    return res.status(200).json({
      status: 'success',
      message: 'Job cancellation requested successfully',
      data: nextSnapshot ?? snapshot,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to cancel job',
    });
  }
};
