import type { WorkerOptions } from 'bullmq';
import {
  BULLMQ_WORKER_DRAIN_DELAY_SECONDS,
  BULLMQ_WORKER_STALLED_INTERVAL_MS,
} from '../config/constants';

export const getLowCommandWorkerOptions = (): Pick<
  WorkerOptions,
  'drainDelay' | 'stalledInterval'
> => ({
  drainDelay: Math.max(1, BULLMQ_WORKER_DRAIN_DELAY_SECONDS),
  stalledInterval: Math.max(1_000, BULLMQ_WORKER_STALLED_INTERVAL_MS),
});
